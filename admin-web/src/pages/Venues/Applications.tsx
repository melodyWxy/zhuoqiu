import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  Form,
  Select,
  Space,
  Table,
  Tag,
  Typography
} from 'antd'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  venueAdminApi,
  type VenueApplicationItem,
  type VenueApplicationStatus
} from '../../api/venues'

const { Title } = Typography

const STATUS_LABEL: Record<
  VenueApplicationStatus,
  { text: string; color: string }
> = {
  draft: { text: '草稿', color: 'default' },
  pending: { text: '待审核', color: 'processing' },
  approved: { text: '已通过', color: 'success' },
  rejected: { text: '已驳回', color: 'error' }
}

export default function VenueApplications() {
  const navigate = useNavigate()
  const [form] = Form.useForm<{ status?: VenueApplicationStatus }>()
  const [items, setItems] = useState<VenueApplicationItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [status, setStatus] = useState<VenueApplicationStatus | undefined>(
    'pending'
  )

  const fetchData = async () => {
    setLoading(true)
    try {
      const r = await venueAdminApi.list({ status, page, pageSize })
      setItems(r.items)
      setTotal(r.total)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, status])

  return (
    <div>
      <Title level={3}>球房入驻审核</Title>
      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="inline" initialValues={{ status: 'pending' }}>
          <Form.Item name="status" label="状态">
            <Select
              allowClear
              style={{ width: 140 }}
              options={Object.entries(STATUS_LABEL).map(([v, m]) => ({
                value: v,
                label: m.text
              }))}
              placeholder="全部"
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={() => {
                  setStatus(form.getFieldValue('status'))
                  setPage(1)
                }}
              >
                查询
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  form.resetFields()
                  setStatus(undefined)
                  setPage(1)
                }}
              >
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Table<VenueApplicationItem>
        rowKey="id"
        loading={loading}
        dataSource={items}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          onChange: (p, ps) => {
            setPage(p)
            setPageSize(ps)
          }
        }}
        columns={[
          {
            title: '申请编号',
            dataIndex: 'id',
            width: 180,
            render: (v) => <code style={{ fontSize: 12 }}>{v}</code>
          },
          {
            title: '店名',
            width: 220,
            render: (_, r) => r.payloadJson?.name ?? '-'
          },
          {
            title: '提交人',
            width: 200,
            render: (_, r) =>
              r.applicant
                ? `${r.applicant.nickname} · ${r.applicant.phoneNumber.replace(
                    /(\d{3})\d{4}(\d{4})/,
                    '$1****$2'
                  )}`
                : r.applicantAccountId
          },
          {
            title: '来源',
            dataIndex: 'source',
            width: 100,
            render: (v) => <Tag>{v === 'c_app' ? 'C 端' : 'Admin'}</Tag>
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 100,
            render: (v: VenueApplicationStatus) => (
              <Tag color={STATUS_LABEL[v].color}>{STATUS_LABEL[v].text}</Tag>
            )
          },
          {
            title: '提交时间',
            dataIndex: 'createdAt',
            width: 180,
            render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm')
          },
          {
            title: '操作',
            fixed: 'right',
            width: 100,
            render: (_, r) => (
              <Button
                type="link"
                onClick={() => navigate(`/venue-applications/${r.id}`)}
              >
                查看
              </Button>
            )
          }
        ]}
      />
    </div>
  )
}
