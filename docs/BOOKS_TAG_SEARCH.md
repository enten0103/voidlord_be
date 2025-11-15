# 📑 标签搜索与推荐说明

## 搜索统一入口
POST /books/search 支持以下字段(优先级从高到低)：
1. q: 模糊匹配 (ILIKE) tag.key 或 tag.value 的任意子串（大小写不敏感）
2. tagKeys: "author,genre"  (OR)
3. tagKey + tagValue 单键值精确匹配
4. tagFilters: [{key,value},...] (多键值 OR)
5. tagId: 单标签 ID
6. tagIds: "1,2,3" (全部包含 AND)
7. 空对象 => 全部书籍

Controller 按顺序匹配第一个命中模式；一旦 `q` 存在即走模糊搜索，不再执行后续精确/组合模式。

注：搜索逻辑不受 `create_by` 字段影响，但返回的 `Book` 对象会包含 `create_by` 以便审计与展示。

### 示例（模糊与精确）
```bash
curl -X POST http://localhost:3000/books/search -H "Content-Type: application/json" -d '{"q":"asim"}'
curl -X POST http://localhost:3000/books/search -H "Content-Type: application/json" -d '{"tagKeys":"author,genre"}'
curl -X POST http://localhost:3000/books/search -H "Content-Type: application/json" -d '{"tagKey":"author","tagValue":"Asimov"}'
curl -X POST http://localhost:3000/books/search -H "Content-Type: application/json" -d '{"tagFilters":[{"key":"author","value":"Asimov"},{"key":"year","value":"1950"}]}'
curl -X POST http://localhost:3000/books/search -H "Content-Type: application/json" -d '{"tagIds":"5,8,11"}'
```

### 多标签 AND 实现
QueryBuilder 分组 + HAVING：
```ts
qb.groupBy('book.id')
  .having('COUNT(DISTINCT tag.id) = :len', { len: ids.length })
  .andWhere('tag.id IN (:...ids)', { ids });
```

## 推荐功能
GET /books/recommend/:id?limit=5 按共享标签数量 desc，然后创建时间 desc；limit 默认 5，最大 50。
```bash
curl "http://localhost:3000/books/recommend/42?limit=10"
```

## 测试覆盖
单元 & E2E 覆盖：模糊 + 六种搜索模式、空条件、无匹配、URL 编码、推荐排序/limit/错误参数。

## 扩展方向
- 标签权重/评分
- AND/OR/NOT 逻辑表达式
- 协同过滤或嵌入向量混合推荐
- 模糊搜索升级为 pg_trgm 相似度排序（按相似度 + 时间综合排序）
