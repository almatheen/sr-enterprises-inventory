import { api, jsonBody } from '@/lib/auth/guard';
import { createInvoice, listInvoices } from '@/lib/invoices/service';
import { invoiceSchema } from '@/lib/validation/schemas';

export const GET = api(async ({ req }) => {
  const sp = req.nextUrl.searchParams;
  return listInvoices({ q: sp.get('q') ?? '', payment: sp.get('payment') ?? '', page: +(sp.get('page') ?? 1) });
});
export const POST = api(async ({ req, user }) => createInvoice(invoiceSchema.parse(await jsonBody(req)), user.id));
