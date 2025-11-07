import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserConfigService } from './user-config.service';
import { UpdateUserConfigDto } from './dto/update-user-config.dto';
import { PublicUserProfileDto } from './dto/public-user-profile.dto';

@ApiTags('user-config')
@Controller('user-config')
export class UserConfigController {
  constructor(private readonly service: UserConfigService) {}

  @Get(':userId/public')
  @ApiOperation({ summary: 'Get public profile by user ID' })
  @ApiParam({ name: 'userId', type: Number, description: 'Target user ID' })
  @ApiResponse({
    status: 200,
    description: 'Public profile',
    type: PublicUserProfileDto,
  })
  async publicProfile(@Param('userId') userId: string) {
    return this.service.getPublicByUserId(+userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get my config (create if missing)' })
  @ApiResponse({
    status: 200,
    description: 'My config returned (created if missing)',
    schema: {
      example: {
        id: 1,
        user: {
          id: 42,
          username: 'alice',
          email: 'alice@example.com',
          created_at: '2025-09-01T00:00:00.000Z',
          updated_at: '2025-09-01T00:00:00.000Z',
        },
        avatar_key: 'avatars/42.png',
        avatar_url: 'http://localhost:9000/voidlord/avatars/42.png',
        display_name: 'Alice',
        bio: 'Hello there',
        locale: 'en',
        timezone: 'UTC',
        theme: 'light',
        email_notifications: true,
        created_at: '2025-09-01T00:00:00.000Z',
        updated_at: '2025-09-01T00:00:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
      },
    },
  })
  my(@Req() req: any) {
    return this.service.getOrCreateByUserId(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update my config' })
  @ApiBody({ type: UpdateUserConfigDto })
  @ApiResponse({ status: 200, description: 'Updated' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
      },
    },
  })
  update(@Req() req: any, @Body() dto: UpdateUserConfigDto) {
    return this.service.updateMy(req.user.userId, dto);
  }
}
