import { Controller, Get, Post, Body, Param, ParseIntPipe, Patch, Delete, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { RecommendationsService } from './recommendations.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { AddItemDto } from './dto/add-item.dto';
import { ReorderItemsDto } from './dto/reorder-items.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission, ApiPermission } from '../auth/permissions.decorator';

@ApiTags('recommendations')
@Controller('recommendations')
export class RecommendationsController {
    constructor(private readonly svc: RecommendationsService) { }

    @Get('public')
    @ApiOperation({ summary: 'Get active recommendation sections with items' })
    publicList() {
        return this.svc.publicRecommendations();
    }

    @Get('sections')
    @ApiOperation({ summary: 'List sections' })
    listSections(@Query('all') all?: string) {
        return this.svc.listSections(all === 'true');
    }

    @Post('sections')
    @ApiOperation({ summary: 'Create section' })
    @UseGuards(JwtAuthGuard, PermissionGuard)
    @ApiPermission('RECOMMENDATION_MANAGE', 1)
    @ApiBearerAuth('JWT-auth')
    @ApiResponse({ status: 401, description: 'Unauthorized', schema: { example: { statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' } } })
    @ApiResponse({ status: 403, description: 'Forbidden (insufficient permission)', schema: { example: { statusCode: 403, message: 'Forbidden', error: 'Forbidden' } } })
    createSection(@Body() dto: CreateSectionDto) {
        return this.svc.createSection(dto);
    }

    @Get('sections/:id')
    @ApiOperation({ summary: 'Get section detail' })
    getSection(@Param('id', ParseIntPipe) id: number) {
        return this.svc.getSection(id);
    }

    @Patch('sections/:id')
    @ApiOperation({ summary: 'Update section' })
    @UseGuards(JwtAuthGuard, PermissionGuard)
    @ApiPermission('RECOMMENDATION_MANAGE', 1)
    @ApiBearerAuth('JWT-auth')
    @ApiResponse({ status: 401, description: 'Unauthorized', schema: { example: { statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' } } })
    @ApiResponse({ status: 403, description: 'Forbidden (insufficient permission)', schema: { example: { statusCode: 403, message: 'Forbidden', error: 'Forbidden' } } })
    updateSection(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSectionDto) {
        if (dto.sectionOrder) {
            this.svc.batchReorder(dto.sectionOrder);
        }
        return this.svc.updateSection(id, dto);
    }

    @Delete('sections/:id')
    @ApiOperation({ summary: 'Delete section' })
    @UseGuards(JwtAuthGuard, PermissionGuard)
    @ApiPermission('RECOMMENDATION_MANAGE', 1)
    @ApiBearerAuth('JWT-auth')
    @ApiResponse({ status: 401, description: 'Unauthorized', schema: { example: { statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' } } })
    @ApiResponse({ status: 403, description: 'Forbidden (insufficient permission)', schema: { example: { statusCode: 403, message: 'Forbidden', error: 'Forbidden' } } })
    deleteSection(@Param('id', ParseIntPipe) id: number) {
        return this.svc.deleteSection(id);
    }

    @Post('sections/:id/items')
    @ApiOperation({ summary: 'Add book to section' })
    @UseGuards(JwtAuthGuard, PermissionGuard)
    @ApiPermission('RECOMMENDATION_MANAGE', 1)
    @ApiBearerAuth('JWT-auth')
    @ApiResponse({ status: 401, description: 'Unauthorized', schema: { example: { statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' } } })
    @ApiResponse({ status: 403, description: 'Forbidden (insufficient permission)', schema: { example: { statusCode: 403, message: 'Forbidden', error: 'Forbidden' } } })
    addItem(@Param('id', ParseIntPipe) id: number, @Body() dto: AddItemDto) {
        return this.svc.addItem(id, dto);
    }

    @Delete('sections/:sectionId/items/:itemId')
    @ApiOperation({ summary: 'Remove item from section' })
    @UseGuards(JwtAuthGuard, PermissionGuard)
    @ApiPermission('RECOMMENDATION_MANAGE', 1)
    @ApiBearerAuth('JWT-auth')
    @ApiResponse({ status: 401, description: 'Unauthorized', schema: { example: { statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' } } })
    @ApiResponse({ status: 403, description: 'Forbidden (insufficient permission)', schema: { example: { statusCode: 403, message: 'Forbidden', error: 'Forbidden' } } })
    removeItem(
        @Param('sectionId', ParseIntPipe) sectionId: number,
        @Param('itemId', ParseIntPipe) itemId: number,
    ) {
        return this.svc.removeItem(sectionId, itemId);
    }

    @Patch('sections/:id/items/reorder')
    @ApiOperation({ summary: 'Reorder items inside section' })
    @UseGuards(JwtAuthGuard, PermissionGuard)
    @RequirePermission('RECOMMENDATION_MANAGE', 1)
    @ApiBearerAuth('JWT-auth')
    @ApiResponse({ status: 401, description: 'Unauthorized', schema: { example: { statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' } } })
    @ApiResponse({ status: 403, description: 'Forbidden (insufficient permission)', schema: { example: { statusCode: 403, message: 'Forbidden', error: 'Forbidden' } } })
    reorderItems(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: ReorderItemsDto,
    ) {
        return this.svc.reorderItems(id, dto);
    }
}
