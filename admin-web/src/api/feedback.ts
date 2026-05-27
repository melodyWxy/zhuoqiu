import { http } from './client'
import type { Pagination } from '../types'

export type FeedbackType = 'bug' | 'suggestion' | 'cooperation'
export type FeedbackStatus = 'pending' | 'resolved'

export interface FeedbackUser {
  id: string
  nickname: string
  avatar: string
  phoneNumber: string | null
}

export interface FeedbackItem {
  id: string
  userId: string | null
  user: FeedbackUser | null
  type: FeedbackType
  content: string
  status: FeedbackStatus
  createdAt: string
  resolvedAt: string | null
  resolvedBy: string | null
}

export const feedbackApi = {
  list: (params: {
    page?: number
    pageSize?: number
    type?: FeedbackType
    status?: FeedbackStatus
  } = {}) =>
    http
      .get<Pagination<FeedbackItem>>('/admin/feedback', { params })
      .then((r) => r.data as unknown as Pagination<FeedbackItem>),

  get: (id: string) =>
    http
      .get<FeedbackItem>(`/admin/feedback/${id}`)
      .then((r) => r.data as unknown as FeedbackItem),

  resolve: (id: string) =>
    http
      .patch<FeedbackItem>(`/admin/feedback/${id}/resolve`)
      .then((r) => r.data as unknown as FeedbackItem)
}
