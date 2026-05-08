/**
 * 九球追分游戏引擎
 */

import type {
  Player,
  PlayerStats,
  GameRules,
  ScoreResult,
  WinType,
  NineBallGameState,
  GameConfig
} from '../types'
import {
  DEFAULT_NINE_BALL_RULES,
  DEFAULT_PLAYER_NAMES,
  SEAT_RELATIONS
} from '../constants'

// 获取上家
export function getUpper(position: number): number {
  return SEAT_RELATIONS[position as 1 | 2 | 3].upper
}

// 获取下家
export function getLower(position: number): number {
  return SEAT_RELATIONS[position as 1 | 2 | 3].lower
}

// 获取座位关系
export function getRelation(player: number, target: number): 'upper' | 'lower' | 'self' {
  if (player === target) return 'self'
  if (getUpper(player) === target) return 'upper'
  if (getLower(player) === target) return 'lower'
  return 'lower' // 三人模式下不会是其他关系
}

// 创建初始游戏状态
export function createGameState(config: GameConfig): NineBallGameState {
  const { playerCount, playerNames, rules, targetScore } = config

  const players: Player[] = []
  const scores: Record<number, number> = {}
  const stats: Record<number, PlayerStats> = {}
  const ballType: Record<number, 'solid' | 'stripe' | null> = {}

  for (let i = 1; i <= playerCount; i++) {
    players.push({
      id: i,
      name: playerNames[i - 1] || DEFAULT_PLAYER_NAMES[i - 1],
      position: i,
      score: 0
    })
    scores[i] = 0
    stats[i] = {
      bigJack: 0,
      smallJack: 0,
      golden9: 0,
      normalWin: 0
    }
    ballType[i] = null
  }

  return {
    players,
    currentPlayer: 1, // 1号位先开球
    scores,
    stats,
    rules: rules || DEFAULT_NINE_BALL_RULES,
    targetScore: targetScore || DEFAULT_NINE_BALL_RULES.targetScore,
    pocketedBalls: [],
    gameOver: false,
    winner: null
  }
}

// 计算普胜得分
export function calcNormalWin(
  state: NineBallGameState,
  winner: number,
  target: number
): ScoreResult[] {
  const { rules, stats } = state
  const points = rules.normalWin

  // 赢家加几分
  const winnerResult: ScoreResult = {
    playerId: winner,
    change: points,
    type: 'win'
  }

  // 被掏的人减几分
  const loserResult: ScoreResult = {
    playerId: target,
    change: -points,
    type: 'lose'
  }

  // 更新统计数据
  stats[winner].normalWin++

  return [winnerResult, loserResult]
}

// 计算小金得分
export function calcSmallJack(
  state: NineBallGameState,
  winner: number,
  target: number
): ScoreResult[] {
  const { rules, stats } = state
  const points = rules.smallJack

  const winnerResult: ScoreResult = {
    playerId: winner,
    change: points,
    type: 'win'
  }

  const loserResult: ScoreResult = {
    playerId: target,
    change: -points,
    type: 'lose'
  }

  stats[winner].smallJack++

  return [winnerResult, loserResult]
}

// 计算大金得分（赢所有玩家）
export function calcBigJack(
  state: NineBallGameState,
  winner: number
): ScoreResult[] {
  const { rules, stats, players } = state
  const points = rules.bigJack
  const results: ScoreResult[] = []

  // 赢家加分 = 分数 * 其他玩家数
  results.push({
    playerId: winner,
    change: points * (players.length - 1),
    type: 'win'
  })

  // 其他玩家各扣分
  for (const player of players) {
    if (player.id !== winner) {
      results.push({
        playerId: player.id,
        change: -points,
        type: 'lose'
      })
    }
  }

  stats[winner].bigJack++

  return results
}

// 计算黄金9得分（开球直接进9，赢所有玩家，按 rules.golden9 计分）
export function calcGolden9(
  state: NineBallGameState,
  winner: number
): ScoreResult[] {
  const { rules, stats, players } = state
  const points = rules.golden9
  const results: ScoreResult[] = []

  results.push({
    playerId: winner,
    change: points * (players.length - 1),
    type: 'win'
  })

  for (const player of players) {
    if (player.id !== winner) {
      results.push({
        playerId: player.id,
        change: -points,
        type: 'lose'
      })
    }
  }

  stats[winner].golden9 = (stats[winner].golden9 ?? 0) + 1

  return results
}

// 处理犯规
export function handleFoul(
  state: NineBallGameState,
  fouler: number,
  scoreTo: number
): ScoreResult[] {
  const { rules } = state
  const points = rules.foulCompensation

  return [{
    playerId: scoreTo,
    change: points,
    type: 'foul'
  }]
}

// 应用得分结果
export function applyScore(
  state: NineBallGameState,
  results: ScoreResult[]
): NineBallGameState {
  const newScores = { ...state.scores }

  for (const result of results) {
    newScores[result.playerId] += result.change
  }

  return {
    ...state,
    scores: newScores,
    gameOver: checkGameOver(state, newScores)
  }
}

// 检查游戏是否结束
export function checkGameOver(
  state: NineBallGameState,
  scores: Record<number, number>
): boolean {
  const { targetScore } = state

  for (const playerId of Object.keys(scores)) {
    const score = scores[parseInt(playerId)]
    if (score >= targetScore) {
      return true
    }
  }

  return false
}

// 获取获胜者
export function getWinner(
  state: NineBallGameState
): number | null {
  const { scores, targetScore } = state
  let maxScore = -Infinity
  let winner: number | null = null
  let reached = false

  for (const playerId of Object.keys(scores)) {
    const score = scores[parseInt(playerId)]
    if (score > maxScore) {
      maxScore = score
      winner = parseInt(playerId)
    }
    if (score >= targetScore) {
      reached = true
    }
  }

  return reached ? winner : null
}

// 换手
export function passTurn(state: NineBallGameState): NineBallGameState {
  const newCurrent = getLower(state.currentPlayer)
  return {
    ...state,
    currentPlayer: newCurrent
  }
}

// 重置球台（新局开始）
export function resetTable(state: NineBallGameState): NineBallGameState {
  return {
    ...state,
    pocketedBalls: [],
    ballType: { 1: null, 2: null, 3: null }
  }
}
