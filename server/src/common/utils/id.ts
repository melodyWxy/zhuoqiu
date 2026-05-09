import { randomBytes } from 'crypto'

export function genId(prefix: string, bytes = 6): string {
  return `${prefix}_${randomBytes(bytes).toString('hex')}`
}

// 6 位大写字母+数字（避开易混字符 0/O/1/I）
const MATCH_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function genMatchCode(): string {
  const bytes = randomBytes(6)
  let out = ''
  for (let i = 0; i < 6; i++) {
    out += MATCH_CODE_ALPHABET[bytes[i] % MATCH_CODE_ALPHABET.length]
  }
  return out
}
