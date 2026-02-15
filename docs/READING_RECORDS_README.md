# 阅读记录（用法示例）

## 设计概述

阅读记录采用 **心跳制** 设计：

1. 进入阅读页面时创建一条阅读记录（`POST /reading-records`），获得 `id`
2. 每 5 分钟发送一次心跳（`PATCH /reading-records/:id/heartbeat`），更新 `last_active_at` 和当前阅读位置
3. 退出阅读时也发送一次心跳
4. **没有显式的"结束"机制** — 阅读时长 = `last_active_at - started_at`
5. 如果整个阅读过程只有一次心跳（创建时），则时长为 0

## 阅读会话 API

### 开始阅读会话

```bash
curl -X POST http://localhost:3000/reading-records \
  -H 'Authorization: Bearer <jwt>' \
  -H 'Content-Type: application/json' \
  -d '{"bookId": 10, "instanceHash": "abc123", "xhtmlIndex": 0, "elementIndex": 0}'
```

返回 `ReadingRecord` 对象，包含 `id` 用于后续心跳。

### 心跳（每 5 分钟 + 退出时）

```bash
curl -X PATCH http://localhost:3000/reading-records/1/heartbeat \
  -H 'Authorization: Bearer <jwt>' \
  -H 'Content-Type: application/json' \
  -d '{"xhtmlIndex": 5, "elementIndex": 42}'
```

### 获取阅读时间线

```bash
curl "http://localhost:3000/reading-records/me?limit=20&offset=0" \
  -H 'Authorization: Bearer <jwt>'
```

### 获取某本书的阅读记录

```bash
curl "http://localhost:3000/reading-records/book/10?limit=20&offset=0" \
  -H 'Authorization: Bearer <jwt>'
```

---

## 媒体库集成

阅读相关的"集合管理"通过系统媒体库完成。

### 获取系统"阅读记录"媒体库（不存在会自动创建）

```bash
curl http://localhost:3000/media-libraries/reading-record \
  -H 'Authorization: Bearer <jwt>'
```

### 将一本书加入"阅读记录"库

```bash
curl -X POST http://localhost:3000/media-libraries/<readingRecordLibraryId>/books/12 \
  -H 'Authorization: Bearer <jwt>'
```

### 从"阅读记录"库移除某条目

```bash
curl -X DELETE http://localhost:3000/media-libraries/<readingRecordLibraryId>/items/<itemId> \
  -H 'Authorization: Bearer <jwt>'
```

### 分页获取"阅读记录"库

```bash
curl "http://localhost:3000/media-libraries/reading-record?limit=20&offset=0" \
  -H 'Authorization: Bearer <jwt>'
```
