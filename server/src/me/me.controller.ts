import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import { IsOptional, IsString, Length } from 'class-validator'
import { UserAuthGuard } from '../auth/user-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { UserJwtPayload } from '../auth/jwt-payload'
import { UsersService } from '../users/users.service'
import { BusinessException, ErrorCode } from '../common/exceptions/business.exception'

class UpdateMeDto {
  @IsOptional()
  @IsString()
  @Length(1, 32)
  nickname?: string

  @IsOptional()
  @IsString()
  @Length(1, 32)
  avatar?: string
}

@Controller('me')
@UseGuards(UserAuthGuard)
export class MeController {
  constructor(private readonly usersService: UsersService) {}

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
}
