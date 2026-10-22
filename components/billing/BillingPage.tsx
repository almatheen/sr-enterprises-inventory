'use client';

import { useMemo, useState } from 'react';

import { api, useApi, useDebounced } from '@/lib/client/api';
import { calculate } from '@/lib/billing/calc';
import { GST_RATES, PAYMENT_METHODS } from '@/lib/constants';
import { R } from '@/lib/format';
import type { InvoiceDTO, Paged, ProductDTO } from '@/lib/types';
import { notifyStockChanged } from '@/lib/client/events';
import { useModal, useToast } from '@/components/ui/Providers';
import { InvoiceModal } from '@/components/invoices/InvoiceModal';

interface Line {
  p: ProductDTO;
  qty: number;
}

const initBill = {
  dt: 'pct' as 'pct' | 'amt',
  dv: '0',
  gst: null as number | null,
  inter: false,
  pay: 'Cash',
  cn: '',
  cp: '',
  sv: true,
  email: '',
  gstin: '',
  addr: '',
};

export default function BillingPage() {
  const toast = useToast();
  const m = useModal();

  const [q, setQ] = useState('');
  const dq = useDebounced(q, 200);

  const { data: res, reload } = useApi<Paged<ProductDTO>>(
    `/api/products?q=${encodeURIComponent(dq)}&pageSize=12`
  );

  const [cart, setCart] = useState<Line[]>([]);
  const [bill, setBill] = useState(initBill);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof typeof initBill>(
    k: K,
    v: (typeof initBill)[K]
  ) => {
    setBill((b) => ({ ...b, [k]: v }));
  };

  const c = useMemo(
    () =>
      calculate(
        cart.map((l) => ({
          id: l.p.id,
          name: l.p.name,
          price: l.p.price,
          gst: l.p.gst,
          qty: l.qty,
        })),
        {
          gstOverride: bill.gst,
          discountType: bill.dt,
          discountValue: +bill.dv || 0,
          interState: bill.inter,
        }
      ),
    [cart, bill.gst, bill.dt, bill.dv, bill.inter]
  );

  function add(p: ProductDTO) {
    if (p.stock <= 0) {
      return toast('Out of stock', true);
    }

    const ex = cart.find((x) => x.p.id === p.id);

    if (ex) {
      if (ex.qty < p.stock) {
        setCart(
          cart.map((x) =>
            x.p.id === p.id ? { ...x, qty: x.qty + 1 } : x
          )
        );
      } else {
        toast('Only ' + p.stock + ' in stock', true);
      }
    } else {
      setCart([...cart, { p, qty: 1 }]);
    }
  }

  function setQty(id: string, raw: number | string) {
    const l = cart.find((x) => x.p.id === id);
    if (!l) return;

    let v = Math.floor(+raw);

    if (!Number.isFinite(v) || v < 0) {
      return toast('Invalid quantity', true);
    }

    if (v > l.p.stock) {
      toast('Only ' + l.p.stock + ' in stock', true);
      v = l.p.stock;
    }

    setCart(
      cart
        .map((x) => (x.p.id === id ? { ...x, qty: v } : x))
        .filter((x) => x.qty > 0)
    );
  }

  async function lookup() {
    if (!/^\d{10}$/.test(bill.cp) || bill.cn) return;

    try {
      const r = await api<
        Paged<{
          name: string;
          phone: string;
          email: string;
          gstin: string;
          addr: string;
        }>
      >(`/api/clients?q=${bill.cp}`);

      const hit = r.rows.find((x) => x.phone === bill.cp);

      if (hit) {
        setBill((b) => ({
          ...b,
          cn: hit.name,
          email: hit.email,
          gstin: hit.gstin,
          addr: hit.addr,
        }));
      }
    } catch {
      // Customer lookup is optional.
    }
  }

  async function generate() {
    if (!cart.length) {
      return toast('Cart is empty', true);
    }

    // Customer name and mobile are required on every sale.
    if (!bill.cn.trim()) {
      return toast('Enter the customer name', true);
    }

    if (!/^\d{10}$/.test(bill.cp)) {
      return toast('Enter a valid 10-digit mobile number', true);
    }

    setBusy(true);

    try {
      const r = await api<{
        invoice: InvoiceDTO;
        lowStock: string[];
      }>('/api/invoices', {
        method: 'POST',
        body: {
          items: cart.map((l) => ({
            productId: l.p.id,
            quantity: l.qty,
          })),
          discountType: bill.dt,
          discountValue: +bill.dv || 0,
          gstOverride: bill.gst,
          interState: bill.inter,
          paymentMethod: bill.pay,
          saveCustomer: bill.sv,
          customer: {
            name: bill.cn.trim(),
            phone: bill.cp,
            email: bill.email,
            gstin: bill.gstin,
            address: bill.addr,
          },
        },
      });

      setCart([]);
      setBill((b) => ({ ...initBill, pay: b.pay }));

      toast('Invoice generated successfully');

      r.lowStock.forEach((n) =>
        toast('Low stock alert: ' + n, true)
      );

      notifyStockChanged();
      reload();
      m.open(<InvoiceModal id={r.invoice.id} />);
    } catch (e) {
      toast((e as Error).message, true);
      reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid pos">
      <div className="card">
        <input
          id="bq"
          placeholder="Search name, SKU, ID, barcode…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          aria-label="Search products"
        />

        <div id="bl" style={{ marginTop: 10 }}>
          {res?.rows.map((p) => (
            <div
              className="item"
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => add(p)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') add(p);
              }}
            >
              <span>
                {p.name}
                <br />
                <small>
                  {p.id} · Stock {p.stock}
                </small>
              </span>
              <b>{R(p.price)}</b>
            </div>
          ))}

          {res && !res.rows.length &&
            (!dq
              ? '📦 No products yet. Add products in Inventory to start billing.'
              : '🔍 No products found')}
        </div>
      </div>

      <div className="card" id="bc">
        <b>Current Bill</b>

        <div className="tw">
          <table>
            <tbody>
              {c.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.name}</td>
                  <td>
                    <div className="q">
                      <button
                        aria-label="Decrease quantity"
                        onClick={() => setQty(l.id, l.qty - 1)}
                      >
                        -
                      </button>

                      <input
                        key={l.qty}
                        aria-label={`Quantity for ${l.name}`}
                        defaultValue={l.qty}
                        onBlur={(e) => {
                          if (+e.target.value !== l.qty) {
                            setQty(l.id, e.target.value);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                      />

                      <button
                        aria-label="Increase quantity"
                        onClick={() => setQty(l.id, l.qty + 1)}
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td>{R(l.amt)}</td>
                </tr>
              ))}

              {!c.lines.length && (
                <tr>
                  <td>🛒 Cart is empty. Click a product to add.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bar" style={{ marginTop: 10 }}>
          <select
            value={bill.dt}
            onChange={(e) =>
              set('dt', e.target.value as 'pct' | 'amt')
            }
            aria-label="Discount type"
          >
            <option value="pct">Discount %</option>
            <option value="amt">Discount ₹</option>
          </select>

          <input
            type="number"
            min={0}
            value={bill.dv}
            onChange={(e) => set('dv', e.target.value)}
            aria-label="Discount value"
          />

          <select
            value={bill.gst === null ? 'item' : String(bill.gst)}
            onChange={(e) =>
              set(
                'gst',
                e.target.value === 'item'
                  ? null
                  : Number(e.target.value)
              )
            }
            aria-label="GST rate"
            title="Choose a GST rate or use each product's own GST"
          >
            <option value="item">Item GST</option>
            {GST_RATES.filter((rate) => rate <= 18).map((rate) => (
              <option key={rate} value={rate}>
                {rate}% GST
              </option>
            ))}
          </select>

          <select
            value={bill.inter ? '1' : '0'}
            onChange={(e) => set('inter', e.target.value === '1')}
            aria-label="Tax type"
          >
            <option value="0">CGST+SGST</option>
            <option value="1">IGST</option>
          </select>
        </div>

        <div className="tot">
          <div>
            <span>Subtotal</span>
            {R(c.sub)}
          </div>

          <div>
            <span>Discount</span>
            -{R(c.disc)}
          </div>

          {bill.inter ? (
            <div>
              <span>IGST</span>
              {R(c.igst)}
            </div>
          ) : (
            <>
              <div>
                <span>CGST</span>
                {R(c.cgst)}
              </div>
              <div>
                <span>SGST</span>
                {R(c.sgst)}
              </div>
            </>
          )}

          <div>
            <span>Round off</span>
            {c.round.toFixed(2)}
          </div>

          <div className="g">
            <span>Grand Total</span>
            {R(c.gt)}
          </div>
        </div>

        <div className="f">
          <input
            placeholder="Customer name *"
            value={bill.cn}
            onChange={(e) => set('cn', e.target.value)}
            required
            aria-required="true"
            aria-label="Customer name (required)"
          />

          <input
            placeholder="Mobile (10 digits) *"
            value={bill.cp}
            onChange={(e) =>
              set('cp', e.target.value.replace(/\D/g, '').slice(0, 10))
            }
            onBlur={lookup}
            inputMode="numeric"
            maxLength={10}
            required
            aria-required="true"
            aria-label="Customer mobile (required)"
          />
        </div>

        <details className="more">
          <summary>More customer details</summary>

          <div className="f" style={{ marginTop: 6 }}>
            <input
              placeholder="Email"
              value={bill.email}
              onChange={(e) => set('email', e.target.value)}
              aria-label="Customer email"
            />

            <input
              placeholder="GSTIN"
              value={bill.gstin}
              onChange={(e) =>
                set('gstin', e.target.value.toUpperCase())
              }
              aria-label="Customer GSTIN"
            />

            <input
              placeholder="Address"
              value={bill.addr}
              onChange={(e) => set('addr', e.target.value)}
              aria-label="Customer address"
            />
          </div>
        </details>

        <div className="bar" style={{ marginTop: 8 }}>
          <select
            value={bill.pay}
            onChange={(e) => set('pay', e.target.value)}
            aria-label="Payment method"
          >
            {PAYMENT_METHODS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>

          <label>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={bill.sv}
              onChange={(e) => set('sv', e.target.checked)}
            />{' '}
            Save customer
          </label>
        </div>

        {bill.pay === 'UPI' && (
          <div style={{ textAlign: 'center' }}>
            ▦▦ Collect UPI payment ▦▦
          </div>
        )}

        <button
          className="p"
          style={{ width: '100%', marginTop: 8 }}
          onClick={generate}
          disabled={busy}
        >
          {busy ? 'Generating…' : 'Generate Invoice'}
        </button>
      </div>
    </div>
  );
}