/* eslint-disable prettier/prettier */
import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: 'Username (or login name)', example: 'alice' })
  @IsString()
  username: string;

  @ApiProperty({ description: 'User password', example: 'Password123' })
  @IsString()
  @MinLength(6)
  password: string;
}
