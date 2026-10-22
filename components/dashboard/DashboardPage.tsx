
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApi } from '@/lib/client/api';
import { R } from '@/lib/format';
import type { InvoiceRowDTO, ProductDTO, SeriesDTO } from '@/lib/types';
import { useModal } from '@/components/ui/Providers';
import { useShell } from '@/components/layout/AppShell';
import { LineChart } from '@/components/ui/Charts';
import { Empty } from '@/components/ui/Empty';
import { InvoiceRows } from '@/components/invoices/InvoiceRows';
import { ProductModal } from '@/components/modals/ProductModal';
import { ClientModal } from '@/components/modals/ClientModal';
import { AdjustModal } from '@/components/modals/AdjustModal';

interface D {
  today: number;
  todayChange: number | null;
  month: number;
  monthChange: number | null;
  orders: number;
  products: number;
  clients: number;
  lowCount: number;
  lows: ProductDTO[];
  recent: InvoiceRowDTO[];
  series: SeriesDTO;
  bestDay: string | null;
  insight: { name: string; stock: number } | null;
}

function CountUp({ n }: { n: number }) {
  const [v, setV] = useState(0);

  useEffect(() => {
    let s = 0;

    const iv = setInterval(() => {
      s += n / 25;

      if (s >= n) {
        s = n;
        clearInterval(iv);
      }

      setV(s);
    }, 20);

    return () => clearInterval(iv);
  }, [n]);

  return <>{R(v)}</>;
}

const Change = ({
  v,
  label,
}: {
  v: number | null;
  label: string;
}) =>
  v == null ? null : (
    <span
      className="up"
      style={v < 0 ? { color: 'var(--red)' } : undefined}
    >
      {v >= 0 ? '↑' : '↓'} {Math.abs(v)}% {label}
    </span>
  );

export default function DashboardPage() {
  const router = useRouter();
  const m = useModal();
  const { user, business } = useShell();

  const [rng, setRng] = useState(30);

  const { data: d, reload } = useApi<D>(
    `/api/dashboard?days=${rng}`
  );

  const today = useMemo(
    () => new Date().toDateString(),
    []
  );

  if (!d) return null;

  const h = new Date().getHours();

  const greet =
    h < 12
      ? 'Good Morning'
      : h < 17
        ? 'Good Afternoon'
        : 'Good Evening';

  const hasSales = d.series.orders > 0;

  return (
    <>
      <h1 style={{ margin: 0 }}>
        {greet}, {user.name.split(' ')[0]} 👋
      </h1>

      <p style={{ color: 'var(--mut)' }}>
        Here&apos;s what&apos;s happening with {business.name} today ·{' '}
        {today}
      </p>

      <div className="bar">
        <button
          className="p"
          onClick={() => router.push('/billing')}
        >
          New Bill
        </button>

        <button
          onClick={() =>
            m.open(
              <ProductModal
                defaultMin={business.lowStockThreshold}
                onDone={reload}
              />
            )
          }
        >
          Add Product
        </button>

        <button onClick={() => router.push('/reports')}>
          View Reports
        </button>

        <button onClick={() => router.push('/inventory?status=lo')}>
          Low Stock
        </button>

        <button
          onClick={() =>
            m.open(<ClientModal onDone={reload} />)
          }
        >
          Add Client
        </button>
      </div>

      <div className="grid k">
        <div className="card kpi hero">
          <span>Today&apos;s Sales</span>
          <b>
            <CountUp n={d.today} />
          </b>
          <Change v={d.todayChange} label="vs yesterday" />
        </div>

        <div className="card kpi">
          <span>Orders</span>
          <b>{d.orders}</b>
        </div>

        <div className="card kpi">
          <span>Low Stock</span>
          <b style={{ color: 'var(--red)' }}>{d.lowCount}</b>
        </div>

        <div className="card kpi">
          <span>Monthly Revenue</span>
          <b>{R(d.month)}</b>
          <Change v={d.monthChange} label="vs last month" />
        </div>

        <div className="card kpi">
          <span>Products</span>
          <b>{d.products}</b>
        </div>

        <div className="card kpi">
          <span>Customers</span>
          <b>{d.clients}</b>
        </div>
      </div>

      <div className="grid two" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="bar">
            <b style={{ flex: 1 }}>Sales</b>

            {[7, 30, 90, 365].map((x) => (
              <button
                key={x}
                onClick={() => setRng(x)}
              >
                {x === 365
                  ? '1 Year'
                  : x === 90
                    ? '3 Months'
                    : `${x} Days`}
              </button>
            ))}
          </div>

          {hasSales ? (
            <LineChart
              labels={d.series.labels}
              sales={d.series.sales}
              height={260}
            />
          ) : (
            <Empty
              icon="📈"
              title="No sales data yet"
              text="Sales analytics will appear here once your first invoice is generated."
            />
          )}
        </div>

        <div className="card">
          <b>💡 Smart Insights</b>

          {d.insight ? (
            <p>
              {d.insight.name} is{' '}
              {d.insight.stock
                ? `running low (${d.insight.stock} left)`
                : 'out of stock'}
              . Consider restocking.
            </p>
          ) : d.products ? (
            <p>Stock is healthy.</p>
          ) : (
            <p>
              Insights will appear once you add products and record sales.
            </p>
          )}

          {d.bestDay && (
            <p>Highest sales this month: {d.bestDay}.</p>
          )}
        </div>
      </div>

      {/* Recent Transactions and Low Stock */}
      <div className="grid two" style={{ marginTop: 16 }}>
        <div className="card tw">
          <b>Recent Transactions</b>

          <table>
            <tbody>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Status</th>
                <th></th>
              </tr>

              <InvoiceRows
                rows={d.recent}
                empty={
                  <tr>
                    <td colSpan={5}>No transactions yet</td>
                  </tr>
                }
                onChanged={reload}
              />
            </tbody>
          </table>
        </div>

        <div className="card tw">
          <b>Low Stock</b>

          <table>
            <tbody>
              <tr>
                <th>Product</th>
                <th>Stock</th>
                <th>Action</th>
              </tr>

              {d.lows.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.stock}</td>
                  <td>
                    <button
                      className="btn sm"
                      onClick={() =>
                        m.open(
                          <AdjustModal
                            product={p}
                            onDone={reload}
                          />
                        )
                      }
                    >
                      Adjust
                    </button>
                  </td>
                </tr>
              ))}

              {!d.lows.length && (
                <tr>
                  <td colSpan={3}>No low-stock products</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
