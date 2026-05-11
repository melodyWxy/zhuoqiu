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
        const ev = msg.data.event
        refresh()
        // 比赛被别人结束 → 3s 倒计时跳"我的"
        if (
          (ev?.type === 'end' || ev?.type === 'force_end') &&
          !selfInitiatedEnd.current
        ) {
          setEndedOverlay({ countdown: 3 })
        }
      } else if (msg.op === 'kicked' && msg.data?.matchId === matchId) {
        if (msg.data.userId === currentUserId) {
          Taro.showToast({ title: '你被管理员踢出', icon: 'none' })
          setTimeout(() => Taro.switchTab({ url: '/pages/me/index' }), 1500)
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

  // 卡片点击只做选中，不再弹 ActionSheet
  const handleCardClick = (slot: number) => {
    if (!iAmParticipant) {
      Taro.showToast({ title: '观众不能操作', icon: 'none' })
      return
    }
    if (!isLive) return
    setSelectedSlot((prev) => (prev === slot ? null : slot))
  }

  const ensureSelected = (): number | null => {
    if (!iAmParticipant) {
      Taro.showToast({ title: '只有参赛者能记分', icon: 'none' })
      return null
    }
    if (!isLive) {
      Taro.showToast({ title: '比赛已结束', icon: 'none' })
      return null
    }
    if (!selectedSlot) {
      Taro.showToast({ title: '请先选择对应玩家', icon: 'none' })
      return null
    }
    return selectedSlot
  }

  const doWin = async (kind: WinKind) => {
    const s = ensureSelected()
    if (s === null) return
    setBusy(true)
    try {
      if (kind === 'big') {
        await matchApi.event(matchId, 'score_big_jack', { winnerSlot: s })
      } else if (kind === 'golden9') {
        await matchApi.event(matchId, 'score_golden9', { winnerSlot: s })
      } else {
        const target = await pickTarget(s)
        if (target === null) return
        await matchApi.event(
          matchId,
          kind === 'normal' ? 'score_normal_win' : 'score_small_jack',
          { winnerSlot: s, targetSlot: target }
        )
      }
      setSelectedSlot(null) // 操作完清空选中
      refresh()
    } finally {
      setBusy(false)
    }
  }

  // 犯规：选中玩家 = 犯规者；再弹"给谁+1"
  const handleFoul = async () => {
    const fouler = ensureSelected()
    if (fouler === null) return

    const scoreToRes = await Taro.showActionSheet({
      itemList: players.map((p) => `给 ${p.displayName} +1 分`)
    }).catch(() => null)
    if (!scoreToRes || scoreToRes.tapIndex < 0) return

    setBusy(true)
    try {
      await matchApi.event(matchId, 'foul', {
        foulerSlot: fouler,
        compensateSlot: players[scoreToRes.tapIndex].slot
      })
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
      content: '确认结束本场？所有人都会被自动退出。',
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
      content: iAmParticipant
        ? '退出后该号位将空出，其他人可占位。'
        : '退出观战。',
      confirmText: '退出',
      cancelText: '取消'
    }).catch(() => null)
    if (!res?.confirm) return
    try {
      if (iAmParticipant) {
        await matchApi.seat(matchId, 'leave')
      }
    } catch {
      // 即使后端失败也跳走
    }
    // 观众/非房主退出 → 回首页（联机入口在首页）
    Taro.switchTab({ url: '/pages/index/index' })
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
      <View className='header' style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px' }}>
        <Text className='header-title'>九球追分 · 联机</Text>
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
        <View
          className='room-code-banner'
          onClick={handleShare}
        >
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
            : !iAmParticipant
              ? '观战中，不能记分'
              : selectedSlot
                ? `已选中：${players.find((p) => p.slot === selectedSlot)?.displayName ?? ''} · 点下方操作`
                : '👆 先点玩家卡片选中，再点下方操作'}
        </View>

        <View className='win-grid'>
          {winItems.map((w) => (
            <Button
              key={w.kind}
              className={`win-btn win-${w.kind}`}
              onClick={() => doWin(w.kind)}
              disabled={!iAmParticipant || !isLive || busy || !selectedSlot}
            >
              {w.label}
            </Button>
          ))}
        </View>

        <View className='actions-grid'>
          <Button
            className='action-btn btn-foul'
            onClick={handleFoul}
            disabled={!iAmParticipant || !isLive || busy || !selectedSlot}
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
