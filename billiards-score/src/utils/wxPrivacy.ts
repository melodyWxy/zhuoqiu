import Taro from '@tarojs/taro'

declare const wx: any

export function isWeapp(): boolean {
  try {
    return Taro.getEnv() === Taro.ENV_TYPE.WEAPP
  } catch {
    return false
  }
}

function hasWxFn(name: string): boolean {
  return (
    typeof wx !== 'undefined' &&
    typeof wx[name] === 'function'
  )
}

interface PrivacySetting {
  needAuthorization: boolean
  privacyContractName?: string
}

function getPrivacySetting(): Promise<PrivacySetting> {
  return new Promise((resolve) => {
    if (!hasWxFn('getPrivacySetting')) {
      resolve({ needAuthorization: false })
      return
    }
    wx.getPrivacySetting({
      success: (res: PrivacySetting) => resolve(res),
      fail: () => resolve({ needAuthorization: false })
    })
  })
}

function requirePrivacyAuthorize(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!hasWxFn('requirePrivacyAuthorize')) {
      // 旧基础库 / 未启用隐私指引：视为已授权
      resolve(true)
      return
    }
    wx.requirePrivacyAuthorize({
      success: () => resolve(true),
      fail: () => resolve(false)
    })
  })
}

/**
 * 微信端：先查 getPrivacySetting，需要授权时拉 requirePrivacyAuthorize；
 * 任一步失败 / 用户拒绝 → false。
 * 非微信环境：直接 true（H5 不走微信通道，由业务层另行处理）。
 */
export async function ensureWxPrivacyAuthorized(): Promise<boolean> {
  if (!isWeapp()) return true
  const setting = await getPrivacySetting()
  if (!setting.needAuthorization) return true
  return requirePrivacyAuthorize()
}
