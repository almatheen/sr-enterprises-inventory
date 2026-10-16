import { api } from '@/lib/auth/guard';
import { exportInventoryRows } from '@/lib/inventory/service';
import { csvResponse, toCsv } from '@/lib/csv';

export const GET = api(
  async () =>
    csvResponse(
      toCsv(['ID', 'Name', 'SKU', 'Barcode', 'Category', 'Purchase Price', 'Selling Price', 'GST %', 'Stock', 'Minimum Stock', 'Supplier'], await exportInventoryRows()),
      'inventory'
    ),
  { raw: true }
);
