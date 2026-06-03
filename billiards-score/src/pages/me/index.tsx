import { View, Text, Image, Button } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { useUserStore } from '../../core/user/store'
import { useMatchStore, MatchRecord } from '../../core/match/store'
import { useAuthStore } from '../../core/auth/store'
import { authApi, meApi } from '../../core/api/auth'
import { venueAuthApi } from '../../core/api/venue'
import { matchApi, MatchDetail, MyStats } from '../../core/api/match'
import { formatElapsed } from '../../core/game/timer'
import InputModal from '../../components/InputModal'
import { isAvatarUrl } from '../../utils/avatar'
import { isWeapp } from '../../utils/wxPrivacy'
import AvatarPickerModal from '../../components/AvatarPickerModal'
import LoginSheet from '../../components/LoginSheet'
import BindPhoneSheet from '../../components/BindPhoneSheet'
import FeedbackModal from '../../components/FeedbackModal'
import { ICP_BEIAN, ICP_MIIT_URL } from '../legal/content'
import './index.scss'

type CloudHistoryItem = MatchDetail & { durationMs?: number }

const AVATAR_EMOJI_CHOICES = ['🎱', '🧍', '🦸', '🥷', '🐯', '🦊', '🐼', '🐶', '🐱', '🦁', '🐰', '🐻']

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

function formatDateTimeShort(ts: number | string | undefined | null): string {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
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

function AvatarView({ avatar, large }: { avatar: string; large?: boolean }) {
  if (isAvatarUrl(avatar)) {
    return (
      <Image
        className={large ? 'identity-avatar-img-lg' : 'identity-avatar-img'}
        src={avatar}
        mode='aspectFill'
      />
    )
  }
  return (
    <Text className={large ? 'identity-avatar-emoji-lg' : 'identity-avatar-emoji'}>
      {avatar}
    </Text>
  )
}

export default function MePage() {
  const { nickname: localNickname, avatar: localAvatar, setNickname: setLocalNickname, setAvatar: setLocalAvatar } = useUserStore()
  const { records, removeMatch } = useMatchStore()
  const cloudUser = useAuthStore((s) => s.user)
  const setCloudUser = useAuthStore((s) => s.setUser)
  const clearAuth = useAuthStore((s) => s.clear)
  const venueSession = useAuthStore((s) => s.venueSession)
  const clearVenueSession = useAuthStore((s) => s.clearVenueSession)

  const [nicknameModalOpen, setNicknameModalOpen] = useState(false)
  const [avatarModalOpen, setAvatarModalOpen] = useState(false)
  const [loginSheetOpen, setLoginSheetOpen] = useState(false)
  const [bindPhoneSheetOpen, setBindPhoneSheetOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [tab, setTab] = useState<'cloud' | 'local'>('cloud')
  const [cloudHistory, setCloudHistory] = useState<CloudHistoryItem[]>([])
  const [savingProfile, setSavingProfile] = useState(false)
  /** v2.22 累计战绩 */
  const [stats, setStats] = useState<MyStats | null>(null)

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

  // 加载累计战绩
  const loadStats = async () => {
    if (!cloudUser) {
      setStats(null)
      return
    }
    try {
      const s = await matchApi.myStats()
      setStats(s)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (cloudUser) {
      setTab('cloud')
      loadCloudHistory()
      loadStats()
    } else {
      setTab('local')
      setStats(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudUser?.id])

  useDidShow(() => {
    if (cloudUser) {
      loadCloudHistory()
      loadStats()
    }
  })

  // 当前展示用的昵称/头像（登录态优先云端，未登录用本地）
  const displayNickname = cloudUser?.nickname ?? localNickname
  const displayAvatar = cloudUser?.avatar ?? localAvatar

  const handleNicknameConfirm = async (v: string) => {
    setNicknameModalOpen(false)
    const trimmed = v.trim()
    if (!trimmed) return
    if (cloudUser) {
      setSavingProfile(true)
      try {
        const r = await meApi.update({ nickname: trimmed })
        setCloudUser({ ...cloudUser, nickname: r.nickname, avatar: r.avatar })
        Taro.showToast({ title: '已更新', icon: 'success' })
      } catch (e) {
        Taro.showToast({ title: (e as Error)?.message || '更新失败', icon: 'none' })
      } finally {
        setSavingProfile(false)
      }
    } else {
      setLocalNickname(trimmed)
    }
  }

  const handleAvatarPickEmoji = async (emoji: string) => {
    setAvatarModalOpen(false)
    if (cloudUser) {
      setSavingProfile(true)
      try {
        const r = await meApi.update({ avatar: emoji })
        setCloudUser({ ...cloudUser, nickname: r.nickname, avatar: r.avatar })
        Taro.showToast({ title: '已更新', icon: 'success' })
      } catch (e) {
        Taro.showToast({ title: (e as Error)?.message || '更新失败', icon: 'none' })
      } finally {
        setSavingProfile(false)
      }
    } else {
      setLocalAvatar(emoji)
    }
  }

  const handleChooseWxAvatar = async (e: any) => {
    if (!cloudUser) return
    const filePath: string | undefined = e?.detail?.avatarUrl
    if (!filePath) {
      Taro.showToast({ title: '未选择头像', icon: 'none' })
      return
    }
    setSavingProfile(true)
    try {
      const up = await meApi.uploadAvatar(filePath)
      const r = await meApi.update({ avatar: up.url })
      setCloudUser({ ...cloudUser, nickname: r.nickname, avatar: r.avatar })
      Taro.showToast({ title: '头像已更新', icon: 'success' })
    } catch (err) {
      Taro.showToast({ title: (err as Error)?.message || '更新失败', icon: 'none' })
    } finally {
      setSavingProfile(false)
    }
  }

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

  const openMoreMenu = async () => {
    const items: { label: string; run: () => void }[] = []
    if (cloudUser && !cloudUser.phoneNumber) {
      items.push({
        label: '📱 绑定手机号',
        run: () => setBindPhoneSheetOpen(true)
      })
    }
    if (cloudUser) {
      items.push({
        label: '🚪 退出登录',
        run: handleLogout
      })
    }
    if (!venueSession) {
      items.push({
        label: '🏢 切换到球房管理模式',
        run: () => Taro.navigateTo({ url: '/pages/venue-login/index' })
      })
    }
    if (items.length === 0) return
    const res = await Taro.showActionSheet({
      itemList: items.map((x) => x.label)
    }).catch(() => null)
    if (res && typeof res.tapIndex === 'number') {
      items[res.tapIndex].run()
    }
  }

  return (
    <View className='me-page'>
      <View className='me-topbar'>
        <View
          className='me-more-btn'
          onClick={openMoreMenu}
          hoverClass='me-more-btn-hover'
        >
          ⋯
        </View>
      </View>

      {/* 唯一身份卡：登录态用云端，未登录用本地 */}
      <View className='identity-card'>
        <View className='identity-row'>
          {cloudUser && isWeapp() ? (
            <Button
              className='identity-avatar-btn'
              openType='chooseAvatar'
              onChooseAvatar={handleChooseWxAvatar}
              disabled={savingProfile}
            >
              <AvatarView avatar={displayAvatar} />
            </Button>
          ) : (
            <View
              className='identity-avatar-btn'
              onClick={() => !savingProfile && setAvatarModalOpen(true)}
            >
              <AvatarView avatar={displayAvatar} />
            </View>
          )}
          <View className='identity-info'>
            <View
              className='identity-name-row'
              onClick={() => !savingProfile && setNicknameModalOpen(true)}
            >
              <Text className='identity-name'>{displayNickname}</Text>
              <Text className='identity-edit'>✏️</Text>
            </View>
            {cloudUser ? (
              <>
                {cloudUser.phoneNumber ? (
                  <Text className='identity-meta'>📱 {cloudUser.phoneNumber}</Text>
                ) : (
                  <View className='identity-meta-row'>
                    <Text className='identity-meta'>📱 未绑定手机号</Text>
                    <Text
                      className='identity-bind-btn'
                      onClick={() => setBindPhoneSheetOpen(true)}
                    >
                      去绑定 →
                    </Text>
                  </View>
                )}
                <Text className='identity-id'>
                  id: {cloudUser.id.slice(0, 12)}…
                </Text>
              </>
            ) : (
              <Text className='identity-meta'>本地模式 · 仅本机可见</Text>
            )}
          </View>
        </View>
        {!cloudUser && (
          <View
            className='identity-login-btn'
            onClick={() => setLoginSheetOpen(true)}
          >
            登录 / 注册
          </View>
        )}
        {!cloudUser && (
          <Text className='identity-login-hint'>
            登录可解锁联机记分、赛事报名、战绩云端保存
          </Text>
        )}
      </View>

      {/* v2.22 累计战绩（仅登录态显示，且至少打过 1 场） */}
      {cloudUser && stats && stats.totalMatches > 0 && (
        <View className='stats-card'>
          <View className='stats-header'>
            <Text className='stats-title'>📊 战绩</Text>
            <Text className='stats-rate'>胜率 {stats.winRate}%</Text>
          </View>
          <View className='stats-summary-row'>
            <View className='stats-cell'>
              <Text className='stats-num'>{stats.totalMatches}</Text>
              <Text className='stats-label'>出场</Text>
            </View>
            <View className='stats-cell'>
              <Text className='stats-num'>{stats.wins}</Text>
              <Text className='stats-label'>胜场</Text>
            </View>
            {stats.nineBall.matches > 0 && (
              <View className='stats-cell'>
                <Text className='stats-num'>{stats.nineBall.highScore}</Text>
                <Text className='stats-label'>九球最高</Text>
              </View>
            )}
          </View>
          {stats.nineBall.matches > 0 && (
            <View className='stats-detail'>
              <Text className='stats-detail-title'>九球累计</Text>
              <View className='stats-chips'>
                {stats.nineBall.golden9 > 0 && (
                  <Text className='stats-chip'>👑 黄金9 ×{stats.nineBall.golden9}</Text>
                )}
                {stats.nineBall.bigJack > 0 && (
                  <Text className='stats-chip'>💎 大金 ×{stats.nineBall.bigJack}</Text>
                )}
                {stats.nineBall.smallJack > 0 && (
                  <Text className='stats-chip'>🏅 小金 ×{stats.nineBall.smallJack}</Text>
                )}
                {stats.nineBall.normalWin > 0 && (
                  <Text className='stats-chip'>✅ 普胜 ×{stats.nineBall.normalWin}</Text>
                )}
              </View>
            </View>
          )}
          {stats.eightBall.matches > 0 && (
            <View className='stats-detail'>
              <Text className='stats-detail-title'>中八累计</Text>
              <View className='stats-chips'>
                <Text className='stats-chip'>
                  打了 {stats.eightBall.matches} 场，赢 {stats.eightBall.wins} 场，
                  累计胜局 {stats.eightBall.totalWinRounds}
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* 球房管理模式入口（已登录商家时显示；未登录商家由 ⋯ 菜单进入） */}
      {venueSession && (
        <View className='venue-mode-card'>
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
          <View
            className='venue-mode-logout'
            onClick={async () => {
              try {
                await venueAuthApi.logout()
              } catch {
                // ignore
              }
              clearVenueSession()
              Taro.showToast({ title: '已退出商家登录', icon: 'none' })
            }}
          >
            退出商家登录
          </View>
        </View>
      )}

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
                        {formatDateTimeShort(m.endedAt)}
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
        <View
          className='about-row about-row-link'
          onClick={() => setFeedbackOpen(true)}
        >
          <Text>帮助与反馈</Text>
          <Text className='about-value'>→</Text>
        </View>
        {ICP_BEIAN && (
          <View
            className='about-row about-icp'
            onClick={async () => {
              if (isWeapp()) {
                // 小程序不能跳外链：复制工信部链接，让用户去浏览器打开
                await Taro.setClipboardData({ data: ICP_MIIT_URL })
                Taro.showToast({
                  title: '工信部链接已复制，可在浏览器打开',
                  icon: 'none',
                  duration: 2500
                })
              } else if (typeof window !== 'undefined') {
                // H5 直接开新窗口跳工信部
                window.open(ICP_MIIT_URL, '_blank', 'noopener,noreferrer')
              }
            }}
          >
            <Text className='about-icp-num'>{ICP_BEIAN}</Text>
            <Text className='about-icp-link'>工信部 →</Text>
          </View>
        )}
      </View>

      <InputModal
        visible={nicknameModalOpen}
        title='修改昵称'
        placeholder='请输入昵称'
        initialValue={displayNickname}
        onCancel={() => setNicknameModalOpen(false)}
        onConfirm={handleNicknameConfirm}
      />

      <AvatarPickerModal
        visible={avatarModalOpen}
        options={AVATAR_EMOJI_CHOICES}
        current={isAvatarUrl(displayAvatar) ? '' : displayAvatar}
        onCancel={() => setAvatarModalOpen(false)}
        onPick={handleAvatarPickEmoji}
      />

      <LoginSheet
        visible={loginSheetOpen}
        onClose={() => setLoginSheetOpen(false)}
      />

      <BindPhoneSheet
        visible={bindPhoneSheetOpen}
        onClose={() => setBindPhoneSheetOpen(false)}
      />

      <FeedbackModal
        visible={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
      />
    </View>
  )
}
