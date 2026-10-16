
'use client';

import { useEffect, useRef, useState } from 'react';
import { downloadCsv, useApi, useDebounced } from '@/lib/client/api';
import { CATS } from '@/lib/constants';
import { R } from '@/lib/format';
import type { Paged, ProductDTO } from '@/lib/types';
import { useModal, useToast } from '@/components/ui/Providers';
import { useShell } from '@/components/layout/AppShell';
import { Empty } from '@/components/ui/Empty';
import { Pager } from '@/components/ui/Pager';
import { ProductModal } from '@/components/modals/ProductModal';
import { AdjustModal } from '@/components/modals/AdjustModal';
import { DeleteProductModal } from '@/components/modals/DeleteProductModal';

type CSVPreviewProduct = {
  row: number;
  name: string;
  sku: string;
  barcode: string;
  category: keyof typeof CATS;
  brand: string;
  description: string;
  purchasePrice: number;
  sellingPrice: number;
  gst: number;
  stock: number;
  minimumStock: number;
  supplier: string;
};

type CSVPreviewError = {
  row: number;
  errors: string[];
};

type CSVPreview = {
  preview: boolean;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  valid: CSVPreviewProduct[];
  invalid: CSVPreviewError[];
  message: string;
};

const st = (p: ProductDTO): [string, string] =>
  p.stock <= 0
    ? ['out', 'OUT OF STOCK']
    : p.stock <= p.min
      ? ['lo', 'LOW STOCK']
      : ['ok', 'In Stock'];

export default function InventoryPage() {
  const m = useModal();
  const toast = useToast();
  const { user, business } = useShell();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CSVPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const sp = new URLSearchParams(location.search);

    if (sp.get('q')) setQ(sp.get('q')!);
    if (sp.get('status')) setStatus(sp.get('status')!);
  }, []);

  const dq = useDebounced(q);

  useEffect(() => setPage(1), [dq, cat, status]);

  const { data, reload } = useApi<Paged<ProductDTO>>(
    `/api/products?q=${encodeURIComponent(dq)}&category=${encodeURIComponent(cat)}&status=${encodeURIComponent(status)}&page=${page}`
  );

  const filtered = !!(dq || cat || status);

  async function handleFileSelection(file?: File) {
    if (!file) return;

    setSelectedFile(null);
    setPreview(null);

    if (!file.name.toLowerCase().endsWith('.csv')) {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      toast('Please select a CSV file (.csv).', true);
      return;
    }

    if (file.size === 0 || file.size > 2 * 1024 * 1024) {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      toast('Choose a non-empty CSV file smaller than 2 MB.', true);
      return;
    }

    setSelectedFile(file);
    setPreviewLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', 'preview');

      const response = await fetch('/api/products/import', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        const message =
          result?.error?.message ??
          result?.error ??
          'Could not validate the CSV file.';

        throw new Error(
          typeof message === 'string' ? message : JSON.stringify(message)
        );
      }

      const payload = result?.data ?? result;

      if (
        typeof payload?.totalRows !== 'number' ||
        typeof payload?.validCount !== 'number' ||
        typeof payload?.invalidCount !== 'number' ||
        !Array.isArray(payload?.valid) ||
        !Array.isArray(payload?.invalid)
      ) {
        console.error('Unexpected CSV preview response:', result);
        throw new Error(
          'The preview response is missing required fields. Check the browser console.'
        );
      }

      setPreview(payload as CSVPreview);

      toast(
        `CSV preview ready: ${payload.validCount} valid, ${payload.invalidCount} invalid.`
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'CSV preview failed. Please try again.';

      toast(message, true);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleImport() {
    if (!selectedFile || !preview || importing || previewLoading) {
      return;
    }

    if (user.role !== 'ADMIN') {
      toast('Only administrators can import products.', true);
      return;
    }

    if (preview.invalidCount > 0 || preview.validCount === 0) {
      toast('Fix all CSV errors before importing.', true);
      return;
    }

    const confirmed = window.confirm(
      `Import ${preview.validCount} products into SR Enterprises inventory? This will add products and opening stock.`
    );

    if (!confirmed) return;

    setImporting(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('mode', 'import');

      const response = await fetch('/api/products/import', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        const message =
          result?.error?.message ??
          result?.error ??
          'Product import failed.';

        throw new Error(
          typeof message === 'string' ? message : JSON.stringify(message)
        );
      }

      const payload = result?.data ?? result;

      if (payload?.imported !== true) {
        throw new Error(
          payload?.message ?? 'The server did not confirm the import.'
        );
      }

      toast(
        `Successfully imported ${payload.importedCount} products.`
      );

      setSelectedFile(null);
      setPreview(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      await reload();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Product import failed. Please try again.';

      toast(message, true);
    } finally {
      setImporting(false);
    }
  }

  function clearSelectedFile() {
    if (importing || previewLoading) return;

    setSelectedFile(null);
    setPreview(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  if (!data) return null;

  return (
    <>
      <div className="bar">
        <input
          id="q"
          placeholder="Search name, SKU, ID, barcode…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search products"
        />

        <select
          id="fc"
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          aria-label="Category"
        >
          <option value="">All categories</option>
          {Object.entries(CATS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        <select
          id="fs"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Stock status"
        >
          <option value="">All stock</option>
          <option value="ok">In Stock</option>
          <option value="lo">Low</option>
          <option value="out">Out</option>
        </select>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => handleFileSelection(e.target.files?.[0])}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Choose a CSV file to import"
          disabled={previewLoading || importing}
        >
          {previewLoading
            ? 'Validating...'
            : importing
              ? 'Importing...'
              : '↑ Import CSV'}
        </button>

        <button
          className="p"
          disabled={importing}
          onClick={() =>
            m.open(
              <ProductModal
                defaultMin={business.lowStockThreshold}
                onDone={reload}
              />
            )
          }
        >
          + Add Product
        </button>

        <button
          disabled={importing}
          onClick={() =>
            downloadCsv('/api/products/export', 'inventory')
              .then(() => toast('CSV exported'))
              .catch((e) => toast(e.message, true))
          }
        >
          Export
        </button>
      </div>

      {selectedFile && (
        <div
          className="card"
          style={{
            marginBottom: 16,
            padding: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <strong>Selected CSV file</strong>

            <div style={{ marginTop: 4 }}>
              {selectedFile.name}
            </div>

            <small>
              {previewLoading
                ? 'Validating CSV...'
                : importing
                  ? 'Importing products. Please wait...'
                  : preview
                    ? 'Preview ready. No products have been saved yet.'
                    : 'Preview unavailable. Check the error message.'}
            </small>
          </div>

          <button
            type="button"
            onClick={clearSelectedFile}
            disabled={previewLoading || importing}
          >
            Remove
          </button>
        </div>
      )}

      {preview && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <h3>CSV Import Preview</h3>

          <p>
            Total rows: {preview.totalRows} | Valid: {preview.validCount} |
            Invalid: {preview.invalidCount}
          </p>

          {preview.validCount > 0 && (
            <div style={{ overflowX: 'auto', marginBottom: 16 }}>
              <h4>Valid products</h4>

              <table>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Name</th>
                    <th>SKU</th>
                    <th>Category</th>
                    <th>Cost</th>
                    <th>Price</th>
                    <th>GST</th>
                    <th>Stock</th>
                  </tr>
                </thead>

                <tbody>
                  {preview.valid.map((p) => (
                    <tr key={p.row}>
                      <td>{p.row}</td>
                      <td>{p.name}</td>
                      <td>{p.sku || 'Auto-generated'}</td>
                      <td>{CATS[p.category] ?? p.category}</td>
                      <td>{R(Number(p.purchasePrice))}</td>
                      <td>{R(Number(p.sellingPrice))}</td>
                      <td>{p.gst}%</td>
                      <td>{p.stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {preview.invalidCount > 0 && (
            <div style={{ overflowX: 'auto', marginBottom: 16 }}>
              <h4>Rows with errors</h4>

              <table>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Errors</th>
                  </tr>
                </thead>

                <tbody>
                  {preview.invalid.map((item) => (
                    <tr key={item.row}>
                      <td>{item.row}</td>
                      <td>{item.errors.join('; ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p>
            <strong>No products have been imported yet.</strong>{' '}
            Review the validation results before proceeding.
          </p>

          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              marginTop: 12,
            }}
          >
            {user.role === 'ADMIN' &&
              preview.invalidCount === 0 &&
              preview.validCount > 0 && (
                <button
                  type="button"
                  className="p"
                  onClick={handleImport}
                  disabled={importing || previewLoading}
                >
                  {importing
                    ? 'Importing products...'
                    : `Import ${preview.validCount} Products`}
                </button>
              )}

            <button
              type="button"
              onClick={clearSelectedFile}
              disabled={importing || previewLoading}
            >
              Clear preview
            </button>
          </div>
        </div>
      )}

      <div className="card tw" id="it">
        <table>
          <tbody>
            <tr>
              <th>Product</th>
              <th>ID</th>
              <th>Category</th>
              <th>Cost</th>
              <th>Price</th>
              <th>GST</th>
              <th>Stock</th>
              <th>Status</th>
              <th></th>
            </tr>

            {data.rows.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.name}
                  <br />
                  <small>{p.sku}</small>
                </td>

                <td>{p.id}</td>
                <td>{CATS[p.cat]}</td>
                <td>{R(p.cost)}</td>
                <td>{R(p.price)}</td>
                <td>{p.gst}%</td>
                <td>{p.stock}</td>

                <td>
                  <span className={`tag ${st(p)[0]}`}>
                    {st(p)[1]}
                  </span>
                </td>

                <td style={{ whiteSpace: 'nowrap' }}>
                  <button
                    disabled={importing}
                    onClick={() =>
                      m.open(
                        <ProductModal product={p} onDone={reload} />
                      )
                    }
                  >
                    Edit
                  </button>{' '}

                  <button
                    disabled={importing}
                    onClick={() =>
                      m.open(
                        <AdjustModal product={p} onDone={reload} />
                      )
                    }
                  >
                    Adjust
                  </button>{' '}

                  {user.role === 'ADMIN' && (
                    <button
                      className="d"
                      aria-label={`Delete ${p.name}`}
                      disabled={importing}
                      onClick={() =>
                        m.open(
                          <DeleteProductModal
                            id={p.id}
                            onDone={reload}
                          />
                        )
                      }
                    >
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}

            {!data.rows.length && (
              <tr>
                <td colSpan={9}>
                  {filtered ? (
                    <Empty
                      icon="📦"
                      title="No products found"
                      text="No products match your search or filters."
                    />
                  ) : (
                    <Empty
                      icon="📦"
                      title="No products found"
                      text="Start building your inventory by adding your first product."
                    >
                      <button
                        className="p"
                        disabled={importing}
                        onClick={() =>
                          m.open(
                            <ProductModal
                              defaultMin={business.lowStockThreshold}
                              onDone={reload}
                            />
                          )
                        }
                      >
                        + Add Product
                      </button>
                    </Empty>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <Pager
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPage={setPage}
        />
      </div>
    </>
  );
}
