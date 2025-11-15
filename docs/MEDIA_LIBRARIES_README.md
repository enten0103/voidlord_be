## 媒体库 (Media Libraries) 使用指南

媒体库用于统一管理：
- 用户自定义的图书集合
- 嵌套的集合结构（库包含子库）
- 系统级保留集合（如阅读记录系统库）
- 复制 / 标签 / 可见性（公开 / 私有）

### 设计目标
1. 统一条目模型：MediaLibraryItem 可指向 Book 或 子 MediaLibrary。
2. 显式系统库：`is_system` 提供保护（限制删除与属性更新）。
3. 复制语义清晰：仅复制书籍条目与标签，名称自动去重 `(copy)` `(copy 2)`。
4. 可扩展：支持后续增加多媒体类型、排序字段、共享/协作权限模型。

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
- 系统库：`is_system=true` 时仅禁止删除与名称/属性更新；允许添加书籍、嵌套子库及移除条目。

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
| GET | /media-libraries/reading-record | 系统“阅读记录”库详情 | JWT | 自动创建 is_system 库 |
| GET | /media-libraries/virtual/my-uploaded | 虚拟“我的上传”库视图 | JWT | 动态聚合，不持久化 |

<!-- 旧 Book-Lists 映射与迁移内容已移除，保持文档专注当前实现。 -->

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

系统阅读记录库：
```json
GET /media-libraries/reading-record
{
  "id": 77,
  "name": "系统阅读记录",
  "is_system": true,
  "is_public": false,
  "owner_id": 5,
  "items_count": 0,
  "items": []
}
```

虚拟“我的上传”库：
```json
GET /media-libraries/virtual/my-uploaded
{
  "id": 0,
  "name": "我的上传图书 (虚拟库)",
  "is_virtual": true,
  "is_system": false,
  "is_public": false,
  "owner_id": 5,
  "items_count": 3,
  "items": [
    { "id": 41, "book": { "id": 41 }, "child_library": null },
    { "id": 35, "book": { "id": 35 }, "child_library": null }
  ]
}
```

### 分页 (Pagination)
媒体库相关三个获取端点支持分页：
1. 库详情：`GET /media-libraries/:id?limit=20&offset=0`
2. 系统阅读记录：`GET /media-libraries/reading-record?limit=10&offset=0`
3. 虚拟上传库：`GET /media-libraries/virtual/my-uploaded?limit=30&offset=0`

参数规则：
- limit: 可选，1-100，缺失或未提供则不触发分页模式。
- offset: 可选，>=0。
- 至少提供一个参数 (limit 或 offset) 即进入分页响应形态。

响应形态：
未分页（兼容旧版）：
```jsonc
{
  "id": 10,
  "name": "收藏夹",
  "items_count": 5,
  "items": [ /* 全量条目 */ ]
}
```

分页启用：
```jsonc
{
  "id": 10,
  "name": "收藏夹",
  "items_count": 50,          // 总条目数 (COUNT)
  "limit": 20,                // 请求的上限 (规范化后)
  "offset": 0,                // 跳过条目数
  "items": [ /* 截取子集，长度<=limit */ ]
}
```

库详情分页条目排序：按 `added_at DESC` 保障新近加入的书籍或子库优先展示。阅读记录与虚拟上传库沿用相同排序逻辑，以便一致的用户体验。

边界行为：
- offset >= items_count 时返回空数组但保留元数据。
- limit 超过上限自动截断至 100。
- 仅提供 offset 不提供 limit 时：采用默认 limit=20（可在后续通过配置外置化）。

与 Books 搜索分页差异：Books 搜索分页返回 `{ total, limit, offset, items }`（无 id/name 上下文）；媒体库分页保留库自身字段并加入 limit/offset 元数据。

Swagger：三个端点均附加 @ApiQuery(limit/offset) 注释，描述取值范围与响应差异；示例中建议展示分页与非分页双形态用于前端集成参考。

### 示例：分页虚拟上传库
```http
GET /media-libraries/virtual/my-uploaded?limit=3&offset=1
Authorization: Bearer <token>
```
```jsonc
{
  "id": 0,
  "name": "我的上传图书 (虚拟库)",
  "is_virtual": true,
  "items_count": 12,
  "limit": 3,
  "offset": 1,
  "items": [ { "id": 100 }, { "id": 99 }, { "id": 98 } ]
}
```

### 测试覆盖
- 单元测试：库详情分页路径 (findAndCount) + 响应元数据。
- E2E：库详情 / 阅读记录 / 虚拟上传 三端点分页场景，验证 items_count >= limit，子集长度与元数据字段存在性。

### 后续扩展建议（分页相关）
1. 支持 cursor 分页：对高频滚动场景减少 offset 扫描成本。
2. items_count 可选延迟计算：在大规模数据集下懒加载总数提升响应速度。
3. 分页缓存键：`library:{id}:page:{limit}:{offset}` 提升热门库访问性能。
4. limit 上限与默认值通过配置文件或环境变量调整。

### 复制规则
1. 源库不存在 -> 404
2. 源库私有且非 owner -> 403
3. 目标用户下名称冲突，则依次尝试：`(copy)`、`(copy 2)`、`(copy 3)`...
4. 复制不保留 `is_public`（总是 false）与 `is_system`（总是 false）。
5. 仅复制指向书籍的条目；嵌套库暂不级联深拷贝（可作为扩展）。
6. 虚拟库不参与复制；其内容来源于实时查询。

### 权限与安全
| 操作 | 检查 | 异常 |
|------|------|------|
| 查看私有库 | `lib.owner.id === userId` | ForbiddenException |
| 添加条目 (书/子库) | owner | ForbiddenException |
| 移除条目 | 条目存在且属于库 & owner | NotFound / Forbidden |
| 更新 (名称/属性/标签) | owner & 非系统库 | ForbiddenException |
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

<!-- 迁移指南段落已移除。 -->

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
可以；系统库仅限制删除与属性更新，不限制添加书籍、嵌套与移除条目。

**Q: 复制时是否会复制嵌套子库?**  
当前仅复制直接的书籍条目；保持操作可预期。

**Q: 虚拟“我的上传”库与普通库区别?**  
不持久化；`id=0`；不可更新/删除/复制；用于前端快速获取聚合视图。

**Q: 虚拟库是否包含我删除的书?**  
不会；仅实时查询仍存在且 `create_by = 当前用户` 的书籍。

---
若发现遗漏或改进机会，请提交 Issue / PR。✅