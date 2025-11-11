import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  ManyToMany,
  JoinTable,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  OneToMany,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { User } from './user.entity';
import { Tag } from './tag.entity';
import { MediaLibraryItem } from './media-library-item.entity';

@Entity('media_libraries')
@Unique(['owner', 'name'])
export class MediaLibrary {
  @ApiProperty({ description: 'Media library ID' })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ description: 'Library name' })
  @Column({ type: 'varchar', length: 200 })
  name: string;

  @ApiProperty({ description: 'Library description', required: false })
  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @ApiProperty({ description: 'Whether library is public', default: false })
  @Column({ type: 'boolean', default: false })
  is_public: boolean;

  @ApiProperty({ description: 'System-created flag', default: false })
  @Column({ type: 'boolean', default: false })
  is_system: boolean;

  @ApiProperty({ description: 'Owner user', required: false })
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  owner?: User | null;

  @OneToMany(() => MediaLibraryItem, (item) => item.library, { cascade: false })
  items?: MediaLibraryItem[];

  @ApiProperty({ description: 'Associated tags', type: () => [Tag] })
  @ManyToMany(() => Tag, { cascade: true })
  @JoinTable({
    name: 'media_library_tags',
    joinColumn: { name: 'library_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
  })
  tags: Tag[];

  @ApiProperty({ description: 'Creation timestamp' })
  @CreateDateColumn()
  created_at: Date;

  @ApiProperty({ description: 'Update timestamp' })
  @UpdateDateColumn()
  updated_at: Date;
}
