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
