# Book 模块使用指南

## 📖 概述

Book 模块是一个完整的图书管理系统，支持图书的 CRUD 操作以及与标签的多对多关系管理。

## 🏗️ 数据库设计

### Book 实体
- `id` (number): 主键，自增
- `hash` (string): 图书唯一标识符，唯一索引
- `title` (string): 图书标题
- `description` (string, 可选): 图书描述
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

- **公开访问**: GET 请求（查询图书）
- **需要认证**: POST, PATCH, DELETE 请求（需要 JWT token）

## 🎯 核心功能

### 标签智能管理
- 自动去重：相同 key 和 value 的标签会复用现有标签
- 级联创建：创建图书时自动创建不存在的标签
- 多对多关系：一本书可以有多个标签，一个标签可以关联多本书

### 查询功能
- 分页查询：按创建时间倒序
- 标签筛选：根据标签键筛选图书
- 灵活搜索：支持多种查询方式

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

## 🗄️ 数据库表结构

```sql
-- Book 表
CREATE TABLE book (
    id SERIAL PRIMARY KEY,
    hash VARCHAR UNIQUE NOT NULL,
    title VARCHAR NOT NULL,
    description TEXT,
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

## 🔧 扩展功能建议

1. **搜索功能**: 添加全文搜索支持
2. **分页**: 添加分页查询参数
3. **排序**: 支持多种排序方式
4. **图书封面**: 添加图片存储功能
5. **批量操作**: 支持批量创建/更新/删除
6. **标签管理**: 独立的标签管理 API
7. **统计功能**: 图书和标签的统计信息

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
- E2E 测试需要测试数据库支持
