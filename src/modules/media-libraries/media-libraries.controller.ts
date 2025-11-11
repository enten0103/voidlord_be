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
  @ApiOperation({
    summary: 'Create a media library (user owned)',
    description:
      '为当前用户创建新的媒体库。名称在用户空间必须唯一。系统库无法由该接口创建。',
  })
  @ApiResponse({ status: 201, description: 'Created 成功' })
  @ApiResponse({
    status: 409,
    description: '库名重复 (Library name already exists)',
  })
  @ApiResponse({ status: 400, description: '验证失败 (Validation error)' })
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
  @ApiOperation({
    summary: 'List my media libraries',
    description: '列出当前用户的所有媒体库（包含系统库）。按创建时间倒序。',
  })
  @ApiResponse({ status: 200, description: 'List' })
  @ApiOkResponse({ type: MediaLibrarySummaryDto, isArray: true })
  listMine(@Req() req: JwtRequestWithUser): Promise<MediaLibrarySummaryDto[]> {
    return this.service.listMine(req.user.userId) as Promise<
      MediaLibrarySummaryDto[]
    >;
  }

  @Get('reading-record')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get my system reading record media library',
    description:
      '获取系统自动创建的“系统阅读记录”媒体库详情，只读；异常缺失返回 404。',
  })
  @ApiResponse({ status: 404, description: '系统阅读记录库缺失（异常状态）' })
  @ApiResponse({ status: 200, description: 'Detail' })
  @ApiOkResponse({ type: MediaLibraryDetailDto })
  getReadingRecord(
    @Req() req: JwtRequestWithUser,
  ): Promise<MediaLibraryDetailDto> {
    return this.service.getReadingRecord(
      req.user.userId,
    ) as Promise<MediaLibraryDetailDto>;
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get media library detail',
    description:
      '获取媒体库详情。私有库仅拥有者可访问；系统库只读不可修改内容（add/remove 受限）。',
  })
  @ApiResponse({ status: 200, description: 'Detail' })
  @ApiResponse({ status: 403, description: '私有库拒绝访问 (Private)' })
  @ApiResponse({ status: 404, description: '未找到 (Library not found)' })
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
  @ApiOperation({
    summary: 'Add book to media library',
    description:
      '向媒体库添加书籍。系统库不可添加。重复添加返回 409。仅库拥有者可操作。',
  })
  @ApiResponse({ status: 201, description: 'Added 成功' })
  @ApiResponse({ status: 403, description: '非拥有者或系统库锁定' })
  @ApiResponse({ status: 404, description: '库或书籍未找到' })
  @ApiResponse({ status: 409, description: '书籍已在库中' })
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
  @ApiOperation({
    summary: 'Nest a child media library',
    description: '父库嵌套子库。不能自嵌套。系统库不可嵌套。重复嵌套返回 409。',
  })
  @ApiResponse({ status: 201, description: 'Nested 成功' })
  @ApiResponse({ status: 403, description: '非拥有者或系统库锁定' })
  @ApiResponse({ status: 404, description: '父库或子库未找到' })
  @ApiResponse({ status: 409, description: '重复嵌套 / 自嵌套冲突' })
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
    summary: 'Remove an item (book or child library)',
    description:
      '根据 itemId 删除书籍或子库条目。系统库锁定不可操作。仅拥有者可删除。',
  })
  @ApiResponse({ status: 200, description: 'Removed 成功' })
  @ApiResponse({ status: 403, description: '非拥有者或系统库锁定' })
  @ApiResponse({ status: 404, description: '条目或库未找到' })
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
  @ApiOperation({
    summary: 'Update media library',
    description:
      '更新媒体库属性（名称去重校验）。系统库不可更新。仅拥有者可操作。',
  })
  @ApiResponse({ status: 200, description: 'Updated 成功' })
  @ApiResponse({ status: 403, description: '非拥有者或系统库锁定' })
  @ApiResponse({ status: 404, description: '库未找到' })
  @ApiResponse({ status: 409, description: '名称重复冲突' })
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
    summary: 'Copy a media library',
    description:
      '复制公开或自己拥有的库到个人空间。自动处理命名冲突 (追加 copy 标记)。系统库不可复制。',
  })
  @ApiResponse({ status: 201, description: 'Copied 成功' })
  @ApiResponse({ status: 403, description: '私有且非拥有者 / 系统库锁定' })
  @ApiResponse({ status: 404, description: '库未找到' })
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
    summary: 'Delete media library',
    description: '删除用户自建媒体库。系统库不可删除。仅拥有者可操作。',
  })
  @ApiResponse({ status: 200, description: 'Deleted 成功' })
  @ApiResponse({ status: 403, description: '非拥有者或系统库锁定' })
  @ApiResponse({ status: 404, description: '库未找到' })
  @ApiOkResponse({ type: OkResponseDto })
  remove(
    @Param('id') id: string,
    @Req() req: JwtRequestWithUser,
  ): Promise<OkResponseDto> {
    return this.service.remove(+id, req.user.userId) as Promise<OkResponseDto>;
  }
}
