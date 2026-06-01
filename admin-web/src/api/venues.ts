import { http } from './client'
import type { Pagination } from '../types'

export type VenueApplicationStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'

export interface VenueApplicationPayload {
  name: string
  contactName: string
  contactPhone: string
  province: string
  city: string
  district: string
  address: string
  tablesCount: number
  openHours: Array<{ day: string; hours: string }>
  description?: string
}

export interface RegionNode {
  code: string
  name: string
  children?: RegionNode[]
}

export interface VenueApplicationItem {
  id: string
  applicantAccountId: string
  source: 'c_app' | 'admin_web'
  payloadJson: VenueApplicationPayload
  licenseImage: string | null
  idCardImage: string | null
  status: VenueApplicationStatus
  rejectReason: string | null
  reviewedByAdminId: string | null
  reviewedAt: string | null
  venueId: string | null
  createdAt: string
  updatedAt: string
  applicant?: {
    id: string
    phoneNumber: string
    nickname: string
  }
}

export const venueAdminApi = {
  list: (params: {
    status?: VenueApplicationStatus
    page?: number
    pageSize?: number
  } = {}) =>
    http
      .get<Pagination<VenueApplicationItem>>('/admin/venue-applications', { params })
      .then((r) => r.data as unknown as Pagination<VenueApplicationItem>),

  detail: (id: string) =>
    http
      .get<VenueApplicationItem>(`/admin/venue-applications/${id}`)
      .then((r) => r.data as unknown as VenueApplicationItem),

  approve: (id: string) =>
    http
      .post(`/admin/venue-applications/${id}/approve`)
      .then((r) => r.data),

  reject: (id: string, rejectReason: string) =>
    http
      .post(`/admin/venue-applications/${id}/reject`, { rejectReason })
      .then((r) => r.data)
}

export const regionsApi = {
  list: () =>
    http
      .get<{ tree: RegionNode[] }>('/regions')
      .then((r) => r.data as unknown as { tree: RegionNode[] })
}
