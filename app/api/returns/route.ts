
import { api, jsonBody } from '@/lib/auth/guard';
import { createSalesReturn, listSalesReturns } from '@/lib/returns/service';
import { salesReturnSchema } from '@/lib/validation/schemas';

export const GET = api(async ({ req }) => {
  const rawLimit = Number(req.nextUrl.searchParams.get('limit') ?? 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(100, Math.max(1, Math.floor(rawLimit)))
    : 10;

  return listSalesReturns(limit);
});

export const POST = api(async ({ req, user }) => {
  const input = salesReturnSchema.parse(await jsonBody(req));

  return createSalesReturn(input, user.id);
});
