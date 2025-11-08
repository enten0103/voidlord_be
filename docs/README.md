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

| 模块 | 职责概述 | 关键能力 | 文档 | 主要实体 |
|------|----------|----------|------|----------|
| Books | 图书基本信息与标签管理 | CRUD、标签多对多、推荐、搜索、评论、评分 | `BOOKS_README.md` / `BOOKS_TAG_SEARCH.md` | Book, Tag, Comment |
| Book-Lists | 用户自定义/系统维护的书单集合 | 书单 CRUD、书籍关联、排序 | `BOOK_LISTS_README.md` | BookList |
| Recommendations | 首页/公共推荐分区与条目 | 推荐分区与条目 CRUD、公开聚合 | `RECOMMENDATIONS_GUIDE.md` | RecommendationSection, RecommendationItem |
| Reading Records | 用户阅读进度与统计 | Upsert 进度、状态流转、分钟统计、汇总 | `READING_RECORDS_README.md` | ReadingRecord |

### 1.1 Books 模块功能切片
- 创建 / 更新 / 删除 图书
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
| 认证 | JWT 登录与请求上下文 `JwtRequestWithUser` | 代码内 `request.interface.ts` | - |

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
| 推荐公开浏览 | 获取公共推荐视图 | GET /recommendations/public | 无 | 缓存潜力 |
| 评分 | 为图书评分 | POST /books/:id/rating | 登录 | 平均值 + 计数返回 |
| 阅读进度 | Upsert 阅读记录 | POST /reading-records | 登录 | 逻辑去重 |

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
| 图书 | 创建图书 | /books | POST | BOOK_CREATE(1) | 自动写 create_by |
| 图书 | 我的图书 | /books/my | GET | 登录 | 按创建时间倒序 |
| 图书 | 标签搜索统一入口 | /books/search | POST | (当前开放) | 6 模式优先匹配 |
| 图书 | 推荐 | /books/recommend/:id | GET | (开放) | limit 默认5 |
| 图书 | 评论列表 | /books/:id/comments | GET | 开放 | 分页 limit<=100 |
| 图书 | 新增评论 | /books/:id/comments | POST | 登录 | 内容长度 1-2000 |
| 图书 | 删除评论 | /books/:id/comments/:commentId | DELETE | 登录/COMMENT_MANAGE | 作者或权限 |
| 图书 | 评分 | /books/:id/rating | POST | 登录 | 响应含平均值 |
| 阅读记录 | Upsert | /reading-records | POST | 登录 | minutes 增量累加 |
| 阅读记录 | 单本记录 | /reading-records/book/:bookId | GET | 登录 | 404 不存在 |
| 阅读记录 | 我的记录列表 | /reading-records/my | GET | 登录 | 更新时间降序 |
| 阅读记录 | 汇总统计 | /reading-records/stats/summary | GET | 登录 | 完成率计算 |
| 推荐 | 分区管理 | /recommendations/sections | POST/PATCH/DELETE | RECOMMENDATION_MANAGE(1) | - |
| 推荐 | 公共推荐 | /recommendations/public | GET | 开放 | 聚合显示 |
| 书单 | CRUD | /book-lists* | 多种 | (视实现) | 排序与关联 |
| 权限 | 授予 | /permissions/grant | POST | USER_UPDATE(2) | level2 仅授予 level1 |
| 权限 | 撤销 | /permissions/revoke | POST | USER_UPDATE(2) | level2 仅撤销自己授予 |
| 权限 | 用户权限查看 | /permissions/user/:id | GET | USER_READ(1) | 列表 |
| 文件 | 公共策略 | /files/policy/public | POST | SYS_MANAGE(3) | - |
| 文件 | 上传 URL | /files/upload-url | GET | 登录 | 预签名模式 |
| 文件 | 删除对象 | /files/object | DELETE | 登录/FILE_MANAGE(1) | 非本人需权限 |

---
## 7. 测试覆盖与质量

| 模块 | 单元覆盖 | E2E 场景 | 关键断言 | 备注 |
|------|----------|----------|----------|------|
| Books | Service + Controller（含搜索/推荐/评论） | CRUD / 搜索六模式 / 推荐排序 / 评论权限 | 数据结构与错误码 | 评分与评论分页边界 |
| Recommendations | 分区与条目 CRUD | 公共聚合输出 | 排序与过滤 | - |
| Reading Records | Upsert / 汇总 / 状态计算 | 进度更新 / 删除 / 统计 | finished_ratio / 时间字段 | - |
| Permissions | 授予 / 撤销逻辑 | 授权失败 / 升级规则 | 等级限制与403/401 | - |
| Files | 策略生成 / 所有权删除判断 | 上传/删除路径 | 权限分支 | 需更多负载测试 |
| Book-Lists | 列表 CRUD / 排序 | 关联书籍 / 权限控制 | 排序与响应结构 | - |

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
| `BOOKS_README.md` | 图书与标签 + 评论/评分完整指南 |
| `BOOKS_TAG_SEARCH.md` | 六种标签搜索模式与推荐细节 |
| `PERMISSIONS_GUIDE.md` | 等级化权限与授权流程 |
| `RECOMMENDATIONS_GUIDE.md` | 推荐分区/条目管理与公开接口 |
| `READING_RECORDS_README.md` | 阅读记录 Upsert + 汇总统计 |
| `BOOK_LISTS_README.md` | 书单 CRUD 与条目管理 |
| `FILES_GUIDE.md` | 文件策略、上传与删除权限判定 |
| `DATABASE_GUIDE.md` | 双数据库启动、环境和故障排查 |
| `TAG_SEARCH_API_SUMMARY.md` | (Deprecated) 已迁移至 `BOOKS_TAG_SEARCH.md` |

---
如需增补或发现缺漏，欢迎提交 Issue 或 PR。🤝
