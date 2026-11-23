import { useEffect, useMemo, useState } from 'react'
import { Archive, ArrowDownRight, ArrowUpRight, Bell, Boxes, ChartNoAxesCombined, ChevronDown, CircleDollarSign, ClipboardList, Download, LayoutDashboard, PackagePlus, Pencil, Plus, Search, Settings, ShoppingCart, Trash2, Users, X } from 'lucide-react'
import { adjustStock, checkout as submitCheckout, createCustomer, createProduct, deleteCustomer, deleteProduct, getDashboardSummary, getStoreSettings, listCustomers, listProducts, listSales, login, recordSalePayment, restockAtLocation, updateCustomer, updateProduct, updateStoreSettings, type Customer, type DashboardSummary, type Product, type SaleRecord, type Session, type StockLocation, type StoreSettings } from './api'
import './App.css'
import './login.css'

type Section = 'Overview' | 'Products' | 'Inventory' | 'Sales' | 'Customers' | 'Reports' | 'Settings'
const sections: { name: Section; icon: typeof LayoutDashboard }[] = [
  { name: 'Overview', icon: LayoutDashboard }, { name: 'Products', icon: Archive }, { name: 'Inventory', icon: Boxes },
  { name: 'Sales', icon: ShoppingCart }, { name: 'Customers', icon: Users }, { name: 'Reports', icon: ChartNoAxesCombined },
]
function App() {
  const [section, setSection] = useState<Section>('Overview')
  const [session, setSession] = useState<Session | null>(() => {
    const saved = localStorage.getItem('stockroom-session')
    return saved ? JSON.parse(saved) as Session : null
  })
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [sales, setSales] = useState<SaleRecord[]>([])
  const [settings, setSettings] = useState<StoreSettings>({ storeName: '', currency: 'USD', timezone: 'UTC', defaultCustomerId: null })
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [showProductForm, setShowProductForm] = useState(false)
  const [showCustomerForm, setShowCustomerForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [posMode, setPosMode] = useState(false)
  const [posSearch, setPosSearch] = useState('')
  const [saleCustomerId, setSaleCustomerId] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [paymentSale, setPaymentSale] = useState<SaleRecord | null>(null)
  const [paymentEntry, setPaymentEntry] = useState('')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [notice, setNotice] = useState('')
  const [loginError, setLoginError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const money = useMemo(() => new Intl.NumberFormat(settings.currency === 'PKR' ? 'en-PK' : 'en-US', { style: 'currency', currency: settings.currency }), [settings.currency])
  const chartMoney = useMemo(() => new Intl.NumberFormat(settings.currency === 'PKR' ? 'en-PK' : 'en-US', { style: 'currency', currency: settings.currency, notation: 'compact', maximumFractionDigits: 0 }), [settings.currency])
  const todayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: settings.timezone }).format(new Date()).toUpperCase()
  const matches = useMemo(() => products.filter((p) => `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(query.toLowerCase())), [products, query])
  const count = Object.values(cart).reduce((sum, itemCount) => sum + itemCount, 0)
  const total = products.reduce((sum, p) => {
    const subtotalCents = Math.round(p.price * 100) * (cart[p.id] ?? 0)
    const taxCents = Math.round(subtotalCents * Math.round(p.taxRate * 1000) / 100000)
    return sum + (subtotalCents + taxCents) / 100
  }, 0)
  const alert = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 2500) }
  const refreshData = async (token: string) => {
    const [rows, summary] = await Promise.all([listProducts(token), getDashboardSummary(token)])
    setProducts(rows)
    setDashboard(summary)
  }

  useEffect(() => {
    if (!session) return
    let active = true
    Promise.all([listProducts(session.accessToken), getDashboardSummary(session.accessToken), getStoreSettings(session.accessToken)]).then(([rows, summary, storeSettings]) => {
      if (active) {
        setProducts(rows)
        setDashboard(summary)
        setSettings(storeSettings)
      }
    }).catch((error: unknown) => {
      if (!active) return
      localStorage.removeItem('stockroom-session')
      setSession(null)
      setProducts([])
      setNotice(error instanceof Error ? error.message : 'Could not load products')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [session])

  useEffect(() => {
    if (!session || !['Customers', 'Settings', 'Sales'].includes(section)) return
    listCustomers(session.accessToken).then(setCustomers).catch((error: unknown) => {
      alert(error instanceof Error ? error.message : 'Could not load customers')
    })
    if (section === 'Sales') listSales(session.accessToken).then(setSales).catch((error: unknown) => {
      alert(error instanceof Error ? error.message : 'Could not load sales')
    })
  }, [session, section])

  const signIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setLoginError('')
    try {
      const signedIn = await login(email, password)
      localStorage.setItem('stockroom-session', JSON.stringify(signedIn))
      setLoading(true)
      setSession(signedIn)
      setPassword('')
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Unable to sign in')
    } finally {
      setBusy(false)
    }
  }

  const signOut = () => {
    localStorage.removeItem('stockroom-session')
    setSession(null)
    setProducts([])
    setDashboard(null)
    setCart({})
  }

  const restock = async (id: string, location: StockLocation = 'DISP', quantity = 1) => {
    if (!session) return
    setBusy(true)
    try {
      await restockAtLocation(session.accessToken, id, quantity, location)
      await refreshData(session.accessToken)
      alert('Inventory restocked')
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not restock product')
    } finally {
      setBusy(false)
    }
  }
  const adjustQuantity = async (id: string, location: StockLocation, delta: number) => {
    if (!session) return
    setBusy(true)
    try {
      await adjustStock(session.accessToken, id, delta, location)
      await refreshData(session.accessToken)
      alert(delta > 0 ? 'Stock increased' : 'Stock decreased')
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not adjust stock')
    } finally {
      setBusy(false)
    }
  }

  const exportCsv = () => {
    const csv = [['SKU', 'Product', 'Category', 'Price', 'Stock'], ...products.map((p) => [p.sku, p.name, p.category, String(p.price), String(p.stock)])].map((row) => row.map((field) => `"${field.replaceAll('"', '""')}"`).join(',')).join('\n')
    const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); anchor.download = 'stockroom-products.csv'; anchor.click(); URL.revokeObjectURL(anchor.href); alert('Product export downloaded')
  }
  const addProduct = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget)
    const name = String(data.get('name') ?? '').trim(); const sku = String(data.get('sku') ?? '').trim(); const price = Number(data.get('price'))
    const costPrice = Number(data.get('costPrice') || 0); const taxRate = Number(data.get('taxRate') || 0); const inDemand = data.get('inDemand') === 'on'
    const qtyDisplay = Number(data.get('qtyDisplay') || 0); const qtyWarehouse = Number(data.get('qtyWarehouse') || 0); const qtyHome = Number(data.get('qtyHome') || 0)
    if (!name || !sku || ![price, costPrice, taxRate, qtyDisplay, qtyWarehouse, qtyHome].every(Number.isFinite)) return
    if (!session) return
    setBusy(true)
    try {
      const productInput = { name, sku, price, costPrice, taxRate, inDemand, qtyDisplay, qtyWarehouse, qtyHome, category: String(data.get('category') || 'General') }
      if (editingProduct) await updateProduct(session.accessToken, editingProduct.id, productInput)
      else await createProduct(session.accessToken, productInput)
      await refreshData(session.accessToken)
      setShowProductForm(false)
      setEditingProduct(null)
      alert(editingProduct ? 'Product updated' : 'Product added to catalog')
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not add product')
    } finally {
      setBusy(false)
    }
  }
  const addCustomer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!session) return
    const data = new FormData(event.currentTarget)
    setBusy(true)
    try {
      const customerData = {
        firstName: String(data.get('firstName') ?? '').trim(),
        lastName: String(data.get('lastName') ?? '').trim(),
        email: String(data.get('email') ?? '').trim() || null,
        phone: String(data.get('phone') ?? '').trim() || null,
        notes: String(data.get('notes') ?? '').trim() || null,
      }
      const customer = editingCustomer
        ? await updateCustomer(session.accessToken, editingCustomer.id, customerData)
        : await createCustomer(session.accessToken, customerData)
      setCustomers((current) => [...current.filter((item) => item.id !== customer.id), customer].sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)))
      setShowCustomerForm(false)
      setEditingCustomer(null)
      alert(editingCustomer ? 'Customer updated' : 'Customer added')
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not add customer')
    } finally {
      setBusy(false)
    }
  }
  const removeProduct = async (product: Product) => {
    if (!session || !window.confirm(`Delete ${product.name}? It will be removed from the catalog but retained in sales history.`)) return
    setBusy(true)
    try {
      await deleteProduct(session.accessToken, product.id)
      await refreshData(session.accessToken)
      alert('Product deleted')
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not delete product')
    } finally {
      setBusy(false)
    }
  }
  const removeCustomer = async (customer: Customer) => {
    if (!session || !window.confirm(`Delete ${customer.firstName} ${customer.lastName}? Existing sales will be retained.`)) return
    setBusy(true)
    try {
      await deleteCustomer(session.accessToken, customer.id)
      setCustomers((current) => current.filter((item) => item.id !== customer.id))
      if (settings.defaultCustomerId === customer.id) setSettings((current) => ({ ...current, defaultCustomerId: null }))
      alert('Customer deleted')
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not delete customer')
    } finally {
      setBusy(false)
    }
  }
  const saveSettings = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!session) return
    setBusy(true)
    try {
      const saved = await updateStoreSettings(session.accessToken, settings)
      setSettings(saved)
      const updatedSession = { ...session, user: { ...session.user, storeName: saved.storeName } }
      localStorage.setItem('stockroom-session', JSON.stringify(updatedSession))
      setSession(updatedSession)
      alert('Store settings saved')
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not save store settings')
    } finally {
      setBusy(false)
    }
  }
  const checkout = async () => {
    if (!count || !session) return
    setBusy(true)
    try {
      const sale = await submitCheckout(session.accessToken, Object.entries(cart).filter(([, quantity]) => quantity > 0).map(([productId, quantity]) => ({ productId, quantity })), {
        customerId: saleCustomerId || null,
        useDefaultCustomer: false,
        amountReceived: paymentAmount === '' ? undefined : Number(paymentAmount),
        paymentMethod,
      })
      await refreshData(session.accessToken)
      const updatedSales = await listSales(session.accessToken)
      setSales(updatedSales)
      setCart({})
      setPaymentAmount('')
      setPosSearch('')
      setPosMode(false)
      alert(`Sale ${sale.receiptNumber} recorded · ${money.format(Number(sale.paidAmount))} paid · ${money.format(Number(sale.dueAmount))} due`)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Checkout failed')
      await refreshData(session.accessToken).catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }
  const addPayment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!session || !paymentSale || !Number(paymentEntry)) return
    setBusy(true)
    try {
      await recordSalePayment(session.accessToken, paymentSale.id, Number(paymentEntry), paymentMethod)
      setSales(await listSales(session.accessToken))
      setPaymentSale(null)
      setPaymentEntry('')
      alert('Payment recorded')
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not record payment')
    } finally {
      setBusy(false)
    }
  }
  const isProducts = section === 'Products' || section === 'Inventory'
  const heading = section === 'Overview' ? `Good morning, ${session?.user.name.split(' ')[0] ?? 'there'}` : section

  if (!session) return <div className="login-screen"><form className="login-panel" onSubmit={signIn}><div className="brand login-brand"><span className="brand-mark">s</span><span>stockroom<span className="brand-dot">.</span></span></div><h1>Sign in</h1><p>Use your store owner or team account.</p><label>Email<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{loginError && <div className="login-error" role="alert">{loginError}</div>}<button className="button button-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form></div>

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => setSection('Overview')}><span className="brand-mark">s</span><span>stockroom<span className="brand-dot">.</span></span></button>
      <button className="store-switcher"><span className="store-avatar">{session.user.storeName.slice(0, 1)}</span><span className="store-meta"><strong>{session.user.storeName}</strong><small>{session.user.role}</small></span><ChevronDown size={15} /></button>
      <div className="nav-label">WORKSPACE</div><nav>{sections.map(({ name, icon: Icon }) => <button key={name} className={`nav-item ${section === name ? 'active' : ''}`} onClick={() => setSection(name)}><Icon size={18} /><span>{name}</span>{name === 'Inventory' && <span className="nav-count">{products.length}</span>}</button>)}</nav>
      <div className="nav-label preferences-label">PREFERENCES</div><button className={`nav-item ${section === 'Settings' ? 'active' : ''}`} onClick={() => setSection('Settings')}><Settings size={18} /><span>Settings</span></button>
      <div className="sidebar-spacer" /><div className="help-box"><span className="help-mark">?</span><span><strong>Need a hand?</strong><small>Visit the help center</small></span><ArrowUpRight size={15} /></div>
      <button className="profile-row" onClick={signOut} title="Sign out"><span className="profile-avatar">{session.user.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span><span className="store-meta"><strong>{session.user.name}</strong><small>Sign out</small></span><span>•••</span></button>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumb">Store <span>/</span> <strong>{section}</strong></div><div className="topbar-actions"><label className="global-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products..." aria-label="Search products" /><kbd>⌘ K</kbd></label><button className="icon-button" aria-label="Notifications" onClick={() => alert('You’re all caught up')}><Bell size={18} /><i /></button><span className="topbar-date">{new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: settings.timezone }).format(new Date())}</span></div></header>
      <div className="page-content">
        <div className="page-heading"><div><div className="eyebrow">{todayLabel} <i /></div><h1>{heading}</h1><p>{section === 'Overview' ? 'Here’s what’s happening at your store today.' : section === 'Sales' ? (posMode ? 'Build a sale, select a customer, and record payment.' : 'Sales history and outstanding customer balances.') : `${section} activity and store records.`}</p></div><div className="heading-actions"><button className="button button-secondary" onClick={exportCsv}><Download size={16} /> Export</button>{!['Reports', 'Settings'].includes(section) && <button className="button button-primary" disabled={busy} onClick={() => section === 'Sales' ? setPosMode((current) => { if (!current) { setSaleCustomerId(settings.defaultCustomerId ?? ''); setCart({}); setPaymentAmount('') } return !current }) : section === 'Customers' ? setShowCustomerForm(true) : setShowProductForm(true)}>{section === 'Sales' ? (posMode ? 'Sales list' : 'New sale') : <><Plus size={17} />{section === 'Customers' ? 'New customer' : 'New product'}</>}</button>}</div></div>
        {section === 'Overview' && <>
          <section className="metric-grid"><Metric label="Sales today" value={dashboard ? money.format(dashboard.todaySales) : '—'} trend={undefined} context="Today to date" icon={<CircleDollarSign size={17} />} /><Metric label="Orders today" value={dashboard ? String(dashboard.todayOrderCount) : '—'} trend={undefined} context="Today to date" icon={<ClipboardList size={17} />} /><Metric label="Sales · 7 days" value={dashboard ? money.format(dashboard.weeklySales) : '—'} trend={dashboard?.grossSalesChange} icon={<CircleDollarSign size={17} />} /><Metric label="Orders · 7 days" value={dashboard ? String(dashboard.weeklyOrderCount) : '—'} trend={dashboard?.orderCountChange} icon={<ClipboardList size={17} />} /><Metric label="Sales this month" value={dashboard ? money.format(dashboard.monthlySales) : '—'} trend={undefined} context="Month to date" icon={<CircleDollarSign size={17} />} /><Metric label="Orders this month" value={dashboard ? String(dashboard.monthlyOrderCount) : '—'} trend={undefined} context="Month to date" icon={<ClipboardList size={17} />} /><Metric label="Items sold · 7 days" value={dashboard ? String(dashboard.itemsSold) : '—'} trend={dashboard?.itemsSoldChange} icon={<Boxes size={17} />} /><Metric label="Average order · 7 days" value={dashboard ? money.format(dashboard.averageOrder) : '—'} trend={dashboard?.averageOrderChange} icon={<ChartNoAxesCombined size={17} />} /></section>
          <section className="overview-grid"><div className="panel sales-panel"><div className="panel-heading"><div><h2>Sales overview</h2><p>Completed sales · last 7 days</p></div><span className="select-button">Last 7 days <ChevronDown size={14} /></span></div><div className="chart-legend"><span><i className="legend-current" />This week</span><span><i className="legend-previous" />Previous week</span><strong>{money.format(dashboard?.grossSales ?? 0)} {dashboard?.grossSalesChange != null && <small>{dashboard.grossSalesChange >= 0 ? '+' : ''}{dashboard.grossSalesChange.toFixed(1)}%</small>}</strong></div><div className="chart-area"><div className="chart-y-labels">{[1000, 750, 500, 250, 0].map((amount) => <span key={amount}>{chartMoney.format(amount)}</span>)}</div><div className="chart-plot"><div className="chart-grid-lines"><i /><i /><i /><i /><i /></div><div className="bar-chart">{(dashboard?.dailySales ?? []).map((day) => { const max = Math.max(1, ...dashboard!.dailySales.flatMap((item) => [item.total, item.previousTotal])); return <div className="bar-group" key={day.date} title={`${day.date}: ${money.format(day.total)} this week, ${money.format(day.previousTotal)} previous week`}><span className="bar last-week" style={{ height: `${Math.max(2, day.previousTotal / max * 100)}%` }} /><span className="bar this-week" style={{ height: `${Math.max(2, day.total / max * 100)}%` }} /></div> })}</div><div className="chart-x-labels">{(dashboard?.dailySales ?? []).map((day) => <span key={day.date}>{day.label}</span>)}</div></div></div></div>
            <div className="panel inventory-panel"><div className="panel-heading"><div><h2>Stock health</h2><p>Current inventory status</p></div><button className="more-button" onClick={() => setSection('Inventory')}>•••</button></div><div className="stock-summary"><div className="stock-ring"><div><strong>{dashboard?.stock.units ?? '—'}</strong><span>total units</span></div></div><div className="stock-legend"><div><i className="stock-good" />Healthy <strong>{dashboard?.stock.healthy ?? '—'}</strong></div><div><i className="stock-low" />Low stock <strong>{dashboard?.stock.low ?? '—'}</strong></div><div><i className="stock-out" />Out of stock <strong>{dashboard?.stock.out ?? '—'}</strong></div></div></div><button className="text-link" onClick={() => setSection('Inventory')}>Review inventory <ArrowUpRight size={14} /></button></div></section>
          <section className="panel product-panel"><div className="panel-heading"><div><h2>Products to watch</h2><p>Items that may need your attention</p></div><button className="text-link" onClick={() => setSection('Inventory')}>View all inventory <ArrowUpRight size={14} /></button></div>{loading ? <div className="empty-state">Loading inventory…</div> : <ProductTable products={matches.filter((p) => p.stock <= 8).slice(0, 4)} money={money} onRestock={(id) => restock(id, 'DISP', 10)} onAdjust={adjustQuantity} />}</section>
          <section className="bottom-grid"><div className="panel activity-panel"><div className="panel-heading"><div><h2>Recent sales</h2><p>Latest transactions recorded by the API</p></div></div>{dashboard?.recentSales.length ? dashboard.recentSales.slice(0, 3).map((sale) => <Activity key={sale.receiptNumber} initials={sale.customerName.split(' ').map((part) => part[0]).join('').slice(0, 2)} name={sale.customerName} action={`receipt ${sale.receiptNumber}`} time={new Date(sale.soldAt).toLocaleString()} amount={money.format(sale.total)} />) : <div className="empty-state">No sales recorded yet.</div>}</div><div className="panel quick-panel"><div className="panel-heading"><div><h2>Quick actions</h2><p>Store operations</p></div></div><button className="quick-action" onClick={() => setSection('Sales')}><ShoppingCart size={18} /><span><strong>New sale</strong><small>Ring up a customer</small></span><ArrowUpRight size={15} /></button><button className="quick-action" onClick={() => setShowProductForm(true)}><PackagePlus size={18} /><span><strong>Add product</strong><small>Grow your catalog</small></span><ArrowUpRight size={15} /></button><button className="quick-action" onClick={exportCsv}><Download size={18} /><span><strong>Export data</strong><small>Download as CSV</small></span><ArrowUpRight size={15} /></button></div></section>
        </>}
        {isProducts && <section className="panel product-panel page-table-panel"><div className="table-toolbar"><div className="table-filters"><button className="filter-chip selected">All items <span>{products.length}</span></button><button className="filter-chip" onClick={() => setQuery('')}>Active</button><button className="filter-chip" onClick={() => setProducts((current) => [...current].sort((a, b) => a.stock - b.stock))}>Stock level <ChevronDown size={14} /></button></div><button className="button button-secondary compact" onClick={exportCsv}><Download size={15} /> Export CSV</button></div>{loading ? <div className="empty-state">Loading products…</div> : <ProductTable products={matches} money={money} onEdit={(product) => { setEditingProduct(product); setShowProductForm(true) }} onDelete={removeProduct} onRestock={(id) => { void restock(id, 'DISP', 10) }} onAdjust={adjustQuantity} />}<div className="table-footer"><span>Showing <strong>{matches.length}</strong> of <strong>{products.length}</strong> products</span><button disabled>Previous　 1　 Next</button></div></section>}
        {section === 'Sales' && !posMode && <section className="panel product-panel page-table-panel"><div className="table-toolbar"><strong>Recent sales <span className="nav-count">{sales.length}</span></strong><label className="global-search sales-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search receipt or customer" aria-label="Search sales" /></label></div><div className="table-scroll"><table className="product-table sales-table"><thead><tr><th>RECEIPT</th><th>DATE</th><th>CUSTOMER</th><th>ITEMS</th><th>TOTAL</th><th>PAID</th><th>OUTSTANDING</th><th>PAYMENT</th><th /></tr></thead><tbody>{sales.filter((sale) => `${sale.receiptNumber} ${sale.customer ? `${sale.customer.firstName} ${sale.customer.lastName}` : 'Walk-in'}`.toLowerCase().includes(query.toLowerCase())).map((sale) => <tr key={sale.id}><td><strong>{sale.receiptNumber}</strong></td><td>{new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: settings.timezone }).format(new Date(sale.soldAt))}</td><td>{sale.customer ? `${sale.customer.firstName} ${sale.customer.lastName}` : 'Walk-in customer'}</td><td>{sale.items.reduce((sum, item) => sum + item.quantity, 0)} items</td><td className="price-cell">{money.format(sale.totalAmount)}</td><td>{money.format(sale.paidAmount)}</td><td className="price-cell">{money.format(sale.dueAmount)}</td><td><span className={`status-pill ${sale.paymentStatus === 'paid' ? 'in-stock' : sale.paymentStatus === 'partial' ? 'low-stock' : 'out-of-stock'}`}>{sale.paymentStatus === 'paid' ? 'Paid' : sale.paymentStatus === 'partial' ? 'Partially paid' : 'Unpaid'}</span></td><td>{sale.dueAmount > 0 && <button className="button button-secondary compact" onClick={() => { setPaymentSale(sale); setPaymentEntry(sale.dueAmount.toFixed(2)) }}>Record payment</button>}</td></tr>)}</tbody></table>{sales.length === 0 && <div className="empty-state">No sales recorded yet. Start a sale to see it here.</div>}</div></section>}
        {section === 'Sales' && posMode && <section className="pos-layout"><div className="panel pos-products"><div className="panel-heading"><div><h2>Find products</h2><p>Search by product name, SKU, or category.</p></div></div><label className="pos-search"><Search size={16} /><input autoFocus value={posSearch} onChange={(event) => setPosSearch(event.target.value)} placeholder="Search products to add" /></label><div className="pos-product-list">{products.filter((product) => `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(posSearch.toLowerCase())).map((product) => <div className="pos-product-row" key={product.id}><span className="product-swatch">{product.name.slice(0, 1)}</span><div className="pos-product-info"><strong>{product.name}</strong><small>{product.sku} · {product.stock} in stock</small></div><strong>{money.format(product.price)}</strong><button className="row-action" title="Add to sale" aria-label={`Add ${product.name} to sale`} disabled={product.stock <= (cart[product.id] ?? 0)} onClick={() => setCart((current) => ({ ...current, [product.id]: (current[product.id] ?? 0) + 1 }))}><Plus size={15} /></button></div>)}{products.length === 0 && <div className="empty-state">No products in the catalog.</div>}</div></div><div className="panel pos-checkout"><div className="panel-heading"><div><h2>Current sale</h2><p>{count} items</p></div><button className="text-link" onClick={() => setCart({})}>Clear sale</button></div><label>Customer<select value={saleCustomerId} onChange={(event) => setSaleCustomerId(event.target.value)}><option value="">Walk-in customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.firstName} {customer.lastName}</option>)}</select></label><div className="pos-cart-list">{Object.entries(cart).filter(([, quantity]) => quantity > 0).map(([id, quantity]) => { const product = products.find((item) => item.id === id); if (!product) return null; return <div className="pos-cart-row" key={id}><div><strong>{product.name}</strong><small>{quantity} × {money.format(product.price)}</small></div><strong>{money.format((product.price * quantity) * (1 + product.taxRate / 100))}</strong><div className="quantity-actions"><button className="row-action" aria-label={`Remove one ${product.name}`} onClick={() => setCart((current) => ({ ...current, [id]: quantity <= 1 ? 0 : quantity - 1 }))}>−</button><button className="row-action" aria-label={`Add one ${product.name}`} disabled={quantity >= product.stock} onClick={() => setCart((current) => ({ ...current, [id]: quantity + 1 }))}><Plus size={13} /></button></div></div>})}{count === 0 && <div className="empty-state">Search for a product to begin.</div>}</div><div className="pos-total"><span>Sale total</span><strong>{money.format(total)}</strong></div><div className="modal-row"><label>Amount received<input type="number" min="0" max={total} step="0.01" placeholder={total.toFixed(2)} value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></label><label>Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="cash">Cash</option><option value="card">Card</option><option value="gift_card">Gift card</option><option value="store_credit">Store credit</option><option value="other">Other</option></select></label></div><div className="pos-balance">Outstanding after payment <strong>{money.format(Math.max(0, total - (paymentAmount === '' ? total : Number(paymentAmount) || 0)))}</strong></div><button className="button button-primary pos-submit" disabled={!count || busy || (paymentAmount !== '' && (Number(paymentAmount) < 0 || Number(paymentAmount) > total))} onClick={checkout}>Complete sale · {money.format(total)} <ArrowUpRight size={15} /></button></div></section>}
        {section === 'Customers' && <section className="panel product-panel page-table-panel"><div className="table-scroll"><table className="product-table"><thead><tr><th>NAME</th><th>PHONE</th><th>EMAIL</th><th>NOTES</th><th /></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}><td><strong>{customer.firstName} {customer.lastName}</strong></td><td>{customer.phone || '—'}</td><td>{customer.email || '—'}</td><td>{customer.notes || '—'}</td><td className="row-actions"><button className="row-action" title="Edit customer" aria-label={`Edit ${customer.firstName} ${customer.lastName}`} onClick={() => { setEditingCustomer(customer); setShowCustomerForm(true) }}><Pencil size={14} /></button><button className="row-action danger-action" title="Delete customer" aria-label={`Delete ${customer.firstName} ${customer.lastName}`} onClick={() => void removeCustomer(customer)}><Trash2 size={14} /></button></td></tr>)}</tbody></table>{customers.length === 0 && <div className="empty-state"><Users size={19} />No customers yet.</div>}</div></section>}
        {section === 'Reports' && <section className="report-grid"><Report label="Net sales this month" value={money.format(dashboard?.monthlySales ?? 0)} trend="Month to date" icon={<ChartNoAxesCombined size={18} />} /><Report label="Sell-through rate" value="—" trend="Requires sales history" icon={<Boxes size={18} />} /><Report label="Returning customers" value="—" trend="Customer analytics unavailable" icon={<Users size={18} />} down /><div className="panel report-note"><h2>Report exports</h2><p>Download your product catalog in spreadsheet-friendly CSV format.</p><button className="button button-secondary" onClick={exportCsv}><Download size={15} /> Export product report</button></div></section>}
        {section === 'Settings' && <form className="panel settings-panel" onSubmit={saveSettings}><div className="panel-heading"><div><h2>Store profile</h2><p>Business details used across receipts and reports.</p></div><button className="button button-primary" type="submit" disabled={busy}>Save changes</button></div><label>Store name<input value={settings.storeName} onChange={(event) => setSettings((current) => ({ ...current, storeName: event.target.value }))} required /></label><div className="settings-row"><label>Currency<select value={settings.currency} onChange={(event) => setSettings((current) => ({ ...current, currency: event.target.value }))}><option value="USD">USD · US Dollar</option><option value="EUR">EUR · Euro</option><option value="GBP">GBP · Pound Sterling</option><option value="PKR">PKR · Pakistani Rupee</option></select></label><label>Time zone<select value={settings.timezone} onChange={(event) => setSettings((current) => ({ ...current, timezone: event.target.value }))}><option value="UTC">UTC</option><option value="Asia/Karachi">Pakistan Standard Time · Asia/Karachi</option><option value="America/New_York">Eastern Time · New York</option><option value="America/Chicago">Central Time · Chicago</option><option value="America/Los_Angeles">Pacific Time · Los Angeles</option></select></label></div><hr /><div className="panel-heading"><div><h2>Checkout defaults</h2><p>Automatically attach this customer to sales unless another is selected.</p></div></div><label>Default customer<select value={settings.defaultCustomerId ?? ''} onChange={(event) => setSettings((current) => ({ ...current, defaultCustomerId: event.target.value || null }))}><option value="">No default customer · Walk-in</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.firstName} {customer.lastName}</option>)}</select></label><hr /><div className="panel-heading"><div><h2>Data & exports</h2><p>Keep a local copy of your product data.</p></div><button className="button button-secondary" type="button" onClick={exportCsv}><Download size={15} /> Export CSV</button></div></form>}
      </div>
      <footer className="app-footer"><span>© 2025 Stockroom, Inc.</span><span><i /> API connected</span><span>Version 1.0.0</span></footer>
    </main>
    {showProductForm && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setShowProductForm(false); setEditingProduct(null) } }}><form className="product-modal" onSubmit={addProduct}><div className="modal-heading"><div><span className="eyebrow">CATALOG</span><h2>{editingProduct ? 'Edit product' : 'Add a product'}</h2></div><button className="icon-button" type="button" aria-label="Close dialog" onClick={() => { setShowProductForm(false); setEditingProduct(null) }}><X size={18} /></button></div><label>Product name<input name="name" defaultValue={editingProduct?.name} placeholder="Mobile charger" autoFocus required /></label><div className="modal-row"><label>SKU<input name="sku" defaultValue={editingProduct?.sku} placeholder="M-01" required /></label><label>Category<input name="category" defaultValue={editingProduct?.category} placeholder="Mobile accessories" /></label></div><div className="modal-row"><label>Sale price (before tax)<input name="price" type="number" min="0" step="0.01" defaultValue={editingProduct?.price} required /></label><label>Cost price<input name="costPrice" type="number" min="0" step="0.01" defaultValue={editingProduct?.costPrice ?? 0} /></label></div><div className="modal-row"><label>Tax rate (%)<input name="taxRate" type="number" min="0" step="0.001" defaultValue={editingProduct?.taxRate ?? 0} /></label><label className="checkbox-field"><input name="inDemand" type="checkbox" defaultChecked={editingProduct?.inDemand ?? false} /><span>In demand</span></label></div><div className="modal-row"><label>Display<input name="qtyDisplay" type="number" min="0" step="1" defaultValue={editingProduct?.qtyDisplay ?? 0} /></label><label>Warehouse<input name="qtyWarehouse" type="number" min="0" step="1" defaultValue={editingProduct?.qtyWarehouse ?? 0} /></label></div><label>Home<input name="qtyHome" type="number" min="0" step="1" defaultValue={editingProduct?.qtyHome ?? 0} /></label><div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => { setShowProductForm(false); setEditingProduct(null) }}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}><Plus size={16} />{editingProduct ? 'Save product' : 'Add product'}</button></div></form></div>}
    {showCustomerForm && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setShowCustomerForm(false); setEditingCustomer(null) } }}><form className="product-modal" onSubmit={addCustomer}><div className="modal-heading"><div><span className="eyebrow">CUSTOMERS</span><h2>{editingCustomer ? 'Edit customer' : 'Add a customer'}</h2></div><button className="icon-button" type="button" aria-label="Close dialog" onClick={() => { setShowCustomerForm(false); setEditingCustomer(null) }}><X size={18} /></button></div><div className="modal-row"><label>First name<input name="firstName" defaultValue={editingCustomer?.firstName} autoFocus required /></label><label>Last name<input name="lastName" defaultValue={editingCustomer?.lastName} /></label></div><div className="modal-row"><label>Phone<input name="phone" type="tel" defaultValue={editingCustomer?.phone ?? ''} /></label><label>Email<input name="email" type="email" defaultValue={editingCustomer?.email ?? ''} /></label></div><label>Notes<input name="notes" defaultValue={editingCustomer?.notes ?? ''} /></label><div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => { setShowCustomerForm(false); setEditingCustomer(null) }}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}><Plus size={16} />{editingCustomer ? 'Save customer' : 'Add customer'}</button></div></form></div>}
    {paymentSale && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPaymentSale(null) }}><form className="product-modal" onSubmit={addPayment}><div className="modal-heading"><div><span className="eyebrow">PAYMENT</span><h2>Record payment</h2></div><button className="icon-button" type="button" aria-label="Close dialog" onClick={() => setPaymentSale(null)}><X size={18} /></button></div><p className="payment-context">{paymentSale.receiptNumber} · {paymentSale.customer ? `${paymentSale.customer.firstName} ${paymentSale.customer.lastName}` : 'Walk-in customer'} · {money.format(paymentSale.dueAmount)} due</p><label>Amount received<input type="number" min="0.01" max={paymentSale.dueAmount} step="0.01" value={paymentEntry} onChange={(event) => setPaymentEntry(event.target.value)} required /></label><label>Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="cash">Cash</option><option value="card">Card</option><option value="gift_card">Gift card</option><option value="store_credit">Store credit</option><option value="other">Other</option></select></label><div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setPaymentSale(null)}>Cancel</button><button type="submit" className="button button-primary" disabled={busy || Number(paymentEntry) > paymentSale.dueAmount}>Save payment</button></div></form></div>}
    {notice && <div className="toast"><span>✓</span>{notice}</div>}
  </div>
}
function Metric({ label, value, trend, context = 'vs. previous 7 days', icon }: { label: string; value: string; trend: number | null | undefined; context?: string; icon: React.ReactNode }) { return <article className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><strong className="metric-value">{value}</strong><div className="metric-foot"><span className="trend">{trend == null ? context : <>{trend >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />} {trend >= 0 ? '+' : ''}{trend.toFixed(1)}%</>}</span>{trend != null && <span>vs. previous 7 days</span>}</div></article> }
function ProductTable({ products, money, onRestock, onAdjust, onEdit, onDelete, actionLabel = 'Add 10 units' }: { products: Product[]; money: Intl.NumberFormat; onRestock: (id: string, location: StockLocation, quantity?: number) => void; onAdjust: (id: string, location: StockLocation, delta: number) => void; onEdit?: (product: Product) => void; onDelete?: (product: Product) => void; actionLabel?: string }) {
  const locations: Array<{ label: string; key: 'qtyDisplay' | 'qtyWarehouse' | 'qtyHome'; location: StockLocation }> = [
    { label: 'Display', key: 'qtyDisplay', location: 'DISP' },
    { label: 'Warehouse', key: 'qtyWarehouse', location: 'WH' },
    { label: 'Home', key: 'qtyHome', location: 'HM' },
  ]
  return <div className="table-scroll"><table className="product-table"><thead><tr><th>PRODUCT</th><th>SKU</th><th>CATEGORY</th><th>SALE</th>{locations.map((location) => <th key={location.key}>{location.label}</th>)}<th>QTY</th><th>STATUS</th><th /></tr></thead><tbody>{products.map((p) => <tr key={p.id}><td><div className="product-name-cell"><span className="product-swatch">{p.name.slice(0, 1)}</span><div><strong>{p.name}</strong><small>{p.id}{p.inDemand && <span className="demand-tag">In demand</span>}</small></div></div></td><td className="sku-cell">{p.sku}</td><td>{p.category}</td><td className="price-cell">{money.format(p.price)}</td>{locations.map((location) => <td key={location.key}><span>{p[location.key]}</span>{actionLabel !== 'Add to cart' && <span className="stock-stepper"><button className="row-action" title={`Remove one from ${location.label}`} aria-label={`Remove one ${p.name} from ${location.label}`} disabled={p[location.key] === 0} onClick={() => onAdjust(p.id, location.location, -1)}><span aria-hidden="true">−</span></button><button className="row-action" title={`Add one to ${location.label}`} aria-label={`Add one ${p.name} to ${location.label}`} onClick={() => onAdjust(p.id, location.location, 1)}><Plus size={13} /></button></span>}</td>)}<td><strong>{p.stock}</strong> units</td><td><span className={`status-pill ${p.stock === 0 ? 'out-of-stock' : p.stock <= 8 ? 'low-stock' : 'in-stock'}`}><i />{p.stock === 0 ? 'Out of stock' : p.stock <= 8 ? 'Low stock' : 'In stock'}</span></td><td className="row-actions"><button className="row-action" title={actionLabel} aria-label={`${actionLabel}: ${p.name}`} disabled={actionLabel === 'Add to cart' && p.stock === 0} onClick={() => onRestock(p.id, 'DISP', 10)}>{actionLabel === 'Add to cart' ? <Plus size={15} /> : <PackagePlus size={14} />}</button>{onEdit && <button className="row-action" title="Edit product" aria-label={`Edit ${p.name}`} onClick={() => onEdit(p)}><Pencil size={14} /></button>}{onDelete && <button className="row-action danger-action" title="Delete product" aria-label={`Delete ${p.name}`} onClick={() => onDelete(p)}><Trash2 size={14} /></button>}</td></tr>)}</tbody></table>{products.length === 0 && <div className="empty-state"><Search size={19} />No products match your search.</div>}</div>
}
function Activity({ initials, name, action, time, amount }: { initials: string; name: string; action: string; time: string; amount: string }) { return <div className="activity-row"><span className="activity-avatar">{initials}</span><div className="activity-copy"><strong>{name}</strong><span>{action}</span></div><time>{time}</time><strong className="activity-amount">{amount}</strong></div> }
function Report({ label, value, trend, icon, down = false }: { label: string; value: string; trend: string; icon: React.ReactNode; down?: boolean }) { return <div className="panel report-card"><span className="metric-icon">{icon}</span><span>{label}</span><strong>{value}</strong><small>{down ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />} {trend}</small></div> }
export default App
