# VoidLord Backend（用法示例）

## 启动

```bash
pnpm install
pnpm run docker:up
pnpm run start:dev
```

Swagger：`http://localhost:3000/api`

## Auth

```bash
curl -X POST http://localhost:3000/auth/register -H 'Content-Type: application/json' \
  -d '{"username":"alice","email":"alice@example.com","password":"Password123"}'

curl -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"Password123"}'
```

## Books

```bash
curl -X POST http://localhost:3000/books \
  -H 'Authorization: Bearer <jwt>' \
  -H 'Content-Type: application/json' \
  -d '{"tags":[{"key":"author","value":"刘慈欣"},{"key":"genre","value":"科幻"}]}'

curl -X POST http://localhost:3000/books/search -H 'Content-Type: application/json' \
  -d '{"conditions":[{"target":"author","op":"eq","value":"刘慈欣"}]}'
```

上传封面：

```bash
curl -X PUT http://localhost:3000/books/12/cover \
  -H 'Authorization: Bearer <jwt>' \
  -F "file=@./cover.jpg"
```

## EPUB

```bash
curl -X POST http://localhost:3000/epub/book/12 \
  -H 'Authorization: Bearer <jwt>' \
  -F "file=@./book.epub"

curl http://localhost:3000/epub/book/12/META-INF/container.xml

curl -X DELETE http://localhost:3000/epub/book/12 \
  -H 'Authorization: Bearer <jwt>'
```

## Media Libraries

```bash
curl -X POST http://localhost:3000/media-libraries \
  -H 'Authorization: Bearer <jwt>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"收藏夹","is_public":false}'

curl http://localhost:3000/media-libraries/reading-record \
  -H 'Authorization: Bearer <jwt>'
```

## 更多示例

见 `docs/`：`docs/README.md`、`docs/BOOKS_README.md`、`docs/FILES_GUIDE.md` 等。
