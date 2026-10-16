import { PrismaClient } from '@prisma/client';

const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] });
if (process.env.NODE_ENV !== 'production') g.prisma = prisma;

export const num = (v: unknown) => (v == null ? 0 : Number(v));

/** Atomically increments and returns a named sequence. Must be called inside a transaction to roll back with it. */
export async function nextSequence(
  tx: Pick<PrismaClient, 'counter'>,
  key: string
): Promise<number> {
  const row = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } }
  });
  return row.value;
}
