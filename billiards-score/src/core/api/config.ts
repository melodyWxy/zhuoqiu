import Taro from '@tarojs/taro'

/**
 * API / WebSocket 地址推断规则（H5）：
 *   - taro dev 端口 3000（本地开发）→ http://<host>:3001/v1（跨端口直连）
 *   - 其他情况（生产 docker / nginx）→ 同源 /v1（nginx 反代）
 * 小程序：上线后换真实域名
 */
function isWeb(): boolean {
  try {
    return Taro.getEnv() === Taro.ENV_TYPE.WEB && typeof window !== 'undefined'
  } catch {
    return false
  }
}

function resolveBase(): { api: string; ws: string } {
  // 1. 编译时注入（config/index.js defineConstants）优先；生产拆 API 域名走这里
  const envApi = process.env.TARO_APP_API_BASE
  const envWs = process.env.TARO_APP_WS_BASE
  if (envApi && envWs) {
    return { api: envApi, ws: envWs }
  }

  if (!isWeb()) {
    return {
      api: 'http://localhost:3001/v1',
      ws: 'ws://localhost:3001/ws'
    }
  }
  const { protocol, hostname, port } = window.location
  const isDev = port === '3000'
  if (isDev) {
    return {
      api: `http://${hostname}:3001/v1`,
      ws: `ws://${hostname}:3001/ws`
    }
  }
  // 同源：nginx 反代 /v1 和 /ws 到 server
  const wsProto = protocol === 'https:' ? 'wss:' : 'ws:'
  const origin = port ? `${hostname}:${port}` : hostname
  return {
    api: `${protocol}//${origin}/v1`,
    ws: `${wsProto}//${origin}/ws`
  }
}

const resolved = resolveBase()
export const API_BASE_URL = resolved.api
export const WS_BASE_URL = resolved.ws
