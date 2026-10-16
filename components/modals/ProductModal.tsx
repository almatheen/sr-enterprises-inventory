'use client';
import { useState } from 'react';
import { api } from '@/lib/client/api';
import { notifyStockChanged } from '@/lib/client/events';
import { CATS, GST_RATES } from '@/lib/constants';
import type { ProductDTO } from '@/lib/types';
import { useModal, useToast } from '@/components/ui/Providers';

type F = Record<string, string>;

export function ProductModal({ product, defaultMin = 10, onDone }: { product?: ProductDTO; defaultMin?: number; onDone?: () => void }) {
  const m = useModal();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<F>({
    name: product?.name ?? '',
    category: product?.cat ?? 'MC',
    sku: product?.sku ?? '',
    barcode: product?.barcode ?? '',
    cost: String(product?.cost ?? 0),
    price: String(product?.price ?? 0),
    gst: String(product?.gst ?? 18),
    stock: String(product?.stock ?? 0),
    min: String(product?.min ?? defaultMin),
    sup: product?.sup ?? '',
    brand: product?.brand ?? '',
    description: product?.description ?? ''
  });
  const set = (k: string) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const field = (k: string, label: string, type = 'text') => (
    <div>
      <label htmlFor={`f_${k}`}>{label}</label>
      <input id={`f_${k}`} type={type} value={f[k]} onChange={set(k)} />
    </div>
  );

  async function save() {
    const n = (k: string) => +f[k];
    if (!f.name.trim()) return toast('Product name required', true);
    if (!(n('price') > 0) || n('cost') < 0) return toast('Invalid price', true);
    if (n('stock') < 0 || n('min') < 0) return toast('Stock cannot be negative', true);
    if (!(GST_RATES as readonly number[]).includes(n('gst'))) return toast('Invalid GST', true);
    setBusy(true);
    try {
      await api(product ? `/api/products/${product.id}` : '/api/products', {
        method: product ? 'PATCH' : 'POST',
        body: {
          name: f.name, category: f.category, sku: f.sku, barcode: f.barcode, brand: f.brand, description: f.description,
          purchasePrice: n('cost'), sellingPrice: n('price'), gst: n('gst'), stock: n('stock'), minimumStock: n('min'), supplier: f.sup
        }
      });
      m.close();
      toast(product ? 'Product updated successfully.' : 'Product added successfully.');
      if (n('stock') <= n('min')) toast('Low stock alert: ' + f.name, true);
      notifyStockChanged();
      onDone?.();
    } catch (e) {
      toast((e as Error).message, true);
      setBusy(false);
    }
  }

  return (
    <>
      <h3>{product ? 'Edit' : 'Add'} Product</h3>
      <div className="f">
        {field('name', 'Product Name')}
        <div>
          <label htmlFor="f_cat">Category</label>
          <select id="f_cat" value={f.category} onChange={set('category')} disabled={!!product} title={product ? 'Category is part of the product ID and cannot be changed' : undefined}>
            {Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {field('sku', 'SKU')}
        {field('barcode', 'Barcode')}
        {field('cost', 'Purchase Price', 'number')}
        {field('price', 'Selling Price', 'number')}
        {field('gst', 'GST %', 'number')}
        {field('stock', 'Stock', 'number')}
        {field('min', 'Minimum Stock', 'number')}
        {field('sup', 'Supplier')}
        {field('brand', 'Brand')}
        {field('description', 'Description')}
      </div>
      <p>ID: <b>{product?.id || 'auto-generated'}</b></p>
      <div className="bar">
        <button onClick={m.close}>Cancel</button>
        <button className="p" onClick={save} disabled={busy}>Save Product</button>
      </div>
    </>
  );
}
