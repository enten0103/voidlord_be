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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { ApiPermission } from '../auth/permissions.decorator';

@ApiTags('recommendations')
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly svc: RecommendationsService) {}

  // Simplified: no public aggregate endpoint, use /sections with active filter.

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
  @ApiOperation({
    summary: 'Create section (bind single media library)',
  })
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
        mediaLibraryId: { type: 'number', example: 42 },
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
        library: { id: 42 },
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
  @ApiOperation({
    summary: 'Get section detail (with associated media library)',
  })
  @ApiParam({ name: 'id', description: 'Section ID' })
  @ApiResponse({
    status: 200,
    description: 'Section detail',
    schema: {
      example: {
        id: 1,
        key: 'today_hot',
        title: '今日最热',
        library: { id: 7, name: '示例媒体库' },
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
        mediaLibraryId: { type: 'number', example: 42 },
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
  async updateSection(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSectionDto,
  ) {
    if (dto.sectionOrder) {
      await this.svc.batchReorder(dto.sectionOrder);
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

  // Legacy item/public endpoints removed in simplified model.
}
