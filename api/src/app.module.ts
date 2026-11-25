import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Inject, Module, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { IsArray, IsBoolean, IsEmail, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Min, MinLength, NotEquals, ValidateNested, validateOrReject } from 'class-validator'
import { plainToInstance, Type } from 'class-transformer'
import { randomBytes } from 'node:crypto'
import { hash } from 'bcryptjs'
import { PaymentMethod } from '@prisma/client'
import { AuthService, JwtGuard, Session } from './auth'
import { PrismaService } from './prisma.service'

class LoginBody {
  @IsEmail() email!: string
  @IsString() @MinLength(8) password!: string
}
class ProductBody {
  @IsString() @MinLength(1) sku!: string
  @IsString() @MinLength(1) name!: string
  @IsOptional() @IsString() category?: string
  @IsNumber() @Min(0) price!: number
  @IsOptional() @IsNumber() @Min(0) costPrice?: number
  @IsOptional() @IsNumber() @Min(0) taxRate?: number
  @IsOptional() @IsBoolean() inDemand?: boolean
  @IsOptional() @IsInt() @Min(0) stock?: number
  @IsOptional() @IsInt() @Min(0) qtyDisplay?: number
  @IsOptional() @IsInt() @Min(0) qtyWarehouse?: number
  @IsOptional() @IsInt() @Min(0) qtyHome?: number
}
class RestockBody {
  @IsInt() @Min(1) quantity!: number
  @IsOptional() @IsIn(['DISP', 'WH', 'HM']) location?: 'DISP' | 'WH' | 'HM'
  @IsOptional() @IsString() note?: string
}
class AdjustStockBody {
  @IsIn(['DISP', 'WH', 'HM']) location!: 'DISP' | 'WH' | 'HM'
  @IsInt() @NotEquals(0) delta!: number
  @IsOptional() @IsString() note?: string
}
class CustomerBody {
  @IsString() @MinLength(1) firstName!: string
  @IsOptional() @IsString() lastName?: string
  @IsOptional() @IsEmail() email?: string
  @IsOptional() @IsString() phone?: string
  @IsOptional() @IsString() notes?: string
}
class CustomerUpdateBody {
  @IsOptional() @IsString() @MinLength(1) firstName?: string
  @IsOptional() @IsString() lastName?: string
  @IsOptional() @IsEmail() email?: string | null
  @IsOptional() @IsString() phone?: string | null
  @IsOptional() @IsString() notes?: string | null
}
class ProductUpdateBody {
  @IsOptional() @IsString() @MinLength(1) sku?: string
  @IsOptional() @IsString() @MinLength(1) name?: string
  @IsOptional() @IsString() category?: string | null
  @IsOptional() @IsNumber() @Min(0) price?: number
  @IsOptional() @IsNumber() @Min(0) costPrice?: number
  @IsOptional() @IsNumber() @Min(0) taxRate?: number
  @IsOptional() @IsBoolean() inDemand?: boolean
  @IsOptional() @IsInt() @Min(0) qtyDisplay?: number
  @IsOptional() @IsInt() @Min(0) qtyWarehouse?: number
  @IsOptional() @IsInt() @Min(0) qtyHome?: number
}
class CheckoutLine { @IsString() @Matches(/^[1-9]\d*$/) productId!: string; @IsInt() @Min(1) quantity!: number }
class CheckoutBody {
  @IsArray() @ValidateNested({ each: true }) @Type(() => CheckoutLine)
  lines!: CheckoutLine[]
  @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod
  @IsOptional() @IsString() @Matches(/^[1-9]\d*$/) customerId?: string
  @IsOptional() @IsBoolean() useDefaultCustomer?: boolean
  @IsOptional() @IsNumber() @Min(0) amountReceived?: number
  @IsOptional() @IsNumber() @Min(0) discountAmount?: number
}
class RoleBody {
  @IsString() @MinLength(2) name!: string
  @IsOptional() @IsString() description?: string
  @IsArray() @IsString({ each: true }) permissionKeys!: string[]
}
class RolePermissionsBody {
  @IsArray() @IsString({ each: true }) permissionKeys!: string[]
}
class CreateUserBody {
  @IsEmail() email!: string
  @IsString() @MinLength(12) password!: string
  @IsString() @MinLength(1) firstName!: string
  @IsOptional() @IsString() lastName?: string
  @IsString() @Matches(/^[1-9]\d*$/) roleId!: string
}
class UpdateUserBody {
  @IsOptional() @IsEmail() email?: string
  @IsOptional() @IsString() @MinLength(1) firstName?: string
  @IsOptional() @IsString() lastName?: string
  @IsOptional() @IsString() @MinLength(12) password?: string
  @IsOptional() @IsString() @Matches(/^[1-9]\d*$/) roleId?: string
}
class PaymentBody {
  @IsNumber() @Min(0.01) amount!: number
  @IsOptional() @IsEnum(PaymentMethod) method?: PaymentMethod
}
class StoreSettingsBody {
  @IsOptional() @IsString() @MinLength(1) storeName?: string
  @IsOptional() @IsIn(['USD', 'EUR', 'GBP', 'PKR']) currency?: string
  @IsOptional() @IsIn(['UTC', 'Asia/Karachi', 'America/New_York', 'America/Chicago', 'America/Los_Angeles']) timezone?: string
  @IsOptional() @IsString() @Matches(/^[1-9]\d*$/) defaultCustomerId?: string | null
}

function parseDatabaseId(value: string) {
  if (!/^[1-9]\d*$/.test(value)) throw new BadRequestException('ID must be a positive integer')
  return BigInt(value)
}

async function validateBody<T extends object>(type: new () => T, input: unknown): Promise<T> {
  const dto = plainToInstance(type, input)
  await validateOrReject(dto, { whitelist: true, forbidNonWhitelisted: true })
  return dto
}

async function requirePermission(prisma: PrismaService, user: Session, permissionKey: string) {
  const membership = await prisma.storeUser.findUnique({
    where: { storeId_userId: { storeId: BigInt(user.storeId), userId: BigInt(user.userId) } },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  })
  if (!membership?.role.permissions.some(({ permission }) => permission.permissionKey === permissionKey)) {
    throw new ForbiddenException('Your store role cannot perform this action')
  }
}

async function requireAnyPermission(prisma: PrismaService, user: Session, permissionKeys: string[]) {
  const membership = await prisma.storeUser.findUnique({
    where: { storeId_userId: { storeId: BigInt(user.storeId), userId: BigInt(user.userId) } },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  })
  if (!membership?.role.permissions.some(({ permission }) => permissionKeys.includes(permission.permissionKey))) {
    throw new ForbiddenException('Your store role cannot perform this action')
  }
}

async function requireOwner(prisma: PrismaService, user: Session) {
  const membership = await prisma.storeUser.findUnique({
    where: { storeId_userId: { storeId: BigInt(user.storeId), userId: BigInt(user.userId) } },
    include: { role: { select: { isOwner: true } } },
  })
  if (!membership?.role.isOwner) throw new ForbiddenException('Only the store owner can manage access and settings')
}

function dateKeyInZone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

function startOfDayInZone(date: Date, timezone: string) {
  const [year, month, day] = dateKeyInZone(date, timezone).split('-').map(Number)
  const midnightUtc = Date.UTC(year, month - 1, day)
  const localParts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(midnightUtc))
  const values = Object.fromEntries(localParts.map(({ type, value }) => [type, value]))
  const representedUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second))
  return new Date(midnightUtc - (representedUtc - midnightUtc))
}

function addCalendarDays(date: Date, days: number) {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

@Controller('auth')
class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Post('login') async login(@Body() body: unknown) { const dto = await validateBody(LoginBody, body); return this.auth.login(dto.email, dto.password) }
  @Get('session') @UseGuards(JwtGuard) async current(@Req() req: { user: Session }) { return this.auth.current(req.user) }
}

@Controller('dashboard')
@UseGuards(JwtGuard)
class DashboardController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('summary') async summary(@Req() req: { user: Session }) {
    await requirePermission(this.prisma, req.user, 'reports.read')
    const storeId = BigInt(req.user.storeId)
    const now = new Date()
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { timezone: true } })
    const [year, month, day] = dateKeyInZone(now, store.timezone).split('-').map(Number)
    const localDate = new Date(Date.UTC(year, month - 1, day))
    const todayKey = dateKeyInZone(now, store.timezone)
    const todayStart = startOfDayInZone(localDate, store.timezone)
    const weekDate = addCalendarDays(localDate, -6)
    const weekStart = startOfDayInZone(weekDate, store.timezone)
    const previousStart = startOfDayInZone(addCalendarDays(localDate, -13), store.timezone)
    const monthDate = new Date(Date.UTC(year, month - 1, 1))
    const monthStart = startOfDayInZone(monthDate, store.timezone)
    const monthKey = dateKeyInZone(monthStart, store.timezone)
    const salesStart = monthStart < previousStart ? monthStart : previousStart

    const [sales, inventory, recentSales] = await Promise.all([
      this.prisma.sale.findMany({
        where: { storeId, status: 'completed', soldAt: { gte: salesStart, lte: now } },
        select: { soldAt: true, totalAmount: true, items: { select: { quantity: true } } },
      }),
      this.prisma.inventory.findMany({
        where: { storeId, product: { isActive: true, deletedAt: null } },
        select: { qtyDisplay: true, qtyWarehouse: true, qtyHome: true },
      }),
      this.prisma.sale.findMany({
        where: { storeId },
        orderBy: { soldAt: 'desc' },
        take: 5,
        select: { receiptNumber: true, totalAmount: true, soldAt: true, customer: { select: { firstName: true, lastName: true } } },
      }),
    ])

    const dailySales = Array.from({ length: 7 }, (_, index) => {
      const date = addCalendarDays(weekDate, index)
      const previousDate = addCalendarDays(date, -7)
      const dayTotal = (target: Date) => sales
        .filter((sale) => dateKeyInZone(sale.soldAt, store.timezone) === dateKeyInZone(target, 'UTC'))
        .reduce((sum, sale) => sum + Number(sale.totalAmount), 0)
      return {
        date: dateKeyInZone(date, 'UTC'),
        label: date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
        total: dayTotal(date),
        previousTotal: dayTotal(previousDate),
      }
    })
    const currentSales = sales.filter((sale) => sale.soldAt >= weekStart && sale.soldAt <= now)
    const previousSales = sales.filter((sale) => sale.soldAt >= previousStart && sale.soldAt < weekStart)
    const todaySales = sales.filter((sale) => dateKeyInZone(sale.soldAt, store.timezone) === todayKey)
    const monthlySales = sales.filter((sale) => dateKeyInZone(sale.soldAt, store.timezone) >= monthKey)
    const sumTotal = (rows: typeof sales) => rows.reduce((sum, sale) => sum + Number(sale.totalAmount), 0)
    const sumItems = (rows: typeof sales) => rows.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0)
    const currentGross = sumTotal(currentSales)
    const currentCount = currentSales.length
    const currentItems = sumItems(currentSales)
    const previousGross = sumTotal(previousSales)
    const previousCount = previousSales.length
    const previousItems = sumItems(previousSales)
    const stock = inventory.reduce((totals, row) => {
      const quantity = row.qtyDisplay + row.qtyWarehouse + row.qtyHome
      totals.units += quantity
      if (quantity === 0) totals.out += 1
      else if (quantity <= 8) totals.low += 1
      else totals.healthy += 1
      return totals
    }, { units: 0, healthy: 0, low: 0, out: 0 })
    const change = (current: number, previous: number) => previous === 0 ? null : ((current - previous) / previous) * 100

    return {
      grossSales: currentGross,
      orderCount: currentCount,
      itemsSold: currentItems,
      averageOrder: currentCount ? currentGross / currentCount : 0,
      grossSalesChange: change(currentGross, previousGross),
      orderCountChange: change(currentCount, previousCount),
      itemsSoldChange: change(currentItems, previousItems),
      averageOrderChange: change(currentCount ? currentGross / currentCount : 0, previousCount ? previousGross / previousCount : 0),
      todaySales: sumTotal(todaySales),
      todayOrderCount: todaySales.length,
      weeklySales: currentGross,
      weeklyOrderCount: currentCount,
      monthlySales: sumTotal(monthlySales),
      monthlyOrderCount: monthlySales.length,
      dailySales,
      stock,
      recentSales: recentSales.map((sale) => ({
        receiptNumber: sale.receiptNumber,
        total: Number(sale.totalAmount),
        soldAt: sale.soldAt,
        customerName: sale.customer ? `${sale.customer.firstName} ${sale.customer.lastName}` : 'Walk-in customer',
      })),
    }
  }
}

@Controller('products')
@UseGuards(JwtGuard)
class ProductsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  @Get() async list(@Req() req: { user: Session }) {
    await requireAnyPermission(this.prisma, req.user, ['products.read', 'products.write', 'inventory.adjust'])
    const rows = await this.prisma.product.findMany({ where: { storeId: BigInt(req.user.storeId), deletedAt: null }, include: { category: true, inventories: { where: { storeId: BigInt(req.user.storeId) } } }, orderBy: { name: 'asc' } })
    return rows.map(({ inventories, costPrice, sellingPrice, category, ...product }) => {
      const inventory = inventories[0]
      const qtyDisplay = inventory?.qtyDisplay ?? 0
      const qtyWarehouse = inventory?.qtyWarehouse ?? 0
      const qtyHome = inventory?.qtyHome ?? 0
      return { ...product, id: product.id.toString(), storeId: product.storeId.toString(), categoryId: product.categoryId?.toString() ?? null, category: category?.name ?? null, price: Number(sellingPrice), costPrice: Number(costPrice), qtyDisplay, qtyWarehouse, qtyHome, stock: qtyDisplay + qtyWarehouse + qtyHome }
    })
  }
  @Post() async create(@Req() req: { user: Session }, @Body() body: unknown) {
    await requirePermission(this.prisma, req.user, 'products.write')
    const dto = await validateBody(ProductBody, body)
    const storeId = BigInt(req.user.storeId)
    return this.prisma.$transaction(async (tx) => {
      const category = dto.category ? await tx.category.upsert({ where: { storeId_name: { storeId, name: dto.category } }, create: { storeId, name: dto.category }, update: {} }) : null
      const product = await tx.product.create({ data: { storeId, sku: dto.sku, name: dto.name, sellingPrice: dto.price, costPrice: dto.costPrice ?? 0, taxRate: dto.taxRate ?? 0, inDemand: dto.inDemand ?? false, categoryId: category?.id }, select: { id: true, sku: true, name: true, sellingPrice: true, costPrice: true, taxRate: true, inDemand: true, categoryId: true } })
      const qtyDisplay = dto.qtyDisplay ?? 0
      const qtyWarehouse = dto.qtyWarehouse ?? dto.stock ?? 0
      const qtyHome = dto.qtyHome ?? 0
      const stock = qtyDisplay + qtyWarehouse + qtyHome
      await tx.inventory.create({ data: { storeId, productId: product.id, qtyDisplay, qtyWarehouse, qtyHome } })
      if (stock > 0) await tx.inventoryMovement.create({ data: { storeId, productId: product.id, userId: BigInt(req.user.userId), movementType: 'opening', quantityDelta: stock, quantityAfter: stock } })
      return { ...product, id: product.id.toString(), categoryId: product.categoryId?.toString() ?? null, price: Number(product.sellingPrice), costPrice: Number(product.costPrice), taxRate: Number(product.taxRate), qtyDisplay, qtyWarehouse, qtyHome, stock }
    })
  }
  @Patch(':id') async update(@Req() req: { user: Session }, @Param('id') rawId: string, @Body() body: unknown) {
    await requirePermission(this.prisma, req.user, 'products.write')
    const dto = await validateBody(ProductUpdateBody, body)
    const storeId = BigInt(req.user.storeId)
    const productId = parseDatabaseId(rawId)
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.product.findFirst({ where: { id: productId, storeId, deletedAt: null }, include: { inventories: { where: { storeId } } } })
      if (!current) throw new NotFoundException('Product not found')
      let categoryId = current.categoryId
      if (dto.category !== undefined) {
        const category = dto.category ? await tx.category.upsert({ where: { storeId_name: { storeId, name: dto.category.trim() } }, create: { storeId, name: dto.category.trim() }, update: {} }) : null
        categoryId = category?.id ?? null
      }
      const updated = await tx.product.update({
        where: { id: productId },
        data: {
          ...(dto.sku !== undefined ? { sku: dto.sku.trim() } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.price !== undefined ? { sellingPrice: dto.price } : {}),
          ...(dto.costPrice !== undefined ? { costPrice: dto.costPrice } : {}),
          ...(dto.taxRate !== undefined ? { taxRate: dto.taxRate } : {}),
          ...(dto.inDemand !== undefined ? { inDemand: dto.inDemand } : {}),
          ...(dto.category !== undefined ? { categoryId } : {}),
        },
      })
      const inventory = current.inventories[0]
      const qtyDisplay = dto.qtyDisplay ?? inventory?.qtyDisplay ?? 0
      const qtyWarehouse = dto.qtyWarehouse ?? inventory?.qtyWarehouse ?? 0
      const qtyHome = dto.qtyHome ?? inventory?.qtyHome ?? 0
      if (dto.qtyDisplay !== undefined || dto.qtyWarehouse !== undefined || dto.qtyHome !== undefined) {
        await tx.inventory.upsert({
          where: { storeId_productId: { storeId, productId } },
          create: { storeId, productId, qtyDisplay, qtyWarehouse, qtyHome },
          update: { qtyDisplay, qtyWarehouse, qtyHome },
        })
        const previousTotal = (inventory?.qtyDisplay ?? 0) + (inventory?.qtyWarehouse ?? 0) + (inventory?.qtyHome ?? 0)
        const nextTotal = qtyDisplay + qtyWarehouse + qtyHome
        const quantityChanged = qtyDisplay !== (inventory?.qtyDisplay ?? 0) || qtyWarehouse !== (inventory?.qtyWarehouse ?? 0) || qtyHome !== (inventory?.qtyHome ?? 0)
        if (quantityChanged) await tx.inventoryMovement.create({
          data: { storeId, productId, userId: BigInt(req.user.userId), movementType: 'adjustment', quantityDelta: nextTotal - previousTotal, quantityAfter: nextTotal, note: 'Product details updated' },
        })
      }
      return { ...updated, id: updated.id.toString(), storeId: updated.storeId.toString(), categoryId: updated.categoryId?.toString() ?? null, price: Number(updated.sellingPrice), costPrice: Number(updated.costPrice), taxRate: Number(updated.taxRate), category: dto.category === undefined ? undefined : categoryId ? (await tx.category.findUnique({ where: { id: categoryId } }))?.name ?? null : null, qtyDisplay, qtyWarehouse, qtyHome, stock: qtyDisplay + qtyWarehouse + qtyHome }
    })
  }
  @Delete(':id') async remove(@Req() req: { user: Session }, @Param('id') rawId: string) {
    await requirePermission(this.prisma, req.user, 'products.write')
    const storeId = BigInt(req.user.storeId)
    const productId = parseDatabaseId(rawId)
    const result = await this.prisma.product.updateMany({ where: { id: productId, storeId, deletedAt: null }, data: { isActive: false, deletedAt: new Date() } })
    if (result.count !== 1) throw new NotFoundException('Product not found')
    return { id: productId.toString(), deleted: true }
  }
  @Post(':id/restock') async restock(@Req() req: { user: Session }, @Param('id') rawId: string, @Body() body: unknown) {
    await requirePermission(this.prisma, req.user, 'inventory.adjust')
    const dto = await validateBody(RestockBody, body); const storeId = BigInt(req.user.storeId); const productId = parseDatabaseId(rawId)
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id: productId, storeId, deletedAt: null } })
      if (!product) throw new NotFoundException('Product not found')
      const location = dto.location ?? 'DISP'
      const field = location === 'DISP' ? 'qtyDisplay' : location === 'WH' ? 'qtyWarehouse' : 'qtyHome'
      const inventory = await tx.inventory.upsert({
        where: { storeId_productId: { storeId, productId } },
        create: { storeId, productId, [field]: dto.quantity },
        update: { [field]: { increment: dto.quantity } },
      })
      const totalQty = inventory.qtyDisplay + inventory.qtyWarehouse + inventory.qtyHome
      await tx.inventoryMovement.create({ data: { storeId, productId, userId: BigInt(req.user.userId), movementType: 'restock', quantityDelta: dto.quantity, quantityAfter: totalQty, note: dto.note } })
      return { productId: productId.toString(), location, quantity: inventory[field], totalQty }
    })
  }

  @Patch(':id/adjust-stock') async adjustStock(@Req() req: { user: Session }, @Param('id') rawId: string, @Body() body: unknown) {
    await requirePermission(this.prisma, req.user, 'inventory.adjust')
    const dto = await validateBody(AdjustStockBody, body)
    const storeId = BigInt(req.user.storeId)
    const productId = parseDatabaseId(rawId)
    const field = dto.location === 'DISP' ? 'qtyDisplay' : dto.location === 'WH' ? 'qtyWarehouse' : 'qtyHome'
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id: productId, storeId, deletedAt: null } })
      if (!product) throw new NotFoundException('Product not found')
      if (dto.delta > 0) {
        await tx.inventory.upsert({
          where: { storeId_productId: { storeId, productId } },
          create: { storeId, productId, [field]: dto.delta },
          update: { [field]: { increment: dto.delta } },
        })
      } else {
        const updated = await tx.inventory.updateMany({
          where: { storeId, productId, [field]: { gte: -dto.delta } },
          data: { [field]: { decrement: -dto.delta } },
        })
        if (updated.count !== 1) throw new ConflictException('Adjustment would make stock negative')
      }
      const inventory = await tx.inventory.findUniqueOrThrow({ where: { storeId_productId: { storeId, productId } } })
      const totalQty = inventory.qtyDisplay + inventory.qtyWarehouse + inventory.qtyHome
      await tx.inventoryMovement.create({
        data: { storeId, productId, userId: BigInt(req.user.userId), movementType: 'adjustment', quantityDelta: dto.delta, quantityAfter: totalQty, note: dto.note },
      })
      return { productId: productId.toString(), location: dto.location, quantity: inventory[field], totalQty }
    })
  }
}

@Controller('settings')
@UseGuards(JwtGuard)
class SettingsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get() async get(@Req() req: { user: Session }) {
    const storeId = BigInt(req.user.storeId)
    const [store, defaultCustomerSetting] = await Promise.all([
      this.prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { name: true, currency: true, timezone: true } }),
      this.prisma.storeSetting.findUnique({ where: { storeId_settingKey: { storeId, settingKey: 'default_customer_id' } } }),
    ])
    const customerId = defaultCustomerSetting?.settingValue
    return { storeName: store.name, currency: store.currency, timezone: store.timezone, defaultCustomerId: typeof customerId === 'string' ? customerId : null }
  }

  @Patch() async update(@Req() req: { user: Session }, @Body() body: unknown) {
    await requirePermission(this.prisma, req.user, 'settings.write')
    const dto = await validateBody(StoreSettingsBody, body)
    const storeId = BigInt(req.user.storeId)
    const defaultCustomerId = dto.defaultCustomerId
    if (defaultCustomerId) {
      const customer = await this.prisma.customer.findFirst({ where: { id: parseDatabaseId(defaultCustomerId), storeId, deletedAt: null } })
      if (!customer) throw new NotFoundException('Default customer not found in this store')
    }
    const store = await this.prisma.$transaction(async (tx) => {
      const updatedStore = await tx.store.update({
        where: { id: storeId },
        data: { ...(dto.storeName ? { name: dto.storeName.trim() } : {}), ...(dto.currency ? { currency: dto.currency } : {}), ...(dto.timezone ? { timezone: dto.timezone } : {}) },
        select: { name: true, currency: true, timezone: true },
      })
      if (defaultCustomerId === null) {
        await tx.storeSetting.deleteMany({ where: { storeId, settingKey: 'default_customer_id' } })
      } else if (defaultCustomerId) {
        await tx.storeSetting.upsert({
          where: { storeId_settingKey: { storeId, settingKey: 'default_customer_id' } },
          create: { storeId, settingKey: 'default_customer_id', settingValue: defaultCustomerId, updatedBy: BigInt(req.user.userId) },
          update: { settingValue: defaultCustomerId, updatedBy: BigInt(req.user.userId) },
        })
      }
      return updatedStore
    })
    const savedSetting = defaultCustomerId === undefined
      ? await this.prisma.storeSetting.findUnique({ where: { storeId_settingKey: { storeId, settingKey: 'default_customer_id' } } })
      : null
    const savedCustomerId = defaultCustomerId === undefined ? savedSetting?.settingValue : defaultCustomerId
    return { storeName: store.name, currency: store.currency, timezone: store.timezone, defaultCustomerId: typeof savedCustomerId === 'string' ? savedCustomerId : null }
  }
}

@Controller('sales')
@UseGuards(JwtGuard)
class SalesController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get() async list(@Req() req: { user: Session }) {
    await requirePermission(this.prisma, req.user, 'sales.read')
    const sales = await this.prisma.sale.findMany({
      where: { storeId: BigInt(req.user.storeId) },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true } },
        items: { select: { nameSnapshot: true, skuSnapshot: true, quantity: true, lineTotal: true } },
        payments: { select: { amount: true, method: true, paidAt: true } },
      },
      orderBy: { soldAt: 'desc' },
      take: 200,
    })
    return sales.map((sale) => {
      const paidAmount = sale.payments.reduce((sum, payment) => sum + Number(payment.amount), 0)
      const totalAmount = Number(sale.totalAmount)
      const dueAmount = Math.max(0, Math.round((totalAmount - paidAmount) * 100) / 100)
      return {
        id: sale.id.toString(),
        receiptNumber: sale.receiptNumber,
        soldAt: sale.soldAt,
        status: sale.status,
        currency: sale.currency,
        totalAmount,
        paidAmount,
        dueAmount,
        paymentStatus: dueAmount === 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
        customer: sale.customer ? { ...sale.customer, id: sale.customer.id.toString() } : null,
        items: sale.items.map((item) => ({ ...item, lineTotal: Number(item.lineTotal) })),
        payments: sale.payments.map((payment) => ({ ...payment, amount: Number(payment.amount) })),
      }
    })
  }

  @Post('checkout') async checkout(@Req() req: { user: Session }, @Body() body: unknown) {
    await requirePermission(this.prisma, req.user, 'sales.create')
    const dto = await validateBody(CheckoutBody, body)
    if (!Array.isArray(dto.lines) || dto.lines.length === 0) throw new BadRequestException('At least one sale line is required')
    for (const line of dto.lines) await validateBody(CheckoutLine, line)
    const storeId = BigInt(req.user.storeId)
    return this.prisma.$transaction(async (tx) => {
      const savedCustomer = dto.customerId || dto.useDefaultCustomer === false ? null : await tx.storeSetting.findUnique({ where: { storeId_settingKey: { storeId, settingKey: 'default_customer_id' } } })
      const customerId = dto.customerId ?? (typeof savedCustomer?.settingValue === 'string' ? savedCustomer.settingValue : undefined)
      if (customerId) {
        const customer = await tx.customer.findFirst({ where: { id: parseDatabaseId(customerId), storeId, deletedAt: null } })
        if (!customer) throw new NotFoundException('Customer not found in this store')
      }
      if ((dto.discountAmount ?? 0) > 0 && !customerId) throw new BadRequestException('Discounts require a registered customer')
      const productIds = [...new Set(dto.lines.map((line) => parseDatabaseId(line.productId)))]
      const products = await tx.product.findMany({ where: { storeId, id: { in: productIds }, isActive: true, deletedAt: null } })
      if (products.length !== productIds.length) throw new NotFoundException('One or more products are unavailable')
      const productMap = new Map(products.map((product) => [product.id.toString(), product]))
      const lines = dto.lines.map((line) => {
        const product = productMap.get(line.productId)
        if (!product) throw new NotFoundException('Product is unavailable')
        return { product, quantity: line.quantity }
      })
      const toDecimal = (cents: number) => (cents / 100).toFixed(2)
      const subtotalCents = lines.reduce((sum, line) => sum + Math.round(Number(line.product.sellingPrice) * 100) * line.quantity, 0)
      const discountCents = Math.round((dto.discountAmount ?? 0) * 100)
      if (discountCents > subtotalCents) throw new BadRequestException('Discount cannot exceed the sale subtotal')
      let remainingDiscountCents = discountCents
      const discountedLines = lines.map((line, index) => {
        const lineSubtotalCents = Math.round(Number(line.product.sellingPrice) * 100) * line.quantity
        const lineDiscountCents = index === lines.length - 1
          ? remainingDiscountCents
          : Math.min(remainingDiscountCents, Math.round(discountCents * lineSubtotalCents / subtotalCents))
        remainingDiscountCents -= lineDiscountCents
        const taxableCents = lineSubtotalCents - lineDiscountCents
        return { ...line, lineSubtotalCents, lineDiscountCents, taxableCents }
      })
      const taxCents = discountedLines.reduce((sum, line) => sum + Math.round(line.taxableCents * Math.round(Number(line.product.taxRate) * 1000) / 100000), 0)
      const totalCents = subtotalCents - discountCents + taxCents
      if (totalCents <= 0) throw new BadRequestException('Sale total must be greater than zero')
      const receivedCents = dto.amountReceived === undefined ? totalCents : Math.round(dto.amountReceived * 100)
      if (receivedCents > totalCents) throw new BadRequestException('Amount received cannot exceed the sale total')
      const items = discountedLines.map(({ product, quantity, taxableCents, lineDiscountCents }) => ({ productId: product.id, skuSnapshot: product.sku, nameSnapshot: product.name, quantity, unitPrice: toDecimal(Math.round(Number(product.sellingPrice) * 100)), discountAmount: toDecimal(lineDiscountCents), taxRate: product.taxRate, lineTotal: toDecimal(taxableCents) }))
      const store = await tx.store.findUniqueOrThrow({ where: { id: storeId }, select: { currency: true } })
      const sale = await tx.sale.create({ data: { storeId, cashierUserId: BigInt(req.user.userId), customerId: customerId ? parseDatabaseId(customerId) : undefined, receiptNumber: `R-${Date.now()}-${randomBytes(3).toString('hex')}`, subtotal: toDecimal(subtotalCents), discountAmount: toDecimal(discountCents), taxAmount: toDecimal(taxCents), totalAmount: toDecimal(totalCents), currency: store.currency, items: { create: items }, payments: receivedCents > 0 ? { create: { method: dto.paymentMethod ?? PaymentMethod.cash, amount: toDecimal(receivedCents) } } : undefined } })
      for (const { product, quantity } of lines) {
        if (!product.trackInventory) continue
        const inventory = await tx.inventory.findUnique({ where: { storeId_productId: { storeId, productId: product.id } } })
        let remaining = quantity
        for (const location of ['qtyDisplay', 'qtyWarehouse', 'qtyHome'] as const) {
          const deducted = Math.min(inventory?.[location] ?? 0, remaining)
          if (deducted > 0) {
            const updated = await tx.inventory.updateMany({ where: { storeId, productId: product.id, [location]: { gte: deducted } }, data: { [location]: { decrement: deducted } } })
            if (updated.count !== 1) throw new ConflictException(`Stock changed during checkout for ${product.name}`)
            remaining -= deducted
          }
        }
        if (remaining > 0) throw new ConflictException(`Insufficient stock for ${product.name}`)
        const updatedInventory = await tx.inventory.findUniqueOrThrow({ where: { storeId_productId: { storeId, productId: product.id } } })
        const totalQty = updatedInventory.qtyDisplay + updatedInventory.qtyWarehouse + updatedInventory.qtyHome
        await tx.inventoryMovement.create({ data: { storeId, productId: product.id, userId: BigInt(req.user.userId), saleId: sale.id, movementType: 'sale', quantityDelta: -quantity, quantityAfter: totalQty } })
      }
      return { id: sale.id.toString(), receiptNumber: sale.receiptNumber, subtotal: sale.subtotal.toString(), discountAmount: sale.discountAmount.toString(), taxAmount: sale.taxAmount.toString(), totalAmount: sale.totalAmount.toString(), paidAmount: toDecimal(receivedCents), dueAmount: toDecimal(totalCents - receivedCents), status: sale.status }
    })
  }

  @Post(':id/payments') async recordPayment(@Req() req: { user: Session }, @Param('id') rawId: string, @Body() body: unknown) {
    await requirePermission(this.prisma, req.user, 'sales.create')
    const dto = await validateBody(PaymentBody, body)
    const storeId = BigInt(req.user.storeId)
    const saleId = parseDatabaseId(rawId)
    const amountCents = Math.round(dto.amount * 100)
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({ where: { id: saleId, storeId, status: 'completed' }, include: { payments: { select: { amount: true } } } })
      if (!sale) throw new NotFoundException('Sale not found')
      const totalCents = Math.round(Number(sale.totalAmount) * 100)
      const paidCents = sale.payments.reduce((sum, payment) => sum + Math.round(Number(payment.amount) * 100), 0)
      if (amountCents > totalCents - paidCents) throw new BadRequestException('Payment cannot exceed the outstanding balance')
      await tx.payment.create({ data: { saleId, method: dto.method ?? PaymentMethod.cash, amount: (amountCents / 100).toFixed(2) } })
      const nextPaid = paidCents + amountCents
      return { saleId: saleId.toString(), paidAmount: (nextPaid / 100).toFixed(2), dueAmount: ((totalCents - nextPaid) / 100).toFixed(2), paymentStatus: nextPaid === totalCents ? 'paid' : 'partial' }
    })
  }
}

@Controller('customers')
@UseGuards(JwtGuard)
class CustomersController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get() async list(@Req() req: { user: Session }) {
    await requireAnyPermission(this.prisma, req.user, ['customers.read', 'customers.write'])
    const customers = await this.prisma.customer.findMany({
      where: { storeId: BigInt(req.user.storeId), deletedAt: null },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      include: { sales: { where: { status: 'completed' }, select: { totalAmount: true, payments: { select: { amount: true } } } } },
    })
    return customers.map(({ sales, ...customer }) => ({
      ...customer,
      id: customer.id.toString(),
      storeId: customer.storeId.toString(),
      pendingAmount: Math.round(sales.reduce((sum, sale) => sum + Math.max(0, Number(sale.totalAmount) - sale.payments.reduce((paid, payment) => paid + Number(payment.amount), 0)), 0) * 100) / 100,
    }))
  }

  @Post() async create(@Req() req: { user: Session }, @Body() body: unknown) {
    await requirePermission(this.prisma, req.user, 'customers.write')
    const dto = await validateBody(CustomerBody, body)
    const customer = await this.prisma.customer.create({
      data: {
        storeId: BigInt(req.user.storeId),
        firstName: dto.firstName.trim(),
        lastName: dto.lastName?.trim() ?? '',
        email: dto.email?.trim() || null,
        phone: dto.phone?.trim() || null,
        notes: dto.notes?.trim() || null,
      },
    })
    return { ...customer, id: customer.id.toString(), storeId: customer.storeId.toString() }
  }

  @Patch(':id') async update(@Req() req: { user: Session }, @Param('id') rawId: string, @Body() body: unknown) {
    await requirePermission(this.prisma, req.user, 'customers.write')
    const dto = await validateBody(CustomerUpdateBody, body)
    const storeId = BigInt(req.user.storeId)
    const customerId = parseDatabaseId(rawId)
    const updated = await this.prisma.customer.updateMany({
      where: { id: customerId, storeId, deletedAt: null },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() } : {}),
        ...(dto.email !== undefined ? { email: dto.email?.trim() || null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      },
    })
    if (updated.count !== 1) throw new NotFoundException('Customer not found')
    const customer = await this.prisma.customer.findFirstOrThrow({ where: { id: customerId, storeId, deletedAt: null } })
    return { ...customer, id: customer.id.toString(), storeId: customer.storeId.toString() }
  }

  @Delete(':id') async remove(@Req() req: { user: Session }, @Param('id') rawId: string) {
    await requirePermission(this.prisma, req.user, 'customers.write')
    const storeId = BigInt(req.user.storeId)
    const customerId = parseDatabaseId(rawId)
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.customer.updateMany({ where: { id: customerId, storeId, deletedAt: null }, data: { deletedAt: new Date() } })
      if (result.count !== 1) throw new NotFoundException('Customer not found')
      const defaultCustomer = await tx.storeSetting.findUnique({ where: { storeId_settingKey: { storeId, settingKey: 'default_customer_id' } } })
      if (defaultCustomer?.settingValue === customerId.toString()) await tx.storeSetting.delete({ where: { storeId_settingKey: { storeId, settingKey: 'default_customer_id' } } })
      return { id: customerId.toString(), deleted: true }
    })
  }
}

@Controller('access')
@UseGuards(JwtGuard)
class AccessController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('roles') async roles(@Req() req: { user: Session }) {
    await requirePermission(this.prisma, req.user, 'users.write')
    const storeId = BigInt(req.user.storeId)
    const roles = await this.prisma.role.findMany({
      where: { OR: [{ storeId: null }, { storeId }] },
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    })
    const permissions = await this.prisma.permission.findMany({ orderBy: { permissionKey: 'asc' } })
    const storeRoleNames = new Set(roles.filter((role) => role.storeId === storeId).map((role) => role.name))
    return {
      roles: roles.filter((role) => role.storeId === storeId || !storeRoleNames.has(role.name)).map((role) => ({
        id: role.id.toString(),
        name: role.name,
        isOwner: role.isOwner,
        description: role.description,
        isEditable: role.storeId === storeId,
        permissionKeys: role.permissions.map(({ permission }) => permission.permissionKey),
      })),
      permissions: permissions.map(({ permissionKey, description }) => ({ key: permissionKey, description })),
    }
  }

  @Post('roles') async createRole(@Req() req: { user: Session }, @Body() body: unknown) {
    await requirePermission(this.prisma, req.user, 'users.write')
    const dto = await validateBody(RoleBody, body)
    const name = dto.name.trim().toLowerCase()
    if (['owner', 'manager', 'cashier'].includes(name)) throw new BadRequestException('That role name is reserved')
    const permissionKeys = [...new Set(dto.permissionKeys)]
    const permissions = await this.prisma.permission.findMany({ where: { permissionKey: { in: permissionKeys } } })
    if (permissions.length !== permissionKeys.length) throw new BadRequestException('One or more permissions are invalid')
    const role = await this.prisma.role.create({
      data: {
        name,
        storeId: BigInt(req.user.storeId),
        description: dto.description?.trim() || null,
        permissions: { create: permissions.map(({ id }) => ({ permission: { connect: { id } } })) },
      },
    })
    return { id: role.id.toString(), name: role.name, isOwner: role.isOwner, description: role.description, isEditable: true, permissionKeys }
  }

  @Patch('roles/:id/permissions') async setRolePermissions(@Req() req: { user: Session }, @Param('id') rawId: string, @Body() body: unknown) {
    await requirePermission(this.prisma, req.user, 'users.write')
    const dto = await validateBody(RolePermissionsBody, body)
    const roleId = parseDatabaseId(rawId)
    const storeId = BigInt(req.user.storeId)
    let role = await this.prisma.role.findFirst({ where: { id: roleId, storeId } })
    if (!role) {
      const builtInRole = await this.prisma.role.findFirst({ where: { id: roleId, storeId: null } })
      if (!builtInRole || builtInRole.isOwner) throw new NotFoundException('Role not found')
      role = await this.prisma.role.create({
        data: { name: builtInRole.name, isOwner: builtInRole.isOwner, description: builtInRole.description, storeId },
      })
      await this.prisma.storeUser.updateMany({
        where: { storeId, roleId: builtInRole.id },
        data: { roleId: role.id },
      })
    }
    if (!role) throw new NotFoundException('Role not found')
    const permissionKeys = [...new Set(dto.permissionKeys)]
    const permissions = await this.prisma.permission.findMany({ where: { permissionKey: { in: permissionKeys } } })
    if (permissions.length !== permissionKeys.length) throw new BadRequestException('One or more permissions are invalid')
    const effectiveRoleId = role.id
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: effectiveRoleId } }),
      ...permissions.map(({ id: permissionId }) => this.prisma.rolePermission.create({ data: { roleId: effectiveRoleId, permissionId } })),
    ])
    return { id: role.id.toString(), name: role.name, permissionKeys }
  }

  @Get('users') async users(@Req() req: { user: Session }) {
    await requirePermission(this.prisma, req.user, 'users.write')
    const storeUsers = await this.prisma.storeUser.findMany({
      where: { storeId: BigInt(req.user.storeId), user: { deletedAt: null } },
      include: { user: true, role: true },
      orderBy: { user: { firstName: 'asc' } },
    })
    return storeUsers.map(({ user, role }) => ({
      id: user.id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      roleId: role.id.toString(),
      roleName: role.name,
    }))
  }

  @Post('users') async createUser(@Req() req: { user: Session }, @Body() body: unknown) {
    await requirePermission(this.prisma, req.user, 'users.write')
    const dto = await validateBody(CreateUserBody, body)
    const roleId = parseDatabaseId(dto.roleId)
    const storeId = BigInt(req.user.storeId)
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, OR: [{ storeId: null }, { storeId }] },
      select: { id: true, isOwner: true },
    })
    if (!role) throw new NotFoundException('Role not found')
    if (role.isOwner) await requireOwner(this.prisma, req.user)
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email.trim().toLowerCase(),
          passwordHash: await hash(dto.password, 12),
          firstName: dto.firstName.trim(),
          lastName: dto.lastName?.trim() ?? '',
        },
      })
      await tx.storeUser.create({ data: { storeId, userId: created.id, roleId } })
      return created
    })
    return { id: user.id.toString(), email: user.email, firstName: user.firstName, lastName: user.lastName, isActive: user.isActive, roleId: roleId.toString() }
  }

  @Patch('users/:id') async updateUser(@Req() req: { user: Session }, @Param('id') rawId: string, @Body() body: unknown) {
    await requirePermission(this.prisma, req.user, 'users.write')
    const dto = await validateBody(UpdateUserBody, body)
    const storeId = BigInt(req.user.storeId)
    const userId = parseDatabaseId(rawId)
    const membership = await this.prisma.storeUser.findUnique({
      where: { storeId_userId: { storeId, userId } },
      include: { user: true, role: true },
    })
    if (!membership || membership.user.deletedAt) throw new NotFoundException('User not found')
    let roleId = membership.roleId
    if (dto.roleId) {
      const role = await this.prisma.role.findFirst({
        where: { id: parseDatabaseId(dto.roleId), OR: [{ storeId: null }, { storeId }] },
        select: { id: true, isOwner: true },
      })
      if (!role) throw new NotFoundException('Role not found')
      roleId = role.id
      if (role.isOwner) await requireOwner(this.prisma, req.user)
      if (userId === BigInt(req.user.userId) && roleId !== membership.roleId) throw new ForbiddenException('You cannot change your own role')
      if (membership.role.isOwner && roleId !== membership.roleId) {
        await requireOwner(this.prisma, req.user)
        const ownerCount = await this.prisma.storeUser.count({ where: { storeId, role: { isOwner: true } } })
        if (ownerCount <= 1) throw new ForbiddenException('The store must keep at least one owner')
      }
    }
    const user = await this.prisma.$transaction(async (tx) => {
      if (roleId !== membership.roleId) await tx.storeUser.update({ where: { storeId_userId: { storeId, userId } }, data: { roleId } })
      return tx.user.update({
        where: { id: userId },
        data: {
          ...(dto.email !== undefined ? { email: dto.email.trim().toLowerCase() } : {}),
          ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() } : {}),
          ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() } : {}),
          ...(dto.password !== undefined ? { passwordHash: await hash(dto.password, 12) } : {}),
        },
      })
    })
    const updatedMembership = await this.prisma.storeUser.findUniqueOrThrow({
      where: { storeId_userId: { storeId, userId } },
      include: { role: true },
    })
    return { id: user.id.toString(), email: user.email, firstName: user.firstName, lastName: user.lastName, isActive: user.isActive, roleId: updatedMembership.roleId.toString(), roleName: updatedMembership.role.name }
  }

  @Delete('users/:id') async removeUser(@Req() req: { user: Session }, @Param('id') rawId: string) {
    await requirePermission(this.prisma, req.user, 'users.write')
    const storeId = BigInt(req.user.storeId)
    const userId = parseDatabaseId(rawId)
    if (userId === BigInt(req.user.userId)) throw new ForbiddenException('You cannot remove your own store access')
    const membership = await this.prisma.storeUser.findUnique({
      where: { storeId_userId: { storeId, userId } },
      include: { role: true },
    })
    if (!membership) throw new NotFoundException('User not found')
    if (membership.role.isOwner) {
      await requireOwner(this.prisma, req.user)
      const ownerCount = await this.prisma.storeUser.count({ where: { storeId, role: { isOwner: true } } })
      if (ownerCount <= 1) throw new ForbiddenException('The store must keep at least one owner')
    }
    await this.prisma.storeUser.delete({ where: { storeId_userId: { storeId, userId } } })
    return { id: userId.toString(), deleted: true }
  }
}

@Module({ controllers: [AuthController, DashboardController, ProductsController, CustomersController, SettingsController, SalesController, AccessController], providers: [PrismaService, AuthService, JwtGuard] })
export class AppModule {}
