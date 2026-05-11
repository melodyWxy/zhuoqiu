import { SetMetadata } from '@nestjs/common'
import { VenueClient } from '../auth/jwt-payload'

export const REQUIRE_CLIENT_KEY = 'venue:require_client'

/**
 * 限制接口只能由特定 client 类型的 venue_account JWT 访问。
 * 例如：写入接口加 @RequireClient('admin_web')，C 端商家登录时调用会被 60010 拒绝。
 */
export const RequireClient = (...clients: VenueClient[]) =>
  SetMetadata(REQUIRE_CLIENT_KEY, clients)
