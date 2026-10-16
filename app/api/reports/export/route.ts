import { api } from '@/lib/auth/guard';
import { reportCsvRows, resolveRange } from '@/lib/reports/service';
import { csvResponse, toCsv } from '@/lib/csv';

export const GET = api(
  async ({ req }) => {
    const sp = req.nextUrl.searchParams;
    const { from, to } = resolveRange(sp.get('range') ?? '30', sp.get('from') ?? undefined, sp.get('to') ?? undefined);
    return csvResponse(toCsv(['Invoice', 'Customer', 'Total', 'Payment', 'Date'], await reportCsvRows(from, to)), 'report');
  },
  { raw: true }
);
