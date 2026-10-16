'use client';
import { useState } from 'react';
import { downloadCsv, useApi } from '@/lib/client/api';
import { R } from '@/lib/format';
import type { SeriesDTO } from '@/lib/types';
import { useToast } from '@/components/ui/Providers';
import { DoughnutChart, LineChart } from '@/components/ui/Charts';
import { Empty } from '@/components/ui/Empty';

interface Rep {
  total: number; orders: number; avg: number; tax: number; discount: number; grossProfit: number;
  series: SeriesDTO; categories: { label: string; amount: number }[];
  top: { name: string; units: number; revenue: number; profit: number }[];
}
const RANGES: [string, string][] = [['1', 'Today'], ['7', 'This Week'], ['30', 'This Month'], ['365', 'This Year'], ['custom', 'Custom range']];
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function ReportsPage() {
  const toast = useToast();
  const [rng, setRng] = useState('30');
  const [from, setFrom] = useState(() => iso(new Date(Date.now() - 29 * 864e5)));
  const [to, setTo] = useState(() => iso(new Date()));
  const qs = `range=${rng}${rng === 'custom' ? `&from=${from}&to=${to}` : ''}`;
  const { data: d } = useApi<Rep>(`/api/reports?${qs}`);
  if (!d) return null;
  const none = d.orders === 0;
  const emptyChart = <Empty icon="📊" title="No sales data available" text="Reports will be generated automatically after sales are recorded." />;
  return (
    <>
      <div className="bar">
        <select id="rr" value={rng} onChange={(e) => setRng(e.target.value)} aria-label="Report period">
          {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {rng === 'custom' && (
          <>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          </>
        )}
        <button className="p" onClick={() => downloadCsv(`/api/reports/export?${qs}`, 'report').then(() => toast('CSV exported')).catch((e) => toast(e.message, true))}>Export CSV</button>
        <button onClick={() => window.print()}>Print</button>
      </div>
      <div className="grid k">
        <div className="card kpi"><span>Total Sales</span><b>{R(d.total)}</b></div>
        <div className="card kpi"><span>Orders</span><b>{d.orders}</b></div>
        <div className="card kpi"><span>Avg Order</span><b>{R(d.avg)}</b></div>
        <div className="card kpi"><span>Tax</span><b>{R(d.tax)}</b></div>
        <div className="card kpi"><span>Discount</span><b>{R(d.discount)}</b></div>
        <div className="card kpi"><span>Gross Profit</span><b>{R(d.grossProfit)}</b></div>
      </div>
      <div className="grid two" style={{ marginTop: 16 }}>
        <div className="card">{none ? emptyChart : <LineChart labels={d.series.labels} sales={d.series.sales} profit={d.series.profit} height={280} />}</div>
        <div className="card">{none ? emptyChart : <DoughnutChart labels={d.categories.map((c) => c.label)} data={d.categories.map((c) => c.amount)} />}</div>
      </div>
      <div className="card tw" style={{ marginTop: 16 }}>
        <b>Top Products</b>
        <table>
          <tbody>
            {d.top.map((p) => (
              <tr key={p.name}><td>{p.name}</td><td>{p.units} units</td><td>{R(p.revenue)}</td><td>Profit {R(p.profit)}</td></tr>
            ))}
            {!d.top.length && <tr><td><Empty icon="🏆" title="No sales data yet" text="Top-selling products will appear here after your first sale." /></td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
