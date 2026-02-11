import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Book } from '../../entities/book.entity';
import { ReaderEngine } from '../../entities/reader-engine.entity';
import { ReaderInstance } from '../../entities/reader-instance.entity';
import { FilesModule } from '../files/files.module';
import { TonoController } from './tono.controller';
import { TonoService } from './tono.service';

@Module({
    imports: [TypeOrmModule.forFeature([Book, ReaderEngine, ReaderInstance]), FilesModule],
    controllers: [TonoController],
    providers: [TonoService],
    exports: [TonoService],
})
export class TonoModule { }
