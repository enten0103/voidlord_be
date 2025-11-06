import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ description: 'Comment content', minLength: 1, maxLength: 2000, example: 'Great book!' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;
}
