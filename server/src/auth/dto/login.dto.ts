import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class AdminLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  username!: string

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(128)
  password!: string

  @IsOptional()
  @IsString()
  captcha?: string
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  oldPassword!: string

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string
}
