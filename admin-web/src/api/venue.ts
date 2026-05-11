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

export interface UpdateVenuePayload {
  name?: string
  address?: string
  phone?: string
  coverImage?: string | null
  tablesCount?: number
  openHours?: Array<{ day: string; hours: string }>
  description?: string
}

export const venueMyApi = {
  update: (patch: UpdateVenuePayload) =>
    venueHttp
      .patch<{ venue: VenuePublic }>('/venue/me/venue', patch)
      .then((r) => r.data as unknown as { venue: VenuePublic })
}

// ============ 赛事（商家 + 公共） ============

export type TournamentStatus =
  | 'draft'
  | 'registering'
  | 'registration_closed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type TournamentFormat =
  | 'single_elim'
  | 'double_elim'
  | 'round_robin'
  | 'swiss'

export interface TournamentItem {
  id: string
  venueId: string
  title: string
  gameType: 'nine_ball' | 'eight_ball'
  format: TournamentFormat
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

export interface TournamentRegistrationItem {
  id: string
  tournamentId: string
  userId: string
  displayName: string
  phone: string
  seed: number | null
  status: 'confirmed' | 'withdrawn' | 'disqualified'
  registeredAt: string
}

export interface CreateTournamentPayload {
  title: string
  gameType: 'nine_ball' | 'eight_ball'
  format: TournamentFormat
  rules: Record<string, number>
  maxPlayers: number
  minPlayers: number
  entryFeeCents?: number
  prizePoolText?: string
  registrationStartsAt: string
  registrationEndsAt: string
  matchStartsAt: string
  coverImage?: string
  noticeText?: string
}

export type UpdateTournamentPayload = Partial<CreateTournamentPayload>

export type BracketMatchStatus =
  | 'pending'
  | 'ready'
  | 'in_progress'
  | 'completed'
  | 'walkover'

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
  status: BracketMatchStatus
  scheduledAt: string | null
}

export interface BracketTree {
  tournamentId: string
  status: string
  totalRounds: number
  rounds: Array<{
    round: number
    matches: BracketMatchItem[]
  }>
}

export const tournamentMerchantApi = {
  list: (params: { status?: TournamentStatus; page?: number; pageSize?: number } = {}) =>
    venueHttp
      .get<{
        items: TournamentItem[]
        total: number
        page: number
        pageSize: number
      }>('/venue/tournaments', { params })
      .then((r) => r.data as unknown as {
        items: TournamentItem[]
        total: number
        page: number
        pageSize: number
      }),

  create: (payload: CreateTournamentPayload) =>
    venueHttp
      .post<{ tournament: TournamentItem }>('/venue/tournaments', payload)
      .then((r) => r.data as unknown as { tournament: TournamentItem }),

  detail: (id: string) =>
    venueHttp
      .get<{ tournament: TournamentItem }>(`/venue/tournaments/${id}`)
      .then((r) => r.data as unknown as { tournament: TournamentItem }),

  update: (id: string, patch: UpdateTournamentPayload) =>
    venueHttp
      .patch<{ tournament: TournamentItem }>(`/venue/tournaments/${id}`, patch)
      .then((r) => r.data as unknown as { tournament: TournamentItem }),

  publish: (id: string) =>
    venueHttp
      .post<{ tournament: TournamentItem }>(`/venue/tournaments/${id}/publish`)
      .then((r) => r.data as unknown as { tournament: TournamentItem }),

  cancel: (id: string) =>
    venueHttp
      .post<{ tournament: TournamentItem }>(`/venue/tournaments/${id}/cancel`)
      .then((r) => r.data as unknown as { tournament: TournamentItem }),

  closeRegistration: (id: string) =>
    venueHttp
      .post<{ tournament: TournamentItem }>(
        `/venue/tournaments/${id}/close-registration`
      )
      .then((r) => r.data as unknown as { tournament: TournamentItem }),

  registrations: (id: string, showWithdrawn = false) =>
    venueHttp
      .get<{ items: TournamentRegistrationItem[]; total: number }>(
        `/venue/tournaments/${id}/registrations`,
        { params: { showWithdrawn: showWithdrawn ? 'true' : undefined } }
      )
      .then((r) => r.data as unknown as {
        items: TournamentRegistrationItem[]
        total: number
      }),

  kick: (id: string, regId: string) =>
    venueHttp
      .post<{ registration: TournamentRegistrationItem }>(
        `/venue/tournaments/${id}/registrations/${regId}/kick`
      )
      .then((r) => r.data),

  start: (id: string) =>
    venueHttp
      .post<{ tournament: TournamentItem }>(`/venue/tournaments/${id}/start`)
      .then((r) => r.data as unknown as { tournament: TournamentItem }),

  bracket: (id: string) =>
    venueHttp
      .get<BracketTree>(`/venue/tournaments/${id}/bracket`)
      .then((r) => r.data as unknown as BracketTree),

  startBracketMatch: (id: string, bmId: string) =>
    venueHttp
      .post<{ matchId: string; code: string; bracketMatchId: string }>(
        `/venue/tournaments/${id}/bracket/${bmId}/start`
      )
      .then((r) => r.data as unknown as {
        matchId: string
        code: string
        bracketMatchId: string
      }),

  walkover: (id: string, bmId: string, winnerSide: 'A' | 'B') =>
    venueHttp
      .post<{ ok: boolean }>(`/venue/tournaments/${id}/bracket/${bmId}/walkover`, {
        winnerSide
      })
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
