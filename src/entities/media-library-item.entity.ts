import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { MediaLibrary } from './media-library.entity';
import { Book } from './book.entity';

@Entity('media_library_items')
@Unique(['library', 'book'])
@Unique(['library', 'child_library'])
export class MediaLibraryItem {
  @ApiProperty({ description: 'Item ID' })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ description: 'Parent media library' })
  @ManyToOne(() => MediaLibrary, (l) => l.items, { onDelete: 'CASCADE' })
  library: MediaLibrary;

  @ApiProperty({ description: 'Book in the library', required: false })
  @ManyToOne(() => Book, { onDelete: 'CASCADE', nullable: true })
  book?: Book | null;

  @ApiProperty({ description: 'Nested child media library', required: false })
  @ManyToOne(() => MediaLibrary, { onDelete: 'CASCADE', nullable: true })
  child_library?: MediaLibrary | null;

  @ApiProperty({ description: 'Added timestamp' })
  @CreateDateColumn()
  added_at: Date;
}
