import { venueHttp } from './venue-client'
import type {
  VenueApplicationItem,
  VenueApplicationPayload
} from './venues'

export const venueAuthApi = {
  sendSms: (phoneNumber: string) =>
    venueHttp
      .post<{ sentAt: string; expiresInSec: number; devHint: string | null }>(
        '/venue-auth/sms/send',
        { phoneNumber }
      )
      .then((r) => r.data),

  verify: (params: {
    phoneNumber: string
    code: string
    nickname?: string
  }) =>
    venueHttp
      .post<{
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
        client: 'admin_web'
      }>('/venue-auth/sms/verify', { ...params, client: 'admin_web' })
      .then((r) => r.data),

  me: () =>
    venueHttp
      .get<{
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
      }>('/venue-auth/me')
      .then((r) => r.data),

  logout: () => venueHttp.post('/venue-auth/logout').then((r) => r.data)
}

export const venueApplicationApi = {
  submit: (params: {
    payload: VenueApplicationPayload
    licenseImage: string
    idCardImage?: string
  }) =>
    venueHttp
      .post<{ application: VenueApplicationItem }>(
        '/venue/applications',
        params
      )
      .then((r) => r.data),

  mine: () =>
    venueHttp
      .get<{ application: VenueApplicationItem | null }>(
        '/venue/applications/mine'
      )
      .then((r) => r.data)
}

export const uploadApi = {
  upload: async (
    file: File,
    category: string
  ): Promise<{ url: string; path: string }> => {
    const fd = new FormData()
    fd.append('file', file)
    const r = await venueHttp.post<{ url: string; path: string }>(
      `/uploads?category=${encodeURIComponent(category)}`,
      fd,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )
    return r.data as unknown as { url: string; path: string }
  }
}
