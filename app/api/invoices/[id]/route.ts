import { api } from '@/lib/auth/guard';
import { getInvoice } from '@/lib/invoices/service';

export const GET = api(async ({ params }) => getInvoice(params.id));
