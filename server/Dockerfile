###############################################
# build stage
###############################################
FROM node:20-alpine AS builder

WORKDIR /app

# Install build deps for some native packages (bcrypt 等) + openssl (Prisma)
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories \
    && apk add --no-cache python3 make g++ libc6-compat openssl

COPY package*.json ./
COPY prisma ./prisma

# 生产构建也需要 devDependencies（nest / prisma / ts-node）
RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY src ./src

RUN npx prisma generate
RUN npm run build

###############################################
# runner stage
###############################################
FROM node:20-alpine AS runner

WORKDIR /app

RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories \
    && apk add --no-cache tini libc6-compat openssl

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
