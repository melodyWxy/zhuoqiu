###############################################
# build stage
###############################################
FROM node:20-alpine AS builder

WORKDIR /app

# Install build deps for some native packages (bcrypt 等) + openssl (Prisma)
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories \
    && apk add --no-cache python3 make g++ libc6-compat openssl

# 国内镜像加速：npm 源 + Prisma 引擎下载源（200MB+ 引擎走国内 CDN）
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
ENV PRISMA_BINARIES_MIRROR=https://registry.npmmirror.com/-/binary/prisma

COPY package*.json ./
COPY prisma ./prisma

# 生产构建也需要 devDependencies（nest / prisma / ts-node）
RUN npm config set registry https://registry.npmmirror.com && npm ci

COPY tsconfig*.json nest-cli.json ./
COPY src ./src

RUN npx prisma generate
RUN npm run build

###############################################
# runner stage
###############################################
FROM node:20-alpine AS runner

WORKDIR /app

# v2.22 战报海报：@napi-rs/canvas 需要 fontconfig + CJK / emoji 字体
# font-noto-cjk ≈ 100MB，是 server 必备依赖
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories \
    && apk add --no-cache \
        tini libc6-compat openssl \
        fontconfig font-noto-cjk font-noto-emoji \
    && fc-cache -f

# 保留 devDependencies：prisma CLI 和 ts-node（seed 需要）
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# 上传目录挂卷时会被覆盖，但创建目录防止启动报错
RUN mkdir -p /app/uploads

EXPOSE 3009

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

ENTRYPOINT ["/sbin/tini", "--", "/app/docker-entrypoint.sh"]
