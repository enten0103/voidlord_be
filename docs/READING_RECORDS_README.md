# 阅读记录 API 指南

提供用户针对书籍的个人阅读进度与统计管理：支持创建/更新进度、查看单本记录、列出全部、统计汇总与删除。

## 数据模型

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

## API 概览（均需登录）
- Upsert 创建/更新：POST /reading-records
- 列出我的记录：GET /reading-records/my
- 获取指定书的记录：GET /reading-records/book/:bookId
- 阅读统计汇总：GET /reading-records/stats/summary
- 删除记录：DELETE /reading-records/:id

## Upsert 创建/更新
```http
POST /reading-records
Authorization: Bearer <jwt>
Content-Type: application/json

{ "bookId": 12, "progress": 25, "status": "reading", "minutes_increment": 5 }
```
成功响应示例：
```json
{
  "id": 91,
  "bookId": 12,
  "status": "reading",
  "progress": 25,
  "total_minutes": 5,
  "last_read_at": "2025-01-01T00:00:00.000Z"
}
```
说明：
- 若记录不存在则创建；已存在则更新指定字段。
- `minutes_increment` 增量累加到 `total_minutes`。
- 当 status=finished 或 progress=100 会写入 `finished_at`（若尚未写入）。
- 首次进入 reading/finished 会设置 `started_at`。

## 获取单本记录
```http
GET /reading-records/book/12
Authorization: Bearer <jwt>
```
404：未找到记录。

## 列出我的记录
```http
GET /reading-records/my
Authorization: Bearer <jwt>
```
返回按更新时间倒序排序。

## 统计汇总
```http
GET /reading-records/stats/summary
Authorization: Bearer <jwt>
```
示例响应：
```json
{
  "total": 10,
  "finished": 3,
  "reading": 5,
  "planned": 1,
  "paused": 1,
  "total_minutes": 123,
  "finished_ratio": 0.3
}
```

## 删除记录
```http
DELETE /reading-records/91
Authorization: Bearer <jwt>
```
成功：`{ "ok": true }`
404：记录不存在或不归属当前用户。

## 错误码
- 401 未认证：缺少或无效 Token
- 404 资源不存在：书籍或阅读记录

## 未来扩展建议
- 支持章节层级的更细粒度进度集合
- 每日阅读时间统计表（拆分 total_minutes 为日期维度）
- 加入公开分享的阅读动态（需隐私设置）
