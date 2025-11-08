import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Server } from 'http';
import { Repository, DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../app/app.module';
import { User } from '../../../entities/user.entity';
import { FavoriteList } from '../../../entities/favorite-list.entity';
import { RecommendationSection } from '../../../entities/recommendation-section.entity';
import { RecommendationItem } from '../../../entities/recommendation-item.entity';
import { grantPermissions } from '../../permissions/test/permissions.seed';
import { parseBody, isArrayOf } from '../../../../test/response-guards';

// 基础 record 判定
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
// 简单认证注册响应守卫
function isAuthRegister(val: unknown): val is {
  access_token: string;
  user: { id: number };
} {
  if (!isRecord(val)) return false;
  const access = val.access_token;
  const user = val.user;
  if (typeof access !== 'string') return false;
  if (!isRecord(user)) return false;
  return typeof user.id === 'number';
}

interface RecommendationItemLite {
  id?: number;
  list?: { id?: number };
}
interface RecommendationSectionLite {
  id?: number;
  key?: string;
  title?: string;
  active?: boolean;
  items?: RecommendationItemLite[];
}

function isRecommendationItemLite(o: unknown): o is RecommendationItemLite {
  if (!isRecord(o)) return false;
  const id = o.id;
  if (id !== undefined && typeof id !== 'number') return false;
  const list = (o as { list?: unknown }).list;
  if (list !== undefined) {
    if (!isRecord(list)) return false;
    const lid = (list as { id?: unknown }).id;
    if (lid !== undefined && typeof lid !== 'number') return false;
  }
  return true;
}
function isRecommendationSectionLite(
  o: unknown,
): o is RecommendationSectionLite {
  if (!isRecord(o)) return false;
  const rec = o;
  if (rec.id !== undefined && typeof rec.id !== 'number') return false;
  if (rec.key !== undefined && typeof rec.key !== 'string') return false;
  if (rec.title !== undefined && typeof rec.title !== 'string') return false;
  if (rec.active !== undefined && typeof rec.active !== 'boolean') return false;
  if (rec.items !== undefined) {
    if (!Array.isArray(rec.items)) return false;
    if (!rec.items.every((it: unknown) => isRecommendationItemLite(it)))
      return false;
  }
  return true;
}

// 集成测试使用 AppModule（含全部模块）
describe('Recommendations (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;
  let userRepo: Repository<User>;
  let listRepo: Repository<FavoriteList>;
  let sectionRepo: Repository<RecommendationSection>;
  let itemRepo: Repository<RecommendationItem>;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    httpServer = app.getHttpServer() as unknown as Server;

    userRepo = moduleFixture.get(getRepositoryToken(User));
    listRepo = moduleFixture.get(getRepositoryToken(FavoriteList));
    sectionRepo = moduleFixture.get(getRepositoryToken(RecommendationSection));
    itemRepo = moduleFixture.get(getRepositoryToken(RecommendationItem));
  });

  afterAll(async () => {
    try {
      await itemRepo.query('DELETE FROM recommendation_items');
      await sectionRepo.query('DELETE FROM recommendation_sections');
      await listRepo.query('DELETE FROM favorite_list_item');
      await listRepo.query('DELETE FROM favorite_list');
      await userRepo.query('DELETE FROM "user"');
    } catch {
      // ignore cleanup errors
    }
    try {
      const ds = app.get(DataSource);
      if (ds?.isInitialized) await ds.destroy();
    } catch {
      // ignore destroy errors
    }
    await app.close();
  });

  beforeEach(async () => {
    // 清理顺序：子表 -> 主表，避免外键错误
    const ds = app.get(DataSource);
    try {
      await ds.query('DELETE FROM recommendation_items');
    } catch {
      // ignore
    }
    try {
      await ds.query('DELETE FROM recommendation_sections');
    } catch {
      // ignore
    }
    // 清理书单
    try {
      await ds.query('DELETE FROM favorite_list_item');
    } catch {
      // ignore
    }
    try {
      await ds.query('DELETE FROM favorite_list');
    } catch {
      // ignore
    }
    try {
      await ds.query('DELETE FROM user_permission');
    } catch {
      // ignore
    }
    try {
      await ds.query('DELETE FROM "user"');
    } catch {
      // ignore
    }

    // 创建 admin & 普通用户
    const adminRes = await request(httpServer).post('/auth/register').send({
      username: 'admin',
      email: 'admin@example.com',
      password: 'password123',
    });
    const adminData = parseBody(adminRes.body, isAuthRegister);
    adminToken = adminData.access_token;
    const adminId = adminData.user.id;

    const userRes = await request(httpServer).post('/auth/register').send({
      username: 'normal',
      email: 'normal@example.com',
      password: 'password123',
    });
    userToken = parseBody(userRes.body, isAuthRegister).access_token;

    // 授予 admin 推荐管理权限（书单接口仅需登录）
    await grantPermissions(ds, adminId, {
      RECOMMENDATION_MANAGE: 1,
    });
    // 创建两份书单
    const l1 = await request(httpServer)
      .post('/book-lists')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'List1', description: 'd1', is_public: true });
    expect([200, 201]).toContain(l1.status);
    const l2 = await request(httpServer)
      .post('/book-lists')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'List2', description: 'd2', is_public: true });
    expect([200, 201]).toContain(l2.status);
  });

  it('admin can create section & add item & list public', async () => {
    const createSec = await request(httpServer)
      .post('/recommendations/sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'today_hot', title: '今日最热' });
    expect(createSec.status).toBe(201);
    const sectionId = parseBody(
      createSec.body,
      isRecommendationSectionLite,
    ).id!;

    // 使用创建书单返回的真实 ID
    const lists = await listRepo.find();
    const firstListId = lists[0].id;
    const addItem = await request(httpServer)
      .post(`/recommendations/sections/${sectionId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ bookListId: firstListId });
    expect(addItem.status).toBe(201);

    const pub = await request(httpServer).get('/recommendations/public');
    expect(pub.status).toBe(200);
    const sections = parseBody(
      pub.body,
      isArrayOf(isRecommendationSectionLite),
    );
    expect(sections[0].items?.length).toBe(1);
  });

  it('normal user forbidden to create section', async () => {
    const res = await request(httpServer)
      .post('/recommendations/sections')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ key: 'today_hot', title: '今日最热' });
    expect(res.status).toBe(403);
  });

  // 旧的 seedPermissions 函数已被统一的 grantPermissions helper 取代

  it('cannot add duplicate booklist in section', async () => {
    const createSec = await request(httpServer)
      .post('/recommendations/sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'today_hot', title: '今日最热' });
    const sectionId = parseBody(
      createSec.body,
      isRecommendationSectionLite,
    ).id!;
    const lists = await listRepo.find();
    const firstListId = lists[0].id;
    await request(httpServer)
      .post(`/recommendations/sections/${sectionId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ bookListId: firstListId })
      .expect(201);

    await request(httpServer)
      .post(`/recommendations/sections/${sectionId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ bookListId: firstListId })
      .expect(409);
  });

  it('reorder items', async () => {
    const sec = await request(httpServer)
      .post('/recommendations/sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'sec1', title: 'Sec1' });
    const secId = parseBody(sec.body, isRecommendationSectionLite).id!;

    const lists = await listRepo.find({ order: { id: 'ASC' } });
    await request(httpServer)
      .post(`/recommendations/sections/${secId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ bookListId: lists[0].id });

    await request(httpServer)
      .post(`/recommendations/sections/${secId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ bookListId: lists[1].id });

    // 拉取 section 详情获取真实 item id 顺序
    const detail = await request(httpServer)
      .get(`/recommendations/sections/${secId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.status).toBe(200);
    const detailSection = parseBody(detail.body, isRecommendationSectionLite);
    const itemIds = (detailSection.items || []).map((i) => i.id!);
    expect(itemIds.length).toBe(2);
    const reversed = [...itemIds].reverse();
    const reorder = await request(httpServer)
      .patch(`/recommendations/sections/${secId}/items/reorder`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ itemIds: reversed });
    expect([200, 201, 204]).toContain(reorder.status);
  });

  it('disabled section not visible in public', async () => {
    const createSec = await request(httpServer)
      .post('/recommendations/sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'temp_sec', title: 'Temp' });
    const secId = parseBody(createSec.body, isRecommendationSectionLite).id!;
    // 设为 inactive
    await request(httpServer)
      .patch(`/recommendations/sections/${secId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ active: false });
    const pub = await request(httpServer).get('/recommendations/public');
    const sections = parseBody(
      pub.body,
      isArrayOf(isRecommendationSectionLite),
    );
    expect(sections.find((s) => s.id === secId)).toBeUndefined();
  });

  it('delete item removes it from public', async () => {
    const createSec = await request(httpServer)
      .post('/recommendations/sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'del_sec', title: 'DelSec' });
    const secId = parseBody(createSec.body, isRecommendationSectionLite).id!;
    const lists = await listRepo.find({ order: { id: 'ASC' } });
    await request(httpServer)
      .post(`/recommendations/sections/${secId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ bookListId: lists[0].id });
    const detail = await request(httpServer)
      .get(`/recommendations/sections/${secId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    const detailSection = parseBody(detail.body, isRecommendationSectionLite);
    if (!detailSection.items || detailSection.items.length === 0) {
      throw new Error('expected items');
    }
    const first = detailSection.items[0];
    if (!first.id) throw new Error('expected item id');
    const itemId = first.id;
    await request(httpServer)
      .delete(`/recommendations/sections/${secId}/items/${itemId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const pub = await request(httpServer).get('/recommendations/public');
    const sections = parseBody(
      pub.body,
      isArrayOf(isRecommendationSectionLite),
    );
    const sec = sections.find((s) => s.id === secId);
    if (!sec) throw new Error('expected section');
    expect((sec.items || []).length).toBe(0);
  });
});
