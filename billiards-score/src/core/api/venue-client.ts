import Taro from '@tarojs/taro'
import { API_BASE_URL } from './config'
import { useAuthStore } from '../auth/store'
import type { ApiError } from './client'

interface CallOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  data?: unknown
  auth?: boolean
  toast?: boolean
}

let refreshPromise: Promise<string | null> | null = null

async function refreshVenueAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    const state = useAuthStore.getState()
    const session = state.venueSession
    if (!session) return null
    try {
      const r = await Taro.request<{
        code: number
        data: { accessToken: string }
      }>({
        url: `${API_BASE_URL}/venue-auth/refresh`,
        method: 'POST',
        data: { refreshToken: session.refreshToken }
      })
      if (r.statusCode !== 200 || r.data.code !== 0) {
        useAuthStore.getState().clearVenueSession()
        return null
      }
      const t = r.data.data.accessToken
      useAuthStore.getState().setVenueSession({
        accessToken: t,
        refreshToken: session.refreshToken,
        account: session.account
      })
      return t
    } catch {
      useAuthStore.getState().clearVenueSession()
      return null
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

function makeError(
  code: number,
  message: string,
  details?: Record<string, unknown>
): ApiError {
  const err = new Error(message) as ApiError
  err.code = code
  err.details = details
  return err
}

/**
 * 商家账号 API 调用，使用 venueSession 的 token。
 * C 端 venue 视角下的请求走这里（拿到 client=c_app 的 JWT）。
 */
export async function callVenueApi<T = unknown>(
  path: string,
  options: CallOptions = {}
): Promise<T> {
  const { method = 'GET', data, auth = true, toast = true } = options

  const doRequest = async (token: string | null) => {
    const header: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    if (auth && token) header['Authorization'] = `Bearer ${token}`
    return Taro.request<{
      code: number
      data?: T
      message?: string
      details?: Record<string, unknown>
    }>({
      url: `${API_BASE_URL}${path}`,
      method,
      data,
      header
    })
  }

  let token = useAuthStore.getState().venueSession?.accessToken ?? null
  let resp = await doRequest(token)

  if (resp.statusCode === 401 && auth) {
    const newToken = await refreshVenueAccessToken()
    if (!newToken) {
      throw makeError(10002, '商家账号未登录或已过期')
    }
    token = newToken
    resp = await doRequest(token)
  }

  if (resp.statusCode >= 500) {
    if (toast)
      Taro.showToast({ title: `服务异常 ${resp.statusCode}`, icon: 'none' })
    throw makeError(90001, `服务异常 ${resp.statusCode}`)
  }

  const body = resp.data
  if (!body || typeof body.code !== 'number') {
    throw makeError(90001, '无效响应')
  }
  if (body.code !== 0) {
    if (toast && body.message) {
      Taro.showToast({ title: body.message, icon: 'none' })
    }
    throw makeError(body.code, body.message ?? `错误 ${body.code}`, body.details)
  }
  return body.data as T
}
