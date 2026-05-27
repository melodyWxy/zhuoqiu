import Taro from '@tarojs/taro'
import { callApi } from './client'
import { API_BASE_URL } from './config'
import { useAuthStore, type CloudUser } from '../auth/store'

interface LoginResponse {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: CloudUser
  isNewUser?: boolean
}

export const authApi = {
  wechatLogin: (code: string, appId?: string) =>
    callApi<LoginResponse>('/auth/wechat', {
      method: 'POST',
      data: { code, appId },
      auth: false
    }),

  /** 微信登录后通过 <Button open-type="getPhoneNumber"> 拿到的 code，换真实手机号并绑定到当前账号。 */
  wechatBindPhone: (code: string) =>
    callApi<{ user: CloudUser }>('/auth/wechat/phone', {
      method: 'POST',
      data: { code }
    }),

  douyinLogin: (code: string, appId?: string) =>
    callApi<LoginResponse>('/auth/douyin', {
      method: 'POST',
      data: { code, appId },
      auth: false
    }),

  sendSms: (phoneNumber: string, purpose: 'login' | 'bind' | 'merge') =>
    callApi<{
      sentAt: string
      expiresInSec: number
      devHint?: string | null
    }>('/auth/phone/send-sms', {
      method: 'POST',
      data: { phoneNumber, purpose },
      auth: false
    }),

  verifyPhone: (phoneNumber: string, code: string, purpose: 'login') =>
    callApi<LoginResponse>('/auth/phone/verify', {
      method: 'POST',
      data: { phoneNumber, code, purpose },
      auth: false
    }),

  logout: () => callApi<{ ok: boolean }>('/auth/logout', { method: 'POST' })
}

export const meApi = {
  get: () => callApi<CloudUser>('/me'),

  update: (data: Partial<Pick<CloudUser, 'nickname' | 'avatar'>>) =>
    callApi<{ id: string; nickname: string; avatar: string }>('/me', {
      method: 'PATCH',
      data
    }),

  bindPhone: (phoneNumber: string, code: string) =>
    callApi<{ bound: boolean; conflictUserId?: string; hint?: string }>(
      '/me/bind-phone',
      { method: 'POST', data: { phoneNumber, code } }
    ),

  /**
   * 上传用户头像。filePath 来自 wx.chooseAvatar（wxfile://）或浏览器 File（不在本端实现）。
   * 返回服务端持久化后的完整 URL，可直接 PATCH /me 写入 user.avatar。
   * 不走 callApi —— Taro.uploadFile 是独立的 multipart 通道，需要自己注入 token。
   */
  uploadAvatar: (filePath: string) =>
    new Promise<{ url: string }>((resolve, reject) => {
      const accessToken = useAuthStore.getState().accessToken
      Taro.uploadFile({
        url: `${API_BASE_URL}/me/avatar`,
        filePath,
        name: 'file',
        header: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        success: (res) => {
          try {
            const body = JSON.parse(res.data) as {
              code: number
              data?: { url: string }
              message?: string
            }
            if (body.code === 0 && body.data?.url) {
              resolve({ url: body.data.url })
            } else {
              reject(new Error(body.message ?? '上传失败'))
            }
          } catch {
            reject(new Error('上传响应解析失败'))
          }
        },
        fail: (err) => reject(new Error(err.errMsg || '上传失败'))
      })
    }),

  unbindPhone: (code: string) =>
    callApi<{ ok: boolean }>('/me/unbind-phone', {
      method: 'POST',
      data: { code }
    }),

  mergeAccounts: (
    phoneNumber: string,
    code: string,
    strategy: 'keep_current' | 'keep_other'
  ) =>
    callApi<{ merged: boolean; primaryUserId?: string; secondaryUserId?: string }>(
      '/me/merge-accounts',
      { method: 'POST', data: { phoneNumber, code, strategy } }
    )
}
