# 书单（收藏）API 指南

支持用户创建多本书的收藏书单（列表），可设置公开/私有；书单 ID 全局唯一，名称在同一用户下唯一。

## 数据模型
- FavoriteList
  - id: number (PK)
  - name: string (同一用户内唯一)
  - description?: string
  - is_public: boolean (默认 false)
  - owner: User (ManyToOne, CASCADE)
  - created_at / updated_at
- FavoriteListItem
  - id: number (PK)
  - list: FavoriteList (ManyToOne, CASCADE)
  - book: Book (ManyToOne, CASCADE)
  - added_at: Date

唯一性规则：
- 书单 ID 全局唯一（自增主键）
- 书单名称同用户内唯一（同一 owner 下 name 不可重复）

## API 概览
- 创建书单（需登录）：POST /book-lists
- 更新书单（需登录/仅 owner）：PATCH /book-lists/:id
- 删除书单（需登录/仅 owner）：DELETE /book-lists/:id
- 我的书单列表（需登录）：GET /book-lists/my
- 书单详情（公开或 owner）：GET /book-lists/:id
- 添加书籍到书单（需登录/仅 owner）：POST /book-lists/:id/books
- 从书单移除书籍（需登录/仅 owner）：DELETE /book-lists/:id/books/:bookId
 - 复制公开书单到自己名下（需登录）：POST /book-lists/:id/copy

## 示例

### 创建书单
```http
POST /book-lists
Authorization: Bearer <jwt>
Content-Type: application/json

{ "name": "收藏夹", "description": "科幻向", "is_public": false }
```
成功响应：
```json
{ "id": 1, "name": "收藏夹", "is_public": false, "created_at": "2025-01-01T00:00:00.000Z" }
```

名称重复（同用户）：
```json
{ "statusCode": 409, "message": "List name already exists", "error": "Conflict" }
```

### 我的书单
```http
GET /book-lists/my
Authorization: Bearer <jwt>
```
响应（示例）：
```json
[ { "id": 1, "name": "收藏夹", "is_public": false, "items_count": 3, "created_at": "...", "updated_at": "..." } ]
```

### 书单详情
```http
GET /book-lists/1
```
- 私有书单：仅 owner 可查看，其他用户访问返回 403。
- 公开书单：任何人可查看。

响应（示例）：
```json
{
  "id": 1,
  "name": "收藏夹",
  "is_public": true,
  "items_count": 2,
  "items": [ { "id": 11, "book": { "id": 2, "title": "三体", "hash": "..." } } ]
}
```

### 添加/移除书籍
```http
POST /book-lists/1/books
Authorization: Bearer <jwt>
Content-Type: application/json

{ "bookId": 2 }
```
- 若书籍不存在：404 Book not found
- 若已存在：409 Book already in list

```http
DELETE /book-lists/1/books/2
Authorization: Bearer <jwt>
```
- 若不在列表：404 Book not in list

## 权限与可见性
- 写操作（创建/修改/删除/增删书籍）：需登录且必须是 owner。
- 读操作：
  - /book-lists/my 需登录返回自己的书单
  - /book-lists/:id 公开书单任何人可读；私有书单仅 owner 可读（否则 403）

## 复制公开书单

```http
POST /book-lists/:id/copy
Authorization: Bearer <jwt>
```

行为说明：
- 仅当目标书单为公开，或你是该书单的 owner 时可复制；否则返回 403。
- 若书单不存在返回 404。
- 复制后新书单默认设置为私有（is_public=false）。
- 新书单名称在你的名下需要唯一，若发生冲突会自动追加后缀 "(copy)"、"(copy 2)"、"(copy 3)"... 直至唯一。

成功响应（示例）：
```json
{ "id": 42, "name": "收藏夹 (copy)", "is_public": false, "items_count": 3 }
```

## 错误码对照
- 401 未认证：访问需要登录的接口
- 403 非拥有者访问写接口或访问私有书单详情
- 404 资源不存在：书单/书籍/列表项
- 409 冲突：同用户下书单名称重复；重复添加同一本书
