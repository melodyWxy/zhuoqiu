import { http } from './client'
import type { AnalyticsOverview, AuditLogItem, Pagination } from '../types'

export const analyticsApi = {
  overview: () =>
    http
      .get<AnalyticsOverview>('/admin/analytics/overview')
      .then((r) => r.data as unknown as AnalyticsOverview)
}

export const auditApi = {
  list: (params: {
    page?: number
    pageSize?: number
    actorAdminId?: string
    action?: string
    targetId?: string
    from?: string
    to?: string
  } = {}) =>
    http
      .get<Pagination<AuditLogItem>>('/admin/audit-logs', { params })
      .then((r) => r.data as unknown as Pagination<AuditLogItem>)
}

export const settingsApi = {
  get: () =>
    http
      .get<Record<string, unknown>>('/admin/settings')
      .then((r) => r.data as unknown as Record<string, unknown>),
  patch: (patch: Record<string, unknown>) =>
    http.patch('/admin/settings', patch)
}
