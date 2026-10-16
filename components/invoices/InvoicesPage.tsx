'use client';
import { useEffect, useState } from 'react';
import { useApi, useDebounced } from '@/lib/client/api';
import type { InvoiceRowDTO, Paged } from '@/lib/types';
import { Empty } from '@/components/ui/Empty';
import { Pager } from '@/components/ui/Pager';
import { InvoiceRows } from './InvoiceRows';

export default function InvoicesPage() {
  const [q, setQ] = useState('');
  const [pay, setPay] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  useEffect(() => setPage(1), [dq, pay]);
  const { data, reload } = useApi<Paged<InvoiceRowDTO>>(`/api/invoices?q=${encodeURIComponent(dq)}&payment=${pay}&page=${page}`);
  if (!data) return null;
  const filtered = !!(dq || pay);
  return (
    <>
      <div className="bar">
        <input id="iq" placeholder="Search invoice / customer" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search invoices" />
        <select id="ip" value={pay} onChange={(e) => setPay(e.target.value)} aria-label="Payment filter">
          <option value="">All payments</option><option>Cash</option><option>UPI</option><option>Card</option><option>Credit</option><option>Mixed</option>
        </select>
      </div>
      <div className="card tw">
        <table>
          <tbody id="ib">
            <tr><th>Invoice</th><th>Customer</th><th>Items</th><th>Amount</th><th>Payment</th><th>Date</th><th>Status</th><th></th></tr>
            <InvoiceRows
              rows={data.rows}
              onChanged={reload}
              empty={filtered ? <Empty icon="📄" title="No invoices found" text="No invoices match your search." /> : <Empty icon="📄" title="No invoices yet" text="Generated invoices will appear here." />}
            />
          </tbody>
        </table>
        <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
      </div>
    </>
  );
}
