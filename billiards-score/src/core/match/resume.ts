import Taro from '@tarojs/taro'
import { matchApi } from '../api/match'

/**
 * 查询当前登录用户的未结束比赛；若存在则 redirectTo 到对应游戏页。
 * 返回 true 表示已跳转。
 */
export async function tryResumeActiveMatch(): Promise<boolean> {
  try {
    const r = await matchApi.myActiveMatch()
    if (!r.match) return false
    const m = r.match
    const url =
      m.type === 'nine_ball'
        ? '/pages/nine-ball/index'
        : '/pages/eight-ball/index'
    Taro.redirectTo({ url: `${url}?matchId=${m.id}&role=player` })
    return true
  } catch {
    return false
  }
}
