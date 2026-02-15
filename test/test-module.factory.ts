import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { User } from '../src/entities/user.entity';
import { Book } from '../src/entities/book.entity';
import { Tag } from '../src/entities/tag.entity';
import { UsersModule } from '../src/modules/users/users.module';
import { AuthModule } from '../src/modules/auth/auth.module';
import { BooksModule } from '../src/modules/books/books.module';
import { RecommendationSection } from '../src/entities/recommendation-section.entity';
import { Permission } from '../src/entities/permission.entity';
import { UserPermission } from '../src/entities/user-permission.entity';
import { RecommendationsModule } from '../src/modules/recommendations/recommendations.module';
import { UserConfig } from '../src/entities/user-config.entity';
import { FileObject } from '../src/entities/file-object.entity';
import { UserConfigModule } from '../src/modules/user-config/user-config.module';
import { BookRating } from '../src/entities/book-rating.entity';
import { Comment } from '../src/entities/comment.entity';
import { MediaLibrary } from '../src/entities/media-library.entity';
import { MediaLibraryItem } from '../src/entities/media-library-item.entity';
import { ReaderEngine } from '../src/entities/reader-engine.entity';
import { ReaderInstance } from '../src/entities/reader-instance.entity';
import { MediaLibrariesModule } from '../src/modules/media-libraries/media-libraries.module';
import { FilesModule } from '../src/modules/files/files.module';
import { EpubModule } from '../src/modules/epub/epub.module';
import { S3_CLIENT } from '../src/modules/files/tokens';
import request from 'supertest';

export interface LoginResult {
  access_token: string;
  user: { id: number; username: string; email: string };
}

// 解析并校验登录/注册返回结构，避免直接使用 any 赋值。
export function parseLoginResult(data: unknown): LoginResult {
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    const token = obj.access_token;
    const user = obj.user;
    if (
      typeof token === 'string' &&
      typeof user === 'object' &&
      user !== null
    ) {
      const u = user as Record<string, unknown>;
      const id = u.id;
      const username = u.username;
      const email = u.email;
      if (
        typeof id === 'number' &&
        typeof username === 'string' &&
        typeof email === 'string'
      ) {
        return {
          access_token: token,
          user: { id, username, email },
        };
      }
    }
  }
  throw new Error('Unexpected login response shape');
}

export async function createTestModule(): Promise<TestingModule> {
  // Minimal in-memory S3 replacement for tests to avoid external MinIO dependency.
  const store = new Map<string, { body: Buffer; contentType?: string }>();
  const fakeS3 = {
    __store: store,
    send: jest.fn().mockImplementation(async (command: any) => {
      const name = command?.constructor?.name as string | undefined;
      const input = command?.input as Record<string, any> | undefined;

      if (name === 'HeadBucketCommand' || name === 'CreateBucketCommand') {
        return {};
      }
      if (name === 'PutObjectCommand') {
        const key = input?.Key as string | undefined;
        const body = input?.Body as any;
        if (!key) throw new Error('Missing Key');
        const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
        store.set(key, { body: buf, contentType: input?.ContentType });
        return {};
      }
      if (name === 'DeleteObjectCommand') {
        const key = input?.Key as string | undefined;
        if (!key) throw new Error('Missing Key');
        store.delete(key);
        return {};
      }
      if (name === 'HeadObjectCommand') {
        const key = input?.Key as string | undefined;
        if (!key) throw new Error('Missing Key');
        if (!store.has(key)) throw new Error('NotFound');
        return {};
      }
      if (name === 'ListObjectsV2Command') {
        const prefix = (input?.Prefix as string | undefined) ?? '';
        const keys = Array.from(store.keys()).filter((k) =>
          k.startsWith(prefix),
        );
        return {
          Contents: keys.map((k) => ({ Key: k })),
          IsTruncated: false,
          NextContinuationToken: undefined,
        };
      }
      if (name === 'DeleteObjectsCommand') {
        const objs =
          (input?.Delete?.Objects as Array<{ Key?: string }> | undefined) ?? [];
        for (const o of objs) {
          const key = o?.Key;
          if (typeof key === 'string') store.delete(key);
        }
        return {};
      }
      // For unneeded commands in current test suites, just return empty.
      return {};
    }),
  };

  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        envFilePath: '.env.test',
        isGlobal: true,
      }),
      TypeOrmModule.forRoot({
        type: 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5433'),
        username: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'voidlord_test',
        entities: [
          User,
          Book,
          Tag,
          RecommendationSection,
          Permission,
          UserPermission,
          UserConfig,
          FileObject,
          BookRating,
          Comment,
          MediaLibrary,
          MediaLibraryItem,
          ReaderEngine,
          ReaderInstance,
        ],
        synchronize: true,
        dropSchema: true, // 每次测试都重新创建数据库结构
      }),
      TypeOrmModule.forFeature([
        User,
        Book,
        Tag,
        RecommendationSection,
        Permission,
        UserPermission,
        UserConfig,
        FileObject,
        BookRating,
        Comment,
        MediaLibrary,
        MediaLibraryItem,
        ReaderEngine,
        ReaderInstance,
      ]),
      UsersModule,
      AuthModule,
      BooksModule,
      RecommendationsModule,
      UserConfigModule,
      MediaLibrariesModule,
      FilesModule,
      EpubModule,
    ],
  })
    .overrideProvider(S3_CLIENT)
    .useValue(fakeS3)
    .compile();
}

/**
 * 执行用户注册，并返回登录结果类型化结构。后续 e2e 测试可复用减少 any 使用。
 */
export async function registerAndLogin(
  app: import('@nestjs/common').INestApplication,
  creds: { username: string; email: string; password: string },
): Promise<LoginResult> {
  const { username, email, password } = creds;
  // 注册
  await request(app.getHttpServer() as unknown as import('http').Server)
    .post('/auth/register')
    .send({ username, email, password })
    .expect(201);
  // 登录
  const res: import('supertest').Response = await request(
    app.getHttpServer() as unknown as import('http').Server,
  )
    .post('/auth/login')
    .send({ username, password })
    .expect(200);
  // 使用解析函数确保结构安全
  return parseLoginResult(res.body);
}
