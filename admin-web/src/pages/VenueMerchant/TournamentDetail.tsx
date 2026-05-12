import { useEffect, useState } from 'react'
import {
  App,
  Button,
  Card,
  Descriptions,
  Modal,
  Space,
  Table,
  Tabs,
  Tag,
  Typography
} from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  tournamentMerchantApi,
  type BracketMatchItem,
  type BracketPlayerRef,
  type BracketTree,
  type TournamentItem,
  type TournamentRegistrationItem,
  type TournamentStatus
} from '../../api/venue'

const { Title, Paragraph } = Typography

const STATUS_LABEL: Record<TournamentStatus, { text: string; color: string }> = {
  draft: { text: '草稿', color: 'default' },
  registering: { text: '报名中', color: 'processing' },
  registration_closed: { text: '报名截止', color: 'warning' },
  in_progress: { text: '进行中', color: 'blue' },
  completed: { text: '已结束', color: 'success' },
  cancelled: { text: '已取消', color: 'error' }
}

const REG_STATUS_LABEL: Record<string, { text: string; color: string }> = {
  confirmed: { text: '已确认', color: 'success' },
  withdrawn: { text: '已退出', color: 'default' },
  disqualified: { text: '已移除', color: 'error' }
}

const FORMAT_LABEL: Record<string, string> = {
  single_elim: '单败淘汰',
  double_elim: '双败淘汰',
  round_robin: '循环赛',
  swiss: '瑞士轮'
}

export default function TournamentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [t, setT] = useState<TournamentItem | null>(null)
  const [regs, setRegs] = useState<TournamentRegistrationItem[]>([])
  const [bracket, setBracket] = useState<BracketTree | null>(null)
  const [loading, setLoading] = useState(true)
  const [showWithdrawn, setShowWithdrawn] = useState(false)
  const [selectedBm, setSelectedBm] = useState<BracketMatchItem | null>(null)

  const fetchAll = async () => {
    if (!id) return
    setLoading(true)
    try {
      const [r1, r2] = await Promise.all([
        tournamentMerchantApi.detail(id),
        tournamentMerchantApi.registrations(id, showWithdrawn)
      ])
      setT(r1.tournament)
      setRegs(r2.items)
      // bracket 仅在 in_progress / completed / registration_closed 拉
      if (
        ['in_progress', 'completed', 'registration_closed'].includes(
          r1.tournament.status
        )
      ) {
        try {
          const b = await tournamentMerchantApi.bracket(id)
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
  }, [id, showWithdrawn])

  const publish = () => {
    if (!t) return
    Modal.confirm({
      title: '发布这场赛事？',
      content: '发布后进入"报名中"，C 端用户可以报名。',
      okText: '发布',
      onOk: async () => {
        await tournamentMerchantApi.publish(t.id)
        message.success('已发布')
        fetchAll()
      }
    })
  }

  const closeReg = () => {
    if (!t) return
    Modal.confirm({
      title: '关闭报名？',
      content: `当前 ${t.registeredCount}/${t.maxPlayers} 人。关闭后 C 端不能再报名；紧接着可"开赛"生成赛程。`,
      okText: '关闭报名',
      onOk: async () => {
        await tournamentMerchantApi.closeRegistration(t.id)
        message.success('报名已关闭')
        fetchAll()
      }
    })
  }

  const startNow = () => {
    if (!t) return
    Modal.confirm({
      title: '生成赛程并开赛？',
      content: `按报名顺序分配种子，补 BYE 到 ${
        Math.pow(2, Math.ceil(Math.log2(Math.max(2, t.registeredCount))))
      } 位（2^n）；赛事状态变为"进行中"，不可撤销。`,
      okText: '开赛',
      okButtonProps: { type: 'primary' },
      onOk: async () => {
        await tournamentMerchantApi.start(t.id)
        message.success('已开赛，赛程已生成')
        fetchAll()
      }
    })
  }

  const cancel = () => {
    if (!t) return
    Modal.confirm({
      title: '取消这场赛事？',
      content: '所有报名者的状态不变，但赛事不会再继续。',
      okText: '取消赛事',
      okButtonProps: { danger: true },
      onOk: async () => {
        await tournamentMerchantApi.cancel(t.id)
        message.success('已取消')
        fetchAll()
      }
    })
  }

  const kick = (regId: string) => {
    if (!t) return
    Modal.confirm({
      title: '移除该报名者？',
      content: '将该玩家标记为 disqualified，不计入 bracket。',
      okButtonProps: { danger: true },
      onOk: async () => {
        await tournamentMerchantApi.kick(t.id, regId)
        message.success('已移除')
        fetchAll()
      }
    })
  }

  if (!t) {
    return <Card loading={loading} style={{ margin: 24 }} />
  }
  const rules = t.rulesJson as Record<string, number>
  const canEdit = t.status === 'draft' || t.status === 'registering'

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <Space style={{ marginBottom: 16 }} align="center">
        <Button onClick={() => navigate('/venue/tournaments')}>← 返回</Button>
        <Title level={3} style={{ margin: 0 }}>
          {t.title}
        </Title>
        <Tag color={STATUS_LABEL[t.status].color}>
          {STATUS_LABEL[t.status].text}
        </Tag>
        <code style={{ fontSize: 12, color: '#888' }}>{t.id}</code>
      </Space>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          {t.status === 'draft' && (
            <>
              <Button
                type="primary"
                onClick={() => navigate(`/venue/tournaments/${t.id}/edit`)}
              >
                编辑
              </Button>
              <Button onClick={publish}>发布（进入报名中）</Button>
            </>
          )}
          {t.status === 'registering' && (
            <>
              <Button onClick={() => navigate(`/venue/tournaments/${t.id}/edit`)}>
                编辑
              </Button>
              <Button type="primary" onClick={closeReg}>
                关闭报名
              </Button>
            </>
          )}
          {t.status === 'registration_closed' && (
            <Button type="primary" onClick={startNow}>
              🚀 生成赛程并开赛
            </Button>
          )}
          {canEdit && (
            <Button danger onClick={cancel}>
              取消赛事
            </Button>
          )}
        </Space>
      </Card>

      <Tabs
        items={[
          {
            key: 'info',
            label: '信息',
            children: (
              <Card>
                <Descriptions column={2}>
                  <Descriptions.Item label="项目">
                    {t.gameType === 'nine_ball' ? '九球追分' : '中式八球'}
                  </Descriptions.Item>
                  <Descriptions.Item label="赛制">
                    {FORMAT_LABEL[t.format] ?? t.format}
                  </Descriptions.Item>
                  <Descriptions.Item label="人数">
                    {t.minPlayers} ~ {t.maxPlayers}（已报 {t.registeredCount}）
                  </Descriptions.Item>
                  <Descriptions.Item label="报名费">
                    {t.entryFeeCents
                      ? `${(t.entryFeeCents / 100).toFixed(2)} 元 · 线下收`
                      : '免费'}
                  </Descriptions.Item>
                  <Descriptions.Item label="报名期" span={2}>
                    {dayjs(t.registrationStartsAt).format('YYYY-MM-DD HH:mm')} ~{' '}
                    {dayjs(t.registrationEndsAt).format('YYYY-MM-DD HH:mm')}
                  </Descriptions.Item>
                  <Descriptions.Item label="开赛时间" span={2}>
                    {dayjs(t.matchStartsAt).format('YYYY-MM-DD HH:mm')}
                  </Descriptions.Item>
                  {t.prizePoolText && (
                    <Descriptions.Item label="奖励" span={2}>
                      {t.prizePoolText}
                    </Descriptions.Item>
                  )}
                  <Descriptions.Item label="规则（快照）" span={2}>
                    <pre style={{ margin: 0, fontSize: 12 }}>
                      {JSON.stringify(rules, null, 2)}
                    </pre>
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            )
          },
          {
            key: 'regs',
            label: `报名（${regs.filter((r) => r.status === 'confirmed').length}）`,
            children: (
              <Card
                extra={
                  <Space>
                    <Button
                      size="small"
                      onClick={() => setShowWithdrawn((v) => !v)}
                    >
                      {showWithdrawn ? '仅看 confirmed' : '显示全部状态'}
                    </Button>
                    <Button size="small" onClick={fetchAll}>
                      刷新
                    </Button>
                  </Space>
                }
              >
                <Table<TournamentRegistrationItem>
                  rowKey="id"
                  dataSource={regs}
                  pagination={false}
                  loading={loading}
                  columns={[
                    {
                      title: '#',
                      width: 60,
                      render: (_, __, i) => i + 1
                    },
                    { title: '昵称', dataIndex: 'displayName', width: 200 },
                    {
                      title: '手机号',
                      dataIndex: 'phone',
                      width: 160,
                      render: (v) => v || '—'
                    },
                    {
                      title: '报名时间',
                      dataIndex: 'registeredAt',
                      width: 180,
                      render: (v) => dayjs(v).format('MM-DD HH:mm')
                    },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      width: 100,
                      render: (v) => (
                        <Tag color={REG_STATUS_LABEL[v]?.color ?? 'default'}>
                          {REG_STATUS_LABEL[v]?.text ?? v}
                        </Tag>
                      )
                    },
                    {
                      title: '操作',
                      fixed: 'right',
                      width: 100,
                      render: (_, r) =>
                        r.status === 'confirmed' && canEdit ? (
                          <Button
                            size="small"
                            danger
                            onClick={() => kick(r.id)}
                          >
                            移除
                          </Button>
                        ) : null
                    }
                  ]}
                />
                <Paragraph type="secondary" style={{ marginTop: 12, fontSize: 12 }}>
                  手机号仅对自家球房可见，用于现场联系。
                </Paragraph>
              </Card>
            )
          },
          {
            key: 'bracket',
            label: '赛程',
            children: (
              <BracketView
                tournament={t}
                bracket={bracket}
                loading={loading}
                onSelect={(m) => setSelectedBm(m)}
              />
            )
          }
        ]}
      />

      <BracketActionModal
        m={selectedBm}
        tournamentId={t.id}
        gameType={t.gameType}
        onClose={() => setSelectedBm(null)}
        onDone={() => {
          setSelectedBm(null)
          fetchAll()
        }}
      />
    </div>
  )
}

// ============ 对阵操作 Modal ============

function BracketActionModal({
  m,
  tournamentId,
  gameType,
  onClose,
  onDone
}: {
  m: BracketMatchItem | null
  tournamentId: string
  gameType: 'nine_ball' | 'eight_ball'
  onClose: () => void
  onDone: () => void
}) {
  const { message, modal } = App.useApp()
  const [busy, setBusy] = useState(false)
  if (!m) return null

  const handleStart = async () => {
    setBusy(true)
    try {
      const r = await tournamentMerchantApi.startBracketMatch(
        tournamentId,
        m.id
      )
      message.success(`对阵已开赛，房间码 ${r.code}`)
      onDone()
      const cUrl = `http://${window.location.hostname}:3000/#/pages/${gameType === 'nine_ball' ? 'nine-ball' : 'eight-ball'}/index?matchId=${r.matchId}&role=player`
      window.open(cUrl, '_blank')
    } finally {
      setBusy(false)
    }
  }

  const handleWalkover = (winnerSide: 'A' | 'B') => {
    const name =
      winnerSide === 'A' ? m.playerA?.displayName : m.playerB?.displayName
    modal.confirm({
      title: '确认弃权？',
      content: `将判 ${name} 胜（walkover），对手直接淘汰，bracket 立即推进下一轮。不可撤销。`,
      okText: '确认',
      okButtonProps: { danger: true },
      onOk: async () => {
        await tournamentMerchantApi.walkover(tournamentId, m.id, winnerSide)
        message.success('已推进')
        onDone()
      }
    })
  }

  const canStart = m.status === 'ready'
  const isInProgress = m.status === 'in_progress' && m.matchId
  const canWalkover =
    (m.status === 'ready' || m.status === 'pending') &&
    (m.playerARegistrationId || m.playerBRegistrationId) &&
    !m.matchId

  const theme = BM_CARD_THEME[m.status] ?? BM_CARD_THEME.pending
  return (
    <Modal
      open={!!m}
      onCancel={onClose}
      footer={null}
      title={`对阵操作 · Round ${m.round} slot ${m.slotInRound + 1}`}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 20,
          padding: 16,
          background: theme.bg,
          border: `1px solid ${theme.border}`,
          borderRadius: 8,
          color: theme.text
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: theme.meta }}>
            {m.playerA?.seed ? `#${m.playerA.seed}` : ''}
          </div>
          <div style={{ fontWeight: 700, color: theme.text }}>
            {m.playerA?.displayName ?? '待定'}
          </div>
        </div>
        <div style={{ alignSelf: 'center', color: theme.meta }}>vs</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: theme.meta }}>
            {m.playerB?.seed ? `#${m.playerB.seed}` : ''}
          </div>
          <div style={{ fontWeight: 700, color: theme.text }}>
            {m.playerB?.displayName ?? '待定'}
          </div>
        </div>
      </div>

      {isInProgress && m.matchId && (
        <Paragraph type="secondary" style={{ marginTop: 16 }}>
          该对阵已开赛（matchId: <code>{m.matchId}</code>）。
          参赛双方用各自手机登录 C 端即可记分；商家大屏可打开观战链接。
        </Paragraph>
      )}

      <Space style={{ marginTop: 16 }} wrap>
        {canStart && (
          <Button type="primary" loading={busy} onClick={handleStart}>
            🚀 开始比赛
          </Button>
        )}
        {isInProgress && m.matchId && (
          <Button
            onClick={() =>
              window.open(
                `http://${window.location.hostname}:3000/#/pages/${gameType === 'nine_ball' ? 'nine-ball' : 'eight-ball'}/index?matchId=${m.matchId}&role=player`,
                '_blank'
              )
            }
          >
            打开记分页（新窗口）
          </Button>
        )}
        {canWalkover && (
          <>
            {m.playerARegistrationId && (
              <Button onClick={() => handleWalkover('A')}>
                判 {m.playerA?.displayName} 胜
              </Button>
            )}
            {m.playerBRegistrationId && (
              <Button onClick={() => handleWalkover('B')}>
                判 {m.playerB?.displayName} 胜
              </Button>
            )}
          </>
        )}
        <Button onClick={onClose}>取消</Button>
      </Space>
    </Modal>
  )
}

// ============ BracketView 子组件 ============

const BM_STATUS: Record<string, { text: string; color: string }> = {
  pending: { text: '待定', color: 'default' },
  ready: { text: '待开', color: 'blue' },
  in_progress: { text: '进行中', color: 'processing' },
  completed: { text: '已完成', color: 'success' },
  walkover: { text: '轮空', color: 'warning' }
}

function ROUND_NAME(round: number, total: number): string {
  if (round === total) return '决赛'
  if (round === total - 1) return '半决赛'
  if (round === total - 2) return '四分之一决赛'
  return `第 ${round} 轮`
}

function BracketView({
  tournament,
  bracket,
  loading,
  onSelect
}: {
  tournament: TournamentItem
  bracket: BracketTree | null
  loading: boolean
  onSelect: (m: BracketMatchItem) => void
}) {
  if (!bracket) {
    if (tournament.status === 'registering') {
      return (
        <Card>
          <Paragraph>
            当前在报名阶段，<strong>停止报名后可开启赛程</strong>。
            赛程将在「开赛」后生成。
          </Paragraph>
        </Card>
      )
    }
    if (tournament.status === 'draft') {
      return (
        <Card>
          <Paragraph>
            赛事尚未发布。发布后进入报名阶段，停止报名后可开启赛程、生成赛程。
          </Paragraph>
        </Card>
      )
    }
    if (tournament.status === 'cancelled') {
      return (
        <Card>
          <Paragraph>赛事已取消，不会生成赛程。</Paragraph>
        </Card>
      )
    }
    return <Card loading={loading} />
  }

  const roundMap = bracket.rounds.reduce<Record<number, BracketMatchItem[]>>(
    (acc, r) => ({ ...acc, [r.round]: r.matches }),
    {}
  )
  const total = bracket.totalRounds

  return (
    <Card
      bodyStyle={{ padding: 16, overflowX: 'auto' }}
      title={
        <Space>
          <span>赛程树</span>
          <Tag>{bracket.rounds[0]?.matches.length ?? 0} 首轮 / {total} 轮</Tag>
          <Tag color="default">点对阵卡 → 开始比赛 / 判负</Tag>
        </Space>
      }
    >
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {Array.from({ length: total }, (_, i) => i + 1).map((round) => {
          const items = roundMap[round] ?? []
          return (
            <div
              key={round}
              style={{
                minWidth: 220,
                display: 'flex',
                flexDirection: 'column',
                gap: 12
              }}
            >
              <div style={{ fontWeight: 600, color: '#d4af37' }}>
                {ROUND_NAME(round, total)}（{items.length}）
              </div>
              {items.map((m) => (
                <BracketMatchCard key={m.id} m={m} onSelect={onSelect} />
              ))}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

/**
 * bracket 卡片配色：按状态区分。浅底 + 深字，确保 admin 默认浅主题下清晰可读。
 */
const BM_CARD_THEME: Record<
  BracketMatchItem['status'],
  { bg: string; border: string; text: string; divider: string; meta: string }
> = {
  pending: {
    bg: '#fafafa',
    border: '#d9d9d9',
    text: '#595959',
    divider: '#e8e8e8',
    meta: '#8c8c8c'
  },
  ready: {
    bg: '#fff7e6', // 黄：待开赛、双方齐
    border: '#ffc069',
    text: '#ad6800',
    divider: '#ffe7ba',
    meta: '#ad6800'
  },
  in_progress: {
    bg: '#e6f4ff', // 蓝：进行中
    border: '#69b1ff',
    text: '#0958d9',
    divider: '#bae0ff',
    meta: '#0958d9'
  },
  completed: {
    bg: '#f6ffed', // 绿：已完成
    border: '#95de64',
    text: '#389e0d',
    divider: '#d9f7be',
    meta: '#389e0d'
  },
  walkover: {
    bg: '#f9f0ff', // 紫：弃权推进（BYE）
    border: '#b37feb',
    text: '#531dab',
    divider: '#efdbff',
    meta: '#531dab'
  }
}

function BracketMatchCard({
  m,
  onSelect
}: {
  m: BracketMatchItem
  onSelect: (m: BracketMatchItem) => void
}) {
  const theme = BM_CARD_THEME[m.status] ?? BM_CARD_THEME.pending
  const row = (
    reg: BracketPlayerRef | null,
    isWinner: boolean
  ) => (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '6px 8px',
        borderRadius: 4,
        background: isWinner ? 'rgba(82,196,26,0.12)' : 'transparent',
        fontWeight: isWinner ? 700 : 500,
        color: reg ? theme.text : theme.meta
      }}
    >
      <span>
        {reg ? (
          <>
            {reg.seed ? (
              <Tag color='default' style={{ marginRight: 4 }}>
                #{reg.seed}
              </Tag>
            ) : null}
            {reg.displayName}
          </>
        ) : m.status === 'walkover' ? (
          'BYE'
        ) : (
          '待定'
        )}
      </span>
      {isWinner ? <span style={{ color: '#389e0d' }}>✓</span> : null}
    </div>
  )
  const clickable =
    m.status === 'ready' ||
    m.status === 'in_progress' ||
    m.status === 'completed' ||
    (m.status === 'pending' &&
      (m.playerARegistrationId || m.playerBRegistrationId))
  return (
    <div
      onClick={() => clickable && onSelect(m)}
      style={{
        border: `${m.status === 'in_progress' ? 1.5 : 1}px solid ${theme.border}`,
        borderRadius: 6,
        padding: 6,
        background: theme.bg,
        cursor: clickable ? 'pointer' : 'default',
        transition: 'all 0.15s',
        boxShadow:
          m.status === 'in_progress'
            ? '0 0 0 2px rgba(105,177,255,0.25)'
            : 'none'
      }}
    >
      {row(
        m.playerA,
        m.winnerRegistrationId === m.playerARegistrationId &&
          !!m.winnerRegistrationId
      )}
      <div style={{ height: 1, background: theme.divider, margin: '2px 0' }} />
      {row(
        m.playerB,
        m.winnerRegistrationId === m.playerBRegistrationId &&
          !!m.winnerRegistrationId
      )}
      <div
        style={{
          marginTop: 4,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11,
          color: theme.meta
        }}
      >
        <span>slot {m.slotInRound + 1}</span>
        <Tag color={BM_STATUS[m.status]?.color} style={{ fontSize: 10 }}>
          {BM_STATUS[m.status]?.text ?? m.status}
        </Tag>
      </div>
    </div>
  )
}
