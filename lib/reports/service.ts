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
  const todayStart = startOfIstDay(new Date());

  const end = addDays(todayStart, 1);

  if (range === 'custom' && from && to) {
    const f = new Date(`${from}T00:00:00+05:30`);

    const t = addDays(
      new Date(`${to}T00:00:00+05:30`),
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

  const days = ['1', '7', '30', '90', '365'].includes(range)
    ? +range
    : 30;

  return {
    from: addDays(end, -days),
    to: end
  };
}

/**
 * Totals of approved refunds in [from, to), by approval date.
 * refund = GST-inclusive money refunded
 * tax    = GST portion of that refund
 * cost   = net cost credited back to profit
 *          (restocked cost minus exchange replacement cost)
 */
export async function refundTotals(from: Date, to: Date) {
  const rows = await prisma.$queryRaw<
    {
      refund: number;
      tax: number;
      cost: number;
    }[]
  >`
    SELECT
      CAST(COALESCE(SUM(i."refundAmount"), 0) AS DOUBLE PRECISION) AS refund,
      CAST(COALESCE(SUM(i."refundTax"), 0) AS DOUBLE PRECISION) AS tax,
      CAST(COALESCE(SUM(i."costReversed"), 0) AS DOUBLE PRECISION) AS cost

    FROM "SalesReturnItem" i

    JOIN "SalesReturn" r
      ON r."id" = i."returnId"

    WHERE r."status" = 'COMPLETED'
      AND r."approvedAt" >= ${from}
      AND r."approvedAt" < ${to}
  `;

  const r = rows[0];

  return {
    refund: Number(r?.refund ?? 0),
    tax: Number(r?.tax ?? 0),
    cost: Number(r?.cost ?? 0)
  };
}

type DayRow = {
  sales: number;
  profit: number;
  orders: number;
};

/**
 * Daily sales and profit.
 *
 * sales  = invoice grand totals minus refunds approved that day
 * profit = (subtotal - discount - cost) of invoices
 *          minus (refund - cost credited back) of refunds.
 * GST is part of profit (owner's rule), so tax is NOT subtracted.
 */
export async function salesSeries(
  from: Date,
  to: Date
) {
  const [invoiceRows, refundRows] = await Promise.all([
    prisma.$queryRaw<
      {
        d: string;
        sales: number;
        net: number;
        cost: number;
        orders: number;
      }[]
    >`
      SELECT
        TO_CHAR(
          "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata',
          'YYYY-MM-DD'
        ) AS d,

        CAST(SUM("grandTotal") AS DOUBLE PRECISION) AS sales,

        CAST(
          SUM("subtotal" - "discount") AS DOUBLE PRECISION
        ) AS net,

        CAST(SUM("costTotal") AS DOUBLE PRECISION) AS cost,

        CAST(COUNT(*) AS INTEGER) AS orders

      FROM "Invoice"

      WHERE "createdAt" >= ${from}
        AND "createdAt" < ${to}

      GROUP BY d

      ORDER BY d
    `,

    prisma.$queryRaw<
      {
        d: string;
        refund: number;
        cost: number;
      }[]
    >`
      SELECT
        TO_CHAR(
          r."approvedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata',
          'YYYY-MM-DD'
        ) AS d,

        CAST(SUM(i."refundAmount") AS DOUBLE PRECISION) AS refund,

        CAST(SUM(i."costReversed") AS DOUBLE PRECISION) AS cost

      FROM "SalesReturnItem" i

      JOIN "SalesReturn" r
        ON r."id" = i."returnId"

      WHERE r."status" = 'COMPLETED'
        AND r."approvedAt" >= ${from}
        AND r."approvedAt" < ${to}

      GROUP BY d

      ORDER BY d
    `
  ]);

  const daily = new Map<string, DayRow>();

  const bucket = (d: string): DayRow => {
    let e = daily.get(d);

    if (!e) {
      e = { sales: 0, profit: 0, orders: 0 };
      daily.set(d, e);
    }

    return e;
  };

  for (const r of invoiceRows) {
    const e = bucket(istDate(new Date(r.d)));

    e.sales += Number(r.sales);
    e.profit += Number(r.net) - Number(r.cost);
    e.orders += Number(r.orders);
  }

  for (const r of refundRows) {
    const e = bucket(istDate(new Date(r.d)));

    e.sales -= Number(r.refund);
    e.profit -= Number(r.refund) - Number(r.cost);
  }

  const labels: string[] = [];
  const sales: number[] = [];
  const profit: number[] = [];

  const days = Math.round(
    (to.getTime() - from.getTime()) / 864e5
  );

  // Long ranges are bucketed by month
  // to keep charts light.
  if (days > 92) {
    const months = new Map<
      string,
      { s: number; p: number }
    >();

    for (const [d, v] of daily) {
      const k = d.slice(0, 7);

      const e = months.get(k) ?? { s: 0, p: 0 };

      e.s += v.sales;
      e.p += v.profit;

      months.set(k, e);
    }

    for (const [k, v] of [...months].sort()) {
      labels.push(k);
      sales.push(round2(v.s));
      profit.push(round2(v.p));
    }
  } else {
    for (let i = 0; i < days; i++) {
      const d = istDate(addDays(from, i));

      const v = daily.get(d);

      labels.push(d.slice(5));
      sales.push(round2(v?.sales ?? 0));
      profit.push(round2(v?.profit ?? 0));
    }
  }

  let totalSales = 0;
  let totalOrders = 0;

  for (const v of daily.values()) {
    totalSales += v.sales;
    totalOrders += v.orders;
  }

  return {
    labels,
    sales,
    profit,
    total: round2(totalSales),
    orders: totalOrders
  };
}

export async function reportSummary(
  from: Date,
  to: Date
) {
  const [agg, series, cats, top, refunds] =
    await Promise.all([
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

      salesSeries(from, to),

      prisma.$queryRaw<
        {
          category: string;
          amount: number;
        }[]
      >`
        SELECT
          ii."category",

          CAST(
            SUM(ii."amount") AS DOUBLE PRECISION
          ) AS amount

        FROM "InvoiceItem" ii

        JOIN "Invoice" i
          ON i."id" = ii."invoiceId"

        WHERE i."createdAt" >= ${from}
          AND i."createdAt" < ${to}

        GROUP BY ii."category"

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
          ii."name",

          CAST(
            SUM(ii."quantity") AS INTEGER
          ) AS units,

          CAST(
            SUM(ii."amount") AS DOUBLE PRECISION
          ) AS revenue,

          CAST(
            SUM(
              ii."amount" -
              ii."cost" * ii."quantity"
            ) AS DOUBLE PRECISION
          ) AS profit

        FROM "InvoiceItem" ii

        JOIN "Invoice" i
          ON i."id" = ii."invoiceId"

        WHERE i."createdAt" >= ${from}
          AND i."createdAt" < ${to}

        GROUP BY ii."name"

        ORDER BY units DESC

        LIMIT 6
      `,

      refundTotals(from, to)
    ]);

  const orders = agg._count;

  // Net of refunds approved in this range.
  const total = num(agg._sum.grandTotal) - refunds.refund;

  const tax = num(agg._sum.tax) - refunds.tax;

  // GST counts as profit (owner's rule):
  // profit = what the customer paid for the goods, minus what they cost.
  const invoiceProfit =
    num(agg._sum.subtotal) -
    num(agg._sum.discount) -
    num(agg._sum.costTotal);

  const grossProfit =
    invoiceProfit - (refunds.refund - refunds.cost);

  return {
    total: round2(total),

    orders,

    avg: orders ? round2(total / orders) : 0,

    tax: round2(tax),

    discount: round2(num(agg._sum.discount)),

    refunds: round2(refunds.refund),

    grossProfit: round2(grossProfit),

    series,

    categories: cats.map((c) => ({
      label: CATS[c.category] ?? c.category,

      amount: round2(Number(c.amount))
    })),

    top: top.map((t) => ({
      ...t,

      units: Number(t.units),

      revenue: round2(Number(t.revenue)),

      profit: round2(Number(t.profit))
    }))
  };
}

export async function reportCsvRows(
  from: Date,
  to: Date
) {
  const rows = await prisma.invoice.findMany({
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

  return rows.map((i) => [
    i.invoiceNumber,
    i.customerName,
    num(i.grandTotal),
    i.paymentMethod,
    istDate(i.createdAt)
  ]);
}
