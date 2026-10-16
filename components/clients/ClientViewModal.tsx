'use client';
import { useApi } from '@/lib/client/api';
import { R } from '@/lib/format';
import type { ClientDTO, InvoiceRowDTO } from '@/lib/types';
import { useModal } from '@/components/ui/Providers';
import { InvoiceRows } from '@/components/invoices/InvoiceRows';
import { ClientModal } from '@/components/modals/ClientModal';

export function ClientViewModal({ id, onChanged }: { id: string; onChanged?: () => void }) {
  const m = useModal();
  const { data, error, reload } = useApi<{ client: ClientDTO; invoices: InvoiceRowDTO[] }>(`/api/clients/${id}`);
  const c = data?.client;
  return (
    <>
      <h3>{c?.name ?? 'Client'}</h3>
      {error && <p>{error}</p>}
      {c && (
        <>
          <p style={{ color: 'var(--mut)' }}>
            {c.phone}{c.email && ` · ${c.email}`}{c.gstin && ` · GSTIN ${c.gstin}`}{c.addr && ` · ${c.addr}`}
          </p>
          <div className="grid k">
            <div className="card kpi"><span>Purchases</span><b>{R(c.purchases)}</b></div>
            <div className="card kpi"><span>Orders</span><b>{c.orders}</b></div>
            <div className="card kpi"><span>Outstanding</span><b>{R(c.credit)}</b></div>
          </div>
          <div className="tw" style={{ marginTop: 12 }}>
            <table>
              <tbody>
                <tr><th>Invoice</th><th>Customer</th><th>Items</th><th>Amount</th><th>Payment</th><th>Date</th><th>Status</th><th></th></tr>
                <InvoiceRows rows={data.invoices} empty="📄 No invoices yet." onChanged={() => { reload(); onChanged?.(); }} />
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="bar" style={{ marginTop: 12 }}>
        {c && <button onClick={() => m.open(<ClientModal client={c} onDone={onChanged} />)}>Edit</button>}
        <button onClick={m.close}>Close</button>
      </div>
    </>
  );
}
