import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EpubController } from './epub.controller';
import { EpubService } from './epub.service';
import { FilesModule } from '../files/files.module';
import { Book } from '../../entities/book.entity';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Book]),
    FilesModule,
    PermissionsModule,
  ],
  controllers: [EpubController],
  providers: [EpubService],
})

export class EpubModule {}
