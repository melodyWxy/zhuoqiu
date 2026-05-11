import Taro from '@tarojs/taro'

/**
 * API / WebSocket 地址
 * - H5：根据 window.location.hostname 推断，方便同一局域网内多机测试
 * - 小程序：后续上线换成真实域名
 */
function getHost(): string {
  try {
    if (Taro.getEnv() === Taro.ENV_TYPE.WEB && typeof window !== 'undefined') {
      return window.location.hostname || 'localhost'
    }
  } catch {
    // ignore
  }
  return 'localhost'
}

const HOST = getHost()
const API_PORT = 3001

export const API_BASE_URL = `http://${HOST}:${API_PORT}/v1`
export const WS_BASE_URL = `ws://${HOST}:${API_PORT}/ws`
