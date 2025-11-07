import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { FavoriteList } from './favorite-list.entity';
import { Book } from './book.entity';

@Entity()
@Unique(['list', 'book'])
export class FavoriteListItem {
  @ApiProperty({ description: 'Item ID' })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ description: 'Belonging list' })
  @ManyToOne(() => FavoriteList, (l) => l.items, { onDelete: 'CASCADE' })
  list: FavoriteList;

  @ApiProperty({ description: 'Book in the list' })
  @ManyToOne(() => Book, { onDelete: 'CASCADE' })
  book: Book;

  @ApiProperty({ description: 'Added timestamp' })
  @CreateDateColumn()
  added_at: Date;
}
