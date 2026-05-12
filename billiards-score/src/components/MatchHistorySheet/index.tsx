import { View, Text, ScrollView } from '@tarojs/components'
import { useEffect, useState } from 'react'
import { matchApi } from '../../core/api/match'
import './index.scss'

interface Props {
  visible: boolean
  matchId: string
  /** slot → 玩家昵称，用于把 payload 里的 slot 翻译为人名 */
  slotNames: Record<number, string>
  onClose: () => void
}

interface EventRow {
  id: number
  serverSeq: number
  actorUserId: string | null
  actorAdminId: string | null
  actorNickname: string | null
  actorPhoneMasked: string | null
  actorAdminName: string | null
  type: string
  payloadJson: Record<string, unknown>
  undone: boolean
  undoneByEventId: number | null
  createdAt: string
}

function nameOf(slot: number, names: Record<number, string>): string {
  return names[slot] ?? `${slot}号位`
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function describe(ev: EventRow, names: Record<number, string>): string {
  const p = ev.payloadJson as Record<string, unknown>
  const ws = (k: string) => (typeof p[k] === 'number' ? (p[k] as number) : null)
  switch (ev.type) {
    case 'score_normal_win': {
      const w = ws('winnerSlot')
      const t = ws('targetSlot')
      return w && t ? `${nameOf(w, names)} 普胜（掏 ${nameOf(t, names)}）` : '普胜'
    }
    case 'score_small_jack': {
      const w = ws('winnerSlot')
      const t = ws('targetSlot')
      return w && t
        ? `${nameOf(w, names)} 小金（掏 ${nameOf(t, names)}）`
        : '小金'
    }
    case 'score_big_jack': {
      const w = ws('winnerSlot')
      return w ? `${nameOf(w, names)} 大金（全场 -10）` : '大金'
    }
    case 'score_golden9': {
      const w = ws('winnerSlot')
      return w ? `${nameOf(w, names)} 黄金9` : '黄金9'
    }
    case 'score_eight_ball_win': {
      const w = ws('winnerSlot')
      return w ? `${nameOf(w, names)} 本局胜` : '本局胜'
    }
    case 'foul': {
      const f = ws('foulerSlot')
      const c = ws('compensateSlot')
      return f && c
        ? `${nameOf(f, names)} 犯规，${nameOf(c, names)} +1`
        : '犯规'
    }
    case 'undo':
      return '撤销了上一步操作'
    case 'rename':
      return `改名：${p.oldName} → ${p.newName}`
    case 'pause':
      return '暂停'
    case 'resume':
      return '继续'
    case 'seat_occupy': {
      const s = ws('slot')
      return s ? `${nameOf(s, names)} 入座` : '入座'
    }
    case 'seat_leave': {
      const s = ws('slot')
      return s ? `${nameOf(s, names)} 离座` : '离座'
    }
    case 'seat_kick': {
      const s = ws('slot')
      return s ? `管理员踢出 ${nameOf(s, names)}` : '管理员踢人'
    }
    case 'end':
      return '比赛结束'
    case 'force_end':
      return `管理员强制结束${p.reason ? `（${p.reason}）` : ''}`
    case 'score_correct':
      return `管理员修正分数${p.reason ? `（${p.reason}）` : ''}`
    default:
      return ev.type
  }
}

export default function MatchHistorySheet({
  visible,
  matchId,
  slotNames,
  onClose
}: Props) {
  const [items, setItems] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    setLoading(true)
    setErr(null)
    matchApi
      .events(matchId)
      .then((r) => {
        if (!cancelled) setItems(r.items)
      })
      .catch((e) => {
        if (!cancelled) setErr((e as Error).message ?? '拉取失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [visible, matchId])

  if (!visible) return null

  return (
    <View className='mhs-mask' onClick={onClose}>
      <View className='mhs-box' onClick={(e) => e.stopPropagation?.()}>
        <View className='mhs-head'>
          <Text className='mhs-title'>📜 操作历史</Text>
          <Text className='mhs-hint'>所有记分 / 犯规 / 撤销均有记录，可追溯</Text>
          <View className='mhs-close' onClick={onClose}>
            关闭
          </View>
        </View>
        <ScrollView className='mhs-list' scrollY>
          {loading && <Text className='mhs-empty'>加载中...</Text>}
          {err && <Text className='mhs-empty'>⚠️ {err}</Text>}
          {!loading && !err && items.length === 0 && (
            <Text className='mhs-empty'>暂无记录</Text>
          )}
          {!loading &&
            !err &&
            items.map((ev) => {
              const actor =
                ev.actorAdminName != null
                  ? `操作员: 管理员 ${ev.actorAdminName}`
                  : ev.actorNickname != null
                    ? `操作员: ${ev.actorNickname}${
                        ev.actorPhoneMasked ? `（${ev.actorPhoneMasked}）` : ''
                      }`
                    : ev.actorUserId
                      ? `操作员: 用户 ${ev.actorUserId.slice(0, 8)}…`
                      : '操作员: 系统'
              return (
                <View
                  key={ev.id}
                  className={`mhs-row ${ev.undone ? 'is-undone' : ''}`}
                >
                  <View className='mhs-row-left'>
                    <Text className='mhs-seq'>#{ev.serverSeq}</Text>
                    <Text className='mhs-time'>{formatTime(ev.createdAt)}</Text>
                  </View>
                  <View className='mhs-row-main'>
                    <View className='mhs-row-top'>
                      <Text
                        className={`mhs-actor ${ev.actorAdminName ? 'is-admin' : ''}`}
                      >
                        {actor}
                      </Text>
                      {ev.undone && (
                        <Text className='mhs-undone-tag'>已撤销</Text>
                      )}
                    </View>
                    <Text className='mhs-desc'>{describe(ev, slotNames)}</Text>
                  </View>
                </View>
              )
            })}
        </ScrollView>
      </View>
    </View>
  )
}
