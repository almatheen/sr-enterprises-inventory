'use client';
import { api } from '@/lib/client/api';
import { R, istDate } from '@/lib/format';
import type { InvoiceRowDTO } from '@/lib/types';
import { useModal, useToast } from '@/components/ui/Providers';
import { InvoiceModal } from './InvoiceModal';

export function InvoiceRows({ rows, empty, onChanged }: { rows: InvoiceRowDTO[]; empty: React.ReactNode; onChanged?: () => void }) {
  const m = useModal();
  const toast = useToast();
  async function pay(id: string) {
    try { await api(`/api/invoices/${encodeURIComponent(id)}/pay`, { method: 'POST' }); toast('Invoice marked as paid'); onChanged?.(); }
    catch (e) { toast((e as Error).message, true); }
  }
  if (!rows.length) return <tr><td colSpan={8}>{empty}</td></tr>;
  return (
    <>
      {rows.map((i) => (
        <tr key={i.id}>
          <td>{i.id}</td>
          <td>{i.name || 'Walk-in'}</td>
          <td>{i.items}</td>
          <td>{R(i.gt)}</td>
          <td>{i.pay}</td>
          <td>{istDate(i.date)}</td>
          <td><span className={`tag ${i.status === 'Paid' ? 'ok' : 'lo'}`}>{i.status}</span></td>
          <td style={{ whiteSpace: 'nowrap' }}>
            <button onClick={() => m.open(<InvoiceModal id={i.id} />)}>View</button>
            {i.status !== 'Paid' && <> <button onClick={() => pay(i.id)}>Mark Paid</button></>}
          </td>
        </tr>
      ))}
    </>
  );
}
