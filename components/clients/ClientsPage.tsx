'use client';
import { useEffect, useState } from 'react';
import { useApi, useDebounced } from '@/lib/client/api';
import { R } from '@/lib/format';
import type { ClientDTO, Paged } from '@/lib/types';
import { useModal } from '@/components/ui/Providers';
import { Empty } from '@/components/ui/Empty';
import { Pager } from '@/components/ui/Pager';
import { ClientModal } from '@/components/modals/ClientModal';
import { ClientViewModal } from './ClientViewModal';

export default function ClientsPage() {
  const m = useModal();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  useEffect(() => setPage(1), [dq]);
  const { data, reload } = useApi<Paged<ClientDTO>>(`/api/clients?q=${encodeURIComponent(dq)}&page=${page}`);
  if (!data) return null;
  const add = () => m.open(<ClientModal onDone={reload} />);
  return (
    <>
      <div className="bar">
        <input placeholder="Search name, phone, email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search clients" />
        <button className="p" onClick={add}>+ Add Client</button>
      </div>
      <div className="card tw">
        <table>
          <tbody>
            <tr><th>Name</th><th>Phone</th><th>Email</th><th>Purchases</th><th>Outstanding</th><th></th></tr>
            {data.rows.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td><td>{c.phone}</td><td>{c.email}</td>
                <td>{R(c.purchases)} ({c.orders})</td>
                <td>{R(c.credit)}</td>
                <td><button onClick={() => m.open(<ClientViewModal id={c.id} onChanged={reload} />)}>View</button></td>
              </tr>
            ))}
            {!data.rows.length && (
              <tr><td colSpan={6}>
                {dq ? <Empty icon="👥" title="No clients found" text="No clients match your search." /> : (
                  <Empty icon="👥" title="No clients yet" text="Customers will automatically appear here when saved during billing.">
                    <button className="p" onClick={add}>+ Add Client</button>
                  </Empty>
                )}
              </td></tr>
            )}
          </tbody>
        </table>
        <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
      </div>
    </>
  );
}
