import { TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request, { Response } from 'supertest';
import { Server } from 'http';
// removed duplicate import of guards
import { isPagedResult } from '../../../../test/response-guards';
import { Repository, DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createTestModule } from '../../../../test/test-module.factory';
import { Book } from '../../../entities/book.entity';
import { Tag } from '../../../entities/tag.entity';
import { User } from '../../../entities/user.entity';
import { FileObject } from '../../../entities/file-object.entity';
import { grantPermissions } from '../../permissions/test/permissions.seed';
import { join } from 'path';
import { S3_CLIENT } from '../../files/tokens';

describe('Books (e2e)', () => {
  let app: INestApplication;
  let bookRepository: Repository<Book>;
  let tagRepository: Repository<Tag>;
  let userRepository: Repository<User>;
  let fileObjectRepository: Repository<FileObject>;
  let authToken: string;
  let userId: number;
  let httpServer: Server;
  let s3: any;

  interface CreatedBookLite {
    id: number;
    tags?: Array<{ key: string; value: string }>;
  }

  function parseBody<T>(data: unknown, guard: (o: unknown) => o is T): T {
    if (guard(data)) return data;
    throw new Error('Unexpected body shape');
  }

  const isBookLite = (o: unknown): o is CreatedBookLite => {
    if (typeof o !== 'object' || o === null) return false;
    const r = o as Record<string, unknown>;
    return typeof r.id === 'number';
  };

  const isBookLiteArray = (o: unknown): o is CreatedBookLite[] => {
    return Array.isArray(o) && o.every(isBookLite);
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await createTestModule();
    app = moduleFixture.createNestApplication();
    // 不绕过权限，真实测试 + 预置最小权限数据
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
    httpServer = app.getHttpServer() as unknown as Server;

    bookRepository = moduleFixture.get<Repository<Book>>(
      getRepositoryToken(Book),
    );
    tagRepository = moduleFixture.get<Repository<Tag>>(getRepositoryToken(Tag));
    userRepository = moduleFixture.get<Repository<User>>(
      getRepositoryToken(User),
    );
    fileObjectRepository = moduleFixture.get<Repository<FileObject>>(
      getRepositoryToken(FileObject),
    );
    s3 = moduleFixture.get(S3_CLIENT) as any;

    // 创建测试用户并获取认证token
    const testUser = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'testpassword123',
    };

    const reg: Response = await request(httpServer)
      .post('/auth/register')
      .send(testUser)
      .expect(201);
    userId = parseBody(reg.body, (d): d is { user: { id: number } } => {
      if (typeof d !== 'object' || d === null) return false;
      const r = d as Record<string, unknown>;
      const u = r.user as Record<string, unknown> | undefined;
      return typeof u === 'object' && u !== null && typeof u.id === 'number';
    }).user.id;

    const loginResponse: Response = await request(httpServer)
      .post('/auth/login')
      .send({
        username: testUser.username,
        password: testUser.password,
      })
      .expect(200);
    authToken = parseBody(
      loginResponse.body,
      (d): d is { access_token: string } => {
        if (typeof d !== 'object' || d === null) return false;
        const r = d as Record<string, unknown>;
        return typeof r.access_token === 'string';
      },
    ).access_token;
    // 授予该测试用户书籍相关权限 (level1)
    const ds = moduleFixture.get(DataSource);
    await grantPermissions(ds, userId, {
      BOOK_CREATE: 1,
      BOOK_UPDATE: 1,
      BOOK_DELETE: 1,
    });
  });

  // (seed helper moved to shared permissions.seed.ts)

  afterAll(async () => {
    try {
      // 清理测试数据
      await bookRepository.query('DELETE FROM book_tags');
      await bookRepository.query('DELETE FROM book');
      await tagRepository.query('DELETE FROM tag');
      await fileObjectRepository.query('DELETE FROM file_object');
      await userRepository.query('DELETE FROM "user"');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log('Error cleaning up test data:', msg);
    }
    try {
      const ds = app.get(DataSource);
      if (ds?.isInitialized) {
        await ds.destroy();
      }
    } catch {
      /* ignore */
    }
    await app.close();
  });

  beforeEach(async () => {
    try {
      // 清理测试数据
      await bookRepository.query('DELETE FROM book_tags');
      await bookRepository.query('DELETE FROM book');
      await tagRepository.query('DELETE FROM tag');
      await fileObjectRepository.query('DELETE FROM file_object');
    } catch (error) {
      // 忽略清理错误，因为表可能不存在
      const msg = error instanceof Error ? error.message : String(error);
      console.log('Error cleaning up before test:', msg);
    }
  });

  describe('/books/:id/cover (PUT)', () => {
    it('should upload cover and bind it as tags, without leaving old records', async () => {
      // create book
      const created: Response = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ tags: [{ key: 'author', value: 'CoverUser' }] })
        .expect(201);

      const bookId = parseBody(created.body, isBookLite).id;

      // upload png cover
      await request(httpServer)
        .put(`/books/${bookId}/cover`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from('png-bytes'), {
          filename: 'cover.png',
          contentType: 'image/png',
        })
        .expect(200);

      const after1 = await bookRepository.findOne({
        where: { id: bookId },
        relations: ['tags'],
      });
      expect(after1).toBeTruthy();
      const cover1 = after1!.tags.find((t) => t.key === 'cover')?.value;
      const mime1 = after1!.tags.find((t) => t.key === 'cover_mime')?.value;
      expect(cover1).toBe(`books/${bookId}/cover.png`);
      expect(mime1).toBe('image/png');

      // file record exists
      const fo1 = await fileObjectRepository.findOne({
        where: { key: `books/${bookId}/cover.png` },
        relations: ['owner'],
      });
      expect(fo1?.owner?.id).toBe(userId);

      // replace with jpeg cover (should remove old record)
      await request(httpServer)
        .put(`/books/${bookId}/cover`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from('jpg-bytes'), {
          filename: 'cover.jpg',
          contentType: 'image/jpeg',
        })
        .expect(200);

      const after2 = await bookRepository.findOne({
        where: { id: bookId },
        relations: ['tags'],
      });
      const cover2 = after2!.tags.find((t) => t.key === 'cover')?.value;
      const mime2 = after2!.tags.find((t) => t.key === 'cover_mime')?.value;
      expect(cover2).toBe(`books/${bookId}/cover.jpg`);
      expect(mime2).toBe('image/jpeg');

      const foOld = await fileObjectRepository.findOne({
        where: { key: `books/${bookId}/cover.png` },
      });
      expect(foOld).toBeNull();
      const foNew = await fileObjectRepository.findOne({
        where: { key: `books/${bookId}/cover.jpg` },
      });
      expect(foNew).toBeTruthy();
    });
  });

  describe('/books (POST)', () => {
    it('should create a new book with tags', () => {
      const createBookDto = {
        tags: [
          { key: 'author', value: 'John Doe' },
          { key: 'genre', value: 'Fiction' },
        ],
      };

      return request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createBookDto)
        .expect(201)
        .expect((res) => {
          const body = parseBody(res.body, isBookLite);
          expect(body.tags).toHaveLength(2);
        });
    });

    it('should create a book without tags', () => {
      return request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(201)
        .expect((res) => {
          const body = parseBody(res.body, isBookLite);
          expect(Array.isArray(body.tags) ? body.tags.length : 0).toBe(0);
        });
    });

    // hash 唯一性校验已移除

    it('should return 401 without authentication', () => {
      return request(httpServer).post('/books').send({}).expect(401);
    });
  });

  describe('/books (GET)', () => {
    beforeEach(async () => {
      // 创建测试数据
      const book1 = await bookRepository.save(
        bookRepository.create({ tags: [] }),
      );
      const book2 = await bookRepository.save(
        bookRepository.create({ tags: [] }),
      );

      const tag1: Tag = await tagRepository.save({
        key: 'author',
        value: 'Author One',
        shown: true,
      });

      const tag2: Tag = await tagRepository.save({
        key: 'genre',
        value: 'Fiction',
        shown: true,
      });

      book1.tags = [tag1];
      book2.tags = [tag1, tag2];

      await bookRepository.save(book1);
      await bookRepository.save(book2);
    });

    it('should return all books', async () => {
      const res: Response = await request(httpServer).get('/books').expect(200);
      const body = parseBody(res.body, isBookLiteArray);
      expect(body).toHaveLength(2);
      // ensure id exists
      expect(typeof body[0].id).toBe('number');
      expect(body[0].tags).toBeDefined();
    });
  });

  describe('/books/my (GET)', () => {
    let otherUserToken: string;
    let myIds: number[] = [];
    let otherIds: number[] = [];

    beforeEach(async () => {
      // 注册另一个用户
      const suffix = Date.now().toString();
      const other = await request(httpServer)
        .post('/auth/register')
        .send({
          username: `other_${suffix}`,
          email: `other_${suffix}@example.com`,
          password: 'p@ssw0rd!',
        })
        .expect(201);
      const otherLogin = await request(httpServer)
        .post('/auth/login')
        .send({ username: `other_${suffix}`, password: 'p@ssw0rd!' })
        .expect(200);
      otherUserToken = parseBody(
        otherLogin.body,
        (d): d is { access_token: string } => {
          if (typeof d !== 'object' || d === null) return false;
          const r = d as Record<string, unknown>;
          return typeof r.access_token === 'string';
        },
      ).access_token;

      // 给其他用户授予创建权限
      const ds = app.get(DataSource);
      const otherUser = parseBody(
        other.body,
        (d): d is { user: { id: number } } => {
          if (typeof d !== 'object' || d === null) return false;
          const r = d as Record<string, unknown>;
          const u = r.user as Record<string, unknown> | undefined;
          return (
            typeof u === 'object' && u !== null && typeof u.id === 'number'
          );
        },
      ).user;
      await grantPermissions(ds, otherUser.id, { BOOK_CREATE: 1 });

      // 当前用户创建两本书
      const b1 = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(201);
      const b2 = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(201);
      myIds = [
        parseBody(b1.body, isBookLite).id,
        parseBody(b2.body, isBookLite).id,
      ];

      // 其他用户创建两本书
      const o1 = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({})
        .expect(201);
      const o2 = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({})
        .expect(201);
      otherIds = [
        parseBody(o1.body, isBookLite).id,
        parseBody(o2.body, isBookLite).id,
      ];
    });

    it('should require auth', async () => {
      await request(httpServer).get('/books/my').expect(401);
    });

    it("should return only current user's books", async () => {
      const res = await request(httpServer)
        .get('/books/my')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const myBooks = parseBody(res.body, isBookLiteArray);
      const ids = myBooks.map((b) => b.id);
      expect(ids).toEqual(expect.arrayContaining(myIds));
      otherIds.forEach((oid) => expect(ids).not.toContain(oid));
    });
  });

  describe('/books/:id (GET)', () => {
    let bookId: number;

    beforeEach(async () => {
      const book = await bookRepository.save(
        bookRepository.create({ tags: [] }),
      );
      bookId = book.id;
    });

    it('should return a book by ID', async () => {
      const res: Response = await request(httpServer)
        .get(`/books/${bookId}`)
        .expect(200);
      const body = parseBody(res.body, isBookLite);
      expect(body.id).toBe(bookId);
    });

    it('should return 404 for non-existent book', () => {
      return request(httpServer).get('/books/999999').expect(404);
    });
  });

  // hash route removed

  describe('/books/:id (PATCH)', () => {
    let bookId: number;

    beforeEach(async () => {
      const book = await bookRepository.save(
        bookRepository.create({ tags: [] }),
      );
      bookId = book.id;
    });

    it('should update book tags', async () => {
      const updateDto = {
        tags: [
          { key: 'author', value: 'New Author' },
          { key: 'year', value: '2024' },
        ],
      };

      const res = await request(httpServer)
        .patch(`/books/${bookId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(200);
      const body = parseBody(res.body, isBookLite);
      expect(body.tags).toHaveLength(2);
      expect(
        body.tags?.some(
          (tag) => tag.key === 'author' && tag.value === 'New Author',
        ),
      ).toBe(true);
    });

    // title/description 更新已不再支持

    it('should return 401 without authentication', () => {
      return request(httpServer)
        .patch(`/books/${bookId}`)
        .send({ tags: [{ key: 'x', value: 'y' }] })
        .expect(401);
    });
  });

  describe('/books/search (POST)', () => {
    it('should sort by created_at desc (default)', async () => {
      const res = await request(httpServer)
        .post('/books/search')
        .send({})
        .expect(201);
      const body = parseBody(res.body, isBookLiteArray);
      // created_at 降序
      for (let i = 1; i < body.length; ++i) {
        expect(
          new Date(body[i - 1].id).getTime() >= new Date(body[i].id).getTime(),
        ).toBe(true);
      }
    });

    it('should sort by updated_at asc', async () => {
      const res = await request(httpServer)
        .post('/books/search')
        .send({ sortBy: 'updated_at', sortOrder: 'asc' })
        .expect(201);
      const body = parseBody(res.body, isBookLiteArray);
      // updated_at 升序
      for (let i = 1; i < body.length; ++i) {
        expect(
          new Date(body[i - 1].id).getTime() <= new Date(body[i].id).getTime(),
        ).toBe(true);
      }
    });

    it('should sort by rating desc, unrated as -1', async () => {
      // 给部分书籍打分
      await request(httpServer)
        .post(`/books/${bookId1}/rating`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ score: 5 })
        .expect(201);
      await request(httpServer)
        .post(`/books/${bookId2}/rating`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ score: 3 })
        .expect(201);
      // bookId3/bookId4 无评分
      const res = await request(httpServer)
        .post('/books/search')
        .send({ sortBy: 'rating', sortOrder: 'desc' })
        .expect(201);
      const body = parseBody(res.body, isBookLiteArray);
      // 评分高的在前，无评分的在后
      const idToScore: Record<number, number> = {
        [bookId1]: 5,
        [bookId2]: 3,
        [bookId3]: -1,
        [bookId4]: -1,
      };
      for (let i = 1; i < body.length; ++i) {
        expect(idToScore[body[i - 1].id] >= idToScore[body[i].id]).toBe(true);
      }
    });

    it('should sort by rating asc, unrated as -1', async () => {
      // bookId1/2 已有评分，3/4无评分
      const res = await request(httpServer)
        .post('/books/search')
        .send({ sortBy: 'rating', sortOrder: 'asc' })
        .expect(201);
      const body = parseBody(res.body, isBookLiteArray);
      const idToScore: Record<number, number> = {
        [bookId1]: 5,
        [bookId2]: 3,
        [bookId3]: -1,
        [bookId4]: -1,
      };
      for (let i = 1; i < body.length; ++i) {
        expect(idToScore[body[i - 1].id] <= idToScore[body[i].id]).toBe(true);
      }
    });
    let bookId1: number; // Asimov + SF + 1950
    let bookId2: number; // Tolkien + Fantasy + 1954
    let bookId3: number; // Asimov + SF + 1951
    let bookId4: number; // Asimov + Fantasy + 1960 (for neq test)

    beforeEach(async () => {
      // 清理数据
      const books = await bookRepository.find();
      if (books.length > 0) await bookRepository.remove(books);
      const tags = await tagRepository.find();
      if (tags.length > 0) await tagRepository.remove(tags);

      // 数据集
      bookId1 = parseBody(
        (
          await request(httpServer)
            .post('/books')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              tags: [
                { key: 'author', value: 'Isaac Asimov' },
                { key: 'genre', value: 'Science Fiction' },
                { key: 'year', value: '1950' },
              ],
            })
        ).body,
        isBookLite,
      ).id;

      bookId2 = parseBody(
        (
          await request(httpServer)
            .post('/books')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              tags: [
                { key: 'author', value: 'J.R.R. Tolkien' },
                { key: 'genre', value: 'Fantasy' },
                { key: 'year', value: '1954' },
              ],
            })
        ).body,
        isBookLite,
      ).id;

      bookId3 = parseBody(
        (
          await request(httpServer)
            .post('/books')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              tags: [
                { key: 'author', value: 'Isaac Asimov' },
                { key: 'genre', value: 'Science Fiction' },
                { key: 'year', value: '1951' },
              ],
            })
        ).body,
        isBookLite,
      ).id;

      bookId4 = parseBody(
        (
          await request(httpServer)
            .post('/books')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              tags: [
                { key: 'author', value: 'Isaac Asimov' },
                { key: 'genre', value: 'Fantasy' },
                { key: 'year', value: '1960' },
              ],
            })
        ).body,
        isBookLite,
      ).id;
    });

    it('single eq condition', async () => {
      const res = await request(httpServer)
        .post('/books/search')
        .send({
          conditions: [{ target: 'author', op: 'eq', value: 'Isaac Asimov' }],
        })
        .expect(201);
      const body = parseBody(res.body, isBookLiteArray);
      expect(body.map((b) => b.id).sort()).toEqual(
        [bookId1, bookId3, bookId4].sort(),
      );
    });

    it('AND eq conditions', async () => {
      const res = await request(httpServer)
        .post('/books/search')
        .send({
          conditions: [
            { target: 'author', op: 'eq', value: 'Isaac Asimov' },
            { target: 'genre', op: 'eq', value: 'Science Fiction' },
          ],
        })
        .expect(201);
      const body = parseBody(res.body, isBookLiteArray);
      expect(body.map((b) => b.id).sort()).toEqual([bookId1, bookId3].sort());
    });

    it('eq + neq conditions', async () => {
      const res = await request(httpServer)
        .post('/books/search')
        .send({
          conditions: [
            { target: 'author', op: 'eq', value: 'Isaac Asimov' },
            { target: 'genre', op: 'neq', value: 'Science Fiction' },
          ],
        })
        .expect(201);
      const body = parseBody(res.body, isBookLiteArray);
      expect(body.map((b) => b.id)).toEqual([bookId4]);
    });

    it('match condition (partial ILIKE)', async () => {
      const res = await request(httpServer)
        .post('/books/search')
        .send({
          conditions: [{ target: 'author', op: 'match', value: 'asim' }],
        })
        .expect(201);
      const body = parseBody(res.body, isBookLiteArray);
      expect(body.map((b) => b.id).sort()).toEqual(
        [bookId1, bookId3, bookId4].sort(),
      );
    });

    it('single eq condition for Tolkien author', async () => {
      const res = await request(httpServer)
        .post('/books/search')
        .send({
          conditions: [{ target: 'author', op: 'eq', value: 'J.R.R. Tolkien' }],
        })
        .expect(201);
      const body = parseBody(res.body, isBookLiteArray);
      expect(body.map((b) => b.id)).toEqual([bookId2]);
    });

    it('eq genre Fantasy returns Tolkien + Asimov Fantasy', async () => {
      const res = await request(httpServer)
        .post('/books/search')
        .send({ conditions: [{ target: 'genre', op: 'eq', value: 'Fantasy' }] })
        .expect(201);
      const body = parseBody(res.body, isBookLiteArray);
      expect(body.map((b) => b.id).sort()).toEqual([bookId2, bookId4].sort());
    });

    it('empty body returns all books', async () => {
      const res = await request(httpServer)
        .post('/books/search')
        .send({})
        .expect(201);
      const body = parseBody(res.body, isBookLiteArray);
      expect(body).toHaveLength(4);
    });

    it('invalid operator should return 400', async () => {
      await request(httpServer)
        .post('/books/search')
        .send({ conditions: [{ target: 'author', op: 'unknown', value: 'x' }] })
        .expect(400);
    });

    it('paged search returns paged object when limit provided', async () => {
      const res = await request(httpServer)
        .post('/books/search')
        .send({
          limit: 2,
          offset: 0,
          conditions: [{ target: 'author', op: 'eq', value: 'Isaac Asimov' }],
        })
        .expect(201);
      const bodyGuard = (
        o: unknown,
      ): o is {
        total: number;
        limit: number;
        offset: number;
        items: Array<{
          id: number;
          tags?: Array<{ key: string; value: string }>;
        }>;
      } => {
        if (typeof o !== 'object' || o === null) return false;
        const r = o as Record<string, unknown>;
        return (
          typeof r.total === 'number' &&
          typeof r.limit === 'number' &&
          typeof r.offset === 'number' &&
          Array.isArray(r.items) &&
          r.items.every(
            (it) =>
              typeof it === 'object' &&
              it !== null &&
              typeof (it as Record<string, unknown>).id === 'number',
          )
        );
      };
      if (!bodyGuard(res.body)) {
        throw new Error('Unexpected paged body shape');
      }
      expect(res.body.limit).toBe(2);
      expect(res.body.offset).toBe(0);
      expect(res.body.items.length).toBeLessThanOrEqual(2);
      const ids = res.body.items.map((b) => b.id);
      ids.forEach((id) => expect([bookId1, bookId3, bookId4]).toContain(id));
    });
  });

  describe('/books/:id (DELETE)', () => {
    let bookId: number;

    beforeEach(async () => {
      const book = await bookRepository.save(
        bookRepository.create({ tags: [] }),
      );
      bookId = book.id;
    });

    it('should delete a book', async () => {
      await request(httpServer)
        .delete(`/books/${bookId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // 验证书籍已被删除
      const deletedBook = await bookRepository.findOne({
        where: { id: bookId },
      });
      expect(deletedBook).toBeNull();
    });

    it('should delete bound cover + epub objects and records when deleting book', async () => {
      // upload cover
      await request(httpServer)
        .put(`/books/${bookId}/cover`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from('png-bytes'), {
          filename: 'cover.png',
          contentType: 'image/png',
        })
        .expect(200);

      // upload epub
      const epubFixture = join(__dirname, '../../epub/test/test.epub');
      await request(httpServer)
        .post(`/epub/book/${bookId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', epubFixture)
        .expect(201);

      const coverKey = `books/${bookId}/cover.png`;

      // delete book
      await request(httpServer)
        .delete(`/books/${bookId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // verify book removed
      await request(httpServer)
        .get(`/books/${bookId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      // verify objects removed from fake S3
      const storeKeysAfter = Array.from(
        (s3?.__store as Map<string, any>)?.keys?.() ?? [],
      );
      expect(
        storeKeysAfter.some(
          (k) => typeof k === 'string' && k.startsWith(`books/${bookId}/epub/`),
        ),
      ).toBe(false);
      expect(storeKeysAfter.includes(coverKey)).toBe(false);
    });

    it('should return 401 without authentication', () => {
      return request(httpServer).delete(`/books/${bookId}`).expect(401);
    });

    it('should return 404 for non-existent book', () => {
      return request(httpServer)
        .delete('/books/999999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('/books/recommend/:id (GET)', () => {
    let baseId: number;
    let relatedIds: number[] = [];
    let unrelatedId: number;

    beforeEach(async () => {
      // 清空
      await bookRepository.query('DELETE FROM book_tags');
      await bookRepository.query('DELETE FROM book');
      await tagRepository.query('DELETE FROM tag');

      // 基础书籍（tags: a,b,c）
      const base = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tags: [
            { key: 'topic', value: 'AI' },
            { key: 'lang', value: 'TS' },
            { key: 'level', value: 'Advanced' },
          ],
        });
      baseId = parseBody(base.body, isBookLite).id;

      // 共享2个标签 (topic:AI, lang:TS)
      const b1 = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tags: [
            { key: 'topic', value: 'AI' },
            { key: 'lang', value: 'TS' },
          ],
        });
      // 共享1个标签 (topic:AI)
      const b2 = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tags: [
            { key: 'topic', value: 'AI' },
            { key: 'lang', value: 'Go' },
          ],
        });
      // 共享3个标签 (topic:AI, lang:TS, level:Advanced) => 应排在最前
      const b3 = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tags: [
            { key: 'topic', value: 'AI' },
            { key: 'lang', value: 'TS' },
            { key: 'level', value: 'Advanced' },
          ],
        });
      // 无共享标签
      const u = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tags: [{ key: 'topic', value: 'Math' }],
        });
      relatedIds = [
        parseBody(b1.body, isBookLite).id,
        parseBody(b2.body, isBookLite).id,
        parseBody(b3.body, isBookLite).id,
      ];
      unrelatedId = parseBody(u.body, isBookLite).id;
    });

    it('should return ordered recommendations by overlap desc', async () => {
      const res = await request(httpServer)
        .get(`/books/recommend/${baseId}`)
        .expect(200);
      // 期望包含 b3 (3 overlap) -> b1 (2) -> b2 (1)
      const recs = parseBody(res.body, isBookLiteArray);
      const ids = recs.map((b) => b.id);
      expect(ids).toEqual(expect.arrayContaining(relatedIds));
      // 检查顺序前3
      const indexB3 = ids.indexOf(relatedIds[2]); // b3
      const indexB1 = ids.indexOf(relatedIds[0]); // b1
      const indexB2 = ids.indexOf(relatedIds[1]); // b2
      expect(indexB3).toBeLessThan(indexB1);
      expect(indexB1).toBeLessThan(indexB2);
      // 不应包含无关书籍
      expect(ids).not.toContain(unrelatedId);
    });

    it('should respect limit parameter', async () => {
      const res = await request(httpServer)
        .get(`/books/recommend/${baseId}?limit=2`)
        .expect(200);
      expect(parseBody(res.body, isBookLiteArray)).toHaveLength(2);
    });

    it('should return 400 for invalid id', async () => {
      await request(httpServer).get('/books/recommend/invalid').expect(400);
    });

    it('should return 404 for non-existent book id', async () => {
      await request(httpServer).get('/books/recommend/999999').expect(404);
    });

    it('should return empty array when base book has no tags', async () => {
      // 创建无标签书籍
      const empty = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});
      const emptyBody = parseBody(empty.body, isBookLite);
      const res = await request(httpServer)
        .get(`/books/recommend/${emptyBody.id}`)
        .expect(200);
      expect(parseBody(res.body, isBookLiteArray)).toEqual([]);
    });
  });

  describe('Book Ratings', () => {
    let createdId: number;

    beforeEach(async () => {
      const res = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(201);
      createdId = parseBody(res.body, isBookLite).id;
    });

    it('public can read aggregate rating (initially zero, myRating null)', async () => {
      const res = await request(httpServer)
        .get(`/books/${createdId}/rating`)
        .expect(200);
      const agg0 = parseBody(
        res.body,
        (
          o,
        ): o is {
          bookId: number;
          avg: number;
          count: number;
          myRating: null;
        } => {
          if (typeof o !== 'object' || o === null) return false;
          const r = o as Record<string, unknown>;
          return (
            typeof r.bookId === 'number' &&
            typeof r.avg === 'number' &&
            typeof r.count === 'number' &&
            r.myRating === null
          );
        },
      );
      expect(agg0).toEqual({
        bookId: createdId,
        avg: 0,
        count: 0,
        myRating: null,
      });
    });

    it('user can set and update own rating (1-5)', async () => {
      // set 5
      const r1 = await request(httpServer)
        .post(`/books/${createdId}/rating`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ score: 5 })
        .expect(201);
      const r1b = parseBody(
        r1.body,
        (o): o is { ok: boolean; myRating: number; count: number } => {
          if (typeof o !== 'object' || o === null) return false;
          const r = o as Record<string, unknown>;
          return (
            typeof r.ok === 'boolean' &&
            typeof r.myRating === 'number' &&
            typeof r.count === 'number'
          );
        },
      );
      expect(r1b.ok).toBe(true);
      expect(r1b.myRating).toBe(5);
      expect(r1b.count).toBeGreaterThanOrEqual(1);

      // update to 3
      const r2 = await request(httpServer)
        .post(`/books/${createdId}/rating`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ score: 3 })
        .expect(201);
      const r2b = parseBody(r2.body, (o): o is { myRating: number } => {
        if (typeof o !== 'object' || o === null) return false;
        return typeof (o as Record<string, unknown>).myRating === 'number';
      });
      expect(r2b.myRating).toBe(3);

      // get my rating (dedicated endpoint)
      const me = await request(httpServer)
        .get(`/books/${createdId}/rating/me`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const meb = parseBody(me.body, (o): o is { myRating: number } => {
        if (typeof o !== 'object' || o === null) return false;
        return typeof (o as Record<string, unknown>).myRating === 'number';
      });
      expect(meb.myRating).toBe(3);

      // aggregate with auth should include myRating=3
      const aggAuth = await request(httpServer)
        .get(`/books/${createdId}/rating`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const aggAuthBody = parseBody(
        aggAuth.body,
        (
          o,
        ): o is {
          bookId: number;
          avg: number;
          count: number;
          myRating: number;
        } => {
          if (typeof o !== 'object' || o === null) return false;
          const r = o as Record<string, unknown>;
          return (
            typeof r.bookId === 'number' &&
            typeof r.avg === 'number' &&
            typeof r.count === 'number' &&
            typeof r.myRating === 'number'
          );
        },
      );
      expect(aggAuthBody.myRating).toBe(3);

      // aggregate without auth still myRating null
      const aggNoAuth = await request(httpServer)
        .get(`/books/${createdId}/rating`)
        .expect(200);
      const aggNoAuthBody = parseBody(
        aggNoAuth.body,
        (
          o,
        ): o is {
          bookId: number;
          avg: number;
          count: number;
          myRating: null;
        } => {
          if (typeof o !== 'object' || o === null) return false;
          const r = o as Record<string, unknown>;
          return (
            typeof r.bookId === 'number' &&
            typeof r.avg === 'number' &&
            typeof r.count === 'number' &&
            r.myRating === null
          );
        },
      );
      expect(aggNoAuthBody.myRating).toBeNull();
    });

    it('requires auth to rate and delete my rating', async () => {
      await request(httpServer)
        .post(`/books/${createdId}/rating`)
        .send({ score: 4 })
        .expect(401);
      await request(httpServer)
        .delete(`/books/${createdId}/rating`)
        .expect(401);
    });

    it('deleting my rating adjusts aggregate', async () => {
      await request(httpServer)
        .post(`/books/${createdId}/rating`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ score: 4 })
        .expect(201);
      const del = await request(httpServer)
        .delete(`/books/${createdId}/rating`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const delBody = parseBody(del.body, (o): o is { ok: boolean } => {
        if (typeof o !== 'object' || o === null) return false;
        return typeof (o as Record<string, unknown>).ok === 'boolean';
      });
      expect(delBody.ok).toBe(true);
      const agg = await request(httpServer)
        .get(`/books/${createdId}/rating`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const aggb = parseBody(
        agg.body,
        (o): o is { count: number; myRating: null } => {
          if (typeof o !== 'object' || o === null) return false;
          const r = o as Record<string, unknown>;
          return typeof r.count === 'number' && r.myRating === null;
        },
      );
      expect(aggb.count).toBeGreaterThanOrEqual(0);
      expect(aggb.myRating).toBeNull();
    });
  });

  describe('Book Comments', () => {
    let createdId: number;
    let otherUserToken: string;
    let otherUserId: number;

    beforeEach(async () => {
      const res = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(201);
      createdId = parseBody(res.body, isBookLite).id;

      // another user
      const suffix = Date.now().toString();
      const otherReg = await request(httpServer)
        .post('/auth/register')
        .send({
          username: `c_other_${suffix}`,
          email: `c_other_${suffix}@example.com`,
          password: 'p@ssw0rd!',
        })
        .expect(201);
      otherUserId = parseBody(
        otherReg.body,
        (d): d is { user: { id: number } } => {
          if (typeof d !== 'object' || d === null) return false;
          const r = d as Record<string, unknown>;
          const u = r.user as Record<string, unknown> | undefined;
          return (
            typeof u === 'object' && u !== null && typeof u.id === 'number'
          );
        },
      ).user.id;
      const otherLogin = await request(httpServer)
        .post('/auth/login')
        .send({ username: `c_other_${suffix}`, password: 'p@ssw0rd!' })
        .expect(200);
      otherUserToken = parseBody(
        otherLogin.body,
        (d): d is { access_token: string } => {
          if (typeof d !== 'object' || d === null) return false;
          return (
            typeof (d as Record<string, unknown>).access_token === 'string'
          );
        },
      ).access_token;
    });

    it('public can list comments (initially empty)', async () => {
      const res = await request(httpServer)
        .get(`/books/${createdId}/comments`)
        .expect(200);
      const page0 = parseBody(
        res.body,
        (o): o is { total: number; items: unknown[] } =>
          isPagedResult(o, (_): _ is unknown => true),
      );
      expect(page0.total).toBe(0);
      expect(page0.items).toEqual([]);
    });

    it('user can add and list own comment', async () => {
      const c1 = await request(httpServer)
        .post(`/books/${createdId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Nice book' })
        .expect(201);
      const c1Body = parseBody(c1.body, (o): o is { id: number } => {
        if (typeof o !== 'object' || o === null) return false;
        return typeof (o as Record<string, unknown>).id === 'number';
      });
      expect(c1Body.id).toBeDefined();
      const list = await request(httpServer)
        .get(`/books/${createdId}/comments`)
        .expect(200);
      const page1 = parseBody(
        list.body,
        (
          o,
        ): o is {
          total: number;
          items: Array<{ content: string; reply_count: number }>;
        } =>
          isPagedResult(
            o,
            (x): x is { content: string; reply_count: number } => {
              if (typeof x !== 'object' || x === null) return false;
              const r = x as Record<string, unknown>;
              return (
                typeof r.content === 'string' &&
                typeof r.reply_count === 'number'
              );
            },
          ),
      );
      expect(page1.total).toBe(1);
      expect(page1.items[0].content).toBe('Nice book');
      expect(page1.items[0].reply_count).toBe(0);
    });

    it('requires auth to add comment', async () => {
      await request(httpServer)
        .post(`/books/${createdId}/comments`)
        .send({ content: 'x' })
        .expect(401);
    });

    it('owner can delete own comment; others cannot unless COMMENT_MANAGE', async () => {
      // current user adds a comment
      const c1 = await request(httpServer)
        .post(`/books/${createdId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'to be deleted' })
        .expect(201);
      const commentId = parseBody(c1.body, (o): o is { id: number } => {
        if (typeof o !== 'object' || o === null) return false;
        return typeof (o as Record<string, unknown>).id === 'number';
      }).id;

      // other user cannot delete
      await request(httpServer)
        .delete(`/books/${createdId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(403);

      // grant other user COMMENT_MANAGE
      const ds = app.get(DataSource);
      await grantPermissions(ds, otherUserId, { COMMENT_MANAGE: 1 });

      // now can delete
      await request(httpServer)
        .delete(`/books/${createdId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(200);
    });

    it('supports replies (楼中楼): add/list and cascade delete with parent', async () => {
      // add a top-level comment
      const c1 = await request(httpServer)
        .post(`/books/${createdId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Parent Cmt' })
        .expect(201);
      const parentId = parseBody(c1.body, (o): o is { id: number } => {
        if (typeof o !== 'object' || o === null) return false;
        return typeof (o as Record<string, unknown>).id === 'number';
      }).id;

      // reply to that comment
      const r1 = await request(httpServer)
        .post(`/books/${createdId}/comments/${parentId}/replies`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'First reply' })
        .expect(201);
      const r1Body = parseBody(r1.body, (o): o is { parentId: number } => {
        if (typeof o !== 'object' || o === null) return false;
        return typeof (o as Record<string, unknown>).parentId === 'number';
      });
      expect(r1Body.parentId).toBe(parentId);

      // list replies
      const list = await request(httpServer)
        .get(`/books/${createdId}/comments/${parentId}/replies`)
        .expect(200);
      const repliesPage = parseBody(
        list.body,
        (o): o is { total: number; items: Array<{ content: string }> } =>
          isPagedResult(
            o,
            (x): x is { content: string } =>
              typeof x === 'object' &&
              x !== null &&
              typeof (x as Record<string, unknown>).content === 'string',
          ),
      );
      expect(repliesPage.total).toBe(1);
      expect(repliesPage.items[0].content).toBe('First reply');

      // list top-level again should show reply_count = 1
      const tops = await request(httpServer)
        .get(`/books/${createdId}/comments`)
        .expect(200);
      const topsPage = parseBody(
        tops.body,
        (o): o is { items: Array<{ reply_count: number }> } =>
          isPagedResult(
            o,
            (x): x is { reply_count: number } =>
              typeof x === 'object' &&
              x !== null &&
              typeof (x as Record<string, unknown>).reply_count === 'number',
          ),
      );
      expect(topsPage.items[0].reply_count).toBe(1);

      // delete parent comment -> should cascade delete replies
      await request(httpServer)
        .delete(`/books/${createdId}/comments/${parentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // now parent missing -> listing replies should return 404
      await request(httpServer)
        .get(`/books/${createdId}/comments/${parentId}/replies`)
        .expect(404);
    });
  });
});
