# 文档（仅用法示例）

本文档集以“可复制运行的接口调用示例”为主。

## Swagger

打开：`http://localhost:3000/api`

## 快速开始（最小流程）

### 1) 注册 / 登录拿到 JWT

```bash
# 注册（也会返回 token）
curl -X POST http://localhost:3000/auth/register -H 'Content-Type: application/json' \
	-d '{"username":"alice","email":"alice@example.com","password":"Password123"}'

# 登录
curl -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' \
	-d '{"username":"alice","password":"Password123"}'
```

### 2) 创建一本书（只用 tags 表达元数据）

```bash
curl -X POST http://localhost:3000/books \
	-H 'Authorization: Bearer <jwt>' \
	-H 'Content-Type: application/json' \
	-d '{"tags":[{"key":"author","value":"刘慈欣"},{"key":"genre","value":"科幻"}]}'
```

### 3) 搜索（统一入口）

```bash
curl -X POST http://localhost:3000/books/search -H 'Content-Type: application/json' \
	-d '{"conditions":[{"target":"author","op":"eq","value":"刘慈欣"}]}'
```

## 文档入口

- Books：见 `BOOKS_README.md`
- Books 搜索：见 `BOOKS_TAG_SEARCH.md`
- Auth：见 `AUTH_README.md`
- Permissions：见 `PERMISSIONS_GUIDE.md`
- Media Libraries：见 `MEDIA_LIBRARIES_README.md`
- Recommendations：见 `RECOMMENDATIONS_GUIDE.md`
- Files：见 `FILES_GUIDE.md`
- User Config：见 `USER_CONFIG_README.md`
- Database：见 `DATABASE_GUIDE.md`
