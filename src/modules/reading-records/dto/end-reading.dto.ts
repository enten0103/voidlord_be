import { IsInt, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class EndReadingDto {
  @ApiPropertyOptional({ description: 'Final XHTML index' })
  @IsOptional()
  @IsInt()
  xhtmlIndex?: number;

  @ApiPropertyOptional({ description: 'Final element index' })
  @IsOptional()
  @IsInt()
  elementIndex?: number;
}
