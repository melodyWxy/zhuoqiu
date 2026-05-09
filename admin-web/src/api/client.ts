import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { message } from 'antd'
import { useAuthStore } from '../stores/auth'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/v1'

export const http = axios.create({
  baseURL: BASE_URL,
  timeout: 15000
})

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

let isRefreshing = false
let refreshPromise: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  const refreshToken = useAuthStore.getState().refreshToken
  if (!refreshToken) throw new Error('no refresh token')
  const r = await axios.post<{ code: number; data: { accessToken: string } }>(
    `${BASE_URL}/admin/auth/refresh`,
    { refreshToken }
  )
  if (r.data.code !== 0) throw new Error('refresh failed')
  const newToken = r.data.data.accessToken
  useAuthStore.getState().setAccessToken(newToken)
  return newToken
}

http.interceptors.response.use(
  (resp) => {
    // 业务错误（HTTP 200，code != 0）
    if (resp.data && typeof resp.data === 'object' && 'code' in resp.data) {
      const code = (resp.data as { code: number }).code
      if (code !== 0) {
        const msg = (resp.data as { message?: string }).message ?? `错误码 ${code}`
        message.error(msg)
        return Promise.reject(resp.data)
      }
      // 成功 → 把 data 解出来
      return { ...resp, data: (resp.data as { data: unknown }).data } as typeof resp
    }
    return resp
  },
  async (err: AxiosError<{ code?: number; message?: string }>) => {
    const status = err.response?.status
    const original = err.config as InternalAxiosRequestConfig & { _retry?: boolean }

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
        return http(original)
      } catch (e) {
        isRefreshing = false
        refreshPromise = null
        useAuthStore.getState().clear()
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
        return Promise.reject(e)
      }
    }

    if (status === 403) {
      message.error('无权限执行此操作')
    } else if (status === 429) {
      message.warning('操作过于频繁，请稍后再试')
    } else if (status && status >= 500) {
      message.error(`服务异常 (${status})`)
    } else {
      const payload = err.response?.data
      if (payload && typeof payload === 'object' && 'message' in payload) {
        message.error(String(payload.message ?? '请求失败'))
      } else {
        message.error(err.message ?? '请求失败')
      }
    }

    return Promise.reject(err)
  }
)
