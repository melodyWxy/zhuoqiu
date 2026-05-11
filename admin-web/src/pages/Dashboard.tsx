import { useEffect, useState } from 'react'
import { Card, Col, Row, Spin, Statistic, Table, Tag, Typography } from 'antd'
import { ArrowUpOutlined, ArrowDownOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { analyticsApi } from '../api/misc'
import { matchesApi } from '../api/matches'
import type { AnalyticsOverview, MatchListItem, MatchState, MatchType } from '../types'

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

export default function Dashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState<AnalyticsOverview | null>(null)
  const [liveMatches, setLiveMatches] = useState<MatchListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchAll = async () => {
    setRefreshing(true)
    try {
      const [overview, matches] = await Promise.allSettled([
        analyticsApi.overview(),
        matchesApi.list({ state: ['waiting', 'in_progress', 'paused'], pageSize: 50 })
      ])
      if (overview.status === 'fulfilled') setData(overview.value)
      if (matches.status === 'fulfilled') setLiveMatches(matches.value.items)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchAll()
    const t = setInterval(fetchAll, 5000) // 5s 自动刷新
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>
          Dashboard
        </Title>
        <Text type="secondary" style={{ fontSize: 12 }}>
          <ReloadOutlined spin={refreshing} /> 每 5 秒自动刷新
        </Text>
      </div>

      <Spin spinning={loading}>
        <Row gutter={16}>
          <Col span={6}>
            <Card>
              <Statistic title="当前在线房间" value={data?.onlineMatches ?? 0} />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="今日创建房间"
                value={data?.todayCreatedMatches ?? 0}
                suffix={
                  data && data.compareToYesterday.todayCreatedMatches !== 0 ? (
                    <span style={{ fontSize: 14, marginLeft: 8 }}>
                      {data.compareToYesterday.todayCreatedMatches > 0 ? (
                        <span style={{ color: '#3f8600' }}>
                          <ArrowUpOutlined /> {data.compareToYesterday.todayCreatedMatches}
                        </span>
                      ) : (
                        <span style={{ color: '#cf1322' }}>
                          <ArrowDownOutlined /> {Math.abs(data.compareToYesterday.todayCreatedMatches)}
                        </span>
                      )}
                    </span>
                  ) : null
                }
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic title="今日结束" value={data?.todayEndedMatches ?? 0} />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic title="今日新注册" value={data?.todayNewUsers ?? 0} />
            </Card>
          </Col>
        </Row>

        {/* 进行中的房间 —— 直接看到房间码方便运营核对 */}
        <Card
          style={{ marginTop: 16 }}
          title={
            <span>
              进行中 / 等待中的房间{' '}
              <Tag color="processing">{liveMatches.length}</Tag>
            </span>
          }
          extra={
            <a onClick={() => navigate('/matches')}>查看全部房间 →</a>
          }
        >
          {liveMatches.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
              当前没有进行中的房间
            </div>
          ) : (
            <Table<MatchListItem>
              rowKey="id"
              dataSource={liveMatches}
              pagination={false}
              size="small"
              columns={[
                {
                  title: '房间码',
                  dataIndex: 'code',
                  width: 110,
                  render: (code, row) => (
                    <a
                      onClick={() => navigate(`/matches/${row.id}`)}
                      style={{
                        fontFamily: 'SF Mono, Menlo, monospace',
                        fontSize: 16,
                        fontWeight: 700,
                        letterSpacing: 2,
                        color: '#d4af37'
                      }}
                    >
                      {code ?? '—'}
                    </a>
                  )
                },
                {
                  title: '类型',
                  dataIndex: 'type',
                  width: 100,
                  render: (t: MatchType) => TYPE_LABEL[t]
                },
                {
                  title: '房主',
                  render: (_, row) => row.owner?.nickname ?? '—'
                },
                {
                  title: '玩家数',
                  width: 80,
                  render: (_, row) =>
                    `${row.players.filter((p) => p.userId).length}/${row.players.length}`
                },
                {
                  title: '状态',
                  dataIndex: 'state',
                  width: 90,
                  render: (s: MatchState) => (
                    <Tag color={STATE_LABEL[s].color}>{STATE_LABEL[s].text}</Tag>
                  )
                },
                {
                  title: '创建时间',
                  dataIndex: 'createdAt',
                  width: 160,
                  render: (v: string) => dayjs(v).format('HH:mm:ss')
                }
              ]}
            />
          )}
        </Card>

        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col span={6}>
            <Card>
              <Statistic title="在线用户" value={data?.onlineUsers ?? 0} />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="异常房间"
                value={data?.abnormalMatches ?? 0}
                valueStyle={{
                  color: (data?.abnormalMatches ?? 0) > 0 ? '#cf1322' : undefined
                }}
              />
            </Card>
          </Col>
        </Row>
      </Spin>
    </div>
  )
}
