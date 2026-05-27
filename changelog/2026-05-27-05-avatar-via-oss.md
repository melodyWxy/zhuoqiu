---
date: 2026-05-27
version: v2.20.x
title: 头像走阿里云 OSS 存储（替换本地磁盘）
---

# 头像走阿里云 OSS 存储

## 动机
真机上头像不显示。链路上有两个独立缺陷：

1. server 跑在 caddy 反代后面，`req.protocol` 是内网 http，拼出来的 URL `http://billiards-server.../uploads/...` 真机里被微信小程序静默拒绝（开发者工具默认勾"不校验合法域名 / 不校验 HTTPS"开关，所以模拟器看着没事）。前一次 commit `f8f623c` 加了 `app.set('trust proxy', true)` 修了 protocol。
2. 但本地磁盘存储本身在生产就是错路径：单机重启丢、域名换了 URL 就废、没有 CDN 加速、备份成本高。

正确的方案是把头像直接存阿里云 OSS，DB 只存 URL。项目里 OSS 基础设施（`OssStsService` / `OSS_*` env / docker-compose 透传）早就齐了，只是 `/me/avatar` 没接进去。

## PRD / 设计变化
无单独 PRD 章节修改 —— `prd/legal-mvp.md` 里"OSS 直传"在原文里就是计划项。

## 代码变化
### 服务端
- 新增 `server/src/upload/oss-direct.service.ts` —— `OssDirectService`：
  - 用 server 主 AccessKey 直接 PutObject 到 OSS（不走 STS，因为是 server 侧上传，AK 不出端）
  - `isEnabled()` 看 `OSS_ENABLED`；`putBuffer(key, buffer, mime)` 返回完整 https URL
  - `OSS_ENDPOINT` 配了 CNAME 走 CNAME；否则用 `https://{bucket}.{region}.aliyuncs.com/{key}`
  - 失败兜底 BusinessException 而不是 5xx
- `server/src/upload/upload.module.ts` —— providers / exports 加 `OssDirectService`
- `server/src/me/me.module.ts` —— `imports: [AuthModule, UploadModule]`
- `server/src/me/me.controller.ts`：
  - multer 从 `diskStorage` 改 `memoryStorage`（先拿 buffer，由 controller 决定推 OSS 还是落本地）
  - `POST /me/avatar` 主流程：`OSS_ENABLED=true` → `OssDirectService.putBuffer` → 返 OSS URL；否则保留写本地磁盘的兜底路径
  - 文件名用 `{userId}-{8字节random}{ext}`，便于追溯哪个用户的头像

### 不变
- 客户端（`meApi.uploadAvatar` / LoginSheet wechat_profile step）零改动 —— 拿到 URL 后照常 PATCH /me。OSS 切换对前端透明
- `OssStsService`（venue 那套 STS 直传链路）不动
- `users.avatar VARCHAR(512)` 已迁过，无需再迁

## 验证步骤
- [x] `server: npx tsc --noEmit` 通过
- [ ] 服务器 `.env` 配齐：`OSS_ENABLED=true / OSS_REGION=oss-cn-xxx / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / OSS_BUCKET`（已有的话直接用，没有就建一个 RAM 子账号给最小权限 `oss:PutObject` 限定到 `<bucket>/avatar/*`）
- [ ] `docker compose up -d --build server`（不需要 prisma migrate，schema 没改）
- [ ] 启动日志看到 `OssDirectService` 有 inject，无报错
- [ ] 真机走 wechat_profile step 选头像 → 保存 → 进「我」页面看到头像（OSS URL 是 https，免去 downloadFile 合法域名问题…等等）
- [ ] **微信公众平台后台「downloadFile 合法域名」加 OSS 域名**（如 `https://your-bucket.oss-cn-shanghai.aliyuncs.com` 或自定义 CNAME）—— 这步不能省，OSS URL 也要白名单
- [ ] curl smoke：
  ```
  curl -X POST https://billiards-server.macrobit.com.cn/v1/me/avatar \
    -H "Authorization: Bearer xxx" -F file=@head.png
  ```
  返回的 `url` 应该是 `https://<bucket>.<region>.aliyuncs.com/avatar/...` 或你的 CNAME

## 上线必做
1. 阿里云 OSS 控制台：
   - 确认 bucket 存在，权限"私有"或"公共读"（头像需要被小程序加载，**公共读**最简单）
   - 拿 AccessKeyId / AccessKeySecret（建议 RAM 子账号 + 限定 `oss:PutObject` to `acs:oss:*:*:<bucket>/avatar/*`）
2. 服务器 `.env`：
   ```
   OSS_ENABLED=true
   OSS_REGION=oss-cn-shanghai          # 改成你的 bucket 所在地域
   OSS_BUCKET=your-bucket-name
   OSS_ACCESS_KEY_ID=...
   OSS_ACCESS_KEY_SECRET=...
   # 可选：自定义 CNAME 域名
   # OSS_ENDPOINT=https://cdn.your-domain.com
   ```
3. 部署：`git pull && docker compose up -d --build server`
4. 微信公众平台：服务器域名 → **downloadFile 合法域名**追加 OSS 域名（或 CNAME），保存即生效
5. （可选）已有的本地 http 头像 URL 处理：要么让用户重传，要么 SQL `UPDATE users SET avatar='🎱' WHERE avatar LIKE 'http%' AND avatar NOT LIKE 'https://%aliyuncs.com%'` 重置回默认 emoji

## 遗留问题 / 已知限制
- 仍是 server 中转上传，不是客户端 STS 直传 —— 头像小（几十 KB）不构成瓶颈；将来需要让微信小程序也走 STS 直传得做 `wx.uploadFile` + 表单上传 OSS 的桥接
- OssDirectService 单例 client 缓存了 ali-oss 实例；改 OSS 配置需重启 server
- 没做 OSS 端的"防盗链"配置 —— 公共读 bucket 头像 URL 谁都能看，符合产品语义（头像本身就是公开信息）
- 老的本地 `uploads/avatar/` 目录不会自动清理；占盘可忽略不计
