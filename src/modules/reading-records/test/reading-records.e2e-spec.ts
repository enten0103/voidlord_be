import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import request, { Response } from 'supertest';
import { Server } from 'http';
import {
  createTestModule,
  parseLoginResult,
} from '../../../../test/test-module.factory';
import {
  parseBody,
  isIdObject,
  isArrayOf,
} from '../../../../test/response-guards';
import { DataSource } from 'typeorm';
import { grantPermissions } from '../../permissions/test/permissions.seed';

describe('Reading Records (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let userId: number;
  let bookId: number;
  let httpServer: Server;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await createTestModule();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    ds = moduleFixture.get(DataSource);
    httpServer = app.getHttpServer() as unknown as Server;

    // register user
    // 注册并登录，使用类型安全的解析
    await request(httpServer)
      .post('/auth/register')
      .send({
        username: 'reader1',
        email: 'r1@example.com',
        password: 'p@ssw0rd!',
      })
      .expect(201);
    const login: Response = await request(httpServer)
      .post('/auth/login')
      .send({ username: 'reader1', password: 'p@ssw0rd!' })
      .expect(200);
    const loginParsed = parseLoginResult(login.body);
    userId = loginParsed.user.id;
    token = loginParsed.access_token;

    // grant permission to create book and then create a book to attach record
    await grantPermissions(ds, userId, { BOOK_CREATE: 1 });
    const bookRes: Response = await request(httpServer)
      .post('/books')
      .set('Authorization', `Bearer ${token}`)
      .send({ hash: 'read-rec-h1', title: 'Record Book' })
      .expect(201);
    bookId = parseBody(bookRes.body, isIdObject).id;
  });

  afterAll(async () => {
    try {
      await app.close();
    } catch {
      // ignore close error
    }
  });

  it('upsert and get record, stats, list and delete', async () => {
    // create record
    const createRes: Response = await request(httpServer)
      .post('/reading-records')
      .set('Authorization', `Bearer ${token}`)
      .send({ bookId, progress: 10, minutes_increment: 5 })
      .expect(201);
    const createdRecord = parseBody(createRes.body, isRecord);
    const recordId = createdRecord.id;
    expect(createdRecord.progress).toBe(10);
    expect(createdRecord.total_minutes).toBe(5);

    // update progress and finish book
    const updateRes: Response = await request(httpServer)
      .post('/reading-records')
      .set('Authorization', `Bearer ${token}`)
      .send({
        bookId,
        progress: 100,
        status: 'finished',
        minutes_increment: 30,
      })
      .expect(201);
    const updatedRecord = parseBody(updateRes.body, isRecord);
    expect(updatedRecord.progress).toBe(100);
    expect(updatedRecord.finished_at).toBeTruthy();
    expect(updatedRecord.total_minutes).toBe(35);

    // get by book
    const oneRes: Response = await request(httpServer)
      .get(`/reading-records/book/${bookId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const fetched = parseBody(oneRes.body, isRecord);
    expect(fetched.progress).toBe(100);

    // list
    const listRes: Response = await request(httpServer)
      .get('/reading-records/my')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const list = parseBody(listRes.body, isArrayOf(isRecord));
    expect(list.length).toBeGreaterThanOrEqual(1);

    // stats
    const statsRes: Response = await request(httpServer)
      .get('/reading-records/stats/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const stats = parseBody(statsRes.body, (o): o is { finished: number } => {
      if (typeof o !== 'object' || o === null) return false;
      return typeof (o as Record<string, unknown>).finished === 'number';
    });
    expect(stats.finished).toBeGreaterThanOrEqual(1);

    // delete
    await request(httpServer)
      .delete(`/reading-records/${recordId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  // --- type guards & helpers ---
  // 与服务返回结构对齐的响应类型（最小子集用于断言）
  interface ReadingRecordShape {
    id: number;
    bookId: number | undefined;
    progress: number;
    total_minutes: number;
    finished_at: string | null;
  }

  function isRecord(o: unknown): o is ReadingRecordShape {
    if (typeof o !== 'object' || o === null) return false;
    const r = o as Record<string, unknown>;
    return (
      typeof r.id === 'number' &&
      (typeof r.bookId === 'number' || r.bookId === undefined) &&
      typeof r.progress === 'number' &&
      typeof r.total_minutes === 'number' &&
      (typeof r.finished_at === 'string' || r.finished_at === null)
    );
  }

  // 其余通用守卫 parseBody/isIdObject/isArrayOf 来自公共测试工具
});
