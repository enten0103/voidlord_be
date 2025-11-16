# VoidLord Backend

一个使用 NestJS、TypeORM 和 PostgreSQL 构建的现代化后端应用程序，包含用户管理、JWT 认证和完整的测试套件。

## 功能特性

- ✅ PostgreSQL 数据库集成（使用 Docker）
- ✅ TypeORM 数据库访问和自动初始化
- ✅ 用户管理模块（CRUD 操作）
- ✅ JWT 认证和授权
- ✅ 受保护的路由
- ✅ 完整的单元测试
- ✅ E2E 测试
- ✅ Swagger API 文档
- ✅ 数据验证和序列化
- ✅ 数据库连接健康检查
- ✅ 自动数据库迁移和种子数据

## 技术栈
### 1. 安装依赖
```bash
pnpm install
pnpm run docker:up
```

### 3. 配置环境变量

项目已包含 `.env` 文件，包含以下配置：

```env
# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
### 数据验证
DB_NAME=voidlord
### 图书端点

- `POST /books` - 创建图书（需要 `BOOK_CREATE` level ≥ 1）
- `GET /books` - 获取所有图书（可匿名）
- `POST /books/search` - 统一条件数组搜索（可匿名，支持 eq / neq / match，AND 逻辑，详见下方）
- `GET /books/recommend/:id` - 相似推荐（可匿名）
- `GET /books/my` - 获取本人上传图书（需登录）
- `PATCH /books/:id` - 更新图书（需要 `BOOK_UPDATE` level ≥ 1）
- `DELETE /books/:id` - 删除图书（需要 `BOOK_DELETE` level ≥ 1）

#### 统一标签搜索 POST /books/search

通过 POST `/books/search`，请求体传递 `conditions` 条件数组，所有条件为 AND 关系，支持操作符：
- `eq`：等于
- `neq`：不等于（排除）
- `match`：模糊匹配（ILIKE）

分页：请求体可选 `limit`/`offset`，启用分页时响应为对象，否则为数组。

**响应双形态示例：**

- 未分页（无 limit/offset）：
```jsonc
[
  { "id": 1, "tags": [{ "key": "author", "value": "Isaac Asimov" }] },
  { "id": 2, "tags": [{ "key": "author", "value": "J.R.R. Tolkien" }] }
]
```

- 分页（带 limit/offset）：
```jsonc
{
  "total": 42,
  "limit": 20,
  "offset": 0,
  "items": [
    { "id": 1, "tags": [{ "key": "author", "value": "Isaac Asimov" }] },
    { "id": 5, "tags": [{ "key": "author", "value": "Isaac Asimov" }] }
  ]
}
```

**注意：** 所有 GET 标签搜索相关端点（如 `/books/tags/:key/:value`、`/books/tag-id/:id` 等）已彻底移除，仅保留 POST `/books/search`。

更多用法与示例详见 `docs/BOOKS_TAG_SEARCH.md`。
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_REGION=us-east-1
MINIO_FORCE_PATH_STYLE=true
MINIO_BUCKET=voidlord
MINIO_PUBLIC_ENDPOINT=http://localhost:9000
```

**重要**: 数据库将通过 TypeORM 自动初始化，无需手动运行 SQL 脚本。应用启动时会：
- 自动创建数据库表结构
- 运行必要的迁移
- 执行种子数据初始化（如果有）

### 4. 启动应用

开发模式：
```bash
pnpm run start:dev
```

生产模式：
```bash
pnpm run build
pnpm run start:prod
```

### 5. 访问应用

- 应用地址: http://localhost:3000
- Swagger 文档: http://localhost:3000/api
- 健康检查: http://localhost:3000/health

数据库连接状态可以通过健康检查端点监控。

## API 端点

### 认证端点

- `POST /auth/register` - 用户注册
- `POST /auth/login` - 用户登录
- `GET /auth/profile` - 获取用户资料（需要认证）
- `GET /auth/protected` - 受保护的示例路由（需要认证）

### 用户管理端点

- `GET /users` - 获取所有用户（需要认证）
- `GET /users/:id` - 获取特定用户（需要认证）
- `POST /users` - 创建用户（需要 `USER_CREATE` level ≥ 1）
- `PATCH /users/:id` - 更新用户（需要认证）
- `DELETE /users/:id` - 删除用户（需要认证）

### 系统端点
### 图书端点

- `POST /books` - 创建图书（需要 `BOOK_CREATE` level ≥ 1）
- `GET /books` - 获取所有图书（可匿名）
- `GET /books?tags=...` - 按标签键筛选（可匿名）
- `GET /books/hash/:hash` - 通过 hash 获取（可匿名）
- `POST /books/search` - 多模式标签搜索（可匿名）
- `GET /books/recommend/:id` - 相似推荐（可匿名）
- `GET /books/my` - 获取本人上传图书（需登录）
- `PATCH /books/:id` - 更新图书（需要 `BOOK_UPDATE` level ≥ 1）
- `DELETE /books/:id` - 删除图书（需要 `BOOK_DELETE` level ≥ 1）


- `GET /` - 应用信息
- `GET /health` - 健康检查（包含数据库连接状态）
### 媒体库端点
- `GET /media-libraries/my` - 我的媒体库列表（含系统阅读记录库）
- `GET /media-libraries/reading-record` - 系统“阅读记录”库详情视图
- `GET /media-libraries/virtual/my-uploaded` - 虚拟库：聚合我上传的全部书籍（只读，id=0）
- 其它：创建 / 复制 / 嵌套 / 添加书籍等详见 `docs/MEDIA_LIBRARIES_README.md`

## 🔐 权限矩阵 (Permission Matrix)

系统采用 基于“权限 + 等级 (0/1/2/3)” 的精细化授权模型：

| Level | 含义 | 授权 / 管理能力 |
|-------|------|-----------------|
| 0 | 无权限 | 不能访问受限制接口 |
| 1 | 基础访问 | 可调用声明 minLevel<=1 的接口，不能授予/撤销 |
| 2 | 进阶管理 | 可授予/撤销自己授予的 level1；不能授予 >1 |
| 3 | 完全管理 | 可授予/提升/撤销任意用户 (至 3) |

内置权限：
```
USER_READ
USER_CREATE
USER_UPDATE
USER_DELETE
BOOK_READ
BOOK_CREATE
BOOK_UPDATE
BOOK_DELETE
RECOMMENDATION_MANAGE
FILE_MANAGE
```

业务端点与所需权限：

| 领域 | 方法 | 路径 (示例) | 权限 | Min Level | 公开 |
|------|------|-------------|-------|-----------|------|
| 用户 | GET | /users | USER_READ | 1 | 否 |
| 用户 | GET | /users/:id | USER_READ | 1 | 否 |
| 用户 | PATCH | /users/:id | USER_UPDATE | 1 | 否 |
| 用户 | DELETE | /users/:id | USER_DELETE | 1 | 否 |
| 用户 | POST | /users | USER_CREATE | 1 | 否 |
| 图书 | POST | /books | BOOK_CREATE | 1 | 否 |
| 图书 | PATCH | /books/:id | BOOK_UPDATE | 1 | 否 |
| 图书 | DELETE | /books/:id | BOOK_DELETE | 1 | 否 |
| 图书 | GET | /books /books/search /books/recommend/* | (可选 BOOK_READ) | 0 | 是 |
| 图书 | GET | /books/my | (需登录) | 0 | 否 |
| 推荐 | POST | /recommendations/sections | RECOMMENDATION_MANAGE | 1 | 否 |
| 推荐 | PATCH | /recommendations/sections/:id | RECOMMENDATION_MANAGE | 1 | 否 |
| 推荐 | DELETE | /recommendations/sections/:id | RECOMMENDATION_MANAGE | 1 | 否 |
| 推荐 | POST | /recommendations/sections/:id/items | RECOMMENDATION_MANAGE | 1 | 否 |
| 推荐 | DELETE | /recommendations/sections/:sid/items/:iid | RECOMMENDATION_MANAGE | 1 | 否 |
| 推荐 | GET | /recommendations/public | (公开) | 0 | 是 |
| 权限 | POST | /permissions/grant | USER_UPDATE | 2 | 否 |
| 权限 | POST | /permissions/revoke | USER_UPDATE | 2 | 否 |
| 权限 | GET | /permissions/user/:id | USER_READ | 1 | 否 |
| 文件 | POST | /files/policy/public | SYS_MANAGE | 3 | 否 |
| 文件 | POST | /files/policy/private | SYS_MANAGE | 3 | 否 |
| 文件 | GET | /files/upload-url | (需登录) | 0 | 否 |
| 文件 | GET | /files/download-url | (需登录) | 0 | 否 |
| 文件 | POST | /files/upload | (需登录) | 0 | 否 |
| 文件 | DELETE | /files/object | FILE_MANAGE 或本人 | 1/0 | 否 |

说明：
- 读取类图书接口当前不强制 BOOK_READ，若需收紧可加 `@ApiPermission('BOOK_READ',1)` 并在种子或管理员授予。
- `@ApiPermission` 装饰器在 Swagger 中以 `x-permission` + 描述呈现：`Requires permission: <NAME> (level >= N)`。
- Level2 与 Level3 的区别主要在是否可授予/升级 >1 级权限及撤销范围。
 - 若需要开放注册，请使用 `POST /auth/register`；`POST /users` 为受保护的后台创建接口。

更多细节见 `docs/PERMISSIONS_GUIDE.md` 和 `docs/FILES_GUIDE.md`。

## API 使用示例

### HTTP 状态码约定（401 vs 403）

为区分“未认证/凭证无效”和“权限不足”，受保护端点遵循：

- 401 Unauthorized：未通过认证（未携带/无效/过期的 JWT 等）
- 403 Forbidden：已认证但权限不足（缺少权限或 level 不足）

标准错误响应示例：

```
401 => { "statusCode": 401, "message": "Unauthorized", "error": "Unauthorized" }
403 => { "statusCode": 403, "message": "Forbidden",   "error": "Forbidden" }
```

Swagger 中已为受保护端点统一声明上述示例，便于前端消费。

### 1. 注册用户

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123"
  }'
```

### 2. 登录

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "password123"
  }'
```

### 3. 访问受保护的路由

```bash
curl -X GET http://localhost:3000/auth/protected \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 测试

### 运行单元测试

```bash
pnpm run test
```

### 运行测试覆盖率

```bash
pnpm run test:cov
```

### 运行 E2E 测试

```bash
pnpm run test:e2e
```

### 监听模式运行测试

```bash
pnpm run test:watch
```

### 提交流程（强制测试）

- 本仓库已启用 Git 提交前钩子（pre-commit），在你执行 `git commit` 前会自动运行：
  - `pnpm test`（单元测试）
  - `pnpm test:e2e`（端到端测试）
- 首次克隆或安装依赖后会自动安装钩子（通过 `postinstall` 脚本）。
- 如需临时跳过钩子（不推荐），可使用：

```bash
git commit -m "<msg>" --no-verify
```

注意：跳过验证应仅限于 CI 故障或紧急修复，建议尽快补齐测试并恢复正常提交流程。

## Docker 命令

```bash
# 启动服务
pnpm run docker:up

# 停止服务
pnpm run docker:down

# 查看日志
pnpm run docker:logs
```

## 项目结构

```
src/
├── main.ts           # 应用入口文件
├── config/           # 应用配置
│   ├── database.config.ts      # TypeORM 数据库连接配置
│   └── database-init.service.ts # 数据库初始化服务 (如创建默认用户)
├── entities/         # TypeORM 数据库实体定义
├── init/             # 应用初始化逻辑 (如 Swagger)
├── modules/          # 各业务模块
│   ├── app/          # 主应用模块 (根路由, 健康检查)
│   ├── auth/         # 认证与授权模块
│   ├── books/        # 图书管理模块
│   ├── files/        # 文件上传与对象存储模块
│   ├── permissions/  # 权限管理模块
│   ├── recommendations/ # 推荐管理模块
│   ├── user-config/  # 用户配置模块 (头像, 偏好设置)
│   └── users/        # 用户管理模块
├── scripts/          # 独立脚本 (如重置数据库)
└── types/            # TypeScript 类型定义

test/                 # E2E 测试目录
```

## 安全特性

- 密码使用 bcrypt 加密
- JWT token 用于认证
- 输入验证和数据净化
- CORS 配置
- 敏感信息序列化排除

## 开发工具

- ESLint - 代码检查
- Prettier - 代码格式化
- Jest - 测试框架
- Swagger - API 文档生成

## 生产部署注意事项

1. **环境变量**: 更改 `JWT_SECRET` 为强密码
2. **数据库**: 设置强密码并使用 SSL
3. **同步**: 在生产环境中设置 `DB_SYNCHRONIZE=false` 并使用迁移
4. **HTTPS**: 使用反向代理（如 Nginx）启用 HTTPS
5. **监控**: 添加日志和监控解决方案
6. **健康检查**: 利用 `/health` 端点进行应用和数据库监控

## 持续集成与部署（CI/CD）

本项目提供 GitHub Actions 工作流 `CI-CD`，在推送到 `master` 分支时自动执行：

1. 安装依赖并运行 Lint、单元测试与 E2E 测试。
2. 构建多阶段 Docker 镜像并推送到 GitHub Container Registry (GHCR)。
3. 通过 SSH 连接生产服务器，生成 `docker-compose.prod.yml` 和 `.env` 配置文件，并上传部署脚本。
4. **部署需手动执行**：CI 完成后，登录服务器运行 `/opt/voidlord/deploy-app.sh` 完成部署。

### 新增文件概述

- `Dockerfile`：多阶段构建，裁剪为仅生产依赖。
- `.dockerignore`：防止无关文件进入镜像构建上下文。
- `docker-compose.prod.yml`：生产编排文件，由 CI 自动生成。
- `.github/workflows/cd.yml`：CI/CD 工作流配置。
- `deploy-app.sh`：手动部署脚本，用于拉取镜像并启动服务。

### 需要配置的 GitHub Secrets

在仓库 Settings -> Secrets -> Actions -> Environments -> voidlordBe 中添加：

- `PROD_HOST`：生产服务器 IP 或域名。
- `PROD_SSH_USER`：SSH 登录用户名。
- `PROD_SSH_PASSWORD`：SSH 登录密码。
- `PORT`：应用端口（默认 3000）。
- `PUBLIC_HOST_IP`：公网访问地址。
- `ADMIN_PASSWORD`：管理员密码。
- `JWT_SECRET`：JWT 密钥（强密码）。
- `DB_PASSWORD`：数据库密码（强密码）。
- `MINIO_ACCESS_KEY`：MinIO 访问密钥。
- `MINIO_SECRET_KEY`：MinIO 密钥。

> 注意：工作流使用默认 `GITHUB_TOKEN` 进行 GHCR 认证，无需额外配置 PAT。

### 生产服务器准备步骤（一次性）

确保服务器已安装 Docker 和 Docker Compose：

```bash
# 安装 Docker（如未安装）
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 创建工作目录
sudo mkdir -p /opt/voidlord
sudo chown $USER:$USER /opt/voidlord
```

### 部署流程

1. **推送代码到 master 分支**，GitHub Actions 会自动执行 CI/CD 流程。

2. **等待 CI 完成**，工作流会：
   - 运行测试
   - 构建并推送 Docker 镜像到 GHCR
   - 在生产服务器生成 `docker-compose.prod.yml` 和 `.env`
   - 上传 `deploy-app.sh` 部署脚本

3. **登录生产服务器手动部署**：

   ```bash
   cd /opt/voidlord
   ./deploy-app.sh
   ```

   或者手动执行部署命令：

   ```bash
   cd /opt/voidlord
   docker compose -f docker-compose.prod.yml pull
   docker compose -f docker-compose.prod.yml up -d
   ```

4. **查看日志和状态**：

   ```bash
   cd /opt/voidlord
   docker compose -f docker-compose.prod.yml ps
   docker compose -f docker-compose.prod.yml logs -f app
   ```

### 为什么采用手动部署？

- ⚡ **更快的 CI 流程**：避免在 GitHub Actions 中进行缓慢的镜像拉取
- 🎯 **更好的控制**：管理员可选择合适的时间窗口进行部署
- 🔧 **易于调试**：如遇到问题可以手动排查，不会阻塞 CI 流水线

### 工作流镜像 Tag 约定

工作流使用 `docker/metadata-action` 自动生成：

- `latest`（分支）
- 语义版本（若推送 tag）
- `sha-<git sha>` 精确定位镜像（部署阶段使用）

### 回滚策略

在生产服务器执行：
```bash
docker images | grep voidlord-be
docker pull <之前的tag>
sed -i "s|image: ghcr.io/.*/voidlord-be:.*|image: <之前的tag>|g" docker-compose.prod.yml
docker compose -f docker-compose.prod.yml up -d
```

### 本地模拟构建

```bash
docker build -t voidlord-be:local .
docker run --env-file .env -p 3000:3000 voidlord-be:local
```

### 后续可增强项

- 引入数据库迁移（关闭同步，改用 migrations）。
- 加入镜像安全扫描（Trivy）。
- 推送通知（钉钉/企业微信/Slack）。
- 灰度 / 蓝绿部署（以两个 compose 文件或 K8s 实现）。

> 如需切换到 Kubernetes，可将镜像推送逻辑复用，并新增 Helm Chart 与 `kubectl`/`helm` 部署步骤。
