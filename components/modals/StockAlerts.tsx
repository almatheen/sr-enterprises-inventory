'use client';
import { useApi } from '@/lib/client/api';
import type { ProductDTO } from '@/lib/types';
import { useModal } from '@/components/ui/Providers';
import { AdjustModal } from './AdjustModal';

export function StockAlerts() {
  const m = useModal();
  const { data, error } = useApi<{ count: number; rows: ProductDTO[] }>('/api/notifications');
  return (
    <>
      <h3>Stock Alerts</h3>
      {error && <p>{error}</p>}
      {data && data.rows.map((p) => (
        <p key={p.id}>
          {p.stock ? '⚠️' : '🔴'} {p.name}: {p.stock} left{' '}
          <button onClick={() => m.open(<AdjustModal product={p} preset="restock" />)}>Restock</button>
        </p>
      ))}
      {data && !data.rows.length && 'All good'}
      <button onClick={m.close}>Close</button>
    </>
  );
}
