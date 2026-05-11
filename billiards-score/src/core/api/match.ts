import { callApi } from './client'

export interface PlayerSlotInput {
  slot: number
  name: string
  claim?: boolean
}

export interface MatchDetail {
  id: string
  code: string | null
  type: 'nine_ball' | 'eight_ball'
  rules: Record<string, number>
  state: 'waiting' | 'in_progress' | 'paused' | 'ended' | 'dissolved'
  players: Array<{
    slot: number
    displayName: string
    userId: string | null
    isCurrent: boolean
    joinedAt: string
    leftAt: string | null
  }>
  computed: {
    scores?: Record<number, number>
    stats?: Record<
      number,
      { bigJack: number; smallJack: number; golden9: number; normalWin: number }
    >
    wins?: Record<number, number>
  }
  timer: {
    startedAt: string | null
    accumulatedMs: number
    isPaused: boolean
  }
  lastEventSeq: number
  ownerUserId: string
  owner: { id: string; nickname: string; avatar?: string } | null
  endedAt: string | null
  endedBy: string | null
  endedReason: string | null
}

export interface EventResult {
  serverSeq: number
  matchState: MatchDetail
}

export const matchApi = {
  create: (input: {
    type: 'nine_ball' | 'eight_ball'
    rules?: Record<string, number>
    playerSlots: PlayerSlotInput[]
  }) => callApi<MatchDetail>('/matches', { method: 'POST', data: input }),

  join: (code: string, slot?: number, displayName?: string) =>
    callApi<{ match: MatchDetail; role: 'player' | 'spectator' }>(
      '/matches/join',
      { method: 'POST', data: { code, slot, displayName } }
    ),

  detail: (idOrCode: string, opts?: { toast?: boolean }) =>
    callApi<MatchDetail>(`/matches/${idOrCode}`, { toast: opts?.toast ?? true }),

  seat: (id: string, action: 'occupy' | 'leave', slot?: number, displayName?: string) =>
    callApi<MatchDetail>(`/matches/${id}/seat`, {
      method: 'POST',
      data: { action, slot, displayName }
    }),

  event: (
    id: string,
    type: string,
    payload: Record<string, unknown>,
    clientSeq?: number
  ) =>
    callApi<EventResult>(`/matches/${id}/events`, {
      method: 'POST',
      data: { type, payload, clientSeq }
    }),

  undo: (id: string) =>
    callApi<{
      serverSeq: number | null
      undoneEventId: number | null
      matchState?: MatchDetail
    }>(`/matches/${id}/events/undo`, { method: 'POST' }),

  end: (id: string, reason?: string) =>
    callApi<MatchDetail>(`/matches/${id}/end`, {
      method: 'POST',
      data: { reason }
    }),

  myHistory: (page = 1, pageSize = 20) =>
    callApi<{
      items: Array<MatchDetail & { durationMs: number; myScore?: number }>
      total: number
      page: number
      pageSize: number
    }>(`/me/matches?page=${page}&pageSize=${pageSize}`),

  myActiveMatch: () =>
    callApi<{ match: MatchDetail | null }>(`/me/active-match`, { toast: false }),

  events: (id: string) =>
    callApi<{
      items: Array<{
        id: number
        serverSeq: number
        actorUserId: string | null
        actorAdminId: string | null
        type: string
        payloadJson: Record<string, unknown>
        undone: boolean
        undoneByEventId: number | null
        createdAt: string
      }>
      total: number
    }>(`/matches/${id}/events`)
}
