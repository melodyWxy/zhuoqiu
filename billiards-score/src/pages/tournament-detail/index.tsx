import { View, Text, Button } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import {
  tournamentsPublicApi,
  type BracketMatchItem,
  type BracketTree,
  type MyRegistration,
  type TournamentDetailPublic,
  type TournamentRegPublic
} from '../../core/api/venue'
import { useAuthStore } from '../../core/auth/store'
import LoginSheet from '../../components/LoginSheet'
import PageHeader from '../../components/PageHeader'
import LoadingState from '../../components/LoadingState'
import './index.scss'

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  draft: { text: '草稿', color: '#a0a8a4' },
  registering: { text: '报名中', color: '#60a5fa' },
  registration_closed: { text: '报名截止', color: '#f59e0b' },
  in_progress: { text: '进行中', color: '#4ade80' },
  completed: { text: '已结束', color: '#a0a8a4' },
  cancelled: { text: '已取消', color: '#ef4444' }
}

type Tab = 'info' | 'players' | 'bracket'

function formatDt(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function TournamentDetailPage() {
  const router = useRouter()
  const id = (router.params.id as string) || ''
  const cloudUser = useAuthStore((s) => s.user)
  const [tab, setTab] = useState<Tab>('info')
  const [t, setT] = useState<TournamentDetailPublic | null>(null)
  const [regs, setRegs] = useState<TournamentRegPublic[]>([])
  const [myReg, setMyReg] = useState<MyRegistration | null>(null)
  const [bracket, setBracket] = useState<BracketTree | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)

  const fetchAll = async () => {
    if (!id) return
    setLoading(true)
    try {
      const detail = await tournamentsPublicApi.detail(id)
      setT(detail)
      const r = await tournamentsPublicApi.registrations(id)
      setRegs(r.items)
      if (cloudUser) {
        try {
          const me = await tournamentsPublicApi.myRegistration(id)
          setMyReg(me.registration)
        } catch {
          // ignore
        }
      } else {
        setMyReg(null)
      }
      // bracket 仅当已开赛/已结束/报名截止时拉
      if (
        detail.status === 'in_progress' ||
        detail.status === 'completed' ||
        detail.status === 'registration_closed'
      ) {
        try {
          const b = await tournamentsPublicApi.bracket(id)
          setBracket(b)
        } catch {
          setBracket(null)
        }
      } else {
        setBracket(null)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, cloudUser?.id])

  const handleRegister = async () => {
    if (!cloudUser) {
      setLoginOpen(true)
      return
    }
    if (!t) return
    if (!cloudUser.phoneNumber) {
      Taro.showToast({
        title: '请先绑定手机号才能报名',
        icon: 'none'
      })
      return
    }
    const res = await Taro.showModal({
      title: '确认报名',
      content: `${t.title}\n${t.gameType === 'nine_ball' ? '九球' : '中八'} · ${formatDt(t.matchStartsAt)} 开赛\n${t.entryFeeCents ? `报名费 ${(t.entryFeeCents / 100).toFixed(0)} 元（线下收）` : '免费'}`,
      confirmText: '确认报名'
    }).catch(() => null)
    if (!res?.confirm) return
    setBusy(true)
    try {
      await tournamentsPublicApi.register(id, cloudUser.nickname)
      Taro.showToast({ title: '报名成功', icon: 'success' })
      fetchAll()
    } finally {
      setBusy(false)
    }
  }

  const handleWithdraw = async () => {
    const res = await Taro.showModal({
      title: '确认取消报名',
      content: '取消后名额会让出来给其他人',
      confirmText: '确认取消',
      cancelText: '再想想'
    }).catch(() => null)
    if (!res?.confirm) return
    setBusy(true)
    try {
      await tournamentsPublicApi.withdraw(id)
      Taro.showToast({ title: '已取消报名', icon: 'none' })
      fetchAll()
    } finally {
      setBusy(false)
    }
  }

  if (loading || !t) {
    return <LoadingState text='正在加载赛事' />
  }

  const status = t.status
  const isRegistering = status === 'registering'
  const isConfirmed = myReg?.status === 'confirmed'
  const full = t.registeredCount >= t.maxPlayers && !isConfirmed
  const now = Date.now()
  const inWindow =
    now >= new Date(t.registrationStartsAt).getTime() &&
    now <= new Date(t.registrationEndsAt).getTime()

  const renderInfo = () => (
    <View>
      <View className='td-card'>
        <Text className='td-section'>赛事信息</Text>
        <View className='td-row'>
          <Text className='td-label'>项目</Text>
          <Text className='td-val'>
            {t.gameType === 'nine_ball' ? '九球追分' : '中式八球'}
          </Text>
        </View>
        <View className='td-row'>
          <Text className='td-label'>赛制</Text>
          <Text className='td-val'>
            {t.format === 'single_elim'
              ? `单败淘汰 ${t.maxPlayers} 强`
              : t.format}
          </Text>
        </View>
        <View className='td-row'>
          <Text className='td-label'>报名期</Text>
          <Text className='td-val'>
            {formatDt(t.registrationStartsAt)} ~{' '}
            {formatDt(t.registrationEndsAt)}
          </Text>
        </View>
        <View className='td-row'>
          <Text className='td-label'>开赛</Text>
          <Text className='td-val'>{formatDt(t.matchStartsAt)}</Text>
        </View>
        <View className='td-row'>
          <Text className='td-label'>名额</Text>
          <Text className='td-val'>
            {t.registeredCount} / {t.maxPlayers}
          </Text>
        </View>
        {t.entryFeeCents > 0 && (
          <View className='td-row'>
            <Text className='td-label'>报名费</Text>
            <Text className='td-val'>
              {(t.entryFeeCents / 100).toFixed(0)} 元（线下收）
            </Text>
          </View>
        )}
        {t.prizePoolText && (
          <View className='td-row'>
            <Text className='td-label'>奖励</Text>
            <Text className='td-val'>{t.prizePoolText}</Text>
          </View>
        )}
      </View>

      {t.noticeText && (
        <View className='td-card'>
          <Text className='td-section'>报名须知</Text>
          <Text className='td-notice'>{t.noticeText}</Text>
        </View>
      )}

      {t.venue && (
        <View
          className='td-card td-card-clickable'
          onClick={() =>
            Taro.navigateTo({
              url: `/pages/venue-detail/index?id=${t.venue!.id}`
            })
          }
        >
          <Text className='td-section'>主办球房</Text>
          <Text className='td-venue-name'>{t.venue.name} →</Text>
          <Text className='td-venue-addr'>
            📍 {`${t.venue.province ?? ''}${t.venue.city ?? ''}${t.venue.district ?? ''}${t.venue.address}`}
          </Text>
        </View>
      )}
    </View>
  )

  const renderPlayers = () => (
    <View className='td-card'>
      <Text className='td-section'>已报名 {regs.length} 人</Text>
      {regs.length === 0 ? (
        <Text className='td-notice'>还没有人报名，快做第一个</Text>
      ) : (
        regs.map((r, i) => (
          <View key={r.id} className='td-player-row'>
            <Text className='td-player-no'>{i + 1}</Text>
            <Text className='td-player-name'>{r.displayName}</Text>
            <Text className='td-player-time'>
              {new Date(r.registeredAt).toLocaleDateString()}
            </Text>
          </View>
        ))
      )}
    </View>
  )

  const myRegId = myReg?.status === 'confirmed' ? myReg.id : null

  const findMyMatch = (): BracketMatchItem | null => {
    if (!bracket || !myRegId) return null
    // 找最新一场涉及我的、状态非 walkover/completed 的对阵
    let candidate: BracketMatchItem | null = null
    for (const r of bracket.rounds) {
      for (const m of r.matches) {
        const mine =
          m.playerARegistrationId === myRegId ||
          m.playerBRegistrationId === myRegId
        if (!mine) continue
        if (
          m.status === 'ready' ||
          m.status === 'in_progress' ||
          (m.status === 'pending' &&
            (m.playerARegistrationId === myRegId ||
              m.playerBRegistrationId === myRegId))
        ) {
          candidate = m
        } else if (m.status === 'completed' && !candidate) {
          candidate = m
        }
      }
    }
    return candidate
  }

  const roundName = (round: number, total: number): string => {
    if (round === total) return '决赛'
    if (round === total - 1) return '半决赛'
    if (round === total - 2) return '8 强'
    return `第 ${round} 轮`
  }

  const renderBracket = () => {
    if (status === 'draft' || status === 'registering') {
      return (
        <View className='td-card'>
          <Text className='td-section'>赛程</Text>
          <Text className='td-notice'>
            报名结束后由商家"开赛"生成赛程
          </Text>
        </View>
      )
    }
    if (status === 'cancelled') {
      return (
        <View className='td-card'>
          <Text className='td-section'>赛程</Text>
          <Text className='td-notice'>赛事已取消</Text>
        </View>
      )
    }
    if (!bracket) {
      return (
        <View className='td-card'>
          <Text className='td-section'>赛程</Text>
          <LoadingState text='正在加载赛程' variant='inline' />
        </View>
      )
    }
    const myMatch = findMyMatch()
    return (
      <View>
        {myMatch && (
          <View
            className='td-card td-my-match'
            onClick={() => {
              if (myMatch.status === 'in_progress' && myMatch.matchId) {
                const url =
                  t.gameType === 'nine_ball'
                    ? '/pages/nine-ball/index'
                    : '/pages/eight-ball/index'
                Taro.navigateTo({
                  url: `${url}?matchId=${myMatch.matchId}&role=player`
                })
              } else if (myMatch.status === 'ready') {
                Taro.showToast({
                  title: '等商家在控台开赛',
                  icon: 'none'
                })
              } else if (myMatch.status === 'completed') {
                Taro.showToast({
                  title: '该场已结束',
                  icon: 'none'
                })
              }
            }}
          >
            <Text className='td-section'>我的对阵</Text>
            <Text className='td-my-round'>
              {roundName(myMatch.round, bracket.totalRounds)} ·{' '}
              {myMatch.status === 'ready'
                ? '待开赛'
                : myMatch.status === 'in_progress'
                  ? '🔵 进行中 · 点击进入记分 →'
                  : myMatch.status === 'completed'
                    ? '已结束'
                    : '待定'}
            </Text>
            <View className='td-my-vs'>
              <Text
                className={`td-my-name ${
                  myMatch.playerARegistrationId === myRegId ? 'me' : ''
                }`}
              >
                {myMatch.playerA?.displayName ?? '待定'}
              </Text>
              <Text className='td-my-vs-label'>vs</Text>
              <Text
                className={`td-my-name ${
                  myMatch.playerBRegistrationId === myRegId ? 'me' : ''
                }`}
              >
                {myMatch.playerB?.displayName ?? '待定'}
              </Text>
            </View>
          </View>
        )}

        <View className='td-card'>
          <Text className='td-section'>赛程树</Text>
          <Text className='td-bracket-legend'>
            ✓ 完成 · ● 进行 · ◌ 待开 · ○ 轮空
          </Text>
          <View className='td-bracket-scroll'>
            {bracket.rounds.map((r) => (
              <View key={r.round} className='td-bracket-col'>
                <Text className='td-bracket-round-title'>
                  {roundName(r.round, bracket.totalRounds)}
                </Text>
                {r.matches.map((m) => {
                  const aMine = m.playerARegistrationId === myRegId
                  const bMine = m.playerBRegistrationId === myRegId
                  const aWin =
                    !!m.winnerRegistrationId &&
                    m.winnerRegistrationId === m.playerARegistrationId
                  const bWin =
                    !!m.winnerRegistrationId &&
                    m.winnerRegistrationId === m.playerBRegistrationId
                  return (
                    <View
                      key={m.id}
                      className={`td-bracket-card ${aMine || bMine ? 'mine' : ''} td-bracket-${m.status}`}
                    >
                      <View
                        className={`td-bracket-row ${aMine ? 'me' : ''} ${aWin ? 'won' : ''}`}
                      >
                        <Text className='td-bracket-name'>
                          {m.playerA?.seed ? `#${m.playerA.seed} ` : ''}
                          {m.playerA?.displayName ??
                            (m.status === 'walkover' ? 'BYE' : '待定')}
                        </Text>
                        {aWin && <Text className='td-bracket-check'>✓</Text>}
                      </View>
                      <View
                        className={`td-bracket-row ${bMine ? 'me' : ''} ${bWin ? 'won' : ''}`}
                      >
                        <Text className='td-bracket-name'>
                          {m.playerB?.seed ? `#${m.playerB.seed} ` : ''}
                          {m.playerB?.displayName ??
                            (m.status === 'walkover' ? 'BYE' : '待定')}
                        </Text>
                        {bWin && <Text className='td-bracket-check'>✓</Text>}
                      </View>
                    </View>
                  )
                })}
              </View>
            ))}
          </View>
        </View>
      </View>
    )
  }

  return (
    <View className='tournament-detail-page'>
      <PageHeader
        title='赛事详情'
        right={
          <Text
            className='td-status'
            style={{ color: STATUS_LABEL[status].color }}
          >
            {STATUS_LABEL[status].text}
          </Text>
        }
      />
      <View className='td-header'>
        <Text className='td-title'>🏆 {t.title}</Text>
      </View>

      <View className='td-tabs'>
        {(
          [
            ['info', '信息'],
            ['players', `报名 ${regs.length}`],
            ['bracket', '赛程']
          ] as [Tab, string][]
        ).map(([k, text]) => (
          <View
            key={k}
            className={`td-tab ${tab === k ? 'active' : ''}`}
            onClick={() => setTab(k)}
          >
            {text}
          </View>
        ))}
      </View>

      {tab === 'info' && renderInfo()}
      {tab === 'players' && renderPlayers()}
      {tab === 'bracket' && renderBracket()}

      {/* 底部行动按钮 */}
      <View className='td-cta'>
        {status === 'cancelled' && <Text className='td-cta-tip'>赛事已取消</Text>}
        {status === 'completed' && (
          <Text className='td-cta-tip'>赛事已结束</Text>
        )}
        {(status === 'registration_closed' || status === 'in_progress') && (
          <>
            {isConfirmed ? (
              <Text className='td-cta-tip'>
                你已报名，等待 {status === 'in_progress' ? '现场对阵' : '开赛'}
              </Text>
            ) : (
              <Text className='td-cta-tip'>报名已截止</Text>
            )}
          </>
        )}
        {isRegistering &&
          (isConfirmed ? (
            <Button
              className='td-btn td-btn-secondary'
              loading={busy}
              onClick={handleWithdraw}
            >
              已报名 · 取消报名
            </Button>
          ) : full ? (
            <Button className='td-btn td-btn-disabled' disabled>
              名额已满
            </Button>
          ) : !inWindow ? (
            <Button className='td-btn td-btn-disabled' disabled>
              不在报名期内
            </Button>
          ) : (
            <Button
              className='td-btn td-btn-primary'
              loading={busy}
              onClick={handleRegister}
            >
              立即报名
            </Button>
          ))}
      </View>

      <LoginSheet
        visible={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={() => fetchAll()}
      />
    </View>
  )
}
