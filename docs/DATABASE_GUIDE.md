# 数据库（用法示例）

## 启动数据库
```bash
# 同时启动开发库(5432) + 测试库(5433)
pnpm run docker:up

# 仅启动开发库
pnpm run docker:dev

# 仅启动测试库
pnpm run docker:test
```

## 启动应用（开发）
```bash
pnpm run start:dev
```

## 运行测试
```bash
pnpm run test
pnpm run test:e2e
```

## 常用环境变量示例
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=voidlord
```

## 连接数据库（psql）
```bash
psql -h localhost -p 5432 -U postgres -d voidlord
psql -h localhost -p 5433 -U postgres -d voidlord_test
```
