import {
  Controller,
  Post,
  Patch,
  Get,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  ClassSerializerInterceptor,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { ApiPermission } from '../auth/permissions.decorator';
import type { JwtRequestWithUser } from '../../types/request.interface';
import { ReadingRecordsService } from './reading-records.service';
import { StartReadingDto } from './dto/start-reading.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { ReadingRecord } from '../../entities/reading-record.entity';

@ApiTags('reading-records')
@Controller('reading-records')
@UseInterceptors(ClassSerializerInterceptor)
export class ReadingRecordsController {
  constructor(private readonly service: ReadingRecordsService) {}

  // ── Start a reading session ──────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiPermission('BOOK_READ', 1)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Start a reading session' })
  @ApiResponse({ status: 201, type: ReadingRecord })
  async start(
    @Req() req: JwtRequestWithUser,
    @Body() dto: StartReadingDto,
  ): Promise<ReadingRecord> {
    return this.service.start(req.user.userId, dto);
  }

  // ── Heartbeat (5-min poll) ───────────────────────────────

  @Patch(':id/heartbeat')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiPermission('BOOK_READ', 1)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Heartbeat: update last_active_at and reading position. ' +
      'No explicit end — session duration = last_active_at - started_at.',
  })
  @ApiResponse({ status: 200, type: ReadingRecord })
  async heartbeat(
    @Req() req: JwtRequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: HeartbeatDto,
  ): Promise<ReadingRecord> {
    return this.service.heartbeat(req.user.userId, id, dto);
  }

  // ── User timeline ────────────────────────────────────────

  @Get('me')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiPermission('BOOK_READ', 1)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current user reading timeline' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getTimeline(
    @Req() req: JwtRequestWithUser,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.getTimeline(
      req.user.userId,
      limit ? parseInt(limit, 10) : 20,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  // ── Per-book records ─────────────────────────────────────

  @Get('me/books')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiPermission('BOOK_READ', 1)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Get reading timeline grouped by book (paginated distinct books with aggregate stats and preview records)',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({
    name: 'previewCount',
    required: false,
    type: Number,
    description: 'Number of recent records to include per book (default 5)',
  })
  async getGroupedByBook(
    @Req() req: JwtRequestWithUser,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('previewCount') previewCount?: string,
  ) {
    return this.service.getGroupedByBook(
      req.user.userId,
      limit ? parseInt(limit, 10) : 10,
      offset ? parseInt(offset, 10) : 0,
      previewCount ? parseInt(previewCount, 10) : 5,
    );
  }

  @Get('book/:bookId')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiPermission('BOOK_READ', 1)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get reading records for a specific book' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getByBook(
    @Req() req: JwtRequestWithUser,
    @Param('bookId', ParseIntPipe) bookId: number,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.getByBook(
      req.user.userId,
      bookId,
      limit ? parseInt(limit, 10) : 20,
      offset ? parseInt(offset, 10) : 0,
    );
  }
}
