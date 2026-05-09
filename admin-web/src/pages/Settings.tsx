import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  Form,
  InputNumber,
  Space,
  Switch,
  Typography,
  message
} from 'antd'
import { settingsApi } from '../api/misc'
import { useAuthStore } from '../stores/auth'

const { Title, Text } = Typography

interface SettingField {
  key: string
  label: string
  type: 'number' | 'boolean'
  help?: string
}

const FIELDS: SettingField[] = [
  { key: 'match.code_expire_hours', label: '房间码有效时长（小时）', type: 'number' },
  { key: 'match.reconnect_window_sec', label: '参赛者重连窗口（秒）', type: 'number' },
  { key: 'match.zombie_pause_minutes', label: '僵尸房间自动暂停（分钟）', type: 'number' },
  { key: 'match.zombie_end_minutes', label: '僵尸房间自动结束（分钟）', type: 'number' },
  { key: 'match.max_concurrent_per_user', label: '每用户同时在线房间数', type: 'number' },
  { key: 'auth.login_fail_threshold', label: '后台登录失败锁定阈值', type: 'number' },
  { key: 'auth.login_lock_minutes', label: '后台登录锁定时长（分钟）', type: 'number' },
  {
    key: 'auth.require_manual_review_on_signup',
    label: 'C 端新注册需人工审核',
    type: 'boolean'
  }
]

export default function Settings() {
  const role = useAuthStore((s) => s.account?.role)
  const canWrite = role === 'super_admin'
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    settingsApi
      .get()
      .then((v) => form.setFieldsValue(v))
      .finally(() => setLoading(false))
  }, [form])

  const onSave = async () => {
    const values = form.getFieldsValue()
    setSaving(true)
    try {
      await settingsApi.patch(values)
      message.success('已保存')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <Title level={3}>系统设置</Title>
      {!canWrite && (
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          当前角色为 <code>{role}</code>，只能查看。修改需 super_admin。
        </Text>
      )}
      <Card loading={loading}>
        <Form form={form} layout="vertical" disabled={!canWrite}>
          {FIELDS.map((f) => (
            <Form.Item
              key={f.key}
              name={f.key}
              label={f.label}
              help={f.help}
              valuePropName={f.type === 'boolean' ? 'checked' : 'value'}
            >
              {f.type === 'number' ? (
                <InputNumber min={0} style={{ width: 200 }} />
              ) : (
                <Switch />
              )}
            </Form.Item>
          ))}
          <Form.Item>
            <Space>
              <Button
                type="primary"
                loading={saving}
                disabled={!canWrite}
                onClick={onSave}
              >
                保存
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
