import Taro from '@tarojs/taro'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

const taroStorage = {
  getItem: (name: string): string | null => {
    try {
      const v = Taro.getStorageSync(name)
      return v ? String(v) : null
    } catch {
      return null
    }
  },
  setItem: (name: string, value: string) => {
    try { Taro.setStorageSync(name, value) } catch {}
  },
  removeItem: (name: string) => {
    try { Taro.removeStorageSync(name) } catch {}
  }
}

export interface CloudUser {
  id: string
  nickname: string
  avatar: string
  phoneNumber: string | null
  primarySource?: string
  wechatBinding?: unknown
  douyinBinding?: unknown
}

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: CloudUser | null
  setSession: (s: { accessToken: string; refreshToken: string; user: CloudUser }) => void
  setAccessToken: (t: string) => void
  setUser: (u: CloudUser) => void
  clear: () => void
  isLoggedIn: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setSession: (s) =>
        set({
          accessToken: s.accessToken,
          refreshToken: s.refreshToken,
          user: s.user
        }),
      setAccessToken: (t) => set({ accessToken: t }),
      setUser: (u) => set({ user: u }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null }),
      isLoggedIn: () => !!get().accessToken && !!get().user
    }),
    {
      name: 'billiards-auth',
      storage: createJSONStorage(() => taroStorage)
    }
  )
)
