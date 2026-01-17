import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToMany,
  JoinTable,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Tag } from './tag.entity';

@Entity()
export class Book {
  @ApiProperty({ description: 'Book ID' })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ description: 'Book creation date' })
  @CreateDateColumn()
  created_at: Date;

  @ApiProperty({ description: 'Book last update date' })
  @UpdateDateColumn()
  updated_at: Date;

  @ApiProperty({ description: 'Whether the book has an uploaded EPUB', required: false })
  @Column({ default: false })
  has_epub?: boolean;

  @ApiProperty({ description: 'Creator user id', required: false })
  @Column({ type: 'int', nullable: true })
  create_by?: number;

  @ApiProperty({ description: 'Associated tags', type: () => [Tag] })
  @ManyToMany(() => Tag, (tag) => tag.books, { cascade: true })
  @JoinTable({
    name: 'book_tags',
    joinColumn: { name: 'book_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
  })
  tags: Tag[];
}
