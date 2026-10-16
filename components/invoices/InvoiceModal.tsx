'use client';
import { useEffect, useRef, useState } from 'react';
import { useApi } from '@/lib/client/api';
import { downloadInvoicePdf, printInvoice } from '@/lib/client/pdf';
import type { BusinessDTO, InvoiceDTO } from '@/lib/types';
import { useModal, useToast } from '@/components/ui/Providers';
import { InvoiceView } from './InvoiceView';

export function InvoiceModal({ id, format }: { id: string; format?: 'a4' | 'th' }) {
  const m = useModal();
  const toast = useToast();
  const inv = useApi<InvoiceDTO>(`/api/invoices/${encodeURIComponent(id)}`);
  const biz = useApi<BusinessDTO>('/api/business');
  const [fmt, setFmt] = useState<'a4' | 'th'>(format ?? 'a4');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!format) { const s = localStorage.srf; if (s === 'th' || s === 'a4') setFmt(s); }
  }, [format]);
  const pick = (f: 'a4' | 'th') => { setFmt(f); localStorage.srf = f; };

  async function pdf() {
    if (!ref.current) return;
    setBusy(true);
    try { await downloadInvoicePdf(ref.current, fmt, id); }
    catch { toast('Could not create the PDF. Please try Print instead.', true); }
    finally { setBusy(false); }
  }
  function print() {
    try { printInvoice(fmt); } catch { toast('Printing failed. Check your printer settings.', true); }
  }

  return (
    <>
      <div className="bar">
        <button onClick={() => pick('a4')}>A4</button>
        <button onClick={() => pick('th')}>Thermal</button>
        <button className="p" onClick={print} disabled={!inv.data}>Print Invoice</button>
        <button onClick={pdf} disabled={!inv.data || busy}>{busy ? 'Preparing…' : 'Download PDF'}</button>
        <button onClick={m.close}>Close</button>
      </div>
      <div id="pr" ref={ref}>
        {inv.error && <p>{inv.error}</p>}
        {inv.data && biz.data && <InvoiceView inv={inv.data} biz={biz.data} fmt={fmt} />}
      </div>
    </>
  );
}
