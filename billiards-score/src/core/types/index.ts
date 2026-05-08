/**
 * 核心类型定义
 */

// 玩家信息
export interface Player {
  id: number
  name: string
  position: number  // 座位位置 1/2/3
  score: number     // 当前分数
}

// 玩家统计数据
export interface PlayerStats {
  bigJack: number   // 大金次数
  smallJack: number // 小金次数
  golden9: number  // 黄金9次数
  normalWin: number // 普胜次数
}

// 游戏规则配置
export interface GameRules {
  bigJack: number      // 大金分数
  smallJack: number    // 小金分数
  golden9: number      // 黄金9分数
  normalWin: number    // 普胜分数
  foulCompensation: number  // 犯规补偿分数
  targetScore: number  // 目标分数
}

// 得分结果
export interface ScoreResult {
  playerId: number
  change: number
  type: 'win' | 'lose' | 'foul'
}

// 得分类型
export type WinType = 'normal' | 'small' | 'big' | 'golden9'

// 游戏类型
export type GameType = 'nine-ball' | 'eight-ball'

// 游戏配置
export interface GameConfig {
  type: GameType
  playerCount: 2 | 3
  playerNames: string[]
  rules: GameRules
  targetScore: number
}

// 历史记录
export interface GameRecord {
  id: string
  type: GameType
  players: { name: string; score: number; stats: PlayerStats }[]
  winner: number
  startTime: number
  endTime: number
}

// 九球追分游戏状态
export interface NineBallGameState {
  players: Player[]
  currentPlayer: number  // 当前击球者索引
  scores: Record<number, number>
  stats: Record<number, PlayerStats>
  rules: GameRules
  targetScore: number
  pocketedBalls: number[]
  gameOver: boolean
  winner: number | null
}

// 中八游戏状态
export interface EightBallGameState {
  players: Player[]
  currentPlayer: number
  wins: Record<number, number>  // 胜局数
  targetWins: number  // 抢几局
  ballType: Record<number, 'solid' | 'stripe' | null>  // 球型归属
  gameOver: boolean
  winner: number | null
}

// 座位关系
export type SeatRelation = 'upper' | 'lower' | 'self'
