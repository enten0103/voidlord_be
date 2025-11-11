import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Patch,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { RecommendationsService } from './recommendations.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { AddItemDto } from './dto/add-item.dto';
import { ReorderItemsDto } from './dto/reorder-items.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import {
  RequirePermission,
  ApiPermission,
} from '../auth/permissions.decorator';

@ApiTags('recommendations')
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly svc: RecommendationsService) {}

  @Get('public')
  @ApiOperation({
    summary: 'Get active recommendation sections (media libraries) with items',
  })
  @ApiResponse({
    status: 200,
    description:
      'List of active sections with items (each item links a MediaLibrary)',
    schema: {
      example: [
        {
          id: 1,
          key: 'today_hot',
          title: '今日最热',
          active: true,
          sort_order: 0,
          items: [
            {
              id: 10,
              library: { id: 7, name: '编辑精选' },
              position: 0,
              note: '编辑推荐',
            },
          ],
        },
      ],
    },
  })
  publicList() {
    return this.svc.publicRecommendations();
  }

  @Get('sections')
  @ApiOperation({ summary: 'List sections' })
  @ApiQuery({
    name: 'all',
    required: false,
    description: 'Include inactive sections when true',
  })
  @ApiResponse({
    status: 200,
    description: 'List of sections (optionally including inactive)',
  })
  listSections(@Query('all') all?: string) {
    return this.svc.listSections(all === 'true');
  }

  @Post('sections')
  @ApiOperation({ summary: 'Create section' })
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiPermission('RECOMMENDATION_MANAGE', 1)
  @ApiBearerAuth('JWT-auth')
  @ApiBody({
    schema: {
      properties: {
        key: { type: 'string', example: 'today_hot' },
        title: { type: 'string', example: '今日最热' },
        description: { type: 'string', example: '根据近期热度' },
        sort_order: { type: 'number', example: 0 },
        active: { type: 'boolean', example: true },
      },
      required: ['key', 'title'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Section created',
    schema: {
      example: {
        id: 1,
        key: 'today_hot',
        title: '今日最热',
        active: true,
        sort_order: 0,
        items: [],
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
  createSection(@Body() dto: CreateSectionDto) {
    return this.svc.createSection(dto);
  }

  @Get('sections/:id')
  @ApiOperation({ summary: 'Get section detail (with media libraries)' })
  @ApiParam({ name: 'id', description: 'Section ID' })
  @ApiResponse({
    status: 200,
    description: 'Section detail',
    schema: {
      example: {
        id: 1,
        key: 'today_hot',
        title: '今日最热',
        items: [{ id: 10, library: { id: 7 }, position: 0 }],
      },
    },
  })
  getSection(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getSection(id);
  }

  @Patch('sections/:id')
  @ApiOperation({ summary: 'Update section' })
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiPermission('RECOMMENDATION_MANAGE', 1)
  @ApiBearerAuth('JWT-auth')
  @ApiParam({ name: 'id', description: 'Section ID' })
  @ApiBody({
    schema: {
      properties: {
        key: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        sort_order: { type: 'number' },
        active: { type: 'boolean' },
        sectionOrder: {
          type: 'array',
          items: { type: 'number' },
          description: 'Optional batch reorder of section IDs',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Section updated' })
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
  updateSection(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSectionDto,
  ) {
    if (dto.sectionOrder) {
      void this.svc.batchReorder(dto.sectionOrder);
    }
    return this.svc.updateSection(id, dto);
  }

  @Delete('sections/:id')
  @ApiOperation({ summary: 'Delete section' })
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiPermission('RECOMMENDATION_MANAGE', 1)
  @ApiBearerAuth('JWT-auth')
  @ApiParam({ name: 'id', description: 'Section ID' })
  @ApiResponse({ status: 200, description: 'Section deleted (idempotent)' })
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
  deleteSection(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteSection(id);
  }

  @Post('sections/:id/items')
  @ApiOperation({ summary: 'Add media library to section' })
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiPermission('RECOMMENDATION_MANAGE', 1)
  @ApiBearerAuth('JWT-auth')
  @ApiParam({ name: 'id', description: 'Section ID' })
  @ApiBody({
    schema: {
      properties: {
        mediaLibraryId: { type: 'number', example: 7 },
        position: { type: 'number', example: 0 },
        note: { type: 'string', example: '编辑推荐' },
      },
      required: ['mediaLibraryId'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Item added (media library linked)',
    schema: {
      example: {
        id: 10,
        section: { id: 1 },
        library: { id: 7 },
        position: 0,
        note: '编辑推荐',
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
  addItem(@Param('id', ParseIntPipe) id: number, @Body() dto: AddItemDto) {
    return this.svc.addItem(id, dto);
  }

  @Delete('sections/:sectionId/items/:itemId')
  @ApiOperation({ summary: 'Remove item from section' })
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiPermission('RECOMMENDATION_MANAGE', 1)
  @ApiBearerAuth('JWT-auth')
  @ApiParam({ name: 'sectionId', description: 'Section ID' })
  @ApiParam({ name: 'itemId', description: 'Item ID' })
  @ApiResponse({ status: 200, description: 'Item removed (idempotent)' })
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
  @ApiParam({ name: 'id', description: 'Section ID' })
  @ApiBody({
    schema: {
      properties: {
        itemIds: {
          type: 'array',
          items: { type: 'number' },
          example: [10, 11, 12],
        },
      },
      required: ['itemIds'],
    },
  })
  @ApiResponse({ status: 200, description: 'Items reordered' })
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
  reorderItems(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReorderItemsDto,
  ) {
    return this.svc.reorderItems(id, dto);
  }
}
