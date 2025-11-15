# Changelog

全部显著变更会记录在此文件中。格式参考 Conventional Commits。

## [unreleased]
### 💥 Breaking
- remove(books): 删除所有旧标签搜索模式与相关 GET 端点 (`/books/tags/:key/:value`, `/books/tag-id/:id`, `/books/tag-ids/:ids`)；统一仅保留 POST `/books/search` 条件数组形式。

### 🛠 Refactor
- refactor(books): 简化搜索实现为 AND 链式子查询，移除多模式优先级分支逻辑。

### 🧪 Test
- test(books): 增加重复条件与空字符串值、非法操作符的单元与 E2E 测试用例；移除全部旧端点测试。
- test(books): 新增搜索排序 (created_at|updated_at|rating) 单元与 E2E 测试（含未评分视为 -1 逻辑，分页与非分页）。
- test(media-libraries): 库详情 / 系统阅读记录 / 虚拟“我的上传” 分页 E2E 场景与单元测试，验证元数据与子集长度。

### 📄 Docs
- docs(books): 更新 `BOOKS_TAG_SEARCH.md`、根 `README.md` 与文档索引 README；新增 Swagger 示例（重复条件 / 空值 / 非法 op）。
- docs(books): 补充搜索排序与分页参数说明 (sortBy/sortOrder/limit/offset) 与示例。
- docs(media-libraries): README 增加分页响应形态与三端点使用示例；索引 README 更新功能矩阵备注。

### ✨ Feat
- feat(books): 统一条件数组搜索 (operators: eq / neq / match) 支持空值匹配与重复条件容忍；新增可选分页 (limit/offset) 返回 { total, limit, offset, items }。
- feat(books): 搜索支持排序 `sortBy=created_at|updated_at|rating` + `sortOrder=asc|desc`；rating 排序将未评分视为 -1 (COALESCE)。
- feat(media-libraries): 库详情 / 系统阅读记录 / 虚拟上传库支持分页 (limit/offset) 返回 { items_count, limit, offset, items } 元数据；未传分页参数保持原有兼容形态。

### 🧹 Chore
- chore(swagger): 移除遗留的基于旧模式的 oneOf 示例，新增统一 schema + 扩展 examples。
- chore(swagger): 统一 limit/offset 与 sortBy/sortOrder 的 @ApiQuery 多行描述格式；媒体库端点新增分页注释。
### ✨ Feat
- feat(book-lists): 为 FavoriteList 添加标签支持 (ManyToMany with Tag) 与嵌套结构 (FavoriteListItem.parent_list)
- feat(book-lists): 标签去重与自动创建逻辑，复制书单时继承标签
- feat(book-lists): 增强 Swagger 文档示例，明确标签与嵌套支持

### 🧪 Test
- test(book-lists): 添加标签管理单元测试 (create/update/copy with tags)
- test(book-lists): 增加 E2E 场景测试标签持久化、更新、复制继承

### 📄 Docs
- docs(book-lists): 详细说明标签数据结构、去重策略、生命周期
- docs(book-lists): 新增"书单嵌套"章节说明层级结构用法
- docs: 全局 README 更新功能矩阵，细化书单相关端点描述

### 🧹 Chore
- chore: 同步 Controller Swagger 示例包含 tags 字段

---

## [released]
### 💥 Breaking
- remove(auth): 移除未使用的基于 role 的授权体系 (User.role 字段 / JWT role 声明 / RolesGuard / @Roles 装饰器) 统一仅保留细粒度 permissions；需要前端不再依赖 token 中的 role。
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
