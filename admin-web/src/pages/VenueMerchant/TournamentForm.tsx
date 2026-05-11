import { useEffect, useState } from 'react'
import {
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  Space,
  Typography
} from 'antd'
import dayjs, { Dayjs } from 'dayjs'
import { useNavigate, useParams } from 'react-router-dom'
import {
  tournamentMerchantApi,
  type CreateTournamentPayload,
  type TournamentFormat
} from '../../api/venue'

const { Title, Paragraph } = Typography
const { RangePicker } = DatePicker

interface FormValues {
  title: string
  gameType: 'nine_ball' | 'eight_ball'
  format: TournamentFormat
  maxPlayers: number
  minPlayers: number
  entryFeeYuan?: number
  prizePoolText?: string
  regWindow: [Dayjs, Dayjs]
  matchStartsAt: Dayjs
  noticeText?: string
  // nine ball rules
  normalWin: number
  smallJack: number
  bigJack: number
  golden9: number
  // eight ball rules
  targetWins: number
}

export default function TournamentForm() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [gameType, setGameType] = useState<'nine_ball' | 'eight_ball'>('nine_ball')
  const isEdit = !!id

  useEffect(() => {
    if (!isEdit) {
      // 新建默认值
      const now = dayjs()
      form.setFieldsValue({
        gameType: 'nine_ball',
        format: 'single_elim',
        maxPlayers: 16,
        minPlayers: 4,
        normalWin: 4,
        smallJack: 7,
        bigJack: 10,
        golden9: 4,
        targetWins: 5,
        regWindow: [now, now.add(3, 'day')],
        matchStartsAt: now.add(3, 'day').hour(19).minute(0).second(0)
      })
      return
    }
    setLoading(true)
    ;(async () => {
      try {
        const r = await tournamentMerchantApi.detail(id!)
        const t = r.tournament
        setGameType(t.gameType)
        const rules = t.rulesJson as Record<string, number>
        form.setFieldsValue({
          title: t.title,
          gameType: t.gameType,
          format: t.format,
          maxPlayers: t.maxPlayers,
          minPlayers: t.minPlayers,
          entryFeeYuan: t.entryFeeCents ? t.entryFeeCents / 100 : undefined,
          prizePoolText: t.prizePoolText ?? undefined,
          regWindow: [
            dayjs(t.registrationStartsAt),
            dayjs(t.registrationEndsAt)
          ],
          matchStartsAt: dayjs(t.matchStartsAt),
          normalWin: rules?.normalWin ?? 4,
          smallJack: rules?.smallJack ?? 7,
          bigJack: rules?.bigJack ?? 10,
          golden9: rules?.golden9 ?? 4,
          targetWins: rules?.targetWins ?? 5
        })
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, id])

  const onFinish = async (v: FormValues) => {
    const rules: Record<string, number> =
      v.gameType === 'nine_ball'
        ? {
            normalWin: v.normalWin,
            smallJack: v.smallJack,
            bigJack: v.bigJack,
            golden9: v.golden9
          }
        : { targetWins: v.targetWins }
    const payload: CreateTournamentPayload = {
      title: v.title,
      gameType: v.gameType,
      format: v.format,
      rules,
      maxPlayers: v.maxPlayers,
      minPlayers: v.minPlayers,
      entryFeeCents: v.entryFeeYuan ? Math.round(v.entryFeeYuan * 100) : 0,
      prizePoolText: v.prizePoolText,
      registrationStartsAt: v.regWindow[0].toISOString(),
      registrationEndsAt: v.regWindow[1].toISOString(),
      matchStartsAt: v.matchStartsAt.toISOString(),
      noticeText: v.noticeText
    }
    setSaving(true)
    try {
      const r = isEdit
        ? await tournamentMerchantApi.update(id!, payload)
        : await tournamentMerchantApi.create(payload)
      message.success(isEdit ? '已保存' : '赛事已创建（草稿）')
      navigate(`/venue/tournaments/${r.tournament.id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <Space style={{ marginBottom: 16 }} align="center">
        <Button onClick={() => navigate('/venue/tournaments')}>← 返回</Button>
        <Title level={3} style={{ margin: 0 }}>
          {isEdit ? '编辑赛事' : '新建赛事'}
        </Title>
      </Space>
      <Card loading={loading}>
        <Paragraph type="secondary">
          创建后进入草稿态。发布按钮在赛事详情页；未发布的赛事 C 端看不到。
        </Paragraph>
        <Form<FormValues> form={form} layout="vertical" onFinish={onFinish}>
          <Title level={5}>基础信息</Title>
          <Form.Item
            label="赛事标题"
            name="title"
            rules={[{ required: true, min: 2, max: 128 }]}
          >
            <Input placeholder="如：五一擂台赛" />
          </Form.Item>
          <Form.Item
            label="项目"
            name="gameType"
            rules={[{ required: true }]}
          >
            <Radio.Group onChange={(e) => setGameType(e.target.value)}>
              <Radio value="nine_ball">九球追分</Radio>
              <Radio value="eight_ball">中式八球</Radio>
            </Radio.Group>
          </Form.Item>

          <Title level={5}>赛制</Title>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item
              label="赛制"
              name="format"
              rules={[{ required: true }]}
              style={{ minWidth: 200 }}
            >
              <Select
                options={[
                  { value: 'single_elim', label: '单败淘汰' },
                  { value: 'double_elim', label: '双败（v2.11）', disabled: true },
                  { value: 'round_robin', label: '循环赛（v2.11）', disabled: true },
                  { value: 'swiss', label: '瑞士轮（v2.11）', disabled: true }
                ]}
              />
            </Form.Item>
            <Form.Item
              label="人数上限"
              name="maxPlayers"
              rules={[{ required: true, type: 'number', min: 2, max: 128 }]}
            >
              <Select
                options={[8, 16, 32, 64].map((n) => ({ value: n, label: String(n) }))}
              />
            </Form.Item>
            <Form.Item
              label="人数下限"
              name="minPlayers"
              rules={[{ required: true, type: 'number', min: 2, max: 128 }]}
            >
              <InputNumber min={2} max={128} />
            </Form.Item>
          </Space>

          <Title level={5}>规则</Title>
          {gameType === 'nine_ball' ? (
            <Space wrap>
              <Form.Item label="普胜得分" name="normalWin" rules={[{ required: true }]}>
                <InputNumber min={0} max={100} />
              </Form.Item>
              <Form.Item label="小金得分" name="smallJack" rules={[{ required: true }]}>
                <InputNumber min={0} max={100} />
              </Form.Item>
              <Form.Item label="大金得分" name="bigJack" rules={[{ required: true }]}>
                <InputNumber min={0} max={100} />
              </Form.Item>
              <Form.Item label="黄金 9 得分" name="golden9" rules={[{ required: true }]}>
                <InputNumber min={0} max={100} />
              </Form.Item>
            </Space>
          ) : (
            <Form.Item
              label="抢几局"
              name="targetWins"
              rules={[{ required: true, type: 'number', min: 1, max: 99 }]}
            >
              <InputNumber min={1} max={99} />
            </Form.Item>
          )}

          <Title level={5}>时间</Title>
          <Form.Item
            label="报名期（开始 ~ 截止）"
            name="regWindow"
            rules={[{ required: true }]}
          >
            <RangePicker showTime format="YYYY-MM-DD HH:mm" />
          </Form.Item>
          <Form.Item
            label="开赛时间"
            name="matchStartsAt"
            rules={[{ required: true }]}
          >
            <DatePicker showTime format="YYYY-MM-DD HH:mm" />
          </Form.Item>

          <Title level={5}>费用 & 奖励（信息展示，平台不经手）</Title>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item label="报名费（元）" name="entryFeeYuan">
              <InputNumber min={0} max={9999} />
            </Form.Item>
            <Form.Item
              label="奖励描述"
              name="prizePoolText"
              style={{ flex: 1, minWidth: 300 }}
            >
              <Input placeholder="如：冠军 500 元 + 3 小时券" />
            </Form.Item>
          </Space>

          <Form.Item label="报名须知" name="noticeText">
            <Input.TextArea rows={3} maxLength={2000} showCount />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={saving}>
                {isEdit ? '保存' : '创建（草稿）'}
              </Button>
              <Button onClick={() => navigate('/venue/tournaments')}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
