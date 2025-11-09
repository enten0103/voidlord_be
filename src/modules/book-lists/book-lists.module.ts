import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FavoriteList } from '../../entities/favorite-list.entity';
import { FavoriteListItem } from '../../entities/favorite-list-item.entity';
import { Book } from '../../entities/book.entity';
import { Tag } from '../../entities/tag.entity';
import { BookListsService } from './book-lists.service';
import { BookListsController } from './book-lists.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([FavoriteList, FavoriteListItem, Book, Tag]),
  ],
  providers: [BookListsService],
  controllers: [BookListsController],
})
export class BookListsModule {}
