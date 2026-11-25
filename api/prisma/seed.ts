import { resolve } from 'node:path'
import { config } from 'dotenv'
import { hash } from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const apiEnvPath = resolve(__dirname, '../.env')
config({ path: apiEnvPath })

const prisma = new PrismaClient()

async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase()
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password || password.length < 12) throw new Error('Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters in .env')
  const ownerRole = await prisma.role.findFirst({ where: { isOwner: true, storeId: null } })
  if (!ownerRole) throw new Error('Run database/mysql/001_schema.sql first to create roles and permissions')
  const store = await prisma.store.upsert({ where: { id: 1n }, create: { name: process.env.STORE_NAME ?? 'My Retail Store' }, update: {} })
  const user = await prisma.user.upsert({ where: { email }, create: { email, passwordHash: await hash(password, 12), firstName: 'Store', lastName: 'Owner' }, update: { passwordHash: await hash(password, 12), isActive: true, deletedAt: null } })
  await prisma.storeUser.upsert({ where: { storeId_userId: { storeId: store.id, userId: user.id } }, create: { storeId: store.id, userId: user.id, roleId: ownerRole.id }, update: { roleId: ownerRole.id } })
  console.info(`Owner account ready: ${email}`)
}

main().finally(async () => prisma.$disconnect())
