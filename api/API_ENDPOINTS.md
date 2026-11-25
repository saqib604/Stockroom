# API Endpoints

Base URL for local development: `http://localhost:3001/api`

All endpoints are JSON. Protected endpoints require the access token returned by login:

```http
Authorization: Bearer <accessToken>
```

All records and queries are scoped to the store assigned to the authenticated user. Database IDs are returned as strings to preserve integer precision in JavaScript clients.

## Authentication

### `POST /auth/login`

Public. Authenticates a user and returns an eight-hour bearer token.

Request:

```json
{
  "email": "owner@example.com",
  "password": "your-password"
}
```

`email` must be a valid email address. `password` must contain at least 8 characters.

Successful response (`201`):

```json
{
  "accessToken": "<jwt>",
  "user": {
    "id": "1",
    "email": "owner@example.com",
    "name": "Store Owner",
    "storeId": "1",
    "storeName": "My Retail Store",
    "role": "owner",
    "isOwner": true,
    "permissions": ["products.read", "users.write"]
  }
}
```

Invalid credentials or a user without a store membership return `401`.

### `GET /auth/session`

Authentication required. Returns the current user's store membership, including the database-backed `isOwner` flag and current role permissions. This can be used to refresh permission-driven UI without requiring the user to sign in again.

## Users and roles

Apply `database/mysql/004_store_scoped_roles.sql` after `001_schema.sql` to enable store-owned custom roles. Access-management endpoints require `users.write`; store settings updates require `settings.write`. Owners receive both by default. Built-in roles are shared by default; changing a built-in non-owner role creates a store-scoped copy and moves this store's users on that role to the copy. Only an owner can assign or remove an owner membership.

Apply `database/mysql/005_role_owner_flag.sql` after `004_store_scoped_roles.sql` on existing databases. Apply `database/mysql/006_customer_read_permission.sql` after `005_role_owner_flag.sql` to add read-only customer access, then apply `database/mysql/007_management_permissions.sql` to ensure management permissions exist on existing installations. Fresh installs include these permissions in `001_schema.sql` and can still run the migrations safely.

`GET /auth/session` returns the authenticated user's current store role, owner flag, and permissions from the database. Clients can refresh this endpoint to keep permission-driven navigation current after role changes.

Access-management endpoints:

- `GET /access/roles` returns built-in roles, the current store's custom roles, and the available feature permissions.
- `POST /access/roles` creates a store-scoped role with a selected set of `permissionKeys`.
- `PATCH /access/roles/:id/permissions` replaces the feature permissions for a store-owned role or creates a store-scoped copy of a built-in non-owner role.
- `GET /access/users` lists users assigned to the current store with their role.
- `POST /access/users` creates a user and assigns them to a built-in or current-store role. Passwords must be at least 12 characters.
- `PATCH /access/users/:id` updates a store member's name, email, password, or store role. Passwords must be at least 12 characters when provided.
- `DELETE /access/users/:id` removes a user's membership from the current store without deleting their global account. The current user and the store's last owner cannot be removed.

The permission keys include `products.read`, `products.write`, `inventory.adjust`, `sales.read`, `sales.create`, `customers.read`, `customers.write`, `reports.read`, `settings.write`, and `users.write`. Customer listing requires `customers.read` or `customers.write`; customer changes require `customers.write`.

## Store settings

### `GET /settings`

Authentication required. Returns the current store's name, currency, IANA time zone, and optional default customer ID.

### `PATCH /settings`

Authentication required. Requires the `settings.write` role permission. All fields are optional; `defaultCustomerId: null` clears the default. A customer ID must belong to the authenticated store.

```json
{
  "storeName": "My Retail Store",
  "currency": "PKR",
  "timezone": "Asia/Karachi",
  "defaultCustomerId": "4"
}
```

Supported currencies are `USD`, `EUR`, `GBP`, and `PKR`. Supported time zones are `UTC`, `Asia/Karachi`, `America/New_York`, `America/Chicago`, and `America/Los_Angeles`.

## Dashboard

### `GET /dashboard/summary`

Authentication required. Returns summary data for the current user's store.

Successful response (`200`):

```json
{
  "grossSales": 2840.5,
  "orderCount": 48,
  "itemsSold": 126,
  "averageOrder": 59.18,
  "grossSalesChange": 12.8,
  "orderCountChange": 8.2,
  "itemsSoldChange": 4.6,
  "averageOrderChange": 2.1,
  "todaySales": 84,
  "todayOrderCount": 3,
  "weeklySales": 2840.5,
  "weeklyOrderCount": 48,
  "monthlySales": 18425.8,
  "monthlyOrderCount": 212,
  "dailySales": [
    {
      "date": "2026-11-19",
      "label": "Thu",
      "total": 325.5,
      "previousTotal": 288
    }
  ],
  "stock": {
    "units": 248,
    "healthy": 213,
    "low": 28,
    "out": 7
  },
  "recentSales": [
    {
      "receiptNumber": "R-1732032000000-a1b2c3",
      "total": 84,
      "soldAt": "2026-11-19T15:00:00.000Z",
      "customerName": "Walk-in customer"
    }
  ]
}
```

- `todaySales` and `todayOrderCount` are completed sales for the current date in the store's configured time zone.
- `weeklySales` and `weeklyOrderCount` are the latest seven local calendar days. The existing change fields compare that period with the prior seven days.
- `monthlySales` and `monthlyOrderCount` are month-to-date in the store's configured time zone.
- `dailySales` contains one item per day for the latest seven-day period, with the matching previous-week total.
- A change field is `null` when the previous period has no sales to compare.
- Stock counts include active products only; `healthy`, `low`, and `out` count products, while `units` sums on-hand inventory. Low stock means 1-8 units.
- `recentSales` contains up to five most recent sales for the store.

## Products

### `GET /products`

Authentication required. Returns the current store's non-deleted products ordered by name.

Successful response (`200`):

```json
[
  {
    "id": "12",
    "storeId": "1",
    "categoryId": "3",
    "sku": "MUG-01",
    "barcode": null,
    "name": "Stoneware Mug",
    "description": null,
    "taxRate": "0.000",
    "trackInventory": true,
    "reorderLevel": 0,
    "isActive": true,
    "createdAt": "2026-11-19T15:00:00.000Z",
    "updatedAt": "2026-11-19T15:00:00.000Z",
    "deletedAt": null,
    "category": "Kitchen",
    "price": 24,
    "costPrice": 10,
    "stock": 32
  }
]
```

`categoryId` and `category` can be `null`; `stock` is `0` when no inventory row exists.

### `POST /products`

Authentication required. Only `owner` and `manager` roles may create products. Product and opening inventory are created transactionally.

Request:

```json
{
  "sku": "MUG-01",
  "name": "Stoneware Mug",
  "category": "Kitchen",
  "price": 24,
  "costPrice": 10,
  "taxRate": 8.25,
  "inDemand": true,
  "stock": 32
}
```

- `sku` and `name` are required non-empty strings.
- `category` is optional; when present it is created or reused for the store.
- `price` is required and must be a number greater than or equal to zero.
- `costPrice` is optional and must be a non-negative number; defaults to `0`.
- `taxRate` is an optional percentage added to the sale price at checkout; defaults to `0`.
- `inDemand` is an optional boolean catalog marker; defaults to `false`.
- `stock` is optional and must be a non-negative integer; defaults to `0`.

Successful response (`201`):

```json
{
  "id": "12",
  "sku": "MUG-01",
  "name": "Stoneware Mug",
  "sellingPrice": "24",
  "categoryId": "3",
  "price": 24,
  "stock": 32
}
```

Store SKUs must be unique. The database enforces this, but duplicate-SKU errors are not currently translated into a dedicated API response and may surface as `500 Internal Server Error`.

### `PATCH /products/:id` and `DELETE /products/:id`

Authentication required. Only `owner` and `manager` roles may edit or delete products. `PATCH` accepts any subset of the product fields from creation, including inventory quantities; inventory changes are recorded as movements. `DELETE` soft-deletes the product so historical sales and stock records are retained.

## Customers

### `GET /customers` and `POST /customers`

Authentication required. Lists non-deleted customers for the current store or creates a customer in that store.

### `PATCH /customers/:id` and `DELETE /customers/:id`

Authentication required. Only `owner` and `manager` roles may edit or delete customers. `PATCH` accepts any subset of customer fields. `DELETE` soft-deletes the customer and clears it as the store's default customer if selected.

### `POST /products/:id/restock`

Authentication required. Only `owner` and `manager` roles may restock. Inventory and the movement record are updated in one transaction.

Request:

```json
{
  "quantity": 10,
  "note": "Delivery received"
}
```

`quantity` is a positive integer; `note` is optional.

Successful response (`201`):

```json
{
  "productId": "12",
  "quantityOnHand": 42
}
```

Invalid IDs return `400`; a product not found in the user's store returns `404`.

## Sales

### `GET /sales`

Authentication required. Returns up to 200 sales for the authenticated store, newest first. Each row includes its customer, item snapshots, payment history, `paidAmount`, `dueAmount`, and `paymentStatus` (`paid`, `partial`, or `unpaid`).

### `POST /sales/checkout`

Authentication required. Records a completed sale, payment, sale items, inventory changes, and inventory movements in one transaction. Inventory is never decremented outside this transaction.

Request:

```json
{
  "lines": [
    { "productId": "12", "quantity": 2 }
  ],
  "paymentMethod": "cash",
  "customerId": "5",
  "useDefaultCustomer": false,
  "amountReceived": 50
}
```

- `lines` is required and must contain at least one line.
- Each `productId` must be a positive integer string and each `quantity` a positive integer.
- `paymentMethod` is optional: `cash`, `card`, `gift_card`, `store_credit`, or `other`. Defaults to `cash`.
- `customerId` is optional and, when provided, must identify a non-deleted customer in the user's store.
- `useDefaultCustomer` defaults to `true`; set it to `false` to explicitly make the sale a walk-in when no `customerId` is selected.
- `amountReceived` is optional and defaults to the full total. It may be `0` for an unpaid sale, or any amount up to the total; a remaining balance is tracked as due.

Successful response (`201`):

```json
{
  "id": "31",
  "receiptNumber": "R-1732032000000-a1b2c3",
  "subtotal": "48.00",
  "taxAmount": "0.00",
  "totalAmount": "48.00",
  "paidAmount": "48.00",
  "dueAmount": "0.00",
  "status": "completed"
}
```

Invalid or unavailable products/customers return `400` or `404`. Insufficient inventory returns `409` and rolls back the sale transaction.

### `POST /sales/:id/payments`

Authentication required. Records a payment against a completed sale in the current store. The amount must be positive and cannot exceed its remaining balance.

```json
{ "amount": 25, "method": "cash" }
```

## Common Errors

NestJS error responses have this general shape:

```json
{
  "statusCode": 401,
  "message": "Bearer token required",
  "error": "Unauthorized"
}
```

- `400 Bad Request`: invalid request body or ID.
- `401 Unauthorized`: missing, invalid, or expired bearer token; invalid login credentials.
- `403 Forbidden`: role is not permitted to create products or restock.
- `404 Not Found`: requested product/customer does not exist in the authenticated store.
- `409 Conflict`: insufficient stock during checkout.
- A duplicate product SKU is currently an unmapped database constraint error and may surface as `500 Internal Server Error`.

## Configuration

- API port: `API_PORT` in `api/.env` (defaults to `3001`).
- Allowed browser origin(s): `WEB_ORIGIN` in `api/.env`. Use a comma-separated list for explicit origins. Localhost and `127.0.0.1` development ports are also allowed.
- Frontend API base URL: `VITE_API_URL` in `frontend/.env` (defaults to `http://localhost:3001/api`).
