import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { useUserStore } from '../../core/user/store'
import { useMatchStore, MatchRecord } from '../../core/match/store'
import { formatElapsed } from '../../core/game/timer'
import InputModal from '../../components/InputModal'
import AvatarPickerModal from '../../components/AvatarPickerModal'
import './index.scss'

const AVATAR_CHOICES = ['🎱', '🧍', '🦸', '🥷', '🐯', '🦊', '🐼', '🐶', '🐱', '🦁', '🐰', '🐻']

function formatDateGroup(ts: number): string {
  const now = new Date()
  const d = new Date(ts)
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  if (sameDay(now, d)) return '今天'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(yesterday, d)) return '昨天'
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function groupByDate(records: MatchRecord[]): { date: string; items: MatchRecord[] }[] {
  const groups: Record<string, MatchRecord[]> = {}
  const order: string[] = []
  for (const r of records) {
    const key = formatDateGroup(r.endedAt)
    if (!groups[key]) {
      groups[key] = []
      order.push(key)
    }
    groups[key].push(r)
  }
  return order.map((date) => ({ date, items: groups[date] }))
}

export default function MePage() {
  const { nickname, avatar, setNickname, setAvatar } = useUserStore()
  const { records, removeMatch } = useMatchStore()

  const [nicknameModalOpen, setNicknameModalOpen] = useState(false)
  const [avatarModalOpen, setAvatarModalOpen] = useState(false)

  const handleLongPressRecord = async (r: MatchRecord) => {
    const res = await Taro.showModal({
      title: '删除这场记录？',
      content: `${r.type === 'nine-ball' ? '九球追分' : '中式八球'} · ${formatTime(
        r.endedAt
      )}`,
      confirmText: '删除',
      cancelText: '取消'
    }).catch(() => null)
    if (res && res.confirm) {
      removeMatch(r.id)
    }
  }

  const groups = groupByDate(records)

  return (
    <View className='me-page'>
      <View className='profile-card'>
        <View className='avatar' onClick={() => setAvatarModalOpen(true)}>
          <Text className='avatar-emoji'>{avatar}</Text>
          <Text className='avatar-hint'>点击更换</Text>
        </View>
        <View className='nickname-row' onClick={() => setNicknameModalOpen(true)}>
          <Text className='nickname'>{nickname}</Text>
          <Text className='edit-icon'>✏️</Text>
        </View>
      </View>

      <View className='section'>
        <View className='section-title'>历史记录</View>
        {records.length === 0 ? (
          <View className='placeholder'>
            <Text className='placeholder-text'>还没有比赛记录</Text>
            <Text className='placeholder-hint'>去首页开一局试试</Text>
          </View>
        ) : (
          <View className='history-list'>
            {groups.map((group) => (
              <View key={group.date} className='history-group'>
                <View className='date-label'>{group.date}</View>
                {group.items.map((r) => (
                  <View
                    key={r.id}
                    className='history-item'
                    onLongPress={() => handleLongPressRecord(r)}
                  >
                    <View className='item-icon'>🎱</View>
                    <View className='item-info'>
                      <Text className='item-title'>
                        {r.type === 'nine-ball' ? '九球追分' : '中式八球'}
                      </Text>
                      <Text className='item-players'>
                        {r.players.map((p) => p.name).join(' vs ')}
                      </Text>
                      <Text className='item-meta'>
                        时长 {formatElapsed(r.durationMs)} · 冠军 {r.winnerName || '—'}
                      </Text>
                    </View>
                    <View className='item-score'>
                      <Text className='score-text'>
                        {r.type === 'nine-ball'
                          ? r.players.map((p) => p.score ?? 0).join(' : ')
                          : r.players.map((p) => p.wins ?? 0).join(' : ')}
                      </Text>
                      <Text className='item-time'>{formatTime(r.endedAt)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}
      </View>

      <View className='section'>
        <View className='section-title'>关于</View>
        <View className='about-row'>
          <Text>版本</Text>
          <Text className='about-value'>v1.0.0</Text>
        </View>
      </View>

      <InputModal
        visible={nicknameModalOpen}
        title='修改昵称'
        placeholder='请输入昵称'
        initialValue={nickname}
        onCancel={() => setNicknameModalOpen(false)}
        onConfirm={(v) => {
          setNickname(v)
          setNicknameModalOpen(false)
        }}
      />

      <AvatarPickerModal
        visible={avatarModalOpen}
        options={AVATAR_CHOICES}
        current={avatar}
        onCancel={() => setAvatarModalOpen(false)}
        onPick={(v) => {
          setAvatar(v)
          setAvatarModalOpen(false)
        }}
      />
    </View>
  )
}
