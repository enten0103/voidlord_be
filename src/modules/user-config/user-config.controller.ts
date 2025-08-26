import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserConfigService } from './user-config.service';
import { UpdateUserConfigDto } from './dto/update-user-config.dto';

@ApiTags('user-config')
@Controller('user-config')
export class UserConfigController {
    constructor(private readonly service: UserConfigService) { }

    @Get(':userId/public')
    @ApiOperation({ summary: 'Get public config by user id' })
    async publicProfile(@Param('userId') userId: string) {
        return this.service.getPublicByUserId(+userId);
    }

    @UseGuards(JwtAuthGuard)
    @Get('me')
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Get my config (create if missing)' })
    my(@Req() req: any) {
        return this.service.getOrCreateByUserId(req.user.userId);
    }

    @UseGuards(JwtAuthGuard)
    @Patch('me')
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Update my config' })
    @ApiResponse({ status: 200, description: 'Updated' })
    update(@Req() req: any, @Body() dto: UpdateUserConfigDto) {
        return this.service.updateMy(req.user.userId, dto);
    }
}
