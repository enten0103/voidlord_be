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
- `POST /users` - 创建用户
- `PATCH /users/:id` - 更新用户（需要认证）
- `DELETE /users/:id` - 删除用户（需要认证）

### 系统端点

- `GET /` - 应用信息
- `GET /health` - 健康检查（包含数据库连接状态）

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
├── app/              # 主应用模块
├── auth/             # 认证模块
│   ├── dto/         # 数据传输对象
│   ├── guards/      # 认证守卫
│   └── strategies/  # Passport 策略
├── config/           # 配置模块
│   ├── database.config.ts      # 数据库配置
│   └── database-init.service.ts # 数据库初始化服务
├── entities/         # 数据库实体
├── init/            # 初始化配置
└── users/           # 用户管理模块
    └── dto/         # 用户相关 DTO

test/                 # E2E 测试
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

## 许可证

本项目采用 UNLICENSED 许可证。
