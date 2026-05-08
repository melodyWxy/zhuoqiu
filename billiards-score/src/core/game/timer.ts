import { create } from 'zustand'

interface TimerState {
  startedAt: number
  accumulated: number
  isPaused: boolean
  isRunning: boolean

  start: () => void
  pause: () => void
  resume: () => void
  stop: () => void
  getElapsed: () => number
}

export const useGameTimer = create<TimerState>((set, get) => ({
  startedAt: 0,
  accumulated: 0,
  isPaused: false,
  isRunning: false,

  start: () => {
    set({
      startedAt: Date.now(),
      accumulated: 0,
      isPaused: false,
      isRunning: true
    })
  },

  pause: () => {
    const { startedAt, accumulated, isPaused, isRunning } = get()
    if (!isRunning || isPaused) return
    set({
      accumulated: accumulated + (Date.now() - startedAt),
      isPaused: true
    })
  },

  resume: () => {
    const { isPaused, isRunning } = get()
    if (!isRunning || !isPaused) return
    set({
      startedAt: Date.now(),
      isPaused: false
    })
  },

  stop: () => {
    set({
      startedAt: 0,
      accumulated: 0,
      isPaused: false,
      isRunning: false
    })
  },

  getElapsed: () => {
    const { startedAt, accumulated, isPaused, isRunning } = get()
    if (!isRunning) return 0
    if (isPaused) return accumulated
    return accumulated + (Date.now() - startedAt)
  }
}))

export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`
  return `${pad(m)}:${pad(s)}`
}
