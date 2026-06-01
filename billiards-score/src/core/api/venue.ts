import Taro from '@tarojs/taro'
import { API_BASE_URL } from './config'
import { callVenueApi } from './venue-client'
import { callApi } from './client'

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
    province: string | null
    city: string | null
    district: string | null
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
  province: string | null
  city: string | null
  district: string | null
  address: string
  lat: number | null
  lng: number | null
  phone: string
  coverImage: string | null
  tablesCount: number
  openHoursJson: Record<string, string> | null
  description: string | null
  status: string
  createdAt: string
}

export interface RegionNode {
  code: string
  name: string
  children?: RegionNode[]
}

export const regionsApi = {
  /** 全国省/市/区树。服务端缓存 24h，客户端建议本地再缓存 7 天。 */
  list: () =>
    callApi<{ tree: RegionNode[] }>('/regions', { auth: false, toast: false })
}

/** 公共球房发现接口，匿名可访问 */
export const venuesPublicApi = {
  list: (
    params: {
      keyword?: string
      province?: string
      city?: string
      district?: string
      page?: number
      pageSize?: number
    } = {}
  ) => {
    const q = new URLSearchParams()
    if (params.keyword) q.set('keyword', params.keyword)
    if (params.province) q.set('province', params.province)
    if (params.city) q.set('city', params.city)
    if (params.district) q.set('district', params.district)
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

// ============ 赛事（C 端） ============

export type TournamentStatus =
  | 'draft'
  | 'registering'
  | 'registration_closed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export interface TournamentItem {
  id: string
  venueId: string
  title: string
  gameType: 'nine_ball' | 'eight_ball'
  format: 'single_elim' | 'double_elim' | 'round_robin' | 'swiss'
  rulesJson: Record<string, number>
  maxPlayers: number
  minPlayers: number
  entryFeeCents: number
  prizePoolText: string | null
  registrationStartsAt: string
  registrationEndsAt: string
  matchStartsAt: string
  coverImage: string | null
  status: TournamentStatus
  registeredCount: number
  createdAt: string
  updatedAt: string
}

export interface TournamentDetailPublic extends TournamentItem {
  venue: {
    id: string
    name: string
    province: string | null
    city: string | null
    district: string | null
    address: string
    coverImage: string | null
  } | null
  noticeText: string | null
}

export interface TournamentRegPublic {
  id: string
  displayName: string
  registeredAt: string
  seed: number | null
}

export interface MyRegistration {
  id: string
  tournamentId: string
  status: 'confirmed' | 'withdrawn' | 'disqualified'
  displayName: string
  seed: number | null
  registeredAt: string
}

export interface BracketPlayerRef {
  id: string
  displayName: string
  seed: number | null
  userId: string
}

export interface BracketMatchItem {
  id: string
  tournamentId: string
  round: number
  slotInRound: number
  playerARegistrationId: string | null
  playerBRegistrationId: string | null
  playerA: BracketPlayerRef | null
  playerB: BracketPlayerRef | null
  winnerRegistrationId: string | null
  winner: BracketPlayerRef | null
  matchId: string | null
  status: 'pending' | 'ready' | 'in_progress' | 'completed' | 'walkover'
  scheduledAt: string | null
}

export interface BracketTree {
  tournamentId: string
  status: string
  totalRounds: number
  rounds: Array<{ round: number; matches: BracketMatchItem[] }>
}

export const tournamentsPublicApi = {
  list: (params: {
    venueId?: string
    status?: TournamentStatus
    page?: number
    pageSize?: number
  } = {}) => {
    const q = new URLSearchParams()
    if (params.venueId) q.set('venueId', params.venueId)
    if (params.status) q.set('status', params.status)
    if (params.page) q.set('page', String(params.page))
    if (params.pageSize) q.set('pageSize', String(params.pageSize))
    const qs = q.toString()
    return callApi<{
      items: TournamentItem[]
      total: number
      page: number
      pageSize: number
    }>(`/tournaments${qs ? `?${qs}` : ''}`, { auth: false, toast: false })
  },

  detail: (id: string) =>
    callApi<TournamentDetailPublic>(`/tournaments/${id}`, {
      auth: false,
      toast: false
    }),

  registrations: (id: string) =>
    callApi<{ items: TournamentRegPublic[]; total: number }>(
      `/tournaments/${id}/registrations`,
      { auth: false, toast: false }
    ),

  register: (id: string, displayName?: string) =>
    callApi<{ registration: MyRegistration }>(`/tournaments/${id}/register`, {
      method: 'POST',
      data: displayName ? { displayName } : {}
    }),

  withdraw: (id: string) =>
    callApi<{ registration: MyRegistration }>(`/tournaments/${id}/withdraw`, {
      method: 'POST'
    }),

  myRegistration: (id: string) =>
    callApi<{ registration: MyRegistration | null }>(
      `/tournaments/${id}/my-registration`,
      { toast: false }
    ),

  myTournaments: () =>
    callApi<{
      items: Array<{
        registrationId: string
        registrationStatus: 'confirmed' | 'withdrawn' | 'disqualified'
        seed: number | null
        registeredAt: string
        tournament: TournamentItem
      }>
      total: number
    }>(`/me/tournaments`, { toast: false }),

  bracket: (id: string) =>
    callApi<BracketTree>(`/tournaments/${id}/bracket`, {
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
 * 商家文件上传：H5 + 小程序统一走 `Taro.uploadFile` multipart 推服务端，
 * 服务端 OSS_ENABLED=true 时再代理推 OSS（避免 c 端引入 2.6MB 的 ali-oss SDK
 * 把 weapp 主包撑爆 2MB 上限）。
 */
export async function uploadVenueFile(
  filePath: string,
  category: string,
  token: string
): Promise<{ url: string; path: string }> {
  return new Promise((resolve, reject) => {
    Taro.uploadFile({
      url: `${API_BASE_URL}/uploads?category=${encodeURIComponent(category)}`,
      filePath,
      name: 'file',
      header: { Authorization: `Bearer ${token}` },
      success: (res) => {
        try {
          const body = JSON.parse(res.data) as {
            code: number
            data?: { url: string; path: string }
            message?: string
          }
          if (res.statusCode !== 200 || body.code !== 0 || !body.data) {
            reject(new Error(body.message ?? `上传失败 ${res.statusCode}`))
            return
          }
          resolve({ url: body.data.url, path: body.data.path })
        } catch {
          reject(new Error('上传响应解析失败'))
        }
      },
      fail: (err) => reject(new Error(err.errMsg ?? '上传失败'))
    })
  })
}
