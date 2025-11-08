import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpsertReadingRecordDto {
  @IsInt()
  @IsPositive()
  bookId!: number;

  @ApiPropertyOptional({ enum: ['planned', 'reading', 'paused', 'finished'] })
  @IsOptional()
  @IsEnum(['planned', 'reading', 'paused', 'finished'] as const)
  status?: 'planned' | 'reading' | 'paused' | 'finished';

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  current_chapter?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Incremental minutes to add to total_minutes',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  minutes_increment?: number;
}
