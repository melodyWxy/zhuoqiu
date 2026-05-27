import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { AuthService } from './auth.service'
import { UserRequest } from './user-auth.guard'

@Injectable()
export class OptionalUserAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<UserRequest>()
    const header = req.headers.authorization
    if (header?.startsWith('Bearer ')) {
      const token = header.slice(7)
      try {
        req.user = this.authService.verifyUserAccessToken(token)
      } catch {
        // 缺/坏 token 容忍：当作匿名访问
      }
    }
    return true
  }
}
