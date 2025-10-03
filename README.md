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

- **框架**: NestJS
- **数据库**: PostgreSQL
- **ORM**: TypeORM
- **认证**: JWT + Passport
- **测试**: Jest + Supertest
- **文档**: Swagger/OpenAPI
- **容器化**: Docker & Docker Compose

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 启动数据库

确保 Docker Desktop 正在运行，然后启动 PostgreSQL：

```bash
pnpm run docker:up
```

### 3. 配置环境变量

项目已包含 `.env` 文件，包含以下配置：

```env
# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=voidlord
DB_SYNCHRONIZE=true    # 开发环境自动同步数据库结构
DB_LOGGING=false       # 数据库查询日志

# JWT配置
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=1d

# 应用配置
PORT=3000

# MinIO / S3 对象存储
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

说明：
- 读取类图书接口当前不强制 BOOK_READ，若需收紧可加 `@ApiPermission('BOOK_READ',1)` 并在种子或管理员授予。
- `@ApiPermission` 装饰器在 Swagger 中以 `x-permission` + 描述呈现：`Requires permission: <NAME> (level >= N)`。
- Level2 与 Level3 的区别主要在是否可授予/升级 >1 级权限及撤销范围。
 - 若需要开放注册，请使用 `POST /auth/register`；`POST /users` 为受保护的后台创建接口。

更多细节见 `docs/PERMISSIONS_GUIDE.md` 和 `docs/FILES_GUIDE.md`。

## API 使用示例

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
