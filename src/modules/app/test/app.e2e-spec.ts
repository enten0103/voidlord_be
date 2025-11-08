import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request, { Response } from 'supertest';
import { Server } from 'http';
import { AppModule } from '../app.module';
import { parseBody } from '../../../../test/response-guards';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    httpServer = app.getHttpServer() as unknown as Server;
    await app.init();
  });

  afterAll(async () => {
    try {
      const ds = app.get(DataSource);
      if (ds?.isInitialized) await ds.destroy();
    } catch {
      // ignore destroy error
    }
    await app.close();
  });

  it('/ (GET) returns greeting', async () => {
    const res: Response = await request(httpServer).get('/').expect(200);
    expect(parseBody(res.text, (t): t is string => typeof t === 'string')).toBe(
      'Hello World!',
    );
  });
});
