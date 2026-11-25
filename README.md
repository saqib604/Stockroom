# Stockroom

Stockroom is a small-business point-of-sale and inventory workspace. The current frontend includes a responsive operations dashboard, product catalog, restocking actions, CSV export, product creation, and a sample checkout flow. The React screen currently uses in-memory demonstration data; the separately runnable API persists products and sales in MySQL.

## Project layout

- `frontend/` contains the React + Vite application.
- `api/` contains the NestJS API and Prisma schema.
- `database/mysql/` contains the authoritative MySQL DDL.

## Stack

- Frontend: React, TypeScript, Vite, Lucide
- API: NestJS, Prisma, MySQL 8
- Database definition: `database/mysql/001_schema.sql`

## Requirements

- Node.js 20+
- npm 10+
- Docker Compose (or a local MySQL 8 server)

## Local setup

1. Copy `api/.env.example` to `api/.env` and replace `JWT_SECRET` and `ADMIN_PASSWORD` with strong unique values. Keep `.env` private.
2. Copy `frontend/.env.example` to `frontend/.env`.
3. Start the database from the repository root: `docker compose --env-file api/.env up -d mysql`.
4. Install API packages: `cd api && npm install`.
5. Install frontend packages: `cd frontend && npm install`.
6. Generate Prisma Client: `cd api && npm run db:generate`.
7. Create the initial owner account: `cd api && npm run db:seed`.
8. Run the frontend: `cd frontend && npm run dev`.
9. In another terminal, run the API: `cd api && npm run dev`.

The Vite frontend is at `http://localhost:5173`; the API listens on `http://localhost:3001/api`. Protected routes require a bearer token from `POST /api/auth/login` with the `api/.env` owner credentials.

The compose file runs MySQL only. It initializes the schema on the first database volume creation. Removing that volume deletes local database data.

## API routes

- `POST /api/auth/login` with `{ "email": "...", "password": "..." }`
- `GET /api/products` with `Authorization: Bearer <accessToken>`
- `POST /api/products` with `{ "sku", "name", "category?", "price", "costPrice?", "taxRate?", "inDemand?", "stock?" }`
- `GET` and `PATCH /api/settings` to read or update store name, currency, timezone, and default customer
- `POST /api/products/:id/restock` with `{ "quantity", "note?" }`
- `GET /api/sales` for the store sales ledger and payment balances
- `POST /api/sales/checkout` with `{ "lines": [{ "productId", "quantity" }], "paymentMethod?", "customerId?", "amountReceived?" }`
- `POST /api/sales/:id/payments` to record an additional payment against an outstanding balance

The Sales workspace opens to the ledger. Choose **New sale** to open the POS, search products by name/SKU/category, select a customer, and record a full or partial payment. Checkout validates store-owned products, checks inventory, and creates the sale, payment, line snapshots, and stock movement in one database transaction. Outstanding balances remain visible in the ledger and can receive additional payments. Credentials and payment card data are not stored by this starter API; card processing requires a payment provider integration.

In the frontend, set the store currency, time zone, and **Default customer** under **Settings**. The default customer is used for new sales unless a checkout request supplies another customer. Product sale prices are entered before tax; `taxRate` is a percentage (for example, `8.25` means 8.25%) added during checkout. Cost price is for inventory records and does not affect the checkout total.

## Database

For manual MySQL installation, execute `database/mysql/001_schema.sql` against MySQL 8.0.16+. It creates the database, tables, indexes, constraints, role/permission defaults, and referential rules. Do not use Prisma `db push` against an existing production database; use reviewed migration SQL for production changes.

For an existing database created from the original schema, apply any unapplied SQL upgrades in order before deploying the updated API: `002_inventory_locations.sql`, `003_product_in_demand.sql`, `004_store_scoped_roles.sql`, `005_role_owner_flag.sql`, `006_customer_read_permission.sql`, then `007_management_permissions.sql`. These upgrades preserve the existing database and data; do not rerun an upgrade already applied. In particular, migration 007 adds the `settings.write` and `users.write` permission records and assigns them to owner roles. Without those rows, the permission editor cannot offer these grants and the matching menus stay hidden.

## Build and checks

- `cd frontend && npm run build` builds the frontend.
- `cd api && npm run build` compiles the API.
- `cd api && npm run db:generate` validates Prisma and generates its client.
- `cd frontend && npm run lint` runs Oxlint.

## Current boundaries

The frontend authenticates against the API, while its dashboard sample presentation remains illustrative. Refunds, audit event emission, backup scheduling, Excel import, and fine-grained role-based endpoint authorization require additional end-to-end implementation before production use. Configure TLS, rate limits, secure secret storage, and a payment terminal/provider before handling real customer or payment data.
