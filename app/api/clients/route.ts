import { api, jsonBody } from '@/lib/auth/guard';
import { createClient, listClients } from '@/lib/clients/service';
import { clientSchema } from '@/lib/validation/schemas';

export const GET = api(async ({ req }) => {
  const sp = req.nextUrl.searchParams;
  return listClients(sp.get('q') ?? '', +(sp.get('page') ?? 1));
});
export const POST = api(async ({ req }) => createClient(clientSchema.parse(await jsonBody(req))));
