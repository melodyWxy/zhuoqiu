import Taro from '@tarojs/taro'
import { API_BASE_URL } from './config'
import { useAuthStore } from '../auth/store'

export interface ApiError extends Error {
  code: number
  details?: Record<string, unknown>
}

interface CallOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  data?: unknown
  /** 是否需要带 token；默认 true */
  auth?: boolean
  /** 失败时自动 toast；默认 true */
  toast?: boolean
}

let refreshPromise: Promise<string | null> | null = null

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    const { refreshToken, setAccessToken, clear } = useAuthStore.getState()
    if (!refreshToken) {
      clear()
      return null
    }
    try {
      const r = await Taro.request<{ code: number; data: { accessToken: string } }>({
        url: `${API_BASE_URL}/auth/refresh`,
        method: 'POST',
        data: { refreshToken }
      })
      if (r.statusCode !== 200 || r.data.code !== 0) {
        clear()
        return null
      }
      const t = r.data.data.accessToken
      setAccessToken(t)
      return t
    } catch {
      clear()
      return null
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

/**
 * 统一调用：自动注入 token、解包响应、refresh 重试一次
 */
export async function callApi<T = unknown>(
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

  let token = useAuthStore.getState().accessToken
  let resp = await doRequest(token)

  // 401 → refresh 一次
  if (resp.statusCode === 401 && auth) {
    const newToken = await refreshAccessToken()
    if (!newToken) {
      throw makeError(10002, '未登录')
    }
    token = newToken
    resp = await doRequest(token)
  }

  if (resp.statusCode >= 500) {
    if (toast) Taro.showToast({ title: `服务异常 ${resp.statusCode}`, icon: 'none' })
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
