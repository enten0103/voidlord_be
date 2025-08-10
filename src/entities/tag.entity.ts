import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Book } from './book.entity';

@Entity()
export class Tag {
  @ApiProperty({ description: 'Tag ID' })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ description: 'Tag key' })
  @Column()
  key: string;

  @ApiProperty({ description: 'Tag value' })
  @Column()
  value: string;

  @ApiProperty({ description: 'Whether the tag is shown', default: true })
  @Column({ default: true })
  shown: boolean;

  @ApiProperty({ description: 'Tag creation date' })
  @CreateDateColumn()
  created_at: Date;

  @ApiProperty({ description: 'Tag last update date' })
  @UpdateDateColumn()
  updated_at: Date;

  @ManyToMany(() => Book, (book) => book.tags)
  books: Book[];
}
