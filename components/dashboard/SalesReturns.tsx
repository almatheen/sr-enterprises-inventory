'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { notifyStockChanged } from '@/lib/client/events';
import { useShell } from '@/components/layout/AppShell';

type Condition = 'RESALABLE' | 'NEEDS_INSPECTION' | 'DAMAGED';
type ReturnSource = 'INVOICE' | 'DIRECT';

interface EligibleItem {
  invoiceItemId: string;
  productId: string | null;
  name: string;
  sku: string;
  quantitySold: number;
  quantityReturned: number;
  quantityReturnable: number;
  price: number;
}

interface EligibleInvoice {
  invoiceNumber: string;
  customerName: string;
  customerPhone: string;
  date: string;
  items: EligibleItem[];
}

interface ProductSearchResult {
  id: string;
  uniqueId?: string;
  name: string;
  sku: string;
  stock?: number;
  sellingPrice?: number | string;
  category?: string;
}

interface ReturnActivity {
  id: string;
  returnNumber: string;
  customerName: string;
  reason: string;
  status: string;
  createdAt: string;
  invoice: { invoiceNumber: string; customerName: string } | null;
  items: {
    id: string;
    productName: string;
    sku?: string;
    quantity: number;
    condition: string;
    restocked: boolean;
  }[];
}

interface DamagedItem {
  id: string;
  returnNumber: string;
  invoiceNumber: string | null;
  customerName: string;
  productName: string;
  sku: string;
  quantity: number;
  condition: string;
  resolution: string;
  reason: string;
  refundAmount: number;
  approvedAt: string | null;
}

interface SelectedReturnItem {
  quantity: number;
  condition: Condition;
}

const reasons = [
  ['CUSTOMER_CHANGED_MIND', 'Customer changed mind'],
  ['WRONG_PRODUCT', 'Wrong product supplied'],
  ['DAMAGED_PRODUCT', 'Damaged product'],
  ['MANUFACTURING_DEFECT', 'Manufacturing defect'],
  ['NOT_WORKING', 'Product not working'],
  ['INCORRECT_SIZE_OR_MODEL', 'Incorrect size or model'],
  ['OTHER', 'Other'],
] as const;

const conditions: { value: Condition; label: string }[] = [
  { value: 'RESALABLE', label: 'Good — resalable' },
  { value: 'NEEDS_INSPECTION', label: 'Needs inspection' },
  { value: 'DAMAGED', label: 'Damaged — supplier return' },
];

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  marginTop: 5,
};

const panelStyle: React.CSSProperties = {
  border: '1px solid var(--border, #ddd)',
  borderRadius: 10,
  padding: 12,
  minWidth: 0,
  width: '100%',
  boxSizing: 'border-box',
};

function statusLabel(status: string) {
  if (status === 'RECORDED') return 'Pending approval';
  if (status === 'COMPLETED') return 'Approved';
  if (status === 'CANCELLED') return 'Cancelled';
  return status;
}

function getProductRows(payload: unknown): ProductSearchResult[] {
  if (Array.isArray(payload)) return payload as ProductSearchResult[];

  if (!payload || typeof payload !== 'object') return [];
  const value = payload as {
    data?: unknown;
    items?: unknown;
    rows?: unknown;
  };

  if (Array.isArray(value.items)) return value.items as ProductSearchResult[];
  if (Array.isArray(value.rows)) return value.rows as ProductSearchResult[];

  if (value.data && typeof value.data === 'object') {
    const data = value.data as { items?: unknown; rows?: unknown };
    if (Array.isArray(data.items)) return data.items as ProductSearchResult[];
    if (Array.isArray(data.rows)) return data.rows as ProductSearchResult[];
  }

  if (Array.isArray(value.data)) return value.data as ProductSearchResult[];
  return [];
}

export function SalesReturns() {
  const { user } = useShell();
  const isAdmin = user.role === 'ADMIN';
  const [activities, setActivities] = useState<ReturnActivity[]>([]);
  const [invoices, setInvoices] = useState<EligibleInvoice[]>([]);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [source, setSource] = useState<ReturnSource>('INVOICE');
  const [selectedInvoiceItems, setSelectedInvoiceItems] = useState<
    Record<string, SelectedReturnItem>
  >({});
  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState<ProductSearchResult[]>([]);
  const [selectedDirectItems, setSelectedDirectItems] = useState<
    Record<string, SelectedReturnItem & { product: ProductSearchResult }>
  >({});
  const [reason, setReason] = useState('CUSTOMER_CHANGED_MIND');
  const [notes, setNotes] = useState('');
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'PENDING'>('ALL');
  const [damaged, setDamaged] = useState<DamagedItem[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [returnsResponse, invoicesResponse, damagedResponse] = await Promise.all([
        fetch('/api/returns?limit=50'),
        fetch('/api/returns/eligible'),
        fetch('/api/returns/damaged?limit=100').catch(() => null),
      ]);
      const returnsJson = await returnsResponse.json();
      const invoicesJson = await invoicesResponse.json();

      if (!returnsResponse.ok) {
        throw new Error(returnsJson.error?.message || 'Could not load returns.');
      }
      if (!invoicesResponse.ok) {
        throw new Error(invoicesJson.error?.message || 'Could not load invoices.');
      }

      setActivities(returnsJson.data ?? []);
      setInvoices(invoicesJson.data ?? []);

      if (damagedResponse && damagedResponse.ok) {
        const damagedJson = await damagedResponse.json();
        setDamaged(damagedJson.data ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load sales returns.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (source !== 'DIRECT') return;
    const query = productQuery.trim();

    if (query.length < 2) {
      setProductResults([]);
      setSearchingProducts(false);
      return;
    }

    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchingProducts(true);
      try {
        const response = await fetch(
          `/api/returns/products?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        const json = await response.json();

        if (!response.ok) {
          throw new Error(json.error?.message || 'Could not search products.');
        }
        if (active) setProductResults(getProductRows(json));
      } catch (e) {
        if (active && !(e instanceof DOMException && e.name === 'AbortError')) {
          setError(e instanceof Error ? e.message : 'Could not search products.');
        }
      } finally {
        if (active) setSearchingProducts(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [productQuery, source]);

  const selectedInvoice = useMemo(
    () => invoices.find((invoice) => invoice.invoiceNumber === invoiceNumber),
    [invoices, invoiceNumber],
  );

  function resetSelection() {
    setInvoiceNumber('');
    setSelectedInvoiceItems({});
    setProductQuery('');
    setProductResults([]);
    setSelectedDirectItems({});
    setNotes('');
    setReason('CUSTOMER_CHANGED_MIND');
  }

  function changeSource(next: ReturnSource) {
    setSource(next);
    resetSelection();
    setError('');
    setSuccess('');
  }

  function selectInvoice(value: string) {
    setInvoiceNumber(value);
    setSelectedInvoiceItems({});
    setError('');
    setSuccess('');
  }

  function toggleInvoiceItem(item: EligibleItem) {
    if (item.quantityReturnable <= 0) return;
    setSelectedInvoiceItems((current) => {
      const next = { ...current };
      if (next[item.invoiceItemId]) delete next[item.invoiceItemId];
      else next[item.invoiceItemId] = { quantity: 1, condition: 'RESALABLE' };
      return next;
    });
  }

  function updateInvoiceItem(id: string, patch: Partial<SelectedReturnItem>) {
    setSelectedInvoiceItems((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
  }

  function addDirectProduct(product: ProductSearchResult) {
    setSelectedDirectItems((current) => ({
      ...current,
      [product.id]: current[product.id] ?? {
        product,
        quantity: 1,
        condition: 'RESALABLE',
      },
    }));
    setProductQuery('');
    setProductResults([]);
    setError('');
  }

  function updateDirectItem(id: string, patch: Partial<SelectedReturnItem>) {
    setSelectedDirectItems((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
  }

  function removeDirectProduct(id: string) {
    setSelectedDirectItems((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  async function submitReturn(thenApprove = false) {
    const selectedItems =
      source === 'INVOICE'
        ? Object.entries(selectedInvoiceItems).map(([id, item]) => ({
            invoiceItemId: id,
            quantity: item.quantity,
            condition: item.condition,
            addBackToInventory: false,
            notes: '',
          }))
        : Object.entries(selectedDirectItems).map(([productId, item]) => ({
            productId,
            quantity: item.quantity,
            condition: item.condition,
            addBackToInventory: false,
            notes: '',
          }));

    if (source === 'INVOICE' && !selectedInvoice) {
      setError('Select an invoice first.');
      return;
    }
    if (!selectedItems.length) {
      setError('Select at least one returned product.');
      return;
    }

    if (source === 'INVOICE') {
      for (const item of selectedItems) {
        const eligible = selectedInvoice?.items.find(
          (product) =>
            product.invoiceItemId ===
            ('invoiceItemId' in item ? item.invoiceItemId : ''),
        );
        if (
          !eligible ||
          !Number.isInteger(item.quantity) ||
          item.quantity < 1 ||
          item.quantity > eligible.quantityReturnable
        ) {
          setError('Check the return quantities and try again.');
          return;
        }
      }
    } else {
      for (const item of selectedItems) {
        if (!Number.isInteger(item.quantity) || item.quantity < 1) {
          setError('Return quantities must be whole numbers of at least 1.');
          return;
        }
      }
    }

    if (
      thenApprove &&
      !window.confirm(
        'Save and approve this return now? Stock and the refund amount update immediately.',
      )
    ) {
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceNumber: source === 'INVOICE' ? invoiceNumber : '',
          reason,
          notes:
            source === 'DIRECT'
              ? `${notes}${notes ? '\n' : ''}Direct product return; original invoice not verified.`
              : notes,
          items: selectedItems,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || 'Could not record the return.');
      }

      const newId =
        result?.data?.id ?? result?.data?.return?.id ?? result?.data?.returnId;
      const wasDirect = source === 'DIRECT';
      resetSelection();

      if (thenApprove && newId) {
        await runApprove(String(newId));
        await loadData();
      } else {
        setSuccess(
          thenApprove
            ? 'Return recorded, but its id could not be read. Approve it from the list below.'
            : wasDirect
              ? 'Direct return recorded as invoice-unverified. Inventory will update only after approval.'
              : 'Return recorded. Inventory will update after approval.',
        );
        await loadData();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record the return.');
    } finally {
      setSaving(false);
    }
  }

  async function approveReturn(returnId: string) {
    const activity = activities.find((item) => item.id === returnId);
    if (!activity || activity.status !== 'RECORDED') {
      setError('This return is no longer awaiting approval.');
      return;
    }

    const hasResalableItems = activity.items.some(
      (item) => item.condition === 'RESALABLE' && !item.restocked,
    );
    const message = hasResalableItems
      ? 'Approve this return? Resalable products will be added to inventory. Damaged and inspection-pending products will not be restocked.'
      : 'Approve this return? No products will be added to sellable inventory.';

    if (!window.confirm(message)) return;
    await runApprove(returnId);
  }

  async function runApprove(returnId: string) {
    setApprovingId(returnId);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/returns/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnId }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || 'Could not approve the return.');
      }

      const refund = result?.data?.refund ?? result?.refund;
      const money = (n: unknown) => `₹${Number(n ?? 0).toFixed(2)}`;
      let msg = 'Return approved. No money refund for this return.';
      if (refund && Number(refund.total) > 0) {
        msg = `Return approved. Refund total ${money(refund.total)}.`;
        if (Number(refund.creditAdjusted) > 0) {
          msg += ` ${money(refund.creditAdjusted)} adjusted against the customer's credit balance.`;
        }
        if (Number(refund.cashRefund) > 0) {
          msg += ` Give back ${money(refund.cashRefund)}.`;
        }
      }
      setSuccess(msg);
      notifyStockChanged();
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not approve the return.');
    } finally {
      setApprovingId(null);
    }
  }

  const chosenDirectProducts = Object.values(selectedDirectItems);
  const visible =
    filter === 'PENDING'
      ? activities.filter((a) => a.status === 'RECORDED')
      : activities;
  const formEmpty =
    source === 'INVOICE' ? !selectedInvoice : chosenDirectProducts.length === 0;
  const pendingCount = activities.filter((a) => a.status === 'RECORDED').length;

  return (
    <section
      className="card sales-returns"
      style={{
        marginTop: 0,
        minWidth: 0,
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div
        className="bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <b>Sales Returns</b>
          <p style={{ color: 'var(--mut)', margin: '4px 0 0' }}>
            Record customer returns, approve them and manage inventory.
          </p>
        </div>
        <button
          type="button"
          className="p"
          onClick={() => {
            setOpen((value) => !value);
            setError('');
            setSuccess('');
          }}
        >
          {open ? 'Close Form' : '+ Record Return'}
        </button>
      </div>

      {error && (
        <p role="alert" style={{ color: 'var(--red)', overflowWrap: 'anywhere', margin: '12px 0 0' }}>
          {error}
        </p>
      )}
      {success && (
        <p role="status" style={{ color: 'var(--green, green)', margin: '12px 0 0' }}>
          {success}
        </p>
      )}

      {open && (
        <div className="sales-returns-form" style={{ marginTop: 14, minWidth: 0, width: '100%' }}>
          <div className="sales-returns-grid">
            <div className="sales-returns-details">
              <div>
                <b className="field-heading">Return source</b>
                <div className="source-buttons">
                  <button
                    type="button"
                    className={source === 'INVOICE' ? 'p' : 's'}
                    onClick={() => changeSource('INVOICE')}
                  >
                    Original invoice
                  </button>
                  <button
                    type="button"
                    className={source === 'DIRECT' ? 'p' : 's'}
                    onClick={() => changeSource('DIRECT')}
                  >
                    Direct product return
                  </button>
                </div>
                {source === 'DIRECT' && (
                  <p className="helper-text">
                    No invoice will be linked. This return is unverified until reviewed and approved.
                  </p>
                )}
              </div>

              {source === 'INVOICE' ? (
                <>
                  <label className="field">
                    Original invoice
                    <select
                      value={invoiceNumber}
                      onChange={(e) => selectInvoice(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="">Select an invoice</option>
                      {invoices.map((invoice) => (
                        <option key={invoice.invoiceNumber} value={invoice.invoiceNumber}>
                          {invoice.invoiceNumber} — {invoice.customerName || 'Walk-in customer'}
                        </option>
                      ))}
                    </select>
                  </label>

                  {selectedInvoice && (
                    <div className="customer-summary">
                      <b>Customer</b>
                      <div>{selectedInvoice.customerName || 'Walk-in customer'}</div>
                      {selectedInvoice.customerPhone && <small>{selectedInvoice.customerPhone}</small>}
                      <small className="muted">
                        Invoice date: {new Date(selectedInvoice.date).toLocaleDateString('en-IN')}
                      </small>
                    </div>
                  )}
                </>
              ) : (
                <div className="customer-summary direct-summary">
                  <b>Customer / source notes</b>
                  <small className="muted">
                    Add customer details in Additional notes if needed. This return will not be linked to a verified sale.
                  </small>
                </div>
              )}

              <label className="field">
                Reason for return
                <select value={reason} onChange={(e) => setReason(e.target.value)} style={inputStyle}>
                  {reasons.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              <label className="field">
                Additional notes
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Customer details or additional information..."
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </label>
            </div>

            <div className="sales-returns-products">
              <b className="field-heading">Returned products</b>

              {source === 'INVOICE' ? (
                !selectedInvoice ? (
                  <div className="empty-products">
                    Select an invoice to view its products.
                  </div>
                ) : selectedInvoice.items.length === 0 ? (
                  <div className="empty-products">
                    <b>No returnable products on this invoice.</b>
                    <p className="helper-text">
                      This invoice may have been fully returned already. If that seems wrong, check its return history.
                    </p>
                  </div>
                ) : (
                  <div className="product-list">
                    {selectedInvoice.items.map((item) => {
                      const selected = selectedInvoiceItems[item.invoiceItemId];
                      const unavailable = item.quantityReturnable <= 0;

                      return (
                        <div key={item.invoiceItemId} className={`product-card${unavailable ? ' unavailable' : ''}`}>
                          <label className="product-select-row">
                            <input
                              type="checkbox"
                              checked={Boolean(selected)}
                              disabled={unavailable}
                              onChange={() => toggleInvoiceItem(item)}
                            />
                            <span className="product-copy">
                              <b>{item.name}</b>
                              <small>SKU: {item.sku}</small>
                            </span>
                            <span className="product-quantity">
                              Sold <b>{item.quantitySold}</b>
                              <span>Returned <b>{item.quantityReturned}</b></span>
                              <span>Available <b>{item.quantityReturnable}</b></span>
                            </span>
                          </label>

                          {unavailable && <small className="muted unavailable-note">Already fully returned</small>}

                          {selected && (
                            <div className="item-controls">
                              <label className="field">
                                Quantity to return
                                <input
                                  type="number"
                                  min={1}
                                  max={item.quantityReturnable}
                                  step={1}
                                  value={selected.quantity}
                                  onChange={(e) =>
                                    updateInvoiceItem(item.invoiceItemId, {
                                      quantity: e.target.value === '' ? 0 : Number(e.target.value),
                                    })
                                  }
                                  style={inputStyle}
                                />
                              </label>
                              <label className="field">
                                Condition
                                <select
                                  value={selected.condition}
                                  onChange={(e) =>
                                    updateInvoiceItem(item.invoiceItemId, {
                                      condition: e.target.value as Condition,
                                    })
                                  }
                                  style={inputStyle}
                                >
                                  {conditions.map((condition) => (
                                    <option key={condition.value} value={condition.value}>
                                      {condition.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <p className="condition-help">
                                {selected.condition === 'RESALABLE'
                                  ? 'Added to sellable stock only after approval.'
                                  : selected.condition === 'NEEDS_INSPECTION'
                                    ? 'Held out of sellable stock pending inspection.'
                                    : 'Not restocked. Track for supplier return.'}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="direct-products">
                  <label className="field">
                    Search by product name or SKU
                    <input
                      value={productQuery}
                      onChange={(e) => setProductQuery(e.target.value)}
                      placeholder="Type at least 2 characters..."
                      style={inputStyle}
                    />
                  </label>

                  {searchingProducts && <p className="helper-text">Searching inventory...</p>}
                  {!searchingProducts && productQuery.trim().length >= 2 && productResults.length === 0 && (
                    <p className="helper-text">No matching products found.</p>
                  )}

                  {productResults.length > 0 && (
                    <div className="search-results">
                      {productResults.map((product) => (
                        <div key={product.id} className="search-result-row">
                          <div className="product-copy">
                            <b>{product.name}</b>
                            <small>SKU: {product.sku}{product.stock !== undefined ? ` · Stock: ${product.stock}` : ''}</small>
                          </div>
                          <button
                            type="button"
                            className="p"
                            onClick={() => addDirectProduct(product)}
                            disabled={Boolean(selectedDirectItems[product.id])}
                          >
                            {selectedDirectItems[product.id] ? 'Added' : 'Add'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {chosenDirectProducts.length > 0 && (
                    <div className="product-list">
                      <b>Selected products ({chosenDirectProducts.length})</b>
                      {chosenDirectProducts.map(({ product, quantity, condition }) => (
                        <div key={product.id} className="product-card">
                          <div className="selected-product-header">
                            <div className="product-copy">
                              <b>{product.name}</b>
                              <small>SKU: {product.sku}</small>
                            </div>
                            <button type="button" className="s" onClick={() => removeDirectProduct(product.id)}>
                              Remove
                            </button>
                          </div>
                          <div className="item-controls">
                            <label className="field">
                              Quantity to return
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={quantity}
                                onChange={(e) =>
                                  updateDirectItem(product.id, {
                                    quantity: e.target.value === '' ? 0 : Number(e.target.value),
                                  })
                                }
                                style={inputStyle}
                              />
                            </label>
                            <label className="field">
                              Condition
                              <select
                                value={condition}
                                onChange={(e) =>
                                  updateDirectItem(product.id, { condition: e.target.value as Condition })
                                }
                                style={inputStyle}
                              >
                                {conditions.map((entry) => (
                                  <option key={entry.value} value={entry.value}>{entry.label}</option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <p className="condition-help">
                            {condition === 'RESALABLE'
                              ? 'Added to sellable stock only after approval.'
                              : condition === 'NEEDS_INSPECTION'
                                ? 'Held out of sellable stock pending inspection.'
                                : 'Not restocked. Track for supplier return.'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {isAdmin && (
            <button
              type="button"
              className="p save-return"
              disabled={saving || approvingId !== null || formEmpty}
              onClick={() => void submitReturn(true)}
            >
              {saving || approvingId !== null ? 'Working...' : 'Save & Approve Return'}
            </button>
          )}
          <button
            type="button"
            className={isAdmin ? 's save-return' : 'p save-return'}
            disabled={saving || approvingId !== null || formEmpty}
            onClick={() => void submitReturn(false)}
          >
            {saving ? 'Saving return...' : isAdmin ? 'Save Only — Pending Approval' : 'Save Return — Pending Approval'}
          </button>
        </div>
      )}

      <div className="return-activity">
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <b style={{ flex: 1 }}>Return Activities</b>
          <button type="button" className={filter === 'ALL' ? 'p' : 's'} onClick={() => setFilter('ALL')}>
            All
          </button>
          <button type="button" className={filter === 'PENDING' ? 'p' : 's'} onClick={() => setFilter('PENDING')}>
            Pending approval ({pendingCount})
          </button>
        </div>
        {loading ? (
          <p>Loading returns...</p>
        ) : visible.length === 0 ? (
          <p className="helper-text">{filter === 'PENDING' ? 'Nothing is waiting for approval.' : 'No returns recorded yet. Recorded returns will appear here.'}</p>
        ) : (
          <div className="activity-scroll">
            <table className="activity-table">
              <thead>
                <tr>
                  <th>Return</th>
                  <th>Invoice / Customer</th>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Reason</th>
                  <th>Condition / Stock</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((activity) =>
                  activity.items.map((item) => (
                    <tr key={item.id}>
                      <td>{activity.returnNumber}</td>
                      <td>
                        {activity.invoice?.invoiceNumber ?? 'Direct / unverified'}
                        <br />
                        <small>{activity.customerName || activity.invoice?.customerName || 'Walk-in customer'}</small>
                      </td>
                      <td className="activity-product">{item.productName}</td>
                      <td>{item.quantity}</td>
                      <td>{reasons.find(([value]) => value === activity.reason)?.[1] ?? activity.reason}</td>
                      <td>
                        {item.restocked
                          ? 'Restocked'
                          : item.condition === 'NEEDS_INSPECTION'
                            ? 'Inspection pending'
                            : item.condition === 'DAMAGED'
                              ? 'Supplier return / not restocked'
                              : 'Awaiting approval'}
                      </td>
                      <td>{statusLabel(activity.status)}</td>
                      <td>{new Date(activity.createdAt).toLocaleDateString('en-IN')}</td>
                      <td>
                        {activity.status === 'RECORDED' ? (
                          <button
                            type="button"
                            className="p"
                            disabled={saving || approvingId !== null}
                            onClick={() => void approveReturn(activity.id)}
                          >
                            {approvingId === activity.id ? 'Approving...' : 'Approve Return'}
                          </button>
                        ) : activity.status === 'COMPLETED' ? (
                          <span>Approved</span>
                        ) : (
                          <span>Cancelled</span>
                        )}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="return-activity">
        <b>
          Damaged &amp; Inspection Items ({damaged.reduce((n, d) => n + d.quantity, 0)} units)
        </b>
        <p className="helper-text">
          Items from approved returns that were not put back into sellable stock. Use this list for supplier returns and inspection.
        </p>
        {damaged.length === 0 ? (
          <p className="helper-text">No damaged or inspection items right now.</p>
        ) : (
          <div className="activity-scroll">
            <table className="activity-table" style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Qty</th>
                  <th>Status</th>
                  <th>Return</th>
                  <th>Invoice / Customer</th>
                  <th>Refund</th>
                  <th>Approved</th>
                </tr>
              </thead>
              <tbody>
                {damaged.map((d) => (
                  <tr key={d.id}>
                    <td className="activity-product">{d.productName}</td>
                    <td>{d.sku}</td>
                    <td>{d.quantity}</td>
                    <td>
                      {d.condition === 'DAMAGED' ? 'Damaged — supplier return' : 'Needs inspection'}
                    </td>
                    <td>{d.returnNumber}</td>
                    <td>
                      {d.invoiceNumber ?? 'Direct / unverified'}
                      <br />
                      <small>{d.customerName || 'Walk-in customer'}</small>
                    </td>
                    <td>
                      {d.resolution === 'EXCHANGE' ? 'Exchange' : `₹${Number(d.refundAmount).toFixed(2)}`}
                    </td>
                    <td>
                      {d.approvedAt ? new Date(d.approvedAt).toLocaleDateString('en-IN') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style jsx>{`
        .sales-returns-grid {
          display: grid;
          grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
          gap: 14px;
          align-items: start;
          width: 100%;
          min-width: 0;
        }

        .sales-returns-details,
        .sales-returns-products {
          display: grid;
          align-content: start;
          gap: 12px;
          min-width: 0;
          width: 100%;
        }

        .field,
        .field-heading {
          display: block;
          min-width: 0;
        }

        .source-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 7px;
        }

        .helper-text,
        .muted {
          color: var(--mut);
        }

        .helper-text {
          font-size: 13px;
          line-height: 1.45;
          margin: 5px 0 0;
        }

        .customer-summary,
        .empty-products {
          border: 1px solid var(--border, #ddd);
          border-radius: 10px;
          padding: 12px;
          display: grid;
          gap: 6px;
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .customer-summary p,
        .empty-products p {
          margin: 0;
        }

        .direct-summary {
          background: var(--surface, #fafafa);
        }

        .product-list {
          display: grid;
          gap: 8px;
          min-width: 0;
        }

        .product-card {
          border: 1px solid var(--border, #ddd);
          border-radius: 10px;
          padding: 11px;
          min-width: 0;
          width: 100%;
          box-sizing: border-box;
        }

        .product-card.unavailable {
          background: var(--surface, #fafafa);
          opacity: 0.85;
        }

        .product-select-row {
          display: grid;
          grid-template-columns: 18px minmax(0, 1fr);
          align-items: start;
          gap: 10px;
          min-width: 0;
          cursor: pointer;
        }

        .product-select-row input {
          margin: 3px 0 0;
        }

        .product-copy {
          display: grid;
          gap: 3px;
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .product-copy small {
          color: var(--mut);
          font-size: 12px;
        }

        .product-quantity {
          grid-column: 2;
          display: flex;
          flex-wrap: wrap;
          gap: 6px 12px;
          color: var(--mut);
          font-size: 12px;
        }

        .product-quantity b {
          color: var(--fg, inherit);
          font-weight: 600;
        }

        .unavailable-note {
          display: block;
          margin: 7px 0 0 28px;
          font-size: 12px;
        }

        .item-controls {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 12px;
          min-width: 0;
        }

        .condition-help {
          color: var(--mut);
          font-size: 12px;
          line-height: 1.4;
          margin: 8px 0 0;
        }

        .direct-products {
          display: grid;
          gap: 10px;
          min-width: 0;
        }

        .search-results {
          border: 1px solid var(--border, #ddd);
          border-radius: 10px;
          overflow: hidden;
          min-width: 0;
        }

        .search-result-row,
        .selected-product-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .search-result-row {
          padding: 10px 12px;
          border-bottom: 1px solid var(--border, #eee);
        }

        .search-result-row:last-child {
          border-bottom: 0;
        }

        .search-result-row button,
        .selected-product-header button {
          flex: 0 0 auto;
        }

        .save-return {
          display: block;
          width: 100%;
          margin-top: 14px;
        }

        .return-activity {
          margin-top: 20px;
          min-width: 0;
        }

        .activity-scroll {
          overflow-x: auto;
          margin-top: 8px;
          max-width: 100%;
        }

        .activity-table {
          width: 100%;
          min-width: 900px;
          border-collapse: collapse;
        }

        .activity-product {
          min-width: 150px;
          overflow-wrap: anywhere;
        }

        @media (max-width: 900px) {
          .sales-returns-grid {
            grid-template-columns: minmax(0, 1fr);
            gap: 14px;
          }
        }

        @media (max-width: 560px) {
          .item-controls {
            grid-template-columns: minmax(0, 1fr);
          }

          .product-quantity {
            gap: 5px 9px;
          }

          .search-result-row {
            align-items: flex-start;
          }
        }
      `}</style>
    </section>
  );
}
