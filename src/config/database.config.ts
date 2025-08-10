import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { Book } from '../entities/book.entity';
import { Tag } from '../entities/tag.entity';
import { RecommendationSection } from '../entities/recommendation-section.entity';
import { RecommendationItem } from '../entities/recommendation-item.entity';
import { Permission } from '../entities/permission.entity';
import { UserPermission } from '../entities/user-permission.entity';

@Injectable()
export class DatabaseConfig implements TypeOrmOptionsFactory {
  constructor(private configService: ConfigService) { }
  createTypeOrmOptions(): TypeOrmModuleOptions {
    return {
      type: 'postgres',
      host: this.configService.get<string>('DB_HOST', 'localhost'),
      port: this.configService.get<number>('DB_PORT', 5432),
      username: this.configService.get<string>('DB_USERNAME', 'postgres'),
      password: this.configService.get<string>('DB_PASSWORD', 'postgres'),
      database: this.configService.get<string>('DB_NAME', 'voidlord'),
      entities: [User, Book, Tag, RecommendationSection, RecommendationItem, Permission, UserPermission],
      synchronize: this.configService.get<boolean>('DB_SYNCHRONIZE', true), // 仅在开发环境使用
      logging: this.configService.get<boolean>('DB_LOGGING', false),
      retryAttempts: 3,
      retryDelay: 3000,
    };
  }
}
