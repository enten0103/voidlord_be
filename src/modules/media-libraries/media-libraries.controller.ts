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
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtRequestWithUser } from '../../types/request.interface';
import { MediaLibrariesService } from './media-libraries.service';
import { PaginateQueryDto } from './dto/paginate-query.dto';
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
  VirtualMediaLibraryDetailDto,
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
  @ApiQuery({
    name: 'limit',
    required: false,
    description:
      '分页每页数量 (1-100)。提供任一分页参数时，响应包含 items_count/limit/offset。',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: '分页偏移 (>=0)。未提供则为 0。',
  })
  getReadingRecord(
    @Req() req: JwtRequestWithUser,
    @Query() page?: PaginateQueryDto,
  ): Promise<MediaLibraryDetailDto> {
    return this.service.getReadingRecord(
      req.user.userId,
      page?.limit,
      page?.offset,
    ) as Promise<MediaLibraryDetailDto>;
  }

  @Get('virtual/my-uploaded')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Virtual library of all my uploaded books',
    description:
      '返回当前用户上传的所有书籍组成的虚拟媒体库视图（动态生成，不持久化，id 固定为 0）。',
  })
  @ApiResponse({ status: 200, description: 'Virtual detail' })
  @ApiOkResponse({ type: VirtualMediaLibraryDetailDto })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: '分页每页数量 (1-100)。虚拟库也支持分页。',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: '分页偏移 (>=0)。',
  })
  getVirtualMyUploaded(
    @Req() req: JwtRequestWithUser,
    @Query() page?: PaginateQueryDto,
  ): Promise<VirtualMediaLibraryDetailDto> {
    return this.service.getVirtualUploaded(
      req.user.userId,
      page?.limit,
      page?.offset,
    ) as Promise<VirtualMediaLibraryDetailDto>;
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
  @ApiQuery({
    name: 'limit',
    required: false,
    description: '分页每页数量 (1-100)。未传则返回完整 items（可能很大）。',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: '分页偏移 (>=0)。',
  })
  getOne(
    @Param('id') id: string,
    @Req() req: JwtRequestWithUser,
    @Query() page?: PaginateQueryDto,
  ): Promise<MediaLibraryDetailDto> {
    return this.service.getOne(
      +id,
      req.user.userId,
      page?.limit,
      page?.offset,
    ) as Promise<MediaLibraryDetailDto>;
  }

  @Post(':id/books/:bookId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Add book to media library',
    description:
      '向媒体库添加书籍。系统库亦可添加（用于阅读记录或后续统计）。重复添加返回 409。仅库拥有者可操作。',
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
    description:
      '父库嵌套子库。不能自嵌套。系统库现在也允许嵌套（若不需要可后续收紧）。重复嵌套返回 409。',
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
      '根据 itemId 删除书籍或子库条目。系统库也允许移除条目。仅拥有者可删除。',
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
