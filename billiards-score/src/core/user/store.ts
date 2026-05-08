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

interface UserState {
  nickname: string
  avatar: string
  setNickname: (v: string) => void
  setAvatar: (v: string) => void
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      nickname: '我',
      avatar: '🎱',
      setNickname: (v) => set({ nickname: v }),
      setAvatar: (v) => set({ avatar: v })
    }),
    {
      name: 'billiards-user',
      storage: createJSONStorage(() => taroStorage)
    }
  )
)
