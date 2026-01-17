# User Config（用法示例）

## 获取公开资料
```bash
curl http://localhost:3000/user-config/42/public
```

## 获取我的配置（若无则自动创建）
```bash
curl http://localhost:3000/user-config/me \
	-H 'Authorization: Bearer <jwt>'
```

## 更新我的配置
```bash
curl -X PATCH http://localhost:3000/user-config/me \
	-H 'Authorization: Bearer <jwt>' \
	-H 'Content-Type: application/json' \
	-d '{"display_name":"Alice","bio":"Hello","theme":"dark"}'
```

## 头像上传（预签名 + 写入 avatar_key）
```bash
# 1) 获取预签名上传 URL
curl "http://localhost:3000/files/upload-url?key=avatars/42.png&contentType=image%2Fpng" \
	-H 'Authorization: Bearer <jwt>'

# 2) PUT 上传到 presigned url
curl -X PUT "<presigned_url>" \
	-H 'Content-Type: image/png' \
	--data-binary "@./avatar.png"

# 3) 保存 avatar_key
curl -X PATCH http://localhost:3000/user-config/me \
	-H 'Authorization: Bearer <jwt>' \
	-H 'Content-Type: application/json' \
	-d '{"avatar_key":"avatars/42.png"}'
```
