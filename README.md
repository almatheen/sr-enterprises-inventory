# SR Enterprises Inventory Management System

Inventory management, point-of-sale billing, GST invoicing, and sales analytics for SR Enterprises.

## Features

- Dashboard and sales analytics
- Inventory CRUD, search, filters, stock adjustments, and CSV export
- POS billing with discounts, GST, CGST/SGST/IGST, and round-off
- Invoice generation, A4 and thermal printing, and PDF export
- Reports for today, week, month, year, and custom date ranges
- Client management, purchase history, and outstanding balances
- Business settings and invoice configuration
- Global search, low-stock alerts, dark mode, and responsive layout

## Technology Stack

- Next.js 14 App Router
- React 18 and TypeScript
- MySQL with Prisma ORM
- Zod validation
- JWT sessions using `jose`
- bcrypt password hashing
- Chart.js
- html2canvas and jsPDF

## Project Structure

| Location                    | Purpose                         |
| --------------------------- | ------------------------------- |
| `app/`                      | Pages and API routes            |
| `components/`               | UI components                   |
| `lib/`                      | Business logic and services     |
| `lib/billing/calc.ts`       | Shared billing calculations     |
| `lib/validation/schemas.ts` | Validation schemas              |
| `prisma/schema.prisma`      | Database schema                 |
| `scripts/`                  | Admin and user creation scripts |

## Environment Setup

1. Install Node.js and MySQL.
2. Create a MySQL database named `sr_enterprises`.
3. Copy `.env.example` to `.env`.
4. Configure the environment variables locally.

Required variables:

| Variable              | Purpose                            |
| --------------------- | ---------------------------------- |
| `DATABASE_URL`        | MySQL connection string            |
| `AUTH_SECRET`         | Secret used to sign login sessions |
| `NEXT_PUBLIC_APP_URL` | Application URL                    |

Never commit `.env` or database backups to GitHub.

## Installation

```bash
npm install
npx prisma generate
```

Configure your local `.env` file before running database commands.

For a new development database, use Prisma migrations as configured for this project. For an existing database, verify the schema and back up the data before applying any changes.

Start the development server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Admin and Users

Create the initial administrator using the project's configured script:

```bash
npm run create-admin
```

Additional users can be created using the project's user creation script. Follow the environment variables and role requirements defined by the scripts.

## Inventory and Billing

- Add and manage products using their unique identifiers.
- Record stock additions, removals, damage, returns, and corrections.
- Generate invoices using database-backed product prices and stock.
- Apply discounts and GST according to the configured billing rules.
- Manage clients and credit sales.

## Reports

Reports use invoice data to calculate sales, order counts, average order value, tax, discounts, gross profit, category performance, and top-selling products.

## Security

- Password hashing
- Signed HTTP-only session cookies
- Server-side validation
- Protected application and API routes
- Login throttling
- CSV formula-injection protection

## Deployment

Production deployment requires a supported Node.js host, a production MySQL database, and correctly configured environment variables.

Before deploying:

1. Provision a separate production database.
2. Configure `DATABASE_URL`, `AUTH_SECRET`, and `NEXT_PUBLIC_APP_URL` in the hosting platform.
3. Apply the project's reviewed Prisma migrations.
4. Build and test the application.
5. Create the production administrator securely.
6. Verify login, inventory, billing, invoices, and reports.

Do not use the local development database as the production database.

## Development Checks

```bash
npm run typecheck
npm test
npx prisma validate
```

Run only the scripts that exist in `package.json`.

**Important:** Database reset scripts can delete data. Back up the database before running any reset or destructive migration command.
