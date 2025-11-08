# 书单（Book-Lists）API 指南

支持用户创建并维护多本书的收藏书单，可设置公开/私有；书单名称在同一用户下唯一，支持从公开书单一键复制。

> 命名说明：文档中使用 BookList / BookListItem（等价于旧称 FavoriteList / FavoriteListItem）。

## 目录
1. 概述与定位  
2. 数据模型  
3. 权限与可见性  
4. 端点速览  
5. 请求与示例  
6. 业务规则（排序/唯一性/复制）  
7. 错误码  
8. 扩展建议  

---
## 1. 概述与定位
书单用于聚合用户感兴趣的书籍，可用于收藏、主题整理或分享；可选公开展示。

---
## 2. 数据模型
- BookList
  - id: number (PK)
  - name: string (同一用户内唯一)
  - description?: string
  - is_public: boolean (默认 false)
  - owner: User (ManyToOne, CASCADE)
  - created_at / updated_at
- BookListItem
  - id: number (PK)
  - list: BookList (ManyToOne, CASCADE)
  - book: Book (ManyToOne, CASCADE)
  - added_at: Date

唯一性与统计：
- 书单名称在同一 owner 下唯一；
- `items_count` 可作为冗余统计字段在查询时返回（实现层面可用计数查询替代）。

---
## 3. 权限与可见性
| 端点 | 登录 | 角色/权限 | 备注 |
|------|------|-----------|------|
| POST /book-lists | 是 | 本人 | 创建书单 |
| PATCH /book-lists/:id | 是 | 必须为 owner | 更新书单 |
| DELETE /book-lists/:id | 是 | 必须为 owner | 删除书单 |
| GET /book-lists/my | 是 | 本人 | 我的列表 |
| GET /book-lists/:id | 否 | 公开或 owner | 私有书单仅 owner 可见 |
| POST /book-lists/:id/books | 是 | 必须为 owner | 向列表添加书籍 |
| DELETE /book-lists/:id/books/:bookId | 是 | 必须为 owner | 从列表移除书籍 |
| POST /book-lists/:id/copy | 是 | 公开或 owner | 复制公开书单到本人名下 |

---
## 4. 端点速览
| 方法 | 路径 | 描述 | 请求体 | 响应 |
|------|------|------|--------|------|
| POST | /book-lists | 创建书单 | { name, description?, is_public? } | BookList |
| PATCH | /book-lists/:id | 更新书单 | { name?, description?, is_public? } | BookList |
| DELETE | /book-lists/:id | 删除书单 | - | { ok:true } |
| GET | /book-lists/my | 我的书单 | - | BookList[] (含 items_count) |
| GET | /book-lists/:id | 书单详情 | - | BookList{ items[...] } |
| POST | /book-lists/:id/books | 添加书籍 | { bookId } | BookListItem |
| DELETE | /book-lists/:id/books/:bookId | 移除书籍 | - | { ok:true } |
| POST | /book-lists/:id/copy | 复制公开书单 | - | 新 BookList 摘要 |

---
## 5. 请求与示例
### 创建书单
```http
POST /book-lists
Authorization: Bearer <jwt>
Content-Type: application/json

{ "name": "收藏夹", "description": "科幻向", "is_public": false }
```
成功：
```json
{ "id": 1, "name": "收藏夹", "is_public": false, "created_at": "2025-01-01T00:00:00.000Z" }
```

### 我的书单
```http
GET /book-lists/my
Authorization: Bearer <jwt>
```
示例：
```json
[ { "id": 1, "name": "收藏夹", "is_public": false, "items_count": 3, "created_at": "...", "updated_at": "..." } ]
```

### 书单详情
```http
GET /book-lists/1
```
私有仅 owner 可见；公开任何人可读。

响应（示例）：
```json
{ "id":1, "name":"收藏夹", "is_public":true, "items_count":2, "items":[ { "id":11, "book": { "id":2, "title":"三体", "hash":"..." } } ] }
```

### 添加/移除书籍
```http
POST /book-lists/1/books
Authorization: Bearer <jwt>
Content-Type: application/json

{ "bookId": 2 }
```
失败情形：404 书籍不存在；409 已存在列表。

```http
DELETE /book-lists/1/books/2
Authorization: Bearer <jwt>
```
失败情形：404 不在列表。

### 复制公开书单
```http
POST /book-lists/:id/copy
Authorization: Bearer <jwt>
```
规则：
- 仅公开或本人列表可复制；否则 403；
- 若目标不存在 404；
- 新书单默认私有；
- 名称冲突时自动追加后缀 "(copy)"、"(copy 2)"...

成功：
```json
{ "id": 42, "name": "收藏夹 (copy)", "is_public": false, "items_count": 3 }
```

---
## 6. 业务规则（排序/唯一性/复制）
- 名称唯一：同一 owner 下 name 不可重复。
- 可见性：私有仅 owner 可读；公开全员可读。
- 列表顺序：如需排序支持，可在 Item 上增加 position 字段（当前按添加时间倒序/顺序，视实现）。
- 复制策略：复制仅拷贝条目引用，不复制底层 Book；名称碰撞自动后缀增量直到唯一。

---
## 7. 错误码
| 状态码 | 场景 |
|--------|------|
| 401 | 未认证访问写接口或 /my |
| 403 | 非拥有者访问写接口或访问私有书单详情 |
| 404 | 资源不存在：书单/书籍/列表项 |
| 409 | 冲突：同用户下书单名称重复；重复添加同一本书 |

---
## 8. 扩展建议
- 列表项排序与批量重排接口；
- 公开列表的短链接与分享统计；
- 列表协作（多 owner 或邀请协作）；
- Items 去重/去无效（书籍删除时的处理策略）。
