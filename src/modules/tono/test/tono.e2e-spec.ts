import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { Server } from 'http';
import { DataSource, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Readable } from 'stream';
import { join } from 'path';

import { AppModule } from '../../app/app.module';
import { FilesService } from '../../files/files.service';
import { S3_CLIENT } from '../../files/tokens';
import { registerAndLogin } from '../../../../test/test-module.factory';
import { grantPermissions } from '../../permissions/test/permissions.seed';
import { Book } from '../../../entities/book.entity';

function createInMemoryStorage() {
  const store = new Map<string, { body: Buffer; contentType: string }>();
  return {
    put: (key: string, body: Buffer, contentType: string) => {
      store.set(key, { body: Buffer.from(body), contentType });
    },
    get: (key: string) => store.get(key),
    has: (key: string) => store.has(key),
    delete: (key: string) => store.delete(key),
    keys: () => Array.from(store.keys()),
    clear: () => store.clear(),
  };
}

describe('Tono (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;
  let ds: DataSource;
  let bookRepo: Repository<Book>;

  const storage = createInMemoryStorage();

  beforeAll(async () => {
    const fakeFilesService: Pick<
      FilesService,
      | 'putObject'
      | 'getBucket'
      | 'listObjects'
      | 'deleteObjects'
      | 'deleteRecordByKey'
      | 'deleteRecordsByKeys'
      | 'ensureObjectExists'
    > = {
      putObject: jest
        .fn()
        .mockImplementation(
          async (
            key: string,
            body: Buffer,
            contentType?: string,
            _bucket?: string,
            _ownerId?: number,
          ) => {
            storage.put(
              key,
              Buffer.isBuffer(body) ? body : Buffer.from(body as any),
              contentType || 'application/octet-stream',
            );
            return key;
          },
        ),
      getBucket: jest.fn().mockReturnValue('voidlord'),
      listObjects: jest.fn().mockImplementation(async (prefix: string) => {
        return storage.keys().filter((k) => k.startsWith(prefix));
      }),
      deleteObjects: jest.fn().mockImplementation(async (keys: string[]) => {
        keys.forEach((k) => storage.delete(k));
      }),
      deleteRecordByKey: jest
        .fn()
        .mockImplementation(async (_key: string) => undefined),
      deleteRecordsByKeys: jest
        .fn()
        .mockImplementation(async (_keys: string[]) => undefined),
      ensureObjectExists: jest
        .fn()
        .mockImplementation(async (_bucket: string, key: string) =>
          storage.has(key),
        ),
    };

    const fakeS3 = {
      send: jest.fn().mockImplementation(async (command: any) => {
        const key = command?.input?.Key as string | undefined;
        if (!key) throw new Error('Missing Key');
        const obj = storage.get(key);
        if (!obj) throw new Error('NoSuchKey');
        return {
          Body: Readable.from(obj.body),
          ContentType: obj.contentType,
          ContentLength: obj.body.length,
        };
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(FilesService)
      .useValue(fakeFilesService)
      .overrideProvider(S3_CLIENT)
      .useValue(fakeS3)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );

    await app.init();
    httpServer = app.getHttpServer() as unknown as Server;

    ds = app.get(DataSource);
    bookRepo = moduleFixture.get(getRepositoryToken(Book));
  });

  beforeEach(async () => {
    storage.clear();
    try {
      await ds.query('DELETE FROM book_tags');
    } catch {
      /* ignore */
    }
    try {
      await ds.query('DELETE FROM "book"');
    } catch {
      /* ignore */
    }
    try {
      await ds.query('DELETE FROM user_permission');
    } catch {
      /* ignore */
    }
    try {
      await ds.query('DELETE FROM "user"');
    } catch {
      /* ignore */
    }
  });

  afterAll(async () => {
    try {
      if (ds?.isInitialized) await ds.destroy();
    } catch {
      /* ignore */
    }
    await app.close();
  });

  it('parses epub into tono and serves widget json', async () => {
    const creds = {
      username: 'tono_user',
      email: 'tono_user@example.com',
      password: 'password123',
    };
    const login = await registerAndLogin(app, creds);

    await grantPermissions(ds, login.user.id, {
      BOOK_UPDATE: 1,
    });

    const book = await bookRepo.save(
      bookRepo.create({
        create_by: login.user.id,
        tags: [],
        has_epub: false,
      } as unknown as Book),
    );

    const fixturePath = join(__dirname, '../../epub/test/test.epub');

    await request(httpServer)
      .post(`/epub/book/${book.id}`)
      .set('Authorization', `Bearer ${login.access_token}`)
      .attach('file', fixturePath)
      .expect(201);

    const parseRes = await request(httpServer)
      .post(`/tono/book/${book.id}/parse?force=true&async=false`)
      .set('Authorization', `Bearer ${login.access_token}`)
      .expect(201);

    const hash = parseRes.body?.hash as string;
    expect(hash).toBe(`book-${book.id}`);

    const tonoRes = await request(httpServer)
      .get(`/tono/${hash}`)
      .set('Authorization', `Bearer ${login.access_token}`)
      .expect(200);

    const xhtmls = tonoRes.body?.xhtmls as string[];
    expect(Array.isArray(xhtmls)).toBe(true);
    expect(xhtmls.length).toBeGreaterThan(0);

    const firstXhtml = xhtmls[0];
    const widgetRes = await request(httpServer)
      .get(`/tono/${hash}/widgets/${firstXhtml}`)
      .set('Authorization', `Bearer ${login.access_token}`)
      .expect(200);

    expect(widgetRes.body?._type).toBeDefined();

    const fontListRes = await request(httpServer)
      .get(`/tono/${hash}/fonts`)
      .set('Authorization', `Bearer ${login.access_token}`)
      .expect(200);

    expect(Array.isArray(fontListRes.body)).toBe(true);

    const instancesRes = await request(httpServer)
      .get(`/tono/book/${book.id}/instances`)
      .set('Authorization', `Bearer ${login.access_token}`)
      .expect(200);
    expect(Array.isArray(instancesRes.body)).toBe(true);
  });

  it('rejects parse without BOOK_UPDATE permission (403)', async () => {
    const creds = {
      username: 'tono_no_perm',
      email: 'tono_no_perm@example.com',
      password: 'password123',
    };
    const login = await registerAndLogin(app, creds);

    const book = await bookRepo.save(
      bookRepo.create({
        create_by: login.user.id,
        tags: [],
        has_epub: true,
      } as unknown as Book),
    );

    await request(httpServer)
      .post(`/tono/book/${book.id}/parse?async=false`)
      .set('Authorization', `Bearer ${login.access_token}`)
      .expect(403);
  });

  it('rejects tono endpoints without auth (401)', async () => {
    await request(httpServer).get('/tono/book-1').expect(401);
  });

  it('returns 404 for missing widget', async () => {
    const creds = {
      username: 'tono_missing_widget',
      email: 'tono_missing_widget@example.com',
      password: 'password123',
    };
    const login = await registerAndLogin(app, creds);

    await request(httpServer)
      .get('/tono/book-1/widgets/OPS/missing.xhtml')
      .set('Authorization', `Bearer ${login.access_token}`)
      .expect(404);
  });

  it('supports async parse job flow', async () => {
    const creds = {
      username: 'tono_async_user',
      email: 'tono_async_user@example.com',
      password: 'password123',
    };
    const login = await registerAndLogin(app, creds);

    await grantPermissions(ds, login.user.id, {
      BOOK_UPDATE: 1,
    });

    const book = await bookRepo.save(
      bookRepo.create({
        create_by: login.user.id,
        tags: [],
        has_epub: false,
      } as unknown as Book),
    );

    const fixturePath = join(__dirname, '../../epub/test/test.epub');

    await request(httpServer)
      .post(`/epub/book/${book.id}`)
      .set('Authorization', `Bearer ${login.access_token}`)
      .attach('file', fixturePath)
      .expect(201);

    const jobRes = await request(httpServer)
      .post(`/tono/book/${book.id}/parse?async=true&force=true&variant=alt`)
      .set('Authorization', `Bearer ${login.access_token}`)
      .expect(201);

    const jobId = jobRes.body?.jobId as string;
    expect(jobId).toBeTruthy();

    const statusRes = await request(httpServer)
      .get(`/tono/jobs/${jobId}`)
      .set('Authorization', `Bearer ${login.access_token}`)
      .expect(200);

    expect(['pending', 'running', 'done', 'error']).toContain(
      statusRes.body?.status,
    );
  });
});
