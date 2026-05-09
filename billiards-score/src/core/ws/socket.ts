import Taro from '@tarojs/taro'
import { WS_BASE_URL } from '../api/config'
import { useAuthStore } from '../auth/store'

export interface WsMessage {
  op: string
  data?: any
  reqId?: string
}

type Listener = (msg: WsMessage) => void

/**
 * Taro 跨端 WebSocket 封装：
 * - 自动带 access token；重连；
 * - subscribe_match 支持 afterSeq 拉增量
 */
export class MatchSocket {
  private task: Taro.SocketTask | null = null
  private subscribedMatches = new Map<string, number /* lastServerSeq */>()
  private listeners = new Set<Listener>()
  private connecting = false
  private closedByUser = false
  private retryDelay = 1000
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  async connect(): Promise<void> {
    const token = useAuthStore.getState().accessToken
    if (!token) throw new Error('未登录')
    if (this.task || this.connecting) return
    this.connecting = true
    this.closedByUser = false

    const url = `${WS_BASE_URL}?token=${encodeURIComponent(token)}&channel=user`
    try {
      this.task = await Taro.connectSocket({ url })
    } catch (e) {
      this.connecting = false
      throw e
    }

    this.task.onOpen(() => {
      this.connecting = false
      this.hasOpened = true
      this.retryDelay = 1000
      // 重连后自动重订阅
      for (const [matchId, afterSeq] of this.subscribedMatches) {
        try {
          this.task!.send({
            data: JSON.stringify({
              event: 'subscribe_match',
              data: { matchId, afterSeq }
            })
          })
        } catch {}
      }
      this.startHeartbeat()
    })

    this.task.onMessage((res) => {
      try {
        const msg: WsMessage = JSON.parse(
          typeof res.data === 'string' ? res.data : ''
        )
        // 跟踪 lastServerSeq
        if (msg.op === 'match_event' && msg.data?.matchId) {
          const seq = msg.data.event?.serverSeq
          if (typeof seq === 'number') {
            this.subscribedMatches.set(msg.data.matchId, seq)
          }
        }
        for (const l of this.listeners) {
          try { l(msg) } catch {}
        }
      } catch {
        // ignore parse errors
      }
    })

    this.task.onClose(() => {
      this.stopHeartbeat()
      this.task = null
      this.hasOpened = false
      this.connecting = false
      if (!this.closedByUser) {
        this.scheduleReconnect()
      }
    })

    this.task.onError(() => {
      this.stopHeartbeat()
      this.task = null
      this.hasOpened = false
      this.connecting = false
      if (!this.closedByUser) this.scheduleReconnect()
    })
  }

  private scheduleReconnect(): void {
    const delay = this.retryDelay
    this.retryDelay = Math.min(this.retryDelay * 2, 15000)
    setTimeout(() => {
      if (!this.closedByUser) {
        this.connect().catch(() => {})
      }
    }, delay)
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      this.sendEvent('heartbeat', {})
    }, 30000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private hasOpened = false

  /**
   * 客户端 → 服务端：NestJS @SubscribeMessage 用 "event" 字段做 routing。
   * 服务端 → 客户端：自定义用 "op" 字段（见 RealtimeService）。
   */
  private sendEvent(event: string, data: unknown): void {
    if (!this.task || !this.hasOpened) return
    try {
      this.task.send({ data: JSON.stringify({ event, data }) })
    } catch {
      // ignore
    }
  }

  subscribeMatch(matchId: string, afterSeq = 0): void {
    this.subscribedMatches.set(matchId, afterSeq)
    this.sendEvent('subscribe_match', { matchId, afterSeq })
  }

  unsubscribeMatch(matchId: string): void {
    this.subscribedMatches.delete(matchId)
    this.sendEvent('unsubscribe_match', { matchId })
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  close(): void {
    this.closedByUser = true
    this.stopHeartbeat()
    this.subscribedMatches.clear()
    this.listeners.clear()
    try {
      this.task?.close({})
    } catch {}
    this.task = null
  }
}

// 全局单例（C 端同时最多订阅几个房间，一个 socket 够用）
let globalSocket: MatchSocket | null = null

export function getMatchSocket(): MatchSocket {
  if (!globalSocket) globalSocket = new MatchSocket()
  return globalSocket
}

export function closeMatchSocket(): void {
  globalSocket?.close()
  globalSocket = null
}
