import { api } from '@/lib/auth/guard';
import { globalSearch } from '@/lib/search/service';

export const GET = api(async ({ req }) => {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  if (q.trim().length < 2) return { products: { total: 0, rows: [] }, invoices: { total: 0, rows: [] }, clients: { total: 0, rows: [] } };
  return globalSearch(q);
});
