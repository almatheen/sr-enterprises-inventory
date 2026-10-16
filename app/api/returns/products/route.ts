
import { api } from '@/lib/auth/guard';
import { prisma } from '@/lib/db/prisma';

export const GET = api(async ({ req }) => {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';

  if (q.length < 2 || q.length > 100) {
    return [];
  }

  const products = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: q } },
        { sku: { contains: q } },
        { uniqueId: { contains: q } },
        { barcode: { contains: q } },
      ],
    },
    select: {
      id: true,
      uniqueId: true,
      name: true,
      sku: true,
      stock: true,
      category: true,
      sellingPrice: true,
    },
    orderBy: { name: 'asc' },
    take: 12,
  });

  return products.map((product) => ({
    id: product.id,
    uniqueId: product.uniqueId,
    name: product.name,
    sku: product.sku,
    stock: product.stock,
    category: product.category,
    sellingPrice: Number(product.sellingPrice),
  }));
});
