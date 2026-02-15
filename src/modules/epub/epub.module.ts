import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EpubController } from './epub.controller';
import { EpubService } from './epub.service';
import { FilesModule } from '../files/files.module';
import { Book } from '../../entities/book.entity';
import { Tag } from '../../entities/tag.entity';
import { PermissionsModule } from '../permissions/permissions.module';
import { TonoModule } from '../tono/tono.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Book, Tag]),
    FilesModule,
    PermissionsModule,
    TonoModule,
  ],
  controllers: [EpubController],
  providers: [EpubService],
})
export class EpubModule {}
