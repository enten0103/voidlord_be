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
        entities: [User, Book, Tag, RecommendationSection, RecommendationItem, Permission, UserPermission, UserConfig, FileObject, BookRating],
        synchronize: true,
        dropSchema: true, // 每次测试都重新创建数据库结构
      }),
      TypeOrmModule.forFeature([User, Book, Tag, RecommendationSection, RecommendationItem, Permission, UserPermission, UserConfig, FileObject, BookRating]),
      UsersModule,
      AuthModule,
      BooksModule,
      RecommendationsModule,
      UserConfigModule,
    ],
  }).compile();
}
