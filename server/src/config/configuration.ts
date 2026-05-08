export interface AppConfig {
  nodeEnv: string
  port: number
  globalPrefix: string
  jwt: {
    accessSecret: string
    refreshSecret: string
    accessTtl: string
    refreshTtl: string
  }
  wechat: { appId: string; appSecret: string }
  douyin: { appId: string; appSecret: string }
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3001', 10),
  globalPrefix: process.env.GLOBAL_PREFIX ?? 'v1',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d'
  },
  wechat: {
    appId: process.env.WECHAT_MP_APP_ID ?? '',
    appSecret: process.env.WECHAT_MP_APP_SECRET ?? ''
  },
  douyin: {
    appId: process.env.DOUYIN_MP_APP_ID ?? '',
    appSecret: process.env.DOUYIN_MP_APP_SECRET ?? ''
  }
})
