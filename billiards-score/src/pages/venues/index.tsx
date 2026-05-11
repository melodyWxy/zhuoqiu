import { View, Text, Input, Image } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { venuesPublicApi, type VenuePublic } from '../../core/api/venue'
import PageHeader from '../../components/PageHeader'
import './index.scss'

export default function VenuesPage() {
  const [keyword, setKeyword] = useState('')
  const [items, setItems] = useState<VenuePublic[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)

  const fetchData = async (kw?: string) => {
    setLoading(true)
    try {
      const r = await venuesPublicApi.list({ keyword: kw, pageSize: 50 })
      setItems(r.items)
      setTotal(r.total)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  usePullDownRefresh(async () => {
    await fetchData(keyword.trim() || undefined)
    Taro.stopPullDownRefresh()
  })

  const handleSearch = () => {
    fetchData(keyword.trim() || undefined)
  }

  const goDetail = (id: string) => {
    Taro.navigateTo({ url: `/pages/venue-detail/index?id=${id}` })
  }

  return (
    <View className='venues-page'>
      <PageHeader title='发现球房' />

      <View className='vp-search'>
        <Input
          className='vp-search-input'
          value={keyword}
          placeholder='搜索店名 / 地址'
          onInput={(e) => setKeyword(e.detail.value)}
          onConfirm={handleSearch}
        />
        <View className='vp-search-btn' onClick={handleSearch}>
          搜索
        </View>
      </View>

      <View className='vp-meta'>共 {total} 家球房</View>

      {loading ? (
        <View className='vp-empty'>加载中…</View>
      ) : items.length === 0 ? (
        <View className='vp-empty'>暂无球房</View>
      ) : (
        <View className='vp-list'>
          {items.map((v) => (
            <View
              key={v.id}
              className='vp-card'
              onClick={() => goDetail(v.id)}
            >
              {v.coverImage ? (
                <Image
                  className='vp-cover'
                  src={v.coverImage}
                  mode='aspectFill'
                />
              ) : (
                <View className='vp-cover vp-cover-default'>
                  <Text className='vp-cover-emoji'>🎱</Text>
                </View>
              )}
              <View className='vp-card-body'>
                <View className='vp-name-row'>
                  <Text className='vp-name'>{v.name}</Text>
                  <Text className='vp-tag'>已认证</Text>
                </View>
                <Text className='vp-address'>{v.address}</Text>
                <View className='vp-info-row'>
                  <Text className='vp-info'>🎱 {v.tablesCount} 张台桌</Text>
                  {v.openHoursJson?.mon && (
                    <Text className='vp-info'>🕙 {v.openHoursJson.mon}</Text>
                  )}
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
