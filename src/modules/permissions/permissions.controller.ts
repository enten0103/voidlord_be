import { Body, Controller, Get, Logger, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
    grant(@Req() req: any, @Body() dto: GrantPermissionDto) {
        return this.permissionsService.grant(req.user.userId, dto);
    }

    @Post('revoke')
    @ApiPermission('USER_UPDATE', 2)
    revoke(@Req() req: any, @Body() dto: RevokePermissionDto) {
        return this.permissionsService.revoke(req.user.userId, dto);
    }

    @Get('user/:id')
    @ApiPermission('USER_READ', 1)
    list(@Param('id') id: string) {
        return this.permissionsService.listUserPermissions(+id);
    }
}
