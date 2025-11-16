FROM node:20-alpine AS build
WORKDIR /app

# 安装依赖（包含 dev 以便编译）
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

# 复制源码并构建
COPY . .
RUN pnpm build

# 仅保留生产依赖，忽略生命周期脚本避免 simple-git-hooks 在 prune 后再次触发
RUN pnpm prune --prod --ignore-scripts

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# 仅复制生产所需内容
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

EXPOSE 3000
CMD ["node", "dist/main.js"]
