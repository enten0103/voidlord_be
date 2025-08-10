import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { RecommendationItem } from './recommendation-item.entity';

@Entity('recommendation_sections')
@Index(['key'], { unique: true })
export class RecommendationSection {
    @ApiProperty({ description: 'Section ID' })
    @PrimaryGeneratedColumn()
    id: number;

    @ApiProperty({ description: 'Unique section key (e.g. today_hot)' })
    @Column({ length: 64 })
    key: string;

    @ApiProperty({ description: 'Section display title' })
    @Column({ length: 128 })
    title: string;

    @ApiProperty({ description: 'Section description', required: false })
    @Column({ type: 'text', nullable: true })
    description?: string;

    @ApiProperty({ description: 'Sort order (ascending)', default: 0 })
    @Column({ type: 'int', default: 0 })
    sort_order: number;

    @ApiProperty({ description: 'Whether the section is active', default: true })
    @Column({ default: true })
    active: boolean;

    @ApiProperty({ description: 'Creation time' })
    @CreateDateColumn()
    created_at: Date;

    @ApiProperty({ description: 'Last update time' })
    @UpdateDateColumn()
    updated_at: Date;

    @ApiProperty({ type: () => [RecommendationItem], description: 'Items under this section' })
    @OneToMany(() => RecommendationItem, (item) => item.section, { cascade: true })
    items: RecommendationItem[];
}
