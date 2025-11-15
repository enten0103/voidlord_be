# 📑 统一标签条件搜索与推荐指南 (2025 Final)

## 💥 Breaking: 移除全部旧标签搜索模式
以下旧字段与 GET 端点已完全删除：`q` / `tagKeys` / `tagKey`+`tagValue` / `tagFilters` / `tagId` / `tagIds` 以及对应的 `GET /books/tags/:key/:value`, `GET /books/tag-id/:id`, `GET /books/tag-ids/:ids`。现在仅保留 **统一 POST `/books/search`** + 推荐接口。

## ✅ 新搜索协议：conditions AND
请求主体包含一个可选的 `conditions` 数组，每个元素结构：
```jsonc
{ "target": "author", "op": "eq", "value": "Isaac Asimov" }
```
- `target`: tag.key
- `op`: `eq | neq | match`
  - `eq`  : 存在指定 key 且 value 全等
  - `neq` : 不存在该 key+value 组合（缺失或不同都符合）
  - `match`: 存在指定 key 且 `value ILIKE %输入%`
- `value`: 字符串；`match` 自动包裹 `%`；允许空字符串（用于匹配空值标签）

逻辑：全部条件 **AND**。`conditions` 为空或缺失 => 返回全部书籍。

### 分页 (可选)
在请求体中添加 `limit` / `offset` 将启用分页模式，响应结构变为：
```jsonc
{
  "total": 42,
  "limit": 20,
  "offset": 0,
  "items": [ { "id": 1, "tags": [{ "key": "author", "value": "Isaac Asimov" }] } ]
}
```
规则：
- `limit` 缺失 => 仅当也缺失 `offset` 时返回数组模式；提供后分页响应。
- `limit <= 0` 重置为 20；`limit > 100` 夹紧为 100。
- `offset < 0` 重置为 0。
- 未提供分页参数 => 直接返回匹配书籍数组（与旧行为兼容）。

## 🔍 常用示例 (curl)
```bash
# 1. 单条件 eq
curl -X POST http://localhost:3000/books/search -H 'Content-Type: application/json' \
  -d '{"conditions":[{"target":"author","op":"eq","value":"Isaac Asimov"}]}'

# 2. 多条件 AND (author eq + genre eq)
curl -X POST http://localhost:3000/books/search -H 'Content-Type: application/json' \
  -d '{"conditions":[{"target":"author","op":"eq","value":"Isaac Asimov"},{"target":"genre","op":"eq","value":"Science Fiction"}]}'

# 3. eq + neq 排除某具体组合
curl -X POST http://localhost:3000/books/search -H 'Content-Type: application/json' \
  -d '{"conditions":[{"target":"author","op":"eq","value":"Isaac Asimov"},{"target":"genre","op":"neq","value":"Science Fiction"}]}'

# 4. match 模糊 (ILIKE 部分匹配)
curl -X POST http://localhost:3000/books/search -H 'Content-Type: application/json' \
  -d '{"conditions":[{"target":"author","op":"match","value":"asim"}]}'

# 5. 空条件 => 全部图书
curl -X POST http://localhost:3000/books/search -H 'Content-Type: application/json' -d '{}'

# 6. 重复条件 (等价于单条件，仍然合法)
curl -X POST http://localhost:3000/books/search -H 'Content-Type: application/json' \
  -d '{"conditions":[{"target":"author","op":"eq","value":"Isaac Asimov"},{"target":"author","op":"eq","value":"Isaac Asimov"}]}'

# 7. 空字符串值匹配 (标签 value 为空)
curl -X POST http://localhost:3000/books/search -H 'Content-Type: application/json' \
  -d '{"conditions":[{"target":"year","op":"eq","value":""}]}'

# 8. 非法操作符 -> 400
curl -X POST http://localhost:3000/books/search -H 'Content-Type: application/json' \
  -d '{"conditions":[{"target":"author","op":"unknown","value":"x"}]}'

# 9. 分页 (limit+offset) 返回 paged 对象
curl -X POST http://localhost:3000/books/search -H 'Content-Type: application/json' \
  -d '{"limit":10,"offset":0,"conditions":[{"target":"author","op":"eq","value":"Isaac Asimov"}]}'
```

## 🛠 查询内部实现
每个条件转换为子查询：
```sql
-- eq
EXISTS (SELECT 1 FROM book_tags bt JOIN tag t ON t.id = bt.tag_id
        WHERE bt.book_id = book.id AND t.key = :keyN AND t.value = :valN)
-- neq
NOT EXISTS (SELECT 1 FROM book_tags bt JOIN tag t ON t.id = bt.tag_id
            WHERE bt.book_id = book.id AND t.key = :keyN AND t.value = :valN)
-- match
EXISTS (SELECT 1 FROM book_tags bt JOIN tag t ON t.id = bt.tag_id
        WHERE bt.book_id = book.id AND t.key = :keyN AND t.value ILIKE :valN)
```
按条件顺序 `AND` 拼接；排序：`book.created_at DESC`。

## 🔄 迁移映射 (旧 -> 新)
| 旧模式 | 新写法示例 | 说明 |
|--------|------------|------|
| q=asim | `{conditions:[{target:"author",op:"match",value:"asim"}]}` | 需指定匹配的 tag key (旧 q 跨 key/value 不再自动全库模糊) |
| tagKeys=author,genre (OR) | 多次请求或等待未来 OR 扩展 | 当前仅 AND；不支持 OR 汇总 |
| tagKey=author&tagValue=John | `{conditions:[{target:"author",op:"eq",value:"John"}]}` | 直接 eq |
| tagFilters=[{a:A},{g:G}] (OR) | `{conditions:[{target:"a",op:"eq",value:"A"},{target:"g",op:"eq",value:"G"}]}` | 现为 AND；如需 OR 等待扩展 |
| tagId / tagIds | 不再支持 | 需通过 key/value 转换；ID 查询端点已移除 |

## 🚀 推荐接口保持不变
`GET /books/recommend/:id?limit=5`：按共享标签数降序，次级按创建时间。`limit` 默认 5，最大 50。
```bash
curl "http://localhost:3000/books/recommend/42?limit=10"
```

## ✅ 测试覆盖
单元 & E2E：eq / neq / match / AND 组合 / 空条件 / 重复条件 / 空字符串值 / 非法 op / 推荐排序与 limit。

## 🔮 未来扩展计划
| Feature | 状态 | 说明 |
|---------|------|------|
| OR / 分组逻辑 | 规划 | 可能引入 `( )` 与优先级或 DSL | 
| 权重/评分加权 | 待评估 | 与推荐排序结合 |
| pg_trgm 提升 match 排序 | 待评估 | 更好相关性 |
| 语义 / 向量搜索 | 规划 | 与条件过滤结合 |

---
该重构已通过全部现有测试；旧客户端需升级调用方式。必要时请参考对应版本的 git tag 获取旧实现。
