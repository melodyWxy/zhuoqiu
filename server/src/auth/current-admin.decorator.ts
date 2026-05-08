import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { AdminRequest } from './admin-auth.guard'
import { AdminJwtPayload } from './jwt-payload'

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminJwtPayload => {
    const req = ctx.switchToHttp().getRequest<AdminRequest>()
    return req.admin
  }
)
