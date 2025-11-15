import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
  IsEnum,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export type BookSortBy = 'created_at' | 'updated_at' | 'rating';
export type BookSortOrder = 'asc' | 'desc';

export class SearchConditionDto {
  @ApiProperty({ description: 'Tag key to search within', example: 'author' })
  @IsString()
  target: string;

  @ApiProperty({
    description: 'Operator applied on the tag value',
    example: 'eq',
    enum: ['eq', 'neq', 'match'],
  })
  @IsString()
  @IsIn(['eq', 'neq', 'match'])
  op: 'eq' | 'neq' | 'match';

  @ApiProperty({
    description: 'Value used by the operator',
    example: 'Isaac Asimov',
    examples: ['Isaac Asimov', 'asim', ''],
  })
  @IsString()
  value: string;
}

export class SearchBooksDto {
  @ApiProperty({
    description: '排序字段，可选 created_at、updated_at、rating（评分）',
    required: false,
    enum: ['created_at', 'updated_at', 'rating'],
    example: 'created_at',
  })
  @IsOptional()
  @IsEnum(['created_at', 'updated_at', 'rating'])
  sortBy?: BookSortBy;

  @ApiProperty({
    description: '排序顺序，asc 或 desc，默认 desc',
    required: false,
    enum: ['asc', 'desc'],
    example: 'desc',
  })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: BookSortOrder;
  @ApiProperty({
    description:
      'Array of search conditions. Books must satisfy ALL conditions (logical AND). When empty or omitted returns all books.',
    required: false,
    type: [SearchConditionDto],
    example: [
      { target: 'author', op: 'eq', value: 'Isaac Asimov' },
      { target: 'genre', op: 'neq', value: 'Fantasy' },
    ],
    examples: [
      [
        { target: 'author', op: 'eq', value: 'Isaac Asimov' },
        { target: 'author', op: 'eq', value: 'Isaac Asimov' },
      ],
      [{ target: 'year', op: 'eq', value: '' }],
      [{ target: 'author', op: 'match', value: 'asim' }],
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SearchConditionDto)
  conditions?: SearchConditionDto[];

  @ApiProperty({
    description:
      'Optional page size. When provided (with or without offset) the response switches to paged object: { total, limit, offset, items }.',
    required: false,
    minimum: 1,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiProperty({
    description: 'Optional offset (>=0). Ignored if negative.',
    required: false,
    minimum: 0,
    example: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
