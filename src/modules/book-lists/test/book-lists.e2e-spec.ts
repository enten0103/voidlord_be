import { TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { createTestModule } from '../../../../test/test-module.factory';
import { DataSource } from 'typeorm';
import { grantPermissions } from '../../permissions/test/permissions.seed';
import { registerAndLogin } from '../../../../test/test-module.factory';
import { isBookListDetail } from '../../../../test/response-guards';
import type { Server } from 'http';

describe('Book Lists (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;
  let userToken: string;
  let userId: number;
  let otherToken: string;
  let ds: DataSource;
  // 已迁移到通用守卫 isBookListDetail

  beforeAll(async () => {
    const moduleFixture: TestingModule = await createTestModule();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    httpServer = app.getHttpServer() as unknown as Server;

    ds = moduleFixture.get(DataSource);

    // register & login user
    const u = await registerAndLogin(app, {
      username: 'luser',
      email: 'luser@example.com',
      password: 'p@ssw0rd!',
    });
    userId = u.user.id;
    userToken = u.access_token;
    // grant BOOK_CREATE to allow creating books
    await grantPermissions(ds, userId, { BOOK_CREATE: 1 });

    // other user
    const o = await registerAndLogin(app, {
      username: 'otherl',
      email: 'otherl@example.com',
      password: 'p@ssw0rd!',
    });
    otherToken = o.access_token;
  });

  afterAll(async () => {
    try {
      await app.close();
    } catch {
      /* ignore */
    }
  });

  it('create list, add book, view detail, privacy works', async () => {
    // create a book to add
    const bRes = await request(httpServer)
      .post('/books')
      .set('Authorization', `Bearer ${userToken}`)
      .send({})
      .expect(201);
    const b = bRes.body as { id: number };

    // create list private
    const cl = await request(httpServer)
      .post('/book-lists')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'MyFav', is_public: false })
      .expect(201);
    const listId: number = (cl.body as { id: number }).id;

    // add book
    await request(httpServer)
      .post(`/book-lists/${listId}/books`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ bookId: b.id })
      .expect(201);

    // other user cannot view private
    await request(httpServer)
      .get(`/book-lists/${listId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);

    // set public
    await request(httpServer)
      .patch(`/book-lists/${listId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ is_public: true })
      .expect(200);

    // now other can view
    const view = await request(httpServer)
      .get(`/book-lists/${listId}`)
      .expect(200);
    if (!isBookListDetail(view.body))
      throw new Error('Invalid detail response');
    const viewBody = view.body;
    expect(viewBody.items_count).toBe(1);
    // items 在 copy/detail 守卫中可选，这里确保存在再断言
    expect(Array.isArray(viewBody.items)).toBe(true);
    if (!viewBody.items || viewBody.items.length === 0) {
      throw new Error('Expected items in list detail');
    }
    const first = viewBody.items[0];
    if (!first || !first.book) {
      throw new Error('Expected first item to contain book');
    }
    expect(typeof first.book.id).toBe('number');
    // 书籍模型已简化为仅包含 id/时间戳/作者与标签，不再有 title 字段
    expect(first.book.id).toBe(b.id);

    // duplicate add -> 409
    await request(httpServer)
      .post(`/book-lists/${listId}/books`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ bookId: b.id })
      .expect(409);

    // remove book
    await request(httpServer)
      .delete(`/book-lists/${listId}/books/${b.id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
  });

  it('copy public list to another user creates a private duplicate with items', async () => {
    // owner creates a book
    const bRes = await request(httpServer)
      .post('/books')
      .set('Authorization', `Bearer ${userToken}`)
      .send({})
      .expect(201);
    const b = bRes.body as { id: number };

    // owner creates a public source list
    const cl = await request(httpServer)
      .post('/book-lists')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'CopySrc', is_public: true })
      .expect(201);
    const srcId: number = (cl.body as { id: number }).id;

    // add book to source list
    await request(httpServer)
      .post(`/book-lists/${srcId}/books`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ bookId: b.id })
      .expect(201);

    // other user copies it
    const cp = await request(httpServer)
      .post(`/book-lists/${srcId}/copy`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(201);
    if (!isBookListDetail(cp.body)) throw new Error('Invalid copy response');
    const cpBody = cp.body;
    expect(cpBody.id).toBeGreaterThan(0);
    expect(cpBody.is_public).toBe(false);
    expect(cpBody.items_count).toBe(1);

    // copied list defaults to private; response already contains items_count
  });

  it('copying private list of others is forbidden', async () => {
    // owner creates a book
    const bRes = await request(httpServer)
      .post('/books')
      .set('Authorization', `Bearer ${userToken}`)
      .send({})
      .expect(201);
    const b = bRes.body as { id: number };

    // owner creates a private source list
    const cl = await request(httpServer)
      .post('/book-lists')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'PrivateSrc', is_public: false })
      .expect(201);
    const srcId: number = (cl.body as { id: number }).id;

    await request(httpServer)
      .post(`/book-lists/${srcId}/books`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ bookId: b.id })
      .expect(201);

    // other tries to copy -> 403
    await request(httpServer)
      .post(`/book-lists/${srcId}/copy`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
  });

  it('copy uses name suffix when target has same-name list', async () => {
    // owner creates a book
    const bRes = await request(httpServer)
      .post('/books')
      .set('Authorization', `Bearer ${userToken}`)
      .send({})
      .expect(201);
    const b = bRes.body as { id: number };

    // owner creates a public source list with name Collision
    const cl = await request(httpServer)
      .post('/book-lists')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'Collision', is_public: true })
      .expect(201);
    const srcId: number = (cl.body as { id: number }).id;

    await request(httpServer)
      .post(`/book-lists/${srcId}/books`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ bookId: b.id })
      .expect(201);

    // other user already has a list named Collision
    await request(httpServer)
      .post('/book-lists')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ name: 'Collision', is_public: false })
      .expect(201);

    // copying should succeed with a suffixed name
    const cp = await request(httpServer)
      .post(`/book-lists/${srcId}/copy`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(201);
    if (!isBookListDetail(cp.body)) throw new Error('Invalid copy response');
    const cpBody = cp.body;
    expect(typeof cpBody.name).toBe('string');
    expect(cpBody.name).toMatch(/Collision \(copy( \d+)?\)$/);
    expect(cpBody.items_count).toBe(1);
  });

  it('create list with tags and verify tags persisted', async () => {
    const cl = await request(httpServer)
      .post('/book-lists')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'TaggedList',
        is_public: true,
        tags: [
          { key: 'genre', value: 'fiction' },
          { key: 'mood', value: 'relaxing' },
        ],
      })
      .expect(201);
    const listId: number = (cl.body as { id: number }).id;
    const createBody = cl.body as {
      tags?: Array<{ key: string; value: string }>;
    };
    expect(Array.isArray(createBody.tags)).toBe(true);
    expect(createBody.tags).toHaveLength(2);
    expect(createBody.tags).toContainEqual({
      key: 'genre',
      value: 'fiction',
    });

    // verify tags in GET detail
    const detail = await request(httpServer)
      .get(`/book-lists/${listId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    const detailBody = detail.body as {
      tags?: Array<{ key: string; value: string }>;
    };
    expect(Array.isArray(detailBody.tags)).toBe(true);
    expect(detailBody.tags).toHaveLength(2);
    expect(detailBody.tags).toContainEqual({
      key: 'genre',
      value: 'fiction',
    });
  });

  it('update list tags', async () => {
    // create list with initial tags
    const cl = await request(httpServer)
      .post('/book-lists')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'UpdateTagsTest',
        is_public: true,
        tags: [{ key: 'old', value: 'tag' }],
      })
      .expect(201);
    const listId: number = (cl.body as { id: number }).id;

    // update tags
    const upd = await request(httpServer)
      .patch(`/book-lists/${listId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        tags: [
          { key: 'new', value: 'tag1' },
          { key: 'new', value: 'tag2' },
        ],
      })
      .expect(200);
    const updBody = upd.body as {
      tags?: Array<{ key: string; value: string }>;
    };
    expect(Array.isArray(updBody.tags)).toBe(true);
    expect(updBody.tags).toHaveLength(2);
    expect(updBody.tags).toContainEqual({ key: 'new', value: 'tag1' });

    // verify in GET
    const detail = await request(httpServer)
      .get(`/book-lists/${listId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    const detailBody = detail.body as {
      tags?: Array<{ key: string; value: string }>;
    };
    expect(detailBody.tags).toHaveLength(2);
    expect(detailBody.tags).toContainEqual({ key: 'new', value: 'tag2' });
  });

  it('copy list copies tags', async () => {
    // owner creates a public list with tags
    const cl = await request(httpServer)
      .post('/book-lists')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'TagsCopySource',
        is_public: true,
        tags: [
          { key: 'genre', value: 'drama' },
          { key: 'region', value: 'europe' },
        ],
      })
      .expect(201);
    const srcId: number = (cl.body as { id: number }).id;

    // other user copies it
    const cp = await request(httpServer)
      .post(`/book-lists/${srcId}/copy`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(201);
    const cpBody = cp.body as {
      tags?: Array<{ key: string; value: string }>;
    };
    expect(Array.isArray(cpBody.tags)).toBe(true);
    expect(cpBody.tags).toHaveLength(2);
    expect(cpBody.tags).toContainEqual({ key: 'genre', value: 'drama' });
  });

  it('listMine returns lists with tags', async () => {
    // create a list with tags using unique name
    const name = `ListMineTagsTest-${Date.now()}-${Math.random()}`;
    const cl = await request(httpServer)
      .post('/book-lists')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name,
        is_public: false,
        tags: [{ key: 'priority', value: 'high' }],
      })
      .expect(201);
    expect((cl.body as { id?: number }).id).toBeGreaterThan(0);

    // list my lists
    const mine = await request(httpServer)
      .get('/book-lists/my')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    const mineBody = mine.body as Array<{
      name: string;
      tags?: Array<{ key: string; value: string }>;
    }>;
    expect(Array.isArray(mineBody)).toBe(true);
    const tagged = mineBody.find((l) => l.name === name);
    expect(tagged).toBeDefined();
    if (tagged) {
      expect(Array.isArray(tagged.tags)).toBe(true);
      expect(tagged.tags).toContainEqual({ key: 'priority', value: 'high' });
    }
  });
});
