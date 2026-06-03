import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { GeoService } from './geo.service'
import { ResolveCityDto } from './dto/resolve-city.dto'

/**
 * 公开地理接口。无 token，配额由 GeoService 内部网格缓存兜底。
 */
@Controller('geo')
export class GeoController {
  constructor(private readonly service: GeoService) {}

  @Post('resolve-city')
  @HttpCode(HttpStatus.OK)
  async resolveCity(@Body() dto: ResolveCityDto) {
    return this.service.resolveCity(dto.lat, dto.lng)
  }
}
