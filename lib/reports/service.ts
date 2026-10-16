import { prisma, num } from '../db/prisma';

import {
  addDays,
  istDate,
  round2,
  startOfIstDay
} from '../format';

import { CATS } from '../constants';

export type RangeKey =
  | '1'
  | '7'
  | '30'
  | '90'
  | '365'
  | 'custom';

/**
 * Resolves a range into [from, to) instants.
 * Day-based ranges are rolling windows ending today (IST).
 */
export function resolveRange(
  range: string,
  from?: string,
  to?: string
) {
  const todayStart = startOfIstDay(
    new Date()
  );

  const end = addDays(
    todayStart,
    1
  );

  if (range === 'custom' && from && to) {
    const f = new Date(
      `${from}T00:00:00+05:30`
    );

    const t = addDays(
      new Date(
        `${to}T00:00:00+05:30`
      ),
      1
    );

    if (
      !isNaN(f.getTime()) &&
      !isNaN(t.getTime()) &&
      t > f
    ) {
      return {
        from: f,
        to: t
      };
    }
  }

  const days = [
    '1',
    '7',
    '30',
    '90',
    '365'
  ].includes(range)
    ? +range
    : 30;

  return {
    from: addDays(end, -days),
    to: end
  };
}

export async function salesSeries(
  from: Date,
  to: Date
) {
  const rows = await prisma.$queryRaw<
    {
      d: string;
      sales: number;
      cost: number;
      tax: number;
      disc: number;
      orders: number;
    }[]
  >`
    SELECT
      DATE(
        CONVERT_TZ(
          createdAt,
          '+00:00',
          '+05:30'
        )
      ) AS d,

      CAST(
        SUM(grandTotal) AS DOUBLE
      ) AS sales,

      CAST(
        SUM(costTotal) AS DOUBLE
      ) AS cost,

      CAST(
        SUM(tax) AS DOUBLE
      ) AS tax,

      CAST(
        SUM(discount) AS DOUBLE
      ) AS disc,

      COUNT(*) AS orders

    FROM Invoice

    WHERE createdAt >= ${from}
      AND createdAt < ${to}

    GROUP BY d

    ORDER BY d
  `;  
    const map = new Map(
    rows.map((r) => [
      istDate(new Date(r.d)),
      r
    ])
  );

  const labels: string[] = [];
  const sales: number[] = [];
  const profit: number[] = [];

  const days = Math.round(
    (to.getTime() -
      from.getTime()) /
      864e5
  );

  // Long ranges are bucketed by month
  // to keep charts light.
  if (days > 92) {
    const m = new Map<
      string,
      {
        s: number;
        p: number;
      }
    >();

    for (const r of rows) {
      const k = r.d.slice(
        0,
        7
      );

      const e =
        m.get(k) ?? {
          s: 0,
          p: 0
        };

      e.s += Number(r.sales);

      e.p +=
        Number(r.sales) -
        Number(r.cost) -
        Number(r.tax);

      m.set(k, e);
    }

    for (
      const [k, v] of [...m].sort()
    ) {
      labels.push(k);

      sales.push(
        round2(v.s)
      );

      profit.push(
        round2(v.p)
      );
    }
  } else {
    for (
      let i = 0;
      i < days;
      i++
    ) {
      const d = istDate(
        addDays(from, i)
      );

      const r = map.get(d);

      labels.push(
        d.slice(5)
      );

      sales.push(
        round2(
          Number(
            r?.sales ?? 0
          )
        )
      );

      profit.push(
        round2(
          r
            ? Number(r.sales) -
                Number(r.cost) -
                Number(r.tax)
            : 0
        )
      );
    }
  }

  const t = rows.reduce(
    (a, r) => ({
      s:
        a.s +
        Number(r.sales),

      o:
        a.o +
        Number(r.orders)
    }),
    {
      s: 0,
      o: 0
    }
  );

  return {
    labels,
    sales,
    profit,
    total: round2(t.s),
    orders: t.o
  };
}

export async function reportSummary(
  from: Date,
  to: Date
) {
  const [
    agg,
    series,
    cats,
    top
  ] = await Promise.all([
    prisma.invoice.aggregate({
      where: {
        createdAt: {
          gte: from,
          lt: to
        }
      },

      _sum: {
        grandTotal: true,
        tax: true,
        discount: true,
        costTotal: true,
        subtotal: true
      },

      _count: true
    }),

    salesSeries(
      from,
      to
    ),

    prisma.$queryRaw<
      {
        category: string;
        amount: number;
      }[]
    >`
      SELECT
        ii.category,

        CAST(
          SUM(ii.amount) AS DOUBLE
        ) AS amount

      FROM InvoiceItem ii

      JOIN Invoice i
        ON i.id = ii.invoiceId

      WHERE i.createdAt >= ${from}
        AND i.createdAt < ${to}

      GROUP BY ii.category

      ORDER BY amount DESC
    `,

    prisma.$queryRaw<
      {
        name: string;
        units: number;
        revenue: number;
        profit: number;
      }[]
    >`
      SELECT
        ii.name,

        CAST(
          SUM(ii.quantity) AS UNSIGNED
        ) AS units,

        CAST(
          SUM(ii.amount) AS DOUBLE
        ) AS revenue,

        CAST(
          SUM(
            ii.amount -
            ii.cost * ii.quantity
          ) AS DOUBLE
        ) AS profit

      FROM InvoiceItem ii

      JOIN Invoice i
        ON i.id = ii.invoiceId

      WHERE i.createdAt >= ${from}
        AND i.createdAt < ${to}

      GROUP BY ii.name

      ORDER BY units DESC

      LIMIT 6
    `
  ]);

  const total = num(
    agg._sum.grandTotal
  );

  const orders =
    agg._count;

  return {
    total: round2(
      total
    ),

    orders,

    avg: orders
      ? round2(
          total / orders
        )
      : 0,

    tax: round2(
      num(
        agg._sum.tax
      )
    ),

    discount: round2(
      num(
        agg._sum.discount
      )
    ),

    grossProfit: round2(
      num(
        agg._sum.subtotal
      ) -
        num(
          agg._sum.discount
        ) -
        num(
          agg._sum.costTotal
        )
    ),

    series,

    categories: cats.map(
      (c) => ({
        label:
          CATS[
            c.category
          ] ??
          c.category,

        amount: round2(
          Number(
            c.amount
          )
        )
      })
    ),

    top: top.map(
      (t) => ({
        ...t,

        units: Number(
          t.units
        ),

        revenue: round2(
          Number(
            t.revenue
          )
        ),

        profit: round2(
          Number(
            t.profit
          )
        )
      })
    )
  };
}

export async function reportCsvRows(
  from: Date,
  to: Date
) {
  const rows =
    await prisma.invoice.findMany({
      where: {
        createdAt: {
          gte: from,
          lt: to
        }
      },

      orderBy: {
        createdAt: 'asc'
      }
    });

  return rows.map(
    (i) => [
      i.invoiceNumber,
      i.customerName,
      num(i.grandTotal),
      i.paymentMethod,
      istDate(
        i.createdAt
      )
    ]
  );
}