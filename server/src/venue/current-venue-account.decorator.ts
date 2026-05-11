import { ExecutionContext, createParamDecorator } from '@nestjs/common'
import { VenueAccountRequest } from './venue-auth.guard'

export const CurrentVenueAccount = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<VenueAccountRequest>()
    return req.venueAccount
  }
)
