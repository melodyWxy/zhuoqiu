import { View, Text, Image } from '@tarojs/components'
import Taro, { useRouter, useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import {
  tournamentsPublicApi,
  venuesPublicApi,
  type TournamentItem,
  type VenuePublic
} from '../../core/api/venue'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import LoadingState from '../../components/LoadingState'
import { buildVenueShare, buildVenueTimelineShare } from '../../utils/share'
import './index.scss'

const DAY_LABEL: Record<string, string> = {
  mon: '周一',
  tue: '周二',
  wed: '周三',
  thu: '周四',
  fri: '周五',
  sat: '周六',
  sun: '周日'
}
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export default function VenueDetailPage() {
  const router = useRouter()
  const id = (router.params.id as string) || ''
  const [venue, setVenue] = useState<VenuePublic | null>(null)
  const [tournaments, setTournaments] = useState<TournamentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /** 分享给好友 / 朋友圈 —— venue 加载完才能给真实标题，未加载时给兜底 */
  useShareAppMessage(() => {
    if (venue) {
      return buildVenueShare({
        id: venue.id,
        name: venue.name,
        city: venue.city,
        coverImage: venue.coverImage
      })
    }
    return { title: '球房 · 击球帮', path: `/pages/venue-detail/index?id=${id}` }
  })

  useShareTimeline(() => {
    if (venue) {
      return buildVenueTimelineShare({
        id: venue.id,
        name: venue.name,
        city: venue.city,
        coverImage: venue.coverImage
      })
    }
    return { title: '球房 · 击球帮' }
  })

  useEffect(() => {
    if (!id) {
      setError('缺少 id 参数')
      setLoading(false)
      return
    }
    ;(async () => {
      try {
        const r = await venuesPublicApi.detail(id)
        setVenue(r.venue)
        // 拉该球房的进行中/报名中赛事（取前 5 条）
        const list = await tournamentsPublicApi.list({
          venueId: id,
          pageSize: 5
        })
        const active = list.items.filter(
          (t) =>
            t.status === 'registering' ||
            t.status === 'registration_closed' ||
            t.status === 'in_progress'
        )
        setTournaments(active)
      } catch (e) {
        const err = e as { code?: number; message?: string }
        setError(err.code === 60001 ? '球房不存在或已停用' : err.message ?? '加载失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  const handleCall = () => {
    if (!venue) return
    Taro.makePhoneCall({ phoneNumber: venue.phone }).catch(() => {
      Taro.setClipboardData({ data: venue.phone }).then(() =>
        Taro.showToast({ title: '电话已复制', icon: 'none' })
      )
    })
  }

  const fullAddress = venue
    ? `${venue.province ?? ''}${venue.city ?? ''}${venue.district ?? ''}${venue.address}`
    : ''

  const handleCopyAddress = () => {
    if (!venue) return
    Taro.setClipboardData({ data: fullAddress }).then(() =>
      Taro.showToast({ title: '地址已复制', icon: 'none' })
    )
  }

  if (loading) {
    return <LoadingState text='正在加载球房' />
  }
  if (error || !venue) {
    return (
      <EmptyState
        icon='⚠️'
        title='球房不存在'
        description={error ?? '可能链接已失效，回到球房列表换一个吧'}
      />
    )
  }

  const hours = venue.openHoursJson ?? {}
  const allSame = DAYS.every((d) => hours[d] === hours.mon)

  return (
    <View className='venue-detail-page'>
      <PageHeader title={venue.name} />
      <View className='vd-cover'>
        {venue.coverImage ? (
          <Image
            className='vd-cover-img'
            src={venue.coverImage}
            mode='aspectFill'
          />
        ) : (
          <View className='vd-cover-default'>
            <Text className='vd-cover-emoji'>🎱</Text>
          </View>
        )}
      </View>

      <View className='vd-info-card'>
        <View className='vd-name-row'>
          <Text className='vd-name'>{venue.name}</Text>
          <Text className='vd-tag'>已认证</Text>
        </View>
        <View className='vd-meta-row' onClick={handleCopyAddress}>
          <Text className='vd-icon'>📍</Text>
          <Text className='vd-meta-text'>{fullAddress}</Text>
        </View>
        <View className='vd-meta-row' onClick={handleCall}>
          <Text className='vd-icon'>☎️</Text>
          <Text className='vd-meta-text'>{venue.phone}</Text>
        </View>
        <View className='vd-meta-row'>
          <Text className='vd-icon'>🎱</Text>
          <Text className='vd-meta-text'>{venue.tablesCount} 张台桌</Text>
        </View>

        <View className='vd-actions'>
          <View className='vd-action-btn' onClick={handleCall}>
            ☎️ 拨打
          </View>
          <View className='vd-action-btn' onClick={handleCopyAddress}>
            📋 复制地址
          </View>
        </View>
      </View>

      <View className='vd-card'>
        <Text className='vd-section-title'>营业时间</Text>
        {allSame ? (
          <Text className='vd-hours-line'>
            每天 · {hours.mon ?? '—'}
          </Text>
        ) : (
          <View className='vd-hours-list'>
            {DAYS.map((d) => (
              <View key={d} className='vd-hours-row'>
                <Text className='vd-hours-day'>{DAY_LABEL[d]}</Text>
                <Text className='vd-hours-val'>{hours[d] ?? '—'}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {venue.description && (
        <View className='vd-card'>
          <Text className='vd-section-title'>店铺简介</Text>
          <Text className='vd-desc'>{venue.description}</Text>
        </View>
      )}

      <View className='vd-card'>
        <Text className='vd-section-title'>赛事</Text>
        {tournaments.length === 0 ? (
          <Text className='vd-soon'>暂无进行中/报名中的赛事</Text>
        ) : (
          tournaments.map((t) => (
            <View
              key={t.id}
              className='vd-tournament-row'
              onClick={() =>
                Taro.navigateTo({
                  url: `/pages/tournament-detail/index?id=${t.id}`
                })
              }
            >
              <View className='vd-tournament-body'>
                <Text className='vd-tournament-title'>🏆 {t.title}</Text>
                <Text className='vd-tournament-sub'>
                  {t.gameType === 'nine_ball' ? '九球' : '中八'} ·{' '}
                  {t.registeredCount}/{t.maxPlayers} ·{' '}
                  {t.status === 'registering'
                    ? '报名中'
                    : t.status === 'in_progress'
                      ? '进行中'
                      : '报名截止'}
                </Text>
              </View>
              <Text className='vd-tournament-arrow'>→</Text>
            </View>
          ))
        )}
      </View>

      <View className='vd-card'>
        <Text className='vd-section-title'>本月排行</Text>
        <Text className='vd-soon'>v2.11 上线</Text>
      </View>
    </View>
  )
}
