/**
 * 九球追分游戏状态管理
 */

import { create } from 'zustand'
import type { NineBallGameState, PlayerStats, ScoreResult, GameRules } from '../types'
import { DEFAULT_NINE_BALL_RULES } from '../constants'
import {
  createGameState,
  getUpper,
  getLower,
  getWinner,
  calcNormalWin,
  calcSmallJack,
  calcBigJack,
  calcGolden9,
  handleFoul,
  applyScore,
  passTurn as passTurnHelper,
  resetTable
} from './NineBall'

interface NineBallStore extends NineBallGameState {
  // 初始化游戏（可选传入自定义规则覆盖默认分数）
  initGame: (
    playerCount: 2 | 3,
    playerNames: string[],
    rulesOverride?: Partial<GameRules>
  ) => void

  // 普胜
  normalWin: (winner: number, target: number) => void

  // 小金
  smallJack: (winner: number, target: number) => void

  // 大金
  bigJack: (winner: number) => void

  // 黄金9
  golden9: (winner: number) => void

  // 犯规
  foul: (fouler: number, scoreTo: number) => void

  // 换手
  passTurn: () => void

  // 重置球台（新局）
  resetRound: () => void

  // 修改玩家名字
  renamePlayer: (playerId: number, name: string) => void

  // 清空游戏
  clearGame: () => void

  // 获取上家
  getUpper: (position: number) => number

  // 获取下家
  getLower: (position: number) => number

  // 获取座位关系
  getRelation: (player: number, target: number) => 'upper' | 'lower' | 'self'
}

export const useNineBallStore = create<NineBallStore>((set, get) => ({
  // 初始状态
  players: [],
  currentPlayer: 1,
  scores: {},
  stats: {},
  rules: DEFAULT_NINE_BALL_RULES,
  targetScore: 51,
  pocketedBalls: [],
  gameOver: false,
  winner: null,

  // 初始化游戏：九球追分不设置目标分，开放式累计得分
  initGame: (playerCount, playerNames, rulesOverride) => {
    const rules: GameRules = {
      ...DEFAULT_NINE_BALL_RULES,
      ...(rulesOverride || {}),
      targetScore: Number.MAX_SAFE_INTEGER
    }
    const config = {
      type: 'nine-ball' as const,
      playerCount,
      playerNames,
      rules,
      targetScore: Number.MAX_SAFE_INTEGER
    }
    const state = createGameState(config)
    set(state)
  },

  // 普胜
  normalWin: (winner, target) => {
    const state = get()
    const results = calcNormalWin(state, winner, target)
    const newState = applyScore(state, results)
    const winner_final = getWinner(newState)
    set({
      ...newState,
      winner: winner_final,
      gameOver: winner_final !== null
    })
  },

  // 小金
  smallJack: (winner, target) => {
    const state = get()
    const results = calcSmallJack(state, winner, target)
    const newState = applyScore(state, results)
    const winner_final = getWinner(newState)
    set({
      ...newState,
      winner: winner_final,
      gameOver: winner_final !== null
    })
  },

  // 大金
  bigJack: (winner) => {
    const state = get()
    const results = calcBigJack(state, winner)
    const newState = applyScore(state, results)
    const winner_final = getWinner(newState)
    set({
      ...newState,
      winner: winner_final,
      gameOver: winner_final !== null
    })
  },

  // 黄金9
  golden9: (winner) => {
    const state = get()
    const results = calcGolden9(state, winner)
    const newState = applyScore(state, results)
    const winner_final = getWinner(newState)
    set({
      ...newState,
      winner: winner_final,
      gameOver: winner_final !== null
    })
  },

  // 犯规
  foul: (fouler, scoreTo) => {
    const state = get()
    const results = handleFoul(state, fouler, scoreTo)
    const newState = applyScore(state, results)
    set(newState)
  },

  // 换手
  passTurn: () => {
    set(passTurnHelper(get()))
  },

  // 重置球台
  resetRound: () => {
    set(resetTable(get()))
  },

  // 修改玩家名字
  renamePlayer: (playerId, name) => {
    const players = get().players.map((p) =>
      p.id === playerId ? { ...p, name } : p
    )
    set({ players })
  },

  // 清空游戏
  clearGame: () => {
    set({
      players: [],
      currentPlayer: 1,
      scores: {},
      stats: {},
      pocketedBalls: [],
      gameOver: false,
      winner: null
    })
  },

  // 获取上家
  getUpper: (position) => getUpper(position),

  // 获取下家
  getLower: (position) => getLower(position),

  // 获取座位关系
  getRelation: (player, target) => {
    if (player === target) return 'self'
    if (getUpper(player) === target) return 'upper'
    return 'lower'
  }
}))
