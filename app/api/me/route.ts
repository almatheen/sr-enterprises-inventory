import { api, jsonBody } from '@/lib/auth/guard';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';

export const GET = api(async ({ user }) => {
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { theme: true } });
  return { ...user, theme: u?.theme ?? 'light' };
});

export const PATCH = api(async ({ req, user }) => {
  const { theme } = z.object({ theme: z.enum(['light', 'dark']) }).parse(await jsonBody(req));
  await prisma.user.update({ where: { id: user.id }, data: { theme } });
  return { theme };
});
