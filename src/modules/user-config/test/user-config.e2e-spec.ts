import { TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  createTestModule,
  parseLoginResult,
} from '../../../../test/test-module.factory';
import { parseBody } from '../../../../test/response-guards';
import { User } from '../../../entities/user.entity';
import { UserConfig } from '../../../entities/user-config.entity';

describe('UserConfig (e2e)', () => {
  let app: INestApplication;
  let httpServer: import('http').Server;
  let userRepo: Repository<User>;
  let configRepo: Repository<UserConfig>;
  let authToken: string;
  let userId: number;

  // 响应守卫：UserConfig 完整或部分字段
  interface UserConfigShape {
    id?: number;
    user?: { id: number };
    display_name?: string | null;
    theme?: string | null;
    email_notifications?: boolean;
    userId?: number; // public profile 返回 userId
    avatar_url?: string | null;
  }
  function isUserConfigShape(o: unknown): o is UserConfigShape {
    if (typeof o !== 'object' || o === null) return false;
    const r = o as Record<string, unknown>;
    if (r.id !== undefined && typeof r.id !== 'number') return false;
    if (r.user !== undefined) {
      if (typeof r.user !== 'object' || r.user === null) return false;
      const uid = (r.user as Record<string, unknown>).id;
      if (typeof uid !== 'number') return false;
    }
    if (
      r.display_name !== undefined &&
      r.display_name !== null &&
      typeof r.display_name !== 'string'
    )
      return false;
    if (
      r.theme !== undefined &&
      r.theme !== null &&
      typeof r.theme !== 'string'
    )
      return false;
    if (
      r.email_notifications !== undefined &&
      typeof r.email_notifications !== 'boolean'
    )
      return false;
    if (r.userId !== undefined && typeof r.userId !== 'number') return false;
    if (
      r.avatar_url !== undefined &&
      r.avatar_url !== null &&
      typeof r.avatar_url !== 'string'
    )
      return false;
    return true;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await createTestModule();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    httpServer = app.getHttpServer() as import('http').Server;

    userRepo = moduleFixture.get(getRepositoryToken(User));
    configRepo = moduleFixture.get(getRepositoryToken(UserConfig));

    const creds = {
      username: 'uc_user',
      email: 'uc@example.com',
      password: 'pass123456',
    };
    // 注册
    await request(httpServer).post('/auth/register').send(creds).expect(201);
    // 登录并解析
    const login = await request(httpServer)
      .post('/auth/login')
      .send({ username: creds.username, password: creds.password })
      .expect(200);
    const loginParsed = parseLoginResult(login.body);
    userId = loginParsed.user.id;
    authToken = loginParsed.access_token;
  });

  afterAll(async () => {
    try {
      await configRepo.query('DELETE FROM user_config');
      await userRepo.query('DELETE FROM "user"');
    } catch {
      /* ignore */
    }
    await app.close();
  });

  it('/user-config/me (GET) should create default config on first access', async () => {
    const res = await request(httpServer)
      .get('/user-config/me')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    const body = parseBody(res.body, isUserConfigShape);
    expect(body.id).toBeDefined();
    expect(body.user?.id).toBe(userId);
  });

  it('/user-config/me (PATCH) should update my config', async () => {
    const payload = {
      display_name: 'Tester',
      theme: 'dark',
      email_notifications: false,
    };
    const res = await request(httpServer)
      .patch('/user-config/me')
      .set('Authorization', `Bearer ${authToken}`)
      .send(payload)
      .expect(200);
    const body = parseBody(res.body, isUserConfigShape);
    expect(body.display_name).toBe('Tester');
    expect(body.theme).toBe('dark');
    expect(body.email_notifications).toBe(false);
  });

  it('/user-config/:userId/public (GET) should return public profile', async () => {
    const res = await request(httpServer)
      .get(`/user-config/${userId}/public`)
      .expect(200);
    const body = parseBody(res.body, isUserConfigShape);
    expect(body.userId).toBe(userId);
    // avatar_url 可选，存在则为 string/null
    if (body.avatar_url !== undefined && body.avatar_url !== null) {
      expect(typeof body.avatar_url).toBe('string');
    }
  });
});
