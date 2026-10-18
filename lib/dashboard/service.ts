import { prisma, num } from '../db/prisma';

import { addDays, round2, startOfIstDay } from '../format';

import { lowStock, lowStockCount } from '../inventory/service';

import { listInvoices } from '../invoices/service';

import { refundTotals, salesSeries } from '../reports/service';

export async function dashboardData(days: number) {
  const todayStart = startOfIstDay(new Date());

  const tomorrow = addDays(todayStart, 1);

  const yesterday = addDays(todayStart, -1);

  // Month start in IST
  const ist = new Date(Date.now() + 330 * 60000);

  const monthStart = new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) -
      330 * 60000
  );

  const prevMonthStart = new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - 1, 1) -
      330 * 60000
  );

  // Sales in [gte, lt): invoice totals minus refunds approved in the same window.
  const sum = async (gte: Date, lt: Date) => {
    const [invoices, refunds] = await Promise.all([
      prisma.invoice.aggregate({
        where: {
          createdAt: {
            gte,
            lt
          }
        },
        _sum: {
          grandTotal: true
        }
      }),

      refundTotals(gte, lt)
    ]);

    return num(invoices._sum.grandTotal) - refunds.refund;
  };

  const [
    today,
    yest,
    month,
    prevMonth,
    orders,
    products,
    clients,
    lowCount,
    lows,
    recent,
    series,
    dow
  ] = await Promise.all([
    sum(todayStart, tomorrow),

    sum(yesterday, todayStart),

    sum(monthStart, tomorrow),

    sum(prevMonthStart, monthStart),

    prisma.invoice.count(),

    prisma.product.count(),

    prisma.client.count(),

    lowStockCount(),

    lowStock(6),

    listInvoices({
      limit: 6
    }),

    salesSeries(addDays(tomorrow, -days), tomorrow),

    prisma.$queryRaw<
      {
        dow: number;
        s: number;
      }[]
    >`
      SELECT
        CAST(EXTRACT(DOW FROM ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')) AS INTEGER) AS dow,
        CAST(SUM("grandTotal") AS DOUBLE PRECISION) AS s
      FROM "Invoice"
      WHERE "createdAt" >= ${monthStart}
        AND "createdAt" < ${tomorrow}
      GROUP BY dow
      ORDER BY s DESC
      LIMIT 1
    `
  ]);

  const pct = (a: number, b: number) =>
    b > 0 ? round2(((a - b) / b) * 100) : null;

  return {
    today: round2(today),

    todayChange: pct(today, yest),

    month: round2(month),

    monthChange: pct(month, prevMonth),

    orders,

    products,

    clients,

    lowCount,

    lows,

    recent: recent.rows,

    series,

    bestDay: dow[0]
      ? [
          'Sunday',
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday'
        ][dow[0].dow]
      : null,

    insight: lows[0]
      ? {
          name: lows[0].name,
          stock: lows[0].stock
        }
      : null
  };
}
