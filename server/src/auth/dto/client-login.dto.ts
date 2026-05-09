import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength
} from 'class-validator'
import { PhoneCodePurpose } from '@prisma/client'

export class WechatLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  code!: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  appId?: string
}

export class DouyinLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  code!: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  appId?: string
}

export class SendSmsDto {
  @IsString()
  @Matches(/^\+?\d{8,15}$/, { message: '手机号格式不正确' })
  phoneNumber!: string

  @IsEnum(PhoneCodePurpose)
  purpose!: PhoneCodePurpose
}

export class VerifySmsDto {
  @IsString()
  @Matches(/^\+?\d{8,15}$/)
  phoneNumber!: string

  @IsString()
  @Length(6, 6)
  code!: string

  @IsEnum(PhoneCodePurpose)
  purpose!: PhoneCodePurpose
}
