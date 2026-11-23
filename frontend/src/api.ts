export type Product = {
  id: string
  name: string
  sku: string
  category: string
  price: number
  stock: number
}

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

export type DashboardSummary = {
  grossSales: number
  orderCount: number
  itemsSold: number
  averageOrder: number
  grossSalesChange: number | null
  orderCountChange: number | null
  itemsSoldChange: number | null
  averageOrderChange: number | null
  monthlySales: number
  dailySales: Array<{ date: string; label: string; total: number; previousTotal: number }>
  stock: { units: number; healthy: number; low: number; out: number }
  recentSales: Array<{ receiptNumber: string; total: number; soldAt: string; customerName: string }>
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

export async function listProducts(token: string): Promise<Product[]> {
  const rows = await request<Array<Omit<Product, 'category'> & { category?: string | { name: string } | null }>>('/products', token)
  return rows.map(({ category, ...product }) => ({
    ...product,
    category: typeof category === 'string' ? category : category?.name ?? 'General',
  }))
}

export async function createProduct(token: string, product: Omit<Product, 'id'>) {
  const created = await request<Omit<Product, 'category'> & { category?: string }>('/products', token, {
    method: 'POST',
    body: JSON.stringify(product),
  })
  return { ...created, category: product.category }
}

export function restockProduct(token: string, productId: string, quantity: number) {
  return request<{ productId: string; quantityOnHand: number }>(`/products/${productId}/restock`, token, {
    method: 'POST',
    body: JSON.stringify({ quantity }),
  })
}

export function checkout(token: string, lines: Array<{ productId: string; quantity: number }>) {
  return request<{ id: string; receiptNumber: string; totalAmount: string }>('/sales/checkout', token, {
    method: 'POST',
    body: JSON.stringify({ lines }),
  })
}