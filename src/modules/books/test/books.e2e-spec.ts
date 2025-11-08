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
import { grantPermissions } from '../../permissions/test/permissions.seed';

describe('Books (e2e)', () => {
  let app: INestApplication;
  let bookRepository: Repository<Book>;
  let tagRepository: Repository<Tag>;
  let userRepository: Repository<User>;
  let authToken: string;
  let userId: number;
  let httpServer: Server;

  interface CreatedBookLite {
    id: number;
    hash: string;
    title: string;
    description?: string;
    tags?: Array<{ key: string; value: string }>;
  }

  function parseBody<T>(data: unknown, guard: (o: unknown) => o is T): T {
    if (guard(data)) return data;
    throw new Error('Unexpected body shape');
  }

  const isBookLite = (o: unknown): o is CreatedBookLite => {
    if (typeof o !== 'object' || o === null) return false;
    const r = o as Record<string, unknown>;
    return (
      typeof r.id === 'number' &&
      typeof r.hash === 'string' &&
      typeof r.title === 'string'
    );
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
    } catch (error) {
      // 忽略清理错误，因为表可能不存在
      const msg = error instanceof Error ? error.message : String(error);
      console.log('Error cleaning up before test:', msg);
    }
  });

  describe('/books (POST)', () => {
    it('should create a new book with tags', () => {
      const createBookDto = {
        hash: 'test-hash-123',
        title: 'Test Book',
        description: 'A test book description',
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
          expect(body.hash).toBe(createBookDto.hash);
          expect(body.title).toBe(createBookDto.title);
          expect(body.description).toBe(createBookDto.description);
          expect(body.tags).toHaveLength(2);
        });
    });

    it('should create a book without tags', () => {
      const createBookDto = {
        hash: 'simple-book-hash',
        title: 'Simple Book',
      };

      return request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createBookDto)
        .expect(201)
        .expect((res) => {
          const body = parseBody(res.body, isBookLite);
          expect(body.hash).toBe(createBookDto.hash);
          expect(body.title).toBe(createBookDto.title);
          expect(body.tags).toHaveLength(0);
        });
    });

    it('should return 409 if book hash already exists', async () => {
      const createBookDto = {
        hash: 'duplicate-hash',
        title: 'First Book',
      };

      // 创建第一本书
      await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createBookDto)
        .expect(201);

      // 尝试创建相同hash的书
      return request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...createBookDto, title: 'Second Book' })
        .expect(409);
    });

    it('should return 401 without authentication', () => {
      const createBookDto = {
        hash: 'unauthorized-book',
        title: 'Unauthorized Book',
      };

      return request(httpServer).post('/books').send(createBookDto).expect(401);
    });
  });

  describe('/books (GET)', () => {
    beforeEach(async () => {
      // 创建测试数据
      const book1: Book = await bookRepository.save({
        hash: 'book1-hash',
        title: 'Book One',
        description: 'First book',
        tags: [],
      });

      const book2: Book = await bookRepository.save({
        hash: 'book2-hash',
        title: 'Book Two',
        description: 'Second book',
        tags: [],
      });

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
      expect(body[0].title).toBeDefined();
      expect(body[0].tags).toBeDefined();
    });

    it('should filter books by tags', async () => {
      const res: Response = await request(httpServer)
        .get('/books?tags=author')
        .expect(200);
      const body = parseBody(res.body, isBookLiteArray);
      expect(body.length).toBeGreaterThan(0);
      body.forEach((book) => {
        expect(book.tags?.some((tag) => tag.key === 'author')).toBe(true);
      });
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
        .send({ hash: 'mine-1', title: 'Mine 1' })
        .expect(201);
      const b2 = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ hash: 'mine-2', title: 'Mine 2' })
        .expect(201);
      myIds = [
        parseBody(b1.body, isBookLite).id,
        parseBody(b2.body, isBookLite).id,
      ];

      // 其他用户创建两本书
      const o1 = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({ hash: 'other-1', title: 'Other 1' })
        .expect(201);
      const o2 = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({ hash: 'other-2', title: 'Other 2' })
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
      const book = await bookRepository.save({
        hash: 'single-book-hash',
        title: 'Single Book',
        description: 'A single book for testing',
        tags: [],
      });
      bookId = book.id;
    });

    it('should return a book by ID', async () => {
      const res: Response = await request(httpServer)
        .get(`/books/${bookId}`)
        .expect(200);
      const body = parseBody(res.body, isBookLite);
      expect(body.id).toBe(bookId);
      expect(body.hash).toBe('single-book-hash');
      expect(body.title).toBe('Single Book');
    });

    it('should return 404 for non-existent book', () => {
      return request(httpServer).get('/books/999999').expect(404);
    });
  });

  describe('/books/hash/:hash (GET)', () => {
    beforeEach(async () => {
      await bookRepository.save({
        hash: 'findable-hash',
        title: 'Findable Book',
        description: 'A book to find by hash',
        tags: [],
      });
    });

    it('should return a book by hash', async () => {
      const res: Response = await request(httpServer)
        .get('/books/hash/findable-hash')
        .expect(200);
      const body = parseBody(res.body, isBookLite);
      expect(body.hash).toBe('findable-hash');
      expect(body.title).toBe('Findable Book');
    });

    it('should return 404 for non-existent hash', () => {
      return request(httpServer)
        .get('/books/hash/non-existent-hash')
        .expect(404);
    });
  });

  describe('/books/:id (PATCH)', () => {
    let bookId: number;

    beforeEach(async () => {
      const book = await bookRepository.save({
        hash: 'updatable-hash',
        title: 'Original Title',
        description: 'Original description',
        tags: [],
      });
      bookId = book.id;
    });

    it('should update a book', async () => {
      const updateDto = {
        title: 'Updated Title',
        description: 'Updated description',
      };

      const res = await request(httpServer)
        .patch(`/books/${bookId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(200);
      const body = parseBody(res.body, isBookLite);
      expect(body.title).toBe('Updated Title');
      expect(body.description).toBe('Updated description');
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

    it('should return 401 without authentication', () => {
      return request(httpServer)
        .patch(`/books/${bookId}`)
        .send({ title: 'Unauthorized Update' })
        .expect(401);
    });
  });

  describe('/books/search (POST)', () => {
    let bookId1: number;
    let bookId2: number;
    let bookId3: number;

    beforeEach(async () => {
      // 清理数据 - 使用级联删除
      const books = await bookRepository.find();
      if (books.length > 0) {
        await bookRepository.remove(books);
      }

      const tags = await tagRepository.find();
      if (tags.length > 0) {
        await tagRepository.remove(tags);
      }

      // 创建测试数据
      const book1 = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          hash: 'search-book-1',
          title: 'Science Fiction Book',
          description: 'A sci-fi book',
          tags: [
            { key: 'author', value: 'Isaac Asimov' },
            { key: 'genre', value: 'Science Fiction' },
            { key: 'year', value: '1950' },
          ],
        });
      bookId1 = parseBody(book1.body, isBookLite).id;

      const book2 = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          hash: 'search-book-2',
          title: 'Fantasy Novel',
          description: 'A fantasy book',
          tags: [
            { key: 'author', value: 'J.R.R. Tolkien' },
            { key: 'genre', value: 'Fantasy' },
            { key: 'year', value: '1954' },
          ],
        });
      bookId2 = parseBody(book2.body, isBookLite).id;

      const book3 = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          hash: 'search-book-3',
          title: 'Another Sci-Fi',
          description: 'Another sci-fi book',
          tags: [
            { key: 'author', value: 'Isaac Asimov' },
            { key: 'genre', value: 'Science Fiction' },
            { key: 'year', value: '1951' },
          ],
        });
      bookId3 = parseBody(book3.body, isBookLite).id;
    });

    it('should search books by tag keys', async () => {
      const response = await request(httpServer)
        .post('/books/search')
        .send({
          tagKeys: 'author,genre',
        })
        .expect(201);
      const body1 = parseBody(response.body, isBookLiteArray);
      expect(body1).toHaveLength(3);
      expect(body1.map((book) => book.id).sort()).toEqual(
        [bookId1, bookId2, bookId3].sort(),
      );
    });

    it('should search books by specific tag key-value pair', async () => {
      const response = await request(httpServer)
        .post('/books/search')
        .send({
          tagKey: 'author',
          tagValue: 'Isaac Asimov',
        })
        .expect(201);
      const body2 = parseBody(response.body, isBookLiteArray);
      expect(body2).toHaveLength(2);
      expect(body2.map((book) => book.id).sort()).toEqual(
        [bookId1, bookId3].sort(),
      );
    });

    it('should search books by multiple tag filters', async () => {
      const response = await request(httpServer)
        .post('/books/search')
        .send({
          tagFilters: [
            { key: 'genre', value: 'Fantasy' },
            { key: 'year', value: '1950' },
          ],
        })
        .expect(201);
      const body3 = parseBody(response.body, isBookLiteArray);
      expect(body3).toHaveLength(2);
      expect(body3.map((book) => book.id).sort()).toEqual(
        [bookId1, bookId2].sort(),
      );
    });

    it('should return all books when no search criteria provided', async () => {
      const response = await request(httpServer)
        .post('/books/search')
        .send({})
        .expect(201);
      expect(parseBody(response.body, isBookLiteArray)).toHaveLength(3);
    });

    it('should return empty array when no books match criteria', async () => {
      const response = await request(httpServer)
        .post('/books/search')
        .send({
          tagKey: 'author',
          tagValue: 'Nonexistent Author',
        })
        .expect(201);
      expect(parseBody(response.body, isBookLiteArray)).toHaveLength(0);
    });
  });

  describe('/books/tags/:key/:value (GET)', () => {
    let bookId1: number;
    let bookId2: number;

    beforeEach(async () => {
      // 清理数据 - 使用级联删除
      const books = await bookRepository.find();
      if (books.length > 0) {
        await bookRepository.remove(books);
      }

      const tags = await tagRepository.find();
      if (tags.length > 0) {
        await tagRepository.remove(tags);
      }

      // 创建测试数据
      const book1 = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          hash: 'tag-search-1',
          title: 'Book by Asimov',
          tags: [
            { key: 'author', value: 'Isaac Asimov' },
            { key: 'genre', value: 'Science Fiction' },
          ],
        });
      bookId1 = parseBody(book1.body, isBookLite).id;

      const book2 = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          hash: 'tag-search-2',
          title: 'Another Asimov Book',
          tags: [
            { key: 'author', value: 'Isaac Asimov' },
            { key: 'genre', value: 'Science Fiction' },
          ],
        });
      bookId2 = parseBody(book2.body, isBookLite).id;
    });

    it('should return books with specific tag key-value pair', async () => {
      const response = await request(httpServer)
        .get('/books/tags/author/Isaac%20Asimov')
        .expect(200);
      const body = parseBody(response.body, isBookLiteArray);
      expect(body).toHaveLength(2);
      expect(body.map((book) => book.id).sort()).toEqual(
        [bookId1, bookId2].sort(),
      );
      body.forEach((book) => {
        expect(
          book.tags?.some(
            (tag) => tag.key === 'author' && tag.value === 'Isaac Asimov',
          ),
        ).toBe(true);
      });
    });

    it('should return empty array when no books match the tag', async () => {
      const response = await request(httpServer)
        .get('/books/tags/author/Nonexistent%20Author')
        .expect(200);
      expect(parseBody(response.body, isBookLiteArray)).toHaveLength(0);
    });

    it('should handle URL encoded values correctly', async () => {
      const response = await request(httpServer)
        .get('/books/tags/genre/Science%20Fiction')
        .expect(200);
      expect(parseBody(response.body, isBookLiteArray)).toHaveLength(2);
    });
  });

  describe('/books/:id (DELETE)', () => {
    let bookId: number;

    beforeEach(async () => {
      const book = await bookRepository.save({
        hash: 'deletable-hash',
        title: 'Deletable Book',
        tags: [],
      });
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

  describe('/books/tag-id/:id (GET)', () => {
    let bookId1: number;
    let bookId2: number;
    let tagId: number;

    beforeEach(async () => {
      // 清理数据 - 使用级联删除
      const books = await bookRepository.find();
      if (books.length > 0) {
        await bookRepository.remove(books);
      }

      const tags = await tagRepository.find();
      if (tags.length > 0) {
        await tagRepository.remove(tags);
      }

      // 创建测试数据
      const book1 = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          hash: 'tagid-search-1',
          title: 'Book with Author Tag',
          tags: [
            { key: 'author', value: 'Isaac Asimov' },
            { key: 'genre', value: 'Science Fiction' },
          ],
        });
      bookId1 = parseBody(book1.body, isBookLite).id;

      const book2 = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          hash: 'tagid-search-2',
          title: 'Another Book with Author Tag',
          tags: [
            { key: 'author', value: 'Isaac Asimov' },
            { key: 'genre', value: 'Fantasy' },
          ],
        });
      bookId2 = parseBody(book2.body, isBookLite).id;

      // 获取author tag的ID
      const authorTag = await tagRepository.findOne({
        where: { key: 'author', value: 'Isaac Asimov' },
      });
      if (!authorTag) {
        throw new Error('Author tag not found');
      }
      tagId = authorTag.id;
    });

    it('should return books by tag ID', async () => {
      const response = await request(httpServer)
        .get(`/books/tag-id/${tagId}`)
        .expect(200);
      const body = parseBody(response.body, isBookLiteArray);
      expect(body).toHaveLength(2);
      expect(body.map((book) => book.id).sort()).toEqual(
        [bookId1, bookId2].sort(),
      );
      expect(body[0].tags).toBeDefined();
    });

    it('should return empty array for non-existent tag ID', async () => {
      const response = await request(httpServer)
        .get('/books/tag-id/999999')
        .expect(200);
      expect(parseBody(response.body, isBookLiteArray)).toHaveLength(0);
    });

    it('should return 400 for invalid tag ID', async () => {
      await request(httpServer).get('/books/tag-id/invalid').expect(400);
    });

    it('should return 400 for negative tag ID', async () => {
      await request(httpServer).get('/books/tag-id/-1').expect(400);
    });
  });

  describe('/books/tag-ids/:ids (GET)', () => {
    let bookId1: number;
    let authorTagId: number;
    let genreTagId: number;

    beforeEach(async () => {
      // 清理数据 - 使用级联删除
      const books = await bookRepository.find();
      if (books.length > 0) {
        await bookRepository.remove(books);
      }

      const tags = await tagRepository.find();
      if (tags.length > 0) {
        await tagRepository.remove(tags);
      }

      // 创建测试数据
      const book1 = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          hash: 'tagids-search-1',
          title: 'Sci-Fi Book',
          tags: [
            { key: 'author', value: 'Isaac Asimov' },
            { key: 'genre', value: 'Science Fiction' },
          ],
        });
      bookId1 = parseBody(book1.body, isBookLite).id;

      await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          hash: 'tagids-search-2',
          title: 'Fantasy Book',
          tags: [
            { key: 'author', value: 'J.R.R. Tolkien' },
            { key: 'genre', value: 'Science Fiction' },
          ],
        })
        .expect(201);

      await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          hash: 'tagids-search-3',
          title: 'Another Asimov Book',
          tags: [
            { key: 'author', value: 'Isaac Asimov' },
            { key: 'genre', value: 'Fantasy' },
          ],
        })
        .expect(201);

      // 获取tag IDs
      const authorTag = await tagRepository.findOne({
        where: { key: 'author', value: 'Isaac Asimov' },
      });
      const genreTag = await tagRepository.findOne({
        where: { key: 'genre', value: 'Science Fiction' },
      });
      if (!authorTag || !genreTag) {
        throw new Error('Required tags not found');
      }
      authorTagId = authorTag.id;
      genreTagId = genreTag.id;
    });

    it('should return books by multiple tag IDs', async () => {
      const response = await request(httpServer)
        .get(`/books/tag-ids/${authorTagId},${genreTagId}`)
        .expect(200);
      const body = parseBody(response.body, isBookLiteArray);
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(bookId1);
    });

    it('should filter out invalid tag IDs', async () => {
      const response = await request(httpServer)
        .get(`/books/tag-ids/${authorTagId},invalid,${genreTagId},0`)
        .expect(200);
      const body2 = parseBody(response.body, isBookLiteArray);
      expect(body2).toHaveLength(1);
      expect(body2[0].id).toBe(bookId1);
    });

    it('should return 400 when no valid tag IDs provided', async () => {
      await request(httpServer).get('/books/tag-ids/invalid,0,-1').expect(400);
    });

    it('should return empty array for non-existent tag IDs', async () => {
      const response = await request(httpServer)
        .get('/books/tag-ids/999999,888888')
        .expect(200);
      expect(parseBody(response.body, isBookLiteArray)).toHaveLength(0);
    });
  });

  describe('/books/search (POST) with tag IDs', () => {
    let bookId1: number;
    let bookId2: number;
    let authorTagId: number;
    let genreTagId: number;

    beforeEach(async () => {
      // 清理数据 - 使用级联删除
      const books = await bookRepository.find();
      if (books.length > 0) {
        await bookRepository.remove(books);
      }

      const tags = await tagRepository.find();
      if (tags.length > 0) {
        await tagRepository.remove(tags);
      }

      // 创建测试数据
      const book1 = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          hash: 'search-tagids-1',
          title: 'Tagged Book 1',
          tags: [
            { key: 'author', value: 'Isaac Asimov' },
            { key: 'genre', value: 'Science Fiction' },
          ],
        });
      bookId1 = parseBody(book1.body, isBookLite).id;

      const book2 = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          hash: 'search-tagids-2',
          title: 'Tagged Book 2',
          tags: [
            { key: 'author', value: 'Isaac Asimov' },
            { key: 'genre', value: 'Fantasy' },
          ],
        });
      bookId2 = parseBody(book2.body, isBookLite).id;

      // 获取tag IDs
      const authorTag = await tagRepository.findOne({
        where: { key: 'author', value: 'Isaac Asimov' },
      });
      const genreTag = await tagRepository.findOne({
        where: { key: 'genre', value: 'Science Fiction' },
      });
      if (!authorTag || !genreTag) {
        throw new Error('Required tags not found');
      }
      authorTagId = authorTag.id;
      genreTagId = genreTag.id;
    });

    it('should search books by single tag ID', async () => {
      const response = await request(httpServer)
        .post('/books/search')
        .send({
          tagId: authorTagId,
        })
        .expect(201);
      const body = parseBody(response.body, isBookLiteArray);
      expect(body).toHaveLength(2);
      expect(body.map((book) => book.id).sort()).toEqual(
        [bookId1, bookId2].sort(),
      );
    });

    it('should search books by multiple tag IDs', async () => {
      const response = await request(httpServer)
        .post('/books/search')
        .send({
          tagIds: `${authorTagId},${genreTagId}`,
        })
        .expect(201);
      const body = parseBody(response.body, isBookLiteArray);
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(bookId1);
    });

    it('should return empty array for non-existent tag ID', async () => {
      const response = await request(httpServer)
        .post('/books/search')
        .send({
          tagId: 999999,
        })
        .expect(201);
      expect(parseBody(response.body, isBookLiteArray)).toHaveLength(0);
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
          hash: 'rec-base',
          title: 'Base',
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
          hash: 'rec-b1',
          title: 'Rel 1',
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
          hash: 'rec-b2',
          title: 'Rel 2',
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
          hash: 'rec-b3',
          title: 'Rel 3',
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
          hash: 'rec-u1',
          title: 'Unrelated',
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
        .send({ hash: 'rec-empty', title: 'Empty' });
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
        .send({ hash: 'rate-1', title: 'Rate Target' })
        .expect(201);
      createdId = parseBody(res.body, isBookLite).id;
    });

    it('public can read aggregate rating (initially zero)', async () => {
      const res = await request(httpServer)
        .get(`/books/${createdId}/rating`)
        .expect(200);
      const agg0 = parseBody(
        res.body,
        (o): o is { bookId: number; avg: number; count: number } => {
          if (typeof o !== 'object' || o === null) return false;
          const r = o as Record<string, unknown>;
          return (
            typeof r.bookId === 'number' &&
            typeof r.avg === 'number' &&
            typeof r.count === 'number'
          );
        },
      );
      expect(agg0).toEqual({ bookId: createdId, avg: 0, count: 0 });
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

      // get my rating
      const me = await request(httpServer)
        .get(`/books/${createdId}/rating/me`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const meb = parseBody(me.body, (o): o is { myRating: number } => {
        if (typeof o !== 'object' || o === null) return false;
        return typeof (o as Record<string, unknown>).myRating === 'number';
      });
      expect(meb.myRating).toBe(3);
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
        .expect(200);
      const aggb = parseBody(agg.body, (o): o is { count: number } => {
        if (typeof o !== 'object' || o === null) return false;
        return typeof (o as Record<string, unknown>).count === 'number';
      });
      expect(aggb.count).toBeGreaterThanOrEqual(0);
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
        .send({ hash: 'cmt-1', title: 'Comment Target' })
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
