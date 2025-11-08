import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Book } from './book.entity';

export type ReadingStatus = 'planned' | 'reading' | 'paused' | 'finished';

@Entity('reading_records')
@Unique('UQ_user_book_record', ['user', 'book'])
export class ReadingRecord {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user!: User;

  @ManyToOne(() => Book, { onDelete: 'CASCADE' })
  book!: Book;

  @Column({ type: 'varchar', length: 16, default: 'reading' })
  status!: ReadingStatus;

  @Column({ type: 'int', default: 0 })
  progress!: number; // 0-100

  @Column({ type: 'varchar', length: 255, nullable: true })
  current_chapter!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  started_at!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  finished_at!: Date | null;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  last_read_at!: Date;

  @Column({ type: 'int', default: 0 })
  total_minutes!: number; // accumulated reading time in minutes

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
