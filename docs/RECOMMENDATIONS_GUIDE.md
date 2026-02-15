# Recommendations（用法示例）

## 列出启用分区

```bash
curl http://localhost:3000/recommendations/sections \
	-H 'Authorization: Bearer <jwt>'
```

## 列出全部分区（含停用）

```bash
curl "http://localhost:3000/recommendations/sections?all=true" \
	-H 'Authorization: Bearer <jwt>'
```

## 分区详情

```bash
curl http://localhost:3000/recommendations/sections/1 \
	-H 'Authorization: Bearer <jwt>'
```

## 创建分区

```bash
curl -X POST http://localhost:3000/recommendations/sections \
	-H 'Authorization: Bearer <jwt>' \
	-H 'Content-Type: application/json' \
	-d '{"key":"today_hot","title":"今日最热","mediaLibraryId":42,"description":"近期热度","active":true}'
```

## 更新分区（切换绑定库）

```bash
curl -X PATCH http://localhost:3000/recommendations/sections/1 \
	-H 'Authorization: Bearer <jwt>' \
	-H 'Content-Type: application/json' \
	-d '{"mediaLibraryId":43}'
```

## 批量重排

```bash
curl -X PATCH http://localhost:3000/recommendations/sections/1 \
	-H 'Authorization: Bearer <jwt>' \
	-H 'Content-Type: application/json' \
	-d '{"sectionOrder":[3,2,1,5,4]}'
```

## 删除分区

```bash
curl -X DELETE http://localhost:3000/recommendations/sections/1 \
	-H 'Authorization: Bearer <jwt>'
```
