import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

export class AddBookDto {
  @ApiProperty({ description: 'Book ID to add', example: 1 })
  @IsNumber()
  bookId: number;
}
