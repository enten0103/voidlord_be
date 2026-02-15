import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  Index,
} from 'typeorm';
import { Book } from './book.entity';
import { ReaderEngine } from './reader-engine.entity';

export type ReaderInstanceStatus = 'ready' | 'processing' | 'failed';

@Entity('reader_instances')
@Unique(['book', 'engine', 'variant'])
export class ReaderInstance {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Book, { onDelete: 'CASCADE' })
  @Index()
  book: Book;

  @ManyToOne(() => ReaderEngine, { onDelete: 'CASCADE' })
  @Index()
  engine: ReaderEngine;

  @Column({ length: 64, default: 'default' })
  @Index()
  variant: string; // allow multiple instances per engine

  @Column({ length: 128 })
  hash: string;

  @Column({ length: 16, default: 'ready' })
  status: ReaderInstanceStatus;

  @Column({ type: 'jsonb', nullable: true })
  meta?: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
