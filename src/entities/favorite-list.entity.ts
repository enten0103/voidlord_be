import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { User } from './user.entity';
import { FavoriteListItem } from './favorite-list-item.entity';

@Entity()
@Unique(['owner', 'name'])
export class FavoriteList {
  @ApiProperty({ description: 'List ID' })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ description: 'List name' })
  @Column({ type: 'varchar', length: 200 })
  name: string;

  @ApiProperty({
    description: 'List description',
    required: false,
    nullable: true,
  })
  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @ApiProperty({ description: 'Whether the list is public', default: false })
  @Column({ type: 'boolean', default: false })
  is_public: boolean;

  @ApiProperty({ description: 'Owner user' })
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  owner: User;

  @OneToMany(() => FavoriteListItem, (i) => i.list)
  items?: FavoriteListItem[];

  @ApiProperty({ description: 'Creation timestamp' })
  @CreateDateColumn()
  created_at: Date;

  @ApiProperty({ description: 'Update timestamp' })
  @UpdateDateColumn()
  updated_at: Date;
}
