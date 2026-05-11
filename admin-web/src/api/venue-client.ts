import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { message } from 'antd'
import { useVenueAuthStore } from '../stores/venue-auth'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/v1'

export const venueHttp = axios.create({
  baseURL: BASE_URL,
  timeout: 15000
})

venueHttp.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useVenueAuthStore.getState().accessToken
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

let isRefreshing = false
let refreshPromise: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  const refreshToken = useVenueAuthStore.getState().refreshToken
  if (!refreshToken) throw new Error('no refresh token')
  const r = await axios.post<{ code: number; data: { accessToken: string } }>(
    `${BASE_URL}/venue-auth/refresh`,
    { refreshToken }
  )
  if (r.data.code !== 0) throw new Error('refresh failed')
  const token = r.data.data.accessToken
  const state = useVenueAuthStore.getState()
  if (state.account) {
    state.setSession({
      accessToken: token,
      refreshToken: refreshToken,
      account: state.account
    })
  }
  return token
}

venueHttp.interceptors.response.use(
  (resp) => {
    if (resp.data && typeof resp.data === 'object' && 'code' in resp.data) {
      const code = (resp.data as { code: number }).code
      if (code !== 0) {
        const msg =
          (resp.data as { message?: string }).message ?? `错误码 ${code}`
        message.error(msg)
        return Promise.reject(resp.data)
      }
      return { ...resp, data: (resp.data as { data: unknown }).data } as typeof resp
    }
    return resp
  },
  async (err: AxiosError<{ code?: number; message?: string }>) => {
    const status = err.response?.status
    const original = err.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined
    if (status === 401 && original && !original._retry) {
      original._retry = true
      try {
        if (!isRefreshing) {
          isRefreshing = true
          refreshPromise = refreshAccessToken()
        }
        const newToken = await refreshPromise!
        isRefreshing = false
        refreshPromise = null
        original.headers.set('Authorization', `Bearer ${newToken}`)
        return venueHttp(original)
      } catch (e) {
        isRefreshing = false
        refreshPromise = null
        useVenueAuthStore.getState().clear()
        if (!window.location.pathname.startsWith('/venue-login')) {
          window.location.href = '/venue-login'
        }
        return Promise.reject(e)
      }
    }
    const payload = err.response?.data
    if (payload && typeof payload === 'object' && 'message' in payload) {
      message.error(String(payload.message ?? '请求失败'))
    } else {
      message.error(err.message ?? '请求失败')
    }
    return Promise.reject(err)
  }
)
