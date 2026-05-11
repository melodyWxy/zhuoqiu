import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
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
import { BusinessException, ErrorCode } from '../common/exceptions/business.exception'

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
 * MVP 本地上传。生产可切 OSS，接口 schema 保持一致。
 */
@Controller('uploads')
@UseGuards(VenueAuthGuard)
export class UploadController {
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
