import Taro from '@tarojs/taro'
import { WS_BASE_URL } from '../api/config'
import { useAuthStore } from '../auth/store'

export interface WsMessage {
  op: string
  data?: any
  reqId?: string
}

type Listener = (msg: WsMessage) => void

/** 达到这么多次后放弃（退避到 15s 上限后，总耗时约 2 分钟）。避免"永远拨号"。 */
const MAX_RECONNECT = 8
/** 认证 / 协议错误关闭码：这些是服务端明确拒绝，不应重连 */
const AUTH_CLOSE_CODES = new Set([4001, 4003, 1008]) // 自定义 401 / forbidden / policy violation

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
  private gaveUp = false
  private retryDelay = 1000
  private retryCount = 0
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private visibilityHandler: (() => void) | null = null
  private onlineHandler: (() => void) | null = null
  // 小程序级前台 / 网络监听(weapp 没有 DOM,window/document 监听不生效)
  private appShowHandler: (() => void) | null = null
  private networkHandler: ((res: { isConnected: boolean }) => void) | null = null
  // 看门狗:最近一次收到任何消息(含 heartbeat_ack)的时间;长时间无消息 = 半死连接
  private lastRecvAt = 0

  async connect(): Promise<void> {
    const token = useAuthStore.getState().accessToken
    if (!token) throw new Error('未登录')
    if (this.task || this.connecting) return
    if (this.gaveUp) throw new Error('连接已放弃，请手动重连')
    this.connecting = true
    this.closedByUser = false
    this.installNetworkListeners()

    const url = `${WS_BASE_URL}?token=${encodeURIComponent(token)}&channel=user`
    try {
      this.task = await Taro.connectSocket({ url })
    } catch (e) {
      this.connecting = false
      // connectSocket 本身失败（未 onOpen 就抛），走一次重连
      this.scheduleReconnect()
      throw e
    }

    this.task.onOpen(() => {
      this.connecting = false
      this.hasOpened = true
      this.retryDelay = 1000
      this.retryCount = 0 // 重连成功：退避 + 次数都清零
      this.lastRecvAt = Date.now()
      // 重连后自动重订阅，带 afterSeq 让 server 补发错过的事件
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
      // 广播内部事件，便于 UI 层更新"已重连"提示
      this.emit({ op: '__ws_open__' })
    })

    this.task.onMessage((res) => {
      this.lastRecvAt = Date.now() // 任何消息(含 heartbeat_ack)都算"连接还活着"
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

    this.task.onClose((ev?: { code?: number; reason?: string }) => {
      this.stopHeartbeat()
      this.task = null
      this.hasOpened = false
      this.connecting = false
      if (this.closedByUser) return
      // 告诉 UI 层：房间连接断了，正在尝试重连
      this.emit({ op: '__ws_close__', data: { code: ev?.code } })
      // 认证 / 协议类拒绝不再重连
      if (ev?.code && AUTH_CLOSE_CODES.has(ev.code)) {
        this.giveUp(`服务端拒绝连接 (code=${ev.code})`)
        return
      }
      this.scheduleReconnect()
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
    if (this.closedByUser || this.gaveUp) return
    if (this.retryTimer) return // 已经在等下一次
    this.retryCount += 1
    if (this.retryCount > MAX_RECONNECT) {
      this.giveUp(
        `重连 ${MAX_RECONNECT} 次失败，已停止。请刷新页面或检查网络`
      )
      return
    }
    const delay = this.retryDelay
    this.retryDelay = Math.min(this.retryDelay * 2, 15000)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      if (!this.closedByUser && !this.gaveUp) {
        this.connect().catch(() => {})
      }
    }, delay)
  }

  /** 放弃重连：通知 UI 层弹提示，清空 pending 定时器。 */
  private giveUp(reason: string): void {
    this.gaveUp = true
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.emit({ op: '__ws_gave_up__', data: { reason } })
  }

  /** 用户主动触发重连（比如点"重新连接"按钮）：清掉放弃态，从头来 */
  reset(): void {
    this.gaveUp = false
    this.retryCount = 0
    this.retryDelay = 1000
  }

  private emit(msg: WsMessage): void {
    for (const l of this.listeners) {
      try { l(msg) } catch {}
    }
  }

  /**
   * 监听浏览器"网络恢复 / 标签切回前台"，立即触发一次重连。
   * 比干等下一次退避要友好得多。
   */
  private installNetworkListeners(): void {
    // 跨端:小程序回前台 / 网络恢复 → 立即重连(weapp 没有 DOM,必须用 Taro API)
    if (!this.appShowHandler) {
      this.appShowHandler = () => {
        if (!this.task && !this.gaveUp) this.kickReconnect()
      }
      try {
        Taro.onAppShow(this.appShowHandler)
      } catch {}
    }
    if (!this.networkHandler) {
      this.networkHandler = (res) => {
        if (res.isConnected && !this.task && !this.gaveUp) this.kickReconnect()
      }
      try {
        Taro.onNetworkStatusChange(this.networkHandler)
      } catch {}
    }
    // H5 兜底:标签页可见 / 浏览器 online
    if (typeof window !== 'undefined' && !this.visibilityHandler && !this.onlineHandler) {
      this.visibilityHandler = () => {
        if (document.visibilityState === 'visible' && !this.task && !this.gaveUp) {
          this.kickReconnect()
        }
      }
      this.onlineHandler = () => {
        if (!this.task && !this.gaveUp) this.kickReconnect()
      }
      try {
        document.addEventListener('visibilitychange', this.visibilityHandler)
        window.addEventListener('online', this.onlineHandler)
      } catch {}
    }
  }

  private removeNetworkListeners(): void {
    if (this.appShowHandler) {
      try {
        Taro.offAppShow(this.appShowHandler)
      } catch {}
      this.appShowHandler = null
    }
    if (this.networkHandler) {
      try {
        Taro.offNetworkStatusChange(this.networkHandler)
      } catch {}
      this.networkHandler = null
    }
    if (typeof window !== 'undefined') {
      try {
        if (this.visibilityHandler) {
          document.removeEventListener('visibilitychange', this.visibilityHandler)
        }
        if (this.onlineHandler) {
          window.removeEventListener('online', this.onlineHandler)
        }
      } catch {}
    }
    this.visibilityHandler = null
    this.onlineHandler = null
  }

  /** 不走退避的立即重连（网络恢复场景用）。仍受 MAX_RECONNECT 保护。 */
  private kickReconnect(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.retryDelay = 1000 // 下一次退避重置
    if (!this.closedByUser && !this.gaveUp) {
      this.connect().catch(() => {})
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.lastRecvAt = Date.now()
    // 15s 一次:压在运营商 NAT 回收窗口内;同时兼作看门狗
    this.heartbeatTimer = setInterval(() => {
      // 看门狗:超过 40s 没收到任何消息(含 heartbeat_ack)→ 判定半死,强制重连。
      // 解决 onClose 不触发的"半死连接"(底层断了但没收到 close 帧)。
      if (this.hasOpened && Date.now() - this.lastRecvAt > 40000) {
        this.forceReconnect()
        return
      }
      this.sendEvent('heartbeat', {})
    }, 15000)
  }

  /** 强制断开当前(疑似半死)连接并重连。区别于用户主动 close。 */
  private forceReconnect(): void {
    this.stopHeartbeat()
    try {
      this.task?.close({})
    } catch {}
    this.task = null
    this.hasOpened = false
    this.connecting = false
    this.emit({ op: '__ws_close__', data: { code: -1 /* watchdog */ } })
    this.kickReconnect()
  }

  /**
   * 用户/页面主动触发:清放弃态 + 立即重连。
   * 供联机页 useDidShow(切回前台/返回该页)调用,确保连上后能拉到最新状态。
   */
  kick(): void {
    this.gaveUp = false
    if (this.task || this.connecting) return // 已连着就不重复连
    this.retryCount = 0
    this.kickReconnect()
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
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.stopHeartbeat()
    this.removeNetworkListeners()
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
