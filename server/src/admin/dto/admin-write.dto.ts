import { IsInt, IsNotEmpty, IsOptional, IsString, Length, Min } from 'class-validator'

export class ReasonDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  reason!: string
}

export class KickPlayerDto {
  @IsString()
  @IsNotEmpty()
  userId!: string

  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  reason!: string
}

export class BanUserDto {
  @IsInt()
  @Min(0) // 0 = 永久
  durationDays!: number

  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  reason!: string
}

export class UnbanUserDto {
  @IsOptional()
  @IsString()
  @Length(0, 255)
  reason?: string
}
