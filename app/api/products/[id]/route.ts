import { api, jsonBody } from '@/lib/auth/guard';
import { deleteProduct, updateProduct } from '@/lib/inventory/service';
import { productSchema } from '@/lib/validation/schemas';

export const PATCH = api(async ({ req, params, user }) => updateProduct(params.id, productSchema.parse(await jsonBody(req)), user.id));
export const DELETE = api(async ({ params }) => deleteProduct(params.id), { admin: true });
