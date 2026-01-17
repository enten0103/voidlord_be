# Auth（用法示例）

所有需要登录的接口都通过 Header 携带：`Authorization: Bearer <jwt>`。

## 注册
```bash
curl -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","email":"alice@example.com","password":"Password123"}'
```

## 登录
```bash
curl -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"Password123"}'
```

## 获取当前用户资料
```bash
curl http://localhost:3000/auth/profile \
  -H 'Authorization: Bearer <jwt>'
```

## 受保护路由示例
```bash
curl http://localhost:3000/auth/protected \
  -H 'Authorization: Bearer <jwt>'
```
