import { IsInt, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class HeartbeatDto {
  @ApiPropertyOptional({ description: 'Current XHTML index' })
  @IsOptional()
  @IsInt()
  xhtmlIndex?: number;

  @ApiPropertyOptional({ description: 'Current element index' })
  @IsOptional()
  @IsInt()
  elementIndex?: number;
}
