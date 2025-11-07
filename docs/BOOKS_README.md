# Book 模块使用指南

## 📖 概述

Book 模块是一个完整的图书管理系统，支持图书的 CRUD 操作以及与标签的多对多关系管理。

## 🏗️ 数据库设计

### Book 实体
- `id` (number): 主键，自增
- `hash` (string): 图书唯一标识符，唯一索引
- `title` (string): 图书标题
- `description` (string, 可选): 图书描述
- `create_by` (number, 可选): 创建者用户 ID，创建时从登录的 JWT 中写入
- `created_at` (Date): 创建时间
- `updated_at` (Date): 更新时间
- `tags` (Tag[]): 关联的标签列表（多对多关系）

### Tag 实体
- `id` (number): 主键，自增
- `key` (string): 标签键（如 "author", "genre"）
- `value` (string): 标签值（如 "John Doe", "Fiction"）
- `shown` (boolean): 是否显示，默认 true
- `created_at` (Date): 创建时间
- `updated_at` (Date): 更新时间
- `books` (Book[]): 关联的图书列表（多对多关系）

### 关系表
- `book_tags`: 图书和标签的中间表
  - `book_id`: 图书 ID
  - `tag_id`: 标签 ID

## 🚀 API 端点

### 1. 创建图书
```http
POST /books
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "hash": "unique-book-hash",
  "title": "图书标题",
  "description": "图书描述（可选）",
  "tags": [
    {
      "key": "author",
      "value": "作者名"
    },
    {
      "key": "genre", 
      "value": "科幻"
    }
  ]
}
```

成功响应（示例）：
```json
{
  "id": 101,
  "hash": "unique-book-hash",
  "title": "图书标题",
  "description": "图书描述（可选）",
  "create_by": 12,
  "tags": [
    {"id": 5, "key": "author", "value": "作者名", "shown": true, "created_at": "...", "updated_at": "..."}
  ],
  "created_at": "...",
  "updated_at": "..."
}
```

说明：服务端会自动根据请求用户写入 `create_by`，无需在请求体中提供。

### 2. 获取所有图书
```http
GET /books
# 或者按标签筛选
GET /books?tags=author,genre
```

### 3. 根据 ID 获取图书
```http
GET /books/:id
```

### 4. 根据 hash 获取图书
```http
GET /books/hash/:hash
```

### 4.1 获取本人上传的图书
```http
GET /books/my
Authorization: Bearer <jwt_token>
```

说明：
- 需要登录（JWT）。
- 仅返回当前登录用户创建的图书（`create_by = 当前用户ID`），结果包含 `tags`，按 `created_at` 倒序。

示例响应：
```json
[
  {
    "id": 12,
    "hash": "mine-001",
    "title": "我的第一本书",
    "create_by": 5,
    "tags": [],
    "created_at": "...",
    "updated_at": "..."
  }
]
```

### 5. 更新图书
```http
PATCH /books/:id
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "title": "新标题",
  "tags": [
    {
      "key": "year",
      "value": "2024"
    }
  ]
}
```

### 6. 删除图书
```http
DELETE /books/:id
Authorization: Bearer <jwt_token>
```

## 🔐 权限控制

- **公开访问**: GET 请求（查询 / 搜索 / 推荐）当前允许匿名；可在未来收紧为 `BOOK_READ` level >=1。
- **写操作**: `BOOK_CREATE` / `BOOK_UPDATE` / `BOOK_DELETE` 需要对应权限 level >=1。
- **授权模型**: 详见 PERMISSIONS_GUIDE.md （多等级 0/1/2/3）。

## 🎯 核心功能

### 标签智能管理
- 自动去重：相同 key 和 value 的标签会复用现有标签
- 级联创建：创建图书时自动创建不存在的标签
- 多对多关系：一本书可以有多个标签，一个标签可以关联多本书

### 查询功能
- 分页查询：按创建时间倒序
- 标签筛选：根据标签键筛选图书 (GET /books?tags=author,genre)
- 统一标签搜索入口：POST /books/search (五种模式，见 BOOKS_TAG_SEARCH.md)

### 推荐功能
- GET /books/recommend/:id?limit=5
- 共享标签数降序 + 创建时间降序

### 数据验证
- hash 唯一性检查
- 输入数据验证（使用 class-validator）
- 错误处理（404, 409, 401 等）

## 🧪 测试覆盖

### 单元测试
- ✅ BooksService 测试（17 个测试用例）
- ✅ BooksController 测试（7 个测试用例）
- 覆盖所有主要功能：创建、查询、更新、删除、错误处理

### E2E 测试
- ✅ 完整的端到端测试套件
- 测试所有 API 端点
- 包含认证和权限测试
- 数据库集成测试
 - 验证创建接口自动写入 `create_by`

## 🗄️ 数据库表结构

```sql
-- Book 表
CREATE TABLE book (
    id SERIAL PRIMARY KEY,
    hash VARCHAR UNIQUE NOT NULL,
    title VARCHAR NOT NULL,
    description TEXT,
  create_by INTEGER NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tag 表
CREATE TABLE tag (
    id SERIAL PRIMARY KEY,
    key VARCHAR NOT NULL,
    value VARCHAR NOT NULL,
    shown BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 关系表
CREATE TABLE book_tags (
    book_id INTEGER REFERENCES book(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tag(id) ON DELETE CASCADE,
    PRIMARY KEY (book_id, tag_id)
);
```

## 📦 使用示例

### 1. 启动应用
```bash
# 启动数据库
pnpm run docker:up

# 启动应用
pnpm run start:dev
```

### 2. 创建图书示例
```javascript
// 创建一本带标签的图书
const response = await fetch('/books', {
    method: 'POST',
    headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        hash: 'sci-fi-001',
        title: '三体',
        description: '刘慈欣的科幻小说',
        tags: [
            { key: 'author', value: '刘慈欣' },
            { key: 'genre', value: '科幻' },
            { key: 'language', value: '中文' }
        ]
    })
});
```

### 3. 查询图书示例
```javascript
// 获取所有科幻类图书
const books = await fetch('/books?tags=genre').then(r => r.json());

// 根据 hash 查找图书
const book = await fetch('/books/hash/sci-fi-001').then(r => r.json());
```

## 🏃‍♂️ 快速开始

1. 确保 PostgreSQL 数据库运行
2. 运行 `pnpm run build` 检查编译
3. 运行 `pnpm run test` 执行单元测试
4. 启动应用访问 Swagger 文档: http://localhost:3000/api
5. 使用认证端点获取 JWT token
6. 开始使用图书管理 API！

## 📝 注意事项

- hash 字段必须全局唯一
- 删除图书会自动清理关联关系
- 标签不会因为没有关联图书而被自动删除
- 所有写操作都需要认证
- E2E 测试需要测试数据库支持；标签搜索与推荐详见 BOOKS_TAG_SEARCH.md

## ⭐ 附：评分功能（1-5）


示例：
```http
POST /books/1/rating
Authorization: Bearer <jwt>
Content-Type: application/json

{ "score": 5 }
```

响应（示例）：
```json
{ "ok": true, "bookId": 1, "myRating": 5, "avg": 4.6, "count": 13 }
```

### 💬 评论功能（Comment）

提供基础的图书评论能力，含分页、内容校验与权限控制，并支持「楼中楼」回复。

#### 接口概览
- 列表顶层评论 (公开访问)：`GET /books/:id/comments?limit=20&offset=0`
- 新增顶层评论 (需登录)：`POST /books/:id/comments`  Body: `{ "content": "..." }`
- 列表某条评论的回复 (公开访问)：`GET /books/:id/comments/:commentId/replies?limit=20&offset=0`
- 回复某条评论 (需登录)：`POST /books/:id/comments/:commentId/replies` Body: `{ "content": "..." }`
- 删除评论 (需登录)：`DELETE /books/:id/comments/:commentId`
  - 评论作者本人可删除
  - 非作者需要 `COMMENT_MANAGE (>=1)` 权限，否则 403

#### 分页与返回字段
`listComments`（仅返回顶层评论）返回结构：
```json
{
  "bookId": 1,
  "total": 13,
  "limit": 20,
  "offset": 0,
  "items": [
    {
      "id": 10,
      "content": "Nice!",
      "created_at": "2025-01-01T00:00:00.000Z",
      "updated_at": "2025-01-01T00:00:00.000Z",
      "user": { "id": 2, "username": "alice" }
    }
  ]
}
```
规则：
- `limit` 默认 20；`limit <= 0` 复位为 20；`limit > 100` 会被截断为 100。
- `offset` 默认 0；负数自动归零。
- 排序：`created_at DESC`。
- `user` 可能为 `null`（例如用户被删除或匿名评论）。

  `listReplies`（返回某条评论的直接回复）返回结构：
  ```json
  {
    "bookId": 1,
    "parentId": 10,
    "total": 2,
    "limit": 20,
    "offset": 0,
    "items": [
      { "id": 12, "content": "Agree", "created_at": "2025-01-01T00:00:00.000Z", "user": { "id": 3, "username": "bob" } }
    ]
  }
  ```

#### 内容校验
- 必须为非空字符串（去除首尾空格后长度 ≥ 1）。
- 最大长度 2000；超过抛出 `409 Conflict`（消息：`Content too long (max 2000)`）。
- 空内容抛出 `409 Conflict`（消息：`Content is required`）。

#### 错误响应示例
| 场景 | 状态码 | 示例 |
|------|--------|------|
| 书籍不存在 | 404 | `{ "statusCode":404,"message":"Book not found","error":"Not Found" }` |
| 评论不存在（删除） | 404 | `{ "statusCode":404,"message":"Comment not found","error":"Not Found" }` |
| 未登录访问新增/删除 | 401 | `{ "statusCode":401,"message":"Unauthorized","error":"Unauthorized" }` |
| 权限不足删除 | 403 | `{ "statusCode":403,"message":"Only owner or COMMENT_MANAGE can delete","error":"Forbidden" }` |
| 内容非法（空/过长） | 409 | `{ "statusCode":409,"message":"Content is required","error":"Conflict" }` |
| 父评论不存在（回复） | 404 | `{ "statusCode":404,"message":"Parent comment not found","error":"Not Found" }` |

#### 新增示例：
```http
POST /books/1/comments
Authorization: Bearer <jwt>
Content-Type: application/json

{ "content": "Nice book" }
```

成功响应：
```json
{ "id": 11, "bookId": 1, "content": "Nice book", "created_at": "2025-01-01T00:00:00.000Z" }
```

#### 回复示例：
```http
POST /books/1/comments/11/replies
Authorization: Bearer <jwt>
Content-Type: application/json

{ "content": "I agree" }
```

成功响应：
```json
{ "id": 12, "bookId": 1, "parentId": 11, "content": "I agree", "created_at": "2025-01-01T00:00:00.000Z" }
```

列表示例响应：
```json
{
  "bookId": 1,
  "total": 1,
  "limit": 20,
  "offset": 0,
  "items": [
    { "id": 10, "content": "Nice book", "created_at": "2025-01-01T00:00:00.000Z", "user": { "id": 2, "username": "alice" } }
  ]
}
```

#### 删除示例
```http
DELETE /books/1/comments/10
Authorization: Bearer <jwt>
```
成功响应：
```json
{ "ok": true }
```

说明：
- 顶层与回复均使用同一删除端点；删除父评论会级联删除其所有子回复（数据库级 CASCADE）。
