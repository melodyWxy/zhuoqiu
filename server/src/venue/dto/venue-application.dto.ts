import { Type } from 'class-transformer'
import {
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested
} from 'class-validator'

export class OpenHoursItemDto {
  @IsString()
  @Matches(/^(mon|tue|wed|thu|fri|sat|sun)$/)
  day!: string

  /** "10:00-02:00" or "closed" */
  @IsString()
  @Length(1, 32)
  hours!: string
}

export class ApplicationPayloadDto {
  @IsString() @Length(2, 128)
  name!: string

  @IsString() @Length(2, 64)
  contactName!: string

  @IsString() @Matches(/^\+?\d{8,15}$/)
  contactPhone!: string

  @IsString() @Length(2, 255)
  address!: string

  @IsInt() @Min(1) @Max(200)
  tablesCount!: number

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpenHoursItemDto)
  openHours!: OpenHoursItemDto[]

  @IsOptional() @IsString() @Length(0, 2000)
  description?: string
}

export class SubmitApplicationDto {
  @ValidateNested()
  @Type(() => ApplicationPayloadDto)
  @IsObject()
  payload!: ApplicationPayloadDto

  @IsString() @Length(1, 512)
  licenseImage!: string

  @IsOptional() @IsString() @Length(1, 512)
  idCardImage?: string
}

export class ReviewApplicationDto {
  @IsOptional() @IsString() @Length(0, 1000)
  rejectReason?: string
}
