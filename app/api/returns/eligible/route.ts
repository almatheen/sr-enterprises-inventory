
import { api } from '@/lib/auth/guard';
import { prisma } from '@/lib/db/prisma';

export const GET = api(async ({ req }) => {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';

  if (q.length > 100) {
    return [];
  }

  const invoices = await prisma.invoice.findMany({
    where: q
      ? {
          OR: [
            { invoiceNumber: { contains: q, mode: 'insensitive' } },
            { customerName: { contains: q, mode: 'insensitive' } },
            { customerPhone: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {},
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      items: {
        include: {
          SalesReturnItem: {
            where: {
              salesReturn: {
                status: { not: 'CANCELLED' },
              },
            },
            select: { quantity: true },
          },
        },
      },
    },
  });

  return invoices.map((invoice) => ({
    invoiceNumber: invoice.invoiceNumber,
    customerName: invoice.customerName,
    customerPhone: invoice.customerPhone,
    date: invoice.createdAt.toISOString(),
    items: invoice.items
      .map((item) => {
        const returned = item.SalesReturnItem.reduce(
          (total, entry) => total + entry.quantity,
          0,
        );

        return {
          invoiceItemId: item.id,
          productId: item.productId,
          name: item.name,
          sku: item.sku,
          quantitySold: item.quantity,
          quantityReturned: returned,
          quantityReturnable: Math.max(0, item.quantity - returned),
          price: Number(item.price),
        };
      })
  }));
});
