###############################################
# build stage
###############################################
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# vite build 输出到 /app/dist
RUN npm run build

###############################################
# runner stage (nginx)
###############################################
FROM nginx:alpine AS runner

RUN rm -rf /etc/nginx/conf.d/*.conf
COPY --from=builder /app/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
