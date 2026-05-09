import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  Descriptions,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  Input,
  message,
  Spin
} from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { matchesApi } from '../../api/matches'
import type {
  MatchDetail,
  MatchEventItem,
  MatchState,
  MatchType
} from '../../types'
import { useAuthStore } from '../../stores/auth'

const { Title, Text } = Typography

const STATE_LABEL: Record<MatchState, { text: string; color: string }> = {
  waiting: { text: '等待中', color: 'default' },
  in_progress: { text: '进行中', color: 'processing' },
  paused: { text: '暂停', color: 'warning' },
  ended: { text: '已结束', color: 'success' },
  dissolved: { text: '已解散', color: 'error' }
}

const TYPE_LABEL: Record<MatchType, string> = {
  nine_ball: '九球追分',
  eight_ball: '中式八球'
}

const EVENT_LABEL: Record<string, string> = {
  score_normal_win: '✅ 普胜',
  score_small_jack: '🏅 小金',
  score_big_jack: '💎 大金',
  score_golden9: '👑 黄金9',
  score_eight_ball_win: '🏆 本局胜',
  foul: '⚠️ 犯规',
  rename: '✏️ 改名',
  pause: '⏸ 暂停',
  resume: '▶ 继续',
  undo: '↩️ 撤销',
  seat_occupy: '🪑 占位',
  seat_leave: '🚶 离位',
  seat_kick: '👮 踢出',
  end: '🏁 结束',
  force_end: '🛑 管理员强制结束',
  force_pause: '⏸ 管理员暂停',
  score_correct: '✏️ 管理员修正'
}

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const role = useAuthStore((s) => s.account?.role)
  const [detail, setDetail] = useState<MatchDetail | null>(null)
  const [events, setEvents] = useState<MatchEventItem[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = async () => {
    if (!id) return
    setLoading(true)
    try {
      const [d, e] = await Promise.all([
        matchesApi.detail(id),
        matchesApi.events(id, 1, 100)
      ])
      setDetail(d)
      setEvents(e.items)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleForcePause = () => {
    if (!id) return
    let reason = ''
    Modal.confirm({
      title: '强制暂停比赛',
      content: (
        <div>
          <p>请填写原因（必填）：</p>
          <Input.TextArea rows={3} onChange={(e) => (reason = e.target.value)} />
        </div>
      ),
      onOk: async () => {
        if (!reason.trim()) {
          message.error('请填写原因')
          throw new Error('reason required')
        }
        await matchesApi.forcePause(id, reason)
        message.success('已暂停')
        fetchAll()
      }
    })
  }

  const handleForceEnd = () => {
    if (!id) return
    let reason = ''
    Modal.confirm({
      title: '强制结束比赛',
      content: (
        <div>
          <p>请填写原因（必填）：</p>
          <Input.TextArea rows={3} onChange={(e) => (reason = e.target.value)} />
        </div>
      ),
      okType: 'danger',
      onOk: async () => {
        if (!reason.trim()) {
          message.error('请填写原因')
          throw new Error('reason required')
        }
        await matchesApi.forceEnd(id, reason)
        message.success('已强制结束')
        fetchAll()
      }
    })
  }

  if (loading || !detail) {
    return (
      <Spin spinning>
        <div style={{ minHeight: 400 }} />
      </Spin>
    )
  }

  const canWrite = role === 'super_admin' || role === 'operator'
  const isLive = detail.state === 'in_progress' || detail.state === 'paused'

  const elapsedSec = computeElapsedSec(detail.timer)

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          返回
        </Button>
        <Title level={3} style={{ margin: 0 }}>
          房间 {detail.code ?? '—'}
        </Title>
        <Tag color={STATE_LABEL[detail.state].color}>{STATE_LABEL[detail.state].text}</Tag>
      </Space>

      <Card style={{ marginBottom: 16 }} title="基本信息">
        <Descriptions column={2} size="small">
          <Descriptions.Item label="ID">{detail.id}</Descriptions.Item>
          <Descriptions.Item label="类型">{TYPE_LABEL[detail.type]}</Descriptions.Item>
          <Descriptions.Item label="房主">
            {detail.owner?.nickname ?? '—'}{' '}
            <Text type="secondary">({detail.ownerUserId})</Text>
          </Descriptions.Item>
          <Descriptions.Item label="计时">{formatElapsed(elapsedSec)}</Descriptions.Item>
          <Descriptions.Item label="规则" span={2}>
            <code>{JSON.stringify(detail.rules)}</code>
          </Descriptions.Item>
          {detail.endedAt && (
            <Descriptions.Item label="结束时间">
              {dayjs(detail.endedAt).format('YYYY-MM-DD HH:mm:ss')}
              {detail.endedReason && (
                <Text type="secondary" style={{ marginLeft: 8 }}>
                  原因：{detail.endedReason}
                </Text>
              )}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Card style={{ marginBottom: 16 }} title="玩家与比分">
        <Table
          rowKey={(r) => `${r.slot}-${r.userId ?? 'empty'}`}
          dataSource={detail.players.filter((p) => p.isCurrent)}
          pagination={false}
          size="small"
          columns={[
            { title: '号位', dataIndex: 'slot', width: 70 },
            { title: '昵称', dataIndex: 'displayName' },
            {
              title: 'userId',
              dataIndex: 'userId',
              render: (v) => v ?? <Text type="secondary">空</Text>
            },
            ...(detail.type === 'nine_ball'
              ? [
                  {
                    title: '分数',
                    render: (_: unknown, row: { slot: number }) => (
                      <Text strong style={{ fontSize: 16 }}>
                        {detail.computed.scores?.[row.slot] ?? 0}
                      </Text>
                    )
                  },
                  {
                    title: '统计',
                    render: (_: unknown, row: { slot: number }) => {
                      const s = detail.computed.stats?.[row.slot]
                      if (!s) return '—'
                      return (
                        <Space size={4} wrap>
                          <Tag>💎×{s.bigJack}</Tag>
                          <Tag>🏅×{s.smallJack}</Tag>
                          <Tag>👑×{s.golden9}</Tag>
                          <Tag>✅×{s.normalWin}</Tag>
                        </Space>
                      )
                    }
                  }
                ]
              : [
                  {
                    title: '胜局',
                    render: (_: unknown, row: { slot: number }) => (
                      <Text strong style={{ fontSize: 18 }}>
                        {detail.computed.wins?.[row.slot] ?? 0}
                      </Text>
                    )
                  }
                ])
          ]}
        />
      </Card>

      <Card
        style={{ marginBottom: 16 }}
        title={`操作日志（${events.length} 条）`}
      >
        <Table<MatchEventItem>
          rowKey="id"
          dataSource={events}
          pagination={false}
          size="small"
          columns={[
            { title: '#', dataIndex: 'serverSeq', width: 50 },
            {
              title: '时间',
              dataIndex: 'createdAt',
              width: 170,
              render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm:ss')
            },
            {
              title: '操作人',
              width: 200,
              render: (_, row) =>
                row.actorAdminId ? (
                  <Tag color="red">管理员 {row.actorAdminId}</Tag>
                ) : (
                  <Text>{row.actorUserId ?? '—'}</Text>
                )
            },
            {
              title: '类型',
              dataIndex: 'type',
              width: 200,
              render: (t: string) => EVENT_LABEL[t] ?? t
            },
            {
              title: '详情',
              render: (_, row) => (
                <Text
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                  type={row.undone ? 'secondary' : undefined}
                  delete={row.undone}
                >
                  {JSON.stringify(row.payloadJson)}
                </Text>
              )
            },
            {
              title: '状态',
              width: 80,
              render: (_, row) =>
                row.undone ? <Tag>已撤销</Tag> : null
            }
          ]}
        />
      </Card>

      <Card title="管理操作">
        <Space>
          <Button
            disabled={!canWrite || !isLive || detail.state !== 'in_progress'}
            onClick={handleForcePause}
          >
            强制暂停
          </Button>
          <Button danger disabled={!canWrite || !isLive} onClick={handleForceEnd}>
            强制结束
          </Button>
        </Space>
        {!canWrite && (
          <Text type="secondary" style={{ marginLeft: 12 }}>
            （只读账号无法操作）
          </Text>
        )}
      </Card>
    </div>
  )
}

function computeElapsedSec(timer: MatchDetail['timer']): number {
  let ms = timer.accumulatedMs
  if (timer.startedAt && !timer.isPaused) {
    ms += Date.now() - new Date(timer.startedAt).getTime()
  }
  return Math.floor(ms / 1000)
}

function formatElapsed(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`
  return `${pad(m)}:${pad(s)}`
}
