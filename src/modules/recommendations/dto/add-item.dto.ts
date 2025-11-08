import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class AddItemDto {
  @ApiProperty({
    description: 'BookList (FavoriteList) ID to add',
    example: 42,
  })
  @IsInt()
  bookListId: number;

  @ApiProperty({
    description: 'Desired position (if omitted append to end)',
    required: false,
  })
  @IsOptional()
  @IsInt()
  position?: number;

  @ApiProperty({
    description: 'Optional note shown with the recommended list',
    required: false,
  })
  @IsOptional()
  @IsString()
  note?: string;
}
