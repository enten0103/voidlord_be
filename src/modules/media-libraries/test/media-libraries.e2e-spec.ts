 
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { Server } from 'http';
import { DataSource, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppModule } from '../../app/app.module';
import { User } from '../../../entities/user.entity';
import { MediaLibrary } from '../../../entities/media-library.entity';
import { MediaLibraryItem } from '../../../entities/media-library-item.entity';
import { Book } from '../../../entities/book.entity';
import { Tag } from '../../../entities/tag.entity';
import { grantPermissions } from '../../permissions/test/permissions.seed';

// ---- Type guards & helpers ----
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
interface AuthRegisterLite {
  access_token: string;
  user: { id: number };
}
function isAuthRegisterLite(v: unknown): v is AuthRegisterLite {
  if (!isRecord(v)) return false;
  const t = v.access_token;
  const u = v.user;
  if (typeof t !== 'string') return false;
  if (!isRecord(u) || typeof u.id !== 'number') return false;
  return true;
}
interface LibraryLite {
  id: number;
  name?: string;
  items_count?: number;
  copied_from?: number;
}
function isLibraryLite(v: unknown): v is LibraryLite {
  if (!isRecord(v)) return false;
  return typeof v.id === 'number';
}
interface LibraryItemLite {
  id: number;
  bookId?: number;
  libraryId?: number;
  childLibraryId?: number;
}
function isLibraryItemLite(v: unknown): v is LibraryItemLite {
  if (!isRecord(v)) return false;
  return typeof v.id === 'number';
}
function parseBody<T>(data: unknown, guard: (d: unknown) => d is T): T {
  if (guard(data)) return data;
  throw new Error('Unexpected body shape');
}

// 分页响应类型与守卫
interface PagedResp { limit: number; offset: number; items_count: number; items: unknown[] }
function isPagedResp(v: unknown): v is PagedResp {
  return isRecord(v) &&
    typeof v.limit === 'number' &&
    typeof v.offset === 'number' &&
    typeof v.items_count === 'number' &&
    Array.isArray(v.items);
}

// ---- Test Suite ----
describe('MediaLibraries (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;
  let ds: DataSource;
  let userRepo: Repository<User>;
  let libRepo: Repository<MediaLibrary>;
  let itemRepo: Repository<MediaLibraryItem>;
  let bookRepo: Repository<Book>;
  let tagRepo: Repository<Tag>;
  let userToken: string; let userId: number;
  let otherToken: string; let otherId: number;
  let bookId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    httpServer = app.getHttpServer() as unknown as Server;
    ds = app.get(DataSource);
    userRepo = moduleFixture.get(getRepositoryToken(User));
    libRepo = moduleFixture.get(getRepositoryToken(MediaLibrary));
    itemRepo = moduleFixture.get(getRepositoryToken(MediaLibraryItem));
    bookRepo = moduleFixture.get(getRepositoryToken(Book));
    tagRepo = moduleFixture.get(getRepositoryToken(Tag));
  });

  afterAll(async () => {
    try {
      await itemRepo.query('DELETE FROM media_library_item');
      await libRepo.query('DELETE FROM media_library');
      await bookRepo.query('DELETE FROM book_tags');
      await bookRepo.query('DELETE FROM book');
      await tagRepo.query('DELETE FROM tag');
      await userRepo.query('DELETE FROM user_permission');
      await userRepo.query('DELETE FROM "user"');
    } catch {/* ignore */}
    try { if (ds?.isInitialized) await ds.destroy(); } catch {/* ignore */}
    await app.close();
  });

  beforeEach(async () => {
    // 清理表 (子表先删)
    await ds.query('DELETE FROM media_library_item').catch(()=>undefined);
    await ds.query('DELETE FROM media_library').catch(()=>undefined);
    await ds.query('DELETE FROM book_tags').catch(()=>undefined);
    await ds.query('DELETE FROM book').catch(()=>undefined);
    await ds.query('DELETE FROM tag').catch(()=>undefined);
    await ds.query('DELETE FROM user_permission').catch(()=>undefined);
    await ds.query('DELETE FROM "user"').catch(()=>undefined);

  // 注册两个用户 (应自动各生成一个系统“阅读记录”媒体库)
    const uReg = await request(httpServer).post('/auth/register').send({ username: 'ml_u', email: 'ml_u@example.com', password: 'pass1234' }).expect(201);
    const uData = parseBody(uReg.body, isAuthRegisterLite); userToken = uData.access_token; userId = uData.user.id;
    const oReg = await request(httpServer).post('/auth/register').send({ username: 'ml_o', email: 'ml_o@example.com', password: 'pass1234' }).expect(201);
    const oData = parseBody(oReg.body, isAuthRegisterLite); otherToken = oData.access_token; otherId = oData.user.id;

    // 给两个用户授予创建书籍/媒体库等所需最低权限 (若后续权限检查加严可扩展)
    await grantPermissions(ds, userId, { BOOK_CREATE: 1 });
    await grantPermissions(ds, otherId, { BOOK_CREATE: 1 });

    // 创建一本书供添加测试使用
    const bookRes = await request(httpServer)
      .post('/books')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ tags: [{ key: 'genre', value: 'SF' }] })
      .expect(201);
    bookId = parseBody(bookRes.body, (d): d is { id: number } => isRecord(d) && typeof d.id === 'number').id;
  });

  it('auto system reading library created on user registration & uniqueness per user', async () => {
    interface SysLibShape { id: number; name: string; is_system: boolean; is_public: boolean; }
    // list libraries for first user
    const list1Res = await request(httpServer)
      .get('/media-libraries/my')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    const list1Body: unknown = list1Res.body;
    expect(Array.isArray(list1Body)).toBe(true);
    const sysLibsUser = (list1Body as SysLibShape[]).filter(
      (l) => l.is_system && l.name === '系统阅读记录',
    );
    expect(sysLibsUser).toHaveLength(1);
    expect(sysLibsUser[0].is_public).toBe(false);

    // list libraries for other user
    const list2Res = await request(httpServer)
      .get('/media-libraries/my')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    const list2Body: unknown = list2Res.body;
    expect(Array.isArray(list2Body)).toBe(true);
    const sysLibsOther = (list2Body as SysLibShape[]).filter(
      (l) => l.is_system && l.name === '系统阅读记录',
    );
    expect(sysLibsOther).toHaveLength(1);
    // different owners should have different ids
    expect(sysLibsOther[0].id).not.toBe(sysLibsUser[0].id);

    // 尝试删除系统库应该被拒绝 (锁定)
    await request(httpServer)
      .delete(`/media-libraries/${sysLibsUser[0].id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('fetch reading record system library via dedicated endpoint', async () => {
    interface ReadingLibShape {
      id: number; name: string; is_system: boolean; is_public: boolean; owner_id: number | null;
    }
    const res = await request(httpServer)
      .get('/media-libraries/reading-record')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    const body: unknown = res.body;
    expect(body && typeof body === 'object').toBe(true);
    const lib = body as ReadingLibShape;
    expect(lib.name).toBe('系统阅读记录');
    expect(lib.is_system).toBe(true);
    expect(lib.is_public).toBe(false);
    expect(lib.owner_id).toBe(userId);
  });

  it('create library ok & duplicate name 409', async () => {
    const create = await request(httpServer)
      .post('/media-libraries')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'ShelfA', tags: [{ key: 'genre', value: 'SF' }] })
      .expect(201);
    const libA = parseBody(create.body, isLibraryLite);
    expect(libA.name).toBe('ShelfA');

    await request(httpServer)
      .post('/media-libraries')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'ShelfA' })
      .expect(409);
  });

  it('add book to library & forbid other user', async () => {
    const lib = await request(httpServer)
      .post('/media-libraries')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'ShelfBooks' })
      .expect(201);
    const libId = parseBody(lib.body, isLibraryLite).id;

    const addBook = await request(httpServer)
      .post(`/media-libraries/${libId}/books/${bookId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(201);
    parseBody(addBook.body, isLibraryItemLite);

    // other user cannot add
    await request(httpServer)
      .post(`/media-libraries/${libId}/books/${bookId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
  });

  it('library detail pagination returns subset with metadata', async () => {
    // 创建库并添加多本书
    const lib = await request(httpServer)
      .post('/media-libraries')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'PagedDetailLib' })
      .expect(201);
    const libId = parseBody(lib.body, isLibraryLite).id;
    // 添加 3 本书到库
    for (let i = 0; i < 3; i++) {
      const bRes = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ tags: [{ key: 'idx', value: String(i) }] })
        .expect(201);
      const bookObj = parseBody(
        bRes.body,
        (d): d is { id: number } => {
          if (typeof d !== 'object' || d === null) return false;
          return typeof (d as { id?: unknown }).id === 'number';
        },
      );
      const bId = bookObj.id;
      await request(httpServer)
        .post(`/media-libraries/${libId}/books/${bId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(201);
    }
    const pageRes = await request(httpServer)
      .get(`/media-libraries/${libId}?limit=2&offset=0`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    interface DetailPagedShape { items: any[]; items_count: number; limit: number; offset: number; }
    const body: unknown = pageRes.body;
    expect(isRecord(body)).toBe(true);
    const detail = body as DetailPagedShape;
    expect(detail.limit).toBe(2);
    expect(detail.offset).toBe(0);
    expect(detail.items_count).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(detail.items)).toBe(true);
    expect(detail.items.length).toBeLessThanOrEqual(2);
  });

  it('reading-record system library supports pagination', async () => {
    // 获取系统阅读记录库 id
    const listRes = await request(httpServer)
      .get('/media-libraries/my')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    interface LibSummary { id: number; is_system?: boolean; name?: string }
    const libsRaw: unknown = listRes.body;
    expect(Array.isArray(libsRaw)).toBe(true);
    const libs: LibSummary[] = (libsRaw as unknown[]).filter(
      (x): x is LibSummary =>
        isRecord(x) && typeof x.id === 'number',
    );
    const reading = libs.find(
      (l) => !!l.is_system && l.name === '系统阅读记录',
    );
    expect(reading).toBeDefined();
    const readingId = reading!.id;
    // 创建多本书并加入阅读记录库
    const bookIds: number[] = [];
    for (let i = 0; i < 5; i++) {
      const bRes = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ tags: [{ key: 'rr', value: String(i) }] })
        .expect(201);
      const bId = parseBody(
        bRes.body,
        (d): d is { id: number } => isRecord(d) && typeof d.id === 'number',
      ).id;
      bookIds.push(bId);
      await request(httpServer)
        .post(`/media-libraries/${readingId}/books/${bId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(201);
    }
    // 分页获取 limit=2 offset=0
    const page0 = await request(httpServer)
      .get(`/media-libraries/reading-record?limit=2&offset=0`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
  const p0Raw: unknown = page0.body;
  const p0Body = parseBody(p0Raw, isPagedResp);
  expect(p0Body.limit).toBe(2);
  expect(p0Body.offset).toBe(0);
  expect(p0Body.items_count).toBeGreaterThanOrEqual(5);
  expect(Array.isArray(p0Body.items)).toBe(true);
  expect(p0Body.items.length).toBeLessThanOrEqual(2);
    // 分页获取第二页 offset=2
    const page1 = await request(httpServer)
      .get(`/media-libraries/reading-record?limit=2&offset=2`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    const p1Raw: unknown = page1.body;
    const p1Body = parseBody(p1Raw, isPagedResp);
    expect(p1Body.limit).toBe(2);
    expect(p1Body.offset).toBe(2);
    expect(Array.isArray(p1Body.items)).toBe(true);
  });

  it('virtual uploaded library supports pagination', async () => {
    // 创建多本书（已有一本文档中 bookId，可再创建 4 本）
    for (let i = 0; i < 4; i++) {
      await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ tags: [{ key: 'vu', value: String(i) }] })
        .expect(201);
    }
    // 获取全部书籍数量
    const myBooksRes = await request(httpServer)
      .get('/books/my')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
  const totalBooks = Array.isArray(myBooksRes.body) ? myBooksRes.body.length : 0;
    // 分页获取虚拟库
    const vPage = await request(httpServer)
      .get('/media-libraries/virtual/my-uploaded?limit=3&offset=1')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    const vRaw: unknown = vPage.body;
    const vBody = parseBody(vRaw, isPagedResp);
    expect(vBody.limit).toBe(3);
    expect(vBody.offset).toBe(1);
    expect(vBody.items_count).toBe(totalBooks);
    expect(vBody.items.length).toBeLessThanOrEqual(3);
  });

  it('nest child library & prevent duplicate nesting', async () => {
    const parent = await request(httpServer)
      .post('/media-libraries')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'ParentLib' })
      .expect(201);
    const parentId = parseBody(parent.body, isLibraryLite).id;
    const child = await request(httpServer)
      .post('/media-libraries')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'ChildLib' })
      .expect(201);
    const childId = parseBody(child.body, isLibraryLite).id;

    await request(httpServer)
      .post(`/media-libraries/${parentId}/libraries/${childId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(201);

    // second time should 409
    await request(httpServer)
      .post(`/media-libraries/${parentId}/libraries/${childId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(409);
  });

  it('copy library name disambiguation', async () => {
    // create public library with book
    const lib = await request(httpServer)
      .post('/media-libraries')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'CopyBase', is_public: true })
      .expect(201);
    const libId = parseBody(lib.body, isLibraryLite).id;
    await request(httpServer)
      .post(`/media-libraries/${libId}/books/${bookId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(201);

    // other user copies it
    const copy1 = await request(httpServer)
      .post(`/media-libraries/${libId}/copy`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(201);
  const c1 = parseBody(copy1.body, isLibraryLite);
  expect(typeof c1.name).toBe('string');
  expect((c1.name ?? '').startsWith('CopyBase')).toBe(true);

    // copy again should produce another unique name
    const copy2 = await request(httpServer)
      .post(`/media-libraries/${libId}/copy`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(201);
  const c2 = parseBody(copy2.body, isLibraryLite);
  expect(typeof c2.name).toBe('string');
  expect((c2.name ?? '').startsWith('CopyBase')).toBe(true);
  expect(c1.name).not.toBe(c2.name);
  });

  it('private library cannot be copied by other user (403)', async () => {
    const priv = await request(httpServer)
      .post('/media-libraries')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'PrivLib', is_public: false })
      .expect(201);
    const privId = parseBody(priv.body, isLibraryLite).id;
    await request(httpServer)
      .post(`/media-libraries/${privId}/copy`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
  });

  it('virtual uploaded library returns all my books', async () => {
    // create more books for user
    const b2 = await request(httpServer)
      .post('/books')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ tags: [{ key: 'genre', value: 'Fantasy' }] })
      .expect(201);
    parseBody(b2.body, (d): d is { id: number } => isRecord(d) && typeof d.id === 'number');
    const b3 = await request(httpServer)
      .post('/books')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ tags: [{ key: 'author', value: 'AuthorX' }] })
      .expect(201);
    parseBody(b3.body, (d): d is { id: number } => isRecord(d) && typeof d.id === 'number');

    // fetch /books/my to compare count
    const myBooksRes = await request(httpServer)
      .get('/books/my')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    const myBooks: unknown = myBooksRes.body;
    expect(Array.isArray(myBooks)).toBe(true);
    const myCount = (myBooks as any[]).length;

    const virtualRes = await request(httpServer)
      .get('/media-libraries/virtual/my-uploaded')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    interface VirtualShape {
      is_virtual: boolean;
      items_count: number;
      items: { book?: { id: number } | null }[];
    }
    const virtualBody: unknown = virtualRes.body;
    expect(typeof virtualBody).toBe('object');
    const v = virtualBody as VirtualShape;
    expect(v.is_virtual).toBe(true);
    expect(v.items_count).toBe(myCount);
    expect(Array.isArray(v.items)).toBe(true);
    if (myCount && v.items[0].book) {
      expect(typeof v.items[0].book.id).toBe('number');
    }
  });
});
