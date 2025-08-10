# Changelog

全部显著变更会记录在此文件中。格式参考 Conventional Commits。

## [Unreleased]
### ✨ Feat
- feat(books): 标签多模式搜索 (tagKeys / 单键值 / 多键值 OR / tagId / tagIds AND) 统一入口 POST /books/search
- feat(books): 基于标签重叠度的推荐接口 GET /books/recommend/:id?limit=5 (共享标签数降序 + 创建时间降序)
- feat(docs): Swagger 丰富示例 (search oneOf / recommend 示例响应 / limit 说明)

### 🛠 Refactor
- refactor(books): 迁移旧 src/books 到 src/modules/books 并清理遗留代码
- refactor(users): 调整实体/服务导入路径为相对形式，减少路径歧义

### 🧪 Test
- test(books): 补充 Service & Controller 标签搜索与推荐单测
- test(e2e): 增加搜索/推荐端到端覆盖，DataSource 正常销毁避免 open handle 警告
- test(legacy): 添加占位 spec 保障迁移后测试套件完整性

### 📄 Docs
- docs: 新增文档索引 README.md、BOOKS_TAG_SEARCH.md、更新 BOOKS_README.md、DATABASE_GUIDE.md 补充使用路径
- docs: 标记并清空过时 TAG_SEARCH_API_SUMMARY.md（迁移提示）

### 🧹 Chore
- chore: 统一 Book 模块 Swagger 注释与示例

---

## 0.1.0 - 初始版本
### ✨ Feat
- feat(core): 初始 NestJS 框架搭建 (app module / 基础结构)
- feat(auth): 用户注册与登录 (JWT + 本地策略)
- feat(books): Book & Tag 实体、CRUD、标签多对多管理、基础查询

### 🧪 Test
- test: 初始单元 & E2E 测试框架集成

### 🗃 Chore
- chore: TypeORM + PostgreSQL 基础配置

---

## 提示
未来新增发布可使用 feat:/fix:/refactor:/docs:/test:/chore: 等前缀；可后续集成 standard-version 自动生成版本号与日志。

## 参考
- Conventional Commits: https://www.conventionalcommits.org/
