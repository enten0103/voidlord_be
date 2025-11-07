import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsInt } from 'class-validator';

export class ReorderItemsDto {
  @ApiProperty({ description: 'Array of item IDs in new order' })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true } as any)
  itemIds: number[];
}
