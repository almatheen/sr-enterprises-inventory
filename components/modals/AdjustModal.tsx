'use client';
import { useState } from 'react';
import { api } from '@/lib/client/api';
import { notifyStockChanged } from '@/lib/client/events';
import type { ProductDTO } from '@/lib/types';
import { useModal, useToast } from '@/components/ui/Providers';

const TYPES: [string, string][] = [
  ['ADD', 'Add Stock'],
  ['REMOVE', 'Remove Stock'],
  ['DAMAGE', 'Damage'],
  ['RETURN', 'Return'],
  ['CORRECTION', 'Correction (set stock to)']
];

export function AdjustModal({ product, preset, onDone }: { product: ProductDTO; preset?: 'restock'; onDone?: () => void }) {
  const m = useModal();
  const toast = useToast();
  const [type, setType] = useState('ADD');
  const [qty, setQty] = useState(preset ? '20' : '1');
  const [reason, setReason] = useState(preset ? 'Restock' : '');
  const [busy, setBusy] = useState(false);

  async function apply() {
    if (!reason.trim()) return toast('Reason required', true);
    setBusy(true);
    try {
      await api(`/api/products/${product.id}/adjust`, { method: 'POST', body: { type, quantity: +qty, reason } });
      m.close();
      toast(preset ? `Restocked +${qty} units` : 'Stock updated');
      notifyStockChanged();
      onDone?.();
    } catch (e) {
      toast((e as Error).message, true);
      setBusy(false);
    }
  }
  return (
    <>
      <h3>Adjust Stock</h3>
      <p style={{ margin: '0 0 10px', color: 'var(--mut)' }}>{product.name} · {product.id} · Current stock {product.stock}</p>
      <div className="f">
        <div>
          <label htmlFor="at">Type</label>
          <select id="at" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="aq">Quantity</label>
          <input id="aq" type="number" min={type === 'CORRECTION' ? 0 : 1} value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
      </div>
      <label htmlFor="ar" style={{ fontSize: 12, color: 'var(--mut)' }}>Reason</label>
      <input id="ar" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="bar" style={{ marginTop: 12 }}>
        <button onClick={m.close}>Cancel</button>
        <button className="p" onClick={apply} disabled={busy}>Apply</button>
      </div>
    </>
  );
}
