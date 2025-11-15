# 📑 标签搜索与推荐说明 (2025 重构版)

## BREAKING CHANGE: 统一条件数组搜索
`POST /books/search` 现仅接受一个字段：`conditions`，不再支持旧的 `q / tagKeys / tagKey+tagValue / tagFilters / tagId / tagIds` 等模式。

### 请求结构
```jsonc
{
  "conditions": [
    { "target": "author", "op": "eq", "value": "Isaac Asimov" },
    { "target": "genre", "op": "neq", "value": "Fantasy" },
    { "target": "year", "op": "match", "value": "195" }
  ]
}
```
- `target`: 对应 tag.key
- `op`: 操作符之一 `eq | neq | match`
  - `eq`  : 存在指定 key 且 value 全等
  - `neq` : 不存在指定 key+value 组合 (允许缺失或值不同)。实现为 `NOT EXISTS (...)`
  - `match`: 存在指定 key 且 `value ILIKE %输入%`
- `value`: 字符串；`match` 自动包裹 `%`

多个条件之间逻辑 **AND**：必须全部满足。
空或缺失 `conditions` => 返回全部书籍。

### 示例 (curl)
```bash
# 单条件 eq
curl -X POST http://localhost:3000/books/search \
  -H "Content-Type: application/json" \
  -d '{"conditions":[{"target":"author","op":"eq","value":"Isaac Asimov"}]}'

# 多条件 AND (eq + eq)
curl -X POST http://localhost:3000/books/search \
  -H "Content-Type: application/json" \
  -d '{"conditions":[{"target":"author","op":"eq","value":"Isaac Asimov"},{"target":"genre","op":"eq","value":"Science Fiction"}]}'

# eq + neq 排除某具体组合
curl -X POST http://localhost:3000/books/search \
  -H "Content-Type: application/json" \
  -d '{"conditions":[{"target":"author","op":"eq","value":"Isaac Asimov"},{"target":"genre","op":"neq","value":"Science Fiction"}]}'

# match 模糊 (ILIKE)
curl -X POST http://localhost:3000/books/search \
  -H "Content-Type: application/json" \
  -d '{"conditions":[{"target":"author","op":"match","value":"asim"}]}'

# 空条件 => 全部
curl -X POST http://localhost:3000/books/search -H "Content-Type: application/json" -d '{}'
```

### 查询实现要点
每个条件转换为子查询：
```sql
-- eq
EXISTS (
  SELECT 1 FROM book_tags bt JOIN tag t ON t.id = bt.tag_id
  WHERE bt.book_id = book.id AND t.key = :keyN AND t.value = :valN
)
-- neq
NOT EXISTS (
  SELECT 1 FROM book_tags bt JOIN tag t ON t.id = bt.tag_id
  WHERE bt.book_id = book.id AND t.key = :keyN AND t.value = :valN
)
-- match
EXISTS (
  SELECT 1 FROM book_tags bt JOIN tag t ON t.id = bt.tag_id
  WHERE bt.book_id = book.id AND t.key = :keyN AND t.value ILIKE :valN
)
```
按顺序 `qb.andWhere(...)` 构建 AND 链；最终按 `book.created_at DESC` 排序。

### 迁移说明
旧客户端需将：
- `q` => `{ target: <key>, op: "match", value: <substring> }`（若需原先同时匹配 key/value，可分多条件）
- `tagKeys` => 多个 `eq` 或改由单条件 `match` (视需求)；旧逻辑 OR 不再原样支持，需自行拆分多次请求或后续扩展。
- `tagKey+tagValue` => 单个 `eq` 条件
- `tagFilters` => 多个 `eq` 条件 (旧逻辑 OR -> 现在 AND；如需 OR 等待后续扩展)
- `tagId / tagIds` => 不再通过 /books/search；使用保留的 ID 相关专用 GET 接口（若仍存在）。

### 后续扩展计划 (Potential)
| Feature | 状态 | 说明 |
|---------|------|------|
| OR/分组逻辑 | 待设计 | 拓展 DSL 或引入表达式树 |
| NOT 多值 | 可用 (使用多条 neq) | 性能与可读性需观察 |
| 权重/评分加权搜索 | 待评估 | 与推荐结果混合排序 |
| pg_trgm 相似度 | 待评估 | 提升 match 排序质量 |
| 向量/嵌入语义搜索 | 规划 | 与条件过滤结合 |

## 推荐功能保持不变
`GET /books/recommend/:id?limit=5`：共享标签数降序 + 创建时间降序，`limit` 默认 5，最大 50。
```bash
curl "http://localhost:3000/books/recommend/42?limit=10"
```

## 测试覆盖 (当前)
单元 & E2E：eq / neq / match / AND 组合 / 空条件 / 非法 op / 推荐排序与 limit。

---
如需回退到旧模式，请使用 git tag 对应版本；本改动已通过所有现有测试。
