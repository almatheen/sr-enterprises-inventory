/** Shared (client + server) data shapes. */
export interface ProductDTO {
  id: string; // unique ID, e.g. SR-MC-00001
  name: string;
  cat: string;
  sku: string;
  barcode: string;
  brand: string;
  description: string;
  cost: number;
  price: number;
  gst: number;
  stock: number;
  min: number;
  sup: string;
  upd: string;
}
export interface ClientDTO {
  id: string;
  name: string;
  phone: string;
  email: string;
  gstin: string;
  addr: string;
  state: string;
  purchases: number;
  orders: number;
  credit: number;
}
export interface InvoiceLineDTO {
  name: string;
  sku: string;
  qty: number;
  price: number;
  gst: number;
  amt: number;
}
export interface InvoiceDTO {
  id: string; // invoice number
  date: string; // ISO
  cust: { name: string; phone: string; email: string; gstin: string; addr: string };
  pay: string;
  status: string;
  L: InvoiceLineDTO[];
  sub: number;
  disc: number;
  tax: number;
  cgst: number;
  sgst: number;
  igst: number;
  round: number;
  gt: number;
  inter: boolean;
  paid: number;
  bal: number;
}
export interface InvoiceRowDTO {
  id: string;
  name: string;
  items: number;
  gt: number;
  pay: string;
  date: string;
  status: string;
}
export interface BusinessDTO {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  state: string;
  pincode: string;
  logo: string | null;
  invoicePrefix: string;
  lowStockThreshold: number;
}
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'STAFF';
}
export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface SeriesDTO {
  labels: string[];
  sales: number[];
  profit: number[];
  total: number;
  orders: number;
}
