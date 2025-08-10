# 📑 标签搜索与推荐说明

## 搜索统一入口
POST /books/search 支持以下字段(优先级从高到低)：
1. tagKeys: "author,genre"  (OR)
2. tagKey + tagValue 单键值精确匹配
3. tagFilters: [{key,value},...] (多键值 OR)
4. tagId: 单标签 ID
5. tagIds: "1,2,3" (全部包含 AND)
6. 空对象 => 全部书籍

Controller 按顺序匹配第一个命中模式。

### 示例
```bash
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
单元 & E2E 覆盖：五种搜索模式、空条件、无匹配、URL 编码、推荐排序/limit/错误参数。

## 扩展方向
- 标签权重/评分
- AND/OR/NOT 逻辑表达式
- 协同过滤或嵌入向量混合推荐
