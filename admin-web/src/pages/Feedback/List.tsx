import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  Form,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Popconfirm,
  message
} from 'antd'
import { SearchOutlined, ReloadOutlined, CheckOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  feedbackApi,
  type FeedbackItem,
  type FeedbackStatus,
  type FeedbackType
} from '../../api/feedback'

const { Title, Text, Paragraph } = Typography

const TYPE_LABEL: Record<FeedbackType, string> = {
  bug: 'bug 反馈',
  suggestion: '优化建议',
  cooperation: '合作留言'
}
const TYPE_COLOR: Record<FeedbackType, string> = {
  bug: 'red',
  suggestion: 'blue',
  cooperation: 'gold'
}

const STATUS_LABEL: Record<FeedbackStatus, string> = {
  pending: '未处理',
  resolved: '已处理'
}
const STATUS_COLOR: Record<FeedbackStatus, string> = {
  pending: 'orange',
  resolved: 'green'
}

export default function FeedbackList() {
  const [form] = Form.useForm()
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [filters, setFilters] = useState<{
    type?: FeedbackType
    status?: FeedbackStatus
  }>({})

  const fetchData = async (
    overrides: { page?: number; type?: FeedbackType; status?: FeedbackStatus } = {}
  ) => {
    setLoading(true)
    try {
      const r = await feedbackApi.list({
        page: overrides.page ?? page,
        pageSize,
        type: overrides.type ?? filters.type,
        status: overrides.status ?? filters.status
      })
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
    const v = form.getFieldsValue() as {
      type?: FeedbackType
      status?: FeedbackStatus
    }
    setFilters(v)
    setPage(1)
    fetchData({ page: 1, ...v })
  }

  const onResolve = async (id: string) => {
    try {
      await feedbackApi.resolve(id)
      message.success('已标记为已处理')
      fetchData()
    } catch {
      // axios interceptor 处理 toast
    }
  }

  const columns = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 160,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm')
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 110,
      render: (t: FeedbackType) => (
        <Tag color={TYPE_COLOR[t]}>{TYPE_LABEL[t]}</Tag>
      )
    },
    {
      title: '内容',
      dataIndex: 'content',
      render: (c: string) => (
        <Paragraph
          style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}
          ellipsis={{ rows: 2, expandable: true, symbol: '展开' }}
        >
          {c}
        </Paragraph>
      )
    },
    {
      title: '用户',
      width: 220,
      render: (_: unknown, row: FeedbackItem) => {
        if (!row.user) {
          return <Text type="secondary">匿名</Text>
        }
        return (
          <Space direction="vertical" size={0}>
            <Link to={`/users/${row.user.id}`}>{row.user.nickname}</Link>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {row.user.phoneNumber ?? '未绑手机号'}
            </Text>
          </Space>
        )
      }
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s: FeedbackStatus) => (
        <Tag color={STATUS_COLOR[s]}>{STATUS_LABEL[s]}</Tag>
      )
    },
    {
      title: '操作',
      width: 200,
      render: (_: unknown, row: FeedbackItem) => {
        if (row.status === 'resolved') {
          return (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {row.resolvedAt ? dayjs(row.resolvedAt).format('MM-DD HH:mm') : ''}
              {row.resolvedBy ? ` · ${row.resolvedBy}` : ''}
            </Text>
          )
        }
        return (
          <Popconfirm
            title="标记为已处理？"
            okText="确定"
            cancelText="取消"
            onConfirm={() => onResolve(row.id)}
          >
            <Button size="small" type="primary" icon={<CheckOutlined />}>
              标记已处理
            </Button>
          </Popconfirm>
        )
      }
    }
  ]

  return (
    <div>
      <Title level={3}>用户反馈</Title>
      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="inline">
          <Form.Item name="type" label="类型">
            <Select
              allowClear
              placeholder="全部"
              style={{ width: 160 }}
              options={[
                { value: 'bug', label: 'bug 反馈' },
                { value: 'suggestion', label: '优化建议' },
                { value: 'cooperation', label: '合作留言' }
              ]}
            />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              allowClear
              placeholder="全部"
              style={{ width: 140 }}
              options={[
                { value: 'pending', label: '未处理' },
                { value: 'resolved', label: '已处理' }
              ]}
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" icon={<SearchOutlined />} onClick={onSearch}>
                搜索
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  form.resetFields()
                  setFilters({})
                  setPage(1)
                  fetchData({ page: 1, type: undefined, status: undefined })
                }}
              >
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={items}
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          onChange: (p, ps) => {
            setPage(p)
            setPageSize(ps)
          },
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50, 100]
        }}
      />
    </div>
  )
}
