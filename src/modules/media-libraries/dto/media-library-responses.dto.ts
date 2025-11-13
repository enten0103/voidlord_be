import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class MediaLibraryTagDto {
  @ApiProperty({ example: 'genre' })
  key: string;
  @ApiProperty({ example: 'science_fiction' })
  value: string;
}

export class MediaLibraryItemDto {
  @ApiProperty({ example: 12 })
  id: number;
  @ApiPropertyOptional({ example: { id: 5 }, nullable: true })
  book?: { id: number } | null;
  @ApiPropertyOptional({
    example: { id: 99, name: 'Nested Shelf' },
    nullable: true,
  })
  child_library?: { id: number; name?: string } | null;
}

export class MediaLibraryCreatedDto {
  @ApiProperty({ example: 1 })
  id: number;
  @ApiProperty({ example: 'My Shelf' })
  name: string;
  @ApiPropertyOptional({ example: 'All my sci-fi', nullable: true })
  description?: string | null;
  @ApiProperty({ example: false })
  is_public: boolean;
  @ApiProperty({ example: false })
  is_system: boolean;
  @ApiProperty({ type: () => [MediaLibraryTagDto] })
  tags: MediaLibraryTagDto[];
  @ApiProperty({ example: '2025-11-10T10:00:00.000Z' })
  created_at: Date;
}

export class MediaLibrarySummaryDto {
  @ApiProperty({ example: 1 })
  id: number;
  @ApiProperty({ example: 'My Shelf' })
  name: string;
  @ApiPropertyOptional({ example: 'All my sci-fi', nullable: true })
  description?: string | null;
  @ApiProperty({ example: false })
  is_public: boolean;
  @ApiProperty({ example: false })
  is_system: boolean;
  @ApiProperty({ type: () => [MediaLibraryTagDto] })
  tags: MediaLibraryTagDto[];
  @ApiProperty({ example: '2025-11-10T10:00:00.000Z' })
  created_at: Date;
  @ApiProperty({ example: '2025-11-10T10:05:00.000Z' })
  updated_at: Date;
  @ApiProperty({ example: 3 })
  items_count: number;
}

export class MediaLibraryDetailDto extends MediaLibrarySummaryDto {
  @ApiPropertyOptional({ example: 7, nullable: true })
  owner_id?: number | null;
  @ApiProperty({ type: () => [MediaLibraryItemDto] })
  items: MediaLibraryItemDto[];
}

export class VirtualMediaLibraryDetailDto extends MediaLibraryDetailDto {
  @ApiProperty({ example: true })
  is_virtual: boolean;
}

export class MediaLibraryUpdatedDto {
  @ApiProperty({ example: 1 })
  id: number;
  @ApiProperty({ example: 'My Shelf Updated' })
  name: string;
  @ApiPropertyOptional({ example: 'Updated description', nullable: true })
  description?: string | null;
  @ApiProperty({ example: true })
  is_public: boolean;
  @ApiProperty({ example: false })
  is_system: boolean;
  @ApiProperty({ type: () => [MediaLibraryTagDto] })
  tags: MediaLibraryTagDto[];
  @ApiProperty({ example: '2025-11-10T10:15:00.000Z' })
  updated_at: Date;
}

export class MediaLibraryCopiedDto {
  @ApiProperty({ example: 10 })
  id: number;
  @ApiProperty({ example: 'Original Shelf (copy)' })
  name: string;
  @ApiProperty({ type: () => [MediaLibraryTagDto] })
  tags: MediaLibraryTagDto[];
  @ApiProperty({ example: 5 })
  items_count: number;
  @ApiProperty({ example: false })
  is_public: boolean;
  @ApiProperty({ example: 2 })
  copied_from: number;
}

export class AddBookResponseDto {
  @ApiProperty({ example: 55 })
  id: number;
  @ApiProperty({ example: 1 })
  libraryId: number;
  @ApiProperty({ example: 42 })
  bookId: number;
  @ApiProperty({ example: '2025-11-10T10:20:00.000Z' })
  added_at: Date;
}

export class AddLibraryResponseDto {
  @ApiProperty({ example: 56 })
  id: number;
  @ApiProperty({ example: 1 })
  libraryId: number;
  @ApiProperty({ example: 2 })
  childLibraryId: number;
  @ApiProperty({ example: '2025-11-10T10:21:00.000Z' })
  added_at: Date;
}

export class OkResponseDto {
  @ApiProperty({ example: true })
  ok: boolean;
}
