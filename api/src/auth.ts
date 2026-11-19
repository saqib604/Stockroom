import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { compare } from 'bcryptjs'
import { sign, verify } from 'jsonwebtoken'
import { PrismaService } from './prisma.service'

export type Session = { userId: string; storeId: string; role: string }
const tokenSecret = () => {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be set to at least 32 characters')
  return secret
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findFirst({ where: { email: email.toLowerCase(), isActive: true, deletedAt: null }, include: { storeLinks: { include: { store: true, role: true } } } })
    if (!user || !(await compare(password, user.passwordHash))) throw new UnauthorizedException('Invalid email or password')
    const membership = user.storeLinks[0]
    if (!membership) throw new UnauthorizedException('User is not assigned to a store')
    const payload: Session = { userId: user.id.toString(), storeId: membership.storeId.toString(), role: membership.role.name }
    return { accessToken: sign(payload, tokenSecret(), { expiresIn: '8h', issuer: 'stockroom-api' }), user: { id: payload.userId, email: user.email, name: `${user.firstName} ${user.lastName}`, storeId: payload.storeId, storeName: membership.store.name, role: payload.role } }
  }
}

@Injectable()
export class JwtGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: Session }>()
    const authorization = request.headers.authorization
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Bearer token required')
    try {
      request.user = verify(authorization.slice(7), tokenSecret(), { issuer: 'stockroom-api' }) as Session
      return true
    } catch {
      throw new UnauthorizedException('Invalid or expired token')
    }
  }
}
