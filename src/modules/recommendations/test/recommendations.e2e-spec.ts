import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Server } from 'http';
import { Repository, DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../app/app.module';
import { User } from '../../../entities/user.entity';
import { MediaLibrary } from '../../../entities/media-library.entity';
import { RecommendationSection } from '../../../entities/recommendation-section.entity';
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

interface RecommendationSectionLite {
  id?: number;
  key?: string;
  title?: string;
  active?: boolean;
  library?: { id?: number; name?: string };
}
function isRecommendationSectionLite(
  o: unknown,
): o is RecommendationSectionLite {
  if (!isRecord(o)) return false;
  if (o['id'] !== undefined && typeof o['id'] !== 'number') return false;
  if (o['key'] !== undefined && typeof o['key'] !== 'string') return false;
  if (o['title'] !== undefined && typeof o['title'] !== 'string') return false;
  if (o['active'] !== undefined && typeof o['active'] !== 'boolean')
    return false;
  const lib = (o as { library?: unknown }).library;
  if (lib !== undefined) {
    if (!isRecord(lib)) return false;
    const lid = (lib as { id?: unknown }).id;
    if (lid !== undefined && typeof lid !== 'number') return false;
  }
  return true;
}

// 集成测试使用 AppModule（含全部模块）
describe('Recommendations (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;
  let userRepo: Repository<User>;
  let libraryRepo: Repository<MediaLibrary>;
  let sectionRepo: Repository<RecommendationSection>;
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
    libraryRepo = moduleFixture.get(getRepositoryToken(MediaLibrary));
    sectionRepo = moduleFixture.get(getRepositoryToken(RecommendationSection));
  });

  afterAll(async () => {
    try {
      await sectionRepo.query('DELETE FROM recommendation_sections');
      await libraryRepo.query('DELETE FROM media_library_item');
      await libraryRepo.query('DELETE FROM media_library');
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
      await ds.query('DELETE FROM recommendation_sections');
    } catch {
      // ignore
    }
    // 清理书单
    try {
      await ds.query('DELETE FROM media_library_item');
    } catch {
      /* ignore */
    }
    try {
      await ds.query('DELETE FROM media_library');
    } catch {
      /* ignore */
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

    // 授予 admin 推荐管理权限
    await grantPermissions(ds, adminId, {
      RECOMMENDATION_MANAGE: 1,
    });
    // 创建两个公共媒体库供推荐使用
    const ml1 = await request(httpServer)
      .post('/media-libraries')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Lib1', is_public: true });
    expect(ml1.status).toBe(201);
    // 媒体库响应结构与推荐 Section 不同，这里无需 parseBody 直接忽略 id 解析
    const ml2 = await request(httpServer)
      .post('/media-libraries')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Lib2', is_public: true });
    expect(ml2.status).toBe(201);
    // 第二、第三库同理
    const ml3 = await request(httpServer)
      .post('/media-libraries')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Lib3', is_public: true });
    expect(ml3.status).toBe(201);
    // libId3 未直接使用，更新条目使用查询结果避免类型问题
  });

  it('admin can create section (single library) & list', async () => {
    const libs = await libraryRepo.find({
      where: { is_public: true },
      order: { id: 'ASC' },
    });
    const createSec = await request(httpServer)
      .post('/recommendations/sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        key: 'today_hot',
        title: '今日最热',
        mediaLibraryId: libs[0].id,
      });
    expect(createSec.status).toBe(201);
    const section = parseBody(createSec.body, isRecommendationSectionLite);
    expect(section.library?.id).toBe(libs[0].id);
    const list = await request(httpServer)
      .get('/recommendations/sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const sections = parseBody(
      list.body,
      isArrayOf(isRecommendationSectionLite),
    );
    expect(sections.find((s) => s.id === section.id)).toBeDefined();
  });

  it('update section library', async () => {
    // create section
    let allLibs = await libraryRepo.find({
      where: { is_public: true },
      order: { id: 'ASC' },
    });
    if (allLibs.length < 2) {
      const extra = await request(httpServer)
        .post('/media-libraries')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'AutoLibX', is_public: true });
      expect(extra.status).toBe(201);
      allLibs = await libraryRepo.find({
        where: { is_public: true },
        order: { id: 'ASC' },
      });
    }
    const createSec = await request(httpServer)
      .post('/recommendations/sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        key: 'editor_pick',
        title: '编辑精选',
        mediaLibraryId: allLibs[0].id,
      })
      .expect(201);
    const sectionId = parseBody(
      createSec.body,
      isRecommendationSectionLite,
    ).id!;
    const libB = allLibs[1].id; // 第二个库作为更新目标
    const updateRes = await request(httpServer)
      .patch(`/recommendations/sections/${sectionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ mediaLibraryId: libB })
      .expect(200);
    const updated = parseBody(updateRes.body, isRecommendationSectionLite);
    expect(updated.library?.id).toBe(libB);
  });

  it('normal user forbidden to create section', async () => {
    const res = await request(httpServer)
      .post('/recommendations/sections')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ key: 'today_hot', title: '今日最热' });
    expect(res.status).toBe(403);
  });

  // 旧的 seedPermissions 函数已被统一的 grantPermissions helper 取代

  it('cannot create section with duplicate key', async () => {
    const libs = await libraryRepo.find({
      where: { is_public: true },
      order: { id: 'ASC' },
    });
    const first = await request(httpServer)
      .post('/recommendations/sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'dup_key', title: 'Dup1', mediaLibraryId: libs[0].id });
    expect(first.status).toBe(201);
    const second = await request(httpServer)
      .post('/recommendations/sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'dup_key', title: 'Dup2', mediaLibraryId: libs[1].id });
    expect(second.status).toBe(409);
  });

  it('batch reorder sections', async () => {
    const libs = await libraryRepo.find({
      where: { is_public: true },
      order: { id: 'ASC' },
    });
    const s1 = await request(httpServer)
      .post('/recommendations/sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'sec1', title: 'Sec1', mediaLibraryId: libs[0].id });
    const id1 = parseBody(s1.body, isRecommendationSectionLite).id!;
    const s2 = await request(httpServer)
      .post('/recommendations/sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'sec2', title: 'Sec2', mediaLibraryId: libs[1].id });
    const id2 = parseBody(s2.body, isRecommendationSectionLite).id!;
    const s3 = await request(httpServer)
      .post('/recommendations/sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'sec3', title: 'Sec3', mediaLibraryId: libs[2].id });
    const id3 = parseBody(s3.body, isRecommendationSectionLite).id!;
    const reversed = [id3, id2, id1];
    const patch = await request(httpServer)
      .patch(`/recommendations/sections/${id1}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sectionOrder: reversed });
    expect(patch.status).toBe(200);
    const list = await request(httpServer)
      .get('/recommendations/sections?all=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const after = parseBody(list.body, isArrayOf(isRecommendationSectionLite));
    const idOrder = after.map((s) => s.id);
    expect(idOrder.slice(0, 3)).toEqual(reversed);
  });

  it('inactive section hidden unless all=true', async () => {
    const libs = await libraryRepo.find({
      where: { is_public: true },
      order: { id: 'ASC' },
    });
    const createSec = await request(httpServer)
      .post('/recommendations/sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'temp_sec', title: 'Temp', mediaLibraryId: libs[0].id });
    const secId = parseBody(createSec.body, isRecommendationSectionLite).id!;
    await request(httpServer)
      .patch(`/recommendations/sections/${secId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ active: false })
      .expect(200);
    const listActive = await request(httpServer)
      .get('/recommendations/sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const arrA = parseBody(
      listActive.body,
      isArrayOf(isRecommendationSectionLite),
    );
    expect(arrA.find((s) => s.id === secId)).toBeUndefined();
    const listAll = await request(httpServer)
      .get('/recommendations/sections?all=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const arrB = parseBody(
      listAll.body,
      isArrayOf(isRecommendationSectionLite),
    );
    expect(arrB.find((s) => s.id === secId)).toBeDefined();
  });

  it('delete section removes it from list', async () => {
    const libs = await libraryRepo.find({
      where: { is_public: true },
      order: { id: 'ASC' },
    });
    const createSec = await request(httpServer)
      .post('/recommendations/sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'del_sec', title: 'DelSec', mediaLibraryId: libs[0].id });
    const secId = parseBody(createSec.body, isRecommendationSectionLite).id!;
    await request(httpServer)
      .delete(`/recommendations/sections/${secId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const list = await request(httpServer)
      .get('/recommendations/sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const sections = parseBody(
      list.body,
      isArrayOf(isRecommendationSectionLite),
    );
    expect(sections.find((s) => s.id === secId)).toBeUndefined();
  });
});
