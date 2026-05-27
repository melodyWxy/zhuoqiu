import { useEffect, useState } from 'react'
import {
  Avatar,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography,
  message
} from 'antd'
import { ArrowLeftOutlined, ExclamationCircleFilled } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { usersApi } from '../../api/users'
import type { UserDetail } from '../../types'
import { useAuthStore } from '../../stores/auth'

const { Title, Text } = Typography

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const role = useAuthStore((s) => s.account?.role)
  const [data, setData] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    if (!id) return
    setLoading(true)
    try {
      setData(await usersApi.detail(id))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleBan = () => {
    if (!id) return
    let form: { durationDays: number; reason: string } = {
      durationDays: 7,
      reason: ''
    }
    Modal.confirm({
      title: '封禁用户',
      icon: null,
      content: (
        <Form
          layout="vertical"
          initialValues={{ durationDays: 7 }}
          onValuesChange={(_, v) => {
            form = { ...form, ...v }
          }}
        >
          <Form.Item label="时长（天；0 = 永久）" name="durationDays">
            <InputNumber min={0} max={3650} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="原因" name="reason" rules={[{ required: true }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      ),
      okType: 'danger',
      async onOk() {
        if (!form.reason.trim()) {
          message.error('请填写原因')
          throw new Error('reason required')
        }
        await usersApi.ban(id, form.durationDays, form.reason)
        message.success('已封禁')
        fetchData()
      }
    })
  }

  const handleUnban = () => {
    if (!id) return
    Modal.confirm({
      title: '解除封禁',
      content: '确认解除该用户封禁？',
      async onOk() {
        await usersApi.unban(id, '运营手动解封')
        message.success('已解封')
        fetchData()
      }
    })
  }

  const handleDelete = () => {
    if (!id || !data) return
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
            <Input.TextArea rows={2} placeholder="如：测试账号 / 用户申请注销 / 合规要求" />
          </Form.Item>
          <Form.Item label={`输入用户 id 「${id}」以确认`} name="confirmText">
            <Input placeholder={id} />
          </Form.Item>
        </Form>
      ),
      okType: 'danger',
      okText: '确认删除',
      async onOk() {
        if (confirmText.trim() !== id) {
          message.error('user id 不匹配，已取消')
          throw new Error('confirm mismatch')
        }
        if (!reason.trim()) {
          message.error('请填写删除原因')
          throw new Error('reason required')
        }
        await usersApi.remove(id, reason.trim())
        message.success('已删除')
        navigate('/users')
      }
    })
  }

  if (loading || !data) {
    return (
      <Spin spinning>
        <div style={{ minHeight: 400 }} />
      </Spin>
    )
  }

  const canWrite = role === 'super_admin' || role === 'operator'
  const canDelete = role === 'super_admin'

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          返回
        </Button>
        <Title level={3} style={{ margin: 0 }}>
          用户详情
        </Title>
      </Space>

      <Card style={{ marginBottom: 16 }}>
        <Space size={24} align="start">
          <Avatar size={64}>{data.avatar}</Avatar>
          <div style={{ flex: 1 }}>
            <Title level={4} style={{ margin: 0 }}>
              {data.nickname}
            </Title>
            <Text type="secondary">{data.id}</Text>
            <div style={{ marginTop: 8 }}>
              <Tag color={data.status === 'active' ? 'green' : 'red'}>
                {data.status === 'active' ? '正常' : data.status === 'banned' ? '封禁中' : '已注销'}
              </Tag>
              {data.status === 'banned' && data.banUntil && (
                <Text type="secondary" style={{ marginLeft: 8 }}>
                  解封时间：{dayjs(data.banUntil).format('YYYY-MM-DD HH:mm')}
                </Text>
              )}
            </div>
          </div>
          <Space>
            {data.status === 'active' ? (
              <Button danger disabled={!canWrite} onClick={handleBan}>
                封禁
              </Button>
            ) : data.status === 'banned' ? (
              <Button disabled={!canWrite} onClick={handleUnban}>
                解封
              </Button>
            ) : null}
            <Button danger disabled={!canDelete} onClick={handleDelete}>
              删除
            </Button>
          </Space>
        </Space>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Descriptions column={2} size="small">
          <Descriptions.Item label="手机号">
            {data.phoneNumber ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label="注册来源">{data.primarySource}</Descriptions.Item>
          <Descriptions.Item label="注册时间">
            {dayjs(data.createdAt).format('YYYY-MM-DD HH:mm:ss')}
          </Descriptions.Item>
          <Descriptions.Item label="最近活跃">
            {data.lastActiveAt
              ? dayjs(data.lastActiveAt).format('YYYY-MM-DD HH:mm:ss')
              : '—'}
          </Descriptions.Item>
          {data.banReason && (
            <Descriptions.Item label="封禁原因" span={2}>
              {data.banReason}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Card title="账号关联">
        <Tabs
          items={[
            {
              key: 'wechat',
              label: `微信 (${data.wechatBindings.length})`,
              children: (
                <BindingTable bindings={data.wechatBindings} platform="微信" />
              )
            },
            {
              key: 'douyin',
              label: `抖音 (${data.douyinBindings.length})`,
              children: (
                <BindingTable bindings={data.douyinBindings} platform="抖音" />
              )
            }
          ]}
        />
      </Card>
    </div>
  )
}

function BindingTable({
  bindings,
  platform
}: {
  bindings: UserDetail['wechatBindings']
  platform: string
}) {
  if (bindings.length === 0) {
    return <Text type="secondary">未绑定{platform}</Text>
  }
  return (
    <div>
      {bindings.map((b) => (
        <Descriptions
          key={b.id}
          bordered
          column={1}
          size="small"
          style={{ marginBottom: 12 }}
        >
          <Descriptions.Item label="openId">{b.openId}</Descriptions.Item>
          <Descriptions.Item label="unionId">{b.unionId ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="小程序 appId">{b.mpAppId}</Descriptions.Item>
          <Descriptions.Item label="绑定时间">
            {dayjs(b.bindAt).format('YYYY-MM-DD HH:mm')}
          </Descriptions.Item>
        </Descriptions>
      ))}
    </div>
  )
}
