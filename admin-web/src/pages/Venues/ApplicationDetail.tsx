import { useEffect, useState } from 'react'
import {
  App,
  Button,
  Card,
  Descriptions,
  Image,
  Input,
  Modal,
  Space,
  Tag,
  Typography
} from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  venueAdminApi,
  type VenueApplicationItem,
  type VenueApplicationStatus
} from '../../api/venues'

const { Title, Paragraph } = Typography

const STATUS_LABEL: Record<
  VenueApplicationStatus,
  { text: string; color: string }
> = {
  draft: { text: '草稿', color: 'default' },
  pending: { text: '待审核', color: 'processing' },
  approved: { text: '已通过', color: 'success' },
  rejected: { text: '已驳回', color: 'error' }
}

export default function VenueApplicationDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [app, setApp] = useState<VenueApplicationItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const fetchData = async () => {
    if (!id) return
    setLoading(true)
    try {
      const r = await venueAdminApi.detail(id)
      setApp(r)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleApprove = () => {
    if (!id || !app) return
    Modal.confirm({
      title: '确认通过该入驻申请？',
      content: `将创建球房「${app.payloadJson.name}」并绑定申请人为 owner。此操作不可撤销。`,
      okText: '确认通过',
      okButtonProps: { type: 'primary' },
      onOk: async () => {
        await venueAdminApi.approve(id)
        message.success('审核通过，球房已创建')
        fetchData()
      }
    })
  }

  const handleReject = async () => {
    if (!id) return
    if (!rejectReason.trim()) {
      message.warning('请填驳回原因')
      return
    }
    await venueAdminApi.reject(id, rejectReason.trim())
    message.success('已驳回')
    setRejectOpen(false)
    setRejectReason('')
    fetchData()
  }

  if (!app) {
    return <Card loading={loading} />
  }

  const p = app.payloadJson
  const canReview = app.status === 'pending'

  return (
    <div>
      <Space style={{ marginBottom: 16 }} align="center">
        <Button onClick={() => navigate(-1)}>← 返回</Button>
        <Title level={3} style={{ margin: 0 }}>
          {p.name}
        </Title>
        <Tag color={STATUS_LABEL[app.status].color}>
          {STATUS_LABEL[app.status].text}
        </Tag>
        <code style={{ fontSize: 12, color: '#888' }}>{app.id}</code>
      </Space>

      <Card title="基础信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="店名">{p.name}</Descriptions.Item>
          <Descriptions.Item label="联系人">{p.contactName}</Descriptions.Item>
          <Descriptions.Item label="联系电话">{p.contactPhone}</Descriptions.Item>
          <Descriptions.Item label="台桌数">{p.tablesCount}</Descriptions.Item>
          {/* 商家在 picker 里选的省/市/区，单独成行让审核员一眼看出与「详细地址」是否一致 */}
          <Descriptions.Item label="所在地区" span={2}>
            {p.province && p.city && p.district
              ? `${p.province} / ${p.city} / ${p.district}`
              : '— （历史数据，未选）'}
          </Descriptions.Item>
          <Descriptions.Item label="详细地址" span={2}>
            {p.address}
          </Descriptions.Item>
          <Descriptions.Item label="营业时间" span={2}>
            <pre style={{ margin: 0, fontSize: 12 }}>
              {(p.openHours ?? [])
                .map((h) => `${h.day}: ${h.hours}`)
                .join('\n')}
            </pre>
          </Descriptions.Item>
          <Descriptions.Item label="简介" span={2}>
            {p.description || '—'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="资质" style={{ marginBottom: 16 }}>
        <Space size="large" wrap>
          <div>
            <div style={{ marginBottom: 8 }}>营业执照</div>
            {app.licenseImage ? (
              <Image src={app.licenseImage} width={240} />
            ) : (
              <Tag color="warning">未上传</Tag>
            )}
          </div>
          <div>
            <div style={{ marginBottom: 8 }}>身份证（选填）</div>
            {app.idCardImage ? (
              <Image src={app.idCardImage} width={240} />
            ) : (
              <Tag>未上传</Tag>
            )}
          </div>
        </Space>
      </Card>

      <Card title="提交信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="提交来源">
            {app.source === 'c_app' ? 'C 端 app' : '管理后台'}
          </Descriptions.Item>
          <Descriptions.Item label="提交人">
            {app.applicant
              ? `${app.applicant.nickname} · ${app.applicant.phoneNumber}`
              : app.applicantAccountId}
          </Descriptions.Item>
          <Descriptions.Item label="首次提交">
            {dayjs(app.createdAt).format('YYYY-MM-DD HH:mm:ss')}
          </Descriptions.Item>
          <Descriptions.Item label="最近更新">
            {dayjs(app.updatedAt).format('YYYY-MM-DD HH:mm:ss')}
          </Descriptions.Item>
          {app.reviewedAt && (
            <Descriptions.Item label="审核时间" span={2}>
              {dayjs(app.reviewedAt).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
          )}
          {app.rejectReason && (
            <Descriptions.Item label="驳回原因" span={2}>
              <Paragraph type="danger" style={{ margin: 0 }}>
                {app.rejectReason}
              </Paragraph>
            </Descriptions.Item>
          )}
          {app.venueId && (
            <Descriptions.Item label="生成的球房 ID" span={2}>
              <code>{app.venueId}</code>
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {canReview && (
        <Card title="审核">
          <Space>
            <Button type="primary" onClick={handleApprove}>
              ✓ 通过
            </Button>
            <Button danger onClick={() => setRejectOpen(true)}>
              ✗ 驳回
            </Button>
          </Space>
        </Card>
      )}

      <Modal
        title="驳回申请"
        open={rejectOpen}
        onCancel={() => setRejectOpen(false)}
        onOk={handleReject}
        okText="确认驳回"
        okButtonProps={{ danger: true }}
      >
        <Paragraph type="secondary">
          驳回原因会显示给申请人，请具体说明（如"营业执照模糊"）。
        </Paragraph>
        <Input.TextArea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={4}
          placeholder="驳回原因"
          maxLength={1000}
          showCount
        />
      </Modal>
    </div>
  )
}
