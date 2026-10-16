import { prisma } from '../db/prisma';

import { listProducts } from '../inventory/service';

export async function globalSearch(q: string) {
  const qq = q.trim();

  const [products, invoices, clients] = await Promise.all([
    listProducts({
      q: qq,
      pageSize: 5
    }),

    prisma.invoice.findMany({
      where: {
        OR: [
          {
            invoiceNumber: {
              contains: qq
            }
          },
          {
            customerName: {
              contains: qq
            }
          },
          {
            customerPhone: {
              contains: qq
            }
          }
        ]
      },

      orderBy: {
        createdAt: 'desc'
      },

      take: 5,

      select: {
        invoiceNumber: true
      }
    }),

    prisma.client.findMany({
      where: {
        OR: [
          {
            name: {
              contains: qq
            }
          },
          {
            phone: {
              contains: qq
            }
          }
        ]
      },

      take: 5,

      select: {
        id: true,
        name: true,
        phone: true
      }
    })
  ]);

  const invCount = await prisma.invoice.count({
    where: {
      OR: [
        {
          invoiceNumber: {
            contains: qq
          }
        },
        {
          customerName: {
            contains: qq
          }
        },
        {
          customerPhone: {
            contains: qq
          }
        }
      ]
    }
  });

  const clientCount = await prisma.client.count({
    where: {
      OR: [
        {
          name: {
            contains: qq
          }
        },
        {
          phone: {
            contains: qq
          }
        }
      ]
    }
  });

  return {
    products: {
      total: products.total,
      rows: products.rows.map((p) => ({
        id: p.id,
        name: p.name
      }))
    },

    invoices: {
      total: invCount,
      rows: invoices.map((i) => ({
        id: i.invoiceNumber
      }))
    },

    clients: {
      total: clientCount,
      rows: clients
    }
  };
}