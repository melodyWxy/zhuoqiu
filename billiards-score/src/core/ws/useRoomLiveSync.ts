import { useDidShow, useDidHide } from '@tarojs/taro'
import { useEffect, useRef } from 'react'
import { getMatchSocket } from './socket'

/** 可见期间兜底轮询间隔(ms):WS 即使静默断了,也能在这个周期内自愈对齐 */
const POLL_INTERVAL = 12000

/**
 * 联机房间页的"最终一致"兜底:在 WS 广播之外,用多重时机触发全量 refresh,
 * 确保各端分数/记录收敛到服务端权威状态(服务端是唯一权威源,refresh 幂等覆盖)。
 *
 * 触发时机:
 *  1. 页面再次 show(切回前台 / 从别的页返回该页):kick 重连 + 立即 refresh(+ onShow)
 *  2. 可见期间低频轮询 refresh;页面隐藏时停
 *  3. WS 重连成功(__ws_open__)后强制 refresh,不只依赖 afterSeq 补发
 *
 * @param refresh 页面的全量刷新(通常 = 拉 matchApi.detail)
 * @param onShow  页面再次 show 时的额外动作(如重拉历史记录面板)
 */
export function useRoomLiveSync(refresh: () => void, onShow?: () => void): void {
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  const onShowRef = useRef(onShow)
  onShowRef.current = onShow
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const startPoll = () => {
    if (pollTimer.current) return
    pollTimer.current = setInterval(() => refreshRef.current(), POLL_INTERVAL)
  }
  const stopPoll = () => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current)
      pollTimer.current = null
    }
  }

  // 1. 页面再次 show:主动拉最新 + 踢重连(满足"切回房间页要同步最新战绩/记录")
  useDidShow(() => {
    getMatchSocket().kick()
    refreshRef.current()
    onShowRef.current?.()
    startPoll()
  })
  useDidHide(() => {
    stopPoll()
  })

  // 2./3. 挂载即开轮询 + 监听重连成功
  useEffect(() => {
    const off = getMatchSocket().on((msg) => {
      if (msg.op === '__ws_open__') refreshRef.current()
    })
    startPoll()
    return () => {
      off()
      stopPoll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
