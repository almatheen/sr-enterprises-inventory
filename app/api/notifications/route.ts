import { api } from '@/lib/auth/guard';
import { lowStock } from '@/lib/inventory/service';

export const GET = api(async () => {
  const rows = await lowStock();
  return { count: rows.length, rows: rows.slice(0, 50) };
});
