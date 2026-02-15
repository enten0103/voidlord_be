import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReadingRecord } from '../../entities/reading-record.entity';
import { ReadingRecordsController } from './reading-records.controller';
import { ReadingRecordsService } from './reading-records.service';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [TypeOrmModule.forFeature([ReadingRecord]), PermissionsModule],
  controllers: [ReadingRecordsController],
  providers: [ReadingRecordsService],
  exports: [ReadingRecordsService],
})
export class ReadingRecordsModule {}
