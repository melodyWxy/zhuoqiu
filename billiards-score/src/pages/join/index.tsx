import { View, Text, Input, Button } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { matchApi } from '../../core/api/match'
import { useAuthStore } from '../../core/auth/store'
import { useGameTimer } from '../../core/game/timer'
import './index.scss'

export default function JoinPage() {
  const router = useRouter()
  const cloudUser = useAuthStore((s) => s.user)
  const [code, setCode] = useState(
    ((router.params.code as string) || '').toUpperCase()
  )
  const [slot, setSlot] = useState<number | ''>('')
  const [loading, setLoading] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<{
    type: string
    state: string
    players: Array<{ slot: number; displayName: string; userId: string | null }>
  } | null>(null)

  // URL 带 code 时自动预览
  useEffect(() => {
    if (code.length === 6) handlePreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handlePreview = async () => {
    const c = code.toUpperCase().trim()
    if (c.length !== 6) {
      Taro.showToast({ title: '请输入 6 位房间码', icon: 'none' })
      return
    }
    setPreviewing(true)
    try {
      const m = await matchApi.detail(c)
      setPreview({
        type: m.type,
        state: m.state,
        players: m.players
          .filter((p) => p.isCurrent)
          .map((p) => ({ slot: p.slot, displayName: p.displayName, userId: p.userId }))
      })
    } catch {
      setPreview(null)
    } finally {
      setPreviewing(false)
    }
  }

  const handleJoin = async (asSpectator: boolean) => {
    if (!cloudUser) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    const c = code.toUpperCase().trim()
    if (c.length !== 6) {
      Taro.showToast({ title: '请输入 6 位房间码', icon: 'none' })
      return
    }
    setLoading(true)
    try {
      const r = await matchApi.join(c, asSpectator ? undefined : (slot as number) || undefined)
      const url =
        r.match.type === 'nine_ball'
          ? '/pages/nine-ball/index'
          : '/pages/eight-ball/index'
      useGameTimer.getState().start() // 用本地 elapsed 估计；真实以服务端为准
      Taro.redirectTo({ url: `${url}?matchId=${r.match.id}&role=${r.role}` })
    } finally {
      setLoading(false)
    }
  }

  const emptySlots = preview
    ? preview.players.filter((p) => !p.userId).map((p) => p.slot)
    : []

  return (
    <View className='join-page'>
      <View className='join-header'>
        <Text className='join-title'>加入联机比赛</Text>
        <Text className='join-subtitle'>输入 6 位房间码</Text>
      </View>

      <View className='join-content'>
        <Input
          className='code-input'
          maxlength={6}
          value={code}
          placeholder='如 K7P2XM'
          onInput={(e) => setCode((e.detail.value || '').toUpperCase())}
          onBlur={() => code.length === 6 && handlePreview()}
        />

        {!preview && (
          <Button
            className='preview-btn'
            onClick={handlePreview}
            loading={previewing}
          >
            查询房间
          </Button>
        )}

        {preview && (
          <View className='preview-card'>
            <View className='preview-row'>
              <Text className='preview-label'>项目</Text>
              <Text className='preview-value'>
                {preview.type === 'nine_ball' ? '九球追分' : '中式八球'}
              </Text>
            </View>
            <View className='preview-row'>
              <Text className='preview-label'>状态</Text>
              <Text className='preview-value'>
                {preview.state === 'in_progress'
                  ? '🟢 进行中'
                  : preview.state === 'paused'
                    ? '🟡 暂停'
                    : preview.state === 'ended'
                      ? '✅ 已结束'
                      : preview.state}
              </Text>
            </View>
            <View className='preview-players'>
              {preview.players.map((p) => (
                <View
                  key={p.slot}
                  className={`preview-player ${!p.userId ? 'empty' : ''} ${slot === p.slot ? 'selected' : ''}`}
                  onClick={() => {
                    if (!p.userId) setSlot(p.slot)
                  }}
                >
                  <Text className='pp-slot'>{p.slot} 号位</Text>
                  <Text className='pp-name'>
                    {p.userId ? p.displayName : '空位'}
                  </Text>
                </View>
              ))}
            </View>

            <View className='join-actions'>
              {emptySlots.length > 0 ? (
                <Button
                  className='join-btn primary'
                  disabled={!slot || loading}
                  onClick={() => handleJoin(false)}
                >
                  {loading ? '加入中…' : `占 ${slot || '?'} 号位参赛`}
                </Button>
              ) : (
                <Text className='full-hint'>所有号位已满</Text>
              )}
              <Button
                className='join-btn'
                disabled={loading || preview.state === 'ended'}
                onClick={() => handleJoin(true)}
              >
                以观众身份进入
              </Button>
            </View>
          </View>
        )}
      </View>
    </View>
  )
}
