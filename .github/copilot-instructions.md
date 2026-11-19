# Stockroom Workspace

- This is a React 19 + Vite + TypeScript frontend in `frontend/` and NestJS API in `api/`.
- `database/mysql/001_schema.sql` is the authoritative MySQL 8 schema. Keep `apps/api/prisma/schema.prisma` aligned with it.
- Frontend source is in `frontend/src/`; API source is in `api/src/`.
- Core records are store-scoped. Preserve store scoping for every API query and mutation.
- Sales checkout must be transactional and record inventory movements; never update stock outside the sale transaction.
- Use decimal database types for money. Treat browser sample data as demonstration data, not persisted records.
- Do not commit `.env` files, JWT secrets, or real credentials. Use `.env.example` as the template.
- Run `cd frontend && npm run build` for frontend changes.
- Run `cd api && npm run build && npm run db:generate` for API/schema changes.
