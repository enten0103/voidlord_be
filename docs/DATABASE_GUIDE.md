# 数据库使用指南

## 📊 数据库配置

项目现在配置了两个独立的 PostgreSQL 数据库：

### 🔧 开发数据库
- **端口**: 5432
- **数据库名**: voidlord
- **用途**: 日常开发和调试

### 🧪 测试数据库
- **端口**: 5433
- **数据库名**: voidlord_test
- **用途**: 单元测试和 E2E 测试

## 🚀 快速开始

### 1. 启动所有数据库
```bash
pnpm run docker:up
```
这会同时启动开发数据库（端口 5432）和测试数据库（端口 5433）

### 2. 仅启动开发数据库
```bash
pnpm run docker:dev
```

### 3. 仅启动测试数据库
```bash
pnpm run docker:test
```

### 4. 重启所有服务
```bash
pnpm run docker:restart
```

### 5. 停止并清理所有数据
```bash
pnpm run docker:clean
```
⚠️ **注意**: 这会删除所有数据库数据！

## 🔄 工作流程

### 开发流程
```bash
# 1. 启动开发数据库
pnpm run docker:dev

# 2. 启动应用
pnpm run start:dev

# 3. 访问应用
# http://localhost:3000
# 数据库: localhost:5432/voidlord
```

### 测试流程
```bash
# 1. 启动测试数据库
pnpm run docker:test

# 2. 运行单元测试
pnpm run test

# 3. 运行 E2E 测试
pnpm run test:e2e
```

### 完整测试流程
```bash
# 启动所有数据库
pnpm run docker:up

# 运行所有测试
pnpm run test && pnpm run test:e2e
```

## 📋 环境变量

### 开发环境 (.env)
```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=voidlord
```

### 测试环境 (.env.test)
```bash
DB_HOST=localhost
DB_PORT=5433
DB_NAME=voidlord_test
```

## 🛠️ 数据库管理

### 连接数据库
```bash
# 连接开发数据库
psql -h localhost -p 5432 -U postgres -d voidlord

# 连接测试数据库
psql -h localhost -p 5433 -U postgres -d voidlord_test
```

### 查看容器状态
```bash
docker ps | grep voidlord
```

### 查看日志
```bash
# 查看所有服务日志
pnpm run docker:logs

# 查看特定容器日志
docker logs voidlord-postgres
docker logs voidlord-postgres-test
```

## 🔍 故障排除

### 端口冲突
如果端口 5432 或 5433 被占用：
```bash
# 查看端口占用
netstat -an | findstr :5432
netstat -an | findstr :5433

# 停止冲突的服务
pnpm run docker:down
```

### 数据库连接失败
```bash
# 检查容器是否运行
docker ps

# 重启数据库服务
pnpm run docker:restart

# 查看健康检查状态
docker inspect voidlord-postgres | grep Health
```

### 清理和重置
```bash
# 完全清理（删除数据）
pnpm run docker:clean

# 重新创建
pnpm run docker:up
```

## 📊 数据持久化

- **开发数据**: 存储在 `postgres_data` volume
- **测试数据**: 存储在 `postgres_test_data` volume
- 数据在容器重启后保持不变
- 使用 `docker:clean` 会删除所有数据

## 🎯 最佳实践

1. **开发时**: 只启动开发数据库节省资源
   ```bash
   pnpm run docker:dev
   ```

2. **测试前**: 确保测试数据库运行
   ```bash
   pnpm run docker:test
   pnpm run test:e2e
   ```

3. **CI/CD**: 使用独立的测试数据库
   ```bash
   pnpm run docker:up
   pnpm run test && pnpm run test:e2e
   ```

4. **数据清理**: 定期清理测试数据
   ```bash
   docker-compose stop postgres-test
   docker volume rm voidlord-be_postgres_test_data
   pnpm run docker:test
   ```

## 🔧 Docker Compose 服务

```yaml
services:
  postgres:          # 开发数据库 (localhost:5432)
  postgres-test:     # 测试数据库 (localhost:5433)
```

两个数据库完全独立，互不影响，确保开发和测试环境的分离。
