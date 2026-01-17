# 阅读记录（用法示例）

阅读相关的“集合管理”通过系统媒体库完成。

## 获取系统“阅读记录”媒体库（不存在会自动创建）
```bash
curl http://localhost:3000/media-libraries/reading-record \
	-H 'Authorization: Bearer <jwt>'
```

## 将一本书加入“阅读记录”库
先拿到阅读记录库的 `id`（上一条接口返回），然后：
```bash
curl -X POST http://localhost:3000/media-libraries/<readingRecordLibraryId>/books/12 \
	-H 'Authorization: Bearer <jwt>'
```

## 从“阅读记录”库移除某条目
先 `GET /media-libraries/<id>` 拿到 items 里的 `itemId`，然后：
```bash
curl -X DELETE http://localhost:3000/media-libraries/<readingRecordLibraryId>/items/<itemId> \
	-H 'Authorization: Bearer <jwt>'
```

## 分页获取“阅读记录”库
```bash
curl "http://localhost:3000/media-libraries/reading-record?limit=20&offset=0" \
	-H 'Authorization: Bearer <jwt>'
```
