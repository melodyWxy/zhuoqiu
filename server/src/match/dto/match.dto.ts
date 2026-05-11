import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested
} from 'class-validator'
import { MatchType } from '@prisma/client'

export class PlayerSlotDto {
  @IsInt()
  @Min(1)
  @Max(3)
  slot!: number

  @IsString()
  @IsOptional()
  @Length(0, 32)
  name?: string

  @IsBoolean()
  @IsOptional()
  claim?: boolean
}

export class CreateMatchDto {
  @IsEnum(MatchType)
  type!: MatchType

  @IsObject()
  @IsOptional()
  rules?: Record<string, number>

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlayerSlotDto)
  @ArrayMinSize(2)
  @ArrayMaxSize(3)
  playerSlots!: PlayerSlotDto[]
}

export class JoinMatchDto {
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  code!: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  slot?: number

  @IsOptional()
  @IsString()
  @Length(0, 32)
  displayName?: string
}

export class SeatActionDto {
  @IsString()
  @IsNotEmpty()
  action!: 'occupy' | 'leave'

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  slot?: number

  @IsOptional()
  @IsString()
  @Length(0, 32)
  displayName?: string
}

export class MatchEventDto {
  @IsString()
  @IsNotEmpty()
  type!: string // 见 state-machine/types.ts MatchEventType

  @IsObject()
  @IsOptional()
  payload?: Record<string, unknown>

  @IsOptional()
  @IsInt()
  clientSeq?: number
}

export class EndMatchDto {
  @IsOptional()
  @IsString()
  reason?: string
}
