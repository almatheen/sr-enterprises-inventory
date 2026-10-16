
import { z } from 'zod';
import {
  ADJUST_TYPES,
  CAT_CODES,
  GST_RATES,
  PAYMENT_METHODS,
} from '../constants';

// Validation helpers
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;

const str = (max = 200) =>
  z.string().trim().max(max, 'Text is too long').default('');

const money = (msg: string) =>
  z.coerce.number({ invalid_type_error: msg }).finite(msg);

const emailField = (max = 120) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      'Invalid email'
    )
    .default('');

export const gstinField = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => v === '' || GSTIN_RE.test(v), 'Invalid GSTIN')
  .default('');

// Product
export const productSchema = z.object({
  name: z
    .string({ required_error: 'Product name required' })
    .trim()
    .min(1, 'Product name required')
    .max(150),
  category: z.enum(CAT_CODES, {
    errorMap: () => ({ message: 'Invalid category' }),
  }),
  sku: str(60),
  barcode: str(60),
  brand: str(80),
  description: str(500),
  purchasePrice: money('Invalid price').min(0, 'Invalid price'),
  sellingPrice: money('Invalid price').gt(0, 'Invalid price'),
  gst: z.coerce
    .number()
    .refine(
      (v) => (GST_RATES as readonly number[]).includes(v),
      'Invalid GST'
    ),
  stock: z.coerce
    .number()
    .int('Stock must be a whole number')
    .min(0, 'Stock cannot be negative'),
  minimumStock: z.coerce
    .number()
    .int()
    .min(0, 'Stock cannot be negative'),
  supplier: str(120),
});

export type ProductInput = z.infer<typeof productSchema>;

// Inventory adjustment
export const adjustSchema = z.object({
  type: z.enum(ADJUST_TYPES),
  quantity: z.coerce
    .number()
    .int('Quantity must be a whole number')
    .min(0, 'Invalid quantity'),
  reason: z
    .string()
    .trim()
    .min(1, 'Reason required')
    .max(200),
});

// Client
export const clientSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter name and 10-digit mobile')
    .max(120),
  phone: z
    .string()
    .trim()
    .regex(/^\d{10}$/, 'Enter name and 10-digit mobile'),
  email: emailField(),
  gstin: gstinField,
  address: str(300),
  state: str(60),
});

// Invoice
export const invoiceSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce
          .number()
          .int()
          .min(1, 'Invalid quantity'),
      })
    )
    .min(1, 'Cart is empty')
    .max(200),

  discountType: z.enum(['pct', 'amt']).default('pct'),
  discountValue: z.coerce
    .number()
    .min(0, 'Invalid discount')
    .default(0),

  gstOverride: z.coerce
    .number()
    .refine(
      (v) => (GST_RATES as readonly number[]).includes(v),
      'Invalid GST'
    )
    .nullable()
    .default(null),

  interState: z.boolean().default(false),
  paymentMethod: z.enum(PAYMENT_METHODS, {
    errorMap: () => ({ message: 'Invalid payment method' }),
  }),

  customer: z
    .object({
      name: str(120),
      phone: str(15),
      email: str(120),
      gstin: gstinField,
      address: str(300),
    })
    .default({}),

  saveCustomer: z.boolean().default(false),
});

export type InvoiceInput = z.infer<typeof invoiceSchema>;

// Business settings
export const businessSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Business name required')
    .max(120),

  tagline: str(120),
  address: str(300),
  phone: str(30),
  email: emailField(),
  gstin: gstinField,
  state: str(60),

  pincode: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || /^\d{6}$/.test(v),
      'Pincode must be 6 digits'
    )
    .default(''),

  logo: z
    .string()
    .max(400_000, 'Logo is too large (max ~250 KB)')
    .refine(
      (v) => v.startsWith('data:image/'),
      'Invalid logo image'
    )
    .nullable()
    .optional(),

  invoicePrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z0-9-]{1,12}$/,
      'Invoice prefix: letters, digits and "-" only (max 12)'
    ),

  lowStockThreshold: z.coerce
    .number()
    .int()
    .min(0, 'Invalid threshold')
    .max(100000),
});

// Login
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'Enter your email'),
  password: z.string().min(1, 'Enter your password'),
  remember: z.boolean().default(false),
});

// Sales returns
export const salesReturnSchema = z
  .object({
    // A blank invoice number means this is a direct-product return.
    invoiceNumber: z
      .string()
      .trim()
      .max(100, 'Invoice number is too long')
      .optional()
      .default(''),

    reason: z.enum([
      'CUSTOMER_CHANGED_MIND',
      'WRONG_PRODUCT',
      'DAMAGED_PRODUCT',
      'MANUFACTURING_DEFECT',
      'NOT_WORKING',
      'INCORRECT_SIZE_OR_MODEL',
      'OTHER',
    ]),

    notes: z
      .string()
      .trim()
      .max(500, 'Notes are too long')
      .default(''),

    items: z
      .array(
        z.object({
          invoiceItemId: z.string().trim().min(1).optional(),
          productId: z.string().trim().min(1).optional(),

          quantity: z.coerce
            .number()
            .int('Quantity must be a whole number')
            .min(1, 'Quantity must be at least 1'),

          condition: z.enum([
            'RESALABLE',
            'NEEDS_INSPECTION',
            'DAMAGED',
          ]),

          addBackToInventory: z.boolean().default(false),

          notes: z
            .string()
            .trim()
            .max(500, 'Item notes are too long')
            .default(''),
        })
      )
      .min(1, 'Add at least one return item')
      .max(100, 'Too many return items'),
  })
  .superRefine((data, ctx) => {
    const invoiceMode = Boolean(data.invoiceNumber?.trim());
    const seen = new Set<string>();

    data.items.forEach((item, index) => {
      if (invoiceMode && !item.invoiceItemId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'invoiceItemId'],
          message: 'Select an item from the invoice.',
        });
      }

      if (!invoiceMode && !item.productId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'productId'],
          message: 'Select an inventory product.',
        });
      }

      if (invoiceMode && item.productId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'productId'],
          message: 'Invoice returns must use invoice items.',
        });
      }

      if (!invoiceMode && item.invoiceItemId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'invoiceItemId'],
          message: 'Direct returns cannot use invoice items.',
        });
      }

      if (
        item.addBackToInventory &&
        item.condition !== 'RESALABLE'
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'addBackToInventory'],
          message: 'Only resalable products can be restocked.',
        });
      }

      const key = invoiceMode
        ? `invoice:${item.invoiceItemId ?? ''}`
        : `product:${item.productId ?? ''}`;

      if (
        (invoiceMode && item.invoiceItemId) ||
        (!invoiceMode && item.productId)
      ) {
        if (seen.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['items', index],
            message: 'Each selected item can appear only once.',
          });
        }

        seen.add(key);
      }
    });
  });

export type SalesReturnInput = z.infer<typeof salesReturnSchema>;
