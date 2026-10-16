
import { api } from '@/lib/auth/guard';
import { AppError } from '@/lib/errors';
import { prisma } from '@/lib/db/prisma';
import { nextProductId } from '@/lib/inventory/service';
import { productSchema } from '@/lib/validation/schemas';
import { CATS } from '@/lib/constants';
import Papa from 'papaparse';
import { z } from 'zod';

export const runtime = 'nodejs';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 1000;

const CATEGORY_LOOKUP = new Map<string, string>(
  Object.entries(CATS).flatMap(([code, label]) => [
    [code.toLowerCase(), code],
    [label.toLowerCase(), code],
  ])
);

const csvRowSchema = z.object({
  name: z.string(),
  sku: z.string().optional().default(''),
  barcode: z.string().optional().default(''),
  category: z.string(),
  brand: z.string().optional().default(''),
  description: z.string().optional().default(''),
  purchasePrice: z.string(),
  sellingPrice: z.string(),
  gst: z.string(),
  stock: z.string(),
  minimumStock: z.string().optional().default('10'),
  supplier: z.string().optional().default(''),
});

const HEADER_ALIASES: Record<string, string> = {
  name: 'name',
  'product name': 'name',
  sku: 'sku',
  barcode: 'barcode',
  category: 'category',
  brand: 'brand',
  description: 'description',
  purchaseprice: 'purchasePrice',
  'purchase price': 'purchasePrice',
  sellingprice: 'sellingPrice',
  'selling price': 'sellingPrice',
  gst: 'gst',
  'gst %': 'gst',
  stock: 'stock',
  minimumstock: 'minimumStock',
  'minimum stock': 'minimumStock',
  supplier: 'supplier',
};

type ValidRow = {
  row: number;
  product: z.infer<typeof productSchema>;
};

type InvalidRow = {
  row: number;
  errors: string[];
};

export const POST = api(
  async ({ req, user }) => {
    const form = await req.formData();
    const file = form.get('file');
    const mode = form.get('mode') ?? 'preview';

    if (mode !== 'preview' && mode !== 'import') {
      throw new AppError(400, 'Invalid import mode.', 'INVALID_MODE');
    }

    if (mode === 'import' && user.role !== 'ADMIN') {
      throw new AppError(
        403,
        'Only administrators can import products.',
        'FORBIDDEN'
      );
    }

    if (!(file instanceof File)) {
      throw new AppError(400, 'Please upload a CSV file.', 'INVALID_FILE');
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      throw new AppError(400, 'Only CSV files are supported.', 'INVALID_FILE');
    }

    if (file.size === 0 || file.size > MAX_FILE_BYTES) {
      throw new AppError(
        400,
        'The CSV must not be empty or larger than 2 MB.',
        'INVALID_FILE'
      );
    }

    const parsed = Papa.parse<Record<string, string>>(await file.text(), {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header) => {
        const clean = header.replace(/^\uFEFF/, '').trim().toLowerCase();
        return HEADER_ALIASES[clean] ?? clean;
      },
    });

    if (parsed.errors.length > 0) {
      throw new AppError(
        400,
        `CSV parsing failed: ${parsed.errors
          .slice(0, 5)
          .map((error) => error.message)
          .join('; ')}`,
        'CSV_PARSE_ERROR'
      );
    }

    const rows = parsed.data;

    if (rows.length === 0) {
      throw new AppError(400, 'The CSV contains no products.', 'EMPTY_CSV');
    }

    if (rows.length > MAX_ROWS) {
      throw new AppError(
        400,
        `A maximum of ${MAX_ROWS} products can be imported at a time.`,
        'TOO_MANY_ROWS'
      );
    }

    const requiredHeaders = [
      'name',
      'category',
      'purchasePrice',
      'sellingPrice',
      'gst',
      'stock',
    ];

    const headers = parsed.meta.fields ?? [];
    const missingHeaders = requiredHeaders.filter(
      (header) => !headers.includes(header)
    );

    if (missingHeaders.length > 0) {
      throw new AppError(
        400,
        `Missing required columns: ${missingHeaders.join(', ')}`,
        'MISSING_HEADERS'
      );
    }

    const seenSkus = new Set<string>();
    const seenBarcodes = new Set<string>();
    const valid: ValidRow[] = [];
    const invalid: InvalidRow[] = [];

    for (let index = 0; index < rows.length; index++) {
      const raw = csvRowSchema.safeParse(rows[index]);

      if (!raw.success) {
        invalid.push({
          row: index + 2,
          errors: raw.error.issues.map((issue) => issue.message),
        });
        continue;
      }

      const values = raw.data;
      const category = CATEGORY_LOOKUP.get(
        values.category.trim().toLowerCase()
      );
      const errors: string[] = [];

      if (!category) {
        errors.push(`Invalid category: ${values.category}`);
      }

      const product = productSchema.safeParse({
        ...values,
        category: category ?? values.category,
      });

      if (!product.success) {
        errors.push(
          ...product.error.issues.map(
            (issue) => `${issue.path.join('.')}: ${issue.message}`
          )
        );
      }

      const sku = values.sku.trim().toLowerCase();
      const barcode = values.barcode.trim().toLowerCase();

      if (sku && seenSkus.has(sku)) {
        errors.push(`Duplicate SKU in CSV: ${values.sku}`);
      }

      if (barcode && seenBarcodes.has(barcode)) {
        errors.push(`Duplicate barcode in CSV: ${values.barcode}`);
      }

      if (sku) seenSkus.add(sku);
      if (barcode) seenBarcodes.add(barcode);

      if (errors.length || !product.success) {
        invalid.push({ row: index + 2, errors });
      } else {
        valid.push({ row: index + 2, product: product.data });
      }
    }

    if (invalid.length > 0) {
      return {
        preview: true,
        totalRows: rows.length,
        validCount: valid.length,
        invalidCount: invalid.length,
        valid: valid.map(({ row, product }) => ({
          row,
          ...product,
        })),
        invalid,
        message: 'Fix the invalid rows before importing.',
      };
    }

    if (mode === 'preview') {
      return {
        preview: true,
        totalRows: rows.length,
        validCount: valid.length,
        invalidCount: 0,
        valid: valid.map(({ row, product }) => ({
          row,
          ...product,
        })),
        invalid: [],
        message: 'Preview only. No products have been saved.',
      };
    }

    // The final database duplicate check and all writes happen
    // within one transaction. Any failure rolls back the whole import.
    const imported = await prisma.$transaction(
      async (tx) => {
        const skus = valid
          .map(({ product }) => product.sku.trim())
          .filter(Boolean);

        const barcodes = valid
          .map(({ product }) => product.barcode.trim())
          .filter(Boolean);

        const existing = await tx.product.findMany({
          where: {
            OR: [
              ...(skus.length ? [{ sku: { in: skus } }] : []),
              ...(barcodes.length
                ? [{ barcode: { in: barcodes } }]
                : []),
            ],
          },
          select: { sku: true, barcode: true },
        });

        if (existing.length > 0) {
          const duplicateValues = existing
            .map((product) => {
              if (product.sku && skus.includes(product.sku)) {
                return `SKU ${product.sku}`;
              }
              if (product.barcode && barcodes.includes(product.barcode)) {
                return `barcode ${product.barcode}`;
              }
              return null;
            })
            .filter(Boolean);

          throw new AppError(
            409,
            `Import cancelled. These values already exist: ${duplicateValues.join(', ')}. No products were imported.`,
            'IMPORT_DUPLICATE'
          );
        }

        const created: string[] = [];

        for (const { product } of valid) {
          const { uniqueId, n } = await nextProductId(tx, product.category);

          const saved = await tx.product.create({
            data: {
              uniqueId,
              name: product.name,
              sku:
                product.sku.trim() ||
                `${product.category}-${String(n).padStart(5, '0')}`,
              barcode: product.barcode.trim() || null,
              category: product.category,
              brand: product.brand,
              description: product.description,
              purchasePrice: product.purchasePrice,
              sellingPrice: product.sellingPrice,
              gst: product.gst,
              stock: product.stock,
              minimumStock: product.minimumStock,
              supplier: product.supplier,
            },
          });

          if (product.stock > 0) {
            await tx.stockMovement.create({
              data: {
                productId: saved.id,
                type: 'INITIAL',
                quantity: product.stock,
                balance: product.stock,
                reason: 'Opening stock (CSV import)',
                userId: user.id,
              },
            });
          }

          created.push(saved.uniqueId);
        }

        return created;
      },
      { maxWait: 10000, timeout: 60000 }
    );

    return {
      imported: true,
      importedCount: imported.length,
      productIds: imported,
      message: `${imported.length} products imported successfully.`,
    };
  },
  { raw: false }
);
