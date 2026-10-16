import { api } from '@/lib/auth/guard';
import { dashboardData } from '@/lib/dashboard/service';

export const GET = api(async ({ req }) => {
  const d = +(req.nextUrl.searchParams.get('days') ?? 30);
  return dashboardData([7, 30, 90, 365].includes(d) ? d : 30);
});
