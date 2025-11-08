# 认证与登录 (Auth) 指南

集中说明用户注册、登录、JWT 保护端点与典型错误响应。适用于前端在接入身份体系时快速查阅。

## 目录
1. 概述
2. 数据模型与响应 DTO
3. 端点速览
4. 请求与响应示例
5. 错误码与场景
6. 安全与最佳实践
7. 测试覆盖
8. 扩展方向

---
## 1. 概述
- 注册: 创建新用户并立即返回登录态 (access_token + user 信息)
- 登录: 使用用户名或邮箱 + 密码，返回 JWT
- Profile: 使用 JWT 获取当前用户基础信息
- Protected 示例: 展示在受保护路由中获取用户上下文的方法

所有受保护端点使用 Header `Authorization: Bearer <access_token>`。

---
## 2. 数据模型与响应 DTO
| 名称 | 字段 | 类型 | 说明 |
|------|------|------|------|
| LoginResponseDto | access_token | string | JWT Access Token |
|  | user.id | number | 用户 ID |
|  | user.username | string | 用户名 |
|  | user.email | string | 邮箱 |

> Token 有效期与刷新机制目前仅包含 Access Token；若需要 Refresh Token 可在后续扩展。

---
## 3. 端点速览
| 方法 | 路径 | 描述 | 请求体 | 返回 |
|------|------|------|--------|-----|
| POST | /auth/register | 注册新用户并自动登录 | { username,email,password } | LoginResponseDto |
| POST | /auth/login | 用户登录 | { username,password } | LoginResponseDto |
| GET | /auth/profile | 获取当前用户资料 | - | { id, username } |
| GET | /auth/protected | 受保护示例路由 | - | { message, user{ id, username } } |

---
## 4. 请求与响应示例
### 注册
```http
POST /auth/register
Content-Type: application/json

{ "username": "alice", "email": "alice@example.com", "password": "Password123" }
```
响应:
```json
{
  "access_token": "<jwt>",
  "user": { "id": 1, "username": "alice", "email": "alice@example.com" }
}
```

### 登录
```http
POST /auth/login
Content-Type: application/json

{ "username": "alice", "password": "Password123" }
```
响应同注册。

### Profile
```http
GET /auth/profile
Authorization: Bearer <jwt>
```
响应:
```json
{ "id": 1, "username": "alice" }
```

### Protected 示例
```http
GET /auth/protected
Authorization: Bearer <jwt>
```
响应:
```json
{ "message": "This is a protected route", "user": { "id": 1, "username": "alice" } }
```

---
## 5. 错误码与场景
| 状态码 | 场景 | 示例 |
|--------|------|------|
| 400 | 注册字段缺失或格式不合法 | { "statusCode":400, "message":"Validation failed" } |
| 401 | 登录凭证错误 / 未提供或无效 Token | { "statusCode":401, "message":"Unauthorized" } |
| 409 | 用户名或邮箱已存在 | { "statusCode":409, "message":"Username or email already exists" } |

> 未登录访问需要认证的端点统一返回 401。

---
## 6. 安全与最佳实践
- 使用 HTTPS 传输，避免中间人攻击。
- 前端存储 Token 建议使用内存或安全容器，避免持久化在不安全位置。
- 登录失败不区分用户名/邮箱是否存在，防枚举。
- 密码最小长度与复杂度可在 DTO 验证中增强。
- 后续可加入刷新 Token、登出与强制失效 (revocation list)。

---
## 7. 测试覆盖
- 单元: `auth.service.spec.ts` 验证登录逻辑、密码校验。
- E2E: `auth.e2e-spec.ts` 注册 + 登录 + profile 访问 + 保护路由未授权场景。

---
## 8. 扩展方向
- Refresh Token & Token 轮换
- 第三方 OAuth 登录 (GitHub / Google)
- 邮箱验证与找回密码流程
- 登录尝试速率限制与 IP 监控
- 设备指纹与多因子认证 (MFA)

---
参考: 用户实体与 DTO 请查看 `src/modules/users/` 目录；权限体系详见 `PERMISSIONS_GUIDE.md`。
