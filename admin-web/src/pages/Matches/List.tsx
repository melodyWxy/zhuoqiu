import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography
} from 'antd'
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { matchesApi, ListMatchesParams } from '../../api/matches'
import type { MatchListItem, MatchState, MatchType } from '../../types'
import dayjs from 'dayjs'

const { Title } = Typography

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

export default function MatchesList() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [items, setItems] = useState<MatchListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const fetchData = async (params: ListMatchesParams = {}) => {
    setLoading(true)
    try {
      const r = await matchesApi.list({ page, pageSize, ...params })
      setItems(r.items)
      setTotal(r.total)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize])

  const onSearch = () => {
    const v = form.getFieldsValue()
    setPage(1)
    fetchData({
      page: 1,
      pageSize,
      keyword: v.keyword?.trim() || undefined,
      state: v.state?.length ? v.state : undefined,
      type: v.type || undefined
    })
  }

  const onReset = () => {
    form.resetFields()
    setPage(1)
    fetchData({ page: 1, pageSize })
  }

  return (
    <div>
      <Title level={3}>共享比赛</Title>
      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="inline">
          <Form.Item name="keyword" label="搜索">
            <Input placeholder="房间码 / 房主昵称 / 手机号" style={{ width: 240 }} />
          </Form.Item>
          <Form.Item name="state" label="状态">
            <Select
              mode="multiple"
              style={{ width: 200 }}
              options={Object.entries(STATE_LABEL).map(([v, m]) => ({
                value: v,
                label: m.text
              }))}
              placeholder="全部"
              allowClear
            />
          </Form.Item>
          <Form.Item name="type" label="类型">
            <Select
              style={{ width: 140 }}
              options={Object.entries(TYPE_LABEL).map(([v, l]) => ({
                value: v,
                label: l
              }))}
              placeholder="全部"
              allowClear
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" icon={<SearchOutlined />} onClick={onSearch}>
                搜索
              </Button>
              <Button icon={<ReloadOutlined />} onClick={onReset}>
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card>
        <Table<MatchListItem>
          rowKey="id"
          loading={loading}
          dataSource={items}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => {
              setPage(p)
              setPageSize(ps)
            }
          }}
          columns={[
            {
              title: '房间码',
              dataIndex: 'code',
              width: 110,
              render: (code, row) => (
                <a onClick={() => navigate(`/matches/${row.id}`)}>
                  {code ?? '—'}
                </a>
              )
            },
            {
              title: '类型',
              dataIndex: 'type',
              width: 110,
              render: (t: MatchType) => TYPE_LABEL[t]
            },
            {
              title: '房主',
              dataIndex: ['owner', 'nickname'],
              render: (_, row) =>
                row.owner ? (
                  <span>
                    {row.owner.nickname}
                    {row.owner.phoneNumber && (
                      <Typography.Text
                        type="secondary"
                        style={{ marginLeft: 8, fontSize: 12 }}
                      >
                        {maskPhone(row.owner.phoneNumber)}
                      </Typography.Text>
                    )}
                  </span>
                ) : (
                  '—'
                )
            },
            {
              title: '玩家',
              dataIndex: 'players',
              render: (players: MatchListItem['players']) =>
                `${players.filter((p) => p.userId).length}/${players.length}`
            },
            {
              title: '状态',
              dataIndex: 'state',
              width: 110,
              render: (s: MatchState) => (
                <Tag color={STATE_LABEL[s].color}>{STATE_LABEL[s].text}</Tag>
              )
            },
            {
              title: '创建时间',
              dataIndex: 'createdAt',
              width: 170,
              render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss')
            },
            {
              title: '操作',
              width: 100,
              render: (_, row) => (
                <Button type="link" onClick={() => navigate(`/matches/${row.id}`)}>
                  查看
                </Button>
              )
            }
          ]}
        />
      </Card>
    </div>
  )
}

function maskPhone(p: string) {
  return p.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
}
