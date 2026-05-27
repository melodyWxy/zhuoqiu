import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Request } from 'express'
import { diskStorage, memoryStorage } from 'multer'
import { extname, join } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { randomBytes } from 'crypto'
import { OssDirectService } from '../upload/oss-direct.service'
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Matches
} from 'class-validator'
import { UserAuthGuard } from '../auth/user-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { UserJwtPayload } from '../auth/jwt-payload'
import { UsersService } from '../users/users.service'
import { SmsService } from '../auth/sms.service'
import { BusinessException, ErrorCode } from '../common/exceptions/business.exception'
import { PhoneCodePurpose } from '@prisma/client'

type MulterFile = Express.Multer.File

const AVATAR_UPLOAD_ROOT = process.env.UPLOAD_ROOT ?? join(process.cwd(), 'uploads')
const AVATAR_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp']

function avatarDayDir(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
    d.getDate()
  ).padStart(2, '0')}`
}

// 内存暂存：拿到 buffer 后由 controller 决定推 OSS 还是落本地磁盘
const avatarStorage = memoryStorage()

class UpdateMeDto {
  @IsOptional()
  @IsString()
  @Length(1, 32)
  nickname?: string

  /**
   * 兼容历史 emoji（短）和新版 URL（最多 512 字符）。
   * 历史：'🎱' / '🧍' 等单字符 emoji；新版微信头像：上传到 /me/avatar 后拿到的完整 URL。
   */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatar?: string
}

class BindPhoneDto {
  @IsString()
  @Matches(/^\+?\d{8,15}$/)
  phoneNumber!: string

  @IsString()
  @Length(6, 6)
  code!: string
}

class UnbindPhoneDto {
  @IsString()
  @Length(6, 6)
  code!: string
}

class MergeAccountsDto {
  @IsString()
  @Matches(/^\+?\d{8,15}$/)
  phoneNumber!: string

  @IsString()
  @Length(6, 6)
  code!: string

  @IsEnum(['keep_current', 'keep_other'])
  strategy!: 'keep_current' | 'keep_other'
}

@Controller('me')
@UseGuards(UserAuthGuard)
export class MeController {
  constructor(
    private readonly usersService: UsersService,
    private readonly smsService: SmsService,
    private readonly ossDirect: OssDirectService
  ) {}

  @Get()
  async me(@CurrentUser() user: UserJwtPayload) {
    const u = await this.usersService.getPublic(user.sub)
    if (!u) {
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '用户不存在')
    }
    return {
      id: u.id,
      nickname: u.nickname,
      avatar: u.avatar,
      phoneNumber: u.phoneNumber
        ? u.phoneNumber.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
        : null,
      primarySource: u.primarySource,
      wechatBinding: u.wechatBindings[0] ?? null,
      douyinBinding: u.douyinBindings[0] ?? null,
      createdAt: u.createdAt,
      lastActiveAt: u.lastActiveAt
    }
  }

  @Patch()
  async update(
    @CurrentUser() user: UserJwtPayload,
    @Body() dto: UpdateMeDto
  ) {
    const updated = await this.usersService.updateProfile(user.sub, dto)
    return {
      id: updated.id,
      nickname: updated.nickname,
      avatar: updated.avatar
    }
  }

  /**
   * 用户头像上传。
   * - 由 LoginSheet wechat_profile step 触发：客户端从微信 chooseAvatar 拿 wxfile 临时路径，
   *   再用 Taro.uploadFile 把文件 multipart 推到本接口
   * - OSS_ENABLED=true → 用 server 主 AK 直接 PutObject 到阿里云 OSS，返回 https URL（生产）
   * - OSS_ENABLED=false → 落到本地磁盘 + 静态目录返回 URL（dev 兜底）
   */
  @Post('avatar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: avatarStorage,
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!AVATAR_ALLOWED_MIME.includes(file.mimetype)) {
          cb(
            new BusinessException(
              ErrorCode.BAD_REQUEST,
              `仅支持 ${AVATAR_ALLOWED_MIME.join(', ')}，你上传的是 ${file.mimetype}`
            ),
            false
          )
          return
        }
        cb(null, true)
      }
    })
  )
  async uploadAvatar(
    @CurrentUser() user: UserJwtPayload,
    @UploadedFile() file: MulterFile | undefined,
    @Req() req: Request
  ) {
    if (!file || !file.buffer) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '未收到文件')
    }
    const ext = extname(file.originalname).toLowerCase() || '.png'
    const filename = `${user.sub}-${randomBytes(8).toString('hex')}${ext}`
    const key = `avatar/${avatarDayDir()}/${filename}`

    // 生产：直推 OSS
    if (this.ossDirect.isEnabled()) {
      const url = await this.ossDirect.putBuffer(key, file.buffer, file.mimetype)
      return { url, path: key, size: file.size, mime: file.mimetype }
    }

    // 开发兜底：写本地磁盘
    const dir = join(AVATAR_UPLOAD_ROOT, 'avatar', avatarDayDir())
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, filename), file.buffer)
    // 信任 caddy/nginx 反代的 X-Forwarded-Proto（main.ts 已开 trust proxy），保证 https
    const origin = `${req.protocol}://${req.get('host')}`
    return {
      url: `${origin}/uploads/${key}`,
      path: key,
      size: file.size,
      mime: file.mimetype
    }
  }

  @Post('bind-phone')
  @HttpCode(HttpStatus.OK)
  async bindPhone(
    @CurrentUser() user: UserJwtPayload,
    @Body() dto: BindPhoneDto
  ) {
    await this.smsService.verifyCode(
      dto.phoneNumber,
      dto.code,
      PhoneCodePurpose.bind
    )
    try {
      const r = await this.usersService.bindPhone(user.sub, dto.phoneNumber)
      if (r.conflictUserId) {
        // 手机号属于另一账号 → 返回冲突提示，客户端走合并流程
        return {
          bound: false,
          conflictUserId: r.conflictUserId,
          hint: '该手机号已被另一个账号使用，是否合并？'
        }
      }
      return { bound: true }
    } catch (e) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        (e as Error).message ?? '绑定失败'
      )
    }
  }

  @Post('unbind-phone')
  @HttpCode(HttpStatus.OK)
  async unbindPhone(
    @CurrentUser() user: UserJwtPayload,
    @Body() dto: UnbindPhoneDto
  ) {
    const u = await this.usersService.getById(user.sub)
    if (!u?.phoneNumber) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '未绑定手机号')
    }
    await this.smsService.verifyCode(
      u.phoneNumber,
      dto.code,
      PhoneCodePurpose.bind
    )
    try {
      await this.usersService.unbindPhone(user.sub)
      return { ok: true }
    } catch (e) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        (e as Error).message ?? '解绑失败'
      )
    }
  }

  @Post('merge-accounts')
  @HttpCode(HttpStatus.OK)
  async merge(
    @CurrentUser() user: UserJwtPayload,
    @Body() dto: MergeAccountsDto
  ) {
    await this.smsService.verifyCode(
      dto.phoneNumber,
      dto.code,
      PhoneCodePurpose.merge
    )
    // 找到手机号对应的另一个账号
    const me = await this.usersService.getById(user.sub)
    if (!me) throw new BusinessException(ErrorCode.UNAUTHORIZED, '账号不存在')

    // 若当前账号手机号恰好等于要合并的手机号 → 已经是同一账号
    if (me.phoneNumber === dto.phoneNumber) {
      return { merged: false, reason: '当前账号已绑定该手机号' }
    }

    // 要合并的另一账号
    const theOther = await this.usersService['prisma'].user.findUnique({
      where: { phoneNumber: dto.phoneNumber }
    })
    if (!theOther) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '目标手机号未注册，无需合并'
      )
    }
    if (theOther.id === user.sub) {
      return { merged: false, reason: '目标账号就是当前账号' }
    }

    const [primaryId, secondaryId] =
      dto.strategy === 'keep_current'
        ? [user.sub, theOther.id]
        : [theOther.id, user.sub]

    try {
      await this.usersService.mergeUsers(primaryId, secondaryId)
    } catch (e) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        (e as Error).message ?? '合并失败'
      )
    }
    return { merged: true, primaryUserId: primaryId, secondaryUserId: secondaryId }
  }
}
