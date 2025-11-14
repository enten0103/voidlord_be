import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateItemDto {
  @ApiProperty({ description: '推荐项ID', example: 1 })
  @IsInt()
  id: number;

  @ApiProperty({
    description: '新的媒体库ID（必须是公开库）',
    required: false,
    example: 42,
  })
  @IsOptional()
  @IsInt()
  mediaLibraryId?: number;

  @ApiProperty({ description: '新的排序位置', required: false, example: 0 })
  @IsOptional()
  @IsInt()
  position?: number;

  @ApiProperty({ description: '备注', required: false })
  @IsOptional()
  @IsString()
  note?: string;
}
