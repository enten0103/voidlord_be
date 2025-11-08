import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ReadingRecordsService,
  type ReadingRecordResponse,
} from './reading-records.service';
import { UpsertReadingRecordDto } from './dto/upsert-reading-record.dto';
import type { JwtRequestWithUser } from '../../types/request.interface';

@ApiTags('reading-records')
@Controller('reading-records')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class ReadingRecordsController {
  constructor(private readonly service: ReadingRecordsService) {}

  @Post()
  @ApiOperation({ summary: 'Create or update my reading record for a book' })
  @ApiResponse({ status: 201, description: 'Created or Updated' })
  upsert(
    @Body() dto: UpsertReadingRecordDto,
    @Req() req: JwtRequestWithUser,
  ): Promise<ReadingRecordResponse> {
    return this.service.upsert(req.user.userId, dto);
  }

  @Get('my')
  @ApiOperation({ summary: 'List my reading records' })
  list(@Req() req: JwtRequestWithUser): Promise<ReadingRecordResponse[]> {
    return this.service.list(req.user.userId);
  }

  @Get('book/:bookId')
  @ApiOperation({ summary: 'Get my reading record for a specific book' })
  getOne(
    @Param('bookId') bookId: string,
    @Req() req: JwtRequestWithUser,
  ): Promise<ReadingRecordResponse> {
    return this.service.getOne(req.user.userId, +bookId);
  }

  @Get('stats/summary')
  @ApiOperation({ summary: 'Get my reading stats summary' })
  stats(@Req() req: JwtRequestWithUser) {
    return this.service.stats(req.user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete one of my reading records' })
  remove(@Param('id') id: string, @Req() req: JwtRequestWithUser) {
    return this.service.remove(req.user.userId, +id);
  }
}
