import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TagDto {
  @ApiProperty({ description: 'Tag key', example: 'genre' })
  @IsString()
  key: string;

  @ApiProperty({ description: 'Tag value', example: 'Fiction' })
  @IsString()
  value: string;
}

export class CreateListDto {
  @ApiProperty({ description: 'List name', minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiProperty({
    description: 'List description',
    required: false,
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({
    description: 'Whether public visible',
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  is_public?: boolean;

  @ApiProperty({
    description: 'Tags for the list (key-value pairs)',
    required: false,
    type: () => [TagDto],
    example: [{ key: 'genre', value: 'Fiction' }],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TagDto)
  tags?: TagDto[];
}
