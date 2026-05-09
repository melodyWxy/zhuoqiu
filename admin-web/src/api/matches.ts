import { http } from './client'
import type {
  MatchDetail,
  MatchEventItem,
  MatchListItem,
  MatchState,
  MatchType,
  Pagination
} from '../types'

export interface ListMatchesParams {
  page?: number
  pageSize?: number
  keyword?: string
  state?: MatchState[]
  type?: MatchType
  createdFrom?: string
  createdTo?: string
}

export const matchesApi = {
  list: (params: ListMatchesParams = {}) => {
    const q: Record<string, unknown> = { ...params }
    if (q.state && Array.isArray(q.state)) q.state = (q.state as string[]).join(',')
    return http
      .get<Pagination<MatchListItem>>('/admin/matches', { params: q })
      .then((r) => r.data as unknown as Pagination<MatchListItem>)
  },

  detail: (idOrCode: string) =>
    http
      .get<MatchDetail>(`/admin/matches/${idOrCode}`)
      .then((r) => r.data as unknown as MatchDetail),

  events: (id: string, page = 1, pageSize = 50) =>
    http
      .get<Pagination<MatchEventItem>>(`/admin/matches/${id}/events`, {
        params: { page, pageSize }
      })
      .then((r) => r.data as unknown as Pagination<MatchEventItem>),

  forcePause: (id: string, reason: string) =>
    http.post(`/admin/matches/${id}/force-pause`, { reason }),

  forceEnd: (id: string, reason: string) =>
    http.post(`/admin/matches/${id}/force-end`, { reason }),

  kick: (id: string, userId: string, reason: string) =>
    http.post(`/admin/matches/${id}/kick`, { userId, reason })
}
