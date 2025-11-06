# 🔐 权限与授权指南

本项目已从单一角色演进为精细化的“权限 + 等级”模型。本文档描述权限体系、等级语义、授予/撤销流程、端点与最佳实践。

---
## 1. 核心概念

| 概念 | 说明 |
|------|------|
| Permission (权限) | 标识某一类能力的名称，如 `USER_READ`、`BOOK_CREATE` |
| Level (等级) | 针对某个用户在某个权限上的授权级别 (0/1/2/3) |
| UserPermission | 用户-权限-等级 的绑定记录，含授予者信息 `grantedBy` |

### 1.1 权限列表
当前内置权限常量 (见 `permissions.constants.ts`):
```
USER_READ
USER_CREATE
USER_UPDATE
USER_DELETE
BOOK_READ
BOOK_CREATE
BOOK_UPDATE
BOOK_DELETE
RECOMMENDATION_MANAGE
FILE_MANAGE
COMMENT_MANAGE
SYS_MANAGE
```

### 1.2 等级含义
| 等级 | 含义 | 可做操作 | 授权限制 |
|------|------|----------|----------|
| 0 | 无权限 | 不可访问受保护接口 | 无 |
| 1 | 基础使用 | 访问需要该权限且 `minLevel <=1` 的接口 | 不能授予或撤销任何人 |
| 2 | 进阶管理 | 可授予/撤销自己授予的该权限 (仅能授予 level 1) | 不能授予 level 2/3；只能撤销自己授予的记录 |
| 3 | 完全管理 | 授予 / 升级 / 撤销任意用户该权限 (至 3) | 不可被同级或更低级强制升级 (逻辑限制) |

> 升级规则：授予者的当前 level 必须严格大于目标记录原 level；防止同级互相覆盖。

---
## 2. 数据结构

### 2.1 相关实体
- `Permission`：系统权限主表 (唯一 `name`)
- `UserPermission`：字段：`id`, `user`, `permission`, `level`, `grantedBy`, `created_at`

### 2.2 典型记录示例
```json
{
  "userId": 15,
  "permission": "BOOK_UPDATE",
  "level": 1,
  "grantedBy": 1,
  "created_at": "2025-08-10T08:00:00.000Z"
}
```

---
## 3. 初始化与种子
应用启动时 `DatabaseInitService`：
1. 确保所有权限存在（若缺失则插入）。
2. 创建默认管理员账户 `admin / admin123`（若不存在）。
3. 给管理员授予每个权限的 level 3。

> 生产环境请修改初始管理员密码并使用环境变量注入。

---
## 4. 授权逻辑 (PermissionGuard)
控制器使用：
```ts
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiPermission('BOOK_DELETE', 1)
```
`PermissionGuard` 读取组合装饰器附加的 `x-permission` 元数据，查询 `UserPermission`，验证 `userLevel >= minLevel`。失败返回 403。

---
## 5. API 端点
| 功能 | 方法 & 路径 | 请求体 | 需要权限 | Min Level | 说明 |
|------|-------------|--------|----------|-----------|------|
| 授予权限 | POST `/permissions/grant` | `{ userId, permission, level }` | `USER_UPDATE` | 2 | level2 只能授予 level1；level3 可授予/升级到 3 |
| 撤销权限 | POST `/permissions/revoke` | `{ userId, permission }` | `USER_UPDATE` | 2 | level2 仅可撤销自己授予的；level3 无限制 |
| 查看用户权限 | GET `/permissions/user/:id` | - | `USER_READ` | 1 | 返回 `{ permission, level }[]` |

### 5.1 请求/响应示例
授予：
```http
POST /permissions/grant
Authorization: Bearer <token>
Content-Type: application/json

{
  "userId": 12,
  "permission": "BOOK_UPDATE",
  "level": 1
}
```
响应：
```json
{ "userId": 12, "permission": "BOOK_UPDATE", "level": 1 }
```
撤销：
```http
POST /permissions/revoke
{
  "userId": 12,
  "permission": "BOOK_UPDATE"
}
```
响应：
```json
{ "revoked": true }
```

---
## 6. 业务端点权限矩阵
| 领域 | 路径 (示例) | 方法 | 权限 | Min Level | 公开? |
|------|-------------|------|------|-----------|-------|
| 用户 | /users (list) | GET | USER_READ | 1 | 否 |
| 用户 | /users/:id | GET | USER_READ | 1 | 否 |
| 用户 | /users/:id | PATCH | USER_UPDATE | 1 | 否 |
| 用户 | /users/:id | DELETE | USER_DELETE | 1 | 否 |
| 用户 | /users (create) | POST | USER_CREATE | 1 | 否 |
| 图书 | /books | POST | BOOK_CREATE | 1 | 否 |
| 图书 | /books/:id | PATCH | BOOK_UPDATE | 1 | 否 |
| 图书 | /books/:id | DELETE | BOOK_DELETE | 1 | 否 |
| 图书 | /books/* (读取/搜索/推荐) | GET | BOOK_READ (当前放宽) | 0 | 是 |
| 图书 | /books/my | GET | (需要登录) | 0 | 否 |
| 推荐 | /recommendations/sections* (CRUD) | POST/PATCH/DELETE | RECOMMENDATION_MANAGE | 1 | 否 |
| 推荐 | /recommendations/public | GET | (公开) | 0 | 是 |
| 权限 | /permissions/grant | POST | USER_UPDATE | 2 | 否 |
| 权限 | /permissions/revoke | POST | USER_UPDATE | 2 | 否 |
| 权限 | /permissions/user/:id | GET | USER_READ | 1 | 否 |
| 文件 | /files/policy/public | POST | SYS_MANAGE | 3 | 否 |
| 文件 | /files/policy/private | POST | SYS_MANAGE | 3 | 否 |
| 文件 | /files/upload-url | GET | (需要登录) | 0 | 否 |
| 文件 | /files/download-url | GET | (需要登录) | 0 | 否 |
| 文件 | /files/upload | POST | (需要登录) | 0 | 否 |
| 文件 | /files/object | DELETE | FILE_MANAGE（非本人/未知） | 1 | 否 |
| 评论 | /books/:id/comments | POST | (需要登录) | 0 | 否 |
| 评论 | /books/:id/comments/:commentId | DELETE | COMMENT_MANAGE（非本人） | 1 | 否 |

> 评论删除规则：评论作者本人可直接删除；非作者需要 `COMMENT_MANAGE (>=1)`；否则返回 403。

> 说明：删除对象时，若记录的所有者为当前用户本人，则无需 FILE_MANAGE 也可删除；若所有者不是本人，或对象未记录所有者，则需要 `FILE_MANAGE (>=1)` 才能删除，否则返回 403。

> 读取类接口目前允许匿名 / 基础访问；如需收紧，给读取接口添加 `@ApiPermission('BOOK_READ',1)` 并在用户初始赋权时授予。

### 6.1 文件策略端点安全建议
- 强烈建议仅授予极少数管理员 `SYS_MANAGE` level 3。
- 操作前后做好审计记录（时间、操作者、IP）。
- 更推荐使用预签名 URL 分享临时访问，避免长期公开桶。

---
## 7. 升级 / 设计建议
- 添加审计表：记录授予/撤销历史 (操作人、旧 level、新 level、时间)。
- 缓存策略：将用户权限集合缓存至 Redis 或 JWT 声明内（需同步撤销策略）。
- 批量授权接口：一次授予多个权限减少往返。
- “权限包” (Permission Set)：预设组合快速赋权。
- 降级保护：禁止普通管理员把剩余唯一 level3 管理员降级，避免失控。

---
## 8. 常见错误
| 错误消息 | 场景 | 解决 |
|----------|------|------|
| No grant ability | 当前用户在该权限 level < 2 | 提升授权者权限 |
| Level 2 can only grant level 1 | 试图用 level2 授予 level2/3 | 使用 level3 或降低目标 level |
| Cannot upgrade equal/higher assignment | 试图升级与自己同级或更高的记录 | 需更高授权者执行 |
| Level 2 can only revoke assignments granted by themselves | level2 试图撤销非自己授予的记录 | 让原授予者撤销或使用 level3 |
| Target user not found | userId 不存在 | 检查 userId |

---
## 9. 快速排错
1. Swagger 是否显示 `Requires permission:` 描述 => 若无，检查装饰器是否使用 `@ApiPermission`。
2. 接口返回 403 => 查看该用户的 `/permissions/user/:id` 列表确认 level。
3. 授权升级失败 => 检查当前用户对该 permission 的 level 是否 > 目标原 level。

---
## 10. 术语速查
| 词汇 | 英文 | 说明 |
|------|------|------|
| 授予 | grant | 给用户一项权限及其等级 |
| 撤销 | revoke | 删除某条 UserPermission 记录 |
| 等级 | level | 决定能否访问或管理权限的层级 |
| 授予者 | grantedBy | 记录创建或升级该授权的用户 |

---
如需进一步扩展或接入前端 UI，可基于此文档构建权限配置面板。欢迎继续提出改进需求。

---

## 11. HTTP 状态码约定（401 vs 403）

为了让客户端能明确区分“未登录/凭证无效”与“已登录但权限不足”，本项目对受保护端点统一采用如下约定：

- 401 Unauthorized：请求未通过认证（未携带 JWT、JWT 无效或过期、无法解析用户等）。
- 403 Forbidden：请求已认证，但不满足权限要求（缺少某项权限或 level 不足）。

实现要点：

- `JwtAuthGuard`：在 `handleRequest` 中对未通过认证的情况直接抛出 401。
- `PermissionGuard`：当 `request.user` 不存在时抛出 401；当存在但 `userLevel < minLevel` 时抛出 403。

Swagger 文档标准化错误响应示例：

```
401: { "statusCode": 401, "message": "Unauthorized", "error": "Unauthorized" }
403: { "statusCode": 403, "message": "Forbidden",   "error": "Forbidden" }
```

这些示例已在受保护的控制器端点（如 Users、Permissions、Files、Books、Recommendations、User-Config 的受保护接口）中通过 `@ApiResponse` 注解统一呈现，便于前端消费。
