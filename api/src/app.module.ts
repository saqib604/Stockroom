import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Module, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common'
import { IsArray, IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, Matches, Min, MinLength, ValidateNested, validateOrReject } from 'class-validator'
import { plainToInstance, Type } from 'class-transformer'
import { randomBytes } from 'node:crypto'
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
  @IsOptional() @IsInt() @Min(0) stock?: number
}
class RestockBody { @IsInt() @Min(1) quantity!: number; @IsOptional() @IsString() note?: string }
class CheckoutLine { @IsString() @Matches(/^[1-9]\d*$/) productId!: string; @IsInt() @Min(1) quantity!: number }
class CheckoutBody {
  @IsArray() @ValidateNested({ each: true }) @Type(() => CheckoutLine)
  lines!: CheckoutLine[]
  @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod
  @IsOptional() @IsString() @Matches(/^[1-9]\d*$/) customerId?: string
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

function requireRole(user: Session, roles: string[]) {
  if (!roles.includes(user.role)) throw new ForbiddenException('Your store role cannot perform this action')
}

@Controller('auth')
class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('login') async login(@Body() body: unknown) { const dto = await validateBody(LoginBody, body); return this.auth.login(dto.email, dto.password) }
}

@Controller('products')
@UseGuards(JwtGuard)
class ProductsController {
  constructor(private readonly prisma: PrismaService) {}
  @Get() async list(@Req() req: { user: Session }) {
    const rows = await this.prisma.product.findMany({ where: { storeId: BigInt(req.user.storeId), deletedAt: null }, include: { category: true, inventories: { where: { storeId: BigInt(req.user.storeId) } } }, orderBy: { name: 'asc' } })
    return rows.map(({ inventories, costPrice, sellingPrice, ...product }) => ({ ...product, id: product.id.toString(), storeId: product.storeId.toString(), categoryId: product.categoryId?.toString() ?? null, price: Number(sellingPrice), costPrice: Number(costPrice), stock: inventories[0]?.quantityOnHand ?? 0 }))
  }
  @Post() async create(@Req() req: { user: Session }, @Body() body: unknown) {
    requireRole(req.user, ['owner', 'manager'])
    const dto = await validateBody(ProductBody, body)
    const storeId = BigInt(req.user.storeId)
    return this.prisma.$transaction(async (tx) => {
      const category = dto.category ? await tx.category.upsert({ where: { storeId_name: { storeId, name: dto.category } }, create: { storeId, name: dto.category }, update: {} }) : null
      const product = await tx.product.create({ data: { storeId, sku: dto.sku, name: dto.name, sellingPrice: dto.price, costPrice: dto.costPrice ?? 0, categoryId: category?.id }, select: { id: true, sku: true, name: true, sellingPrice: true, categoryId: true } })
      const stock = dto.stock ?? 0
      await tx.inventory.create({ data: { storeId, productId: product.id, quantityOnHand: stock } })
      if (stock > 0) await tx.inventoryMovement.create({ data: { storeId, productId: product.id, userId: BigInt(req.user.userId), movementType: 'opening', quantityDelta: stock, quantityAfter: stock } })
      return { ...product, id: product.id.toString(), price: Number(product.sellingPrice), stock }
    })
  }
  @Post(':id/restock') async restock(@Req() req: { user: Session }, @Param('id') rawId: string, @Body() body: unknown) {
    requireRole(req.user, ['owner', 'manager'])
    const dto = await validateBody(RestockBody, body); const storeId = BigInt(req.user.storeId); const productId = parseDatabaseId(rawId)
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id: productId, storeId, deletedAt: null } })
      if (!product) throw new NotFoundException('Product not found')
      const inventory = await tx.inventory.upsert({ where: { storeId_productId: { storeId, productId } }, create: { storeId, productId, quantityOnHand: dto.quantity }, update: { quantityOnHand: { increment: dto.quantity } } })
      await tx.inventoryMovement.create({ data: { storeId, productId, userId: BigInt(req.user.userId), movementType: 'restock', quantityDelta: dto.quantity, quantityAfter: inventory.quantityOnHand, note: dto.note } })
      return { productId: productId.toString(), quantityOnHand: inventory.quantityOnHand }
    })
  }
}

@Controller('sales')
@UseGuards(JwtGuard)
class SalesController {
  constructor(private readonly prisma: PrismaService) {}
  @Post('checkout') async checkout(@Req() req: { user: Session }, @Body() body: unknown) {
    const dto = await validateBody(CheckoutBody, body)
    if (!Array.isArray(dto.lines) || dto.lines.length === 0) throw new BadRequestException('At least one sale line is required')
    for (const line of dto.lines) await validateBody(CheckoutLine, line)
    const storeId = BigInt(req.user.storeId)
    return this.prisma.$transaction(async (tx) => {
      if (dto.customerId) {
        const customer = await tx.customer.findFirst({ where: { id: BigInt(dto.customerId), storeId, deletedAt: null } })
        if (!customer) throw new NotFoundException('Customer not found in this store')
      }
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
      const taxCents = lines.reduce((sum, line) => sum + Math.round(Math.round(Number(line.product.sellingPrice) * 100) * line.quantity * Math.round(Number(line.product.taxRate) * 1000) / 100000), 0)
      const totalCents = subtotalCents + taxCents
      if (totalCents <= 0) throw new BadRequestException('Sale total must be greater than zero')
      const items = lines.map(({ product, quantity }) => ({ productId: product.id, skuSnapshot: product.sku, nameSnapshot: product.name, quantity, unitPrice: toDecimal(Math.round(Number(product.sellingPrice) * 100)), taxRate: product.taxRate, lineTotal: toDecimal(Math.round(Number(product.sellingPrice) * 100) * quantity) }))
      const sale = await tx.sale.create({ data: { storeId, cashierUserId: BigInt(req.user.userId), customerId: dto.customerId ? parseDatabaseId(dto.customerId) : undefined, receiptNumber: `R-${Date.now()}-${randomBytes(3).toString('hex')}`, subtotal: toDecimal(subtotalCents), taxAmount: toDecimal(taxCents), totalAmount: toDecimal(totalCents), currency: 'USD', items: { create: items }, payments: { create: { method: dto.paymentMethod ?? PaymentMethod.cash, amount: toDecimal(totalCents) } } } })
      for (const { product, quantity } of lines) {
        if (!product.trackInventory) continue
        const updated = await tx.inventory.updateMany({ where: { storeId, productId: product.id, quantityOnHand: { gte: quantity } }, data: { quantityOnHand: { decrement: quantity } } })
        if (updated.count !== 1) throw new ConflictException(`Insufficient stock for ${product.name}`)
        const inventory = await tx.inventory.findUniqueOrThrow({ where: { storeId_productId: { storeId, productId: product.id } } })
        await tx.inventoryMovement.create({ data: { storeId, productId: product.id, userId: BigInt(req.user.userId), saleId: sale.id, movementType: 'sale', quantityDelta: -quantity, quantityAfter: inventory.quantityOnHand } })
      }
      return { id: sale.id.toString(), receiptNumber: sale.receiptNumber, subtotal: sale.subtotal.toString(), taxAmount: sale.taxAmount.toString(), totalAmount: sale.totalAmount.toString(), status: sale.status }
    })
  }
}

@Module({ controllers: [AuthController, ProductsController, SalesController], providers: [PrismaService, AuthService, JwtGuard] })
export class AppModule {}
