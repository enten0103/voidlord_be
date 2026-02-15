## Media Libraries（用法示例）

## 创建媒体库

```bash
curl -X POST http://localhost:3000/media-libraries \
  -H 'Authorization: Bearer <jwt>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"收藏夹","description":null,"is_public":false,"tags":[{"key":"genre","value":"sf"}]}'
```

## 我的媒体库列表

```bash
curl http://localhost:3000/media-libraries/my \
  -H 'Authorization: Bearer <jwt>'
```

## 获取媒体库详情

```bash
curl http://localhost:3000/media-libraries/10 \
  -H 'Authorization: Bearer <jwt>'
```

## 往库里添加书

```bash
curl -X POST http://localhost:3000/media-libraries/10/books/12 \
  -H 'Authorization: Bearer <jwt>'
```

## 嵌套子库

```bash
curl -X POST http://localhost:3000/media-libraries/10/libraries/11 \
  -H 'Authorization: Bearer <jwt>'
```

## 移除条目

```bash
curl -X DELETE http://localhost:3000/media-libraries/10/items/77 \
  -H 'Authorization: Bearer <jwt>'
```

## 更新媒体库

```bash
curl -X PATCH http://localhost:3000/media-libraries/10 \
  -H 'Authorization: Bearer <jwt>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"收藏夹2","tags":[{"key":"genre","value":"sf"}]}'
```

## 复制媒体库

```bash
curl -X POST http://localhost:3000/media-libraries/10/copy \
  -H 'Authorization: Bearer <jwt>'
```

## 删除媒体库

```bash
curl -X DELETE http://localhost:3000/media-libraries/10 \
  -H 'Authorization: Bearer <jwt>'
```

## 系统“阅读记录”库

```bash
curl http://localhost:3000/media-libraries/reading-record \
  -H 'Authorization: Bearer <jwt>'
```

## 虚拟“我的上传”库

```bash
curl http://localhost:3000/media-libraries/virtual/my-uploaded \
  -H 'Authorization: Bearer <jwt>'
```

## 分页示例（库详情）

```bash
curl "http://localhost:3000/media-libraries/10?limit=20&offset=0" \
  -H 'Authorization: Bearer <jwt>'
```

**Q: 虚拟“我的上传”库与普通库区别?**  
不持久化；`id=0`；不可更新/删除/复制；用于前端快速获取聚合视图。

**Q: 虚拟库是否包含我删除的书?**  
不会；仅实时查询仍存在且 `create_by = 当前用户` 的书籍。

---

若发现遗漏或改进机会，请提交 Issue / PR。✅
