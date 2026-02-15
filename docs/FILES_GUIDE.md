# Files（用法示例）

## 必要环境变量（MinIO/S3）

```env
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=voidlord
MINIO_REGION=us-east-1
MINIO_FORCE_PATH_STYLE=true

# 可选：对外公共访问端点
MINIO_PUBLIC_ENDPOINT=http://localhost:9000
```

## 生成预签名上传 URL（PUT）

```bash
curl "http://localhost:3000/files/upload-url?key=avatars/42.png&contentType=image%2Fpng" \
  -H 'Authorization: Bearer <jwt>'
```

## 使用预签名 URL 上传（示例：把本地文件 PUT 到 url）

```bash
curl -X PUT "<presigned_url>" \
  -H 'Content-Type: image/png' \
  --data-binary "@./avatar.png"
```

## 后端代理上传（multipart/form-data）

```bash
curl -X POST http://localhost:3000/files/upload \
  -H 'Authorization: Bearer <jwt>' \
  -F "file=@./any.bin" \
  -F "key=uploads/demo.bin"
```

## 生成预签名下载 URL

```bash
curl "http://localhost:3000/files/download-url?key=uploads/demo.bin&expiresIn=600" \
  -H 'Authorization: Bearer <jwt>'
```

## 删除对象

```bash
curl -X DELETE "http://localhost:3000/files/object?key=uploads/demo.bin" \
  -H 'Authorization: Bearer <jwt>'
```

## 设置桶策略（公开 / 私有）

```bash
curl -X POST http://localhost:3000/files/policy/public \
  -H 'Authorization: Bearer <jwt>'

curl -X POST http://localhost:3000/files/policy/private \
  -H 'Authorization: Bearer <jwt>'
```
