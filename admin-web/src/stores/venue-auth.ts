import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface VenueAccountInfo {
  id: string
  phoneNumber: string
  nickname: string
  role: 'owner' | 'staff'
  venueId: string | null
}

interface VenueAuthState {
  accessToken: string | null
  refreshToken: string | null
  account: VenueAccountInfo | null
  setSession: (s: {
    accessToken: string
    refreshToken: string
    account: VenueAccountInfo
  }) => void
  setAccount: (a: VenueAccountInfo) => void
  clear: () => void
}

export const useVenueAuthStore = create<VenueAuthState>()(
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
      setAccount: (a) => set({ account: a }),
      clear: () => set({ accessToken: null, refreshToken: null, account: null })
    }),
    {
      name: 'zhuoqiu-venue-auth',
      storage: createJSONStorage(() => localStorage)
    }
  )
)
