import { Type } from 'class-transformer'
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested
} from 'class-validator'
import { OpenHoursItemDto } from './venue-application.dto'

export class UpdateVenueDto {
  @IsOptional() @IsString() @Length(2, 128)
  name?: string

  @IsOptional() @IsString() @Length(2, 255)
  address?: string

  @IsOptional() @IsString() @Matches(/^\+?\d{8,15}$/)
  phone?: string

  @IsOptional() @IsString() @Length(0, 512)
  coverImage?: string

  @IsOptional() @IsInt() @Min(1) @Max(200)
  tablesCount?: number

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpenHoursItemDto)
  openHours?: OpenHoursItemDto[]

  @IsOptional() @IsString() @Length(0, 2000)
  description?: string
}
