import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { default as request } from 'supertest';
import { AppModule } from '../../app/app.module';
import { DataSource as DS2 } from 'typeorm';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let ds: DS2;

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

    ds = app.get(DataSource);

    await app.init();
  });

  beforeEach(async () => {
    // 清理依赖表 (先 user_permission 再 user)
    try {
      await ds.query('DELETE FROM user_permission');
    } catch {
      /* ignore if not exists */
    }
    try {
      await ds.query('DELETE FROM "user"');
    } catch {}
    // 保留 permissions（或清理）这里不清理以减少重复插入
  });

  afterAll(async () => {
    try {
      if (ds?.isInitialized) await ds.destroy();
    } catch {}
    await app.close();
  });

  describe('/auth/register (POST)', () => {
    it('should register a new user', () => {
      const createUserDto = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      };

      return request(app.getHttpServer())
        .post('/auth/register')
        .send(createUserDto)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('access_token');
          expect(res.body.user).toEqual({
            id: expect.any(Number),
            username: createUserDto.username,
            email: createUserDto.email,
          });
        });
    });

    it('should return 409 for duplicate username', async () => {
      const createUserDto = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      };

      // 第一次注册
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(createUserDto)
        .expect(201);

      // 第二次注册相同用户名
      return request(app.getHttpServer())
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
      // 先注册一个用户
      await request(app.getHttpServer()).post('/auth/register').send({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      });
    });

    it('should login with valid credentials', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          username: 'testuser',
          password: 'password123',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('access_token');
          expect(res.body.user).toEqual({
            id: expect.any(Number),
            username: 'testuser',
            email: 'test@example.com',
          });
        });
    });

    it('should return 401 for invalid credentials', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          username: 'testuser',
          password: 'wrongpassword',
        })
        .expect(401);
    });
  });

  describe('/auth/profile (GET)', () => {
    let accessToken: string;

    beforeEach(async () => {
      // 注册并登录获取token
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'password123',
        });

      accessToken = response.body.access_token;
    });

    it('should return user profile with valid token', () => {
      return request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual({
            userId: expect.any(Number),
            username: 'testuser',
          });
        });
    });

    it('should return 401 without token', () => {
      return request(app.getHttpServer()).get('/auth/profile').expect(401);
    });
  });

  describe('/auth/protected (GET)', () => {
    let accessToken: string;

    beforeEach(async () => {
      // 注册并登录获取token
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'password123',
        });

      accessToken = response.body.access_token;
    });

    it('should access protected route with valid token', () => {
      return request(app.getHttpServer())
        .get('/auth/protected')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual({
            message: 'This is a protected route',
            user: {
              userId: expect.any(Number),
              username: 'testuser',
            },
          });
        });
    });

    it('should return 401 without token', () => {
      return request(app.getHttpServer()).get('/auth/protected').expect(401);
    });
  });
});
