import { http } from './client'
import type { Pagination, UserDetail, UserListItem, UserStatus } from '../types'

export interface ListUsersParams {
  page?: number
  pageSize?: number
  keyword?: string
  status?: UserStatus
}

export const usersApi = {
  list: (params: ListUsersParams = {}) =>
    http
      .get<Pagination<UserListItem>>('/admin/users', { params })
      .then((r) => r.data as unknown as Pagination<UserListItem>),

  detail: (id: string) =>
    http
      .get<UserDetail>(`/admin/users/${id}`)
      .then((r) => r.data as unknown as UserDetail),

  ban: (id: string, durationDays: number, reason: string) =>
    http.post(`/admin/users/${id}/ban`, { durationDays, reason }),

  unban: (id: string, reason?: string) =>
    http.post(`/admin/users/${id}/unban`, { reason: reason ?? '' })
}
