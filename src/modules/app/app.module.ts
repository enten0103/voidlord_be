import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { BooksModule } from '../books/books.module';
import { DatabaseConfig } from '../../config/database.config';
import { DatabaseInitService } from '../../config/database-init.service';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { FilesModule } from '../files/files.module';
import { UserConfigModule } from '../user-config/user-config.module';
import { ReadingRecordsModule } from '../reading-records/reading-records.module';
import { MediaLibrariesModule } from '../media-libraries/media-libraries.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      useClass: DatabaseConfig,
    }),
    UsersModule,
    AuthModule,
    BooksModule,
    RecommendationsModule,
    PermissionsModule,
    FilesModule,
    UserConfigModule,
    MediaLibrariesModule,
    ReadingRecordsModule,
  ],
  controllers: [AppController],
  providers: [AppService, DatabaseInitService],
})
export class AppModule {}
