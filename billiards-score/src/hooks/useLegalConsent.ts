import Taro from '@tarojs/taro'
import { useState, useCallback } from 'react'

export const LEGAL_VERSION = 'v1'
const STORAGE_KEY = `legal-agreed-${LEGAL_VERSION}`

function readAgreed(): boolean {
  try {
    return Taro.getStorageSync(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function useLegalConsent() {
  const [agreed, setAgreed] = useState<boolean>(readAgreed)

  const accept = useCallback(() => {
    try {
      Taro.setStorageSync(STORAGE_KEY, '1')
    } catch {
      // 写失败也不影响本次会话
    }
    setAgreed(true)
  }, [])

  return { agreed, accept }
}
