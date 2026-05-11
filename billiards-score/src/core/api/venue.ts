import Taro from '@tarojs/taro'
import { API_BASE_URL } from './config'
import { callVenueApi } from './venue-client'
import { callApi } from './client'

export interface VenueApplicationPayload {
  name: string
  contactName: string
  contactPhone: string
  address: string
  tablesCount: number
  openHours: Array<{ day: string; hours: string }>
  description?: string
}

export interface VenueApplicationItem {
  id: string
  applicantAccountId: string
  source: 'c_app' | 'admin_web'
  payloadJson: VenueApplicationPayload
  licenseImage: string | null
  idCardImage: string | null
  status: 'draft' | 'pending' | 'approved' | 'rejected'
  rejectReason: string | null
  reviewedByAdminId: string | null
  reviewedAt: string | null
  venueId: string | null
  createdAt: string
  updatedAt: string
}

export interface VenueMe {
  account: {
    id: string
    phoneNumber: string
    nickname: string
    role: 'owner' | 'staff'
    status: string
    venueId: string | null
  } | null
  venue: {
    id: string
    name: string
    address: string
    status: string
    tablesCount: number
  } | null
  client: string
}

export const venueAuthApi = {
  sendSms: (phoneNumber: string) =>
    callApi<{ sentAt: string; expiresInSec: number; devHint: string | null }>(
      '/venue-auth/sms/send',
      { method: 'POST', data: { phoneNumber }, auth: false }
    ),

  verify: (params: { phoneNumber: string; code: string; nickname?: string }) =>
    callApi<{
      accessToken: string
      refreshToken: string
      expiresIn: number
      account: {
        id: string
        phoneNumber: string
        nickname: string
        role: 'owner' | 'staff'
        venueId: string | null
      }
      client: 'c_app'
    }>('/venue-auth/sms/verify', {
      method: 'POST',
      data: { ...params, client: 'c_app' },
      auth: false
    }),

  me: () => callVenueApi<VenueMe>('/venue-auth/me', { toast: false }),

  logout: () => callVenueApi('/venue-auth/logout', { method: 'POST' })
}

export interface VenuePublic {
  id: string
  name: string
  slug: string | null
  address: string
  phone: string
  coverImage: string | null
  tablesCount: number
  openHoursJson: Record<string, string> | null
  description: string | null
  status: string
  createdAt: string
}

/** 公共球房发现接口，匿名可访问 */
export const venuesPublicApi = {
  list: (params: { keyword?: string; page?: number; pageSize?: number } = {}) => {
    const q = new URLSearchParams()
    if (params.keyword) q.set('keyword', params.keyword)
    if (params.page) q.set('page', String(params.page))
    if (params.pageSize) q.set('pageSize', String(params.pageSize))
    const qs = q.toString()
    return callApi<{
      items: VenuePublic[]
      total: number
      page: number
      pageSize: number
    }>(`/venues${qs ? `?${qs}` : ''}`, { auth: false, toast: false })
  },

  detail: (id: string) =>
    callApi<{ venue: VenuePublic }>(`/venues/${id}`, {
      auth: false,
      toast: false
    })
}

export const venueApplicationApi = {
  submit: (params: {
    payload: VenueApplicationPayload
    licenseImage: string
    idCardImage?: string
  }) =>
    callVenueApi<{ application: VenueApplicationItem }>(
      '/venue/applications',
      { method: 'POST', data: params }
    ),

  mine: () =>
    callVenueApi<{ application: VenueApplicationItem | null }>(
      '/venue/applications/mine',
      { toast: false }
    )
}

/**
 * 文件上传：Taro 的 request 不方便发 multipart，用 uploadFile。
 * 手工挂 Authorization 头，走 venueSession.accessToken。
 */
export async function uploadVenueFile(
  filePath: string,
  category: string,
  token: string
): Promise<{ url: string; path: string }> {
  const r = await Taro.uploadFile({
    url: `${API_BASE_URL}/uploads?category=${encodeURIComponent(category)}`,
    filePath,
    name: 'file',
    header: { Authorization: `Bearer ${token}` }
  })
  // Taro.uploadFile 返回 string
  const parsed = JSON.parse(r.data) as {
    code: number
    data?: { url: string; path: string }
    message?: string
  }
  if (parsed.code !== 0 || !parsed.data) {
    throw new Error(parsed.message ?? '上传失败')
  }
  return parsed.data
}
