# 阅读记录 API 指南

提供用户针对书籍的个人阅读进度与统计管理：支持创建/更新进度（Upsert）、查看单本记录、列出全部、统计汇总与删除。

## 目录
1. 数据模型  
2. API 概览  
3. Upsert 语义  
4. 查询与统计  
5. 删除  
6. 校验与错误码  
7. 状态迁移与时间字段  
8. 扩展建议  

---
## 1. 数据模型
`ReadingRecord` （每个用户与每本书唯一）
- id: number
- user: User
- book: Book
- status: 'planned' | 'reading' | 'paused' | 'finished' （默认 reading）
- progress: number (0-100)
- current_chapter?: string
- notes?: text
- started_at?: Date （首次进入 reading/finished 自动记录）
- finished_at?: Date （progress=100 或 status=finished 时记录）
- last_read_at: Date （每次 upsert 更新）
- total_minutes: number （累计阅读分钟数）
- created_at / updated_at

唯一性：同一用户对同一本书仅一条记录（user+book）。

---
## 2. API 概览（均需登录）
- Upsert 创建/更新：POST /reading-records
- 列出我的记录：GET /reading-records/my
- 获取指定书的记录：GET /reading-records/book/:bookId
- 阅读统计汇总：GET /reading-records/stats/summary
- 删除记录：DELETE /reading-records/:id

---
## 3. Upsert 语义
```http
POST /reading-records
Authorization: Bearer <jwt>
Content-Type: application/json

{ "bookId": 12, "progress": 25, "status": "reading", "minutes_increment": 5 }
```
成功响应示例：
```json
{ "id":91, "bookId":12, "status":"reading", "progress":25, "total_minutes":5, "last_read_at":"2025-01-01T00:00:00.000Z" }
```
说明：
- 若记录不存在则创建；已存在则仅更新提交的字段；
- `minutes_increment`（可选）作为增量累加至 `total_minutes`（不得为负数）；
- 当 `status=finished` 或 `progress=100` 写入 `finished_at`（若尚未写入）；
- 首次进入 `reading/finished` 会设置 `started_at`。

---
## 4. 查询与统计
### 获取单本记录
```http
GET /reading-records/book/12
Authorization: Bearer <jwt>
```
404：未找到记录。

### 列出我的记录
```http
GET /reading-records/my
Authorization: Bearer <jwt>
```
按更新时间倒序返回。

### 统计汇总
```http
GET /reading-records/stats/summary
Authorization: Bearer <jwt>
```
响应示例：
```json
{ "total":10, "finished":3, "reading":5, "planned":1, "paused":1, "total_minutes":123, "finished_ratio":0.3 }
```

---
## 5. 删除
```http
DELETE /reading-records/91
Authorization: Bearer <jwt>
```
成功：`{ "ok": true }` ；404：记录不存在或不归属当前用户。

---
## 6. 校验与错误码
输入约束：
- `progress` 范围 0..100（越界将被拒绝或归一化，视实现）；
- `minutes_increment` 应为非负整数；
- `status` 取值必须为枚举之一。

错误码：
- 401 未认证：缺少或无效 Token；
- 404 资源不存在：书籍或阅读记录；
- 400 非法输入：枚举非法、进度越界、增量为负等（若启用校验）。

---
## 7. 状态迁移与时间字段
- planned → reading：首次进入 `reading` 写入 `started_at`；
- reading ↔ paused：允许在两者之间切换，不影响 `started_at`；
- reading → finished：当 `progress=100` 或显式设置 `finished`，若 `finished_at` 为空则写入当前时间；
- 任何 Upsert 成功都会刷新 `last_read_at` 为当前时间；
- 若从 finished 回退为 reading（不推荐），可保留 `finished_at` 历史或清空（视产品策略与实现）。

---
## 8. 扩展建议
- 章节级进度集合（多记录跟踪）与时间线；
- 每日阅读时间明细表（按日累加而非总和）；
- 公开分享的阅读动态（配合隐私设置）；
- 统计缓存与图表数据预聚合。
