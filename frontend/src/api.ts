export type Product = {
  id: string
  name: string
  sku: string
  category: string
  price: number
  costPrice: number
  taxRate: number
  inDemand: boolean
  stock: number
  qtyDisplay: number
  qtyWarehouse: number
  qtyHome: number
}

export type Customer = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  notes: string | null
}

export type StockLocation = 'DISP' | 'WH' | 'HM'

export type Session = {
  accessToken: string
  user: {
    id: string
    email: string
    name: string
    storeId: string
    storeName: string
    role: string
  }
}

export type StoreSettings = {
  storeName: string
  currency: string
  timezone: string
  defaultCustomerId: string | null
}

export type DashboardSummary = {
  grossSales: number
  orderCount: number
  itemsSold: number
  averageOrder: number
  grossSalesChange: number | null
  orderCountChange: number | null
  itemsSoldChange: number | null
  averageOrderChange: number | null
  todaySales: number
  todayOrderCount: number
  weeklySales: number
  weeklyOrderCount: number
  monthlySales: number
  monthlyOrderCount: number
  dailySales: Array<{ date: string; label: string; total: number; previousTotal: number }>
  stock: { units: number; healthy: number; low: number; out: number }
  recentSales: Array<{ receiptNumber: string; total: number; soldAt: string; customerName: string }>
}

export type SaleRecord = {
  id: string
  receiptNumber: string
  soldAt: string
  status: string
  currency: string
  totalAmount: number
  paidAmount: number
  dueAmount: number
  paymentStatus: 'paid' | 'partial' | 'unpaid'
  customer: { id: string; firstName: string; lastName: string } | null
  items: Array<{ nameSnapshot: string; skuSnapshot: string; quantity: number; lineTotal: number }>
  payments: Array<{ amount: number; method: string; paidAt: string }>
}

const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/$/, '')

async function request<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string | string[] } | null
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message
    throw new Error(message || `Request failed (${response.status})`)
  }

  return response.json() as Promise<T>
}

export function login(email: string, password: string) {
  return request<Session>('/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function getDashboardSummary(token: string) {
  return request<DashboardSummary>('/dashboard/summary', token)
}

export function listSales(token: string) {
  return request<SaleRecord[]>('/sales', token)
}

export async function listProducts(token: string): Promise<Product[]> {
  const rows = await request<Array<Omit<Product, 'category'> & { category?: string | { name: string } | null }>>('/products', token)
  return rows.map(({ category, ...product }) => ({
    ...product,
    category: typeof category === 'string' ? category : category?.name ?? 'General',
    costPrice: Number(product.costPrice),
    taxRate: Number(product.taxRate),
  }))
}

export type ProductInput = Omit<Product, 'id' | 'stock'>

export async function createProduct(token: string, product: ProductInput) {
  const created = await request<Omit<Product, 'category'> & { category?: string }>('/products', token, {
    method: 'POST',
    body: JSON.stringify(product),
  })
  return { ...created, category: product.category, costPrice: Number(created.costPrice), taxRate: Number(created.taxRate) }
}

export async function updateProduct(token: string, productId: string, product: Partial<ProductInput>) {
  const updated = await request<Product>(`/products/${productId}`, token, {
    method: 'PATCH',
    body: JSON.stringify(product),
  })
  return { ...updated, costPrice: Number(updated.costPrice), taxRate: Number(updated.taxRate) }
}

export function deleteProduct(token: string, productId: string) {
  return request<{ id: string; deleted: boolean }>(`/products/${productId}`, token, { method: 'DELETE' })
}

export function getStoreSettings(token: string) {
  return request<StoreSettings>('/settings', token)
}

export function updateStoreSettings(token: string, settings: StoreSettings) {
  return request<StoreSettings>('/settings', token, {
    method: 'PATCH',
    body: JSON.stringify(settings),
  })
}

export function restockProduct(token: string, productId: string, quantity: number) {
  return request<{ productId: string; location: StockLocation; quantity: number; totalQty: number }>(`/products/${productId}/restock`, token, {
    method: 'POST',
    body: JSON.stringify({ quantity, location: 'DISP' }),
  })
}

export function restockAtLocation(token: string, productId: string, quantity: number, location: StockLocation) {
  return request<{ productId: string; location: StockLocation; quantity: number; totalQty: number }>(`/products/${productId}/restock`, token, {
    method: 'POST',
    body: JSON.stringify({ quantity, location }),
  })
}

export function adjustStock(token: string, productId: string, delta: number, location: StockLocation) {
  return request<{ productId: string; location: StockLocation; quantity: number; totalQty: number }>(`/products/${productId}/adjust-stock`, token, {
    method: 'PATCH',
    body: JSON.stringify({ delta, location }),
  })
}

export function listCustomers(token: string) {
  return request<Customer[]>('/customers', token)
}

export function createCustomer(token: string, customer: Omit<Customer, 'id'>) {
  return request<Customer>('/customers', token, {
    method: 'POST',
    body: JSON.stringify(customer),
  })
}

export function updateCustomer(token: string, customerId: string, customer: Partial<Omit<Customer, 'id'>>) {
  return request<Customer>(`/customers/${customerId}`, token, {
    method: 'PATCH',
    body: JSON.stringify(customer),
  })
}

export function deleteCustomer(token: string, customerId: string) {
  return request<{ id: string; deleted: boolean }>(`/customers/${customerId}`, token, { method: 'DELETE' })
}

export function checkout(token: string, lines: Array<{ productId: string; quantity: number }>, payment: { customerId: string | null; useDefaultCustomer: boolean; amountReceived?: number; paymentMethod: string }) {
  return request<{ id: string; receiptNumber: string; totalAmount: string; paidAmount: string; dueAmount: string }>('/sales/checkout', token, {
    method: 'POST',
    body: JSON.stringify({ lines, ...payment }),
  })
}

export function recordSalePayment(token: string, saleId: string, amount: number, method: string) {
  return request<{ saleId: string; paidAmount: string; dueAmount: string; paymentStatus: 'paid' | 'partial' }>(`/sales/${saleId}/payments`, token, {
    method: 'POST',
    body: JSON.stringify({ amount, method }),
  })
}