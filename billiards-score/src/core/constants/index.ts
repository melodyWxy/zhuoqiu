/**
 * 常量配置
 */

import type { GameRules } from '../types'

// 默认九球追分规则
export const DEFAULT_NINE_BALL_RULES: GameRules = {
  bigJack: 10,         // 大金 10分
  smallJack: 7,       // 小金 7分
  golden9: 4,         // 黄金9 4分
  normalWin: 4,         // 普胜 4分
  foulCompensation: 1, // 犯规补偿 1分
  targetScore: 51       // 目标分数 51分
}

// 默认中八规则
export const DEFAULT_EIGHT_BALL_CONFIG = {
  targetWins: 5,  // 抢5局
}

// 目标分数选项
export const TARGET_SCORE_OPTIONS = [21, 51, 101]

// 默认玩家名称
export const DEFAULT_PLAYER_NAMES = ['玩家1', '玩家2', '玩家3']

// 球台球号
export const BALL_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

// 得分类型名称
export const WIN_TYPE_NAMES = {
  normal: '普胜',
  small: '小金',
  big: '大金',
  golden9: '黄金9'
} as const

// 座位关系
export const SEAT_RELATIONS = {
  1: { upper: 3, lower: 2 },
  2: { upper: 1, lower: 3 },
  3: { upper: 2, lower: 1 }
} as const
