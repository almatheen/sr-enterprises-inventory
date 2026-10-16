import { api, jsonBody } from '@/lib/auth/guard';
import { adjustStock } from '@/lib/inventory/service';
import { adjustSchema } from '@/lib/validation/schemas';

export const POST = api(async ({ req, params, user }) => adjustStock(params.id, adjustSchema.parse(await jsonBody(req)), user.id));
