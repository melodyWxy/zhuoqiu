import { useEffect, useState } from 'react'
import {
  Avatar,
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
import dayjs from 'dayjs'
import { usersApi, ListUsersParams } from '../../api/users'
import type { UserListItem, UserStatus } from '../../types'

const { Title } = Typography

const STATUS_LABEL: Record<UserStatus, { text: string; color: string }> = {
  active: { text: '正常', color: 'success' },
  banned: { text: '封禁', color: 'error' },
  deleted: { text: '已注销', color: 'default' }
}

export default function UsersList() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [items, setItems] = useState<UserListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const fetchData = async (p: ListUsersParams = {}) => {
    setLoading(true)
    try {
      const r = await usersApi.list({ page, pageSize, ...p })
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
      status: v.status || undefined
    })
  }

  return (
    <div>
      <Title level={3}>用户管理</Title>
      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="inline">
          <Form.Item name="keyword" label="搜索">
            <Input placeholder="昵称 / 手机号 / userId" style={{ width: 240 }} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              style={{ width: 120 }}
              options={Object.entries(STATUS_LABEL).map(([v, m]) => ({
                value: v,
                label: m.text
              }))}
              allowClear
              placeholder="全部"
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
                  setPage(1)
                  fetchData({ page: 1, pageSize })
                }}
              >
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card>
        <Table<UserListItem>
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
              title: '头像',
              dataIndex: 'avatar',
              width: 60,
              render: (a: string) => <Avatar>{a}</Avatar>
            },
            {
              title: '昵称',
              dataIndex: 'nickname',
              render: (n, row) => (
                <a onClick={() => navigate(`/users/${row.id}`)}>{n}</a>
              )
            },
            {
              title: '手机号',
              dataIndex: 'phoneNumber',
              render: (v: string | null) =>
                v ? v.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '—'
            },
            {
              title: '注册来源',
              dataIndex: 'primarySource',
              width: 100
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 100,
              render: (s: UserStatus) => (
                <Tag color={STATUS_LABEL[s].color}>{STATUS_LABEL[s].text}</Tag>
              )
            },
            {
              title: '注册时间',
              dataIndex: 'createdAt',
              width: 170,
              render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm')
            },
            {
              title: '最近活跃',
              dataIndex: 'lastActiveAt',
              width: 170,
              render: (v: string | null) =>
                v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—'
            }
          ]}
        />
      </Card>
    </div>
  )
}
