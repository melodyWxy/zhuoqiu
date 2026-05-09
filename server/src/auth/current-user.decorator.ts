import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { UserRequest } from './user-auth.guard'
import { UserJwtPayload } from './jwt-payload'

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserJwtPayload => {
    const req = ctx.switchToHttp().getRequest<UserRequest>()
    return req.user
  }
)
