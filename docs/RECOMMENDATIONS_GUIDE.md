# 推荐系统 (Recommendations) 指南

集中管理首页或公共区域的推荐分区与条目；与「媒体库 (MediaLibrary)」体系对齐：推荐条目直接引用一个媒体库，以便复用其嵌套结构与标签。支持启用/停用、排序、批量重排与公开聚合展示。

## 目录
1. 概述与定位  
2. 数据模型  
3. 权限与认证  
4. 端点速览  
5. 请求与示例  
6. 重排语义与规则  
7. 错误码与约束  
8. 测试建议  
9. 扩展方向  

---
## 1. 概述与定位
- Section：推荐分区（主题容器）
- Item：分区内的推荐媒体库条目（有序，指向一个 MediaLibrary）
- Public 聚合：仅返回 `active=true` 的分区及条目，供未登录用户浏览。
- 媒体库复用：可引用任意用户的公开媒体库，或自身私有库（业务可自行限制）；系统库亦可引用，虚拟库 (id=0) 不可引用（非持久化）。

---
## 2. 数据模型
| 实体 | 字段 | 类型 | 说明 |
|------|------|------|------|
| RecommendationSection | id | number | 主键 |
|  | key | string | 唯一业务键，用于定位分区 |
|  | title | string | 展示标题 |
|  | description | string? | 说明文案，可空 |
|  | active | boolean | 是否启用；仅启用在公开接口返回 |
|  | sort_order | number | 全局展示顺序（升序） |
|  | items | RecommendationItem[] | 分区内条目集合 |
| RecommendationItem | id | number | 主键 |
|  | section | RecommendationSection | 所属分区 (ManyToOne) |
|  | library | MediaLibrary | 关联媒体库 (替换旧 BookList 引用) |
|  | position | number | 分区内排序序号（升序） |
|  | note | string? | 推荐备注（原因/标签） |

变化对齐：
- 字段 `list` → `library`
- 请求体参数 `bookListId` → `mediaLibraryId`
- 条目重复判定：同一分区内不允许重复引用同一媒体库。

约束：同一 Section 中 `position` 建议保持连续（由重排接口强制重写）；Section.key 全局唯一；删除 Section 级联删除其 Items。

---
## 3. 权限与认证
| 端点范围 | 登录 | 权限 | Level | 说明 |
|----------|------|------|-------|------|
| Public 获取 | 否 | - | - | 公开浏览 |
| Section/Item 管理 | 是 | RECOMMENDATION_MANAGE | >=1 | 创建/更新/删除/重排 |

---
## 4. 端点速览
| 方法 | 路径 | 描述 | 请求体 | 返回 |
|------|------|------|--------|-----|
| GET | /recommendations/public | 获取启用分区与条目 | - | Section[] (active) |
| GET | /recommendations/sections?all=true | 列出分区（可含停用） | - | Section[] |
| GET | /recommendations/sections/:id | 分区详情 | - | Section |
| POST | /recommendations/sections | 创建分区 | { key,title,description?,sort_order?,active? } | Section |
| PATCH | /recommendations/sections/:id | 更新分区 | 任意可更新字段或批量重排指令 | Section |
| DELETE | /recommendations/sections/:id | 删除分区 | - | { ok:true } |
| POST | /recommendations/sections/:id/items | 添加条目 | { mediaLibraryId, position?, note? } | Item |
| DELETE | /recommendations/sections/:sectionId/items/:itemId | 删除条目 | - | { ok:true } |
| PATCH | /recommendations/sections/:id/items/reorder | 重排条目 | { itemIds:[number] } | { ok:true } |

---
## 5. 请求与示例
### 创建分区
```http
POST /recommendations/sections
Authorization: Bearer <jwt>
Content-Type: application/json

{ "key": "today_hot", "title": "今日最热", "description": "近期热度", "sort_order": 0, "active": true }
```
响应：
```json
{ "id":1,"key":"today_hot","title":"今日最热","active":true,"sort_order":0,"items":[] }
```

### 添加条目（引用媒体库）
```http
POST /recommendations/sections/1/items
Authorization: Bearer <jwt>
Content-Type: application/json

{ "mediaLibraryId": 7, "position": 0, "note": "编辑推荐" }
```
响应：
```json
{ "id":10,"section":{"id":1},"library":{"id":7},"position":0,"note":"编辑推荐" }
```

### 公开聚合
```http
GET /recommendations/public
```
响应（示例）：
```json
[
  {
    "id":1,
    "key":"today_hot",
    "title":"今日最热",
    "active":true,
    "sort_order":0,
    "items":[{"id":10,"library":{"id":7,"name":"编辑精选"},"position":0,"note":"编辑推荐"}]
  }
]
```

---
## 6. 重排语义与规则
### 分区级重排
可通过更新多个 Section 的 `sort_order`（实现取决于服务）或提供批量重排接口（若实现）。目标：控制 Section 在公开页展示顺序（升序）。

### 条目级重排
`PATCH /recommendations/sections/:id/items/reorder`
请求体：
```json
{ "itemIds": [10, 11, 15, 21] }
```
规则：
- 必须包含该分区所有当前条目的完整有序列表；
- 服务端按数组顺序重写 position = 下标；
- 若列表缺失或含不属于分区的 ID => 400；
- 重排后保持 position 连续，从 0 开始。

### 添加条目 position 行为
- 若未提供 position，默认追加到末尾（position = 当前最大 position + 1，空列表从 0）。
- 若提供 position，当前实现直接采用该值，不自动重排其它条目；推荐通过重排接口归整。
- 建议：保持条目 position 连续可提升客户端渲染效率（排序时直接按数字升序）。

---
## 7. 错误码与约束
| 状态码 | 场景 | 示例 |
|--------|------|------|
| 401 | 未登录访问管理接口 | `{ "statusCode":401,"message":"Unauthorized","error":"Unauthorized" }` |
| 403 | 缺少 RECOMMENDATION_MANAGE 访问管理端点 | `{ "statusCode":403,"message":"Forbidden","error":"Forbidden" }` |
| 404 | 分区或条目不存在 | `{ "statusCode":404,"message":"Section not found","error":"Not Found" }` |
| 409 | 创建分区 key 冲突 / 条目库重复 | `{ "statusCode":409,"message":"Section key already exists","error":"Conflict" }` 或 `Library already in section` |
| 400 | 重排请求列表不完整或含非法 ID | `{ "statusCode":400,"message":"Invalid reorder list","error":"Bad Request" }` |

---
## 8. 测试建议
覆盖要点：
- 创建分区唯一性与默认字段。
- 添加条目 position 默认尾部行为。
- 重排接口对不完整/跨分区 ID 的拒绝。
- active=false 分区不出现在 public 响应；active 切换后响应变化。
- 删除分区级联删除其 Items。
- 添加重复的媒体库条目返回 409。
- 引用不存在或不可访问（被删除）的媒体库返回 404。

---
## 9. 扩展方向
- 分区缓存：public 结果可缓存 TTL 减少频繁查询。
- 条目自动化：根据评分或阅读热度定期生成候选推荐（可扫描媒体库标签）。
- 分区分组/层级：支持父子分区或多标签筛选推荐。
- A/B 测试：不同用户分群返回不同推荐集。
- 推荐来源统计：记录点击/曝光，供后续算法迭代。
- 媒体库快照：为推荐条目记录当时的库名称/标签快照，避免后续被修改影响历史展示。

---
参考：功能矩阵见 `README.md`；权限说明 `PERMISSIONS_GUIDE.md`；媒体库结构与策略见 `MEDIA_LIBRARIES_README.md`。
