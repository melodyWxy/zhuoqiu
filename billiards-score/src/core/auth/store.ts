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

export interface VenueAccount {
  id: string
  phoneNumber: string
  nickname: string
  role: 'owner' | 'staff'
  venueId: string | null
}

export interface VenueSession {
  accessToken: string
  refreshToken: string
  account: VenueAccount
}

export type ViewMode = 'user' | 'venue'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: CloudUser | null
  venueSession: VenueSession | null
  viewMode: ViewMode
  setSession: (s: { accessToken: string; refreshToken: string; user: CloudUser }) => void
  setAccessToken: (t: string) => void
  setUser: (u: CloudUser) => void
  clear: () => void
  setVenueSession: (s: VenueSession | null) => void
  setVenueAccount: (a: VenueAccount) => void
  setViewMode: (m: ViewMode) => void
  clearVenueSession: () => void
  isLoggedIn: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      venueSession: null,
      viewMode: 'user' as ViewMode,
      setSession: (s) =>
        set({
          accessToken: s.accessToken,
          refreshToken: s.refreshToken,
          user: s.user
        }),
      setAccessToken: (t) => set({ accessToken: t }),
      setUser: (u) => set({ user: u }),
      clear: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          // 清 C 端登录时也清 venue 视角（venueSession 依然保留，便于重登后恢复）
          viewMode: 'user'
        }),
      setVenueSession: (s) => set({ venueSession: s }),
      setVenueAccount: (a) => {
        const cur = get().venueSession
        if (!cur) return
        set({ venueSession: { ...cur, account: a } })
      },
      setViewMode: (m) => set({ viewMode: m }),
      clearVenueSession: () => set({ venueSession: null, viewMode: 'user' }),
      isLoggedIn: () => !!get().accessToken && !!get().user
    }),
    {
      name: 'billiards-auth',
      storage: createJSONStorage(() => taroStorage)
    }
  )
)
