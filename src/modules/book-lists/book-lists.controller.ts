import {
  BadRequestException,
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
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BookListsService } from './book-lists.service';
import { CreateListDto } from './dto/create-list.dto';
import { UpdateListDto } from './dto/update-list.dto';
import { AddBookDto } from './dto/add-book.dto';
import type { JwtRequestWithUser } from '../../types/request.interface';

@ApiTags('book-lists')
@Controller('book-lists')
export class BookListsController {
  constructor(private readonly service: BookListsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a new book list with optional tags' })
  @ApiResponse({
    status: 201,
    description: 'Created',
    schema: {
      example: {
        id: 1,
        name: 'Favorites',
        description: 'My favorite books',
        is_public: false,
        tags: [
          { key: 'genre', value: 'science_fiction' },
          { key: 'mood', value: 'philosophical' },
        ],
        created_at: '2025-01-01T00:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 409, description: 'List name already exists' })
  @ApiResponse({ status: 400, description: 'Invalid tag format' })
  create(@Body() dto: CreateListDto, @Req() req: JwtRequestWithUser) {
    return this.service.create(req.user.userId, dto);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'List my book lists (includes tags and item count)',
  })
  @ApiResponse({
    status: 200,
    description: 'OK',
    schema: {
      example: [
        {
          id: 1,
          name: 'Favorites',
          description: 'My favorite books',
          items_count: 3,
          is_public: false,
          tags: [
            { key: 'genre', value: 'science_fiction' },
            { key: 'status', value: 'reading' },
          ],
          created_at: '2025-01-01T00:00:00.000Z',
          updated_at: '2025-01-02T00:00:00.000Z',
        },
      ],
    },
  })
  my(@Req() req: JwtRequestWithUser) {
    return this.service.listMine(req.user.userId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a book list by ID (owner or public, includes tags)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description:
      'Optional pagination for items (1-100). Default 100 (no pagination used server-side here, full load).',
    example: 100,
  })
  @ApiResponse({
    status: 200,
    description: 'OK',
    schema: {
      example: {
        id: 1,
        name: 'Favorites',
        description: 'My favorite books',
        is_public: true,
        owner_id: 5,
        items_count: 2,
        tags: [{ key: 'genre', value: 'science_fiction' }],
        items: [{ id: 10, book: { id: 1 } }],
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-02T00:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 403, description: 'List is private' })
  @ApiResponse({ status: 404, description: 'List not found' })
  getOne(@Param('id') id: string, @Req() req: unknown) {
    const listId = parseInt(id, 10);
    if (isNaN(listId) || listId <= 0)
      throw new BadRequestException('Invalid list ID');
    const userId = (req as Partial<JwtRequestWithUser>)?.user?.userId;
    return this.service.getOne(listId, userId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update a book list (name, description, is_public, tags)',
  })
  @ApiResponse({
    status: 200,
    description: 'Updated',
    schema: {
      example: {
        id: 1,
        name: 'New Name',
        description: 'Updated description',
        is_public: true,
        tags: [
          { key: 'genre', value: 'fantasy' },
          { key: 'status', value: 'reading' },
        ],
        updated_at: '2025-01-02T00:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Not owner' })
  @ApiResponse({ status: 404, description: 'List not found' })
  @ApiResponse({ status: 409, description: 'List name already exists' })
  @ApiResponse({ status: 400, description: 'Invalid tag format' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateListDto,
    @Req() req: JwtRequestWithUser,
  ) {
    return this.service.update(+id, req.user.userId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete a book list (owner only)' })
  @ApiResponse({
    status: 200,
    description: 'Deleted',
    schema: { example: { ok: true } },
  })
  @ApiResponse({ status: 403, description: 'Not owner' })
  @ApiResponse({ status: 404, description: 'List not found' })
  remove(@Param('id') id: string, @Req() req: JwtRequestWithUser) {
    return this.service.remove(+id, req.user.userId);
  }

  @Post(':id/books')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Add a book to the list (owner only)' })
  @ApiBody({ type: AddBookDto })
  @ApiResponse({
    status: 201,
    description: 'Added',
    schema: {
      example: {
        id: 11,
        listId: 1,
        bookId: 2,
        added_at: '2025-01-01T00:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'List or Book not found' })
  @ApiResponse({ status: 403, description: 'Not owner' })
  @ApiResponse({ status: 409, description: 'Book already in list' })
  addBook(
    @Param('id') id: string,
    @Body() dto: AddBookDto,
    @Req() req: JwtRequestWithUser,
  ) {
    return this.service.addBook(+id, req.user.userId, dto.bookId);
  }

  @Delete(':id/books/:bookId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Remove a book from the list (owner only)' })
  @ApiResponse({
    status: 200,
    description: 'Removed',
    schema: { example: { ok: true } },
  })
  @ApiResponse({ status: 404, description: 'List or Book not in list' })
  @ApiResponse({ status: 403, description: 'Not owner' })
  removeBook(
    @Param('id') id: string,
    @Param('bookId') bookId: string,
    @Req() req: JwtRequestWithUser,
  ) {
    return this.service.removeBook(+id, req.user.userId, +bookId);
  }

  @Post(':id/copy')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Copy a public list (or own private) into my lists (inherits tags, becomes private)',
  })
  @ApiResponse({
    status: 201,
    description: 'Copied',
    schema: {
      example: {
        id: 99,
        name: 'Favorites (copy)',
        tags: [{ key: 'genre', value: 'science_fiction' }],
        items_count: 5,
        is_public: false,
        copied_from: 12,
      },
    },
  })
  @ApiResponse({ status: 403, description: 'List is private' })
  @ApiResponse({ status: 404, description: 'List not found' })
  copy(@Param('id') id: string, @Req() req: JwtRequestWithUser) {
    return this.service.copy(+id, req.user.userId);
  }
}
