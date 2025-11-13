 
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
