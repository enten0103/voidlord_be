import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsInt } from 'class-validator';

export class ReorderItemsDto {
  @ApiProperty({ description: 'Array of item IDs in new order' })
  @IsArray()
  @ArrayMinSize(1)
  // each:true 已有正确的 ValidationOptions 类型，无需 any 断言
  @IsInt({ each: true })
  itemIds: number[];
}
