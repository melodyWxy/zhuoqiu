import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Request } from 'express'
import { AuthService } from './auth.service'
import { AdminJwtPayload } from './jwt-payload'
import { ROLES_KEY } from './roles.decorator'
import { AdminRole } from '@prisma/client'

export interface AdminRequest extends Request {
  admin: AdminJwtPayload
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AdminRequest>()
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('缺少 Authorization 头')
    }
    const token = header.slice(7)
    let payload: AdminJwtPayload
    try {
      payload = this.authService.verifyAdminAccessToken(token)
    } catch {
      throw new UnauthorizedException('token 无效或已过期')
    }
    req.admin = payload

    // 角色检查（若有 @Roles 装饰器）
    const requiredRoles = this.reflector.getAllAndOverride<AdminRole[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass()
    ])
    if (requiredRoles && requiredRoles.length > 0) {
      if (!requiredRoles.includes(payload.role)) {
        throw new ForbiddenException('角色权限不足')
      }
    }

    return true
  }
}
