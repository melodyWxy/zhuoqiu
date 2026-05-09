import { View, Text, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { matchApi, MatchDetail } from '../../core/api/match'
import { getMatchSocket, closeMatchSocket, WsMessage } from '../../core/ws/socket'
import { useAuthStore } from '../../core/auth/store'

interface Props {
  matchId: string
}

type WinKind = 'normal' | 'small' | 'big' | 'golden9'

export default function OnlineNineBall({ matchId }: Props) {
  const [detail, setDetail] = useState<MatchDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const lastSeq = useRef(0)
  const currentUserId = useAuthStore((s) => s.user?.id ?? null)

  const refresh = useCallback(async () => {
    try {
      const d = await matchApi.detail(matchId)
      setDetail(d)
      lastSeq.current = d.lastEventSeq
    } catch {
      // toast 由 client 层处理
    }
  }, [matchId])

  useEffect(() => {
    refresh()

    const sock = getMatchSocket()
    sock
      .connect()
      .then(() => sock.subscribeMatch(matchId, lastSeq.current))
      .catch(() => Taro.showToast({ title: 'WS 连接失败', icon: 'none' }))

    const off = sock.on((msg: WsMessage) => {
      if (msg.op === 'match_event' && msg.data?.matchId === matchId) {
        // 收到事件 → 拉最新详情（简单可靠）
        refresh()
      } else if (msg.op === 'kicked' && msg.data?.matchId === matchId) {
        if (msg.data.userId === currentUserId) {
          Taro.showToast({ title: '你被管理员踢出', icon: 'none' })
          setTimeout(() => Taro.switchTab({ url: '/pages/index/index' }), 1500)
        }
      }
    })

    return () => {
      off()
      // 离开页面不主动 close socket，保留连接供其他页面
      getMatchSocket().unsubscribeMatch(matchId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, refresh])

  if (!detail) {
    return <View style={{ padding: 40, textAlign: 'center' }}>加载中...</View>
  }

  const players = detail.players.filter((p) => p.isCurrent).sort((a, b) => a.slot - b.slot)
  const scores = detail.computed.scores ?? {}
  const stats = detail.computed.stats ?? {}
  const isLive = detail.state === 'in_progress' || detail.state === 'paused'
  const iAmParticipant =
    !!currentUserId &&
    (currentUserId === detail.ownerUserId ||
      players.some((p) => p.userId === currentUserId))

  const winItems: { label: string; kind: WinKind }[] = [
    { label: `✅ 普胜 (+${detail.rules.normalWin ?? 4})`, kind: 'normal' },
    { label: `🏅 小金 (+${detail.rules.smallJack ?? 7})`, kind: 'small' },
    { label: `💎 大金 (+${detail.rules.bigJack ?? 10})`, kind: 'big' },
    { label: `👑 黄金9 (+${detail.rules.golden9 ?? 4})`, kind: 'golden9' }
  ]

  const pickTarget = async (winnerSlot: number): Promise<number | null> => {
    const others = players.filter((p) => p.slot !== winnerSlot)
    if (others.length === 1) return others[0].slot
    const res = await Taro.showActionSheet({
      itemList: others.map((p) => `掏 ${p.displayName} 的分`)
    }).catch(() => null)
    if (!res || res.tapIndex < 0) return null
    return others[res.tapIndex].slot
  }

  const handleCardClick = async (slot: number) => {
    if (!iAmParticipant) {
      Taro.showToast({ title: '只有参赛者能记分', icon: 'none' })
      return
    }
    if (!isLive) {
      Taro.showToast({ title: '比赛已结束', icon: 'none' })
      return
    }
    const res = await Taro.showActionSheet({
      itemList: winItems.map((w) => w.label)
    }).catch(() => null)
    if (!res || res.tapIndex < 0) return
    const w = winItems[res.tapIndex]

    setBusy(true)
    try {
      if (w.kind === 'big') {
        await matchApi.event(matchId, 'score_big_jack', { winnerSlot: slot })
      } else if (w.kind === 'golden9') {
        await matchApi.event(matchId, 'score_golden9', { winnerSlot: slot })
      } else {
        const target = await pickTarget(slot)
        if (target === null) return
        await matchApi.event(
          matchId,
          w.kind === 'normal' ? 'score_normal_win' : 'score_small_jack',
          { winnerSlot: slot, targetSlot: target }
        )
      }
      refresh()
    } finally {
      setBusy(false)
    }
  }

  const handleFoul = async () => {
    if (!iAmParticipant) return
    if (!isLive) return
    const foulerRes = await Taro.showActionSheet({
      itemList: players.map((p) => `${p.displayName} 犯规`)
    }).catch(() => null)
    if (!foulerRes || foulerRes.tapIndex < 0) return

    const scoreToRes = await Taro.showActionSheet({
      itemList: players.map((p) => `给 ${p.displayName} +1 分`)
    }).catch(() => null)
    if (!scoreToRes || scoreToRes.tapIndex < 0) return

    setBusy(true)
    try {
      await matchApi.event(matchId, 'foul', {
        foulerSlot: players[foulerRes.tapIndex].slot,
        compensateSlot: players[scoreToRes.tapIndex].slot
      })
      refresh()
    } finally {
      setBusy(false)
    }
  }

  const handleUndo = async () => {
    if (!iAmParticipant) return
    setBusy(true)
    try {
      await matchApi.undo(matchId)
      refresh()
    } finally {
      setBusy(false)
    }
  }

  const handleEnd = async () => {
    if (detail.ownerUserId !== currentUserId) {
      Taro.showToast({ title: '只有房主能结束', icon: 'none' })
      return
    }
    const res = await Taro.showModal({
      title: '结束比赛',
      content: '确认结束本场？',
      confirmText: '结束',
      cancelText: '取消'
    }).catch(() => null)
    if (!res?.confirm) return
    await matchApi.end(matchId)
    refresh()
  }

  const handleShare = () => {
    if (!detail.code) return
    Taro.setClipboardData({ data: detail.code }).then(() => {
      Taro.showToast({ title: `房间码已复制：${detail.code}`, icon: 'none' })
    })
  }

  const leader = players.reduce(
    (a, b) => ((scores[a.slot] ?? 0) >= (scores[b.slot] ?? 0) ? a : b),
    players[0]
  )

  return (
    <View className='nine-ball-page'>
      <View className='header' style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12 }}>
        <Text className='header-title'>九球追分 · 联机</Text>
        <View style={{ display: 'flex', gap: 8 }}>
          <View
            style={{ padding: '4px 10px', background: 'rgba(212,175,55,0.2)', borderRadius: 6, color: '#d4af37', fontSize: 12 }}
            onClick={handleShare}
          >
            🔗 {detail.code ?? '—'}
          </View>
          <View
            style={{ padding: '4px 10px', background: 'rgba(239,68,68,0.15)', borderRadius: 6, color: '#ef4444', fontSize: 12 }}
            onClick={handleEnd}
          >
            ✕
          </View>
        </View>
      </View>

      <View className='players-section'>
        {players.map((p) => (
          <View
            key={p.slot}
            className='player-card'
            onClick={() => handleCardClick(p.slot)}
          >
            <View className='avatar'>🧍</View>
            <Text className='name'>{p.displayName}</Text>
            <Text className='position'>{p.slot}号位</Text>
            <Text className='score'>{scores[p.slot] ?? 0}</Text>
            <View className='stats'>
              <Text>💎×{stats[p.slot]?.bigJack ?? 0}</Text>
              <Text>🏅×{stats[p.slot]?.smallJack ?? 0}</Text>
              <Text>👑×{stats[p.slot]?.golden9 ?? 0}</Text>
              <Text>✅×{stats[p.slot]?.normalWin ?? 0}</Text>
            </View>
          </View>
        ))}
      </View>

      {leader && (
        <View className='goal-banner'>
          <Text className='leader-text'>
            <Text className='leader-name'>{leader.displayName}</Text> 领先
          </Text>
        </View>
      )}

      <View className='actions-section'>
        <View className='actions-hint'>
          {detail.state === 'ended'
            ? '比赛已结束'
            : iAmParticipant
              ? '点击玩家卡片 → 记分（云端同步）'
              : '观战中，不能记分'}
        </View>

        <View className='actions-grid'>
          <Button
            className='action-btn btn-foul'
            onClick={handleFoul}
            disabled={!iAmParticipant || !isLive || busy}
          >
            <Text className='icon'>⚠️</Text>
            <Text>犯规</Text>
          </Button>
          <Button
            className='action-btn btn-pass'
            onClick={handleUndo}
            disabled={!iAmParticipant || busy}
          >
            <Text className='icon'>↩️</Text>
            <Text>撤销</Text>
          </Button>
        </View>
      </View>
    </View>
  )
}
