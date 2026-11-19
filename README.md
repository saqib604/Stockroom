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
- `POST /api/products` with `{ "sku", "name", "category?", "price", "costPrice?", "stock?" }`
- `POST /api/products/:id/restock` with `{ "quantity", "note?" }`
- `POST /api/sales/checkout` with `{ "lines": [{ "productId", "quantity" }], "paymentMethod?", "customerId?" }`

Checkout validates store-owned products, checks inventory, and creates the sale, payment, line snapshots, and stock movement in one database transaction. Credentials and payment card data are not stored by this starter API; card processing requires a payment provider integration.

## Database

For manual MySQL installation, execute `database/mysql/001_schema.sql` against MySQL 8.0.16+. It creates the database, tables, indexes, constraints, role/permission defaults, and referential rules. Do not use Prisma `db push` against an existing production database; use reviewed migration SQL for production changes.

## Build and checks

- `cd frontend && npm run build` builds the frontend.
- `cd api && npm run build` compiles the API.
- `cd api && npm run db:generate` validates Prisma and generates its client.
- `cd frontend && npm run lint` runs Oxlint.

## Current boundaries

The frontend does not yet authenticate against the API, and its seeded screen values are illustrative. Customer management, refunds, audit event emission, backup scheduling, Excel import, and role-based endpoint authorization are represented in the database design but require additional end-to-end implementation before production use. Configure TLS, rate limits, secure secret storage, and a payment terminal/provider before handling real customer or payment data.
