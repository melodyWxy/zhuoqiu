import { useEffect, useState } from 'react'
import { Card, Col, Row, Spin, Statistic, Typography } from 'antd'
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons'
import { analyticsApi } from '../api/misc'
import type { AnalyticsOverview } from '../types'

const { Title } = Typography

export default function Dashboard() {
  const [data, setData] = useState<AnalyticsOverview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    analyticsApi
      .overview()
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        Dashboard
      </Title>
      <Spin spinning={loading}>
        <Row gutter={16}>
          <Col span={6}>
            <Card>
              <Statistic title="当前在线房间" value={data?.onlineMatches ?? 0} />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="今日创建房间"
                value={data?.todayCreatedMatches ?? 0}
                suffix={
                  data && data.compareToYesterday.todayCreatedMatches !== 0 ? (
                    <span style={{ fontSize: 14, marginLeft: 8 }}>
                      {data.compareToYesterday.todayCreatedMatches > 0 ? (
                        <span style={{ color: '#3f8600' }}>
                          <ArrowUpOutlined /> {data.compareToYesterday.todayCreatedMatches}
                        </span>
                      ) : (
                        <span style={{ color: '#cf1322' }}>
                          <ArrowDownOutlined /> {Math.abs(data.compareToYesterday.todayCreatedMatches)}
                        </span>
                      )}
                    </span>
                  ) : null
                }
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic title="今日结束" value={data?.todayEndedMatches ?? 0} />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic title="今日新注册" value={data?.todayNewUsers ?? 0} />
            </Card>
          </Col>
        </Row>

        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col span={6}>
            <Card>
              <Statistic title="在线用户" value={data?.onlineUsers ?? 0} />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="异常房间"
                value={data?.abnormalMatches ?? 0}
                valueStyle={{
                  color: (data?.abnormalMatches ?? 0) > 0 ? '#cf1322' : undefined
                }}
              />
            </Card>
          </Col>
        </Row>

        <Card style={{ marginTop: 16 }}>
          <Typography.Text type="secondary">
            详细趋势图（近 7 天）：MVP 阶段暂用占位，后续接 `/admin/analytics/matches` 和
            `/admin/analytics/users` 接口。
          </Typography.Text>
        </Card>
      </Spin>
    </div>
  )
}
