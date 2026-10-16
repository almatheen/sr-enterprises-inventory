import { SignJWT, jwtVerify } from 'jose';
import type { SessionUser } from '../types';

export const SESSION_COOKIE = 'sr_session';
const SHORT = 60 * 60 * 12; // 12 hours
export const LONG = 60 * 60 * 24 * 30; // 30 days ("remember me")

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error('AUTH_SECRET is missing or too short. See README → Environment variables.');
  return new TextEncoder().encode(s);
}

export async function signSession(user: SessionUser, remember: boolean) {
  return new SignJWT({ name: user.name, email: user.email, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${remember ? LONG : SHORT}s`)
    .sign(secret());
}

export async function verifySession(token?: string | null): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      name: String(payload.name ?? ''),
      email: String(payload.email ?? ''),
      role: payload.role === 'ADMIN' ? 'ADMIN' : 'STAFF'
    };
  } catch {
    return null;
  }
}

export const cookieOptions = (remember: boolean) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  ...(remember ? { maxAge: LONG } : {})
});
