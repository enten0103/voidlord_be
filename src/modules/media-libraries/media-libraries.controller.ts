import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtRequestWithUser } from '../../types/request.interface';
import { MediaLibrariesService } from './media-libraries.service';
import { CreateMediaLibraryDto } from './dto/create-media-library.dto';
import {
  MediaLibraryCreatedDto,
  MediaLibrarySummaryDto,
  MediaLibraryDetailDto,
  MediaLibraryUpdatedDto,
  MediaLibraryCopiedDto,
  AddBookResponseDto,
  AddLibraryResponseDto,
  OkResponseDto,
} from './dto/media-library-responses.dto';

@ApiTags('media-libraries')
@Controller('media-libraries')
export class MediaLibrariesController {
  constructor(private readonly service: MediaLibrariesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a media library (user owned)' })
  @ApiResponse({ status: 201, description: 'Created' })
  @ApiCreatedResponse({ type: MediaLibraryCreatedDto })
  create(
    @Body() dto: CreateMediaLibraryDto,
    @Req() req: JwtRequestWithUser,
  ): Promise<MediaLibraryCreatedDto> {
    return this.service.create(
      req.user.userId,
      dto,
    ) as Promise<MediaLibraryCreatedDto>;
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'List my media libraries' })
  @ApiResponse({ status: 200, description: 'List' })
  @ApiOkResponse({ type: MediaLibrarySummaryDto, isArray: true })
  listMine(@Req() req: JwtRequestWithUser): Promise<MediaLibrarySummaryDto[]> {
    return this.service.listMine(req.user.userId) as Promise<
      MediaLibrarySummaryDto[]
    >;
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get media library detail (private requires owner)',
  })
  @ApiResponse({ status: 200, description: 'Detail' })
  @ApiOkResponse({ type: MediaLibraryDetailDto })
  getOne(
    @Param('id') id: string,
    @Req() req: JwtRequestWithUser,
  ): Promise<MediaLibraryDetailDto> {
    return this.service.getOne(
      +id,
      req.user.userId,
    ) as Promise<MediaLibraryDetailDto>;
  }

  @Post(':id/books/:bookId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Add book to media library' })
  @ApiResponse({ status: 201, description: 'Added' })
  @ApiCreatedResponse({ type: AddBookResponseDto })
  addBook(
    @Param('id') id: string,
    @Param('bookId') bookId: string,
    @Req() req: JwtRequestWithUser,
  ): Promise<AddBookResponseDto> {
    return this.service.addBook(
      +id,
      req.user.userId,
      +bookId,
    ) as Promise<AddBookResponseDto>;
  }

  @Post(':id/libraries/:childId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Nest a child media library' })
  @ApiResponse({ status: 201, description: 'Nested' })
  @ApiCreatedResponse({ type: AddLibraryResponseDto })
  addLibrary(
    @Param('id') id: string,
    @Param('childId') childId: string,
    @Req() req: JwtRequestWithUser,
  ): Promise<AddLibraryResponseDto> {
    return this.service.addLibrary(
      +id,
      req.user.userId,
      +childId,
    ) as Promise<AddLibraryResponseDto>;
  }

  @Delete(':id/items/:itemId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Remove an item (book or child library) by item id',
  })
  @ApiResponse({ status: 200, description: 'Removed' })
  @ApiOkResponse({ type: OkResponseDto })
  removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Req() req: JwtRequestWithUser,
  ): Promise<OkResponseDto> {
    return this.service.removeItem(
      +id,
      req.user.userId,
      +itemId,
    ) as Promise<OkResponseDto>;
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update media library (owner only)' })
  @ApiResponse({ status: 200, description: 'Updated' })
  @ApiOkResponse({ type: MediaLibraryUpdatedDto })
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateMediaLibraryDto>,
    @Req() req: JwtRequestWithUser,
  ): Promise<MediaLibraryUpdatedDto> {
    return this.service.update(
      +id,
      req.user.userId,
      dto,
    ) as Promise<MediaLibraryUpdatedDto>;
  }

  @Post(':id/copy')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Copy a (public or owned) media library to my space',
  })
  @ApiResponse({ status: 201, description: 'Copied' })
  @ApiCreatedResponse({ type: MediaLibraryCopiedDto })
  copy(
    @Param('id') id: string,
    @Req() req: JwtRequestWithUser,
  ): Promise<MediaLibraryCopiedDto> {
    return this.service.copy(
      +id,
      req.user.userId,
    ) as Promise<MediaLibraryCopiedDto>;
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Delete media library (owner only; system disallowed)',
  })
  @ApiResponse({ status: 200, description: 'Deleted' })
  @ApiOkResponse({ type: OkResponseDto })
  remove(
    @Param('id') id: string,
    @Req() req: JwtRequestWithUser,
  ): Promise<OkResponseDto> {
    return this.service.remove(+id, req.user.userId) as Promise<OkResponseDto>;
  }
}
