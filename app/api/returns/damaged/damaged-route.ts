import { api } from '@/lib/auth/guard';
import { listDamagedItems } from '@/lib/returns/service';

export const GET = api(async ({ req }) => {
  const raw = Number(req.nextUrl.searchParams.get('limit') ?? 50);

  const limit = Number.isFinite(raw)
    ? Math.min(200, Math.max(1, Math.floor(raw)))
    : 50;

  return listDamagedItems(limit);
});
