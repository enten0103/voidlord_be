import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  Column,
  Unique,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Book } from './book.entity';

@Entity()
@Unique('uq_user_book_rating', ['user', 'book'])
export class BookRating {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { eager: false, nullable: false, onDelete: 'CASCADE' })
  @Index()
  user: User;

  @ManyToOne(() => Book, { eager: false, nullable: false, onDelete: 'CASCADE' })
  @Index()
  book: Book;

  @Column({ type: 'int' })
  score: number; // 1-5

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
