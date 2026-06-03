import { Injectable, Logger } from '@nestjs/common'
import {
  createCanvas,
  GlobalFonts,
  loadImage,
  SKRSContext2D
} from '@napi-rs/canvas'
import { existsSync } from 'fs'
import { join } from 'path'
import { pickVerb, type Narrative } from './replay-narrative'

interface PlayerLite {
  slot: number
  displayName: string
  /** OSS https URL 或 emoji 字面量；空则兜底首字 */
  avatar: string | null
}

export interface RenderInput {
  matchType: 'nine_ball' | 'eight_ball'
  matchCode: string | null
  players: PlayerLite[]
  scores: Record<number, number>
  narrative: Narrative
  /** 小程序码 PNG buffer；null 时绘"扫码看战报"占位 */
  qrPng?: Buffer | null
}

const W = 1080
const H = 1920
const PAD = 60
const CX = W / 2

// ---- B 版「动感对阵」配色 ----
const C_BG = '#0a0f0d'
const C_ACCENT = '#d4af37'
const C_ACCENT_BRIGHT = '#f5d76e'
const C_WHITE = '#ffffff'
const C_MUTED = '#6b7571'
const C_SECONDARY = '#a0a8a4'
const C_MTYPE = '#c9d1cc'
const C_CHIP_TEXT = '#dfe6e1'
// 左(冠军)冷蓝 / 右(亚军)暖紫
const C_BLUE = { from: '#2f6280', to: '#16303d', border: 'rgba(120,190,225,0.5)', score: '#7ec6ec', tagFg: '#8fd0ee', tagBg: 'rgba(47,98,128,0.35)' }
const C_PURPLE = { from: '#6a4a7a', to: '#34203f', border: 'rgba(190,150,210,0.5)', score: '#c79fe0', tagFg: '#cda7e0', tagBg: 'rgba(106,74,122,0.35)' }

// 字体族名（ensureFonts 里注册）
const F_CJK = 'CJK'
const F_CJK_B = 'CJK Bold'
const F_OSW5 = 'Oswald500'
const F_OSW6 = 'Oswald600'
const F_OSW7 = 'Oswald700'

/**
 * 战报海报渲染：1080×1920 PNG buffer（B 版「动感对阵」）。
 *
 * 字体策略：
 *   - 中文：容器内 apk add font-noto-cjk 提供 NotoSansCJK.ttc（macOS dev
 *     fallback PingFang），emoji 走 font-noto-emoji / 系统 emoji 字体兜底
 *   - 拉丁数字/英文标签：仓库自带 Oswald 静态字重（assets/fonts/Oswald-{500,
 *     600,700}.ttf，仅拉丁约 270KB），给大比分那种"运动条形字"用
 */
@Injectable()
export class ReplayRendererService {
  private readonly logger = new Logger(ReplayRendererService.name)
  private fontReady = false

  private ensureFonts(): void {
    if (this.fontReady) return

    // 中文（系统字体，多平台候选）
    const cjk: Array<[string, string]> = [
      ['/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc', F_CJK],
      ['/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc', F_CJK_B],
      ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', F_CJK],
      ['/System/Library/Fonts/PingFang.ttc', F_CJK],
      ['/System/Library/Fonts/PingFang.ttc', F_CJK_B]
    ]
    let cjkOk = 0
    for (const [p, fam] of cjk) {
      if (existsSync(p)) {
        try {
          GlobalFonts.registerFromPath(p, fam)
          cjkOk++
        } catch (e) {
          this.logger.warn(`register cjk font failed: ${p} ${(e as Error).message}`)
        }
      }
    }
    if (cjkOk === 0) {
      this.logger.warn(
        'no CJK font found; poster CN text may render as squares. Install font-noto-cjk.'
      )
    }

    // 拉丁数字：仓库自带 Oswald 静态字重。dev(cwd=server) 与 prod(cwd=/app) 都覆盖
    const oswald: Array<[string, string]> = [
      ['Oswald-500.ttf', F_OSW5],
      ['Oswald-600.ttf', F_OSW6],
      ['Oswald-700.ttf', F_OSW7]
    ]
    for (const [file, fam] of oswald) {
      const candidates = [
        join(process.cwd(), 'assets/fonts', file),
        join(__dirname, '../../assets/fonts', file)
      ]
      const found = candidates.find((c) => existsSync(c))
      if (found) {
        try {
          GlobalFonts.registerFromPath(found, fam)
        } catch (e) {
          this.logger.warn(`register oswald failed: ${found} ${(e as Error).message}`)
        }
      } else {
        this.logger.warn(`oswald font missing: ${file} (looked in ${candidates.join(', ')})`)
      }
    }

    this.fontReady = true
  }

  /** 渲染海报。@returns PNG buffer (1080×1920) */
  async render(input: RenderInput): Promise<Buffer> {
    this.ensureFonts()
    const canvas = createCanvas(W, H)
    const ctx = canvas.getContext('2d')

    const players = [...input.players].sort(
      (a, b) => (input.scores[b.slot] ?? 0) - (input.scores[a.slot] ?? 0)
    )
    const isDuel = players.length === 2

    // 1. 底色
    ctx.fillStyle = C_BG
    ctx.fillRect(0, 0, W, H)

    // 2. 斜切撞色 + 顶部金色光晕
    this.drawDiagonal(ctx, isDuel)
    this.drawTopGlow(ctx)

    // 3. 顶部 kicker + 比赛信息
    ctx.fillStyle = C_ACCENT
    ctx.font = `40px ${F_OSW6}`
    this.drawSpacedCentered(ctx, 'BATTLE REPORT', CX, 100, 10, C_ACCENT, true)

    const typeText = input.matchType === 'nine_ball' ? '九球追分' : '中式八球'
    const code = input.matchCode ? ` · 房间 ${input.matchCode}` : ''
    const headCount = isDuel ? '' : ` · ${players.length} 人`
    ctx.fillStyle = C_MTYPE
    ctx.font = `34px ${F_CJK}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(`${typeText}${code}${headCount}`, CX, 178)

    // 4. 主体：1v1 对阵 / 三人领奖台 / 四人及以上榜单
    // 必须 await：drawAvatar 会 loadImage 真实头像，不等就会在 toBuffer 后才画
    if (isDuel) {
      await this.drawDuel(ctx, input, players)
    } else if (players.length === 3) {
      await this.drawPodium(ctx, input, players)
    } else {
      await this.drawLeaderboard(ctx, input, players)
    }

    // 5. 底部品牌 + 二维码（两种布局共用）
    await this.drawFooter(ctx, input.qrPng ?? null)

    return canvas.toBuffer('image/png')
  }

  // ================= 1v1 =================

  private async drawDuel(ctx: SKRSContext2D, input: RenderInput, players: PlayerLite[]) {
    const champ = players[0]
    const other = players[1]
    const sChamp = input.scores[champ.slot] ?? 0
    const sOther = input.scores[other.slot] ?? 0
    const isTie = sChamp === sOther

    const arenaTop = 300
    const avSize = 240
    const avCy = arenaTop + avSize / 2
    const xL = 250
    const xR = W - 250

    // 头像：分出胜负时左侧冠军金边发光；平局两侧对称（蓝/紫各自边框，无金边）
    await this.drawAvatar(ctx, champ, xL, avCy, avSize, 40, -4, {
      grad: C_BLUE,
      border: isTie ? C_BLUE.border : C_ACCENT,
      borderW: isTie ? 4 : 6,
      glow: !isTie
    })
    await this.drawAvatar(ctx, other, xR, avCy, avSize, 40, 4, {
      grad: C_PURPLE, border: C_PURPLE.border, borderW: 4, glow: false
    })

    // 名字
    const nameTop = arenaTop + avSize + 24
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.font = `46px ${F_CJK_B}`
    ctx.fillStyle = C_WHITE
    ctx.fillText(this.fit(ctx, champ.displayName, 360), xL, nameTop)
    ctx.fillText(this.fit(ctx, other.displayName, 360), xR, nameTop)

    // 标签 pill：平局两侧都标"平局"（中性灰），否则 WINNER / 2ND
    const tagTop = nameTop + 46 + 22
    if (isTie) {
      this.drawTag(ctx, '平局', xL, tagTop, C_SECONDARY, 'rgba(255,255,255,0.1)', false)
      this.drawTag(ctx, '平局', xR, tagTop, C_SECONDARY, 'rgba(255,255,255,0.1)', false)
    } else {
      this.drawTag(ctx, 'WINNER', xL, tagTop, '#3a2c05', null, true)
      this.drawTag(ctx, '2ND', xR, tagTop, C_PURPLE.tagFg, C_PURPLE.tagBg, false)
    }

    // VS 徽章（盖在中间）
    this.drawVsBadge(ctx, CX, avCy)

    // 比分大字（平局两侧同为金色，不偏袒一方）
    const scoreTop = tagTop + 70 + 54
    const baseline = this.drawScore(ctx, sChamp, sOther, scoreTop, isTie)

    // verdict 一句话（分胜负时冠军名描金；平局对称白字）
    const verdictTop = baseline + 30
    this.drawVerdict(ctx, champ.displayName, other.displayName, sChamp - sOther, verdictTop)

    // chips（来自 narrative.subline）
    this.drawChips(ctx, input.narrative.subline, verdictTop + 54 + 30)
  }

  private drawScore(ctx: SKRSContext2D, left: number, right: number, top: number, tie = false): number {
    const wide = String(left).length > 1 || String(right).length > 1
    const numFont = `${wide ? 240 : 340}px ${F_OSW7}`
    const sepFont = `${wide ? 150 : 200}px ${F_OSW7}`
    const gap = 50
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'

    ctx.font = numFont
    const wL = ctx.measureText(String(left)).width
    const wR = ctx.measureText(String(right)).width
    ctx.font = sepFont
    const wSep = ctx.measureText(':').width
    const totalW = wL + gap + wSep + gap + wR
    const baseline = top + (wide ? 220 : 300)
    let x = CX - totalW / 2

    ctx.font = numFont
    ctx.fillStyle = C_ACCENT // 冠军金
    ctx.shadowColor = 'rgba(212,175,55,0.4)'
    ctx.shadowBlur = 50
    ctx.fillText(String(left), x, baseline)
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    x += wL + gap
    ctx.font = sepFont
    ctx.fillStyle = '#3b4843'
    ctx.fillText(':', x, baseline)
    x += wSep + gap
    ctx.font = numFont
    ctx.fillStyle = tie ? C_ACCENT : C_PURPLE.score // 平局右侧也金色，对称
    ctx.fillText(String(right), x, baseline)

    return baseline
  }

  private drawVerdict(
    ctx: SKRSContext2D,
    champName: string,
    otherName: string,
    diff: number,
    top: number
  ) {
    // 先定字体再 fit：fit 用 measureText 量宽，字体没设对会按上一个(比分大字)截错
    ctx.font = `54px ${F_CJK_B}`
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    const c = this.fit(ctx, champName, 360)
    const o = this.fit(ctx, otherName, 360)
    // 平局："A 与 B 战平"，两名对称白字；分胜负："A 力克 B"，胜者描金
    const parts =
      diff <= 0
        ? [
            { t: c, color: C_WHITE },
            { t: ' 与 ', color: C_WHITE },
            { t: o, color: C_WHITE },
            { t: ' 战平', color: C_ACCENT }
          ]
        : [
            { t: c, color: C_ACCENT },
            { t: ` ${pickVerb(diff)} `, color: C_WHITE },
            { t: o, color: C_WHITE }
          ]
    const total = parts.reduce((s, p) => s + ctx.measureText(p.t).width, 0)
    let x = CX - total / 2
    for (const p of parts) {
      ctx.fillStyle = p.color
      ctx.fillText(p.t, x, top)
      x += ctx.measureText(p.t).width
    }
  }

  private drawChips(ctx: SKRSContext2D, subline: string, top: number) {
    const chips = (subline || '').split(' · ').map((s) => s.trim()).filter(Boolean)
    if (chips.length === 0) return
    ctx.font = `32px ${F_CJK}`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    const padX = 34
    const gap = 22
    const h = 64
    const widths = chips.map((c) => ctx.measureText(c).width + padX * 2)
    const totalW = widths.reduce((a, b) => a + b, 0) + gap * (chips.length - 1)
    let x = CX - totalW / 2
    for (let i = 0; i < chips.length; i++) {
      const w = widths[i]
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      this.roundRect(ctx, x, top, w, h, h / 2)
      ctx.fill()
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'
      this.roundRect(ctx, x, top, w, h, h / 2)
      ctx.stroke()
      ctx.fillStyle = C_CHIP_TEXT
      ctx.fillText(chips[i], x + padX, top + h / 2 + 2)
      x += w + gap
    }
  }

  private drawVsBadge(ctx: SKRSContext2D, cx: number, cy: number) {
    const r = 65
    const g = ctx.createLinearGradient(cx, cy - r, cx, cy + r)
    g.addColorStop(0, '#1a2f23')
    g.addColorStop(1, '#0a0f0d')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowColor = 'rgba(212,175,55,0.4)'
    ctx.shadowBlur = 40
    ctx.lineWidth = 4
    ctx.strokeStyle = C_ACCENT
    ctx.stroke()
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.fillStyle = C_ACCENT
    ctx.font = `54px ${F_OSW7}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('VS', cx, cy + 2)
  }

  // ================= 三人领奖台 =================

  private async drawPodium(ctx: SKRSContext2D, input: RenderInput, players: PlayerLite[]) {
    const PED_BOTTOM = 1560
    type Medal = { main: string; rgb: string; gradFrom: string; gradTo: string }
    const GOLD: Medal = { main: C_ACCENT, rgb: '212,175,55', gradFrom: '#2d4a3a', gradTo: '#16271d' }
    const SILVER: Medal = { main: '#cdd6db', rgb: '205,214,219', gradFrom: '#3a4750', gradTo: '#1c2429' }
    const BRONZE: Medal = { main: '#d0925a', rgb: '208,146,90', gradFrom: '#4a3a2c', gradTo: '#241c16' }

    // 装饰层（在内容之前画，垫在底下）
    this.drawRays(ctx, CX, 900, 560)
    this.drawHalo(ctx, CX, 940, 300)
    this.drawConfetti(ctx)

    // 三列：亚(左) / 冠(中) / 季(右)
    const cols = [
      { p: players[1], score: input.scores[players[1].slot] ?? 0, cx: 245, pedW: 270, pedH: 200,
        avSize: 175, scoreFs: 84, nameFs: 40, labelFs: 90, medal: SILVER, label: '亚', champ: false },
      { p: players[2], score: input.scores[players[2].slot] ?? 0, cx: 835, pedW: 270, pedH: 150,
        avSize: 175, scoreFs: 84, nameFs: 40, labelFs: 90, medal: BRONZE, label: '季', champ: false },
      { p: players[0], score: input.scores[players[0].slot] ?? 0, cx: CX, pedW: 300, pedH: 300,
        avSize: 240, scoreFs: 120, nameFs: 50, labelFs: 120, medal: GOLD, label: '冠', champ: true }
    ]
    for (const c of cols) {
      await this.drawPodiumColumn(ctx, c, PED_BOTTOM)
    }
  }

  private async drawPodiumColumn(
    ctx: SKRSContext2D,
    c: {
      p: PlayerLite; score: number; cx: number; pedW: number; pedH: number; avSize: number
      scoreFs: number; nameFs: number; labelFs: number
      medal: { main: string; rgb: string; gradFrom: string; gradTo: string }; label: string; champ: boolean
    },
    pedBottom: number
  ) {
    const pedTop = pedBottom - c.pedH
    const left = c.cx - c.pedW / 2

    // 台座正面（金/银/铜淡色渐变 + 描边）
    const g = ctx.createLinearGradient(0, pedTop, 0, pedBottom)
    g.addColorStop(0, `rgba(${c.medal.rgb},0.30)`)
    g.addColorStop(1, `rgba(${c.medal.rgb},0.05)`)
    ctx.fillStyle = g
    this.roundRect(ctx, left, pedTop, c.pedW, c.pedH, 16)
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = `rgba(${c.medal.rgb},0.55)`
    this.roundRect(ctx, left, pedTop, c.pedW, c.pedH, 16)
    ctx.stroke()
    // 3D 顶面（细椭圆）
    ctx.fillStyle = `rgba(${c.medal.rgb},0.42)`
    ctx.beginPath()
    ctx.ellipse(c.cx, pedTop, c.pedW / 2, 14, 0, 0, Math.PI * 2)
    ctx.fill()
    // 冠/亚/季
    ctx.fillStyle = c.medal.main
    ctx.font = `${c.labelFs}px ${F_CJK_B}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(c.label, c.cx, pedTop + (c.champ ? 44 : 34))

    // 分数（台座上方）
    const scoreBottom = pedTop - 18
    ctx.font = `${c.scoreFs}px ${F_OSW7}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = c.medal.main
    if (c.champ) {
      ctx.shadowColor = 'rgba(212,175,55,0.5)'
      ctx.shadowBlur = 30
    }
    ctx.fillText(String(c.score), c.cx, scoreBottom)
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0

    // 名字
    const nameBaseline = scoreBottom - c.scoreFs * 0.75 - 16
    ctx.font = `${c.nameFs}px ${F_CJK_B}`
    ctx.fillStyle = C_WHITE
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'center'
    ctx.fillText(this.fit(ctx, c.p.displayName, c.pedW + 30), c.cx, nameBaseline)

    // 头像
    const avatarBottom = nameBaseline - c.nameFs - 22
    const avatarCy = avatarBottom - c.avSize / 2
    await this.drawAvatar(ctx, c.p, c.cx, avatarCy, c.avSize, c.champ ? 40 : 36, 0, {
      grad: { from: c.medal.gradFrom, to: c.medal.gradTo },
      border: c.medal.main,
      borderW: c.champ ? 6 : 5,
      glow: c.champ
    })

    // 冠军：皇冠 + 星芒
    if (c.champ) {
      const avatarTop = avatarCy - c.avSize / 2
      this.drawCrown(ctx, c.cx, avatarTop - 12, 132)
      this.drawSparkle(ctx, c.cx - c.avSize / 2 - 8, avatarTop + 24, 24)
      this.drawSparkle(ctx, c.cx + c.avSize / 2 + 2, avatarCy - c.avSize / 6, 16)
    }
  }

  /** 放射状金色光芒（细三角扇形），外圈用 bg 渐变淡出 */
  private drawRays(ctx: SKRSContext2D, ox: number, oy: number, R: number) {
    const count = 24
    const half = 0.05
    ctx.save()
    ctx.fillStyle = 'rgba(212,175,55,0.09)'
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(ox, oy)
      ctx.lineTo(ox + R * Math.cos(a - half), oy + R * Math.sin(a - half))
      ctx.lineTo(ox + R * Math.cos(a + half), oy + R * Math.sin(a + half))
      ctx.closePath()
      ctx.fill()
    }
    // 外圈淡出，避免硬边
    const fade = ctx.createRadialGradient(ox, oy, R * 0.45, ox, oy, R)
    fade.addColorStop(0, 'rgba(10,15,13,0)')
    fade.addColorStop(1, 'rgba(10,15,13,0.9)')
    ctx.fillStyle = fade
    ctx.fillRect(ox - R, oy - R, R * 2, R * 2)
    ctx.restore()
  }

  private drawHalo(ctx: SKRSContext2D, cx: number, cy: number, r: number) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    g.addColorStop(0, 'rgba(212,175,55,0.28)')
    g.addColorStop(1, 'rgba(212,175,55,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
  }

  /** 飘落彩色纸屑（固定布点，保证渲染可复现） */
  private drawConfetti(ctx: SKRSContext2D) {
    const pieces: Array<[number, number, number, number, string, number, boolean]> = [
      [120, 150, 18, 18, '#f5d76e', 20, true],
      [240, 260, 14, 24, '#cdd6db', 35, false],
      [340, 120, 16, 16, '#4ade80', 10, false],
      [520, 90, 14, 14, '#d0925a', 0, true],
      [700, 140, 20, 12, '#f5d76e', -25, false],
      [840, 230, 16, 16, '#7ec6ec', 15, true],
      [940, 160, 14, 22, '#cdd6db', -40, false],
      [160, 400, 14, 14, '#d0925a', 0, true],
      [900, 420, 16, 16, '#f5d76e', 30, false],
      [70, 560, 12, 20, '#4ade80', 45, false],
      [1000, 560, 14, 14, '#7ec6ec', 0, true],
      [430, 190, 12, 12, '#f5d76e', 0, true],
      [610, 300, 12, 18, '#ffffff', 25, false],
      [300, 520, 14, 14, '#cdd6db', 0, true]
    ]
    ctx.save()
    ctx.globalAlpha = 0.85
    for (const [x, y, w, h, color, rot, round] of pieces) {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate((rot * Math.PI) / 180)
      ctx.fillStyle = color
      if (round) {
        ctx.beginPath()
        ctx.arc(0, 0, w / 2, 0, Math.PI * 2)
        ctx.fill()
      } else {
        this.roundRect(ctx, -w / 2, -h / 2, w, h, 3)
        ctx.fill()
      }
      ctx.restore()
    }
    ctx.restore()
  }

  /** 矢量皇冠（金色，不依赖 emoji 字体）。cx 中心，bandBottom 冠底 y */
  private drawCrown(ctx: SKRSContext2D, cx: number, bandBottom: number, w: number) {
    const h = w * 0.62
    const bandH = h * 0.28
    const bandTop = bandBottom - bandH
    const peak = bandTop - (h - bandH)
    const midPeak = peak - h * 0.12
    const lx = cx - w / 2
    const rx = cx + w / 2

    const g = ctx.createLinearGradient(0, peak, 0, bandBottom)
    g.addColorStop(0, C_ACCENT_BRIGHT)
    g.addColorStop(1, C_ACCENT)
    ctx.fillStyle = g

    ctx.beginPath()
    ctx.moveTo(lx, bandBottom)
    ctx.lineTo(lx, peak)
    ctx.lineTo(cx - w * 0.25, bandTop + bandH * 0.2)
    ctx.lineTo(cx, midPeak)
    ctx.lineTo(cx + w * 0.25, bandTop + bandH * 0.2)
    ctx.lineTo(rx, peak)
    ctx.lineTo(rx, bandBottom)
    ctx.closePath()
    ctx.fill()

    // 冠底高光条
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    this.roundRect(ctx, lx, bandBottom - bandH * 0.5, w, bandH * 0.45, 4)
    ctx.fill()

    // 三颗宝石
    ctx.fillStyle = C_ACCENT_BRIGHT
    for (const px of [lx, cx, rx]) {
      ctx.beginPath()
      ctx.arc(px, peak, w * 0.05, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  /** 四角星芒 */
  private drawSparkle(ctx: SKRSContext2D, cx: number, cy: number, r: number) {
    const inner = r * 0.32
    ctx.save()
    ctx.fillStyle = C_ACCENT_BRIGHT
    ctx.shadowColor = 'rgba(245,215,110,0.8)'
    ctx.shadowBlur = 12
    ctx.beginPath()
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2
      const rad = i % 2 === 0 ? r : inner
      const x = cx + rad * Math.cos(a)
      const y = cy + rad * Math.sin(a)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  // ================= 多人榜单 =================

  private async drawLeaderboard(ctx: SKRSContext2D, input: RenderInput, players: PlayerLite[]) {
    const champ = players[0]
    const champTop = 280
    const cav = 260
    const cavCy = champTop + cav / 2

    await this.drawAvatar(ctx, champ, CX, cavCy, cav, 46, 0, {
      grad: { from: '#2d4a3a', to: '#16271d' }, border: C_ACCENT, borderW: 6, glow: true
    })

    // 冠军标签 + 名字 + 分数
    const tagTop = champTop + cav + 26
    this.drawTag(ctx, 'CHAMPION', CX, tagTop, '#3a2c05', null, true)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.font = `56px ${F_CJK_B}`
    ctx.fillStyle = C_WHITE
    const nameTop = tagTop + 70
    ctx.fillText(this.fit(ctx, champ.displayName, 720), CX, nameTop)
    ctx.font = `120px ${F_OSW7}`
    ctx.fillStyle = C_ACCENT
    ctx.fillText(String(input.scores[champ.slot] ?? 0), CX, nameTop + 70)

    // 名次行（2..N），自适应能放下几行
    const rowsTop = nameTop + 70 + 150
    const rowH = 120
    const rowGap = 20
    const footTop = H - 70 - 180 // 给底部 footer 留位
    const maxRows = Math.max(1, Math.floor((footTop - rowsTop) / (rowH + rowGap)))
    const rest = players.slice(1)
    const showN = Math.min(rest.length, maxRows)
    // 若放不下全部，最后一行用作"其他 N 人"
    const willOverflow = rest.length > maxRows

    for (let i = 0; i < showN; i++) {
      const y = rowsTop + i * (rowH + rowGap)
      if (willOverflow && i === showN - 1) {
        this.drawMoreRow(ctx, rest.length - (showN - 1), PAD, y, W - PAD * 2, rowH)
      } else {
        const p = rest[i]
        await this.drawRow(ctx, i + 2, p, input.scores[p.slot] ?? 0, PAD, y, W - PAD * 2, rowH)
      }
    }
  }

  private async drawRow(
    ctx: SKRSContext2D,
    rank: number,
    p: PlayerLite,
    score: number,
    x: number,
    y: number,
    w: number,
    h: number
  ) {
    ctx.fillStyle = 'rgba(255,255,255,0.05)'
    this.roundRect(ctx, x, y, w, h, 28)
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    this.roundRect(ctx, x, y, w, h, 28)
    ctx.stroke()

    const padL = 36
    // 名次
    ctx.fillStyle = C_MUTED
    ctx.font = `56px ${F_OSW7}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(rank), x + padL + 30, y + h / 2)

    // 小头像
    const avS = 80
    const avCx = x + padL + 100 + avS / 2
    await this.drawAvatar(ctx, p, avCx, y + h / 2, avS, 20, 0, {
      grad: { from: '#33414a', to: '#1c2429' }, border: 'rgba(255,255,255,0.12)', borderW: 2, glow: false
    })

    // 分数（右）
    ctx.fillStyle = '#cfd6d1'
    ctx.font = `64px ${F_OSW7}`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    const scoreRight = x + w - 40
    const scoreW = ctx.measureText(String(score)).width
    ctx.fillText(String(score), scoreRight, y + h / 2)

    // 名字（中间，截断到分数前）
    const nameLeft = avCx + avS / 2 + 30
    const nameMax = scoreRight - scoreW - 30 - nameLeft
    ctx.fillStyle = C_WHITE
    ctx.font = `44px ${F_CJK_B}`
    ctx.textAlign = 'left'
    ctx.fillText(this.fit(ctx, p.displayName, nameMax), nameLeft, y + h / 2)
  }

  private drawMoreRow(
    ctx: SKRSContext2D,
    n: number,
    x: number,
    y: number,
    w: number,
    h: number
  ) {
    ctx.fillStyle = 'rgba(255,255,255,0.03)'
    this.roundRect(ctx, x, y, w, h, 28)
    ctx.fill()
    ctx.fillStyle = C_SECONDARY
    ctx.font = `40px ${F_CJK}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`其他 ${n} 名玩家`, x + w / 2, y + h / 2)
  }

  // ================= footer =================

  private async drawFooter(ctx: SKRSContext2D, qrPng: Buffer | null) {
    const qrS = 180
    const qrX = W - PAD - qrS
    const qrY = H - 70 - qrS
    const cy = qrY + qrS / 2

    // 品牌（左）
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = C_WHITE
    ctx.font = `40px ${F_CJK_B}`
    ctx.fillText('击球帮', PAD, cy - 6)
    ctx.fillStyle = C_SECONDARY
    ctx.font = `28px ${F_CJK}`
    ctx.fillText('长按二维码 · 立刻看战报', PAD, cy + 40)

    // 二维码卡（右）
    ctx.fillStyle = C_WHITE
    this.roundRect(ctx, qrX, qrY, qrS, qrS, 28)
    ctx.fill()
    ctx.lineWidth = 5
    ctx.strokeStyle = C_ACCENT
    this.roundRect(ctx, qrX, qrY, qrS, qrS, 28)
    ctx.stroke()

    const innerPad = 14
    if (qrPng) {
      try {
        const img = await loadImage(qrPng)
        ctx.drawImage(img, qrX + innerPad, qrY + innerPad, qrS - innerPad * 2, qrS - innerPad * 2)
      } catch {
        this.drawQrPlaceholder(ctx, qrX, qrY, qrS)
      }
    } else {
      this.drawQrPlaceholder(ctx, qrX, qrY, qrS)
    }
  }

  private drawQrPlaceholder(ctx: SKRSContext2D, x: number, y: number, s: number) {
    ctx.fillStyle = '#11241a'
    this.roundRect(ctx, x + 14, y + 14, s - 28, s - 28, 14)
    ctx.fill()
    ctx.fillStyle = C_MUTED
    ctx.font = `26px ${F_CJK}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('扫码', x + s / 2, y + s / 2 - 14)
    ctx.fillText('看战报', x + s / 2, y + s / 2 + 22)
  }

  // ================= 通用绘制工具 =================

  /** 斜切撞色背景：duel 用蓝/暗/紫三段；多人用单条斜切 */
  private drawDiagonal(ctx: SKRSContext2D, twoTone: boolean) {
    // 118deg 方向向量近似：沿对角从左下到右上
    const g = ctx.createLinearGradient(0, H * 0.85, W, H * 0.15)
    if (twoTone) {
      g.addColorStop(0, '#213e4f')
      g.addColorStop(0.38, '#1a3340')
      g.addColorStop(0.38, '#0a0f0d')
      g.addColorStop(0.62, '#0a0f0d')
      g.addColorStop(0.62, '#3a2840')
      g.addColorStop(1, '#2c1f33')
    } else {
      g.addColorStop(0, '#213e4f')
      g.addColorStop(0.45, '#162a22')
      g.addColorStop(1, '#0a0f0d')
    }
    ctx.save()
    ctx.globalAlpha = 0.55
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    ctx.restore()
  }

  private drawTopGlow(ctx: SKRSContext2D) {
    const g = ctx.createRadialGradient(CX, 30, 0, CX, 30, 480)
    g.addColorStop(0, 'rgba(212,175,55,0.22)')
    g.addColorStop(0.65, 'rgba(212,175,55,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, 600)
  }

  /**
   * 圆角方头像，可旋转。先填底色渐变，再 clip 画图/首字，最后描边（含发光）。
   * cx/cy 为中心点。
   */
  private async drawAvatar(
    ctx: SKRSContext2D,
    p: PlayerLite,
    cx: number,
    cy: number,
    size: number,
    radius: number,
    rotateDeg: number,
    style: { grad: { from: string; to: string }; border: string; borderW: number; glow: boolean }
  ) {
    const half = size / 2
    const rad = (rotateDeg * Math.PI) / 180

    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(rad)
    // 底色渐变
    const g = ctx.createLinearGradient(-half, -half, half, half)
    g.addColorStop(0, style.grad.from)
    g.addColorStop(1, style.grad.to)
    this.roundRect(ctx, -half, -half, size, size, radius)
    ctx.fillStyle = g
    ctx.fill()
    // clip 内容
    ctx.save()
    this.roundRect(ctx, -half, -half, size, size, radius)
    ctx.clip()
    const url = p.avatar ?? ''
    if (url.startsWith('http')) {
      try {
        const img = await loadImage(url)
        ctx.drawImage(img, -half, -half, size, size)
      } catch {
        this.drawInitial(ctx, p.displayName, size)
      }
    } else if (url) {
      // emoji / 字面量
      this.drawInitial(ctx, url, size, true)
    } else {
      this.drawInitial(ctx, p.displayName, size)
    }
    ctx.restore()
    ctx.restore()

    // 描边（发光）
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(rad)
    if (style.glow) {
      ctx.shadowColor = 'rgba(212,175,55,0.5)'
      ctx.shadowBlur = 50
    }
    ctx.lineWidth = style.borderW
    ctx.strokeStyle = style.border
    this.roundRect(ctx, -half, -half, size, size, radius)
    ctx.stroke()
    ctx.restore()
  }

  /** 头像兜底：首字（或 emoji）居中。已在 translate(cx,cy) 坐标系内调用 */
  private drawInitial(ctx: SKRSContext2D, text: string, size: number, isEmoji = false) {
    const ch = isEmoji ? text : (text?.[0] ?? '🎱')
    ctx.fillStyle = C_WHITE
    ctx.font = `${Math.floor(size * (isEmoji ? 0.55 : 0.5))}px ${F_CJK_B}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(ch, 0, 0)
  }

  /** 胶囊标签。cx 为中心 x；win=true 用金色实底深字 */
  private drawTag(
    ctx: SKRSContext2D,
    text: string,
    cx: number,
    top: number,
    fg: string,
    bg: string | null,
    win: boolean
  ) {
    // 中文标签(如"平局")用 CJK 字体，英文标签(WINNER/2ND/CHAMPION)用 Oswald
    const hasCjk = /[㐀-鿿]/.test(text)
    ctx.font = hasCjk ? `30px ${F_CJK_B}` : `30px ${F_OSW5}`
    const spacing = 3
    const textW = this.spacedWidth(ctx, text, spacing)
    const padX = 26
    const h = 56
    const w = textW + padX * 2
    const x = cx - w / 2
    if (win) {
      const g = ctx.createLinearGradient(x, top, x, top + h)
      g.addColorStop(0, C_ACCENT_BRIGHT)
      g.addColorStop(1, C_ACCENT)
      ctx.fillStyle = g
    } else {
      ctx.fillStyle = bg ?? 'rgba(255,255,255,0.1)'
    }
    this.roundRect(ctx, x, top, w, h, h / 2)
    ctx.fill()
    ctx.fillStyle = fg
    ctx.textBaseline = 'middle'
    this.drawSpaced(ctx, text, x + padX, top + h / 2 + 1, spacing)
  }

  // ---- 文本工具 ----

  private spacedWidth(ctx: SKRSContext2D, text: string, spacing: number): number {
    let w = 0
    for (const ch of text) w += ctx.measureText(ch).width
    return w + Math.max(0, [...text].length - 1) * spacing
  }

  /** 从 startX 起逐字带间距绘制（textAlign 需为 left） */
  private drawSpaced(ctx: SKRSContext2D, text: string, startX: number, y: number, spacing: number) {
    ctx.textAlign = 'left'
    let x = startX
    for (const ch of text) {
      ctx.fillText(ch, x, y)
      x += ctx.measureText(ch).width + spacing
    }
  }

  private drawSpacedCentered(
    ctx: SKRSContext2D,
    text: string,
    cx: number,
    top: number,
    spacing: number,
    color: string,
    withDots: boolean
  ) {
    const w = this.spacedWidth(ctx, text, spacing)
    ctx.fillStyle = color
    ctx.textBaseline = 'top'
    let startX = cx - w / 2
    if (withDots) {
      const dotR = 7
      const dotGap = 26
      ctx.beginPath()
      ctx.arc(startX - dotGap, top + 20, dotR, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(cx + w / 2 + dotGap, top + 20, dotR, 0, Math.PI * 2)
      ctx.fill()
    }
    this.drawSpaced(ctx, text, startX, top, spacing)
  }

  /** 按最大宽度截断，超出加省略号。需先设好 ctx.font */
  private fit(ctx: SKRSContext2D, s: string, maxWidth: number): string {
    if (!s) return ''
    if (ctx.measureText(s).width <= maxWidth) return s
    const arr = [...s]
    let lo = 0
    let hi = arr.length
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (ctx.measureText(arr.slice(0, mid).join('') + '…').width <= maxWidth) lo = mid
      else hi = mid - 1
    }
    return arr.slice(0, Math.max(0, lo)).join('') + '…'
  }

  private roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
    const rr = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + rr, y)
    ctx.arcTo(x + w, y, x + w, y + h, rr)
    ctx.arcTo(x + w, y + h, x, y + h, rr)
    ctx.arcTo(x, y + h, x, y, rr)
    ctx.arcTo(x, y, x + w, y, rr)
    ctx.closePath()
  }
}
