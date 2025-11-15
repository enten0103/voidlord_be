import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

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

  @ApiProperty({ description: 'Value used by the operator', example: 'Isaac Asimov' })
  @IsString()
  value: string;
}

export class SearchBooksDto {
  @ApiProperty({
    description:
      'Array of search conditions. Books must satisfy ALL conditions (logical AND). When empty or omitted returns all books.',
    required: false,
    type: [SearchConditionDto],
    example: [
      { target: 'author', op: 'eq', value: 'Isaac Asimov' },
      { target: 'genre', op: 'neq', value: 'Fantasy' },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SearchConditionDto)
  conditions?: SearchConditionDto[];
}
