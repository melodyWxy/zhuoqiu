import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards
} from '@nestjs/common'
import { Type } from 'class-transformer'
import { IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator'
import { VenueService } from './venue.service'
import { UpdateVenueDto } from './dto/venue-update.dto'
import { VenueAuthGuard } from './venue-auth.guard'
import { CurrentVenueAccount } from './current-venue-account.decorator'
import { RequireClient } from './require-client.decorator'
import { VenueAccountJwtPayload } from '../auth/jwt-payload'

class ListVenuesQueryDto {
  @IsOptional() @IsString()
  keyword?: string

  @IsOptional() @IsString()
  province?: string

  @IsOptional() @IsString()
  city?: string

  @IsOptional() @IsString()
  district?: string

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90)
  lat?: number

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180)
  lng?: number

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize: number = 20
}

/**
 * 公共球房接口 + 商家自家更新。
 * - GET /v1/venues、:id  公开（无 token）
 * - PATCH /v1/venue/me/venue  商家 owner，限 admin_web client
 */
@Controller()
export class VenueController {
  constructor(private readonly service: VenueService) {}

  @Get('venues')
  async list(@Query() q: ListVenuesQueryDto) {
    return this.service.listPublic({
      keyword: q.keyword,
      province: q.province,
      city: q.city,
      district: q.district,
      lat: q.lat,
      lng: q.lng,
      page: q.page,
      pageSize: q.pageSize
    })
  }

  @Get('venues/:id')
  async detail(@Param('id') id: string) {
    return { venue: await this.service.getPublic(id) }
  }

  @Patch('venue/me/venue')
  @UseGuards(VenueAuthGuard)
  @RequireClient('admin_web')
  @HttpCode(HttpStatus.OK)
  async updateOwn(
    @CurrentVenueAccount() jwt: VenueAccountJwtPayload,
    @Body() dto: UpdateVenueDto
  ) {
    const openHoursJson = dto.openHours
      ? Object.fromEntries(dto.openHours.map((i) => [i.day, i.hours]))
      : undefined
    const venue = await this.service.updateOwnVenue(jwt.sub, {
      name: dto.name,
      province: dto.province,
      city: dto.city,
      district: dto.district,
      address: dto.address,
      phone: dto.phone,
      coverImage: dto.coverImage,
      tablesCount: dto.tablesCount,
      openHoursJson,
      description: dto.description
    })
    return { venue }
  }
}
