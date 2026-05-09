import { Injectable, Logger } from '@nestjs/common'
import type { WebSocket } from 'ws'

/**
 * 维护 "matchId → Set<WebSocket>" 的订阅表，提供房间级广播。
 * 独立于 Gateway，方便 MatchService 注入调用（Gateway 注入 service 做订阅管理）。
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name)

  // matchId → Set<ws>
  private readonly matchSubs = new Map<string, Set<WebSocket>>()
  // ws → Set<matchId> （反向索引，便于断开时清理）
  private readonly wsSubs = new WeakMap<WebSocket, Set<string>>()
  // 全量订阅（管理端）
  private readonly adminSubs = new Set<WebSocket>()

  subscribeMatch(ws: WebSocket, matchId: string): void {
    let set = this.matchSubs.get(matchId)
    if (!set) {
      set = new Set()
      this.matchSubs.set(matchId, set)
    }
    set.add(ws)

    let rev = this.wsSubs.get(ws)
    if (!rev) {
      rev = new Set()
      this.wsSubs.set(ws, rev)
    }
    rev.add(matchId)
  }

  unsubscribeMatch(ws: WebSocket, matchId: string): void {
    this.matchSubs.get(matchId)?.delete(ws)
    this.wsSubs.get(ws)?.delete(matchId)
  }

  subscribeAll(ws: WebSocket): void {
    this.adminSubs.add(ws)
  }

  unsubscribeAll(ws: WebSocket): void {
    this.adminSubs.delete(ws)
  }

  onDisconnect(ws: WebSocket): void {
    const matches = this.wsSubs.get(ws)
    if (matches) {
      for (const m of matches) this.matchSubs.get(m)?.delete(ws)
    }
    this.adminSubs.delete(ws)
  }

  broadcastMatchEvent(matchId: string, payload: unknown): void {
    const msg = JSON.stringify({ op: 'match_event', data: { matchId, ...(payload as object) } })
    this.broadcast(matchId, msg)
  }

  broadcastMatchState(matchId: string, state: unknown): void {
    const msg = JSON.stringify({ op: 'match_state', data: { matchId, state } })
    this.broadcast(matchId, msg)
  }

  broadcastKicked(matchId: string, userId: string, reason: string): void {
    const msg = JSON.stringify({
      op: 'kicked',
      data: { matchId, userId, reason }
    })
    this.broadcast(matchId, msg)
  }

  private broadcast(matchId: string, msg: string): void {
    // 房间订阅
    const subs = this.matchSubs.get(matchId)
    if (subs) {
      for (const ws of subs) this.sendSafe(ws, msg)
    }
    // 管理端全量订阅
    for (const ws of this.adminSubs) this.sendSafe(ws, msg)
  }

  private sendSafe(ws: WebSocket, msg: string): void {
    try {
      if (ws.readyState === 1 /* OPEN */) {
        ws.send(msg)
      }
    } catch (e) {
      this.logger.warn(`WS send failed: ${(e as Error).message}`)
    }
  }

  stats() {
    return {
      matchSubs: Array.from(this.matchSubs.entries()).map(([k, v]) => ({
        matchId: k,
        count: v.size
      })),
      adminSubs: this.adminSubs.size
    }
  }
}
