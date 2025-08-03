import { Entity, Column, PrimaryGeneratedColumn, ManyToMany, JoinTable, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Tag } from './tag.entity';

@Entity()
export class Book {
    @ApiProperty({ description: 'Book ID' })
    @PrimaryGeneratedColumn()
    id: number;

    @ApiProperty({ description: 'Book hash' })
    @Column({ unique: true })
    hash: string;

    @ApiProperty({ description: 'Book title' })
    @Column()
    title: string;

    @ApiProperty({ description: 'Book description', required: false })
    @Column({ nullable: true })
    description?: string;

    @ApiProperty({ description: 'Book creation date' })
    @CreateDateColumn()
    created_at: Date;

    @ApiProperty({ description: 'Book last update date' })
    @UpdateDateColumn()
    updated_at: Date;

    @ApiProperty({ description: 'Associated tags', type: () => [Tag] })
    @ManyToMany(() => Tag, tag => tag.books, { cascade: true })
    @JoinTable({
        name: 'book_tags',
        joinColumn: { name: 'book_id', referencedColumnName: 'id' },
        inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
    })
    tags: Tag[];
}
