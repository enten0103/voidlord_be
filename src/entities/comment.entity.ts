import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Book } from './book.entity';
import { User } from './user.entity';

@Entity()
export class Comment {
  @ApiProperty({ description: 'Comment ID' })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ description: 'Comment content' })
  @Column({ type: 'text' })
  content: string;

  @ApiProperty({ description: 'Creation timestamp' })
  @CreateDateColumn()
  created_at: Date;

  @ApiProperty({ description: 'Update timestamp' })
  @UpdateDateColumn()
  updated_at: Date;

  @ApiProperty({ description: 'Related book ID' })
  @ManyToOne(() => Book, { onDelete: 'CASCADE' })
  book: Book;

  @ApiProperty({ description: 'Author user ID' })
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  user: User | null;
}
