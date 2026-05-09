import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AdminAccount } from '../types'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  account: AdminAccount | null
  setSession: (s: { accessToken: string; refreshToken: string; account: AdminAccount }) => void
  setAccessToken: (t: string) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      account: null,
      setSession: (s) =>
        set({
          accessToken: s.accessToken,
          refreshToken: s.refreshToken,
          account: s.account
        }),
      setAccessToken: (t) => set({ accessToken: t }),
      clear: () => set({ accessToken: null, refreshToken: null, account: null })
    }),
    {
      name: 'zhuoqiu-admin-auth',
      storage: createJSONStorage(() => localStorage)
    }
  )
)
