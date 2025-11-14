import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class CreateSectionDto {
  @ApiProperty({
    description: 'Unique key, lowercase letters, numbers, underscore',
    example: 'today_hot',
  })
  @IsString()
  @Matches(/^[a-z0-9_]+$/)
  @Length(2, 64)
  key: string;

  @ApiProperty({ description: 'Display title', example: '今日最热' })
  @IsString()
  @Length(1, 128)
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsInt()
  sort_order?: number;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({ description: 'Associated mediaLibrary ID', example: 42 })
  @IsInt()
  mediaLibraryId: number;
}
