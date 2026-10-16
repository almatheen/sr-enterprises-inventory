
import { api, jsonBody } from '@/lib/auth/guard';
import { createProduct, listProducts } from '@/lib/inventory/service';
import { productSchema } from '@/lib/validation/schemas';

export const GET = api(async ({ req }) => {
  const sp = req.nextUrl.searchParams;

  return listProducts({
    q: sp.get('q') ?? '',
    category: sp.get('category') ?? '',
    status: sp.get('status') ?? '',
    page: +(sp.get('page') ?? 1),
    pageSize: +(sp.get('pageSize') ?? 0) || undefined,
  });
});

export const POST = api(async ({ req, user }) =>
  createProduct(
    productSchema.parse(await jsonBody(req)),
    user.id
  )
);
