import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from '@nestjs/common'
import { Request } from 'express'
import { AuthService } from './auth.service'
import { UserJwtPayload } from './jwt-payload'

export interface UserRequest extends Request {
  user: UserJwtPayload
}

@Injectable()
export class UserAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<UserRequest>()
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('缺少 Authorization 头')
    }
    const token = header.slice(7)
    let payload: UserJwtPayload
    try {
      payload = this.authService.verifyUserAccessToken(token)
    } catch {
      throw new UnauthorizedException('token 无效或已过期')
    }
    req.user = payload
    return true
  }
}
