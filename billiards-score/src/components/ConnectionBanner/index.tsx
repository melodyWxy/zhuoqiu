import { View, Text } from '@tarojs/components'
import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { getMatchSocket, WsMessage } from '../../core/ws/socket'
import './index.scss'

type ConnState = 'ok' | 'reconnecting' | 'recovered' | 'gave_up'

/**
 * 房间连接状态条。
 * - ok：不显示
 * - reconnecting：黄色横条，"房间连接已断开，正在重连…"
 * - recovered：绿色横条，"房间连接已恢复"，2.5 秒后自动收
 * - gave_up：红色横条，"一直连不上房间，点此重新连接 / 刷新页面"
 *
 * 订阅 matchSocket 抛出的内部 op：__ws_close__ / __ws_open__ / __ws_gave_up__
 */
export default function ConnectionBanner() {
  const [state, setState] = useState<ConnState>('ok')
  const [gaveUpReason, setGaveUpReason] = useState<string>('')

  useEffect(() => {
    const sock = getMatchSocket()
    const off = sock.on((msg: WsMessage) => {
      if (msg.op === '__ws_close__') {
        setState((prev) => (prev === 'gave_up' ? prev : 'reconnecting'))
      } else if (msg.op === '__ws_open__') {
        // 只有从非 ok 状态恢复才提示"已恢复"，首次连上不弹
        setState((prev) => (prev === 'ok' ? 'ok' : 'recovered'))
      } else if (msg.op === '__ws_gave_up__') {
        setState('gave_up')
        setGaveUpReason(
          (msg.data?.reason as string) ?? '一直连不上房间'
        )
      }
    })
    return off
  }, [])

  // recovered 态 2.5 秒后收起
  useEffect(() => {
    if (state !== 'recovered') return
    const t = setTimeout(() => setState('ok'), 2500)
    return () => clearTimeout(t)
  }, [state])

  const handleRetry = () => {
    const sock = getMatchSocket()
    sock.reset()
    setState('reconnecting')
    sock.connect().catch(() => {
      // connect 失败会被 socket 内部重连兜住；这里不用再吐 toast
    })
  }

  const handleRefresh = () => {
    Taro.showModal({
      title: '刷新页面',
      content: '将会重新加载当前页面，未提交的输入可能会丢失。',
      confirmText: '刷新',
      cancelText: '取消'
    })
      .then((r) => {
        if (r.confirm && typeof window !== 'undefined') {
          window.location.reload()
        }
      })
      .catch(() => {})
  }

  if (state === 'ok') return null

  if (state === 'reconnecting') {
    return (
      <View className='conn-banner conn-reconnecting'>
        <Text className='conn-dot' />
        <Text className='conn-text'>房间连接已断开，正在尝试重连…</Text>
      </View>
    )
  }

  if (state === 'recovered') {
    return (
      <View className='conn-banner conn-recovered'>
        <Text className='conn-text'>✓ 房间连接已恢复</Text>
      </View>
    )
  }

  // gave_up
  return (
    <View className='conn-banner conn-gave-up'>
      <View className='conn-text conn-text-block'>
        <Text className='conn-title'>⚠️ 房间连接已断开</Text>
        <Text className='conn-sub'>{gaveUpReason}</Text>
      </View>
      <View className='conn-actions'>
        <View className='conn-btn conn-btn-primary' onClick={handleRetry}>
          重新连接
        </View>
        <View className='conn-btn' onClick={handleRefresh}>
          刷新页面
        </View>
      </View>
    </View>
  )
}
