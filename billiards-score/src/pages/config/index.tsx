import { View, Text, Input, Button } from '@tarojs/components'
import { useState, useMemo } from 'react'
import Taro, { useRouter } from '@tarojs/taro'
import { useNineBallStore } from '../../core/game/store'
import { useEightBallStore } from '../../core/game/eightBallStore'
import { useGameTimer } from '../../core/game/timer'
import { useUserStore } from '../../core/user/store'
import { useAuthStore } from '../../core/auth/store'
import { matchApi } from '../../core/api/match'
import { DEFAULT_NINE_BALL_RULES } from '../../core/constants'
import LoginSheet from '../../components/LoginSheet'
import './index.scss'

type GameType = 'nine-ball' | 'eight-ball'

interface ScoreField {
  key: 'bigJack' | 'smallJack' | 'golden9' | 'normalWin'
  label: string
  emoji: string
  defaultValue: number
}

const SCORE_FIELDS: ScoreField[] = [
  { key: 'bigJack', label: '大金', emoji: '💎', defaultValue: DEFAULT_NINE_BALL_RULES.bigJack },
  { key: 'smallJack', label: '小金', emoji: '🏅', defaultValue: DEFAULT_NINE_BALL_RULES.smallJack },
  { key: 'golden9', label: '黄金9', emoji: '👑', defaultValue: DEFAULT_NINE_BALL_RULES.golden9 },
  { key: 'normalWin', label: '普胜', emoji: '✅', defaultValue: DEFAULT_NINE_BALL_RULES.normalWin }
]

export default function ConfigPage() {
  const router = useRouter()
  const type = (router.params.type as GameType) || 'nine-ball'
  const userNickname = useUserStore((s) => s.nickname)

  const [playerCount, setPlayerCount] = useState<2 | 3>(type === 'eight-ball' ? 2 : 3)
  const [playerNames, setPlayerNames] = useState(() => {
    const me = userNickname || '我'
    return type === 'eight-ball'
      ? [me, '对手']
      : [me, '玩家2', '玩家3']
  })
  const [targetWins, setTargetWins] = useState(5)
  const [customWins, setCustomWins] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(true)
  const cloudUser = useAuthStore((s) => s.user)
  // 已登录默认联机；未登录默认本地
  const [online, setOnline] = useState(!!cloudUser)
  const [creating, setCreating] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [scoreConfig, setScoreConfig] = useState<Record<string, string>>(() =>
    Object.fromEntries(SCORE_FIELDS.map((f) => [f.key, String(f.defaultValue)]))
  )

  const isNineBall = type === 'nine-ball'
  const title = isNineBall ? '九球追分 · 赛前配置' : '中式八球 · 赛前配置'

  const effectiveNames = useMemo(
    () => playerNames.slice(0, playerCount),
    [playerNames, playerCount]
  )

  const updateName = (idx: number, name: string) => {
    const next = [...playerNames]
    next[idx] = name
    setPlayerNames(next)
  }

  const resolveTargetWins = () => {
    const custom = parseInt(customWins, 10)
    if (!Number.isNaN(custom) && custom > 0) return custom
    return targetWins
  }

  const resolveRules = () => {
    const override: Record<string, number> = {}
    for (const f of SCORE_FIELDS) {
      const v = parseInt(scoreConfig[f.key], 10)
      override[f.key] = Number.isNaN(v) || v <= 0 ? f.defaultValue : v
    }
    return override
  }

  const handleStart = async () => {
    const finalNames = effectiveNames.map((n, i) => n.trim() || `玩家${i + 1}`)

    // 联机模式：服务端创建 match
    if (online) {
      if (!cloudUser) {
        Taro.showToast({ title: '请先登录', icon: 'none' })
        return
      }
      setCreating(true)
      try {
        const m = await matchApi.create({
          type: isNineBall ? 'nine_ball' : 'eight_ball',
          rules: isNineBall ? resolveRules() : { targetWins: resolveTargetWins() },
          playerSlots: effectiveNames.map((n, i) => ({
            slot: i + 1,
            name: (n.trim() || `玩家${i + 1}`),
            claim: i === 0
          }))
        })
        useGameTimer.getState().start()
        const url = isNineBall ? '/pages/nine-ball/index' : '/pages/eight-ball/index'
        Taro.redirectTo({ url: `${url}?matchId=${m.id}` })
      } catch {
        // toast 已在 client 里弹
      } finally {
        setCreating(false)
      }
      return
    }

    // 本地模式：沿用一期
    useGameTimer.getState().start()
    if (isNineBall) {
      useNineBallStore.getState().initGame(playerCount, finalNames, resolveRules())
      Taro.redirectTo({ url: '/pages/nine-ball/index' })
    } else {
      useEightBallStore.getState().initGame(finalNames, resolveTargetWins())
      Taro.redirectTo({ url: '/pages/eight-ball/index' })
    }
  }

  return (
    <View className='config-page'>
      <View className='header'>
        <Text className='header-title'>{title}</Text>
      </View>

      <View className='config-content'>
        {isNineBall && (
          <View className='config-section'>
            <Text className='section-title'>比赛人数</Text>
            <View className='player-count'>
              <View
                className={`count-btn ${playerCount === 2 ? 'active' : ''}`}
                onClick={() => setPlayerCount(2)}
              >
                2人
              </View>
              <View
                className={`count-btn ${playerCount === 3 ? 'active' : ''}`}
                onClick={() => {
                  setPlayerCount(3)
                  if (playerNames.length < 3) {
                    setPlayerNames([...playerNames, '玩家3'])
                  }
                }}
              >
                3人
              </View>
            </View>
          </View>
        )}

        <View className='config-section'>
          <Text className='section-title'>玩家名称</Text>
          <View className='player-inputs'>
            {effectiveNames.map((name, idx) => (
              <View key={idx} className='input-item'>
                <Text className='input-label'>{idx + 1}号位</Text>
                <Input
                  className='input-field'
                  value={name}
                  onInput={(e) => updateName(idx, e.detail.value)}
                  placeholder='请输入昵称'
                />
              </View>
            ))}
          </View>
        </View>

        {!isNineBall && (
          <View className='config-section'>
            <Text className='section-title'>抢几局</Text>
            <View className='score-options'>
              {[3, 5, 7, 9].map((w) => (
                <View
                  key={w}
                  className={`score-btn ${targetWins === w && !customWins ? 'active' : ''}`}
                  onClick={() => {
                    setTargetWins(w)
                    setCustomWins('')
                  }}
                >
                  {w}局
                </View>
              ))}
            </View>
            <View className='custom-row'>
              <Text className='custom-label'>自定义</Text>
              <Input
                className='custom-input'
                type='number'
                value={customWins}
                placeholder='例如 11'
                onInput={(e) => setCustomWins(e.detail.value)}
              />
              <Text className='custom-suffix'>局</Text>
            </View>
          </View>
        )}

        {isNineBall && (
          <View className='config-section'>
            <View
              className='section-title toggle-title'
              onClick={() => setShowAdvanced((v) => !v)}
            >
              <Text>得分规则{showAdvanced ? '' : '（默认）'}</Text>
              <Text className='toggle-arrow'>{showAdvanced ? '▲' : '▼'}</Text>
            </View>
            {showAdvanced && (
              <View className='score-rules'>
                {SCORE_FIELDS.map((f) => (
                  <View key={f.key} className='score-rule-row'>
                    <Text className='rule-label'>
                      {f.emoji} {f.label}
                    </Text>
                    <Input
                      className='rule-input'
                      type='number'
                      value={scoreConfig[f.key]}
                      onInput={(e) =>
                        setScoreConfig({ ...scoreConfig, [f.key]: e.detail.value })
                      }
                    />
                    <Text className='rule-suffix'>分</Text>
                  </View>
                ))}
                <View className='rule-hint'>默认 大金10 · 小金7 · 黄金9=4 · 普胜4</View>
              </View>
            )}
          </View>
        )}

        <View className='config-section'>
          <View
            className={`online-toggle ${online ? 'online-on' : ''}`}
            onClick={() => {
              // 未登录且要开启联机 → 弹登录
              if (!cloudUser && !online) {
                setLoginOpen(true)
                return
              }
              setOnline((v) => !v)
            }}
          >
            <View className='online-toggle-info'>
              <Text className='online-toggle-title'>
                {online ? '🟢 联机模式' : '⚪ 本地模式'}
              </Text>
              <Text className='online-toggle-hint'>
                {online
                  ? '生成房间码后朋友扫码/输码加入，实时同步'
                  : cloudUser
                    ? '点击切换到联机模式'
                    : '登录后可开启联机模式'}
              </Text>
            </View>
            <View className={`online-toggle-knob ${online ? 'on' : ''}`} />
          </View>
        </View>

        <View className='start-section'>
          <Button className='start-btn' onClick={handleStart} disabled={creating}>
            {creating ? '创建中…' : '开始比赛'}
          </Button>
        </View>
      </View>

      <LoginSheet
        visible={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={() => setOnline(true)}
      />
    </View>
  )
}
