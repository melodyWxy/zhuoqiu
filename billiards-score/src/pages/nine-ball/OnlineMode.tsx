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

interface Props {
  matchId: string
}

type WinKind = 'normal' | 'small' | 'big' | 'golden9'

function PlayerAvatar({ avatar }: { avatar: string | null }) {
  const v = avatar ?? ''
  if (isAvatarUrl(v)) {
    return <Image className='avatar-img' src={v} mode='aspectFill' />
  }
  return <Text className='avatar-emoji'>{v || '🧍'}</Text>
}

export default function OnlineNineBall({ matchId }: Props) {
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
  // selectedSlot 的 ref 镜像：避免 onClick 闭包读到陈旧值导致"选中了却说没选中"
  const selectedSlotRef = useRef<number | null>(null)
  useEffect(() => {
    selectedSlotRef.current = selectedSlot
  }, [selectedSlot])

  const refresh = useCallback(async () => {
    try {
      const d = await matchApi.detail(matchId)
      setDetail(d)
      lastSeq.current = d.lastEventSeq
    } catch {
      // toast 由 client 层处理
    }
  }, [matchId])

  // 兜底同步:页面再次 show / 低频轮询 / 重连成功 都强制拉最新(+ 重拉历史记录)
  useRoomLiveSync(refresh, () => setHistoryReloadKey((k) => k + 1))

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
          setEndedOverlay({ done: true })
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
      // 离开房间页(出栈卸载)关掉 WS;再进房间时 useEffect 会重新建连并 subscribe。
      // C 端同一时刻只在一个房间,关掉可避免离开后留下空闲/半死连接。
      // 注:navigateTo 跳子页只是隐藏房间页、不卸载,不会触发这里。
      closeMatchSocket()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, refresh])

  // Phase B：去掉强制倒计时；用户从弹窗手动选下一步

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
    // 读 ref 而不是 state —— 防止 Taro H5 下 onClick 闭包在连击时读到旧 state
    const cur = selectedSlotRef.current
    if (cur == null) {
      Taro.showToast({ title: '请先选择对应玩家', icon: 'none' })
      return null
    }
    return cur
  }

  const doWin = async (kind: WinKind) => {
    const s = ensureSelected()
    if (s === null) return
    const rules = detail.rules
    const delta =
      kind === 'big'
        ? rules.bigJack ?? 10
        : kind === 'golden9'
          ? rules.golden9 ?? 4
          : kind === 'small'
            ? rules.smallJack ?? 7
            : rules.normalWin ?? 4
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
      // 成功：给用户 +N 的明确反馈，保持选中以便连击
      Taro.showToast({ title: `+${delta}`, icon: 'success', duration: 800 })
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
      Taro.showToast({ title: '已记录犯规', icon: 'none', duration: 800 })
      // 犯规记完切选中到"被补偿方"，方便紧接着记分
      setSelectedSlot(players[scoreToRes.tapIndex].slot)
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
      <View className='header' style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', gap: 8 }}>
        <Text className='header-title' style={{ flex: 1 }}>九球追分 · 联机</Text>
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
              : selectedSlot != null
                ? `已选中：${players.find((p) => p.slot === selectedSlot)?.displayName ?? ''} · 点下方操作`
                : '👆 先点玩家卡片选中，再点下方操作'}
        </View>

        <View className='ops-grid'>
          {winItems.map((w) => {
            const disabled =
              !iAmParticipant || !isLive || busy || selectedSlot == null
            return (
              <View
                key={w.kind}
                className={`op-btn win-${w.kind} ${disabled ? 'is-disabled' : ''}`}
                onClick={() => !disabled && doWin(w.kind)}
              >
                {w.label}
              </View>
            )
          })}
          <View
            className={`op-btn op-foul ${
              !iAmParticipant || !isLive || busy || selectedSlot == null
                ? 'is-disabled'
                : ''
            }`}
            onClick={() => {
              if (!iAmParticipant || !isLive || busy || selectedSlot == null) return
              handleFoul()
            }}
          >
            ⚠️ 犯规
          </View>
          <View
            className={`op-btn op-undo ${
              !iAmParticipant || busy ? 'is-disabled' : ''
            }`}
            onClick={() => {
              if (!iAmParticipant || busy) return
              handleUndo()
            }}
          >
            ↩️ 撤销
          </View>
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
