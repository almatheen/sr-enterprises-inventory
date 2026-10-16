import { Prisma } from '@prisma/client';

import { prisma, nextSequence, num } from '../db/prisma';
import { AppError } from '../errors';
import { calculate } from '../billing/calc';
import { getBusiness } from '../business';
import { istYear, round2 } from '../format';
import { PAGE_SIZE } from '../constants';

import type { InvoiceDTO, InvoiceRowDTO, Paged } from '../types';
import type { InvoiceInput } from '../validation/schemas';

type Full = Prisma.InvoiceGetPayload<{
  include: {
    items: true;
  };
}>;

export const toInvoiceDTO = (i: Full): InvoiceDTO => ({
  id: i.invoiceNumber,
  date: i.createdAt.toISOString(),

  cust: {
    name: i.customerName,
    phone: i.customerPhone,
    email: i.customerEmail,
    gstin: i.customerGstin,
    addr: i.customerAddress,
  },

  pay: i.paymentMethod,
  status: i.status,

  L: i.items.map((l) => ({
    name: l.name,
    sku: l.sku,
    qty: l.quantity,
    price: num(l.price),
    gst: l.gst,
    amt: num(l.amount),
  })),

  sub: num(i.subtotal),
  disc: num(i.discount),
  tax: num(i.tax),
  cgst: num(i.cgst),
  sgst: num(i.sgst),
  igst: num(i.igst),
  round: num(i.roundOff),
  gt: num(i.grandTotal),
  inter: i.interState,
  paid: num(i.amountPaid),
  bal: num(i.balance),
});

/**
 * Creates an invoice using database product IDs.
 * Prices and totals are calculated on the server.
 * Invoice creation, stock deduction, and stock movements
 * are committed together in one transaction.
 */
export async function createInvoice(
  input: InvoiceInput,
  userId: string
) {
  const phone = input.customer.phone.trim();

  if (phone && !/^\d{10}$/.test(phone)) {
    throw new AppError(
      400,
      'Invalid mobile number',
      'INVALID_PHONE'
    );
  }

  if (
    input.saveCustomer &&
    (input.customer.name || phone) &&
    !phone
  ) {
    throw new AppError(
      400,
      'Enter name and 10-digit mobile',
      'INVALID_CUSTOMER'
    );
  }

  if (input.paymentMethod === 'Credit' && !phone) {
    throw new AppError(
      400,
      "Credit sales need the customer's 10-digit mobile number.",
      'CREDIT_NEEDS_CUSTOMER'
    );
  }

  // Merge duplicate cart lines by database product ID.
  const want = new Map<string, number>();

  for (const item of input.items) {
    want.set(
      item.productId,
      (want.get(item.productId) ?? 0) + item.quantity
    );
  }

  const biz = await getBusiness();
  const year = istYear();

  return prisma.$transaction(
    async (tx) => {
      // The billing UI submits ProductDTO.id, which maps to p.id.
      const products = await tx.product.findMany({
        where: {
          id: {
            in: [...want.keys()],
          },
        },
      });

      if (products.length !== want.size) {
        throw new AppError(
          400,
          'One or more products no longer exist.',
          'INVALID_PRODUCT'
        );
      }

      // Calculate all totals using current database prices.
      const calc = calculate(
        products.map((p) => ({
          id: p.id,
          name: p.name,
          price: num(p.sellingPrice),
          gst: p.gst,
          qty: want.get(p.id)!,
        })),
        {
          gstOverride: input.gstOverride,
          discountType: input.discountType,
          discountValue: input.discountValue,
          interState: input.interState,
        }
      );

      // Deduct stock atomically, checking availability per product.
      for (const p of products) {
        const qty = want.get(p.id)!;

        const result = await tx.product.updateMany({
          where: {
            id: p.id,
            stock: {
              gte: qty,
            },
          },
          data: {
            stock: {
              decrement: qty,
            },
          },
        });

        if (result.count !== 1) {
          throw new AppError(
            409,
            `Insufficient stock for ${p.name}`,
            'INSUFFICIENT_STOCK'
          );
        }
      }

      // Find or create the customer when appropriate.
      let customerId: string | null = null;
      let name = input.customer.name.trim();

      if (phone) {
        const existing = await tx.client.findUnique({
          where: {
            phone,
          },
        });

        if (existing) {
          customerId = existing.id;
          name = name || existing.name;
        } else if (input.saveCustomer) {
          const customer = await tx.client.create({
            data: {
              name: name || 'Customer',
              phone,
              email: input.customer.email,
              gstin: input.customer.gstin,
              address: input.customer.address,
            },
          });

          customerId = customer.id;
          name = name || customer.name;
        }
      }

      const isCredit = input.paymentMethod === 'Credit';
      const paid = isCredit ? 0 : calc.gt;
      const balance = round2(calc.gt - paid);

      // Calculate total purchase cost using the same database IDs.
      const cost = round2(
        products.reduce(
          (total, p) =>
            total +
            num(p.purchasePrice) * want.get(p.id)!,
          0
        )
      );

      const sequence = await nextSequence(
        tx,
        `invoice:${year}`
      );

      const invoiceNumber =
        `${biz.invoicePrefix}-${year}-${String(sequence).padStart(5, '0')}`;

      const productsById = new Map(
        products.map((p) => [p.id, p])
      );

      // Save the invoice and its line items.
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,

          customerId,
          customerName: name,
          customerPhone: phone,
          customerEmail: input.customer.email,
          customerGstin: input.customer.gstin,
          customerAddress: input.customer.address,

          subtotal: calc.sub,

          discountType: input.discountType,
          discountValue: input.discountValue,
          discount: calc.disc,

          cgst: calc.cgst,
          sgst: calc.sgst,
          igst: calc.igst,
          tax: calc.tax,

          roundOff: calc.round,
          grandTotal: calc.gt,

          amountPaid: paid,
          balance,
          costTotal: cost,

          interState: input.interState,
          paymentMethod: input.paymentMethod,
          status: isCredit ? 'Credit' : 'Paid',

          items: {
            create: calc.lines.map((line) => {
              const product = productsById.get(line.id);

              if (!product) {
                throw new AppError(
                  400,
                  'A billed product could not be matched.',
                  'INVALID_PRODUCT'
                );
              }

              return {
                productId: product.id,
                name: product.name,
                sku: product.sku,
                category: product.category,
                quantity: line.qty,
                price: line.price,
                cost: num(product.purchasePrice),
                gst: line.appliedGst,
                amount: line.amt,
              };
            }),
          },
        },
        include: {
          items: true,
        },
      });

      // Record stock movements.
      for (const p of products) {
        const qty = want.get(p.id)!;

        await tx.stockMovement.create({
          data: {
            productId: p.id,
            type: 'SALE',
            quantity: -qty,
            balance: p.stock - qty,
            reason: `Invoice ${invoiceNumber}`,
            userId,
          },
        });
      }

      // Update customer purchase totals and outstanding balance.
      if (customerId) {
        await tx.client.update({
          where: {
            id: customerId,
          },
          data: {
            totalPurchases: {
              increment: calc.gt,
            },
            outstanding: {
              increment: balance,
            },
          },
        });
      }

      // Identify products that have reached their low-stock threshold.
      const lowStock = products
        .filter(
          (p) =>
            p.stock - want.get(p.id)! <= p.minimumStock
        )
        .map((p) => p.name);

      return {
        invoice: toInvoiceDTO(invoice),
        lowStock,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 15000,
    }
  );
}

export async function getInvoice(number: string) {
  const invoice = await prisma.invoice.findUnique({
    where: {
      invoiceNumber: number,
    },
    include: {
      items: true,
    },
  });

  if (!invoice) {
    throw new AppError(
      404,
      'Invoice not found.',
      'NOT_FOUND'
    );
  }

  return toInvoiceDTO(invoice);
}

export async function listInvoices(
  opts: {
    q?: string;
    payment?: string;
    page?: number;
    pageSize?: number;
    limit?: number;
  }
): Promise<Paged<InvoiceRowDTO>> {
  const page = Math.max(1, opts.page || 1);

  const pageSize =
    opts.limit ??
    Math.min(200, opts.pageSize || PAGE_SIZE);

  const where: Prisma.InvoiceWhereInput = {};

  if (opts.payment) {
    where.paymentMethod = opts.payment;
  }

  if (opts.q?.trim()) {
    const q = opts.q.trim();

    where.OR = [
      {
        invoiceNumber: {
          contains: q,
        },
      },
      {
        customerName: {
          contains: q,
        },
      },
      {
        customerPhone: {
          contains: q,
        },
      },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: {
          select: {
            items: true,
          },
        },
      },
    }),

    prisma.invoice.count({
      where,
    }),
  ]);

  return {
    rows: rows.map((invoice) => ({
      id: invoice.invoiceNumber,
      name: invoice.customerName,
      items: invoice._count.items,
      gt: num(invoice.grandTotal),
      pay: invoice.paymentMethod,
      date: invoice.createdAt.toISOString(),
      status: invoice.status,
    })),

    total,
    page,
    pageSize,
  };
}

/**
 * Settles a credit invoice in full.
 */
export async function markPaid(number: string) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: {
        invoiceNumber: number,
      },
    });

    if (!invoice) {
      throw new AppError(
        404,
        'Invoice not found.',
        'NOT_FOUND'
      );
    }

    if (invoice.status === 'Paid') {
      throw new AppError(
        409,
        'Invoice is already paid.',
        'ALREADY_PAID'
      );
    }

    await tx.invoice.update({
      where: {
        id: invoice.id,
      },
      data: {
        status: 'Paid',
        amountPaid: invoice.grandTotal,
        balance: 0,
      },
    });

    if (invoice.customerId) {
      await tx.client.update({
        where: {
          id: invoice.customerId,
        },
        data: {
          outstanding: {
            decrement: invoice.balance,
          },
        },
      });
    }
  });
}
