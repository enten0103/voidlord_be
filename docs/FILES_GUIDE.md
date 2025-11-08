# 文件管理 (Files) 指南

本指南详细介绍了 `files` 模块的功能，该模块负责与兼容 S3 的对象存储服务（如 MinIO）进行交互。

## 端点速览

| 方法 | 路径 | 描述 | 认证 | 权限 |
|------|------|------|------|------|
| GET | /files/upload-url | 生成预签名上传 URL（PUT） | JWT | - |
| POST | /files/upload | 后端代理上传（multipart） | JWT | - |
| GET | /files/download-url | 生成预签名下载 URL | JWT | - |
| DELETE | /files/object | 删除对象（本人或 FILE_MANAGE） | JWT | FILE_MANAGE(>=1) when not owner |
| POST | /files/policy/public | 将桶设置为 public-read | JWT | SYS_MANAGE(>=3) |
| POST | /files/policy/private | 将桶恢复为 private | JWT | SYS_MANAGE(>=3) |

## 功能概述

- **S3/MinIO 集成**: 封装了 AWS S3 SDK v3，用于连接和操作对象存储。
- **文件上传**:
  - **预签名 URL**: 生成一个临时的 URL，允许前端直接将文件上传到存储桶，减轻服务器压力。
  - **后端代理上传**: 通过后端接收文件并将其转发到存储桶。
- **文件下载**: 为私有对象生成临时的预签名下载 URL。
- **对象删除**: 提供删除存储桶中对象的接口。
- **存储桶策略管理**: 提供（受保护的）API 来动态更改存储桶的访问策略（公开/私有）。
  - 仅限拥有 `SYS_MANAGE (>=3)` 的管理员调用；建议启用审计日志。

## 认证与权限一览

- 所有文件相关端点均需要登录（携带有效 JWT）。
- 删除对象权限：
  - 若对象记录的所有者为当前用户本人，可直接删除；
  - 若所有者不是当前用户，或对象未记录所有者，则需要 `FILE_MANAGE (>=1)` 权限；
  - 若无上述条件，返回 403 Forbidden。
  - 标准错误示例：
    - 401 未登录：`{ "statusCode": 401, "message": "Unauthorized", "error": "Unauthorized" }`
    - 403 权限不足：`{ "statusCode": 403, "message": "Only owner or FILE_MANAGE can delete", "error": "Forbidden" }`

## 环境变量配置

请确保在您的 `.env` 文件中配置了以下变量：

```env
# MinIO/S3 连接信息
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=voidlord
MINIO_REGION=us-east-1
MINIO_FORCE_PATH_STYLE=true

# （可选）对外暴露的公共访问端点
# 如果设置了此项，getPublicUrl() 将优先使用它来构建 URL
MINIO_PUBLIC_ENDPOINT=http://localhost:9000
```

## API 端点详解

### 1. 生成预签名上传 URL

- **Endpoint**: `GET /files/upload-url`
- **描述**: 为前端生成一个用于 `PUT` 请求的预签名 URL，以便直接上传文件。
- **查询参数**:
  - `key` (string, required): 您希望在存储桶中保存的对象键（例如 `avatars/user-123.jpg`）。
  - `contentType` (string, optional): 文件的 MIME 类型（例如 `image/png`）。
- **成功响应 (200)**:
  ```json
  {
    "url": "http://localhost:9000/voidlord/avatars/user-123.jpg?X-Amz-Algorithm=...",
    "key": "avatars/user-123.jpg"
  }
  ```

### 2. 后端代理上传文件

- **Endpoint**: `POST /files/upload`
- **描述**: 通过 `multipart/form-data` 格式接收文件，并由后端存入对象存储。
- **请求体**:
  - `file` (binary, required): 要上传的文件。
  - `key` (string, optional): 自定义对象键。如果未提供，将根据日期和随机 UUID 自动生成。
  - `contentType` (string, optional): 文件的 MIME 类型。
- **成功响应 (201)**:
  ```json
  {
    "ok": true,
    "key": "2025-08-26/uuid-some-file.txt",
    "size": 12345,
    "mime": "text/plain",
    "url": "http://localhost:9000/voidlord/2025-08-26/uuid-some-file.txt"
  }
  ```

### 3. 生成预签名下载 URL

- **Endpoint**: `GET /files/download-url`
- **描述**: 为私有对象生成一个临时的、有时间限制的下载链接。
- **查询参数**:
  - `key` (string, required): 要下载的对象的键。
  - `expiresIn` (number, optional): 链接的有效时间（秒），默认为 600。
- **成功响应 (200)**:
  ```json
  {
    "url": "http://localhost:9000/voidlord/private/document.pdf?X-Amz-Algorithm=...",
    "key": "private/document.pdf"
  }
  ```

### 4. 删除对象

- **Endpoint**: `DELETE /files/object`
- **描述**: 从存储桶中删除一个对象。需要本人所有权或 `FILE_MANAGE` 权限。当对象未记录所有者时，只有拥有 `FILE_MANAGE` 的用户可以删除。
- **查询参数**:
  - `key` (string, required): 要删除的对象的键。
- **成功响应 (200)**:
  ```json
  {
    "ok": true
  }
  ```
- **错误响应**：
  - 401 未认证：
    ```json
    { "statusCode": 401, "message": "Unauthorized", "error": "Unauthorized" }
    ```
  - 403 非本人且无 FILE_MANAGE：
    ```json
    { "statusCode": 403, "message": "Only owner or FILE_MANAGE can delete", "error": "Forbidden" }
    ```

### 5. 设置存储桶策略为公开

- **Endpoint**: `POST /files/policy/public`
- **描述**: 将默认存储桶的策略设置为“公共可读”，允许任何人通过直接链接读取桶内所有对象。
- **权限要求**:
  - 需要有效的 JWT 认证。
  - 需要 `SYS_MANAGE` 权限，且级别 `>= 3`。
  - 建议仅在短期需要时启用，并尽快恢复为私有。
- **成功响应 (200)**:
  ```json
  {
    "ok": true,
    "message": "Bucket policy updated to public-read."
  }
  ```

### 6. 设置存储桶策略为私有

- **Endpoint**: `POST /files/policy/private`
- **描述**: 移除存储桶的所有策略，使其恢复到默认的私有状态。
- **权限要求**:
  - 需要有效的 JWT 认证。
  - 需要 `SYS_MANAGE` 权限，且级别 `>= 3`。
- **成功响应 (200)**:
  ```json
  {
    "ok": true,
    "message": "Bucket policy removed (private)."
  }
  ```

## 典型用例：用户头像上传

1.  **前端**: 用户选择头像图片。
2.  **前端**: 调用 `GET /files/upload-url`，传入一个唯一的 `key`（例如 `avatars/user-id-timestamp.jpg`）。
3.  **后端**: 返回预签名的 `url` 和 `key`。
4.  **前端**: 使用 `PUT` 方法，将图片文件直接上传到返回的 `url`。
5.  **前端**: 上传成功后，调用 `PATCH /user-config/me`，将返回的 `key` 保存到用户的 `avatar_key` 字段中。
6.  **后端**: `UserConfigService` 在更新时，会使用 `FilesService.getPublicUrl(key)` 方法生成并保存完整的 `avatar_url`。

## 安全最佳实践

- 优先使用“预签名 URL”进行临时访问；避免长期公开桶。
- 若必须公开：
  - 限定只读策略（仅 `s3:GetObject`）。
  - 记录操作者与发生时间；设置提醒尽快恢复私有。
  - 针对敏感前缀（如 `private/`）使用独立桶或不暴露策略。

## 相关文档

- 权限模型与 401/403 语义详见：`docs/PERMISSIONS_GUIDE.md`
- 顶层概览与端点列表参见：`README.md`

---
## 错误码汇总
| 状态码 | 场景 | 示例 |
|--------|------|------|
| 401 | 未登录调用任意端点 | `{ "statusCode":401,"message":"Unauthorized","error":"Unauthorized" }` |
| 403 | 删除对象非本人且无 FILE_MANAGE | `{ "statusCode":403,"message":"Only owner or FILE_MANAGE can delete","error":"Forbidden" }` |
| 403 | 未具备 SYS_MANAGE(>=3) 操作桶策略 | `{ "statusCode":403,"message":"Forbidden","error":"Forbidden" }` |
| 400 | 参数缺失或无效（如缺 key） | `{ "statusCode":400,"message":"Bad Request","error":"Bad Request" }` |
| 404 | 对象不存在（可选实现） | `{ "statusCode":404,"message":"Not Found","error":"Not Found" }` |

---
## 快速排错
- 预签名 URL 403：检查桶策略是否为私有、对象前缀是否受限、URL 是否过期；
- 上传失败：确认请求方法 PUT、Content-Type 与签名参数匹配；
- 下载失败：`expiresIn` 是否过小、系统时钟偏差；
- 删除失败：确认对象 owner 与当前用户是否一致，或当前用户是否具备 FILE_MANAGE；
- 桶策略：尽量短时公开，完毕后立即恢复私有；必要时审计操作者与 IP。
