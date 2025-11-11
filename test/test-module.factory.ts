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
import { RecommendationItem } from '../src/entities/recommendation-item.entity';
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
import { MediaLibrariesModule } from '../src/modules/media-libraries/media-libraries.module';
import { ReadingRecord } from '../src/entities/reading-record.entity';
import { ReadingRecordsModule } from '../src/modules/reading-records/reading-records.module';
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
          RecommendationItem,
          Permission,
          UserPermission,
          UserConfig,
          FileObject,
          BookRating,
          Comment,
          MediaLibrary,
          MediaLibraryItem,
          ReadingRecord,
        ],
        synchronize: true,
        dropSchema: true, // 每次测试都重新创建数据库结构
      }),
      TypeOrmModule.forFeature([
        User,
        Book,
        Tag,
        RecommendationSection,
        RecommendationItem,
        Permission,
        UserPermission,
        UserConfig,
        FileObject,
        BookRating,
        Comment,
        MediaLibrary,
        MediaLibraryItem,
        ReadingRecord,
      ]),
      UsersModule,
      AuthModule,
      BooksModule,
      RecommendationsModule,
      UserConfigModule,
      MediaLibrariesModule,
      ReadingRecordsModule,
    ],
  }).compile();
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
