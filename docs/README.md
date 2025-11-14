# 📚 项目功能总览与文档索引

> 本文件按“功能点”统一梳理当前后端能力，并为每个模块提供入口、核心职责、主要端点、权限需求与测试覆盖概况。原分散的独立指南（Books、Permissions、Recommendations 等）仍然保留；请从这里开始浏览。

## 目录
1. 核心领域模块
2. 用户与权限体系
3. 内容与交互扩展
4. 文件与基础设施
5. 数据库与环境
6. 全局功能矩阵速查
7. 测试覆盖与质量
8. 未来扩展建议
9. 文档维护规范

---
## 1. 核心领域模块

> 🚨 迁移公告：原 Book-Lists (书单) 模块已被全新的媒体库 Media Libraries 替换。请使用 `MEDIA_LIBRARIES_README.md` 文档与 `/media-libraries` 端点。旧 `BOOK_LISTS_README.md` 已标记 Deprecated，仅保留一版过渡。

| 模块 | 职责概述 | 关键能力 | 文档 | 主要实体 |
|------|----------|----------|------|----------|
| Books | 最小化图书模型 + 标签管理 | CRUD（仅标签/作者信息）、标签多对多、推荐、搜索、评论、评分 | `BOOKS_README.md` / `BOOKS_TAG_SEARCH.md` | Book, Tag, Comment |
| Media Libraries | 统一的用户/系统集合（支持书籍与子库嵌套、复制、标签、系统库保护） | 创建/列表/详情/添加书/嵌套库/删除条目/更新/复制 | `MEDIA_LIBRARIES_README.md` | MediaLibrary, MediaLibraryItem, Tag |
| Recommendations | 首页推荐分区（单库绑定） | 分区 CRUD / 单库切换 / 排序重排 | `RECOMMENDATIONS_GUIDE.md` | RecommendationSection |
| Reading Records (Deprecated) | 原用户阅读进度与统计（已被系统媒体库取代） | Upsert / 统计（已移除） | `READING_RECORDS_README.md` | (Removed) |

### 1.1 Books 模块功能切片
- 创建 / 更新 / 删除 图书（模型仅含 id / create_by / timestamps / tags）
- 标签去重与级联创建
- 多模式标签搜索（6 种优先级匹配）
- 推荐（共享标签数 + 创建时间降序）
- 评论与楼中楼回复（分页 / 权限校验）
- 评分（1-5 分）

### 1.2 Reading Records 关键规则
- user+book 唯一；Upsert 自动创建或更新
- 进度 0-100；`minutes_increment` 累加总时长
- 首次进入 reading/finished 写入 `started_at`；完成写入 `finished_at`
- 汇总统计含完成率、各状态计数与总分钟数

---
## 2. 用户与权限体系

| 功能 | 描述 | 文档 | 相关实体 |
|------|------|------|----------|
| 用户管理 | 用户基础资料与配置（含 user_config） | (集成在模块文档中) | User, UserConfig |
| 权限授予/撤销 | 等级化权限 (0/1/2/3) 精细控制访问与授权能力 | `PERMISSIONS_GUIDE.md` | Permission, UserPermission |
| Auth | 注册 / 登录 / Profile / 受保护示例 | `AUTH_README.md` | LoginResponseDto |

### 2.1 权限等级摘要
Level1: 基础访问; Level2: 授予/撤销自己授予的 level1; Level3: 完全管理 (授予与升级至 3)。

### 2.2 常用权限示例
- BOOK_CREATE / UPDATE / DELETE
- RECOMMENDATION_MANAGE
- FILE_MANAGE / SYS_MANAGE
- COMMENT_MANAGE

---
## 3. 内容与交互扩展

| 交互 | 说明 | 关键端点 | 权限 | 备注 |
|------|------|----------|------|------|
| 评论 (顶层) | 图书下新增评论 | POST /books/:id/comments | 登录 | 作者或 COMMENT_MANAGE 删除 |
| 评论回复 | 对某评论楼中楼 | POST /books/:id/comments/:commentId/replies | 登录 | 同上 |
| 推荐浏览 | 获取启用的推荐分区 | GET /recommendations/sections | 登录 | 可加入缓存 |
| 评分 | 为图书评分 | POST /books/:id/rating | 登录 | 平均值 + 计数返回 |
| 阅读进度(Deprecated) | Upsert 阅读记录 | POST /reading-records | - | 模块移除，使用系统媒体库 |

---
## 4. 文件与基础设施

| 能力 | 描述 | 文档 | 端点示例 | 权限 |
|------|------|------|----------|------|
| 上传策略 | 生成上传/下载策略或预签名 | `FILES_GUIDE.md` | /files/policy/public | SYS_MANAGE(3) |
| 对象上传 | 直接或通过 URL 上传对象 | `FILES_GUIDE.md` | /files/upload | 登录 |
| 对象删除 | 删除文件对象 | `FILES_GUIDE.md` | /files/object | 自己=无需 / 非自己=FILE_MANAGE(1) |

数据库与 Docker 管理详见 `DATABASE_GUIDE.md`：双库（开发 + 测试）结构、启动脚本、常见故障排查与卷策略。

---
## 5. 数据库与环境
- 开发库: 5432 / voidlord
- 测试库: 5433 / voidlord_test
- 初始化：权限种子 + 管理员账户 + 全量权限 level3授予
- 同步：开发模式 `synchronize=true`；生产建议迁移

参考：`DATABASE_GUIDE.md`

---
## 6. 全局功能矩阵速查

| 分类 | 功能点 | 端点 (示例) | 方法 | 权限要求 | 备注 |
|------|--------|-------------|------|----------|------|
| 图书 | 创建图书 | /books | POST | BOOK_CREATE(1) | 自动写 create_by；无标题/描述字段 |
| 图书 | 我的图书 | /books/my | GET | 登录 | 按创建时间倒序 |
| 图书 | 标签搜索统一入口 | /books/search | POST | (当前开放) | 6 模式优先匹配（仅标签基础） |
| 图书 | 推荐 | /books/recommend/:id | GET | (开放) | limit 默认5（基于标签相似度） |
| 图书 | 评论列表 | /books/:id/comments | GET | 开放 | 分页 limit<=100；与精简 Book 模型无耦合 |
| 图书 | 新增评论 | /books/:id/comments | POST | 登录 | 内容长度 1-2000 |
| 图书 | 删除评论 | /books/:id/comments/:commentId | DELETE | 登录/COMMENT_MANAGE | 作者或权限 |
| 图书 | 评分 | /books/:id/rating | POST | 登录 | 响应含平均值；评分不依赖标题 |
| 阅读记录(Deprecated) | Upsert | /reading-records | POST | - | 模块移除，使用系统媒体库 |
| 阅读记录(Deprecated) | 单本记录 | /reading-records/book/:bookId | GET | - | 模块移除 |
| 阅读记录(Deprecated) | 我的记录列表 | /reading-records/my | GET | - | 模块移除 |
| 阅读记录(Deprecated) | 汇总统计 | /reading-records/stats/summary | GET | - | 模块移除 |
| 推荐 | 分区管理 | /recommendations/sections | POST/PATCH/DELETE | RECOMMENDATION_MANAGE(1) | 单库绑定 |
| 认证 | 注册 | /auth/register | POST | 开放 | 返回登录态 |
| 认证 | 登录 | /auth/login | POST | 开放 | 返回登录态 |
| 认证 | Profile | /auth/profile | GET | 登录 | 基本资料 |
| 认证 | Protected 示例 | /auth/protected | GET | 登录 | 演示 JWT 注入 |
| 媒体库 | 创建库 | /media-libraries | POST | 登录 | name 唯一，可附 tags |
| 媒体库 | 我的库列表 | /media-libraries/my | GET | 登录 | 含 items_count, tags |
| 媒体库 | 库详情 | /media-libraries/:id | GET | 登录/公开 | items 中含 book 或 child_library |
| 媒体库 | 添加书籍 | /media-libraries/:id/books/:bookId | POST | 登录(owner) | 系统库禁止 |
| 媒体库 | 嵌套子库 | /media-libraries/:id/libraries/:childId | POST | 登录(owner) | 禁止 self/重复 |
| 媒体库 | 删除条目 | /media-libraries/:id/items/:itemId | DELETE | 登录(owner) | 统一删除书或子库条目 |
| 媒体库 | 更新库 | /media-libraries/:id | PATCH | 登录(owner) | name 去重 / tags 覆盖 / 系统库锁定 |
| 媒体库 | 复制库 | /media-libraries/:id/copy | POST | 登录 | 仅复制书籍条目，名称自动去重 |
| 媒体库 | 删除库 | /media-libraries/:id | DELETE | 登录(owner) | 系统库禁止 |
| 权限 | 授予 | /permissions/grant | POST | USER_UPDATE(2) | level2 仅授予 level1 |
| 权限 | 撤销 | /permissions/revoke | POST | USER_UPDATE(2) | level2 仅撤销自己授予 |
| 权限 | 用户权限查看 | /permissions/user/:id | GET | USER_READ(1) | 列表 |
| 权限 | 我的权限 | /permissions/user/me | GET | 登录 | 返回当前用户权限列表 |
| 文件 | 公共策略 | /files/policy/public | POST | SYS_MANAGE(3) | - |
| 文件 | 上传 URL | /files/upload-url | GET | 登录 | 预签名模式 |
| 文件 | 删除对象 | /files/object | DELETE | 登录/FILE_MANAGE(1) | 非本人需权限 |

---
## 7. 测试覆盖与质量

| 模块 | 单元覆盖 | E2E 场景 | 关键断言 | 备注 |
|------|----------|----------|----------|------|
| Books | Service + Controller（含搜索/推荐/评论） | CRUD / 搜索六模式 / 推荐排序 / 评论权限 | 精简模型字段（无 hash/title/description）正确返回 | 评分与评论分页边界 |
| Recommendations | 分区 CRUD + 单库绑定 | 重排与过滤 | 排序更新 | - |
| Reading Records | Upsert / 汇总 / 状态计算 | 进度更新 / 删除 / 统计 | finished_ratio / 时间字段 | - |
| Permissions | 授予 / 撤销逻辑 | 授权失败 / 升级规则 | 等级限制与403/401 | - |
| Files | 策略生成 / 所有权删除判断 | 上传/删除路径 | 权限分支 | 需更多负载测试 |
| Media Libraries | 库 CRUD / 条目添加 / 嵌套 / 复制 | 添加书籍 / 嵌套库 / 复制名称去重 | 系统库锁定、重复冲突、私有访问控制 | - |

质量门槛：当前 Lint 0 错误；所有单元与 E2E 用例通过。新增功能需：
1. 提供最小单元测试（正常 + 至少1边界）
2. 若含跨模块整合，补充 E2E 场景
3. 文档同步更新：在 README 中追加行或在模块独立文档中维护

---
## 8. 未来扩展建议
- 权限审计表：记录授予/撤销历史用于安全与追责
- 缓存层：热门书籍 / 推荐结果 / 标签查询缓存
- 搜索增强：AND/OR/NOT、权重、向量/协同过滤混合推荐
- 文件服务：内容指纹与防重复上传、版本控制
- 阅读记录：按日统计与时间线动态、社交分享
- 评论：@用户通知 + 点赞/折叠机制
- 监控：Prometheus 指标（请求耗时、命中率、推荐计算性能）

---
## 9. 文档维护规范
- 新增模块：提供独立 `MODULE_NAME_GUIDE.md` 或 `MODULE_NAME_README.md` 并在本索引模块表中添加行。
- 端点变化：同步更新第 6 节功能矩阵。
- 权限新增：更新第 2 节“常用权限示例”与矩阵。
- 废弃文档：在原文件首行加“> Deprecated: 请参考 xxx” 并保留 1 个版本迭代后移除。
- 测试新增：若覆盖率显著扩展，请更新第 7 节表格备注。

贡献步骤：
1. 修改或新增文档
2. 运行 lint / tests 确认通过
3. PR 中引用相关 issue 并说明文档更新点
4. Reviewer 校验功能矩阵是否同步

---
## 速览导航
| 文档 | 描述 |
|------|------|
| `BOOKS_README.md` | 精简图书模型 + 标签 + 评论/评分完整指南（已移除 hash/title/description） |
| `BOOKS_TAG_SEARCH.md` | 六种标签搜索模式与推荐细节 |
| `PERMISSIONS_GUIDE.md` | 等级化权限与授权流程 |
| `RECOMMENDATIONS_GUIDE.md` | 推荐分区（单库绑定）管理与排序接口 |
| `AUTH_README.md` | 用户注册、登录与 JWT 保护端点 |
| `READING_RECORDS_README.md` | 阅读记录 Upsert + 汇总统计 |
| `MEDIA_LIBRARIES_README.md` | 媒体库（替代书单） CRUD / 嵌套 / 复制 / 系统库 |
| `BOOK_LISTS_README.md` | (Deprecated) 旧书单文档，迁移参考 |
| `FILES_GUIDE.md` | 文件策略、上传与删除权限判定 |
| `DATABASE_GUIDE.md` | 双数据库启动、环境和故障排查 |
| `TAG_SEARCH_API_SUMMARY.md` | (Deprecated) 已迁移至 `BOOKS_TAG_SEARCH.md` |

---
如需增补或发现缺漏，欢迎提交 Issue 或 PR。🤝
