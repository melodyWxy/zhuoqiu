/**
 * avatar 兼容老 emoji 与新 URL：
 *  - 历史 / 默认头像：单字符 emoji（'🎱' / '🧍' 等）→ 直接当文本渲染
 *  - 微信登录后的头像：完整 http(s) URL（也兼容 wxfile:// 临时路径）
 *
 * 用 isAvatarUrl(value) 判断后再选 Image / Text。
 */
export function isAvatarUrl(value: string | null | undefined): boolean {
  if (!value) return false
  return /^(https?:|wxfile:|cloud:|file:|\/\/)/.test(value)
}
