import { IsInt, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StartReadingDto {
  @ApiProperty({ description: 'Book ID to start reading' })
  @IsInt()
  bookId: number;

  @ApiPropertyOptional({ description: 'Reader instance hash' })
  @IsOptional()
  @IsString()
  instanceHash?: string;

  @ApiPropertyOptional({ description: 'XHTML index at start' })
  @IsOptional()
  @IsInt()
  xhtmlIndex?: number;

  @ApiPropertyOptional({ description: 'Element index at start' })
  @IsOptional()
  @IsInt()
  elementIndex?: number;
}
