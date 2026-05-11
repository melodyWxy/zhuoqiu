import { AdminRole, VenueAccountRole } from '@prisma/client'

export type VenueClient = 'admin_web' | 'c_app'

export interface AdminJwtPayload {
  type: 'admin'
  sub: string // admin account id
  role: AdminRole
  iat?: number
  exp?: number
  jti?: string
}

export interface UserJwtPayload {
  type: 'user'
  sub: string // user id
  iat?: number
  exp?: number
  jti?: string
}

export interface VenueAccountJwtPayload {
  type: 'venue_account'
  sub: string // venue account id
  role: VenueAccountRole
  venueId: string | null
  client: VenueClient
  iat?: number
  exp?: number
  jti?: string
}

export interface AdminRefreshPayload {
  type: 'admin_refresh'
  sub: string
  iat?: number
  exp?: number
  jti?: string
}

export interface UserRefreshPayload {
  type: 'user_refresh'
  sub: string
  iat?: number
  exp?: number
  jti?: string
}

export interface VenueAccountRefreshPayload {
  type: 'venue_account_refresh'
  sub: string
  client: VenueClient
  iat?: number
  exp?: number
  jti?: string
}
