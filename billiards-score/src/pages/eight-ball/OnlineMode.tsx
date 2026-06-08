import { View, Text, Image, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { matchApi, MatchDetail } from '../../core/api/match'
import { getMatchSocket, closeMatchSocket, WsMessage } from '../../core/ws/socket'
import { useRoomLiveSync } from '../../core/ws/useRoomLiveSync'
import { useAuthStore } from '../../core/auth/store'
import MatchHistorySheet from '../../components/MatchHistorySheet'
import ConnectionBanner from '../../components/ConnectionBanner'
import { isAvatarUrl } from '../../utils/avatar'

function PlayerAvatar({ avatar }: { avatar: string | null }) {
  const v = avatar ?? ''
  if (isAvatarUrl(v)) {
    return <Image className='avatar-img' src={v} mode='aspectFill' />
  }
  // emoji 或空：空位也给个默认占位 emoji
  return <Text className='avatar-emoji'>{v || '🧍'}</Text>
}

interface Props {
  matchId: string
}

export default function OnlineEightBall({ matchId }: Props) {
  const [detail, setDetail] = useState<MatchDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  // 比赛结束弹窗：不再倒计时强跳，由用户选择「查看战报 / 再来一场 / 歇会」
  const [endedOverlay, setEndedOverlay] = useState<null | { done: true }>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyReloadKey, setHistoryReloadKey] = useState(0)
  const lastSeq = useRef(0)
  const currentUserId = useAuthStore((s) => s.user?.id ?? null)
  const selfInitiatedEnd = useRef(false)
  // selectedSlot 的 ref 镜像：防止 Taro H5 下 onClick 闭包读到陈旧值
  const selectedSlotRef = useRef<number | null>(null)
  useEffect(() => {
    selectedSlotRef.current = selectedSlot
  }, [selectedSlot])

  const refresh = useCallback(async () => {
    try {
      const d = await matchApi.detail(matchId)
      setDetail(d)
      lastSeq.current = d.lastEventSeq
    } catch {}
  }, [matchId])

  // 兜底同步:页面再次 show / 低频轮询 / 重连成功 都强制拉最新(+ 重拉历史记录)
  useRoomLiveSync(refresh, () => setHistoryReloadKey((k) => k + 1))

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
          setEndedOverlay({ done: true })
        }
      }
    })

    return () => {
      off()
      // 离开房间页(出栈卸载)关掉 WS;再进房间时 useEffect 会重新建连并 subscribe。
      closeMatchSocket()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, refresh])

  // 倒计时跳转
  // Phase B：去掉强制倒计时；用户从弹窗手动选下一步

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
    // 读 ref 而不是 state，避免 Taro H5 闭包陈旧
    const s = selectedSlotRef.current
    if (s == null) {
      Taro.showToast({ title: '请先选择本局胜者', icon: 'none' })
      return
    }
    const player = players.find((p) => p.slot === s)
    setBusy(true)
    try {
      await matchApi.event(matchId, 'score_eight_ball_win', { winnerSlot: s })
      const newWins = (wins[s] ?? 0) + 1
      if (newWins >= targetWins) {
        Taro.showToast({ title: `${player?.displayName} 夺得比赛！`, icon: 'success' })
      } else {
        Taro.showToast({ title: '+1', icon: 'success', duration: 800 })
      }
      // 保持选中，便于连胜连击
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
      <View className='header' style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', gap: 8 }}>
        <Text className='header-title' style={{ flex: 1 }}>中式八球 · 联机</Text>
        <View
          style={{ padding: '6px 12px', background: 'rgba(212,175,55,0.15)', borderRadius: 8, color: '#d4af37', fontSize: 13, fontWeight: 600 }}
          onClick={() => setHistoryOpen(true)}
        >
          📜 历史
        </View>
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

      <ConnectionBanner />

      {detail.code && detail.state !== 'ended' && (
        <View className='room-code-banner'>
          <View className='rcb-main' onClick={handleShare}>
            <Text className='rcb-label'>🔗 房间码</Text>
            <Text className='rcb-code'>{detail.code}</Text>
            <Text className='rcb-hint'>
              {players.filter((p) => p.userId).length}/{players.length} 人在位 · 点击复制
            </Text>
          </View>
          <Button
            className='rcb-share-btn'
            openType='share'
            hoverClass='rcb-share-btn--hover'
          >
            分享给朋友
          </Button>
        </View>
      )}

      <View className='players-section'>
        {players.map((p) => (
          <View
            key={p.slot}
            className={`player-card ${selectedSlot === p.slot ? 'selected' : ''}`}
            onClick={() => handleCardClick(p.slot)}
          >
            <View className='avatar'>
              <PlayerAvatar avatar={p.avatar} />
            </View>
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
              : selectedSlot != null
                ? `已选中：${players.find((p) => p.slot === selectedSlot)?.displayName ?? ''} · 点下方"本局胜"`
                : '👆 先点玩家卡片选中赢家，再点下方按钮'}
        </View>

        <View className='ops-grid'>
          {(() => {
            const winDisabled =
              !iAmParticipant || !isLive || busy || selectedSlot == null
            const undoDisabled = !iAmParticipant || busy
            return (
              <>
                <View
                  className={`op-btn op-win ${winDisabled ? 'is-disabled' : ''}`}
                  onClick={() => !winDisabled && handleWin()}
                >
                  ✅ 本局胜 +1
                </View>
                <View
                  className={`op-btn op-undo ${undoDisabled ? 'is-disabled' : ''}`}
                  onClick={() => !undoDisabled && handleUndo()}
                >
                  ↩️ 撤销
                </View>
              </>
            )
          })()}
        </View>
      </View>

      <MatchHistorySheet
        visible={historyOpen}
        matchId={matchId}
        reloadKey={historyReloadKey}
        slotNames={players.reduce(
          (acc, p) => {
            acc[p.slot] = p.displayName
            return acc
          },
          {} as Record<number, string>
        )}
        onClose={() => setHistoryOpen(false)}
      />

      {endedOverlay && (
        <View className='ended-overlay'>
          <View className='ended-box'>
            <Text className='ended-title'>比赛已结束 🏁</Text>
            <Text className='ended-sub'>记得分享战报给朋友看看</Text>
            <View
              className='ended-btn ended-btn-primary'
              onClick={() =>
                Taro.navigateTo({ url: `/pages/match-detail/index?id=${matchId}` })
              }
            >
              🏆 查看战报
            </View>
            <View
              className='ended-btn ended-btn-secondary'
              onClick={() =>
                Taro.showToast({ title: '敬请期待', icon: 'none' })
              }
            >
              🔁 再来一场
            </View>
            <View
              className='ended-btn ended-btn-tertiary'
              onClick={() => Taro.switchTab({ url: '/pages/me/index' })}
            >
              💤 先去歇会
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
