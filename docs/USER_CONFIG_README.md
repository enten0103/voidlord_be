# 用户配置 (User-Config) 模块指南

提供用户个性化展示与偏好设置：头像、展示名、简介、界面主题、语言、时区、通知偏好等；并暴露公开资料访问接口。支持与 `files` 模块联动生成头像公共 URL。

## 目录
1. 概述与定位  
2. 数据模型  
3. 权限与认证  
4. API 端点速览  
5. 请求/响应示例  
6. 业务规则与字段策略  
7. 错误码  
8. 与 Files 模块联动流程  
9. 测试与质量  
10. 扩展建议  

---
## 1. 概述与定位
User-Config 用于补充用户基础账号信息之外的展示/偏好层：头像、展示名、简介、界面主题、语言、时区与通知设置。公开接口仅返回安全的公开资料（不含邮箱等敏感字段）。

---
## 2. 数据模型
`UserConfig` (一对一 User，用户删除级联移除)

| 字段 | 类型 | 说明 | 规则 |
|------|------|------|------|
| id | number | 主键 | 自增 |
| user | User | 关联用户 | 唯一，一对一 |
| avatar_key | string? | 对象存储内文件键 | 可空；用于生成 avatar_url |
| avatar_url | string? | 公开访问 URL | 若缺且有 avatar_key 则由服务动态生成 |
| display_name | string? | 展示名 | 可空，前端显示优先级高于用户名 |
| bio | text? | 简介/签名 | 可空 |
| locale | string | 语言偏好 | 默认 'en' |
| timezone | string | 时区 | 默认 'UTC' |
| theme | string | UI 主题 ('light'/'dark'/'system') | 默认 'light' |
| email_notifications | boolean | 邮件通知开关 | 默认 true |
| created_at | Date | 创建时间 | 自动 |
| updated_at | Date | 更新时间 | 自动 |

唯一性：每个 User 最多一条配置；通过 `getOrCreate` 访问保证存在。

---
## 3. 权限与认证
| 端点 | 认证 | 额外权限 | 说明 |
|------|------|----------|------|
| GET /user-config/:userId/public | 无需登录 | - | 返回公开展示资料 |
| GET /user-config/me | 登录 (JWT) | - | 若不存在自动创建默认配置 |
| PATCH /user-config/me | 登录 (JWT) | - | 更新自己的配置 |

无跨用户写入端点；公开资料不暴露邮箱、通知设置等敏感字段。

---
## 4. API 端点速览
| 方法 | 路径 | 描述 | 请求体 | 响应主体 |
|------|------|------|--------|---------|
| GET | /user-config/:userId/public | 获取指定用户公开资料 | - | `{ userId, avatar_url, display_name, bio }` |
| GET | /user-config/me | 获取我的配置（若无则创建） | - | 完整 `UserConfig` 对象 |
| PATCH | /user-config/me | 更新我的配置 | `UpdateUserConfigDto` | 更新后的完整对象 |

`UpdateUserConfigDto` 支持字段：`avatar_key`、`avatar_url`（可选直接传）、`display_name`、`bio`、`locale`、`timezone`、`theme`、`email_notifications`。

---
## 5. 请求/响应示例
### 获取公开资料
```http
GET /user-config/42/public
```
响应：
```json
{ "userId": 42, "avatar_url": "http://.../avatars/42.png", "display_name": "Alice", "bio": "Hello" }
```

### 获取我的配置
```http
GET /user-config/me
Authorization: Bearer <jwt>
```
可能首次：自动创建并返回默认字段。

### 更新我的配置（上传头像后）
```http
PATCH /user-config/me
Authorization: Bearer <jwt>
Content-Type: application/json

{ "avatar_key": "avatars/42.png", "display_name": "Alice", "theme": "dark" }
```
若未传 `avatar_url` 且提供 `avatar_key`，服务端会调用 FilesService 生成公开 URL 再保存。

---
## 6. 业务规则与字段策略
- 幂等创建：`GET /user-config/me` 若不存在则新建默认配置（语言/时区/主题/通知默认值）。
- URL 生成策略：`avatar_url` 缺失但存在 `avatar_key` 时服务自动填充；若同时提供两者以请求值为准（假设前端自行缓存 CDN URL）。
- 主题枚举：当前支持 `light` / `dark` / `system`，非法值应在 DTO 校验阶段被拒绝（后续可扩展）。
- 删除用户后：配置记录级联删除，避免孤儿数据。
- 安全输出：公开接口永不返回 email 与通知字段。

---
## 7. 错误码
| 状态码 | 场景 | 示例 |
|--------|------|------|
| 401 | 未携带或无效 JWT 调用 /me 或更新接口 | `{ "statusCode":401,"message":"Unauthorized","error":"Unauthorized" }` |
| 404 | 调用 /user-config/:userId/public 时用户存在但尚未创建配置 => 返回降级对象 (无错误) | (使用空值占位，不直接抛错) |
| 404 | 更新时用户已被删除 | `{ "statusCode":404,"message":"User not found","error":"Not Found" }` |

> 公开资料查询若配置不存在返回降级结构 `{ userId, avatar_url:null, display_name:null, bio:null }`，不视为错误码场景。

---
## 8. 与 Files 模块联动流程
头像上传推荐使用预签名路径：
1. `GET /files/upload-url?key=avatars/<userId>.png` 获取临时上传链接。
2. 前端 `PUT` 文件到返回的 `url`。
3. 成功后调用 `PATCH /user-config/me` 传入 `avatar_key`。
4. 服务端补写 `avatar_url`（若用户未自传）。
5. 后续通过公开资料接口获取显示地址。

好处：
- 降低后端处理大文件压力；
- 统一对象命名规范；
- 可后续接入 CDN 层仅修改 `getPublicUrl` 实现。

---
## 9. 测试与质量
建议测试覆盖：
- 获取/自动创建配置 (`getOrCreateByUserId`)。
- avatar_key 仅提供时 URL 自动生成分支。
- 更新无 avatar_key 不应覆盖已有 URL。
- 公开资料降级结构（无配置时）。
- 用户删除后访问 /me 重新创建流程。

---
## 10. 扩展建议
- 隐私控制：允许用户选择哪些字段公开 (`display_name`、`avatar_url`、`bio`)。
- 缓存策略：公开资料结果可短期缓存 (Redis + TTL)。
- 审计：配置变更记录表（字段差异 + 时间 + 操作来源）。
- 多头像版本：支持裁剪 / 多分辨率存储策略。
- 深色模式 A/B：后端记录最近切换时间用于行为分析。

---
如需更多交互能力（社交公开动态、批量更新、通知策略细化），请在主仓库提 Issue 或提交 PR。  
参考：`README.md` 总览、第 6 节功能矩阵、`FILES_GUIDE.md` 上传策略。
