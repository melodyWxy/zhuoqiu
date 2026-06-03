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

    // 1. 底色：暗绿 → 暗墨绿渐变（呼应台球桌色调而不是死黑）
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H)
    bgGrad.addColorStop(0, '#0f1f17')   // primary-dark
    bgGrad.addColorStop(0.5, '#0a0f0d') // bg-dark
    bgGrad.addColorStop(1, '#0f1f17')
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, W, H)

    // 2. 顶部金色装饰 ribbon + 高光
    const topGrad = ctx.createLinearGradient(0, 0, 0, 700)
    topGrad.addColorStop(0, 'rgba(212,175,55,0.25)')
    topGrad.addColorStop(1, 'rgba(212,175,55,0)')
    ctx.fillStyle = topGrad
    ctx.fillRect(0, 0, W, 700)

    // 顶部金色细线 + 角标
    ctx.fillStyle = COLOR_ACCENT
    ctx.fillRect(60, 80, 120, 4)
    ctx.fillRect(W - 60 - 120, 80, 120, 4)

    // 3. 顶部 logo + 标题
    ctx.fillStyle = COLOR_ACCENT
    ctx.font = 'bold 64px "CJK Bold", "CJK", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('🎱 击球帮 · 战报', W / 2, 120)

    // 4. 比赛类型 + 房间码
    const typeText = input.matchType === 'nine_ball' ? '九球追分' : '中式八球'
    const codeText = input.matchCode ? ` · ${input.matchCode}` : ''
    ctx.fillStyle = COLOR_TEXT_SECONDARY
    ctx.font = '36px "CJK", sans-serif'
    ctx.fillText(`${typeText}${codeText}`, W / 2, 220)

    // 5. 中部「比分卡」金边圆角容器（卡片化，把玩家+VS+比分包起来）
    const cardX = 60
    const cardY = 320
    const cardW = W - 120
    const cardH = 820
    // 卡片底色（半透明深绿）
    ctx.fillStyle = 'rgba(31, 44, 38, 0.85)' // bg-card 半透明
    this.roundRect(ctx, cardX, cardY, cardW, cardH, 32)
    ctx.fill()
    // 卡片金色描边
    ctx.lineWidth = 3
    ctx.strokeStyle = COLOR_ACCENT
    this.roundRect(ctx, cardX, cardY, cardW, cardH, 32)
    ctx.stroke()
    // 卡片内顶部「冠军」徽章
    ctx.fillStyle = 'rgba(212,175,55,0.25)'
    this.roundRect(ctx, W / 2 - 90, cardY - 28, 180, 56, 28)
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = COLOR_ACCENT
    this.roundRect(ctx, W / 2 - 90, cardY - 28, 180, 56, 28)
    ctx.stroke()
    ctx.fillStyle = COLOR_ACCENT
    ctx.font = 'bold 28px "CJK Bold", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('🏆 战报', W / 2, cardY)

    // 6. 玩家头像 + 比分（在比分卡内绘制）
    await this.drawPlayersBlock(ctx, input, cardX, cardY, cardW, cardH)

    // 7. 叙事 headline（卡片下方）
    ctx.fillStyle = COLOR_TEXT_PRIMARY
    ctx.font = 'bold 52px "CJK Bold", "CJK", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(this.truncate(input.narrative.headline, 22), W / 2, cardY + cardH + 40)

    // 8. 副文案（金字背景片）
    ctx.fillStyle = COLOR_ACCENT
    ctx.font = '32px "CJK", sans-serif'
    ctx.fillText(input.narrative.subline, W / 2, cardY + cardH + 120)

    // 9. 二维码区
    await this.drawQrBlock(ctx, input.qrPng ?? null)

    // 10. 底部金色装饰线 + app 名
    ctx.fillStyle = COLOR_ACCENT
    ctx.fillRect(W / 2 - 160, H - 120, 320, 2)
    ctx.fillStyle = COLOR_TEXT_SECONDARY
    ctx.font = '28px "CJK", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('击球帮 · 台球记分小程序', W / 2, H - 90)

    return canvas.toBuffer('image/png')
  }

  // ---- internal ----

  private async drawPlayersBlock(
    ctx: SKRSContext2D,
    input: RenderInput,
    cardX: number,
    cardY: number,
    cardW: number,
    cardH: number
  ) {
    const players = [...input.players].sort(
      (a, b) => (input.scores[b.slot] ?? 0) - (input.scores[a.slot] ?? 0)
    )
    const championSlot = input.narrative.championSlot
    const cardCx = cardX + cardW / 2

    if (players.length === 2) {
      // 1v1：左右对阵布局
      const avatarSize = 200
      const yAvatar = cardY + 80
      const xLeft = cardCx - 240 - avatarSize / 2
      const xRight = cardCx + 240 - avatarSize / 2
      await this.drawAvatar(ctx, players[0], xLeft, yAvatar, avatarSize, players[0].slot === championSlot)
      await this.drawAvatar(ctx, players[1], xRight, yAvatar, avatarSize, players[1].slot === championSlot)

      // VS 圆形装饰底
      ctx.fillStyle = COLOR_BG
      ctx.beginPath()
      ctx.arc(cardCx, yAvatar + avatarSize / 2, 50, 0, Math.PI * 2)
      ctx.fill()
      ctx.lineWidth = 3
      ctx.strokeStyle = COLOR_ACCENT
      ctx.stroke()
      ctx.fillStyle = COLOR_ACCENT
      ctx.font = 'bold 36px "CJK Bold", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('VS', cardCx, yAvatar + avatarSize / 2 + 2)

      // 名字
      ctx.fillStyle = COLOR_TEXT_PRIMARY
      ctx.font = 'bold 36px "CJK Bold", sans-serif'
      ctx.textBaseline = 'top'
      ctx.fillText(
        this.truncate(players[0].displayName, 8),
        xLeft + avatarSize / 2,
        yAvatar + avatarSize + 24
      )
      ctx.fillText(
        this.truncate(players[1].displayName, 8),
        xRight + avatarSize / 2,
        yAvatar + avatarSize + 24
      )

      // 比分大字 + 文字阴影立体感
      const s1 = input.scores[players[0].slot] ?? 0
      const s2 = input.scores[players[1].slot] ?? 0
      const yScore = yAvatar + avatarSize + 110
      ctx.font = 'bold 200px "CJK Bold", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      // 阴影：黑底外发光
      ctx.shadowColor = 'rgba(0,0,0,0.6)'
      ctx.shadowBlur = 24
      ctx.shadowOffsetY = 6
      ctx.fillStyle = COLOR_ACCENT
      ctx.fillText(`${s1} : ${s2}`, cardCx, yScore)
      // 重置阴影
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0

      // 比分下面的横分割线
      const yLine = yScore + 230
      ctx.fillStyle = 'rgba(212,175,55,0.4)'
      ctx.fillRect(cardCx - 200, yLine, 400, 2)

      // 「冠军 X 击败 Y」内嵌叙事
      const champ = players[0].slot === championSlot ? players[0] : players[1]
      const otherP = champ === players[0] ? players[1] : players[0]
      ctx.fillStyle = COLOR_TEXT_SECONDARY
      ctx.font = '32px "CJK", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(
        `🏆 ${this.truncate(champ.displayName, 8)} 击败 ${this.truncate(otherP.displayName, 8)}`,
        cardCx,
        yLine + 30
      )
    } else {
      // 多人：金字塔（榜首居中放大，亚军 / 季军左右）
      const sizes = [200, 150, 150]
      const xs = [cardCx, cardCx - 240, cardCx + 240]
      const ys = [cardY + 100, cardY + 180, cardY + 180]
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
        ctx.font =
          i === 0 ? 'bold 36px "CJK Bold", sans-serif' : '30px "CJK", sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(this.truncate(p.displayName, 8), xs[i], ys[i] + sizes[i] + 16)
        // 分数
        ctx.fillStyle = COLOR_ACCENT
        ctx.font = 'bold 56px "CJK Bold", sans-serif'
        ctx.fillText(String(input.scores[p.slot] ?? 0), xs[i], ys[i] + sizes[i] + 56)
      }
      // 榜首 highlight
      ctx.fillStyle = COLOR_ACCENT
      ctx.font = 'bold 60px "CJK Bold", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText('🏆', xs[0], ys[0] - 70)
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
    const qrSize = 200
    const x = (W - qrSize) / 2
    const y = 1530

    // 卡片底（深色 + 金边圆角，与中部比分卡呼应）
    const cardPad = 20
    ctx.fillStyle = 'rgba(31, 44, 38, 0.85)'
    this.roundRect(ctx, x - cardPad, y - cardPad, qrSize + cardPad * 2, qrSize + cardPad * 2, 24)
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = COLOR_ACCENT
    this.roundRect(ctx, x - cardPad, y - cardPad, qrSize + cardPad * 2, qrSize + cardPad * 2, 24)
    ctx.stroke()

    // 二维码本身（小程序码自带白底圆角，直接铺到深色卡内即可）
    if (qrPng) {
      try {
        const img = await loadImage(qrPng)
        // 给 QR 自身一个白色圆角底，避免直接糊到深色卡上不易识别
        ctx.fillStyle = '#ffffff'
        this.roundRect(ctx, x, y, qrSize, qrSize, 12)
        ctx.fill()
        ctx.drawImage(img, x, y, qrSize, qrSize)
      } catch {
        this.drawQrPlaceholder(ctx, x, y, qrSize)
      }
    } else {
      this.drawQrPlaceholder(ctx, x, y, qrSize)
    }

    // 提示
    ctx.fillStyle = COLOR_TEXT_SECONDARY
    ctx.font = '26px "CJK", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('长按识别 · 立刻看战报', W / 2, y + qrSize + cardPad + 16)
  }

  private drawQrPlaceholder(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    qrSize: number
  ) {
    // 占位：深色卡内的浅色面板
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    this.roundRect(ctx, x, y, qrSize, qrSize, 12)
    ctx.fill()
    ctx.fillStyle = COLOR_ACCENT
    ctx.font = 'bold 28px "CJK Bold", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('🎱', x + qrSize / 2, y + qrSize / 2 - 24)
    ctx.fillStyle = COLOR_TEXT_PRIMARY
    ctx.font = '22px "CJK", sans-serif'
    ctx.fillText('扫码看战报', x + qrSize / 2, y + qrSize / 2 + 16)
    ctx.fillStyle = COLOR_TEXT_SECONDARY
    ctx.font = '18px "CJK", sans-serif'
    ctx.fillText('（即将上线）', x + qrSize / 2, y + qrSize / 2 + 50)
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
