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
// Unique constraints: prevent duplicate book entries and duplicate child list entries in same parent list
@Unique(['list', 'book'])
@Unique(['list', 'child_list'])
export class FavoriteListItem {
  @ApiProperty({ description: 'Item ID' })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ description: 'Belonging list' })
  @ManyToOne(() => FavoriteList, (l) => l.items, { onDelete: 'CASCADE' })
  list: FavoriteList;

  @ApiProperty({ description: 'Book in the list', required: false })
  @ManyToOne(() => Book, { onDelete: 'CASCADE', nullable: true })
  book?: Book | null;

  @ApiProperty({ description: 'Nested child list', required: false })
  @ManyToOne(() => FavoriteList, { onDelete: 'CASCADE', nullable: true })
  child_list?: FavoriteList | null;

  @ApiProperty({ description: 'Added timestamp' })
  @CreateDateColumn()
  added_at: Date;
}
