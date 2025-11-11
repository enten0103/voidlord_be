import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class AddItemDto {
  @ApiProperty({
    description: 'MediaLibrary ID to add (replacing previous FavoriteList)',
    example: 42,
  })
  @IsInt()
  mediaLibraryId: number;

  @ApiProperty({
    description: 'Desired position (if omitted append to end)',
    required: false,
  })
  @IsOptional()
  @IsInt()
  position?: number;

  @ApiProperty({
    description: 'Optional note shown with the recommended library',
    required: false,
  })
  @IsOptional()
  @IsString()
  note?: string;
}
