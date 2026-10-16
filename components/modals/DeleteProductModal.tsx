'use client';
import { api } from '@/lib/client/api';
import { notifyStockChanged } from '@/lib/client/events';
import { useModal, useToast } from '@/components/ui/Providers';

export function DeleteProductModal({ id, onDone }: { id: string; onDone?: () => void }) {
  const m = useModal();
  const toast = useToast();
  async function del() {
    try {
      await api(`/api/products/${id}`, { method: 'DELETE' });
      m.close();
      toast('Product deleted');
      notifyStockChanged();
      onDone?.();
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  return (
    <>
      <h3>Delete Product?</h3>
      <p>This action will remove the product from your inventory.</p>
      <div className="bar">
        <button onClick={m.close}>Cancel</button>
        <button className="d" onClick={del}>Delete Product</button>
      </div>
    </>
  );
}
