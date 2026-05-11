import { Type } from 'class-transformer'
import {
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min
} from 'class-validator'
import { MatchType, TournamentFormat, TournamentStatus } from '@prisma/client'

export class CreateTournamentDto {
  @IsString() @Length(2, 128)
  title!: string

  @IsIn([MatchType.nine_ball, MatchType.eight_ball])
  gameType!: MatchType

  @IsIn([
    TournamentFormat.single_elim,
    TournamentFormat.double_elim,
    TournamentFormat.round_robin,
    TournamentFormat.swiss
  ])
  format!: TournamentFormat

  @IsObject()
  rules!: Record<string, number>

  @IsInt() @Min(2) @Max(128)
  maxPlayers!: number

  @IsInt() @Min(2) @Max(128)
  minPlayers!: number

  @IsOptional() @IsInt() @Min(0)
  entryFeeCents?: number

  @IsOptional() @IsString() @Length(0, 1000)
  prizePoolText?: string

  @IsDateString()
  registrationStartsAt!: string

  @IsDateString()
  registrationEndsAt!: string

  @IsDateString()
  matchStartsAt!: string

  @IsOptional() @IsString() @Length(0, 512)
  coverImage?: string

  @IsOptional() @IsString() @Length(0, 2000)
  noticeText?: string
}

export class UpdateTournamentDto {
  @IsOptional() @IsString() @Length(2, 128)
  title?: string

  @IsOptional() @IsObject()
  rules?: Record<string, number>

  @IsOptional() @IsInt() @Min(2) @Max(128)
  maxPlayers?: number

  @IsOptional() @IsInt() @Min(2) @Max(128)
  minPlayers?: number

  @IsOptional() @IsInt() @Min(0)
  entryFeeCents?: number

  @IsOptional() @IsString() @Length(0, 1000)
  prizePoolText?: string

  @IsOptional() @IsDateString()
  registrationStartsAt?: string

  @IsOptional() @IsDateString()
  registrationEndsAt?: string

  @IsOptional() @IsDateString()
  matchStartsAt?: string

  @IsOptional() @IsString() @Length(0, 512)
  coverImage?: string

  @IsOptional() @IsString() @Length(0, 2000)
  noticeText?: string
}

export class RegisterTournamentDto {
  @IsOptional() @IsString() @Length(1, 32)
  displayName?: string
}

export class TournamentListQueryDto {
  @IsOptional() @IsString()
  venueId?: string

  @IsOptional()
  @IsIn([
    TournamentStatus.draft,
    TournamentStatus.registering,
    TournamentStatus.registration_closed,
    TournamentStatus.in_progress,
    TournamentStatus.completed,
    TournamentStatus.cancelled
  ])
  status?: TournamentStatus

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize: number = 20
}
