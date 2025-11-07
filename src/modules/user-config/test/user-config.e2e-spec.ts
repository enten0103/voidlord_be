import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createTestModule } from '../../../../test/test-module.factory';
import { User } from '../../../entities/user.entity';
import { UserConfig } from '../../../entities/user-config.entity';

describe('UserConfig (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let configRepo: Repository<UserConfig>;
  let authToken: string;
  let userId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await createTestModule();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    userRepo = moduleFixture.get(getRepositoryToken(User));
    configRepo = moduleFixture.get(getRepositoryToken(UserConfig));

    const testUser = {
      username: 'uc_user',
      email: 'uc@example.com',
      password: 'pass123456',
    };
    const reg = await request(app.getHttpServer())
      .post('/auth/register')
      .send(testUser)
      .expect(201);
    userId = reg.body.user.id;
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: testUser.username, password: testUser.password })
      .expect(201);
    authToken = login.body.access_token;
  });

  afterAll(async () => {
    try {
      await configRepo.query('DELETE FROM user_config');
      await userRepo.query('DELETE FROM "user"');
    } catch {}
    await app.close();
  });

  it('/user-config/me (GET) should create default config on first access', async () => {
    const res = await request(app.getHttpServer())
      .get('/user-config/me')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(res.body.id).toBeDefined();
    expect(res.body.user.id).toBe(userId);
  });

  it('/user-config/me (PATCH) should update my config', async () => {
    const payload = {
      display_name: 'Tester',
      theme: 'dark',
      email_notifications: false,
    };
    const res = await request(app.getHttpServer())
      .patch('/user-config/me')
      .set('Authorization', `Bearer ${authToken}`)
      .send(payload)
      .expect(200);
    expect(res.body.display_name).toBe('Tester');
    expect(res.body.theme).toBe('dark');
    expect(res.body.email_notifications).toBe(false);
  });

  it('/user-config/:userId/public (GET) should return public profile', async () => {
    const res = await request(app.getHttpServer())
      .get(`/user-config/${userId}/public`)
      .expect(200);
    expect(res.body.userId).toBe(userId);
    expect(res.body).toHaveProperty('avatar_url');
  });
});
