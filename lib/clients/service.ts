import { Prisma } from '@prisma/client';

import { prisma, num } from '../db/prisma';

import { AppError } from '../errors';

import { PAGE_SIZE } from '../constants';

import type { ClientDTO, Paged } from '../types';

import type { z } from 'zod';

import { clientSchema } from '../validation/schemas';

type Row = Prisma.ClientGetPayload<{
  include: {
    _count: {
      select: {
        invoices: true;
      };
    };
  };
}>;

export const toClientDTO = (c: Row): ClientDTO => ({
  id: c.id,
  name: c.name,
  phone: c.phone,
  email: c.email,
  gstin: c.gstin,
  addr: c.address,
  state: c.state,
  purchases: num(c.totalPurchases),
  orders: c._count.invoices,
  credit: num(c.outstanding)
});

const inc = {
  _count: {
    select: {
      invoices: true
    }
  }
} as const;

export async function createClient(
  input: z.infer<typeof clientSchema>
) {
  const ex = await prisma.client.findUnique({
    where: {
      phone: input.phone
    },
    include: inc
  });

  if (ex) {
    return {
      client: toClientDTO(ex),
      existed: true
    };
  }

  const c = await prisma.client.create({
    data: input,
    include: inc
  });

  return {
    client: toClientDTO(c),
    existed: false
  };
}

export async function updateClient(
  id: string,
  input: z.infer<typeof clientSchema>
) {
  const dup = await prisma.client.findFirst({
    where: {
      phone: input.phone,
      NOT: {
        id
      }
    },
    select: {
      id: true
    }
  });

  if (dup) {
    throw new AppError(
      409,
      'Another client already uses this mobile number.',
      'DUPLICATE_PHONE'
    );
  }

  const c = await prisma.client.update({
    where: {
      id
    },
    data: input,
    include: inc
  });

  return toClientDTO(c);
}

export async function listClients(
  q = '',
  page = 1,
  pageSize = PAGE_SIZE
): Promise<Paged<ClientDTO>> {
  page = Math.max(1, page);

  const where: Prisma.ClientWhereInput = q.trim()
    ? {
        OR: [
          {
            name: {
              contains: q.trim()
            }
          },
          {
            phone: {
              contains: q.trim()
            }
          },
          {
            email: {
              contains: q.trim()
            }
          }
        ]
      }
    : {};

  const [rows, total] = await Promise.all([
    prisma.client.findMany({
      where,
      include: inc,
      orderBy: {
        createdAt: 'desc'
      },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),

    prisma.client.count({
      where
    })
  ]);

  return {
    rows: rows.map(toClientDTO),
    total,
    page,
    pageSize
  };
}

export async function getClientWithInvoices(id: string) {
  const c = await prisma.client.findUnique({
    where: {
      id
    },
    include: {
      ...inc,
      invoices: {
        orderBy: {
          createdAt: 'desc'
        },
        take: 100,
        include: {
          _count: {
            select: {
              items: true
            }
          }
        }
      }
    }
  });

  if (!c) {
    throw new AppError(
      404,
      'Client not found.',
      'NOT_FOUND'
    );
  }

  return {
    client: toClientDTO(c),

    invoices: c.invoices.map((i) => ({
      id: i.invoiceNumber,
      name: i.customerName,
      items: i._count.items,
      gt: num(i.grandTotal),
      pay: i.paymentMethod,
      date: i.createdAt.toISOString(),
      status: i.status
    }))
  };
}