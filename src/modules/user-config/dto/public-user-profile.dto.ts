import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PublicUserProfileDto {
  @ApiProperty({ description: 'User ID' })
  userId: number;

  @ApiPropertyOptional({ description: 'Public URL of avatar image if available', nullable: true })
  avatar_url: string | null;

  @ApiPropertyOptional({ description: 'Display name', nullable: true })
  display_name?: string | null;

  @ApiPropertyOptional({ description: 'Bio or signature', nullable: true })
  bio?: string | null;
}
