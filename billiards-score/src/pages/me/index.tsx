import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { useUserStore } from '../../core/user/store'
import { useMatchStore, MatchRecord } from '../../core/match/store'
import { useAuthStore } from '../../core/auth/store'
import { authApi } from '../../core/api/auth'
import { matchApi, MatchDetail } from '../../core/api/match'
import { formatElapsed } from '../../core/game/timer'
import InputModal from '../../components/InputModal'
import AvatarPickerModal from '../../components/AvatarPickerModal'
import LoginSheet from '../../components/LoginSheet'
import BindPhoneSheet from '../../components/BindPhoneSheet'
import './index.scss'

type CloudHistoryItem = MatchDetail & { durationMs?: number }

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
  const cloudUser = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clear)
  const venueSession = useAuthStore((s) => s.venueSession)

  const [nicknameModalOpen, setNicknameModalOpen] = useState(false)
  const [avatarModalOpen, setAvatarModalOpen] = useState(false)
  const [loginSheetOpen, setLoginSheetOpen] = useState(false)
  const [bindPhoneSheetOpen, setBindPhoneSheetOpen] = useState(false)
  const [tab, setTab] = useState<'cloud' | 'local'>('cloud')
  const [cloudHistory, setCloudHistory] = useState<CloudHistoryItem[]>([])

  // 加载云端历史
  const loadCloudHistory = async () => {
    if (!cloudUser) return
    try {
      const r = await matchApi.myHistory(1, 30)
      setCloudHistory(r.items as CloudHistoryItem[])
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (cloudUser) {
      setTab('cloud')
      loadCloudHistory()
    } else {
      setTab('local')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudUser?.id])

  useDidShow(() => {
    if (cloudUser) loadCloudHistory()
  })

  const handleLogout = async () => {
    const res = await Taro.showModal({
      title: '退出登录',
      content: '退出后将切回本地模式；本地记录保留。',
      confirmText: '退出',
      cancelText: '取消'
    }).catch(() => null)
    if (res && res.confirm) {
      try { await authApi.logout() } catch {}
      clearAuth()
      Taro.showToast({ title: '已退出', icon: 'success' })
    }
  }

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
      {cloudUser ? (
        <View className='cloud-account-card'>
          <View className='cloud-row'>
            <Text className='cloud-emoji'>{cloudUser.avatar}</Text>
            <View className='cloud-info'>
              <Text className='cloud-nickname'>{cloudUser.nickname}</Text>
              <Text className='cloud-id'>id: {cloudUser.id.slice(0, 12)}...</Text>
              <Text className='cloud-phone'>
                手机号 · {cloudUser.phoneNumber ?? '未绑定'}
              </Text>
            </View>
            <View className='cloud-actions'>
              {!cloudUser.phoneNumber && (
                <View className='cloud-btn' onClick={() => setBindPhoneSheetOpen(true)}>
                  绑定手机
                </View>
              )}
              <View className='cloud-btn cloud-btn-out' onClick={handleLogout}>
                退出
              </View>
            </View>
          </View>
        </View>
      ) : (
        <View className='cloud-account-card cloud-card-anon'>
          <View className='cloud-anon-text'>
            登录后可与朋友联机记分、战绩云端保存
          </View>
          <View className='cloud-btn primary' onClick={() => setLoginSheetOpen(true)}>
            登录 / 注册
          </View>
        </View>
      )}

      {/* 球房管理模式入口（v2.10） */}
      <View className='venue-mode-card'>
        {venueSession ? (
          <>
            <View className='venue-mode-row'>
              <Text className='venue-mode-icon'>🏢</Text>
              <View className='venue-mode-info'>
                <Text className='venue-mode-title'>
                  当前已登录商家：{venueSession.account.nickname}
                </Text>
                <Text className='venue-mode-sub'>
                  {venueSession.account.venueId
                    ? `已绑定球房 · ${venueSession.account.venueId.slice(0, 12)}…`
                    : '尚未绑定球房，可继续完成入驻申请'}
                </Text>
              </View>
            </View>
            <View
              className='venue-mode-btn'
              onClick={() =>
                Taro.navigateTo({ url: '/pages/venue-apply/index' })
              }
            >
              {venueSession.account.venueId ? '查看球房状态 →' : '查看 / 完成申请 →'}
            </View>
          </>
        ) : (
          <>
            <View className='venue-mode-row'>
              <Text className='venue-mode-icon'>🏢</Text>
              <View className='venue-mode-info'>
                <Text className='venue-mode-title'>切换到球房管理模式</Text>
                <Text className='venue-mode-sub'>
                  已入驻商家可登录查看自家球房 / 赛事；新商家可申请入驻
                </Text>
              </View>
            </View>
            <View
              className='venue-mode-btn'
              onClick={() =>
                Taro.navigateTo({ url: '/pages/venue-login/index' })
              }
            >
              切换到球房管理模式 →
            </View>
          </>
        )}
      </View>

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
        <View className='section-title' style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text>历史记录</Text>
          {cloudUser && (
            <View className='history-tabs'>
              <Text
                className={`history-tab ${tab === 'cloud' ? 'active' : ''}`}
                onClick={() => setTab('cloud')}
              >
                云端 {cloudHistory.length > 0 && `(${cloudHistory.length})`}
              </Text>
              <Text
                className={`history-tab ${tab === 'local' ? 'active' : ''}`}
                onClick={() => setTab('local')}
              >
                本地 {records.length > 0 && `(${records.length})`}
              </Text>
            </View>
          )}
        </View>

        {tab === 'cloud' ? (
          cloudHistory.length === 0 ? (
            <View className='placeholder'>
              <Text className='placeholder-text'>
                {cloudUser ? '还没有云端比赛记录' : '登录后可看云端记录'}
              </Text>
              <Text className='placeholder-hint'>
                {cloudUser ? '去首页开一局联机试试' : ''}
              </Text>
            </View>
          ) : (
            <View className='history-list'>
              {cloudHistory.map((m) => {
                const players = (m.players ?? []).filter((p) => p.isCurrent)
                const isNine = m.type === 'nine_ball'
                const compScores = m.computed?.scores ?? {}
                const compWins = m.computed?.wins ?? {}
                const scores = isNine
                  ? players.map((p) => compScores[p.slot] ?? 0)
                  : players.map((p) => compWins[p.slot] ?? 0)
                const top = players.length
                  ? players.reduce((a, b) =>
                      isNine
                        ? (compScores[a.slot] ?? 0) >= (compScores[b.slot] ?? 0) ? a : b
                        : (compWins[a.slot] ?? 0) >= (compWins[b.slot] ?? 0) ? a : b
                    , players[0])
                  : null
                return (
                  <View
                    key={m.id}
                    className='history-item'
                    onClick={() =>
                      Taro.navigateTo({ url: `/pages/match-detail/index?id=${m.id}` })
                    }
                  >
                    <View className='item-icon'>🎱</View>
                    <View className='item-info'>
                      <Text className='item-title'>
                        {isNine ? '九球追分' : '中式八球'}
                        {m.code && <Text style={{ opacity: 0.5, fontSize: 11, marginLeft: 6 }}>{m.code}</Text>}
                      </Text>
                      <Text className='item-players'>
                        {players.map((p) => p.displayName).join(' vs ')}
                      </Text>
                      <Text className='item-meta'>
                        时长 {formatElapsed(Number(m.timer?.accumulatedMs ?? 0))} · 冠军 {top?.displayName ?? '—'}
                      </Text>
                    </View>
                    <View className='item-score'>
                      <Text className='score-text'>{scores.join(' : ')}</Text>
                      <Text className='item-time'>
                        {m.endedAt
                          ? new Date(m.endedAt).toLocaleDateString() + ' ' + new Date(m.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </Text>
                    </View>
                  </View>
                )
              })}
            </View>
          )
        ) : records.length === 0 ? (
          <View className='placeholder'>
            <Text className='placeholder-text'>还没有本地比赛记录</Text>
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

      <LoginSheet
        visible={loginSheetOpen}
        onClose={() => setLoginSheetOpen(false)}
      />

      <BindPhoneSheet
        visible={bindPhoneSheetOpen}
        onClose={() => setBindPhoneSheetOpen(false)}
      />
    </View>
  )
}
