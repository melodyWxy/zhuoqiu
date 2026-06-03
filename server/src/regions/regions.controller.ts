import { Controller, Get } from '@nestjs/common'
import { RegionsService } from './regions.service'

/**
 * 公开行政区划接口。无 token，配额由 24h 缓存兜底（每天对腾讯只调 1 次）。
 * c 端 / admin-web 都从这拉省市区树。
 */
@Controller('regions')
export class RegionsController {
  constructor(private readonly service: RegionsService) {}

  @Get()
  async list() {
    return { tree: await this.service.getTree() }
  }
}
