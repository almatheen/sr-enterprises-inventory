import { Prisma, StockMovementType } from '@prisma/client';
import { prisma, nextSequence, num } from '../db/prisma';
import { AppError } from '../errors';
import { istDate } from '../format';
import { PAGE_SIZE } from '../constants';
import type { Paged, ProductDTO } from '../types';
import type { ProductInput } from '../validation/schemas';
import { adjustSchema } from '../validation/schemas';
import type { z } from 'zod';

type Row = Prisma.ProductGetPayload<object>;

export const toProductDTO = (p: Row): ProductDTO => ({
  id: p.id,
  name: p.name,
  cat: p.category,
  sku: p.sku,
  barcode: p.barcode ?? '',
  brand: p.brand,
  description: p.description,
  cost: num(p.purchasePrice),
  price: num(p.sellingPrice),
  gst: p.gst,
  stock: p.stock,
  min: p.minimumStock,
  sup: p.supplier,
  upd: istDate(p.updatedAt)
});

export const stockStatus = (stock: number, min: number) =>
  stock <= 0 ? 'out' : stock <= min ? 'lo' : 'ok';

export async function nextProductId(
  tx: Pick<typeof prisma, 'counter'>,
  cat: string
) {
  const n = await nextSequence(tx, `product:${cat}`);

  return {
    uniqueId: `SR-${cat}-${String(n).padStart(5, '0')}`,
    n
  };
}

async function assertUnique(
  sku: string,
  barcode: string,
  exceptId?: string
) {
  if (sku) {
    const d = await prisma.product.findFirst({
      where: {
        sku,
        NOT: exceptId ? { id: exceptId } : undefined
      },
      select: { id: true }
    });

    if (d) {
      throw new AppError(
        409,
        'Duplicate SKU: another product already uses this SKU.',
        'DUPLICATE_SKU'
      );
    }
  }

  if (barcode) {
    const d = await prisma.product.findFirst({
      where: {
        barcode,
        NOT: exceptId ? { id: exceptId } : undefined
      },
      select: { id: true }
    });

    if (d) {
      throw new AppError(
        409,
        'Duplicate barcode: another product already uses this barcode.',
        'DUPLICATE_BARCODE'
      );
    }
  }
}

export async function createProduct(
  input: ProductInput,
  userId: string
) {
  await assertUnique(input.sku, input.barcode);

  return prisma.$transaction(async (tx) => {
    const { uniqueId, n } = await nextProductId(
      tx,
      input.category
    );

    const p = await tx.product.create({
      data: {
        uniqueId,
        name: input.name,
        sku:
          input.sku ||
          `${input.category}-${String(n).padStart(5, '0')}`,
        barcode: input.barcode || null,
        category: input.category,
        brand: input.brand,
        description: input.description,
        purchasePrice: input.purchasePrice,
        sellingPrice: input.sellingPrice,
        gst: input.gst,
        stock: input.stock,
        minimumStock: input.minimumStock,
        supplier: input.supplier
      }
    });

    if (input.stock > 0) {
      await tx.stockMovement.create({
        data: {
          productId: p.id,
          type: 'INITIAL',
          quantity: input.stock,
          balance: input.stock,
          reason: 'Opening stock',
          userId
        }
      });
    }

    return toProductDTO(p);
  });
}

export async function updateProduct(
  uniqueId: string,
  input: ProductInput,
  userId: string
) {
  const cur = await prisma.product.findUnique({
    where: { uniqueId }
  });

  if (!cur) {
    throw new AppError(
      404,
      'Product not found.',
      'NOT_FOUND'
    );
  }

  await assertUnique(
    input.sku,
    input.barcode,
    cur.id
  );

  return prisma.$transaction(async (tx) => {
    const p = await tx.product.update({
      where: { id: cur.id },
      data: {
        name: input.name,
        sku: input.sku || cur.sku,
        barcode: input.barcode || null,
        category: cur.category,
        brand: input.brand,
        description: input.description,
        purchasePrice: input.purchasePrice,
        sellingPrice: input.sellingPrice,
        gst: input.gst,
        stock: input.stock,
        minimumStock: input.minimumStock,
        supplier: input.supplier
      }
    });

    if (input.stock !== cur.stock) {
      await tx.stockMovement.create({
        data: {
          productId: cur.id,
          type: 'CORRECTION',
          quantity: input.stock - cur.stock,
          balance: input.stock,
          reason: 'Edited from product form',
          userId
        }
      });
    }

    return toProductDTO(p);
  });
}

export async function deleteProduct(uniqueId: string) {
  const cur = await prisma.product.findUnique({
    where: { uniqueId },
    select: { id: true }
  });

  if (!cur) {
    throw new AppError(
      404,
      'Product not found.',
      'NOT_FOUND'
    );
  }

  await prisma.product.delete({
    where: { id: cur.id }
  });
}

export async function adjustStock(
  uniqueId: string,
  input: z.infer<typeof adjustSchema>,
  userId: string
) {
  const sign: Record<string, number> = {
    ADD: 1,
    RETURN: 1,
    REMOVE: -1,
    DAMAGE: -1
  };

  return prisma.$transaction(async (tx) => {
    const cur = await tx.product.findUnique({
      where: { uniqueId }
    });

    if (!cur) {
      throw new AppError(
        404,
        'Product not found.',
        'NOT_FOUND'
      );
    }

    let delta: number;

    if (input.type === 'CORRECTION') {
      delta = input.quantity - cur.stock;
    } else {
      if (input.quantity < 1) {
        throw new AppError(400, 'Invalid quantity');
      }

      delta = input.quantity * sign[input.type];
    }

    if (cur.stock + delta < 0) {
      throw new AppError(
        409,
        'Stock cannot go negative',
        'NEGATIVE_STOCK'
      );
    }

    // Conditional atomic update protects against
    // concurrent sales/adjustments.
    const r = await tx.product.updateMany({
      where: {
        id: cur.id,
        stock: {
          gte: delta < 0 ? -delta : 0
        }
      },
      data: {
        stock: {
          increment: delta
        }
      }
    });

    if (r.count !== 1) {
      throw new AppError(
        409,
        'Stock cannot go negative',
        'NEGATIVE_STOCK'
      );
    }

    const p = await tx.product.findUniqueOrThrow({
      where: { id: cur.id }
    });

    await tx.stockMovement.create({
      data: {
        productId: cur.id,
        type: input.type as StockMovementType,
        quantity: delta,
        balance: p.stock,
        reason: input.reason,
        userId
      }
    });

    return toProductDTO(p);
  });
}

export interface ProductQuery {
  q?: string;
  category?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export async function listProducts(
  qy: ProductQuery
): Promise<Paged<ProductDTO>> {
  const page = Math.max(1, qy.page || 1);

  const pageSize = Math.min(
    200,
    Math.max(1, qy.pageSize || PAGE_SIZE)
  );

  const w: Prisma.Sql[] = [];

  if (qy.q?.trim()) {
    const like = `%${qy.q
      .trim()
      .replace(/[%_\\]/g, '\\$&')}%`;

    // MySQL uses LIKE instead of PostgreSQL ILIKE.
    // Case-insensitive behavior is normally provided by
    // the MySQL database/table collation.
    w.push(
      Prisma.sql`(
        "name" ILIKE ${like}
        OR "sku" ILIKE ${like}
        OR "uniqueId" ILIKE ${like}
        OR COALESCE("barcode", '') ILIKE ${like}
      )`
    );
  }

  if (qy.category) {
    w.push(
      Prisma.sql`"category" = ${qy.category}`
    );
  }

  if (qy.status === 'out') {
    w.push(
      Prisma.sql`"stock" <= 0`
    );
  } else if (qy.status === 'lo') {
    w.push(
      Prisma.sql`"stock" > 0 AND "stock" <= "minimumStock"`
    );
  } else if (qy.status === 'ok') {
    w.push(
      Prisma.sql`"stock" > "minimumStock"`
    );
  }

  const where = w.length
    ? Prisma.sql`WHERE ${Prisma.join(w, ' AND ')}`
    : Prisma.empty;

  const [rows, cnt] = await Promise.all([
    prisma.$queryRaw<Row[]>`
      SELECT *
      FROM "Product"
      ${where}
      ORDER BY "createdAt" DESC, "uniqueId" DESC
      LIMIT ${pageSize}
      OFFSET ${(page - 1) * pageSize}
    `,

    prisma.$queryRaw<{ c: number }[]>`
      SELECT COUNT(*) AS c
      FROM "Product"
      ${where}
    `
  ]);

  return {
    rows: rows.map(toProductDTO),
    total: Number(cnt[0]?.c ?? 0),
    page,
    pageSize
  };
}

/** Billing search: top matches, in-stock first. */
export async function searchProducts(
  q: string,
  limit = 12
) {
  const r = await listProducts({
    q,
    pageSize: limit
  });

  return r.rows;
}

export async function lowStock(
  limit?: number
): Promise<ProductDTO[]> {
  const rows = limit
    ? await prisma.$queryRaw<Row[]>`
        SELECT *
        FROM "Product"
        WHERE "stock" <= "minimumStock"
        ORDER BY "stock" ASC, "name" ASC
        LIMIT ${limit}
      `
    : await prisma.$queryRaw<Row[]>`
        SELECT *
        FROM "Product"
        WHERE "stock" <= "minimumStock"
        ORDER BY "stock" ASC, "name" ASC
      `;

  return rows.map(toProductDTO);
}

export async function lowStockCount() {
  const r = await prisma.$queryRaw<{ c: number }[]>`
    SELECT COUNT(*) AS c
    FROM "Product"
    WHERE "stock" <= "minimumStock"
  `;

  return Number(r[0]?.c ?? 0);
}

export async function exportInventoryRows() {
  const rows = await prisma.product.findMany({
    orderBy: {
      createdAt: 'asc'
    }
  });

  return rows.map((p) => [
    p.uniqueId,
    p.name,
    p.sku,
    p.barcode ?? '',
    p.category,
    num(p.purchasePrice),
    num(p.sellingPrice),
    p.gst,
    p.stock,
    p.minimumStock,
    p.supplier
  ]);
}