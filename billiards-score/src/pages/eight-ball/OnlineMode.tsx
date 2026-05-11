import { View, Text, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { matchApi, MatchDetail } from '../../core/api/match'
import { getMatchSocket, WsMessage } from '../../core/ws/socket'
import { useAuthStore } from '../../core/auth/store'

interface Props {
  matchId: string
}

export default function OnlineEightBall({ matchId }: Props) {
  const [detail, setDetail] = useState<MatchDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  const [endedOverlay, setEndedOverlay] = useState<null | { countdown: number }>(null)
  const lastSeq = useRef(0)
  const currentUserId = useAuthStore((s) => s.user?.id ?? null)
  const selfInitiatedEnd = useRef(false)

  const refresh = useCallback(async () => {
    try {
      const d = await matchApi.detail(matchId)
      setDetail(d)
      lastSeq.current = d.lastEventSeq
    } catch {}
  }, [matchId])

  useEffect(() => {
    refresh()
    const sock = getMatchSocket()
    sock.connect()
      .then(() => sock.subscribeMatch(matchId, lastSeq.current))
      .catch(() => Taro.showToast({ title: 'WS 连接失败', icon: 'none' }))

    const off = sock.on((msg: WsMessage) => {
      if (msg.op === 'match_event' && msg.data?.matchId === matchId) {
        const ev = msg.data.event
        refresh()
        if (
          (ev?.type === 'end' || ev?.type === 'force_end') &&
          !selfInitiatedEnd.current
        ) {
          setEndedOverlay({ countdown: 3 })
        }
      }
    })

    return () => {
      off()
      getMatchSocket().unsubscribeMatch(matchId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, refresh])

  // 倒计时跳转
  useEffect(() => {
    if (!endedOverlay) return
    if (endedOverlay.countdown <= 0) {
      Taro.switchTab({ url: '/pages/me/index' })
      return
    }
    const t = setTimeout(() => {
      setEndedOverlay((s) => (s ? { countdown: s.countdown - 1 } : s))
    }, 1000)
    return () => clearTimeout(t)
  }, [endedOverlay])

  if (!detail) return <View style={{ padding: 40, textAlign: 'center' }}>加载中…</View>

  const players = detail.players.filter((p) => p.isCurrent).sort((a, b) => a.slot - b.slot)
  const wins = detail.computed.wins ?? {}
  const targetWins = (detail.rules.targetWins as number) ?? 5
  const isLive = detail.state === 'in_progress' || detail.state === 'paused'
  const iAmParticipant =
    !!currentUserId &&
    (currentUserId === detail.ownerUserId ||
      players.some((p) => p.userId === currentUserId))

  const handleCardClick = (slot: number) => {
    if (!iAmParticipant) {
      Taro.showToast({ title: '观众不能操作', icon: 'none' })
      return
    }
    if (!isLive) return
    setSelectedSlot((prev) => (prev === slot ? null : slot))
  }

  const handleWin = async () => {
    if (!iAmParticipant) {
      Taro.showToast({ title: '只有参赛者能记分', icon: 'none' })
      return
    }
    if (!isLive) {
      Taro.showToast({ title: '比赛已结束', icon: 'none' })
      return
    }
    if (!selectedSlot) {
      Taro.showToast({ title: '请先选择本局胜者', icon: 'none' })
      return
    }
    const player = players.find((p) => p.slot === selectedSlot)
    setBusy(true)
    try {
      await matchApi.event(matchId, 'score_eight_ball_win', { winnerSlot: selectedSlot })
      const newWins = (wins[selectedSlot] ?? 0) + 1
      if (newWins >= targetWins) {
        Taro.showToast({ title: `${player?.displayName} 夺得比赛！`, icon: 'success' })
      }
      setSelectedSlot(null)
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

  const isOwner = detail.ownerUserId === currentUserId

  const handleEnd = async () => {
    if (!isOwner) return
    const res = await Taro.showModal({
      title: '结束比赛',
      content: '确认结束？所有人都会被自动退出。',
      confirmText: '结束',
      cancelText: '取消'
    }).catch(() => null)
    if (!res?.confirm) return
    selfInitiatedEnd.current = true
    await matchApi.end(matchId)
    Taro.showToast({ title: '比赛已结束', icon: 'success' })
    setTimeout(() => {
      Taro.switchTab({ url: '/pages/me/index' })
    }, 800)
  }

  const handleLeave = async () => {
    const res = await Taro.showModal({
      title: '退出房间',
      content: iAmParticipant ? '退出后号位空出。' : '退出观战。',
      confirmText: '退出',
      cancelText: '取消'
    }).catch(() => null)
    if (!res?.confirm) return
    try {
      if (iAmParticipant) await matchApi.seat(matchId, 'leave')
    } catch {}
    // 观众/非房主退出 → 回首页
    Taro.switchTab({ url: '/pages/index/index' })
  }

  const handleShare = () => {
    if (!detail.code) return
    Taro.setClipboardData({ data: detail.code }).then(() => {
      Taro.showToast({ title: `房间码：${detail.code}`, icon: 'none' })
    })
  }

  const leaderIdx = players.reduce(
    (a, b) => ((wins[a.slot] ?? 0) >= (wins[b.slot] ?? 0) ? a : b),
    players[0]
  )

  return (
    <View className='eight-ball-page'>
      <View className='header' style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px' }}>
        <Text className='header-title'>中式八球 · 联机</Text>
        {isOwner ? (
          <View
            style={{ padding: '6px 14px', background: 'rgba(239,68,68,0.15)', borderRadius: 8, color: '#ef4444', fontSize: 13, fontWeight: 600 }}
            onClick={handleEnd}
          >
            ✕ 结束
          </View>
        ) : (
          <View
            style={{ padding: '6px 14px', background: 'rgba(160,168,164,0.15)', borderRadius: 8, color: '#a0a8a4', fontSize: 13, fontWeight: 600 }}
            onClick={handleLeave}
          >
            ← 退出
          </View>
        )}
      </View>

      {detail.code && detail.state !== 'ended' && (
        <View className='room-code-banner' onClick={handleShare}>
          <Text className='rcb-label'>🔗 房间码</Text>
          <Text className='rcb-code'>{detail.code}</Text>
          <Text className='rcb-hint'>
            {players.filter((p) => p.userId).length}/{players.length} 人在位 · 点击复制
          </Text>
        </View>
      )}

      <View className='players-section'>
        {players.map((p) => (
          <View
            key={p.slot}
            className={`player-card ${selectedSlot === p.slot ? 'selected' : ''}`}
            onClick={() => handleCardClick(p.slot)}
          >
            <View className='avatar'>🧍</View>
            <Text className='name'>{p.displayName}</Text>
            <Text className='wins'>{wins[p.slot] ?? 0}</Text>
            <Text className='label'>胜</Text>
          </View>
        ))}
      </View>

      <View className='goal-banner'>
        <Text className='goal-text'>
          抢 <Text className='goal-value'>{targetWins}</Text> 局
        </Text>
        {leaderIdx && (
          <Text className='leader-text'>
            <Text className='leader-name'>{leaderIdx.displayName}</Text> 领先
          </Text>
        )}
      </View>

      <View className='actions-section'>
        <View className='actions-hint'>
          {detail.state === 'ended'
            ? '比赛已结束'
            : !iAmParticipant
              ? '观战中，不能记分'
              : selectedSlot
                ? `已选中：${players.find((p) => p.slot === selectedSlot)?.displayName ?? ''} · 点下方"本局胜"`
                : '👆 先点玩家卡片选中赢家，再点下方按钮'}
        </View>

        <View className='actions-grid'>
          <Button
            className='action-btn btn-win'
            onClick={handleWin}
            disabled={!iAmParticipant || !isLive || busy || !selectedSlot}
          >
            <Text className='icon'>✅</Text>
            <Text>本局胜 +1</Text>
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

      {endedOverlay && (
        <View className='ended-overlay'>
          <View className='ended-box'>
            <Text className='ended-title'>比赛已结束</Text>
            <Text className='ended-sub'>
              {endedOverlay.countdown} 秒后自动退出到"我的"
            </Text>
            <View
              className='ended-btn'
              onClick={() => Taro.switchTab({ url: '/pages/me/index' })}
            >
              立即退出
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
