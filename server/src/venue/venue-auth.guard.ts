import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Request } from 'express'
import { AuthService } from '../auth/auth.service'
import { VenueAccountJwtPayload, VenueClient } from '../auth/jwt-payload'
import { BusinessException, ErrorCode } from '../common/exceptions/business.exception'
import { REQUIRE_CLIENT_KEY } from './require-client.decorator'

export interface VenueAccountRequest extends Request {
  venueAccount: VenueAccountJwtPayload
}

@Injectable()
export class VenueAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<VenueAccountRequest>()
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('缺少 Authorization 头')
    }
    const token = header.slice(7)
    let payload: VenueAccountJwtPayload
    try {
      payload = this.authService.verifyVenueAccountAccessToken(token)
    } catch {
      throw new UnauthorizedException('token 无效或已过期')
    }

    const requiredClients = this.reflector.getAllAndOverride<VenueClient[] | undefined>(
      REQUIRE_CLIENT_KEY,
      [ctx.getHandler(), ctx.getClass()]
    )
    if (requiredClients && !requiredClients.includes(payload.client)) {
      throw new BusinessException(
        ErrorCode.VENUE_ONLY_ADMIN_WEB,
        '此操作仅可在管理后台进行'
      )
    }

    req.venueAccount = payload
    return true
  }
}
