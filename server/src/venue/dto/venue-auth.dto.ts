import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches
} from 'class-validator'

export class VenueSendSmsDto {
  @IsString()
  @Matches(/^\+?\d{8,15}$/, { message: '手机号格式不对' })
  phoneNumber!: string
}

export class VenueVerifySmsDto {
  @IsString()
  @Matches(/^\+?\d{8,15}$/, { message: '手机号格式不对' })
  phoneNumber!: string

  @IsString()
  @Length(6, 6)
  code!: string

  @IsString()
  @IsIn(['admin_web', 'c_app'])
  client!: 'admin_web' | 'c_app'

  @IsOptional()
  @IsString()
  @Length(1, 32)
  nickname?: string // 首次登录可指定昵称；不传则用 "商家_<尾4位>"
}

export class VenueRefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string
}
