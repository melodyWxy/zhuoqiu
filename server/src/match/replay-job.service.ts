import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  forwardRef
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ReplayStatus } from '@prisma/client'
import { ReplayRendererService } from './replay-renderer.service'
import { OssDirectService } from '../upload/oss-direct.service'
import { MatchService } from './match.service'
import { WxacodeService } from './wxacode.service'

/**
 * 战报海报生成 job：异步触发 → render → OSS 上传 → 写回 Match 表
 *
 * 触发时机：
 *   1. MatchService.endMatch / forceEnd 内 setImmediate 调 generate(matchId)
 *   2. 进程重启时 onApplicationBootstrap 扫超过 5 分钟还 pending 的 match
 *   3. admin 手动调 generate(matchId, { force: true })
 *
 * 幂等：默认不重复生成 24h 内已 ready 的；force=true 强制覆盖
 */
@Injectable()
export class ReplayJobService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReplayJobService.name)
  private readonly RECOVER_AFTER_MS = 5 * 60 * 1000  // 5 分钟
  private readonly REUSE_TTL_MS = 24 * 60 * 60 * 1000 // 24 小时

  constructor(
    private readonly prisma: PrismaService,
    private readonly renderer: ReplayRendererService,
    private readonly oss: OssDirectService,
    private readonly wxacode: WxacodeService,
    @Inject(forwardRef(() => MatchService))
    private readonly matchService: MatchService
  ) {}

  async onApplicationBootstrap() {
    if (!this.oss.isEnabled()) {
      this.logger.log('OSS_ENABLED=false → skip recover')
      return
    }
    try {
      await this.recoverStale()
    } catch (e) {
      this.logger.error(`recoverStale failed: ${(e as Error).message}`)
    }
  }

  /**
   * 重启恢复：扫所有 endedAt 已超过 5min 但 replayStatus 仍 pending 的 match，
   * 重新入队。这能 cover 进程崩溃 / 部署重启时正在 render 的 match。
   */
  private async recoverStale() {
    const cutoff = new Date(Date.now() - this.RECOVER_AFTER_MS)
    const stale = await this.prisma.match.findMany({
      where: {
        replayStatus: ReplayStatus.pending,
        endedAt: { not: null, lt: cutoff }
      },
      select: { id: true },
      take: 50 // 一次最多恢复 50 个
    })
    if (stale.length === 0) return
    this.logger.log(`recoverStale: ${stale.length} pending matches re-queued`)
    for (const m of stale) {
      setImmediate(() => this.generateSafe(m.id))
    }
  }

  /**
   * fire-and-forget 包装：不抛异常，仅记日志。给 setImmediate 用。
   */
  generateSafe(matchId: string, opts?: { force?: boolean }): void {
    this.generate(matchId, opts).catch((e) => {
      this.logger.error(`generate(${matchId}) failed: ${(e as Error).message}`)
    })
  }

  /**
   * 主流程：拉数据 → render → upload → 写回。
   * 失败重试 3 次（指数退避）；最终失败把 status=failed 落库。
   */
  async generate(
    matchId: string,
    opts?: { force?: boolean }
  ): Promise<{ posterUrl: string | null; status: ReplayStatus }> {
    if (!this.oss.isEnabled()) {
      this.logger.warn(`OSS disabled, cannot generate poster for ${matchId}`)
      return { posterUrl: null, status: ReplayStatus.failed }
    }

    // 幂等：24h 内已 ready 直接复用
    if (!opts?.force) {
      const existing = await this.prisma.match.findUnique({
        where: { id: matchId },
        select: { replayStatus: true, replayPosterUrl: true, replayGeneratedAt: true }
      })
      if (
        existing?.replayStatus === ReplayStatus.ready &&
        existing.replayPosterUrl &&
        existing.replayGeneratedAt &&
        Date.now() - existing.replayGeneratedAt.getTime() < this.REUSE_TTL_MS
      ) {
        return { posterUrl: existing.replayPosterUrl, status: ReplayStatus.ready }
      }
    }

    // mark pending
    await this.prisma.match.update({
      where: { id: matchId },
      data: { replayStatus: ReplayStatus.pending }
    })

    let lastErr: Error | null = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const replay = await this.matchService.replay(matchId)
        const isNineBall = replay.detail.type === 'nine_ball'
        const computed = replay.detail.computed as {
          scores?: Record<number, number>
          wins?: Record<number, number>
        }
        const scores: Record<number, number> = isNineBall
          ? (computed.scores ?? {})
          : (computed.wins ?? {})

        // C-2：拉小程序码 PNG（失败不阻塞海报，海报会用占位）
        const qrPng = await this.fetchWxacode(matchId)
        // 小程序码独立上传一份（admin / 调试用）
        let qrUrl: string | null = null
        if (qrPng) {
          try {
            qrUrl = await this.oss.putBuffer(
              `replay/${matchId}/qr.png`,
              qrPng,
              'image/png'
            )
          } catch (e) {
            this.logger.warn(`qr OSS upload failed: ${(e as Error).message}`)
          }
        }

        const buf = await this.renderer.render({
          matchType: replay.detail.type,
          matchCode: replay.detail.code,
          players: replay.detail.players
            .filter((p) => p.isCurrent)
            .map((p) => ({
              slot: p.slot,
              displayName: p.displayName,
              avatar: p.avatar
            })),
          scores,
          narrative: replay.narrative,
          qrPng
        })

        const url = await this.oss.putBuffer(
          `replay/${matchId}/poster.png`,
          buf,
          'image/png'
        )

        await this.prisma.match.update({
          where: { id: matchId },
          data: {
            replayStatus: ReplayStatus.ready,
            replayPosterUrl: url,
            replayQrUrl: qrUrl,
            replayGeneratedAt: new Date(),
            replayFailedReason: null
          }
        })
        this.logger.log(`poster ready ${matchId} (attempt ${attempt})`)
        return { posterUrl: url, status: ReplayStatus.ready }
      } catch (e) {
        lastErr = e as Error
        this.logger.warn(
          `attempt ${attempt}/3 failed ${matchId}: ${lastErr.message}`
        )
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 1000 * attempt))
        }
      }
    }

    // 3 次都败：落 failed 状态
    await this.prisma.match.update({
      where: { id: matchId },
      data: {
        replayStatus: ReplayStatus.failed,
        replayFailedReason: lastErr?.message?.slice(0, 500) ?? 'unknown'
      }
    })
    this.logger.error(`poster failed ${matchId}: ${lastErr?.message}`)
    return { posterUrl: null, status: ReplayStatus.failed }
  }

  /**
   * 拉小程序码 PNG。
   * - matchId 是 32+ 字符长哈希；scene 限 32 字符 → 取尾 12 字符（碰撞概率
   *   极低）+ `m=` 前缀
   * - 没发版的小程序（开发版纯本地）拉 wxacode 会报 41030；本期容忍这种
   *   失败（返回 null，海报会用占位）
   * - WX_REPLAY_ENV_VERSION 环境变量控制版本：默认 release；体验阶段可传
   *   trial
   */
  private async fetchWxacode(matchId: string): Promise<Buffer | null> {
    try {
      const suffix = matchId.slice(-12)
      const scene = `m=${suffix}`
      const envVersion = (process.env.WX_REPLAY_ENV_VERSION ?? 'release') as
        | 'release'
        | 'trial'
        | 'develop'
      return await this.wxacode.getUnlimited(scene, 'pages/match-detail/index', envVersion)
    } catch (e) {
      this.logger.warn(
        `wxacode failed for ${matchId}, fallback to placeholder: ${(e as Error).message}`
      )
      return null
    }
  }
}
