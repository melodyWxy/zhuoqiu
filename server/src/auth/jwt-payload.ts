import { AdminRole } from '@prisma/client'

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

export interface AdminRefreshPayload {
  type: 'admin_refresh'
  sub: string
  iat?: number
  exp?: number
  jti?: string
}
