# Books（用法示例）

## 创建图书

```bash
curl -X POST http://localhost:3000/books \
  -H 'Authorization: Bearer <jwt>' \
  -H 'Content-Type: application/json' \
  -d '{"tags":[{"key":"author","value":"作者名"},{"key":"genre","value":"科幻"}]}'
```

## 获取图书列表 / 单本

```bash
curl http://localhost:3000/books
curl http://localhost:3000/books/12
```

## 获取我创建的图书

```bash
curl http://localhost:3000/books/my \
  -H 'Authorization: Bearer <jwt>'
```

## 更新图书（替换 tags）

```bash
curl -X PATCH http://localhost:3000/books/12 \
  -H 'Authorization: Bearer <jwt>' \
  -H 'Content-Type: application/json' \
  -d '{"tags":[{"key":"year","value":"2024"}]}'
```

## 删除图书

```bash
curl -X DELETE http://localhost:3000/books/12 \
  -H 'Authorization: Bearer <jwt>'
```

## 搜索（统一入口）

更多示例见 `BOOKS_TAG_SEARCH.md`。

```bash
curl -X POST http://localhost:3000/books/search -H 'Content-Type: application/json' \
  -d '{"conditions":[{"target":"author","op":"eq","value":"作者名"}]}'
```

## 推荐

```bash
curl "http://localhost:3000/books/recommend/12?limit=5"
```

## 上传/替换封面

`PUT /books/:id/cover`（multipart/form-data）

```bash
curl -X PUT http://localhost:3000/books/12/cover \
  -H 'Authorization: Bearer <jwt>' \
  -F "file=@./cover.jpg"
```

## EPUB：上传 / 读取内部文件 / 删除

上传：`POST /epub/book/:id`（multipart/form-data）

```bash
curl -X POST http://localhost:3000/epub/book/12 \
  -H 'Authorization: Bearer <jwt>' \
  -F "file=@./book.epub"
```

读取 EPUB 内部文件（例：OPF、HTML、图片等）：`GET /epub/book/:id/<path>`

```bash
curl http://localhost:3000/epub/book/12/META-INF/container.xml
```

删除：`DELETE /epub/book/:id`

```bash
curl -X DELETE http://localhost:3000/epub/book/12 \
  -H 'Authorization: Bearer <jwt>'
```

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
- 新增顶层评论 (需登录)：`POST /books/:id/comments` Body: `{ "content": "..." }`
- 列表某条评论的回复 (公开访问)：`GET /books/:id/comments/:commentId/replies?limit=20&offset=0`
- 回复某条评论 (需登录)：`POST /books/:id/comments/:commentId/replies` Body: `{ "content": "..." }`
- 删除评论 (需登录)：`DELETE /books/:id/comments/:commentId`
  - 评论作者本人可删除
  - 非作者需要 `COMMENT_MANAGE (>=1)` 权限，否则 403

#### 分页与返回字段

`listComments`（仅返回顶层评论）返回结构（含子评论数量 reply_count）：

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
      "user": { "id": 2, "username": "alice" },
      "reply_count": 3
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
      {
        "id": 12,
        "content": "Agree",
        "created_at": "2025-01-01T00:00:00.000Z",
        "user": { "id": 3, "username": "bob" }
      }
    ]
  }
  ```

#### 内容校验

- 必须为非空字符串（去除首尾空格后长度 ≥ 1）。
- 最大长度 2000；超过抛出 `409 Conflict`（消息：`Content too long (max 2000)`）。
- 空内容抛出 `409 Conflict`（消息：`Content is required`）。

#### 错误响应示例

| 场景                 | 状态码 | 示例                                                                                           |
| -------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| 书籍不存在           | 404    | `{ "statusCode":404,"message":"Book not found","error":"Not Found" }`                          |
| 评论不存在（删除）   | 404    | `{ "statusCode":404,"message":"Comment not found","error":"Not Found" }`                       |
| 未登录访问新增/删除  | 401    | `{ "statusCode":401,"message":"Unauthorized","error":"Unauthorized" }`                         |
| 权限不足删除         | 403    | `{ "statusCode":403,"message":"Only owner or COMMENT_MANAGE can delete","error":"Forbidden" }` |
| 内容非法（空/过长）  | 409    | `{ "statusCode":409,"message":"Content is required","error":"Conflict" }`                      |
| 父评论不存在（回复） | 404    | `{ "statusCode":404,"message":"Parent comment not found","error":"Not Found" }`                |

#### 新增示例：

```http
POST /books/1/comments
Authorization: Bearer <jwt>
Content-Type: application/json

{ "content": "Nice book" }
```

成功响应：

```json
{
  "id": 11,
  "bookId": 1,
  "content": "Nice book",
  "created_at": "2025-01-01T00:00:00.000Z"
}
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
{
  "id": 12,
  "bookId": 1,
  "parentId": 11,
  "content": "I agree",
  "created_at": "2025-01-01T00:00:00.000Z"
}
```

列表示例响应：

```json
{
  "bookId": 1,
  "total": 1,
  "limit": 20,
  "offset": 0,
  "items": [
    {
      "id": 10,
      "content": "Nice book",
      "created_at": "2025-01-01T00:00:00.000Z",
      "user": { "id": 2, "username": "alice" }
    }
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
