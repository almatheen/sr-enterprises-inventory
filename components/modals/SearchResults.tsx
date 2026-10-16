'use client';
import { useRouter } from 'next/navigation';
import { useApi } from '@/lib/client/api';
import { useModal } from '@/components/ui/Providers';
import { InvoiceModal } from '@/components/invoices/InvoiceModal';
import { ClientViewModal } from '@/components/clients/ClientViewModal';

interface Res {
  products: { total: number; rows: { id: string; name: string }[] };
  invoices: { total: number; rows: { id: string }[] };
  clients: { total: number; rows: { id: string; name: string; phone: string }[] };
}

export function SearchResults({ q }: { q: string }) {
  const m = useModal();
  const router = useRouter();
  const { data, error } = useApi<Res>(`/api/search?q=${encodeURIComponent(q)}`);
  const link = { cursor: 'pointer' } as const;
  return (
    <>
      <h3>Search results</h3>
      {error && <p>{error}</p>}
      {data && (
        <>
          <b>Products ({data.products.total})</b>
          {data.products.rows.map((p) => (
            <p key={p.id} style={link} onClick={() => { m.close(); router.push(`/inventory?q=${encodeURIComponent(p.id)}`); }}>{p.name} · {p.id}</p>
          ))}
          <b>Invoices ({data.invoices.total})</b>
          {data.invoices.rows.map((i) => (
            <p key={i.id} style={link} onClick={() => m.open(<InvoiceModal id={i.id} />)}>{i.id}</p>
          ))}
          <b>Clients ({data.clients.total})</b>
          {data.clients.rows.map((c) => (
            <p key={c.id} style={link} onClick={() => m.open(<ClientViewModal id={c.id} />)}>{c.name} · {c.phone}</p>
          ))}
        </>
      )}
      <button onClick={m.close}>Close</button>
    </>
  );
}
