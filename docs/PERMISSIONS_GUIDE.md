# Permissions（用法示例）

## 查看我的权限
```bash
curl http://localhost:3000/permissions/user/me \
  -H 'Authorization: Bearer <jwt>'
```

## 查看指定用户权限
```bash
curl http://localhost:3000/permissions/user/12 \
  -H 'Authorization: Bearer <jwt>'
```

## 授予权限
```bash
curl -X POST http://localhost:3000/permissions/grant \
  -H 'Authorization: Bearer <jwt>' \
  -H 'Content-Type: application/json' \
  -d '{"userId":12,"permission":"BOOK_UPDATE","level":1}'
```

## 撤销权限
```bash
curl -X POST http://localhost:3000/permissions/revoke \
  -H 'Authorization: Bearer <jwt>' \
  -H 'Content-Type: application/json' \
  -d '{"userId":12,"permission":"BOOK_UPDATE"}'
```
