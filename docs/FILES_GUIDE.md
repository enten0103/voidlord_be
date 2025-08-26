# 文件管理 (Files) 指南

本指南详细介绍了 `files` 模块的功能，该模块负责与兼容 S3 的对象存储服务（如 MinIO）进行交互。

## 功能概述

- **S3/MinIO 集成**: 封装了 AWS S3 SDK v3，用于连接和操作对象存储。
- **文件上传**:
  - **预签名 URL**: 生成一个临时的 URL，允许前端直接将文件上传到存储桶，减轻服务器压力。
  - **后端代理上传**: 通过后端接收文件并将其转发到存储桶。
- **文件下载**: 为私有对象生成临时的预签名下载 URL。
- **对象删除**: 提供删除存储桶中对象的接口。
- **存储桶策略管理**: 提供（受保护的）API 来动态更改存储桶的访问策略（公开/私有）。

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
- **描述**: 从存储桶中删除一个对象。
- **查询参数**:
  - `key` (string, required): 要删除的对象的键。
- **成功响应 (200)**:
  ```json
  {
    "ok": true
  }
  ```

### 5. 设置存储桶策略为公开

- **Endpoint**: `POST /files/policy/public`
- **描述**: 将默认存储桶的策略设置为“公共可读”，允许任何人通过直接链接读取桶内所有对象。
- **权限要求**:
  - 需要有效的 JWT 认证。
  - 需要 `SYS_MANAGE` 权限，且级别 `>= 3`。
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
