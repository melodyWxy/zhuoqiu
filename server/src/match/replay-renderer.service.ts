import { Injectable, Logger } from '@nestjs/common'
import {
  createCanvas,
  GlobalFonts,
  loadImage,
  SKRSContext2D
} from '@napi-rs/canvas'
import { existsSync } from 'fs'
import type { Narrative } from './replay-narrative'

interface PlayerLite {
  slot: number
  displayName: string
  /** OSS https URL 或 emoji 字面量；空则兜底 🧍 */
  avatar: string | null
}

export interface RenderInput {
  matchType: 'nine_ball' | 'eight_ball'
  matchCode: string | null
  players: PlayerLite[]
  scores: Record<number, number>
  narrative: Narrative
  /** Phase C-2 把小程序码 PNG buffer 传进来；C-1 暂时为 null，绘"扫码看战报"占位 */
  qrPng?: Buffer | null
}

const W = 1080
const H = 1920

const COLOR_BG = '#0a0f0d'
const COLOR_PRIMARY = '#1a2f23'
const COLOR_ACCENT = '#d4af37'
const COLOR_TEXT_PRIMARY = '#ffffff'
const COLOR_TEXT_SECONDARY = '#a0a8a4'

/**
 * 战报海报渲染：1080×1920 PNG buffer。
 *
 * 字体策略：
 *   - 容器（Alpine）：apk add font-noto-cjk + font-noto-emoji 后注册
 *     /usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc 等
 *   - macOS dev：fallback 到 PingFang.ttc
 *   - 都没有：依赖 @napi-rs/canvas 默认字体（中文可能渲染成方块，但海报
 *     生成不会崩；开发环境警告即可）
 */
@Injectable()
export class ReplayRendererService {
  private readonly logger = new Logger(ReplayRendererService.name)
  private fontReady = false

  private ensureFonts(): void {
    if (this.fontReady) return
    const candidates: Array<[string, string]> = [
      // Linux Alpine（Dockerfile 里 apk add font-noto-cjk）
      ['/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc', 'CJK'],
      ['/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc', 'CJK Bold'],
      // Linux Debian
      ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 'CJK'],
      // macOS dev
      ['/System/Library/Fonts/PingFang.ttc', 'CJK']
    ]
    let registered = 0
    for (const [path, family] of candidates) {
      if (existsSync(path)) {
        try {
          GlobalFonts.registerFromPath(path, family)
          registered++
        } catch (e) {
          this.logger.warn(`register font failed: ${path} ${(e as Error).message}`)
        }
      }
    }
    if (registered === 0) {
      this.logger.warn(
        'no CJK font found; poster CN text may render as squares. Install font-noto-cjk in container.'
      )
    }
    this.fontReady = true
  }

  /**
   * 渲染海报。
   * @returns PNG buffer (1080×1920)
   */
  async render(input: RenderInput): Promise<Buffer> {
    this.ensureFonts()
    const canvas = createCanvas(W, H)
    const ctx = canvas.getContext('2d')

    // 1. 底色 + 顶部金色高光
    ctx.fillStyle = COLOR_BG
    ctx.fillRect(0, 0, W, H)
    const grad = ctx.createLinearGradient(0, 0, 0, 800)
    grad.addColorStop(0, 'rgba(212,175,55,0.18)')
    grad.addColorStop(1, 'rgba(212,175,55,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, 800)

    // 2. 顶部 logo + 标题
    ctx.fillStyle = COLOR_ACCENT
    ctx.font = 'bold 72px "CJK Bold", "CJK", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('🎱 击球帮 · 战报', W / 2, 100)

    // 3. 比赛类型 + 房间码
    const typeText = input.matchType === 'nine_ball' ? '九球追分' : '中式八球'
    const codeText = input.matchCode ? ` · ${input.matchCode}` : ''
    ctx.fillStyle = COLOR_TEXT_SECONDARY
    ctx.font = '40px "CJK", sans-serif'
    ctx.fillText(`${typeText}${codeText}`, W / 2, 200)

    // 4. 玩家头像 + 比分（1v1 / 多人差异化）
    await this.drawPlayersBlock(ctx, input)

    // 5. 叙事 headline + subline
    ctx.fillStyle = COLOR_TEXT_PRIMARY
    ctx.font = 'bold 60px "CJK Bold", "CJK", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(this.truncate(input.narrative.headline, 22), W / 2, 1180)

    ctx.fillStyle = COLOR_ACCENT
    ctx.font = '36px "CJK", sans-serif'
    ctx.fillText('🏆 ' + input.narrative.subline, W / 2, 1280)

    // 6. 二维码区（C-1 暂用占位；C-2 替换为真小程序码 PNG）
    await this.drawQrBlock(ctx, input.qrPng ?? null)

    // 7. 底部 app 名
    ctx.fillStyle = COLOR_TEXT_SECONDARY
    ctx.font = '32px "CJK", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('击球帮 · 台球记分小程序', W / 2, H - 80)

    return canvas.toBuffer('image/png')
  }

  // ---- internal ----

  private async drawPlayersBlock(ctx: SKRSContext2D, input: RenderInput) {
    const players = [...input.players].sort(
      (a, b) => (input.scores[b.slot] ?? 0) - (input.scores[a.slot] ?? 0)
    )
    const championSlot = input.narrative.championSlot

    if (players.length === 2) {
      // 1v1：左右对阵
      const avatarSize = 220
      const yAvatar = 320
      const xLeft = W / 2 - 280 - avatarSize / 2
      const xRight = W / 2 + 280 - avatarSize / 2
      await this.drawAvatar(ctx, players[0], xLeft, yAvatar, avatarSize, players[0].slot === championSlot)
      await this.drawAvatar(ctx, players[1], xRight, yAvatar, avatarSize, players[1].slot === championSlot)

      // VS
      ctx.fillStyle = COLOR_ACCENT
      ctx.font = 'bold 80px "CJK Bold", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('VS', W / 2, yAvatar + avatarSize / 2)

      // 名字
      ctx.fillStyle = COLOR_TEXT_PRIMARY
      ctx.font = '40px "CJK", sans-serif'
      ctx.textBaseline = 'top'
      ctx.fillText(this.truncate(players[0].displayName, 8), xLeft + avatarSize / 2, yAvatar + avatarSize + 24)
      ctx.fillText(this.truncate(players[1].displayName, 8), xRight + avatarSize / 2, yAvatar + avatarSize + 24)

      // 比分大字
      const s1 = input.scores[players[0].slot] ?? 0
      const s2 = input.scores[players[1].slot] ?? 0
      ctx.fillStyle = COLOR_ACCENT
      ctx.font = 'bold 240px "CJK Bold", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(`${s1} : ${s2}`, W / 2, 880)
    } else {
      // 多人：金字塔（榜首居中放大，亚军 / 季军左右）
      const sizes = [240, 180, 180]
      const xs = [W / 2, W / 2 - 280, W / 2 + 280]
      const ys = [340, 420, 420]
      for (let i = 0; i < Math.min(3, players.length); i++) {
        const p = players[i]
        await this.drawAvatar(
          ctx,
          p,
          xs[i] - sizes[i] / 2,
          ys[i],
          sizes[i],
          p.slot === championSlot
        )
        ctx.fillStyle = COLOR_TEXT_PRIMARY
        ctx.font = i === 0 ? 'bold 36px "CJK Bold", sans-serif' : '32px "CJK", sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(this.truncate(p.displayName, 8), xs[i], ys[i] + sizes[i] + 16)
        // 分数
        ctx.fillStyle = COLOR_ACCENT
        ctx.font = 'bold 56px "CJK Bold", sans-serif'
        ctx.fillText(String(input.scores[p.slot] ?? 0), xs[i], ys[i] + sizes[i] + 60)
      }

      // 榜首 highlight
      ctx.fillStyle = COLOR_ACCENT
      ctx.font = 'bold 80px "CJK Bold", sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('🏆', xs[0], ys[0] - 80)
    }
  }

  private async drawAvatar(
    ctx: SKRSContext2D,
    p: PlayerLite,
    x: number,
    y: number,
    size: number,
    isChampion: boolean
  ) {
    ctx.save()
    // 圆形 clip
    ctx.beginPath()
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()

    // 头像内容
    const url = p.avatar ?? ''
    const isUrl = url.startsWith('http')
    if (isUrl) {
      try {
        const img = await loadImage(url)
        ctx.drawImage(img, x, y, size, size)
      } catch {
        this.fillEmojiAvatar(ctx, p.displayName?.[0] ?? '🧍', x, y, size)
      }
    } else {
      this.fillEmojiAvatar(ctx, url || '🧍', x, y, size)
    }
    ctx.restore()

    // 圆环（冠军金色，其他半透明白）
    ctx.beginPath()
    ctx.arc(x + size / 2, y + size / 2, size / 2 - 1, 0, Math.PI * 2)
    ctx.lineWidth = isChampion ? 8 : 3
    ctx.strokeStyle = isChampion ? COLOR_ACCENT : 'rgba(255,255,255,0.2)'
    ctx.stroke()
  }

  private fillEmojiAvatar(
    ctx: SKRSContext2D,
    text: string,
    x: number,
    y: number,
    size: number
  ) {
    ctx.fillStyle = COLOR_PRIMARY
    ctx.fillRect(x, y, size, size)
    ctx.fillStyle = COLOR_TEXT_PRIMARY
    ctx.font = `${Math.floor(size * 0.5)}px "CJK", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x + size / 2, y + size / 2)
  }

  private async drawQrBlock(ctx: SKRSContext2D, qrPng: Buffer | null) {
    const qrSize = 220
    const x = (W - qrSize) / 2
    const y = 1450

    // 白色圆角底
    ctx.fillStyle = '#ffffff'
    this.roundRect(ctx, x - 16, y - 16, qrSize + 32, qrSize + 32, 16)
    ctx.fill()

    if (qrPng) {
      // C-2 阶段：把小程序码 PNG 画上
      try {
        const img = await loadImage(qrPng)
        ctx.drawImage(img, x, y, qrSize, qrSize)
      } catch {
        // 真码加载失败 → 落到占位
        this.drawQrPlaceholder(ctx, x, y, qrSize)
      }
    } else {
      // C-1 占位
      this.drawQrPlaceholder(ctx, x, y, qrSize)
    }

    // 提示
    ctx.fillStyle = COLOR_TEXT_SECONDARY
    ctx.font = '28px "CJK", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('长按识别 · 立刻看战报', W / 2, y + qrSize + 36)
  }

  private drawQrPlaceholder(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    qrSize: number
  ) {
    ctx.fillStyle = '#e5e7eb'
    ctx.fillRect(x, y, qrSize, qrSize)
    ctx.fillStyle = '#6b7280'
    ctx.font = '24px "CJK", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('扫码看战报', x + qrSize / 2, y + qrSize / 2 - 10)
    ctx.font = '20px "CJK", sans-serif'
    ctx.fillText('（即将上线）', x + qrSize / 2, y + qrSize / 2 + 24)
  }

  private roundRect(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }

  private truncate(s: string, max: number): string {
    if (!s) return ''
    return s.length > max ? s.slice(0, max - 1) + '…' : s
  }
}
