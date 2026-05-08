import { create } from 'zustand'

interface EightBallPlayer {
  name: string
  wins: number
}

interface EightBallState {
  players: EightBallPlayer[]
  targetWins: number

  initGame: (names: string[], targetWins: number) => void
  addWin: (playerIdx: number) => void
  renamePlayer: (playerIdx: number, name: string) => void
  reset: () => void
  clearGame: () => void
}

export const useEightBallStore = create<EightBallState>((set) => ({
  players: [],
  targetWins: 5,

  initGame: (names, targetWins) => {
    set({
      players: names.map((name) => ({ name, wins: 0 })),
      targetWins
    })
  },

  addWin: (playerIdx) => {
    set((state) => {
      const next = state.players.map((p, i) =>
        i === playerIdx ? { ...p, wins: p.wins + 1 } : p
      )
      return { players: next }
    })
  },

  renamePlayer: (playerIdx, name) => {
    set((state) => {
      const next = state.players.map((p, i) =>
        i === playerIdx ? { ...p, name } : p
      )
      return { players: next }
    })
  },

  reset: () => {
    set((state) => ({
      players: state.players.map((p) => ({ ...p, wins: 0 }))
    }))
  },

  clearGame: () => {
    set({ players: [], targetWins: 5 })
  }
}))
