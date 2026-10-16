import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db/prisma';
import { errorResponse, jsonBody } from '@/lib/auth/guard';
import { SESSION_COOKIE, cookieOptions, signSession, LONG } from '@/lib/auth/session';
import { loginSchema } from '@/lib/validation/schemas';
import { clearFailures, recordFailure, tooManyAttempts } from '@/lib/auth/rateLimit';
import { AppError } from '@/lib/errors';

// Used to keep response time constant for unknown e-mails.
const DUMMY = bcrypt.hashSync('sr-enterprises-dummy', 12);

export async function POST(req: NextRequest) {
  try {
    const input = loginSchema.parse(await jsonBody(req));
    const key = `${req.headers.get('x-forwarded-for') ?? 'local'}|${input.email}`;
    if (tooManyAttempts(key)) throw new AppError(429, 'Too many failed attempts. Please try again in 15 minutes.', 'RATE_LIMIT');
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    const ok = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY);
    if (!user || !ok) {
      recordFailure(key);
      throw new AppError(401, 'Incorrect email or password.', 'BAD_CREDENTIALS');
    }
    clearFailures(key);
    const su = { id: user.id, name: user.name, email: user.email, role: user.role };
    const token = await signSession(su, input.remember);
    const res = NextResponse.json({ data: { ...su, theme: user.theme } });
    res.cookies.set(SESSION_COOKIE, token, { ...cookieOptions(input.remember), ...(input.remember ? { maxAge: LONG } : {}) });
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
