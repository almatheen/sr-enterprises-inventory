# SR Enterprises Inventory Management System

Inventory, point-of-sale billing, GST invoicing and sales analytics for a retail business.
A fresh installation starts **completely empty** – no products, clients, invoices or analytics are ever pre-loaded.

## Features
Dashboard · Inventory (CRUD, filters, stock adjustments, CSV export) · POS billing (cart, discount, GST, CGST/SGST/IGST, round-off) ·
Invoices (A4 + thermal, print, PDF) · Reports (today / week / month / year / custom, charts, CSV) · Clients (purchase history, outstanding) ·
Settings (business profile, logo, invoice prefix, low-stock threshold) · Global search (Ctrl+K) · Low-stock alerts · Dark mode · Responsive mobile layout.

## Technology stack
Next.js 14 (App Router) · React 18 · TypeScript · PostgreSQL · Prisma · Zod validation · JWT sessions (`jose`) with bcrypt password hashing · Chart.js · html2canvas + jsPDF.

## Architecture
| Layer | Location |
|---|---|
| UI components | `components/` |
| Pages (thin wrappers) | `app/(app)/*` |
| API routes (auth + validation + error mapping) | `app/api/*`, `lib/auth/guard.ts` |
| Business logic | `lib/inventory`, `lib/invoices`, `lib/clients`, `lib/reports`, `lib/dashboard`, `lib/search` |
| Bill maths (shared by browser preview **and** server) | `lib/billing/calc.ts` |
| Validation schemas | `lib/validation/schemas.ts` |
| Database | `prisma/schema.prisma`, `lib/db/prisma.ts` |

Styling: the approved design's CSS is kept **verbatim** in `app/globals.css` (same class names, tokens, breakpoints, animations) rather than being re-expressed in another system, so the rendered result is identical. Production-only additions (empty states, pager, login) are appended at the end of that file.

## Environment variables
Copy `.env.example` to `.env`.
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Secret signing login sessions (≥16 chars). `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` | Public URL of the app |

## Setup
```bash
npm install
cp .env.example .env            # then edit values
npx prisma migrate dev --name init   # creates tables (use `npm run db:deploy` in production)
ADMIN_NAME="Owner" ADMIN_EMAIL="owner@yourshop.com" ADMIN_PASSWORD="a-long-password" npm run create-admin
npm run dev                     # http://localhost:3000
```
Production: `npm run build && npm start`.

### First admin / extra users
`npm run create-admin` creates the first administrator (min. 10-character password). Additional users: `USER_EMAIL=… USER_PASSWORD=… USER_ROLE=STAFF npm run create-user`.
Staff can bill, add/edit products and adjust stock; only admins can delete products and change settings.

### Business information
Sign in → **Settings**. Name, address, phone, email, GSTIN, state, pincode, logo, invoice prefix, receipt tagline and low-stock threshold are stored in the database and used on invoices.

## Using the system
- **Add products** – Inventory → *+ Add Product*. Unique IDs (`SR-MC-00001`, `SR-CH-00001` …) are generated on the server from a transactional counter. SKU and barcode must be unique. GST must be 0/5/12/18/28.
- **Stock** – *Adjust*: Add, Remove, Damage, Return, Correction (set stock to). Every change writes a `StockMovement`; stock can never go negative. Low stock = `stock <= minimumStock`; out of stock = `0`.
- **Billing** – search → click to add → set quantity → discount (% or ₹) → GST (Item GST, or step through slabs) → CGST+SGST or IGST → customer → payment → *Generate Invoice*. The server **recomputes every figure from database prices**, checks stock atomically, reduces inventory, saves the invoice and assigns the number `PREFIX-YYYY-00001` from a transactional counter (no gaps on failure, no duplicates).
- **Customers** – with *Save customer* ticked a 10-digit mobile is required; clients are de-duplicated on mobile number.
- **Credit sales** – Payment *Credit* needs the customer's mobile; the amount is added to the client's *Outstanding* until the invoice is marked paid.

### Printing & PDF
Open an invoice → choose **A4** or **Thermal** → **Print Invoice**. Print CSS hides everything except the invoice; A4 uses `@page A4`, thermal uses an 80 mm roll (`@page 80mm auto`, 280 px receipt). **Download PDF** renders the same on-screen invoice, so PDF and print match.
For thermal printers choose the 80 mm paper size and disable headers/footers in the browser print dialog.

### Reports
Computed from real invoices (IST day boundaries): total sales, orders, average order, tax, discount, gross profit (sales − discount − purchase cost), daily/monthly sales, category split, top products. With no data, charts show an empty state.

## Security
bcrypt password hashes · signed httpOnly session cookie · all `/api` and app routes protected by middleware + per-route checks · server-side Zod validation · same-origin check on state-changing requests · login throttling · CSV formula-injection guard · no stack traces sent to the browser.

## Deployment
Any Node 18+ host with PostgreSQL. Set the three env vars, run `npm run db:deploy`, `npm run build`, `npm start`, then create the admin. Serve over HTTPS (cookies are `secure` in production). The login throttle is in-memory; use a shared store if you run several instances.

## Development
`npm run typecheck` · `npm test` (billing maths) · `npm run db:reset` wipes **all** data (development only).

## Troubleshooting
- *AUTH_SECRET is missing* – set it in `.env`.
- *Database unavailable* – check `DATABASE_URL` and that PostgreSQL is running.
- *Cannot log in* – create the admin with `npm run create-admin`.
- *Duplicate SKU/barcode* – these must be unique across products.
- *Logo too large* – max about 250 KB.
