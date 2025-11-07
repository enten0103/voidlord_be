import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class UpdateUserConfigDto {
  @ApiPropertyOptional({ description: 'Avatar object key in storage' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatar_key?: string;

  @ApiPropertyOptional({
    description:
      'Avatar public URL (will be derived if key provided and public endpoint configured)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  avatar_url?: string;

  @ApiPropertyOptional({ description: 'Display name' })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  display_name?: string;

  @ApiPropertyOptional({ description: 'Bio' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ description: 'Locale code, e.g., en, zh-CN' })
  @IsOptional()
  @IsString()
  @Length(2, 16)
  locale?: string;

  @ApiPropertyOptional({ description: 'Timezone, e.g., Asia/Shanghai or UTC' })
  @IsOptional()
  @IsString()
  @Length(2, 64)
  timezone?: string;

  @ApiPropertyOptional({
    description: 'Theme',
    enum: ['light', 'dark', 'system'],
  })
  @IsOptional()
  @IsIn(['light', 'dark', 'system'])
  theme?: 'light' | 'dark' | 'system';

  @ApiPropertyOptional({ description: 'Email notifications on/off' })
  @IsOptional()
  @IsBoolean()
  email_notifications?: boolean;
}
