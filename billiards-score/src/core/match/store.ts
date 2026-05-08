import Taro from '@tarojs/taro'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

const taroStorage = {
  getItem: (name: string): string | null => {
    try {
      const val = Taro.getStorageSync(name)
      return val ? String(val) : null
    } catch {
      return null
    }
  },
  setItem: (name: string, value: string) => {
    try {
      Taro.setStorageSync(name, value)
    } catch {}
  },
  removeItem: (name: string) => {
    try {
      Taro.removeStorageSync(name)
    } catch {}
  }
}

export interface PlayerSummary {
  name: string
  position?: number
  score?: number
  wins?: number
  stats?: {
    bigJack?: number
    smallJack?: number
    normalWin?: number
    golden9?: number
  }
}

export interface MatchRecord {
  id: string
  type: 'nine-ball' | 'eight-ball'
  endedAt: number
  durationMs: number
  players: PlayerSummary[]
  winnerName?: string
}

interface MatchStore {
  records: MatchRecord[]
  saveMatch: (r: Omit<MatchRecord, 'id'>) => void
  removeMatch: (id: string) => void
  clearAll: () => void
}

export const useMatchStore = create<MatchStore>()(
  persist(
    (set) => ({
      records: [],
      saveMatch: (r) =>
        set((state) => ({
          records: [
            { ...r, id: `${r.endedAt}-${Math.random().toString(36).slice(2, 8)}` },
            ...state.records
          ]
        })),
      removeMatch: (id) =>
        set((state) => ({
          records: state.records.filter((m) => m.id !== id)
        })),
      clearAll: () => set({ records: [] })
    }),
    {
      name: 'billiards-matches',
      storage: createJSONStorage(() => taroStorage)
    }
  )
)
