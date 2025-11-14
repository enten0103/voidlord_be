# 推荐系统 (Recommendations) 指南

当前已精简为“分区直接绑定单一公开媒体库”的模型：不再维护独立的推荐条目集合，也取消 `/recommendations/public` 聚合端点。客户端通过 `/recommendations/sections` 获取启用的分区列表（默认仅 active），或加 `?all=true` 查看全部（含停用）。支持：创建、更新（含切换库与批量排序）、删除、激活/停用、批量重排。

## 目录
1. 模型概述
2. 数据结构
3. 权限
4. 端点列表
5. 请求示例
6. 重排语义
7. 错误码
8. 测试要点
9. 后续扩展

---
## 1. 模型概述
- RecommendationSection：推荐分区（主题容器），直接持有一个 `library` 引用。
- library：必须为公开 (`is_public=true`) 的媒体库；切换时重新校验公开性与存在性。
- 排序：通过 `sort_order`（持久字段）与批量重排接口统一更新。
- 可见性：`active=true` 时在普通列表返回；`?all=true` 时返回全部（含 inactive）。

---
## 2. 数据结构
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 主键 |
| key | string | 业务唯一键，防止重复创建 |
| title | string | 展示标题 |
| description | string? | 说明，可选 |
| active | boolean | 是否启用（默认 true） |
| sort_order | number | 展示顺序（升序） |
| library | MediaLibrary | 绑定的公开媒体库（ManyToOne，删除库会触发外键行为） |

约束：
1. `key` 全局唯一。
2. `library.is_public` 必须为 true，否则冲突。
3. 批量重排后保证 sort_order 连续从 0 开始（由服务端逻辑保证）。

---
## 3. 权限
| 范围 | 登录 | 权限 | Level | 说明 |
|------|------|------|-------|------|
| 分区读取 | 是 | (JWT) | - | /sections 与 /sections/:id 需登录（可按业务放宽） |
| 分区管理 | 是 | RECOMMENDATION_MANAGE | >=1 | 创建 / 更新 / 删除 / 重排 |

---
## 4. 端点列表
| 方法 | 路径 | 描述 | 请求体 | 返回 |
|------|------|------|--------|-----|
| GET | /recommendations/sections | 列出启用分区 | - | Section[] |
| GET | /recommendations/sections?all=true | 列出全部分区（含停用） | - | Section[] |
| GET | /recommendations/sections/:id | 分区详情 | - | Section |
| POST | /recommendations/sections | 创建分区并绑定库 | { key,title,mediaLibraryId,description?,sort_order?,active? } | Section |
| PATCH | /recommendations/sections/:id | 更新字段 / 切库 / 批量重排 | { 任意字段, mediaLibraryId?, sectionOrder? } | Section |
| DELETE | /recommendations/sections/:id | 删除分区（幂等） | - | { ok:true } |

批量重排：通过在 PATCH 请求体中附加 `sectionOrder: number[]` 触发；服务端异步执行后返回更新后的当前 Section。

---
## 5. 请求示例
### 创建分区
```http
POST /recommendations/sections
Authorization: Bearer <jwt>
Content-Type: application/json

{ "key":"today_hot","title":"今日最热","mediaLibraryId":42,"description":"近期热度","active":true }
```
响应：
```json
{ "id":1,"key":"today_hot","title":"今日最热","active":true,"sort_order":0,"library":{"id":42} }
```

### 更新分区（切换库）
```http
PATCH /recommendations/sections/1
Authorization: Bearer <jwt>
Content-Type: application/json

{ "mediaLibraryId": 43 }
```
响应：
```json
{ "id":1,"key":"today_hot","title":"今日最热","library":{"id":43} }
```

### 批量重排
```http
PATCH /recommendations/sections/1
Authorization: Bearer <jwt>
Content-Type: application/json

{ "sectionOrder": [3,2,1,5,4] }
```
说明：客户端需发送“希望的最终顺序中所有分区 ID”列表；服务端按数组顺序重写其 `sort_order`，未出现的分区保持原样（推荐：必须包含全部 ID）。

---
## 6. 重排语义
1. `sectionOrder` 重排是批处理：对出现的 ID 按数组索引写入连续的 sort_order。
2. 建议始终发送当前所有分区 ID 完整列表以保证连续性与可预测性。
3. 重排与切库可同 PATCH 一并提交，切库逻辑与重排异步执行互不影响最终返回。

---
## 7. 错误码
| 状态码 | 场景 | 示例 |
|--------|------|------|
| 401 | 未登录访问管理端点 | `{ "statusCode":401,"message":"Unauthorized" }` |
| 403 | 缺少 RECOMMENDATION_MANAGE | `{ "statusCode":403,"message":"Forbidden" }` |
| 404 | 分区或库不存在 | `{ "statusCode":404,"message":"Section not found" }` / `Library not found` |
| 409 | 重复 key 或库非公开 | `{ "statusCode":409,"message":"Section key already exists" }` / `Library must be public` |

---
## 8. 测试要点
- 创建分区并绑定公开库；绑定私有库失败。
- 切换库权限与公开性校验。
- 重复 key 冲突 409。
- 批量重排后 sort_order 连续性与顺序正确。
- inactive 分区在默认列表隐藏，`all=true` 可见。
- 删除分区幂等。

---
## 9. 后续扩展
- 可选恢复“多条目”模式（本次精简后保留演化空间）。
- 增加分区分组或标签过滤。
- 公共匿名浏览（若未来需要展示给未登录用户）。
- 缓存与分页：大量分区时增加分页与缓存层。
- 审计：记录重排与切库操作（操作者 + 时间）。

参考：功能矩阵见 `README.md`；权限说明 `PERMISSIONS_GUIDE.md`；媒体库结构与策略见 `MEDIA_LIBRARIES_README.md`。
