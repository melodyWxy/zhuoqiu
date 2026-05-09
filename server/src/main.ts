import 'reflect-metadata'
import { NestFactory, Reflector } from '@nestjs/core'

// BigInt 全局序列化：Prisma 的 BigInt 字段（serverSeq / id 等）直接 JSON.stringify 会报错
// 对 MVP 来说数量级不会爆 Number.MAX_SAFE_INTEGER，转 number 即可
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(BigInt.prototype as any).toJSON = function () {
  return Number(this)
}
import { ConfigService } from '@nestjs/config'
import { Logger, ValidationPipe } from '@nestjs/common'
import { AppModule } from './app.module'
import { ResponseInterceptor } from './common/interceptors/response.interceptor'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import { AppConfig } from './config/configuration'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
    cors: {
      origin: true,
      credentials: true
    }
  })
  const config = app.get(ConfigService<AppConfig>)
  const port = config.get('port', { infer: true }) ?? 3001
  const prefix = config.get('globalPrefix', { infer: true }) ?? 'v1'

  app.setGlobalPrefix(prefix)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false
    })
  )
  app.useGlobalInterceptors(new ResponseInterceptor())
  app.useGlobalFilters(new AllExceptionsFilter())

  await app.listen(port, '0.0.0.0')

  const logger = new Logger('Bootstrap')
  logger.log(`服务端启动成功 → http://localhost:${port}/${prefix}`)
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err)
  process.exit(1)
})
