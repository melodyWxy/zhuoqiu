import { useEffect, useState } from 'react'
import {
  Avatar,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message
} from 'antd'
import { SearchOutlined, ReloadOutlined, ExclamationCircleFilled } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { usersApi, ListUsersParams } from '../../api/users'
import type { UserListItem, UserStatus } from '../../types'
import { useAuthStore } from '../../stores/auth'

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
  const role = useAuthStore((s) => s.account?.role)
  const canWrite = role === 'super_admin' || role === 'operator'
  const canDelete = role === 'super_admin'

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

  const handleDisable = (row: UserListItem) => {
    Modal.confirm({
      title: '禁用用户',
      content: `确认禁用用户「${row.nickname}」（${row.id}）？禁用后将无法再使用联机/参赛等功能。`,
      okType: 'danger',
      okText: '禁用',
      async onOk() {
        await usersApi.ban(row.id, 0, '管理员禁用')
        message.success('已禁用')
        fetchData()
      }
    })
  }

  const handleEnable = (row: UserListItem) => {
    Modal.confirm({
      title: '启用用户',
      content: `确认将用户「${row.nickname}」恢复为正常状态？`,
      async onOk() {
        await usersApi.unban(row.id, '管理员启用')
        message.success('已启用')
        fetchData()
      }
    })
  }

  const handleDelete = (row: UserListItem) => {
    let reason = ''
    let confirmText = ''
    Modal.confirm({
      title: '删除用户（不可恢复）',
      icon: <ExclamationCircleFilled style={{ color: '#ff4d4f' }} />,
      width: 520,
      content: (
        <Form
          layout="vertical"
          onValuesChange={(_, v) => {
            reason = v.reason ?? reason
            confirmText = v.confirmText ?? confirmText
          }}
        >
          <Typography.Paragraph type="warning" style={{ marginTop: 0 }}>
            将真删 user 行 + 微信/抖音绑定 + 验证码 + 赛事报名记录；
            历史比赛保留但匿名化（参与方/事件作者置 null，比赛归属转给系统占位账号）。
            <br />
            操作不可恢复，仅 super_admin 可执行。
          </Typography.Paragraph>
          <Form.Item label="删除原因（必填）" name="reason">
            <Input.TextArea rows={2} placeholder={`如：测试账号 / 用户申请注销 / 合规要求`} />
          </Form.Item>
          <Form.Item label={`输入用户 id 「${row.id}」以确认`} name="confirmText">
            <Input placeholder={row.id} />
          </Form.Item>
        </Form>
      ),
      okType: 'danger',
      okText: '确认删除',
      async onOk() {
        if (confirmText.trim() !== row.id) {
          message.error('user id 不匹配，已取消')
          throw new Error('confirm mismatch')
        }
        if (!reason.trim()) {
          message.error('请填写删除原因')
          throw new Error('reason required')
        }
        await usersApi.remove(row.id, reason.trim())
        message.success('已删除')
        fetchData()
      }
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
            },
            {
              title: '操作',
              key: 'actions',
              width: 200,
              fixed: 'right',
              render: (_: unknown, row: UserListItem) => (
                <Space size={4}>
                  {row.status === 'active' ? (
                    <Button
                      size="small"
                      danger
                      disabled={!canWrite}
                      onClick={() => handleDisable(row)}
                    >
                      禁用
                    </Button>
                  ) : row.status === 'banned' ? (
                    <Button
                      size="small"
                      type="primary"
                      disabled={!canWrite}
                      onClick={() => handleEnable(row)}
                    >
                      启用
                    </Button>
                  ) : null}
                  <Button
                    size="small"
                    danger
                    disabled={!canDelete}
                    onClick={() => handleDelete(row)}
                  >
                    删除
                  </Button>
                </Space>
              )
            }
          ]}
        />
      </Card>
    </div>
  )
}
