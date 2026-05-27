import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { WsAdapter } from '@nestjs/platform-ws'
import { NestExpressApplication } from '@nestjs/platform-express'
import { join } from 'path'
import { mkdirSync } from 'fs'

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

/**
 * CORS 来源白名单：
 * - CORS_ORIGINS 逗号分隔（如 "https://m.x.com,https://admin.x.com"）→ 严格匹配
 * - 留空 / "*" → 允许任意 origin（dev / 同源部署用）
 *
 * credentials=true 时浏览器不接受 ACAO=*，所以用动态函数回显具体 origin。
 */
function buildCorsConfig() {
  const raw = process.env.CORS_ORIGINS?.trim() ?? ''
  if (!raw || raw === '*') {
    return { origin: true, credentials: true }
  }
  const allow = new Set(
    raw.split(',').map((s) => s.trim()).filter(Boolean)
  )
  return {
    origin: (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void
    ) => {
      // 同源 / curl / 服务端互调没有 origin 头，放行
      if (!origin) return cb(null, true)
      if (allow.has(origin)) return cb(null, true)
      return cb(new Error(`CORS blocked: ${origin}`), false)
    },
    credentials: true
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
    cors: buildCorsConfig()
  })
  // 信任反向代理（Caddy / nginx）传过来的 X-Forwarded-Proto / Host，
  // 否则 req.protocol 会一直是 http（内网通信），上传接口拼出来的 URL 也是 http，
  // 在微信小程序里 <Image> 会静默拒绝加载。
  app.set('trust proxy', true)

  // 上传文件本地静态访问（MVP）
  const uploadRoot = process.env.UPLOAD_ROOT ?? join(process.cwd(), 'uploads')
  mkdirSync(uploadRoot, { recursive: true })
  app.useStaticAssets(uploadRoot, { prefix: '/uploads/' })
  const config = app.get(ConfigService<AppConfig>)
  const port = config.get('port', { infer: true }) ?? 3001
  const prefix = config.get('globalPrefix', { infer: true }) ?? 'v1'

  app.setGlobalPrefix(prefix)
  app.useWebSocketAdapter(new WsAdapter(app))
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
