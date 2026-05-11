import { useEffect, useState } from 'react'
import {
  App,
  Button,
  Card,
  Select,
  Space,
  Table,
  Tag,
  Typography
} from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  tournamentMerchantApi,
  type TournamentItem,
  type TournamentStatus
} from '../../api/venue'

const { Title } = Typography

const STATUS_LABEL: Record<TournamentStatus, { text: string; color: string }> = {
  draft: { text: '草稿', color: 'default' },
  registering: { text: '报名中', color: 'processing' },
  registration_closed: { text: '报名截止', color: 'warning' },
  in_progress: { text: '进行中', color: 'blue' },
  completed: { text: '已结束', color: 'success' },
  cancelled: { text: '已取消', color: 'error' }
}

const FORMAT_LABEL: Record<string, string> = {
  single_elim: '单败淘汰',
  double_elim: '双败淘汰',
  round_robin: '循环赛',
  swiss: '瑞士轮'
}

export default function TournamentsList() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [items, setItems] = useState<TournamentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<TournamentStatus | undefined>()
  const [page, setPage] = useState(1)
  const pageSize = 20

  const fetchData = async () => {
    setLoading(true)
    try {
      const r = await tournamentMerchantApi.list({ status, page, pageSize })
      setItems(r.items)
      setTotal(r.total)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, page])

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Space align="center">
          <Button onClick={() => navigate('/venue/overview')}>←</Button>
          <Title level={3} style={{ margin: 0 }}>
            🏆 赛事管理
          </Title>
        </Space>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => navigate('/venue/tournaments/new')}
        >
          新建赛事
        </Button>
      </Space>

      <Card style={{ margin: '16px 0' }}>
        <Space>
          <span>状态：</span>
          <Select
            style={{ width: 160 }}
            allowClear
            placeholder="全部"
            value={status}
            onChange={(v) => {
              setStatus(v)
              setPage(1)
            }}
            options={Object.entries(STATUS_LABEL).map(([v, m]) => ({
              value: v,
              label: m.text
            }))}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchData}>
            刷新
          </Button>
        </Space>
      </Card>

      <Table<TournamentItem>
        rowKey="id"
        loading={loading}
        dataSource={items}
        pagination={{
          current: page,
          pageSize,
          total,
          onChange: (p) => setPage(p)
        }}
        columns={[
          {
            title: '标题',
            dataIndex: 'title',
            render: (_, r) => (
              <a onClick={() => navigate(`/venue/tournaments/${r.id}`)}>
                {r.title}
              </a>
            )
          },
          {
            title: '项目',
            dataIndex: 'gameType',
            width: 100,
            render: (v) => (v === 'nine_ball' ? '九球' : '中八')
          },
          {
            title: '赛制',
            dataIndex: 'format',
            width: 120,
            render: (v) => FORMAT_LABEL[v] ?? v
          },
          {
            title: '报名',
            width: 120,
            render: (_, r) => `${r.registeredCount} / ${r.maxPlayers}`
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 110,
            render: (v: TournamentStatus) => (
              <Tag color={STATUS_LABEL[v].color}>{STATUS_LABEL[v].text}</Tag>
            )
          },
          {
            title: '开赛时间',
            dataIndex: 'matchStartsAt',
            width: 160,
            render: (v) => dayjs(v).format('MM-DD HH:mm')
          },
          {
            title: '操作',
            fixed: 'right',
            width: 180,
            render: (_, r) => (
              <Space>
                <Button
                  size="small"
                  onClick={() => navigate(`/venue/tournaments/${r.id}`)}
                >
                  查看
                </Button>
                {(r.status === 'draft' || r.status === 'registering') && (
                  <Button
                    size="small"
                    onClick={() => navigate(`/venue/tournaments/${r.id}/edit`)}
                  >
                    编辑
                  </Button>
                )}
              </Space>
            )
          }
        ]}
      />
    </div>
  )
}
