import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BooksService } from './books.service';
import { BooksController } from './books.controller';
import { Book } from '../../entities/book.entity';
import { Tag } from '../../entities/tag.entity';
import { BookRating } from '../../entities/book-rating.entity';
import { Comment } from '../../entities/comment.entity';
import { PermissionsModule } from '../permissions/permissions.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Book, Tag, BookRating, Comment]),
    PermissionsModule,
    FilesModule,
  ],
  controllers: [BooksController],
  providers: [BooksService],
  exports: [BooksService],
})
export class BooksModule {}
