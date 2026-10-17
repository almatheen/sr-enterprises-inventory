
import {
  Prisma,
  ReturnedProductCondition,
  SalesReturnReason,
  ReturnStatus,
} from '@prisma/client';

import { prisma, nextSequence } from '../db/prisma';
import { AppError } from '../errors';
import { istYear } from '../format';
import type { SalesReturnInput } from '../validation/schemas';

const RETURN_PREFIX = 'SR-RET';

type InvoiceWithItems = Prisma.InvoiceGetPayload<{
  include: { items: true };
}>;

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
          where: { invoiceNumber: invoiceNumber! },
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

          if (item.quantity > remaining) {
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

      const year = istYear();
      const sequence = await nextSequence(tx, `sales-return:${year}`);

      const returnNumber =
        `${RETURN_PREFIX}-${year}-${String(sequence).padStart(5, '0')}`;

      // Recording a return never changes stock.
      return tx.salesReturn.create({
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
              if (isInvoiceReturn) {
                const soldItem = invoiceItems.get(item.invoiceItemId!)!;

                return {
                  invoiceItemId: soldItem.id,
                  productId: soldItem.productId,
                  productName: soldItem.name,
                  sku: soldItem.sku,
                  quantity: item.quantity,
                  condition:
                    item.condition as ReturnedProductCondition,
                  restocked: false,
                  notes: item.notes,
                };
              }

              const product = directProducts.get(item.productId!)!;

              return {
                invoiceItemId: null,
                productId: product.id,
                productName: product.name,
                sku: product.sku,
                quantity: item.quantity,
                condition:
                  item.condition as ReturnedProductCondition,
                restocked: false,
                notes: item.notes,
              };
            }),
          },
        },
        include: { items: true },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 15000,
    },
  );
}

/**
 * Approve a recorded return.
 * Resalable items are added to sellable stock exactly once.
 * Damaged and inspection-pending items are not restocked.
 */
export async function approveSalesReturn(
  returnId: string,
  userId: string,
) {
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.salesReturn.findUnique({
        where: { id: returnId },
        select: { id: true },
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

      const salesReturn = await tx.salesReturn.findUnique({
        where: { id: returnId },
        include: { invoice: true, items: true },
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

      // Validate every resalable product before changing any stock.
      for (const item of salesReturn.items) {
        if (item.condition !== ReturnedProductCondition.RESALABLE) {
          continue;
        }

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

      for (const item of salesReturn.items) {
        // Damaged and inspection-pending products stay out of sellable stock.
        if (item.condition !== ReturnedProductCondition.RESALABLE) {
          continue;
        }

        // Defensive protection against duplicate restocking.
        if (item.restocked) {
          continue;
        }

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

        const product = await tx.product.findUnique({
          where: { id: productId },
          select: { stock: true },
        });

        if (!product) {
          throw new AppError(
            404,
            'Inventory product not found.',
            'PRODUCT_NOT_FOUND',
          );
        }

        const sourceDescription = salesReturn.invoice
          ? `Invoice ${salesReturn.invoice.invoiceNumber}`
          : 'Direct product return (invoice unverified)';

        await tx.stockMovement.create({
          data: {
            productId,
            type: 'RETURN',
            quantity: item.quantity,
            balance: product.stock,
            reason:
              `Approved sales return ${salesReturn.returnNumber} - ` +
              sourceDescription,
            userId,
          },
        });

        await tx.salesReturnItem.update({
          where: { id: item.id },
          data: { restocked: true },
        });
      }

      return tx.salesReturn.update({
        where: { id: returnId },
        data: { status: ReturnStatus.COMPLETED },
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
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 15000,
    },
  );
}

export async function listSalesReturns(limit = 10) {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));

  return prisma.salesReturn.findMany({
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
}
