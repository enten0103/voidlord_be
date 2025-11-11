import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReadingRecord } from '../../entities/reading-record.entity';
import { Book } from '../../entities/book.entity';
import { MediaLibrary } from '../../entities/media-library.entity';
import { MediaLibraryItem } from '../../entities/media-library-item.entity';
import { ReadingRecordsService } from './reading-records.service';
import { ReadingRecordsController } from './reading-records.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReadingRecord,
      Book,
      MediaLibrary,
      MediaLibraryItem,
    ]),
  ],
  controllers: [ReadingRecordsController],
  providers: [ReadingRecordsService],
  exports: [ReadingRecordsService],
})
export class ReadingRecordsModule {}
