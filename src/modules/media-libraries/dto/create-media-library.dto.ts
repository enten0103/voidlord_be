import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MediaTagDto {
  @ApiProperty({ example: 'genre' })
  @IsString()
  @Length(1, 64)
  key: string;

  @ApiProperty({ example: 'science_fiction' })
  @IsString()
  @Length(1, 128)
  value: string;

  @ApiPropertyOptional({ example: true, description: 'Whether tag is visible' })
  @IsOptional()
  @IsBoolean()
  shown?: boolean;
}

export class CreateMediaLibraryDto {
  @ApiProperty({ example: 'My Shelf' })
  @IsString()
  @Length(1, 200)
  name: string;

  @ApiPropertyOptional({
    example: 'All my sci-fi and philosophy',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string | null;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  is_public?: boolean;

  @ApiPropertyOptional({ type: () => [MediaTagDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaTagDto)
  tags?: MediaTagDto[];
}
