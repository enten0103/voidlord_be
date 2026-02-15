import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Book } from './book.entity';
import { User } from './user.entity';

@Entity()
export class ReadingRecord {
  @ApiProperty({ description: 'Record ID' })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ description: 'User who read the book' })
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ApiProperty({ description: 'User ID' })
  @Column({ name: 'user_id' })
  user_id: number;

  @ApiProperty({ description: 'Book being read' })
  @ManyToOne(() => Book, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'book_id' })
  book: Book;

  @ApiProperty({ description: 'Book ID' })
  @Column({ name: 'book_id' })
  book_id: number;

  @ApiProperty({ description: 'Reader instance hash used for this session' })
  @Column({ nullable: true })
  instance_hash: string;

  @ApiProperty({ description: 'Session start time (first heartbeat)' })
  @CreateDateColumn({ type: 'timestamptz' })
  started_at: Date;

  @ApiProperty({
    description:
      'Last heartbeat time; updated every ~5 minutes while reading. ' +
      'Duration = last_active_at - started_at. ' +
      'When only one heartbeat exists, last_active_at equals started_at (duration = 0).',
  })
  @Column({ type: 'timestamptz', nullable: true })
  last_active_at: Date;

  @ApiProperty({
    description: 'XHTML index when session started',
    nullable: true,
  })
  @Column({ type: 'int', nullable: true })
  start_xhtml_index: number;

  @ApiProperty({
    description: 'Element index when session started',
    nullable: true,
  })
  @Column({ type: 'int', nullable: true })
  start_element_index: number;

  @ApiProperty({
    description: 'XHTML index at last heartbeat',
    nullable: true,
  })
  @Column({ type: 'int', nullable: true })
  end_xhtml_index: number;

  @ApiProperty({
    description: 'Element index at last heartbeat',
    nullable: true,
  })
  @Column({ type: 'int', nullable: true })
  end_element_index: number;
}
