import { api } from '@/lib/auth/guard';
import { markPaid } from '@/lib/invoices/service';

export const POST = api(async ({ params }) => markPaid(params.id));
