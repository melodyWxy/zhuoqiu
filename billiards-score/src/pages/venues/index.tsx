import { View, Text, Input, Image, Picker } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import { venuesPublicApi, type VenuePublic } from '../../core/api/venue'
import { useRegions } from '../../hooks/useRegions'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import LoadingState from '../../components/LoadingState'
import './index.scss'

interface Filter {
  keyword: string
  province: string
  city: string
  district: string
}

const EMPTY_FILTER: Filter = {
  keyword: '',
  province: '',
  city: '',
  district: ''
}

export default function VenuesPage() {
  const [filter, setFilter] = useState<Filter>(EMPTY_FILTER)
  const [items, setItems] = useState<VenuePublic[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const { tree: regionTree } = useRegions()

  const cityList = useMemo(
    () => regionTree.find((p) => p.name === filter.province)?.children ?? [],
    [regionTree, filter.province]
  )
  const districtList = useMemo(
    () => cityList.find((c) => c.name === filter.city)?.children ?? [],
    [cityList, filter.city]
  )

  const fetchData = async (f: Filter) => {
    setLoading(true)
    try {
      const r = await venuesPublicApi.list({
        keyword: f.keyword.trim() || undefined,
        province: f.province || undefined,
        city: f.city || undefined,
        district: f.district || undefined,
        pageSize: 50
      })
      setItems(r.items)
      setTotal(r.total)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData(EMPTY_FILTER)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 地区一变就立刻重查；keyword 改动靠搜索按钮 / 回车，避免每次输入都打接口
  useEffect(() => {
    fetchData(filter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.province, filter.city, filter.district])

  usePullDownRefresh(async () => {
    await fetchData(filter)
    Taro.stopPullDownRefresh()
  })

  const handleKeywordChange = (e: { detail: { value: string } }) =>
    setFilter((f) => ({ ...f, keyword: e.detail.value }))

  const handleSearch = () => fetchData(filter)

  const handleClear = () => {
    setFilter(EMPTY_FILTER)
    fetchData(EMPTY_FILTER)
  }

  const goDetail = (id: string) => {
    Taro.navigateTo({ url: `/pages/venue-detail/index?id=${id}` })
  }

  const hasFilter =
    !!filter.keyword || !!filter.province || !!filter.city || !!filter.district

  return (
    <View className='venues-page'>
      <PageHeader title='发现球房' />

      <View className='vp-search'>
        <Input
          className='vp-search-input'
          value={filter.keyword}
          placeholder='搜索店名 / 地址'
          onInput={handleKeywordChange}
          onConfirm={handleSearch}
        />
        <View className='vp-search-btn' onClick={handleSearch}>
          搜索
        </View>
      </View>

      <View className='vp-region-row'>
        <Picker
          mode='selector'
          range={regionTree.map((p) => p.name)}
          disabled={regionTree.length === 0}
          onChange={(e) => {
            const i = Number(e.detail.value)
            const p = regionTree[i]
            if (!p) return
            setFilter((s) => ({ ...s, province: p.name, city: '', district: '' }))
          }}
        >
          <View className={`vp-region-cell${regionTree.length === 0 ? ' is-disabled' : ''}`}>
            <Text className='vp-region-text'>{filter.province || '全国'}</Text>
            <Text className='vp-region-arrow'>▾</Text>
          </View>
        </Picker>
        <Picker
          mode='selector'
          range={cityList.map((c) => c.name)}
          disabled={cityList.length === 0}
          onChange={(e) => {
            const i = Number(e.detail.value)
            const c = cityList[i]
            if (!c) return
            setFilter((s) => ({ ...s, city: c.name, district: '' }))
          }}
        >
          <View className={`vp-region-cell${cityList.length === 0 ? ' is-disabled' : ''}`}>
            <Text className='vp-region-text'>
              {filter.city || (filter.province ? '全部市' : '市')}
            </Text>
            <Text className='vp-region-arrow'>▾</Text>
          </View>
        </Picker>
        <Picker
          mode='selector'
          range={districtList.map((d) => d.name)}
          disabled={districtList.length === 0}
          onChange={(e) => {
            const i = Number(e.detail.value)
            const d = districtList[i]
            if (!d) return
            setFilter((s) => ({ ...s, district: d.name }))
          }}
        >
          <View className={`vp-region-cell${districtList.length === 0 ? ' is-disabled' : ''}`}>
            <Text className='vp-region-text'>
              {filter.district || (filter.city ? '全部区' : '区')}
            </Text>
            <Text className='vp-region-arrow'>▾</Text>
          </View>
        </Picker>
        {hasFilter && (
          <View className='vp-clear-btn' onClick={handleClear}>
            清空
          </View>
        )}
      </View>

      <View className='vp-meta'>共 {total} 家球房</View>

      {loading ? (
        <LoadingState text='正在搜索球房' />
      ) : items.length === 0 ? (
        hasFilter ? (
          <EmptyState
            icon='🔍'
            title='没找到匹配的球房'
            description='试试换个城市，或者清空筛选看看附近哪些已认证'
            ctaText='清空筛选'
            onCta={handleClear}
          />
        ) : (
          <EmptyState
            icon='🎱'
            title='附近还没有认证球房'
            description='可以让你常去的球房联系我们入驻'
          />
        )
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
                <Text className='vp-address'>
                  {`${v.province ?? ''}${v.city ?? ''}${v.district ?? ''}${v.address}`}
                </Text>
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
