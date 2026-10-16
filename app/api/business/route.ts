import { api, jsonBody } from '@/lib/auth/guard';
import { prisma } from '@/lib/db/prisma';
import { getBusiness } from '@/lib/business';
import { businessSchema } from '@/lib/validation/schemas';

export const GET = api(async () => getBusiness());
export const PUT = api(
  async ({ req }) => {
    const d = businessSchema.parse(await jsonBody(req));
    await prisma.business.upsert({ where: { id: 'business' }, create: { id: 'business', ...d, logo: d.logo ?? null }, update: { ...d, logo: d.logo ?? null } });
    return getBusiness();
  },
  { admin: true }
);
