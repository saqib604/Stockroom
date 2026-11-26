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
  pendingAmount: number
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
    isOwner: boolean
    permissions: string[]
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

export type AccessRole = { id: string; name: string; description: string | null; isOwner: boolean; isEditable: boolean; permissionKeys: string[] }
export type AccessPermission = { key: string; description: string | null }
export type StoreUser = { id: string; email: string; firstName: string; lastName: string; isActive: boolean; roleId: string; roleName: string }

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

export function getCurrentSession(token: string) {
  return request<Omit<Session, 'accessToken'>['user']>('/auth/session', token)
}

export function getDashboardSummary(token: string) {
  return request<DashboardSummary>('/dashboard/summary', token)
}

function withQuery(path: string, values: Record<string, string | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value && value !== 'all') query.set(key, value)
  }
  const queryString = query.toString()
  return queryString ? `${path}?${queryString}` : path
}

export function listSales(token: string, filters: { search?: string; paymentStatus?: string; date?: string } = {}) {
  return request<SaleRecord[]>(withQuery('/sales', filters), token)
}

export async function listProducts(token: string, filters: { search?: string; stock?: string; category?: string } = {}): Promise<Product[]> {
  const rows = await request<Array<Omit<Product, 'category'> & { category?: string | { name: string } | null }>>(withQuery('/products', filters), token)
  return rows.map(({ category, ...product }) => ({
    ...product,
    category: typeof category === 'string' ? category : category?.name ?? 'General',
    costPrice: Number(product.costPrice),
    taxRate: Number(product.taxRate),
  }))
}

export function listProductCategories(token: string) {
  return request<string[]>('/products/categories', token)
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

export function listCustomers(token: string, filters: { search?: string } = {}) {
  return request<Customer[]>(withQuery('/customers', filters), token)
}

export function createCustomer(token: string, customer: Omit<Customer, 'id' | 'pendingAmount'>) {
  return request<Customer>('/customers', token, {
    method: 'POST',
    body: JSON.stringify(customer),
  })
}

export function updateCustomer(token: string, customerId: string, customer: Partial<Omit<Customer, 'id' | 'pendingAmount'>>) {
  return request<Customer>(`/customers/${customerId}`, token, {
    method: 'PATCH',
    body: JSON.stringify(customer),
  })
}

export function deleteCustomer(token: string, customerId: string) {
  return request<{ id: string; deleted: boolean }>(`/customers/${customerId}`, token, { method: 'DELETE' })
}

export function checkout(token: string, lines: Array<{ productId: string; quantity: number }>, payment: { customerId: string | null; useDefaultCustomer: boolean; amountReceived?: number; paymentMethod: string; discountAmount?: number }) {
  return request<{ id: string; receiptNumber: string; totalAmount: string; paidAmount: string; dueAmount: string }>('/sales/checkout', token, {
    method: 'POST',
    body: JSON.stringify({ lines, ...payment }),
  })
}

export function getAccessRoles(token: string) {
  return request<{ roles: AccessRole[]; permissions: AccessPermission[] }>('/access/roles', token)
}

export function listStoreUsers(token: string) {
  return request<StoreUser[]>('/access/users', token)
}

export function createStoreUser(token: string, user: { email: string; password: string; firstName: string; lastName: string; roleId: string }) {
  return request<StoreUser>('/access/users', token, { method: 'POST', body: JSON.stringify(user) })
}

export function updateStoreUser(token: string, userId: string, user: Partial<Pick<StoreUser, 'email' | 'firstName' | 'lastName' | 'roleId' | 'isActive'>> & { password?: string }) {
  return request<StoreUser>(`/access/users/${userId}`, token, { method: 'PATCH', body: JSON.stringify(user) })
}

export function deleteStoreUser(token: string, userId: string) {
  return request<{ id: string; deleted: boolean }>(`/access/users/${userId}`, token, { method: 'DELETE' })
}

export function createAccessRole(token: string, role: { name: string; description: string; permissionKeys: string[] }) {
  return request<AccessRole>('/access/roles', token, { method: 'POST', body: JSON.stringify(role) })
}

export function setRolePermissions(token: string, roleId: string, permissionKeys: string[]) {
  return request<Pick<AccessRole, 'id' | 'name' | 'permissionKeys'>>(`/access/roles/${roleId}/permissions`, token, {
    method: 'PATCH',
    body: JSON.stringify({ permissionKeys }),
  })
}

export function recordSalePayment(token: string, saleId: string, amount: number, method: string) {
  return request<{ saleId: string; paidAmount: string; dueAmount: string; paymentStatus: 'paid' | 'partial' }>(`/sales/${saleId}/payments`, token, {
    method: 'POST',
    body: JSON.stringify({ amount, method }),
  })
}