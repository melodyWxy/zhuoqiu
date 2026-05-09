import { useEffect, useState } from 'react'
import { Button, Card, Form, Input, Space, Table, Tag, Typography } from 'antd'
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { auditApi } from '../api/misc'
import type { AuditLogItem } from '../types'

const { Title, Text } = Typography

export default function Audit() {
  const [form] = Form.useForm()
  const [items, setItems] = useState<AuditLogItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  const fetchData = async (p: Record<string, unknown> = {}) => {
    setLoading(true)
    try {
      const r = await auditApi.list({ page, pageSize, ...p })
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
    fetchData({ ...v, page: 1 })
  }

  return (
    <div>
      <Title level={3}>审计日志</Title>
      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="inline">
          <Form.Item name="action" label="操作类型">
            <Input placeholder="如 user.ban / match.force_end" style={{ width: 220 }} />
          </Form.Item>
          <Form.Item name="targetId" label="目标 ID">
            <Input placeholder="matchId / userId" style={{ width: 200 }} />
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
                  fetchData()
                }}
              >
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card>
        <Table<AuditLogItem>
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
              title: '时间',
              dataIndex: 'createdAt',
              width: 180,
              render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss')
            },
            {
              title: '操作人',
              width: 180,
              render: (_, row) =>
                row.actor ? (
                  <span>
                    {row.actor.name}{' '}
                    <Text type="secondary">({row.actor.username})</Text>
                  </span>
                ) : (
                  row.actorAdminId
                )
            },
            {
              title: '操作',
              dataIndex: 'action',
              width: 200,
              render: (v: string) => <Tag color="blue">{v}</Tag>
            },
            {
              title: '目标',
              width: 220,
              render: (_, row) =>
                row.targetType ? (
                  <span>
                    <Tag>{row.targetType}</Tag>
                    <code>{row.targetId}</code>
                  </span>
                ) : (
                  '—'
                )
            },
            {
              title: '详情',
              render: (_, row) => (
                <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>
                  {JSON.stringify(row.detailJson)}
                </Text>
              )
            },
            { title: 'IP', dataIndex: 'ip', width: 130 }
          ]}
        />
      </Card>
    </div>
  )
}
