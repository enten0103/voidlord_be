import { Body, Controller, Get, Logger, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { ApiPermission } from '../auth/permissions.decorator';
import { GrantPermissionDto } from './dto/grant-permission.dto';
import { RevokePermissionDto } from './dto/revoke-permission.dto';
import { PermissionsService } from './permissions.service';

@ApiTags('permissions')
@ApiBearerAuth('JWT-auth')
@Controller('permissions')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PermissionsController {
    constructor(private readonly permissionsService: PermissionsService) { }

    @Post('grant')
    @ApiPermission('USER_UPDATE', 2)
    @ApiResponse({ status: 201, description: 'Granted' })
    @ApiResponse({ status: 401, description: 'Unauthorized', schema: { example: { statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' } } })
    @ApiResponse({ status: 403, description: 'Forbidden (insufficient permission)', schema: { example: { statusCode: 403, message: 'Forbidden', error: 'Forbidden' } } })
    grant(@Req() req: any, @Body() dto: GrantPermissionDto) {
        return this.permissionsService.grant(req.user.userId, dto);
    }

    @Post('revoke')
    @ApiPermission('USER_UPDATE', 2)
    @ApiResponse({ status: 201, description: 'Revoked' })
    @ApiResponse({ status: 401, description: 'Unauthorized', schema: { example: { statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' } } })
    @ApiResponse({ status: 403, description: 'Forbidden (insufficient permission)', schema: { example: { statusCode: 403, message: 'Forbidden', error: 'Forbidden' } } })
    revoke(@Req() req: any, @Body() dto: RevokePermissionDto) {
        return this.permissionsService.revoke(req.user.userId, dto);
    }

    @Get('user/:id')
    @ApiPermission('USER_READ', 1)
    @ApiResponse({ status: 200, description: 'User permissions' })
    @ApiResponse({ status: 401, description: 'Unauthorized', schema: { example: { statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' } } })
    @ApiResponse({ status: 403, description: 'Forbidden (insufficient permission)', schema: { example: { statusCode: 403, message: 'Forbidden', error: 'Forbidden' } } })
    list(@Param('id') id: string) {
        return this.permissionsService.listUserPermissions(+id);
    }
}
