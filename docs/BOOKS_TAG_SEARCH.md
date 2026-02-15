# Books 搜索（用法示例）

统一入口：`POST /books/search`

请求体示例：

```json
{
  "conditions": [{ "target": "author", "op": "eq", "value": "Isaac Asimov" }]
}
```

## 常用示例（curl）

```bash
# 1) 单条件 eq
curl -X POST http://localhost:3000/books/search -H 'Content-Type: application/json' \
  -d '{"conditions":[{"target":"author","op":"eq","value":"Isaac Asimov"}]}'

# 2) 多条件 AND
curl -X POST http://localhost:3000/books/search -H 'Content-Type: application/json' \
  -d '{"conditions":[{"target":"author","op":"eq","value":"Isaac Asimov"},{"target":"genre","op":"eq","value":"Science Fiction"}]}'

# 3) neq
curl -X POST http://localhost:3000/books/search -H 'Content-Type: application/json' \
  -d '{"conditions":[{"target":"genre","op":"neq","value":"Horror"}]}'

# 4) match（模糊）
curl -X POST http://localhost:3000/books/search -H 'Content-Type: application/json' \
  -d '{"conditions":[{"target":"author","op":"match","value":"asim"}]}'

# 5) 分页：返回 { total, limit, offset, items }
curl -X POST http://localhost:3000/books/search -H 'Content-Type: application/json' \
  -d '{"limit":10,"offset":0,"conditions":[{"target":"author","op":"eq","value":"Isaac Asimov"}]}'
```

## 推荐（基于共享标签）

```bash
curl "http://localhost:3000/books/recommend/42?limit=10"
```
