import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Request } from 'express'
import { diskStorage, memoryStorage } from 'multer'
/**
 * multer v2 未显式导出 File 类型，这里用 Express.Multer.File 全局命名空间声明。
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
type MulterFile = Express.Multer.File
import { extname, join } from 'path'
import { mkdirSync } from 'fs'
import { randomBytes } from 'crypto'
import { VenueAuthGuard } from '../venue/venue-auth.guard'
import { CurrentVenueAccount } from '../venue/current-venue-account.decorator'
import { VenueAccountJwtPayload } from '../auth/jwt-payload'
import { BusinessException, ErrorCode } from '../common/exceptions/business.exception'
import { OssStsService } from './oss-sts.service'
import { OssDirectService } from './oss-direct.service'

function isOssEnabled(): boolean {
  return (process.env.OSS_ENABLED ?? '').toLowerCase() === 'true'
}

const UPLOAD_ROOT = process.env.UPLOAD_ROOT ?? join(process.cwd(), 'uploads')

function dayDir(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

function randomName(): string {
  return randomBytes(12).toString('hex')
}

/**
 * OSS 模式：内存暂存，server 拿到 buffer 后用主 AK 直推 OSS。
 * 本地模式：磁盘暂存，落到 UPLOAD_ROOT。
 *
 * 用工厂函数按需选择，避免 OSS 模式下还在磁盘留一份。
 */
const localStorage = diskStorage({
  destination: (req, _file, cb) => {
    const category = (req.query.category as string) || 'general'
    const safeCategory = /^[a-z0-9_-]+$/.test(category) ? category : 'general'
    const dir = join(UPLOAD_ROOT, safeCategory, dayDir())
    mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename: (_req, file, cb) => {
    cb(null, randomName() + extname(file.originalname).toLowerCase())
  }
})

/** 运行时按 OSS_ENABLED 选 storage —— OSS 模式走 memory，本地模式走 disk */
function storageFactory() {
  return isOssEnabled() ? memoryStorage() : localStorage
}

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp']

/**
 * 商家上传：
 * - OSS_ENABLED=true：前端调 GET /uploads/sts-token 拿 900s 临时凭证，直传 OSS；
 *   POST /uploads 将拒绝（410），强制走新链路；
 * - OSS_ENABLED=false：走 POST /uploads 本地 multipart 接收，dev 环境兜底用。
 */
@Controller('uploads')
@UseGuards(VenueAuthGuard)
export class UploadController {
  constructor(
    private readonly ossSts: OssStsService,
    private readonly ossDirect: OssDirectService
  ) {}

  /**
   * STS 直传令牌。前端拿到后：
   *   import OSS from 'ali-oss'
   *   const client = new OSS({ region, accessKeyId, accessKeySecret, stsToken, bucket, secure: true })
   *   const key = `${objectKeyPrefix}/${randomId}.${ext}`
   *   await client.put(key, file)
   */
  @Get('sts-token')
  async stsToken(
    @CurrentVenueAccount() jwt: VenueAccountJwtPayload,
    @Query('category') category?: string
  ) {
    if (!isOssEnabled()) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        'OSS 未启用（OSS_ENABLED=false），请使用本地上传接口'
      )
    }
    return this.ossSts.issueUploadToken(category ?? 'general', jwt.sub)
  }

  /**
   * 商家文件上传（multipart）。
   *
   * - OSS_ENABLED=true：server 收到 buffer → 用主 AK 直推 OSS → 返回 https URL；
   *   不再要求客户端引入 ali-oss SDK（避免 weapp 主包爆 2MB）
   * - OSS_ENABLED=false：落本地磁盘，dev 环境兜底
   *
   * STS 直传接口 `/uploads/sts-token` 仍然保留，给已经接入 ali-oss 的 H5
   * 老链路用；新链路推荐直接 POST 走代理。
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: storageFactory(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME.includes(file.mimetype)) {
          cb(
            new BusinessException(
              ErrorCode.BAD_REQUEST,
              `仅支持 ${ALLOWED_MIME.join(', ')}，你上传的是 ${file.mimetype}`
            ),
            false
          )
          return
        }
        cb(null, true)
      }
    })
  )
  async upload(
    @UploadedFile() file: MulterFile | undefined,
    @Req() req: Request
  ) {
    if (!file) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '未收到文件')
    }
    const category = (req.query.category as string) || 'general'
    const safeCategory = /^[a-z0-9_-]+$/.test(category) ? category : 'general'

    if (isOssEnabled()) {
      // OSS 模式：buffer 在内存里（memoryStorage），直接推 OSS
      if (!file.buffer) {
        throw new BusinessException(
          ErrorCode.INTERNAL_ERROR,
          'OSS 模式下文件未进内存，请检查 multer storage 配置'
        )
      }
      const ext = extname(file.originalname).toLowerCase()
      const relPath = `${safeCategory}/${dayDir()}/${randomName()}${ext}`
      const url = await this.ossDirect.putBuffer(
        relPath,
        file.buffer,
        file.mimetype
      )
      return { url, path: relPath, size: file.size, mime: file.mimetype }
    }

    // 本地磁盘模式：multer diskStorage 已经把文件写好，用它给的 filename
    const relPath = `${safeCategory}/${dayDir()}/${file.filename}`
    const origin = `${req.protocol}://${req.get('host')}`
    return {
      url: `${origin}/uploads/${relPath}`,
      path: relPath,
      size: file.size,
      mime: file.mimetype
    }
  }
}
