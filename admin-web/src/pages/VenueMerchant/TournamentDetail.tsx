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
              />
            )
          }
        ]}
      />
    </div>
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
  loading
}: {
  tournament: TournamentItem
  bracket: BracketTree | null
  loading: boolean
}) {
  if (!bracket) {
    if (
      tournament.status === 'draft' ||
      tournament.status === 'registering' ||
      tournament.status === 'cancelled'
    ) {
      return (
        <Card>
          <Paragraph>
            赛程会在"开赛"后生成。当前状态：{tournament.status}
          </Paragraph>
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
          <Tag color="default">
            图例：● 进行 ✓ 完成 ◌ 待开 ○ 轮空
          </Tag>
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
                <BracketMatchCard key={m.id} m={m} />
              ))}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function BracketMatchCard({ m }: { m: BracketMatchItem }) {
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
        background: isWinner ? 'rgba(74,222,128,0.08)' : 'transparent',
        fontWeight: isWinner ? 600 : 400,
        color: reg ? 'inherit' : '#888'
      }}
    >
      <span>
        {reg ? (
          <>
            {reg.seed ? <Tag>#{reg.seed}</Tag> : null}
            {reg.displayName}
          </>
        ) : m.status === 'walkover' ? (
          'BYE'
        ) : (
          '待定'
        )}
      </span>
      {isWinner ? <span>✓</span> : null}
    </div>
  )
  return (
    <div
      style={{
        border: '1px solid #333',
        borderRadius: 6,
        padding: 6,
        background: '#181c22'
      }}
    >
      {row(m.playerA, m.winnerRegistrationId === m.playerARegistrationId && !!m.winnerRegistrationId)}
      <div style={{ height: 1, background: '#2a2e35', margin: '2px 0' }} />
      {row(m.playerB, m.winnerRegistrationId === m.playerBRegistrationId && !!m.winnerRegistrationId)}
      <div
        style={{
          marginTop: 4,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11,
          color: '#888'
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
