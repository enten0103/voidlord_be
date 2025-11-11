import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaLibrary } from '../../entities/media-library.entity';
import { MediaLibraryItem } from '../../entities/media-library-item.entity';
import { Book } from '../../entities/book.entity';
import { Tag } from '../../entities/tag.entity';
import { MediaLibrariesService } from './media-libraries.service';
import { MediaLibrariesController } from './media-libraries.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([MediaLibrary, MediaLibraryItem, Book, Tag]),
  ],
  providers: [MediaLibrariesService],
  controllers: [MediaLibrariesController],
  exports: [MediaLibrariesService],
})
export class MediaLibrariesModule {}
