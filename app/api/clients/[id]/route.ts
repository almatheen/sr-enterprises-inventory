import { api, jsonBody } from '@/lib/auth/guard';
import { getClientWithInvoices, updateClient } from '@/lib/clients/service';
import { clientSchema } from '@/lib/validation/schemas';

export const GET = api(async ({ params }) => getClientWithInvoices(params.id));
export const PATCH = api(async ({ req, params }) => updateClient(params.id, clientSchema.parse(await jsonBody(req))));
