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
    "role": "owner"
  }
}
```

Invalid credentials or a user without a store membership return `401`.

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
  "monthlySales": 18425.8,
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

- Sales cards compare the latest seven UTC calendar days with the seven days before them.
- `dailySales` contains one item per day for the latest seven-day period, with the matching previous-week total.
- A change field is `null` when the previous period has no sales to compare.
- `monthlySales` is completed sales month-to-date in UTC.
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
  "stock": 32
}
```

- `sku` and `name` are required non-empty strings.
- `category` is optional; when present it is created or reused for the store.
- `price` is required and must be a number greater than or equal to zero.
- `costPrice` is optional and must be a non-negative number; defaults to `0`.
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

### `POST /sales/checkout`

Authentication required. Records a completed sale, payment, sale items, inventory changes, and inventory movements in one transaction. Inventory is never decremented outside this transaction.

Request:

```json
{
  "lines": [
    { "productId": "12", "quantity": 2 }
  ],
  "paymentMethod": "cash",
  "customerId": "5"
}
```

- `lines` is required and must contain at least one line.
- Each `productId` must be a positive integer string and each `quantity` a positive integer.
- `paymentMethod` is optional: `cash`, `card`, `gift_card`, `store_credit`, or `other`. Defaults to `cash`.
- `customerId` is optional and, when provided, must identify a non-deleted customer in the user's store.

Successful response (`201`):

```json
{
  "id": "31",
  "receiptNumber": "R-1732032000000-a1b2c3",
  "subtotal": "48.00",
  "taxAmount": "0.00",
  "totalAmount": "48.00",
  "status": "completed"
}
```

Invalid or unavailable products/customers return `400` or `404`. Insufficient inventory returns `409` and rolls back the sale transaction.

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
