import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import {
  registerAndLogin,
  LoginResult,
  parseLoginResult,
} from '../../../../test/test-module.factory';
import { expectGuard } from '../../../../test/response-guards';
import { AppModule } from '../../app/app.module';
import { DataSource as DS2 } from 'typeorm';
// parseLoginResult 不再直接在此使用，集中通过 registerAndLogin 获取结构化结果

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let ds: DS2;
  let server: import('http').Server;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );

    ds = app.get<DataSource>(DataSource);

    await app.init();
    server = app.getHttpServer() as unknown as import('http').Server;
  });

  beforeEach(async () => {
    // 清理依赖表 (先 user_permission 再 user)；捕获异常但不留下空块
    try {
      await ds.query('DELETE FROM user_permission');
    } catch {
      /* ignore if table absent */
    }
    try {
      await ds.query('DELETE FROM "user"');
    } catch {
      /* ignore if table absent */
    }
    // permissions 不清理以减少重复插入
  });

  afterAll(async () => {
    try {
      if (ds?.isInitialized) await ds.destroy();
    } catch {
      /* ignore destroy errors */
    }
    await app.close();
  });

  describe('/auth/register (POST)', () => {
    it('should register a new user', () => {
      const createUserDto = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      };

      return request(server)
        .post('/auth/register')
        .send(createUserDto)
        .expect(201)
        .expect((res) => {
          const parsed = parseLoginResult(res.body);
          expect(parsed.access_token).toEqual(expect.any(String));
          expect(parsed.user.username).toBe(createUserDto.username);
          expect(parsed.user.email).toBe(createUserDto.email);
          expect(parsed.user.id).toEqual(expect.any(Number));
        });
    });

    it('should return 409 for duplicate username', async () => {
      const createUserDto = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      };

      // 第一次注册
      await request(server)
        .post('/auth/register')
        .send(createUserDto)
        .expect(201);

      // 第二次注册相同用户名
      return request(server)
        .post('/auth/register')
        .send({
          ...createUserDto,
          email: 'different@example.com',
        })
        .expect(409);
    });
  });

  describe('/auth/login (POST)', () => {
    beforeEach(async () => {
      // 使用共享辅助函数注册 + 登录一次，便于后续重复登录测试
      await registerAndLogin(app, {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      });
    });

    it('should login with valid credentials', () => {
      return request(server)
        .post('/auth/login')
        .send({
          username: 'testuser',
          password: 'password123',
        })
        .expect(201)
        .expect((res) => {
          const parsed = parseLoginResult(res.body);
          expect(parsed.access_token).toEqual(expect.any(String));
          expect(parsed.user.username).toBe('testuser');
          expect(parsed.user.email).toBe('test@example.com');
          expect(parsed.user.id).toEqual(expect.any(Number));
        });
    });

    it('should return 401 for invalid credentials', () => {
      return request(server)
        .post('/auth/login')
        .send({
          username: 'testuser',
          password: 'wrongpassword',
        })
        .expect(401);
    });
  });

  describe('/auth/profile (GET)', () => {
    let login: LoginResult;

    beforeEach(async () => {
      login = await registerAndLogin(app, {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      });
    });

    it('should return user profile with valid token', () => {
      return request(server)
        .get('/auth/profile')
        .set('Authorization', `Bearer ${login.access_token}`)
        .expect(200)
        .expect((res) => {
          const body = res.body as unknown;
          expectGuard(body, (o): o is { id: number; username: string } => {
            if (typeof o !== 'object' || o === null) return false;
            const r = o as Record<string, unknown>;
            return typeof r.id === 'number' && typeof r.username === 'string';
          });
          expect((body as { username: string }).username).toBe('testuser');
        });
    });

    it('should return 401 without token', () => {
      return request(server).get('/auth/profile').expect(401);
    });
  });

  describe('/auth/protected (GET)', () => {
    let login: LoginResult;

    beforeEach(async () => {
      login = await registerAndLogin(app, {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      });
    });

    it('should access protected route with valid token', () => {
      return request(server)
        .get('/auth/protected')
        .set('Authorization', `Bearer ${login.access_token}`)
        .expect(200)
        .expect((res) => {
          const body = res.body as unknown;
          expectGuard(
            body,
            (
              o,
            ): o is {
              message: string;
              user: { id: number; username: string };
            } => {
              if (typeof o !== 'object' || o === null) return false;
              const r = o as Record<string, unknown>;
              if (typeof r.message !== 'string') return false;
              if (typeof r.user !== 'object' || r.user === null) return false;
              const u = r.user as Record<string, unknown>;
              return typeof u.id === 'number' && typeof u.username === 'string';
            },
          );
          expect((body as { user: { username: string } }).user.username).toBe(
            'testuser',
          );
        });
    });

    it('should return 401 without token', () => {
      return request(server).get('/auth/protected').expect(401);
    });
  });
});
