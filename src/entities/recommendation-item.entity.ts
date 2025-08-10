import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, Unique, JoinColumn, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { RecommendationSection } from './recommendation-section.entity';
import { Book } from './book.entity';

@Entity('recommendation_items')
@Unique('uk_section_book', ['section', 'book'])
@Index(['section', 'position'])
export class RecommendationItem {
    @ApiProperty({ description: 'Item ID' })
    @PrimaryGeneratedColumn()
    id: number;

    @ApiProperty({ description: 'Display position (ascending)' })
    @Column({ type: 'int' })
    position: number;

    @ApiProperty({ description: 'Optional note for this recommendation', required: false })
    @Column({ type: 'varchar', nullable: true })
    note?: string;

    @ApiProperty({ description: 'Creation time' })
    @CreateDateColumn()
    created_at: Date;

    @ApiProperty({ description: 'Last update time' })
    @UpdateDateColumn()
    updated_at: Date;

    @ManyToOne(() => RecommendationSection, (section) => section.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'section_id' })
    section: RecommendationSection;

    @ManyToOne(() => Book, { eager: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'book_id' })
    book: Book;
}
