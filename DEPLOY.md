# 部署指南

一条命令部署三端（C 端 H5 + 管理后台 + NestJS 服务）+ PostgreSQL。

## 前置

- Docker 20+ 和 Docker Compose 2+
- 至少 2 GB 可用内存、10 GB 磁盘

## 快速开始

```bash
# 1. 复制环境变量模板
cp .env.example .env
# 2. 按需修改 .env（端口 / DB 密码 / JWT secret / 默认账号）
vim .env

# 3. 一键起
docker compose up -d --build
```

启动后（默认端口）：

| 端 | 访问 |
|---|---|
| C 端 H5 | http://<host>:8080 |
| 管理后台 | http://<host>:8081 |
| API（内部） | http://<host>:3001/v1 （同时通过 nginx `/v1` 反代到 H5/admin） |
| PostgreSQL | 容器内 `postgres:5432`，不对外暴露 |

前端通过 nginx 自动反代 `/v1` 和 `/uploads` 到 server 容器，所以配置域名只需要指到 H5 / admin 的端口即可，不用另外暴露 3001。

## 域名配置（可选）

`.env` 里有三个域名占位：

```env
H5_DOMAIN=m.zhuoqiu.local
ADMIN_DOMAIN=admin.zhuoqiu.local
API_DOMAIN=api.zhuoqiu.local
```

**当前 compose 里 nginx 用 `default_server`**，接收任何域名 Host 头，所以直接：

- 在你的反向代理 / 云负载均衡把 `m.xxx` 指向 `<host>:8080`
- 把 `admin.xxx` 指向 `<host>:8081`
- 把 `api.xxx` 指向 `<host>:3001`（**可选**，C 端和 admin 的请求已通过自己域名的 nginx 反代）

如果要启用 HTTPS，可在前面加一层 Caddy / Traefik / 阿里云 SLB 统一处理。

## 常用命令

```bash
# 跟日志
docker compose logs -f server
docker compose logs -f admin h5

# 重建并重启某个服务
docker compose build server && docker compose up -d server

# 进容器调试
docker compose exec server sh
docker compose exec postgres psql -U zhuoqiu zhuoqiu

# 停
docker compose down

# 停 + 清库（慎用）
docker compose down -v
```

## 数据持久化

| 卷 | 用途 |
|---|---|
| `pgdata` | PostgreSQL 数据 |
| `uploads` | 商家上传的营业执照 / 封面图 / 赛事封面 |

删除镜像不影响卷；`docker compose down -v` 会把两个卷都删掉。

## 默认账号（seed 自动创建）

- 平台管理员：`.env` 的 `SEED_SUPER_ADMIN_USERNAME` / `SEED_SUPER_ADMIN_PASSWORD`
- 开发用商家：`.env` 的 `SEED_DEV_VENUE_PHONE`（手机号登录，dev 模式验证码固定 `DEV_FIXED_SMS_CODE`）

首次启动后请：
1. admin 登录 → 改密码
2. 清空 `.env` 的 `DEV_FIXED_SMS_CODE=` 让真实短信通道生效（本期还没接，先保留）

## 上线 checklist

- [ ] `.env` 里 `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` 换 32+ 随机字符串
- [ ] 改 `POSTGRES_PASSWORD`
- [ ] 改 `SEED_SUPER_ADMIN_PASSWORD`
- [ ] 配置反向代理 HTTPS（Caddy / Nginx / 阿里云 SLB）
- [ ] （v2.11）替换文件上传为 OSS 直传
- [ ] （v2.11）接真实短信通道，清 `DEV_FIXED_SMS_CODE`

## 架构

```
Host :8080          Host :8081         Host :3001 (可选暴露)
   │                   │                   │
   ▼                   ▼                   ▼
┌─────────┐       ┌─────────┐         ┌─────────┐
│  h5     │       │  admin  │         │ server  │
│ nginx   │       │ nginx   │         │ NestJS  │
│  :80    │       │  :80    │         │  :3001  │
└────┬────┘       └────┬────┘         └────┬────┘
     │  /v1 /ws /uploads →│                   │
     └───────┬────────────┘                   │
             │                                │
             └────── docker network ──────────┘
                            │
                            ▼
                      ┌──────────┐
                      │ postgres │
                      │  :5432   │
                      └──────────┘
                            │
                            ▼
                        pgdata (卷)

                     uploads (卷) ← server
```

## 常见问题

**Q: server 启动失败，`prisma migrate deploy` 报错连不上 DB？**
A: entrypoint 里已经 `nc -z postgres 5432` 等 DB 就绪再迁移。如果还报错，查看 `docker compose logs postgres`。

**Q: admin / h5 访问 API 跨域？**
A: 不会跨域。nginx 里 `/v1/*` 反代到同一 compose 网络内的 `server:3001`，浏览器看到的是同源。

**Q: H5 访问域名是 m.xxx 但 API 在 api.xxx，如何配？**
A: 本期 H5 Nginx 默认走相对路径 `/v1`（同源）。要分域名：改 `billiards-score/src/core/api/config.ts` 的 `resolveBase()` 让它在生产环境返回 `https://api.xxx/v1`。或在 nginx 层把 `m.xxx/v1` 继续反代到 server。

**Q: 重启后 seed 会重建 admin 账号吗？**
A: 不会。seed.ts 用 `findUnique` + `if (existing) 跳过`，是幂等的。

**Q: 微信小程序请求接口为什么是 localhost？**
A: 用 `npm run build:weapp:prod`（已在 `billiards-score/package.json`），或自己 export `TARO_APP_API_BASE` / `TARO_APP_WS_BASE` 后再 `npm run build:weapp`。`build:weapp`（不带 `:prod`）保留 dev 行为，便于本机真机调试连本地 server。

**Q: 拆 API 域名部署 H5 时怎么办？**
A: 用 `npm run build:h5:prod`，或自定义生产域名 `cross-env TARO_APP_API_BASE=... TARO_APP_WS_BASE=... npm run build:h5`。同源部署（nginx 反代 `/v1`、`/ws`）下普通 `build:h5` 即可，会按 `window.location` 走同源。
