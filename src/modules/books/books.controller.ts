import {
  BadRequestException,
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  Put,
  Req,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { ApiPermission } from '../auth/permissions.decorator';
import { BooksService } from './books.service';
import { BookResponseDto } from './dto/book-response.dto';
import { CreateBookDto } from './dto/create-book.dto';
import { SearchBooksDto } from './dto/search-books.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { RateBookDto } from './dto/rate-book.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { PermissionsService } from '../permissions/permissions.service';
import type { JwtRequestWithUser } from '../../types/request.interface';

@ApiTags('books')
@Controller('books')
@UseInterceptors(ClassSerializerInterceptor)
export class BooksController {
  constructor(
    private readonly booksService: BooksService,
    private readonly permissions: PermissionsService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiPermission('BOOK_CREATE', 1)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a new book' })
  @ApiResponse({
    status: 201,
    description: 'Book created successfully',
    type: BookResponseDto,
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
  create(@Body() createBookDto: CreateBookDto, @Req() req: JwtRequestWithUser) {
    return this.booksService.create(createBookDto, req.user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all books' })
  @ApiResponse({
    status: 200,
    description: 'Books retrieved successfully',
    type: [BookResponseDto],
  })
  findAll() {
    return this.booksService.findAll();
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get books uploaded by current user' })
  @ApiResponse({
    status: 200,
    description: 'Books retrieved successfully',
    type: [BookResponseDto],
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
  my(@Req() req: JwtRequestWithUser) {
    const userId = req?.user?.userId;
    if (typeof userId !== 'number') {
      throw new BadRequestException('Missing user');
    }
    return this.booksService.findMine(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get book by ID' })
  @ApiResponse({
    status: 200,
    description: 'Book retrieved successfully',
    type: BookResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Book not found' })
  findOne(@Param('id') id: string) {
    return this.booksService.findOne(+id);
  }

  // findByHash removed (no hash field)

  @Post('search')
  @ApiOperation({
    summary: 'Search books via unified conditions array',
    description:
      'Use logical AND over an array of { target, op, value } conditions. Operators: eq (exact), neq (exclude exact), match (ILIKE partial). Empty body returns all books. Deprecated legacy modes (q/tagKeys/tagKey+tagValue/tagFilters/tagId/tagIds) have been removed.',
  })
  @ApiResponse({
    status: 201,
    description: 'Books found successfully (array or paged object)',
    schema: {
      oneOf: [
        {
          title: 'Array result (no pagination requested)',
          type: 'array',
          items: { $ref: '#/components/schemas/BookResponseDto' },
          example: [
            { id: 1, tags: [{ key: 'author', value: 'Isaac Asimov' }] },
            { id: 2, tags: [{ key: 'author', value: 'J.R.R. Tolkien' }] },
          ],
        },
        {
          title: 'Paged result (limit/offset provided)',
          type: 'object',
          properties: {
            total: { type: 'number', example: 42 },
            limit: { type: 'number', example: 20 },
            offset: { type: 'number', example: 0 },
            items: {
              type: 'array',
              items: { $ref: '#/components/schemas/BookResponseDto' },
            },
          },
          required: ['total', 'limit', 'offset', 'items'],
          example: {
            total: 42,
            limit: 20,
            offset: 0,
            items: [
              { id: 1, tags: [{ key: 'author', value: 'Isaac Asimov' }] },
              { id: 5, tags: [{ key: 'author', value: 'Isaac Asimov' }] },
            ],
          },
        },
      ],
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid search parameters' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        conditions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              target: { type: 'string', example: 'author' },
              op: {
                type: 'string',
                enum: ['eq', 'neq', 'match'],
                example: 'eq',
              },
              value: { type: 'string', example: 'Isaac Asimov' },
            },
            required: ['target', 'op', 'value'],
          },
          description:
            'Logical AND over all conditions. Empty or omitted returns all books.',
        },
      },
    },
    examples: {
      singleEq: {
        summary: 'Single equality condition',
        value: {
          conditions: [{ target: 'author', op: 'eq', value: 'Isaac Asimov' }],
        },
      },
      andCombo: {
        summary: 'AND combination (author eq + genre eq)',
        value: {
          conditions: [
            { target: 'author', op: 'eq', value: 'Isaac Asimov' },
            { target: 'genre', op: 'eq', value: 'Science Fiction' },
          ],
        },
      },
      neqExample: {
        summary: 'Exclude a specific value (neq)',
        value: {
          conditions: [
            { target: 'author', op: 'eq', value: 'Isaac Asimov' },
            { target: 'genre', op: 'neq', value: 'Science Fiction' },
          ],
        },
      },
      matchExample: {
        summary: 'Partial match (ILIKE)',
        value: {
          conditions: [{ target: 'author', op: 'match', value: 'asim' }],
        },
      },
      duplicateConditions: {
        summary: 'Duplicate conditions (AND semantics)',
        value: {
          conditions: [
            { target: 'author', op: 'eq', value: 'Isaac Asimov' },
            { target: 'author', op: 'eq', value: 'Isaac Asimov' },
          ],
        },
      },
      emptyStringValue: {
        summary: 'Empty string value (exact match on empty tag value)',
        value: {
          conditions: [{ target: 'year', op: 'eq', value: '' }],
        },
      },
      invalidOperator: {
        summary: 'Invalid operator example (will 400)',
        value: {
          conditions: [{ target: 'author', op: 'unknown', value: 'x' }],
        },
      },
      empty: { summary: 'Empty body returns all', value: {} },
    },
  })
  async searchByTags(@Body() searchDto: SearchBooksDto) {
    const result = await this.booksService.searchByConditions(
      searchDto.conditions || [],
      searchDto.limit,
      searchDto.offset,
      searchDto.sortBy,
      searchDto.sortOrder,
    );
    return result;
  }

  // Deprecated tag-based GET endpoints removed in favor of unified POST /books/search conditions.

  @Get('recommend/:id')
  @ApiOperation({ summary: 'Recommend similar books by book ID' })
  @ApiResponse({
    status: 200,
    description: 'Recommended books',
    type: [BookResponseDto],
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid book ID (non-numeric or <= 0)',
    schema: {
      example: {
        statusCode: 400,
        message: 'Invalid book ID',
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Book not found' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Max number of recommendations (default 5, max 50)',
    example: 5,
  })
  @ApiQuery({
    name: 'id',
    required: true,
    description: 'Base book ID used as similarity seed',
    example: 42,
  })
  @ApiResponse({
    status: 200,
    description: 'Example recommendation result',
    schema: {
      example: [
        {
          id: 101,
          tags: [
            { id: 5, key: 'topic', value: 'AI', shown: true },
            { id: 7, key: 'lang', value: 'TS', shown: true },
            { id: 9, key: 'level', value: 'Advanced', shown: true },
          ],
          created_at: '2025-08-10T10:00:00.000Z',
          updated_at: '2025-08-10T10:00:00.000Z',
        },
        {
          id: 99,
          tags: [
            { id: 5, key: 'topic', value: 'AI', shown: true },
            { id: 7, key: 'lang', value: 'TS', shown: true },
          ],
          created_at: '2025-08-09T09:00:00.000Z',
          updated_at: '2025-08-09T09:00:00.000Z',
        },
      ],
    },
  })
  recommend(@Param('id') id: string, @Query('limit') limit?: string) {
    const bookId = parseInt(id, 10);
    if (isNaN(bookId) || bookId <= 0) {
      throw new BadRequestException('Invalid book ID');
    }
    let lim = limit ? parseInt(limit, 10) : 5;
    if (isNaN(lim) || lim <= 0) lim = 5;
    if (lim > 50) lim = 50;
    return this.booksService.recommendByBook(bookId, lim);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiPermission('BOOK_UPDATE', 1)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update book' })
  @ApiResponse({
    status: 200,
    description: 'Book updated successfully',
    type: BookResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Book not found' })
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
  update(@Param('id') id: string, @Body() updateBookDto: UpdateBookDto) {
    return this.booksService.update(+id, updateBookDto);
  }

  @Put(':id/cover')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiPermission('BOOK_UPDATE', 1)
  @ApiBearerAuth('JWT-auth')
  @UseInterceptors(FileInterceptor('file', { storage: multer.memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload/replace book cover (stored in MinIO, bound to book)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Cover image file (image/*)',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Cover uploaded and bound to book via tags',
    schema: {
      example: {
        ok: true,
        key: 'books/42/cover.jpg',
        url: 'http://localhost:9000/voidlord/books/42/cover.jpg',
      },
    },
  })
  async uploadCover(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: JwtRequestWithUser,
  ) {
    const bookId = Number(id);
    if (!Number.isFinite(bookId) || bookId <= 0) {
      throw new BadRequestException('Invalid book ID');
    }
    const { key, url } = await this.booksService.setCover(
      bookId,
      file,
      req.user.userId,
    );
    return { ok: true, key, url };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiPermission('BOOK_DELETE', 1)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete book' })
  @ApiResponse({ status: 200, description: 'Book deleted successfully' })
  @ApiResponse({ status: 404, description: 'Book not found' })
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
  remove(@Param('id') id: string) {
    return this.booksService.remove(+id);
  }

  // Ratings
  @Get(':id/rating')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Get book rating aggregate (public, with myRating if logged in)',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({
    status: 200,
    description: 'Aggregate rating (with myRating if logged in)',
    schema: { example: { bookId: 1, avg: 4.5, count: 12, myRating: 5 } },
  })
  @ApiResponse({ status: 404, description: 'Book not found' })
  getRating(
    @Param('id') id: string,
    @Req() req: import('../../types/request.interface').JwtRequestWithUser,
  ) {
    // 支持可选鉴权，未登录时 req.user 可能不存在
    const userId =
      req.user && typeof req.user.userId === 'number'
        ? req.user.userId
        : undefined;
    return this.booksService.getRating(+id, userId);
  }

  @Get(':id/rating/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get my rating for a book' })
  @ApiResponse({
    status: 200,
    description: 'My rating',
    schema: { example: { bookId: 1, myRating: 5 } },
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
  @ApiResponse({ status: 404, description: 'Book not found' })
  getMyRating(@Param('id') id: string, @Req() req: JwtRequestWithUser) {
    return this.booksService.getMyRating(+id, req.user.userId);
  }

  @Post(':id/rating')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Rate a book (1-5)' })
  @ApiBody({
    schema: {
      properties: {
        score: { type: 'number', minimum: 1, maximum: 5, example: 5 },
      },
      required: ['score'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Rating set',
    schema: {
      example: { ok: true, bookId: 1, myRating: 5, avg: 4.5, count: 13 },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid score' })
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
  @ApiResponse({ status: 404, description: 'Book not found' })
  rate(
    @Param('id') id: string,
    @Body() body: RateBookDto,
    @Req() req: JwtRequestWithUser,
  ) {
    return this.booksService.rateBook(+id, req.user.userId, body.score);
  }

  @Delete(':id/rating')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Remove my rating' })
  @ApiResponse({
    status: 200,
    description: 'Removed',
    schema: { example: { ok: true, bookId: 1, avg: 4.3, count: 12 } },
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
  removeMyRating(@Param('id') id: string, @Req() req: JwtRequestWithUser) {
    return this.booksService.removeMyRating(+id, req.user.userId);
  }

  // Comments
  @Get(':id/comments')
  @ApiOperation({
    summary: 'List top-level comments for a book (public) with reply_count',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description:
      'Page size (1-100). Defaults to 20; values <= 0 reset to 20; > 100 clamp to 100.',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    example: 20,
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Offset (>= 0). Defaults to 0; negative values reset to 0.',
    schema: { type: 'integer', minimum: 0, default: 0 },
    example: 0,
  })
  @ApiResponse({
    status: 200,
    description: 'Comments list',
    schema: {
      example: {
        bookId: 1,
        total: 1,
        limit: 20,
        offset: 0,
        items: [
          {
            id: 10,
            content: 'Nice!',
            created_at: '2025-01-01T00:00:00.000Z',
            user: { id: 2, username: 'alice' },
            reply_count: 3,
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Book not found' })
  listComments(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const lim = limit ? parseInt(limit, 10) : 20;
    const off = offset ? parseInt(offset, 10) : 0;
    return this.booksService.listComments(
      +id,
      isNaN(lim) ? 20 : lim,
      isNaN(off) ? 0 : off,
    );
  }

  @Post(':id/comments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Add a comment to a book' })
  @ApiBody({
    schema: {
      properties: {
        content: {
          type: 'string',
          minLength: 1,
          maxLength: 2000,
          example: 'Great book!',
        },
      },
      required: ['content'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Comment created',
    schema: {
      example: {
        id: 11,
        bookId: 1,
        content: 'Great book!',
        created_at: '2025-01-01T00:00:00.000Z',
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
    status: 409,
    description: 'Invalid content',
    content: {
      'application/json': {
        examples: {
          empty: {
            summary: 'Empty content',
            value: {
              statusCode: 409,
              message: 'Content is required',
              error: 'Conflict',
            },
          },
          tooLong: {
            summary: 'Content too long (>2000)',
            value: {
              statusCode: 409,
              message: 'Content too long (max 2000)',
              error: 'Conflict',
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Book not found' })
  addComment(
    @Param('id') id: string,
    @Body() body: CreateCommentDto,
    @Req() req: JwtRequestWithUser,
  ) {
    return this.booksService.addComment(+id, req.user.userId, body.content);
  }

  @Delete(':id/comments/:commentId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete a comment (owner or COMMENT_MANAGE)' })
  @ApiResponse({
    status: 200,
    description: 'Deleted',
    schema: { example: { ok: true } },
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
    description: 'Forbidden (not owner or missing COMMENT_MANAGE)',
    schema: {
      example: {
        statusCode: 403,
        message: 'Only owner or COMMENT_MANAGE can delete',
        error: 'Forbidden',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  async deleteComment(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @Req() req: JwtRequestWithUser,
  ) {
    const currentUserId = req.user.userId;
    const bookId = +id;
    const cid = +commentId;
    const ownerId = await this.booksService.getCommentOwnerId(bookId, cid);
    if (ownerId === null) {
      // not found -> let service throw proper 404
      return this.booksService.removeComment(bookId, cid);
    }
    if (ownerId && ownerId === currentUserId) {
      return this.booksService.removeComment(bookId, cid);
    }
    const lvl = await this.permissions.getUserPermissionLevel(
      currentUserId,
      'COMMENT_MANAGE',
    );
    if (lvl < 1) {
      // mimic files policy wording
      throw new ForbiddenException('Only owner or COMMENT_MANAGE can delete');
    }
    return this.booksService.removeComment(bookId, cid);
  }

  @Get(':id/comments/:commentId/replies')
  @ApiOperation({ summary: 'List replies of a comment (public)' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description:
      'Page size (1-100). Defaults to 20; values <= 0 reset to 20; > 100 clamp to 100.',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    example: 20,
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Offset (>= 0). Defaults to 0; negative values reset to 0.',
    schema: { type: 'integer', minimum: 0, default: 0 },
    example: 0,
  })
  @ApiResponse({
    status: 200,
    description: 'Replies list',
    schema: {
      example: {
        bookId: 1,
        parentId: 10,
        total: 1,
        limit: 20,
        offset: 0,
        items: [
          {
            id: 12,
            content: 'Reply text',
            created_at: '2025-01-01T00:00:00.000Z',
            user: { id: 3, username: 'bob' },
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Book or parent comment not found',
    schema: {
      example: {
        statusCode: 404,
        message: 'Parent comment not found',
        error: 'Not Found',
      },
    },
  })
  listReplies(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const lim = limit ? parseInt(limit, 10) : 20;
    const off = offset ? parseInt(offset, 10) : 0;
    return this.booksService.listReplies(
      +id,
      +commentId,
      isNaN(lim) ? 20 : lim,
      isNaN(off) ? 0 : off,
    );
  }

  @Post(':id/comments/:commentId/replies')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Reply to a comment' })
  @ApiBody({
    schema: {
      properties: {
        content: {
          type: 'string',
          minLength: 1,
          maxLength: 2000,
          example: 'I agree',
        },
      },
      required: ['content'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Reply created',
    schema: {
      example: {
        id: 12,
        bookId: 1,
        parentId: 10,
        content: 'I agree',
        created_at: '2025-01-01T00:00:00.000Z',
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
    status: 404,
    description: 'Book or parent comment not found',
    content: {
      'application/json': {
        examples: {
          book: {
            summary: 'Book missing',
            value: {
              statusCode: 404,
              message: 'Book not found',
              error: 'Not Found',
            },
          },
          parent: {
            summary: 'Parent missing',
            value: {
              statusCode: 404,
              message: 'Parent comment not found',
              error: 'Not Found',
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'Invalid content',
    content: {
      'application/json': {
        examples: {
          empty: {
            summary: 'Empty content',
            value: {
              statusCode: 409,
              message: 'Content is required',
              error: 'Conflict',
            },
          },
          tooLong: {
            summary: 'Content too long (>2000)',
            value: {
              statusCode: 409,
              message: 'Content too long (max 2000)',
              error: 'Conflict',
            },
          },
        },
      },
    },
  })
  reply(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @Body() body: CreateCommentDto,
    @Req() req: JwtRequestWithUser,
  ) {
    return this.booksService.addReply(
      +id,
      req.user.userId,
      +commentId,
      body.content,
    );
  }
}
