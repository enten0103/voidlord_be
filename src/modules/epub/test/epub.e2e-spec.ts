import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { Server } from 'http';
import { DataSource, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Readable } from 'stream';
import { readFileSync } from 'fs';
import { join } from 'path';

import { AppModule } from '../../app/app.module';
import { FilesService } from '../../files/files.service';
import { S3_CLIENT } from '../../files/tokens';
import { registerAndLogin } from '../../../../test/test-module.factory';
import { grantPermissions } from '../../permissions/test/permissions.seed';
import { Book } from '../../../entities/book.entity';

// In-memory fake object store for e2e (no MinIO dependency)
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

describe('Epub (e2e)', () => {
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
    };

    const fakeS3 = {
      send: jest.fn().mockImplementation(async (command: any) => {
        // GetObjectCommand has input.Key
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
    // keep permission/permission rows to reduce churn; clean user + related
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

  it('uploads test.epub then serves extracted container.xml via /epub/book/:id/*path', async () => {
    const creds = {
      username: 'epub_user',
      email: 'epub_user@example.com',
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

    const fixturePath = join(__dirname, 'test.epub');

    await request(httpServer)
      .post(`/epub/book/${book.id}`)
      .set('Authorization', `Bearer ${login.access_token}`)
      .attach('file', fixturePath)
      .expect(201);

    // ensure upload wrote something into storage
    expect(storage.has(`books/${book.id}/epub/mimetype`)).toBe(true);
    expect(storage.has(`books/${book.id}/epub/META-INF/container.xml`)).toBe(
      true,
    );

    const res = await request(httpServer)
      .get(`/epub/book/${book.id}/META-INF/container.xml`)
      .set('Authorization', `Bearer ${login.access_token}`)
      .expect(200);

    // supertest: text response is in res.text; fallback to buffer if needed
    const text =
      res.text || (Buffer.isBuffer(res.body) ? res.body.toString('utf-8') : '');
    expect(text).toContain('container');
  });

  it('returns 404 when requesting a missing extracted file', async () => {
    const creds = {
      username: 'epub_user2',
      email: 'epub_user2@example.com',
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
        has_epub: true,
      } as unknown as Book),
    );

    await request(httpServer)
      .get(`/epub/book/${book.id}/OPS/definitely-missing.xhtml`)
      .set('Authorization', `Bearer ${login.access_token}`)
      .expect(404);
  });

  it('real fixture sanity: test.epub is a valid zip and contains container.xml', () => {
    const fixturePath = join(__dirname, 'test.epub');
    const buf = readFileSync(fixturePath);
    // quick signature check: PK\x03\x04
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });

  it('deletes epub files and resets has_epub flag', async () => {
    const creds = {
      username: 'epub_delete_user',
      email: 'epub_delete@example.com',
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

    const fixturePath = join(__dirname, 'test.epub');

    // Upload first
    await request(httpServer)
      .post(`/epub/book/${book.id}`)
      .set('Authorization', `Bearer ${login.access_token}`)
      .attach('file', fixturePath)
      .expect(201);

    expect(storage.keys().length).toBeGreaterThan(0);
    const containerPath = 'META-INF/container.xml';
    await request(httpServer)
      .get(`/epub/book/${book.id}/${containerPath}`)
      .set('Authorization', `Bearer ${login.access_token}`)
      .expect(200);

    // Delete
    await request(httpServer)
      .delete(`/epub/book/${book.id}`)
      .set('Authorization', `Bearer ${login.access_token}`)
      .expect(200);

    // Verify all keys removed
    const keysAfter = storage
      .keys()
      .filter((k) => k.startsWith(`books/${book.id}/epub/`)).length;
    expect(keysAfter).toBe(0);

    // Verify book flag updated
    const updatedBook = await bookRepo.findOne({ where: { id: book.id } });
    expect(updatedBook?.has_epub).toBe(false);

    // After delete, file should not be accessible
    await request(httpServer)
      .get(`/epub/book/${book.id}/${containerPath}`)
      .set('Authorization', `Bearer ${login.access_token}`)
      .expect(404);
  });

  it('denies delete without BOOK_UPDATE permission (403)', async () => {
    const creds = {
      username: 'epub_delete_no_perm',
      email: 'epub_delete_no_perm@example.com',
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
      .delete(`/epub/book/${book.id}`)
      .set('Authorization', `Bearer ${login.access_token}`)
      .expect(403);
  });

  it('returns 400 when deleting a book without epub', async () => {
    const creds = {
      username: 'epub_delete_no_epub',
      email: 'epub_delete_no_epub@example.com',
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

    await request(httpServer)
      .delete(`/epub/book/${book.id}`)
      .set('Authorization', `Bearer ${login.access_token}`)
      .expect(400);
  });

  it('returns 404 when deleting a non-existent book', async () => {
    const creds = {
      username: 'epub_delete_missing_book',
      email: 'epub_delete_missing_book@example.com',
      password: 'password123',
    };
    const login = await registerAndLogin(app, creds);

    await grantPermissions(ds, login.user.id, {
      BOOK_UPDATE: 1,
    });

    await request(httpServer)
      .delete('/epub/book/999999')
      .set('Authorization', `Bearer ${login.access_token}`)
      .expect(404);
  });
});
