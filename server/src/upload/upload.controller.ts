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
import { diskStorage } from 'multer'
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

const storage = diskStorage({
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
  constructor(private readonly ossSts: OssStsService) {}

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

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage,
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
    if (isOssEnabled()) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        'OSS 已启用，请改用 /uploads/sts-token 走客户端直传'
      )
    }
    if (!file) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '未收到文件')
    }
    const category = (req.query.category as string) || 'general'
    const safeCategory = /^[a-z0-9_-]+$/.test(category) ? category : 'general'
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
