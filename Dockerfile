FROM node:20-alpine AS build
WORKDIR /app

# 安装依赖
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

# 复制源码并构建
COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# 仅复制生产所需内容
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

EXPOSE 3000
CMD ["node", "dist/main.js"]
