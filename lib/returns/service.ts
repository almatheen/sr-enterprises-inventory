import {
  Prisma,
  ReturnedProductCondition,
  ReturnResolution,
  SalesReturnReason,
  ReturnStatus,
} from '@prisma/client';

import { prisma, nextSequence, num } from '../db/prisma';
import { AppError } from '../errors';
import { istYear, round2 } from '../format';
import type { SalesReturnInput } from '../validation/schemas';

const RETURN_PREFIX = 'SR-RET';

type InvoiceWithItems = Prisma.InvoiceGetPayload<{
  include: { items: true };
}>;

type Money = Prisma.Decimal | number;

/** Converts the money fields of a return item to plain numbers for the API. */
function toMoneyItem<
  T extends { refundAmount: Money; refundTax: Money; costReversed: Money },
>(item: T) {
  return {
    ...item,
    refundAmount: num(item.refundAmount),
    refundTax: num(item.refundTax),
    costReversed: num(item.costReversed),
  };
}

export async function createSalesReturn(
  input: SalesReturnInput,
  userId: string,
) {
  return prisma.$transaction(
    async (tx) => {
      const invoiceNumber = input.invoiceNumber?.trim() ?? '';
      const isInvoiceReturn = invoiceNumber.length > 0;

      let invoice: InvoiceWithItems | null = null;

      let invoiceItems = new Map<
        string,
        InvoiceWithItems['items'][number]
      >();

      const directProducts = new Map<
        string,
        { id: string; name: string; sku: string }
      >();

      if (isInvoiceReturn) {
        const initialInvoice = await tx.invoice.findUnique({
          where: { invoiceNumber },
          select: { id: true },
        });

        if (!initialInvoice) {
          throw new AppError(404, 'Invoice not found.', 'NOT_FOUND');
        }

        // Serialize return creation for this invoice.
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id
          FROM "Invoice"
          WHERE id = ${initialInvoice.id}
          FOR UPDATE
        `;

        invoice = await tx.invoice.findUnique({
          where: { id: initialInvoice.id },
          include: { items: true },
        });

        if (!invoice) {
          throw new AppError(404, 'Invoice not found.', 'NOT_FOUND');
        }

        invoiceItems = new Map(
          invoice.items.map((item) => [item.id, item]),
        );

        const invoiceItemIds = input.items.map((item) => {
          if (!item.invoiceItemId) {
            throw new AppError(
              400,
              'Every item in an invoice return must reference an invoice item.',
              'INVALID_INVOICE_ITEM',
            );
          }

          return item.invoiceItemId;
        });

        // Total quantity requested per invoice item in this request.
        const requested = new Map<string, number>();

        for (const item of input.items) {
          const id = item.invoiceItemId!;

          requested.set(id, (requested.get(id) ?? 0) + item.quantity);
        }

        const previousReturns = await tx.salesReturnItem.findMany({
          where: {
            invoiceItemId: { in: invoiceItemIds },
            salesReturn: {
              status: { not: ReturnStatus.CANCELLED },
            },
          },
          select: {
            invoiceItemId: true,
            quantity: true,
          },
        });

        const previouslyReturned = new Map<string, number>();

        for (const returnedItem of previousReturns) {
          if (!returnedItem.invoiceItemId) continue;

          const id = returnedItem.invoiceItemId;

          previouslyReturned.set(
            id,
            (previouslyReturned.get(id) ?? 0) + returnedItem.quantity,
          );
        }

        // Validate invoice ownership, remaining quantity and product links.
        for (const item of input.items) {
          const invoiceItemId = item.invoiceItemId!;
          const soldItem = invoiceItems.get(invoiceItemId);

          if (!soldItem) {
            throw new AppError(
              400,
              'A selected product does not belong to this invoice.',
              'INVALID_INVOICE_ITEM',
            );
          }

          const remaining =
            soldItem.quantity -
            (previouslyReturned.get(invoiceItemId) ?? 0);

          if (requested.get(invoiceItemId)! > remaining) {
            throw new AppError(
              409,
              `Only ${remaining} unit(s) remain eligible for return for ${soldItem.name}.`,
              'RETURN_QUANTITY_EXCEEDED',
            );
          }

          if (
            item.addBackToInventory &&
            item.condition !== ReturnedProductCondition.RESALABLE
          ) {
            throw new AppError(
              400,
              'Only resalable products can be restocked.',
              'INVALID_RESTOCK_CONDITION',
            );
          }

          if (
            item.condition === ReturnedProductCondition.RESALABLE &&
            !soldItem.productId
          ) {
            throw new AppError(
              409,
              `${soldItem.name} is not linked to an inventory product.`,
              'PRODUCT_NOT_LINKED',
            );
          }
        }
      } else {
        // Direct-product returns have no verified invoice.
        // Fetch and snapshot products before recording the return.
        for (const item of input.items) {
          if (!item.productId || item.invoiceItemId) {
            throw new AppError(
              400,
              'Select an inventory product for every direct return item.',
              'INVALID_RETURN_SOURCE',
            );
          }

          if (
            item.addBackToInventory &&
            item.condition !== ReturnedProductCondition.RESALABLE
          ) {
            throw new AppError(
              400,
              'Only resalable products can be restocked.',
              'INVALID_RESTOCK_CONDITION',
            );
          }

          const product = await tx.product.findUnique({
            where: { id: item.productId },
            select: {
              id: true,
              name: true,
              sku: true,
            },
          });

          if (!product) {
            throw new AppError(
              404,
              'One of the selected inventory products was not found.',
              'PRODUCT_NOT_FOUND',
            );
          }

          directProducts.set(product.id, product);
        }
      }

      // Every replacement product for an exchange must exist.
      const replacementIds = [
        ...new Set(
          input.items
            .filter((item) => item.resolution === 'EXCHANGE')
            .map((item) => item.replacementProductId!),
        ),
      ];

      if (replacementIds.length > 0) {
        const found = await tx.product.findMany({
          where: { id: { in: replacementIds } },
          select: { id: true },
        });

        if (found.length !== replacementIds.length) {
          throw new AppError(
            404,
            'A replacement product was not found.',
            'PRODUCT_NOT_FOUND',
          );
        }
      }

      const year = istYear();
      const sequence = await nextSequence(tx, `sales-return:${year}`);

      const returnNumber =
        `${RETURN_PREFIX}-${year}-${String(sequence).padStart(5, '0')}`;

      // Recording a return never changes stock or money.
      const created = await tx.salesReturn.create({
        data: {
          returnNumber,
          invoiceId: invoice?.id ?? null,
          customerName: invoice?.customerName ?? '',
          reason: input.reason as SalesReturnReason,
          notes: input.notes,
          status: ReturnStatus.RECORDED,
          processedById: userId,
          items: {
            create: input.items.map((item) => {
              const isExchange = item.resolution === 'EXCHANGE';

              const common = {
                quantity: item.quantity,
                condition: item.condition as ReturnedProductCondition,
                restocked: false,
                notes: item.notes,
                resolution: item.resolution as ReturnResolution,
                replacementProductId: isExchange
                  ? item.replacementProductId!
                  : null,
                replacementQuantity: isExchange
                  ? (item.replacementQuantity ?? item.quantity)
                  : 0,
              };

              if (isInvoiceReturn) {
                const soldItem = invoiceItems.get(item.invoiceItemId!)!;

                return {
                  ...common,
                  invoiceItemId: soldItem.id,
                  productId: soldItem.productId,
                  productName: soldItem.name,
                  sku: soldItem.sku,
                };
              }

              const product = directProducts.get(item.productId!)!;

              return {
                ...common,
                invoiceItemId: null,
                productId: product.id,
                productName: product.name,
                sku: product.sku,
              };
            }),
          },
        },
        include: { items: true },
      });

      return { ...created, items: created.items.map(toMoneyItem) };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 10000,
      timeout: 15000,
    },
  );
}

/**
 * Approve a recorded return (admin only).
 *
 * - RESALABLE items go back to sellable stock exactly once.
 * - DAMAGED / NEEDS_INSPECTION items never enter sellable stock.
 * - REFUND items: the server works out the GST-inclusive refund from the
 *   invoice (after the invoice discount share). Unpaid credit invoices have
 *   their balance and the client's outstanding reduced first.
 * - EXCHANGE items: no money moves; the replacement product leaves stock.
 * - Direct (no invoice) returns never affect money or profit, only stock.
 */
export async function approveSalesReturn(
  returnId: string,
  userId: string,
) {
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.salesReturn.findUnique({
        where: { id: returnId },
        select: { id: true, invoiceId: true },
      });

      if (!existing) {
        throw new AppError(404, 'Return not found.', 'NOT_FOUND');
      }

      // Serialize concurrent approval attempts.
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM "SalesReturn"
        WHERE id = ${returnId}
        FOR UPDATE
      `;

      // Serialize refunds against the same invoice.
      if (existing.invoiceId) {
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id
          FROM "Invoice"
          WHERE id = ${existing.invoiceId}
          FOR UPDATE
        `;
      }

      const salesReturn = await tx.salesReturn.findUnique({
        where: { id: returnId },
        include: {
          invoice: true,
          items: { include: { invoiceItem: true } },
        },
      });

      if (!salesReturn) {
        throw new AppError(404, 'Return not found.', 'NOT_FOUND');
      }

      if (salesReturn.status !== ReturnStatus.RECORDED) {
        throw new AppError(
          409,
          'This return has already been processed or cancelled.',
          'RETURN_ALREADY_PROCESSED',
        );
      }

      const orderedItems = [...salesReturn.items].sort((a, b) =>
        (a.productId ?? '').localeCompare(b.productId ?? ''),
      );

      // Lock every product this return touches, in one fixed order,
      // so concurrent approvals can't deadlock.
      const productIds = [
        ...new Set(
          orderedItems
            .flatMap((item) => [item.productId, item.replacementProductId])
            .filter((id): id is string => Boolean(id)),
        ),
      ].sort();

      if (productIds.length > 0) {
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id
          FROM "Product"
          WHERE id IN (${Prisma.join(productIds)})
          ORDER BY id
          FOR UPDATE
        `;
      }

      // Validate everything before changing any stock.
      for (const item of orderedItems) {
        if (item.condition === ReturnedProductCondition.RESALABLE) {
          if (!item.productId) {
            throw new AppError(
              409,
              `${item.productName} is not linked to an inventory product.`,
              'PRODUCT_NOT_LINKED',
            );
          }

          const product = await tx.product.findUnique({
            where: { id: item.productId },
            select: { id: true },
          });

          if (!product) {
            throw new AppError(
              409,
              `Inventory product not found for ${item.productName}.`,
              'PRODUCT_NOT_FOUND',
            );
          }
        }
      }

      const replacementIds = [
        ...new Set(
          orderedItems
            .filter(
              (item) =>
                item.resolution === ReturnResolution.EXCHANGE &&
                item.replacementProductId,
            )
            .map((item) => item.replacementProductId!),
        ),
      ];

      const replacementProducts = new Map(
        (
          await tx.product.findMany({
            where: { id: { in: replacementIds } },
            select: { id: true, purchasePrice: true },
          })
        ).map((p) => [p.id, p]),
      );

      for (const item of orderedItems) {
        if (
          item.resolution === ReturnResolution.EXCHANGE &&
          (!item.replacementProductId ||
            !replacementProducts.has(item.replacementProductId))
        ) {
          throw new AppError(
            409,
            `Replacement product not found for ${item.productName}.`,
            'PRODUCT_NOT_FOUND',
          );
        }
      }

      const invoice = salesReturn.invoice;

      const discountRatio =
        invoice && num(invoice.subtotal) > 0
          ? num(invoice.discount) / num(invoice.subtotal)
          : 0;

      // Work out money and cost effects per item.
      const results = new Map<
        string,
        {
          restock: boolean;
          refund: number;
          tax: number;
          costReversed: number;
        }
      >();

      let totalRefund = 0;

      for (const item of orderedItems) {
        const restock =
          item.condition === ReturnedProductCondition.RESALABLE &&
          !item.restocked;

        let refund = 0;
        let tax = 0;
        let costReversed = 0;

        const sold = item.invoiceItem;

        // Only invoice-based returns have a verified price and cost.
        if (invoice && sold) {
          if (item.resolution === ReturnResolution.REFUND) {
            // GST-inclusive line value after this invoice's discount share.
            const lineNet = num(sold.amount) * (1 - discountRatio);

            const earlier = await tx.salesReturnItem.findMany({
              where: {
                invoiceItemId: sold.id,
                id: { not: item.id },
                salesReturn: { status: ReturnStatus.COMPLETED },
              },
              select: { refundAmount: true },
            });

            const alreadyRefunded = earlier.reduce(
              (total, row) => total + num(row.refundAmount),
              0,
            );

            const perShare = round2(
              (lineNet * item.quantity) / sold.quantity,
            );

            // Never refund more than the line was worth.
            refund = Math.max(
              0,
              Math.min(perShare, round2(lineNet - alreadyRefunded)),
            );

            const rate = Math.max(0, sold.gst);

            tax =
              rate > 0 ? round2((refund * rate) / (100 + rate)) : 0;
          }

          if (restock) {
            costReversed += round2(num(sold.cost) * item.quantity);
          }

          if (
            item.resolution === ReturnResolution.EXCHANGE &&
            item.replacementProductId
          ) {
            const replacement = replacementProducts.get(
              item.replacementProductId,
            )!;

            const replacementQty =
              item.replacementQuantity > 0
                ? item.replacementQuantity
                : item.quantity;

            costReversed -= round2(
              num(replacement.purchasePrice) * replacementQty,
            );
          }
        }

        totalRefund += refund;

        results.set(item.id, {
          restock,
          refund,
          tax,
          costReversed: round2(costReversed),
        });
      }

      const reason = (suffix: string) =>
        `Approved sales return ${salesReturn.returnNumber} - ${suffix}`;

      const sourceDescription = invoice
        ? `Invoice ${invoice.invoiceNumber}`
        : 'Direct product return (invoice unverified)';

      // Pass 1: put resalable items back into stock.
      for (const item of orderedItems) {
        if (!results.get(item.id)!.restock) continue;

        const productId = item.productId!;

        const updated = await tx.product.updateMany({
          where: { id: productId },
          data: { stock: { increment: item.quantity } },
        });

        if (updated.count !== 1) {
          throw new AppError(
            409,
            `Could not update inventory for ${item.productName}.`,
            'RESTOCK_FAILED',
          );
        }

        // Row is locked, so this is the true post-restock stock.
        const fresh = await tx.product.findUniqueOrThrow({
          where: { id: productId },
          select: { stock: true },
        });

        await tx.stockMovement.create({
          data: {
            productId,
            type: 'RETURN',
            quantity: item.quantity,
            balance: fresh.stock,
            reason: reason(sourceDescription),
            userId,
          },
        });
      }

      // Pass 2: take exchange replacements out of stock.
      for (const item of orderedItems) {
        if (
          item.resolution !== ReturnResolution.EXCHANGE ||
          !item.replacementProductId
        ) {
          continue;
        }

        const replacementQty =
          item.replacementQuantity > 0
            ? item.replacementQuantity
            : item.quantity;

        const taken = await tx.product.updateMany({
          where: {
            id: item.replacementProductId,
            stock: { gte: replacementQty },
          },
          data: { stock: { decrement: replacementQty } },
        });

        if (taken.count !== 1) {
          throw new AppError(
            409,
            `Not enough stock for the replacement of ${item.productName}.`,
            'INSUFFICIENT_STOCK',
          );
        }

        const fresh = await tx.product.findUniqueOrThrow({
          where: { id: item.replacementProductId },
          select: { stock: true },
        });

        await tx.stockMovement.create({
          data: {
            productId: item.replacementProductId,
            type: 'REMOVE',
            quantity: -replacementQty,
            balance: fresh.stock,
            reason: reason(`exchange replacement for ${item.productName}`),
            userId,
          },
        });
      }

      // Save per-item results.
      for (const item of orderedItems) {
        const r = results.get(item.id)!;

        await tx.salesReturnItem.update({
          where: { id: item.id },
          data: {
            restocked: item.restocked || r.restock,
            refundAmount: r.refund,
            refundTax: r.tax,
            costReversed: r.costReversed,
          },
        });
      }

      // Refund effect on the invoice and the client.
      totalRefund = round2(totalRefund);
      let creditAdjusted = 0;

      if (invoice && totalRefund > 0) {
        const balance = num(invoice.balance);

        // An unpaid credit invoice owes less instead of paying cash out.
        creditAdjusted = round2(
          Math.min(totalRefund, Math.max(0, balance)),
        );

        if (creditAdjusted > 0) {
          await tx.invoice.update({
            where: { id: invoice.id },
            data: { balance: round2(balance - creditAdjusted) },
          });
        }

        if (invoice.customerId) {
          await tx.client.update({
            where: { id: invoice.customerId },
            data: {
              totalPurchases: { decrement: totalRefund },
              outstanding: { decrement: creditAdjusted },
            },
          });
        }
      }

      const updated = await tx.salesReturn.update({
        where: { id: returnId },
        data: {
          status: ReturnStatus.COMPLETED,
          approvedAt: new Date(),
        },
        include: {
          invoice: {
            select: {
              invoiceNumber: true,
              customerName: true,
            },
          },
          items: true,
        },
      });

      return {
        ...updated,
        items: updated.items.map(toMoneyItem),
        refund: {
          total: totalRefund,
          creditAdjusted,
          cashRefund: round2(totalRefund - creditAdjusted),
        },
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 10000,
      timeout: 15000,
    },
  );
}

export async function listSalesReturns(limit = 10) {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));

  const rows = await prisma.salesReturn.findMany({
    take: safeLimit,
    orderBy: { createdAt: 'desc' },
    include: {
      invoice: {
        select: {
          invoiceNumber: true,
          customerName: true,
        },
      },
      items: true,
    },
  });

  return rows.map((row) => ({
    ...row,
    items: row.items.map(toMoneyItem),
  }));
}

/**
 * Items from approved returns that were NOT put back into sellable stock
 * (damaged or waiting for inspection). Feeds the replace/claim screen.
 */
export async function listDamagedItems(limit = 50) {
  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit)));

  const rows = await prisma.salesReturnItem.findMany({
    where: {
      condition: {
        in: [
          ReturnedProductCondition.DAMAGED,
          ReturnedProductCondition.NEEDS_INSPECTION,
        ],
      },
      salesReturn: { status: ReturnStatus.COMPLETED },
    },
    orderBy: { salesReturn: { createdAt: 'desc' } },
    take: safeLimit,
    include: {
      salesReturn: {
        select: {
          returnNumber: true,
          reason: true,
          approvedAt: true,
          invoice: {
            select: {
              invoiceNumber: true,
              customerName: true,
            },
          },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    returnNumber: row.salesReturn.returnNumber,
    invoiceNumber: row.salesReturn.invoice?.invoiceNumber ?? null,
    customerName: row.salesReturn.invoice?.customerName ?? '',
    productId: row.productId,
    productName: row.productName,
    sku: row.sku,
    quantity: row.quantity,
    condition: row.condition,
    resolution: row.resolution,
    reason: row.salesReturn.reason,
    notes: row.notes,
    replacementProductId: row.replacementProductId,
    replacementQuantity: row.replacementQuantity,
    refundAmount: num(row.refundAmount),
    approvedAt: row.salesReturn.approvedAt?.toISOString() ?? null,
  }));
}
