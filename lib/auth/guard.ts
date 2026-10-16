import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { cookies } from 'next/headers';
import { AppError } from '../errors';
import { SESSION_COOKIE, verifySession } from './session';
import type { SessionUser } from '../types';

export async function getSessionUser(): Promise<SessionUser | null> {
  return verifySession(cookies().get(SESSION_COOKIE)?.value);
}

interface Ctx {
  req: NextRequest;
  user: SessionUser;
  params: Record<string, string>;
}
type Handler = (c: Ctx) => Promise<unknown>;

/**
 * Wraps an API route: authenticates, optionally restricts to ADMIN, and converts every failure
 * into a safe JSON error (no stack traces leak to the browser).
 */
export function api(fn: Handler, opts: { admin?: boolean; raw?: boolean } = {}) {
  return async (req: NextRequest, rc: { params: Record<string, string> }) => {
    try {
      const user = await getSessionUser();
      if (!user) throw new AppError(401, 'Please sign in to continue.', 'UNAUTHENTICATED');
      if (opts.admin && user.role !== 'ADMIN') throw new AppError(403, 'You do not have permission to do this.', 'FORBIDDEN');
      const out = await fn({ req, user, params: rc?.params ?? {} });
      if (opts.raw && out instanceof Response) return out;
      return NextResponse.json({ data: out ?? null });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof AppError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status });
  if (e instanceof ZodError) {
    const message = e.issues[0]?.message || 'Invalid input';
    return NextResponse.json({ error: { code: 'VALIDATION', message } }, { status: 400 });
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2002') return NextResponse.json({ error: { code: 'DUPLICATE', message: 'A record with the same unique value already exists.' } }, { status: 409 });
    if (e.code === 'P2025') return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Record not found.' } }, { status: 404 });
  }
  if (e instanceof Prisma.PrismaClientInitializationError) {
    console.error('[db]', e);
    return NextResponse.json({ error: { code: 'DB_UNAVAILABLE', message: 'The database is currently unavailable. Please try again shortly.' } }, { status: 503 });
  }
  console.error('[api]', e);
  return NextResponse.json({ error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } }, { status: 500 });
}

export async function jsonBody(req: NextRequest) {
  try {
    return await req.json();
  } catch {
    throw new AppError(400, 'Invalid request body.', 'BAD_JSON');
  }
}
