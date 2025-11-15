import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  IsNumber,
  IsPositive,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TagFilterDto {
  @ApiProperty({ description: 'Tag key', example: 'author' })
  @IsString()
  key: string;

  @ApiProperty({ description: 'Tag value', example: 'John Doe' })
  @IsString()
  value: string;
}

export class SearchBooksDto {
  @ApiProperty({
    description:
      'Fuzzy query across tag key & value (case-insensitive, partial match)',
    required: false,
    example: 'asim',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiProperty({
    description: 'Search by tag keys only (comma-separated)',
    required: false,
    example: 'author,genre',
  })
  @IsOptional()
  @IsString()
  tagKeys?: string;

  @ApiProperty({
    description: 'Search by specific tag key-value pair',
    required: false,
    example: 'author',
  })
  @IsOptional()
  @IsString()
  tagKey?: string;

  @ApiProperty({
    description: 'Search by specific tag value (used with tagKey)',
    required: false,
    example: 'John Doe',
  })
  @IsOptional()
  @IsString()
  tagValue?: string;

  @ApiProperty({
    description: 'Search by multiple tag key-value pairs',
    required: false,
    type: [TagFilterDto],
    example: [
      { key: 'author', value: 'John Doe' },
      { key: 'genre', value: 'Fiction' },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TagFilterDto)
  tagFilters?: TagFilterDto[];

  @ApiProperty({
    description: 'Search by single tag ID',
    required: false,
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  tagId?: number;

  @ApiProperty({
    description: 'Search by multiple tag IDs (comma-separated)',
    required: false,
    example: '1,2,3',
  })
  @IsOptional()
  @IsString()
  tagIds?: string;
}
