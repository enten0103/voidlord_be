import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    OneToOne,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from './user.entity';

@Entity()
export class UserConfig {
    @PrimaryGeneratedColumn()
    @ApiProperty({ description: 'Config ID' })
    id: number;

    @OneToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn()
    @ApiProperty({ description: 'Owner user' })
    user: User;

    @Column({ type: 'varchar', length: 512, nullable: true })
    @ApiPropertyOptional({ description: 'Avatar object key stored in S3/MinIO' })
    avatar_key?: string | null;

    @Column({ type: 'varchar', length: 1024, nullable: true })
    @ApiPropertyOptional({ description: 'Public URL of avatar image' })
    avatar_url?: string | null;

    @Column({ type: 'varchar', length: 128, nullable: true })
    @ApiPropertyOptional({ description: 'Display name' })
    display_name?: string | null;

    @Column({ type: 'text', nullable: true })
    @ApiPropertyOptional({ description: 'Bio or signature' })
    bio?: string | null;

    @Column({ type: 'varchar', length: 16, default: 'en' })
    @ApiPropertyOptional({ description: 'Preferred locale', default: 'en' })
    locale: string;

    @Column({ type: 'varchar', length: 64, default: 'UTC' })
    @ApiPropertyOptional({ description: 'Preferred timezone', default: 'UTC' })
    timezone: string;

    @Column({ type: 'varchar', length: 16, default: 'light' })
    @ApiPropertyOptional({ description: 'UI theme', default: 'light', enum: ['light', 'dark', 'system'] })
    theme: string;

    @Column({ type: 'boolean', default: true })
    @ApiPropertyOptional({ description: 'Whether to receive email notifications', default: true })
    email_notifications: boolean;

    @CreateDateColumn()
    @ApiProperty({ description: 'Created at' })
    created_at: Date;

    @UpdateDateColumn()
    @ApiProperty({ description: 'Updated at' })
    updated_at: Date;
}
