import { api } from '@/lib/auth/guard';
import { reportSummary, resolveRange } from '@/lib/reports/service';

export const GET = api(async ({ req }) => {
  const sp = req.nextUrl.searchParams;
  const { from, to } = resolveRange(sp.get('range') ?? '30', sp.get('from') ?? undefined, sp.get('to') ?? undefined);
  return reportSummary(from, to);
});
