###############################################
# build stage
###############################################
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++ libc6-compat

COPY package*.json ./
RUN npm ci

COPY . .
# Taro h5 输出到 /app/dist（config/index.js outputRoot=dist）
RUN npm run build:h5

###############################################
# runner stage (nginx)
###############################################
FROM nginx:alpine AS runner

RUN rm -rf /etc/nginx/conf.d/*.conf
COPY --from=builder /app/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
