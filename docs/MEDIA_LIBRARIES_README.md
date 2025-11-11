## 媒体库 (Media Libraries) 使用指南

媒体库是对原有书单 (Book-Lists / FavoriteList) 的全面替换与上位抽象，用于统一管理：
- 用户自定义的图书集合
- 嵌套的集合结构（库包含子库）
- 系统级保留集合（如阅读记录系统库）
- 复制 / 标签 / 可见性（公开 / 私有）

### 设计目标
1. 移除 FavoriteList / BookList 冗余概念，避免双轨维护。
2. 统一条目模型：MediaLibraryItem 可指向 Book 或 子 MediaLibrary。
3. 显式系统库：`is_system` 防止误删 / 修改。
4. 复制语义更清晰：仅复制条目与标签，名称自动去重 `(copy)` `(copy 2)`。
5. 可扩展：后续可增加多媒体类型（非书籍）、排序字段、共享/协作权限模型。

### 数据模型
| 实体 | 关键字段 | 说明 |
|------|---------|------|
| MediaLibrary | id, name, description, is_public, is_system, owner(id), tags[], created_at, updated_at | 用户或系统拥有的集合 |
| MediaLibraryItem | id, library(id), book(id?) / child_library(id?), added_at | 条目：二选一指向书或子库 |
| Tag | id, key, value, shown | 复用全局标签表，与库多对多 |

约束与逻辑：
- (owner, name) 唯一；复制时自动增量后缀。
- 条目不同时包含 book 与 child_library；未显式做 DB 级互斥，在 Service 层约束。
- 删除库：级联删除其 items；引用它的父库 items 同步清理（通过外键 onDelete: CASCADE）。
- 系统库：`is_system=true` 时禁止更新名称 / 删除 / 添加或移除条目（视当前实现：add / remove / update 均做拦截）。

### 端点一览
| 方法 | 路径 | 描述 | 认证 | 备注 |
|------|------|------|------|------|
| POST | /media-libraries | 创建库 | JWT | name 唯一；可带 tags |
| GET | /media-libraries/my | 我的库列表 | JWT | 返回 items_count、tags |
| GET | /media-libraries/:id | 库详情 | JWT | 私有仅 owner；含 items |
| POST | /media-libraries/:id/books/:bookId | 添加书籍 | JWT | owner & 非系统库 |
| POST | /media-libraries/:id/libraries/:childId | 嵌套子库 | JWT | owner；禁止 self；去重 |
| DELETE | /media-libraries/:id/items/:itemId | 移除条目 | JWT | owner；条目 id 精确删除 |
| PATCH | /media-libraries/:id | 更新属性/标签 | JWT | owner；name 去重；系统库禁止 |
| POST | /media-libraries/:id/copy | 复制库 | JWT | 公共或 owner；生成私有副本 |
| DELETE | /media-libraries/:id | 删除库 | JWT | owner；系统库禁止 |

### 与旧 Book-Lists 的映射
| 旧端点 | 新端点 | 变化说明 |
|--------|--------|----------|
| POST /book-lists | POST /media-libraries | 字段基本一致；增加 is_system 内部控制 |
| GET /book-lists/my | GET /media-libraries/my | items_count 逻辑等效 |
| GET /book-lists/:id | GET /media-libraries/:id | 条目结构统一：book / child_library |
| POST /book-lists/:id/books | POST /media-libraries/:id/books/:bookId | 参数从 body->路径 (更 REST) |
| DELETE /book-lists/:id/books/:bookId | DELETE /media-libraries/:id/items/:itemId | 以条目 id 精确删除（支持统一处理书或子库） |
| POST /book-lists/:id/copy | POST /media-libraries/:id/copy | 复制逻辑扩展 name 去重策略一致 |
| 嵌套：POST /book-lists/:id/lists/:childId | POST /media-libraries/:id/libraries/:childId | 统一为 libraries 子路径 |
| PATCH /book-lists/:id | PATCH /media-libraries/:id | 支持 tags / is_public 更新；系统库限制 |
| DELETE /book-lists/:id | DELETE /media-libraries/:id | 行为一致；系统库保护 |

### 返回结构示例
创建：
```jsonc
POST /media-libraries
{
  "id": 10,
  "name": "收藏夹",
  "description": null,
  "is_public": false,
  "is_system": false,
  "tags": [ { "key": "genre", "value": "sf" } ],
  "created_at": "2025-01-01T00:00:00.000Z"
}
```

列表：
```json
[
  {
    "id": 10,
    "name": "收藏夹",
    "description": null,
    "is_public": false,
    "is_system": false,
    "tags": [],
    "items_count": 3,
    "created_at": "...",
    "updated_at": "..."
  }
]
```

详情：
```jsonc
{
  "id": 10,
  "name": "收藏夹",
  "description": null,
  "is_public": true,
  "is_system": false,
  "tags": [ { "key": "genre", "value": "sf" } ],
  "owner_id": 5,
  "items_count": 2,
  "items": [
    { "id": 77, "book": { "id": 2 }, "child_library": null },
    { "id": 78, "book": null, "child_library": { "id": 11, "name": "子库" } }
  ]
}
```

复制：
```json
{
  "id": 21,
  "name": "收藏夹 (copy)",
  "tags": [],
  "items_count": 2,
  "is_public": false,
  "copied_from": 10
}
```

### 复制规则
1. 源库不存在 -> 404
2. 源库私有且非 owner -> 403
3. 目标用户下名称冲突，则依次尝试：`(copy)`、`(copy 2)`、`(copy 3)`...
4. 复制不保留 `is_public`（总是 false）与 `is_system`（总是 false）。
5. 仅复制指向书籍的条目；嵌套库暂不级联深拷贝（可作为扩展）。

### 权限与安全
| 操作 | 检查 | 异常 |
|------|------|------|
| 查看私有库 | `lib.owner.id === userId` | ForbiddenException |
| 添加条目 (书/子库) | owner & 非系统库 | ForbiddenException |
| 移除条目 | 条目存在且属于库 & owner | NotFound / Forbidden |
| 更新 | owner & 非系统库 | ForbiddenException |
| 删除 | owner & 非系统库 | ForbiddenException |

### 标签策略
- 复用全局 Tag 表：按 (key,value) 检索或创建。
- 更新替换：若 PATCH 中包含 tags 数组，则覆盖原集合。
- `shown` 默认 true，允许未来控制前端展示过滤。

### 错误码速查
| 状态 | 说明 |
|------|------|
| 400 | 非法输入（如名称为空白） |
| 401 | 未认证访问需要登录端点 |
| 403 | 权限/所有权/系统库限制 |
| 404 | 库 / 书籍 / 条目不存在 |
| 409 | 名称冲突 / 重复添加条目 |

### 迁移指南（从 Book-Lists）
| 原字段/行为 | 迁移说明 |
|--------------|----------|
| `items_count` | 等效保留 |
| 嵌套关系 (parent_list) | 使用 item.child_library 指向子库 |
| 删除书籍条目 | 统一为删除条目 id：支持未来混合类型 |
| 复制公开书单 | 复制公开或 owner 媒体库 | 
| 私有可见性 | 逻辑不变：非 owner 且私有 => 403 |

### 后续扩展计划（建议）
1. Item 排序字段 (position) + 批量重排 API。
2. 深度复制嵌套库（可选 max depth 防爆炸）。
3. 协作共享（多 owner / 访问权限列表）。
4. 引入多媒体：音频、视频、文章引用等类型扩展（需要 item 多态）。
5. 标签统计/过滤端点：按标签聚合计数。

### 常见问题 (FAQ)
**Q: 如何删除一个嵌套的子库关系?**  
使用 `DELETE /media-libraries/:id/items/:itemId`，条目 id 来自库详情返回。

**Q: 系统库能否添加书?**  
不能；会抛出 `ForbiddenException('System library locked')`。

**Q: 复制时是否会复制嵌套子库?**  
当前仅复制直接的书籍条目；保持操作可预期。

---
若发现遗漏或改进机会，请提交 Issue / PR。✅