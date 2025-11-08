import {
  Body,
  Controller,
  Get,
  Param,
  Post,
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
import { PermissionGuard } from '../auth/guards/permission.guard';
import { ApiPermission } from '../auth/permissions.decorator';
import { GrantPermissionDto } from './dto/grant-permission.dto';
import { RevokePermissionDto } from './dto/revoke-permission.dto';
import { PermissionsService } from './permissions.service';
import type { JwtRequestWithUser } from '../../types/request.interface';

@ApiTags('permissions')
@ApiBearerAuth('JWT-auth')
@Controller('permissions')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Post('grant')
  @ApiOperation({ summary: 'Grant a permission to a user' })
  @ApiPermission('USER_UPDATE', 2)
  @ApiBody({
    type: GrantPermissionDto,
    examples: {
      grantLevel1: {
        summary: 'Grant level 1 permission',
        value: { userId: 12, permission: 'BOOK_UPDATE', level: 1 },
      },
      grantLevel3: {
        summary: 'Grant level 3 (requires granter level 3)',
        value: { userId: 12, permission: 'USER_UPDATE', level: 3 },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Granted',
    schema: { example: { userId: 12, permission: 'BOOK_UPDATE', level: 1 } },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request',
    schema: {
      example: {
        statusCode: 400,
        message: 'Invalid level',
        error: 'Bad Request',
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
  @ApiResponse({
    status: 403,
    description: 'Forbidden (insufficient permission)',
    schema: {
      example: { statusCode: 403, message: 'Forbidden', error: 'Forbidden' },
    },
  })
  grant(@Req() req: JwtRequestWithUser, @Body() dto: GrantPermissionDto) {
    return this.permissionsService.grant(req.user.userId, dto);
  }

  @Post('revoke')
  @ApiOperation({ summary: 'Revoke a permission from a user' })
  @ApiPermission('USER_UPDATE', 2)
  @ApiBody({
    type: RevokePermissionDto,
    examples: {
      revokeExample: {
        summary: 'Revoke a granted permission',
        value: { userId: 12, permission: 'BOOK_UPDATE' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Revoked',
    schema: { example: { revoked: true } },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request',
    schema: {
      example: {
        statusCode: 400,
        message: 'Target user not found',
        error: 'Bad Request',
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
  @ApiResponse({
    status: 403,
    description: 'Forbidden (insufficient permission)',
    schema: {
      example: { statusCode: 403, message: 'Forbidden', error: 'Forbidden' },
    },
  })
  revoke(@Req() req: JwtRequestWithUser, @Body() dto: RevokePermissionDto) {
    return this.permissionsService.revoke(req.user.userId, dto);
  }

  @Get('user/:id')
  @ApiOperation({ summary: 'List permissions for a user' })
  @ApiPermission('USER_READ', 1)
  @ApiParam({
    name: 'id',
    description: 'Target user ID',
    type: Number,
    example: 12,
  })
  @ApiResponse({
    status: 200,
    description: 'User permissions',
    schema: {
      example: [
        { permission: 'USER_READ', level: 1 },
        { permission: 'BOOK_UPDATE', level: 2 },
      ],
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
  @ApiResponse({
    status: 403,
    description: 'Forbidden (insufficient permission)',
    schema: {
      example: { statusCode: 403, message: 'Forbidden', error: 'Forbidden' },
    },
  })
  list(@Param('id') id: string) {
    return this.permissionsService.listUserPermissions(+id);
  }
}
