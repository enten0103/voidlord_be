import {
    BadRequestException,
    Body,
    ClassSerializerInterceptor,
    Controller,
    Delete,
    Get,
    Req,
    Param,
    Patch,
    Post,
    Query,
    UseGuards,
    UseInterceptors,
    ForbiddenException,
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

@ApiTags('books')
@Controller('books')
@UseInterceptors(ClassSerializerInterceptor)
export class BooksController {
    constructor(private readonly booksService: BooksService, private readonly permissions: PermissionsService) { }

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
        status: 409,
        description: 'Book with this hash already exists',
    })
    @ApiResponse({ status: 401, description: 'Unauthorized', schema: { example: { statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' } } })
    @ApiResponse({ status: 403, description: 'Forbidden (insufficient permission)', schema: { example: { statusCode: 403, message: 'Forbidden', error: 'Forbidden' } } })
    create(@Body() createBookDto: CreateBookDto, @Req() req?: any) {
        const userId = req?.user?.userId;
        if (typeof userId === 'number') {
            return this.booksService.create(createBookDto, userId);
        }
        return this.booksService.create(createBookDto as any);
    }

    @Get()
    @ApiOperation({ summary: 'Get all books' })
    @ApiResponse({
        status: 200,
        description: 'Books retrieved successfully',
        type: [BookResponseDto],
    })
    @ApiQuery({
        name: 'tags',
        required: false,
        description: 'Filter by tag keys (comma-separated)',
        example: 'author,genre',
    })
    findAll(@Query('tags') tags?: string) {
        if (tags) {
            const tagKeys = tags.split(',').map((tag) => tag.trim());
            return this.booksService.findByTags(tagKeys);
        }
        return this.booksService.findAll();
    }

    @Get('my')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Get books uploaded by current user' })
    @ApiResponse({ status: 200, description: 'Books retrieved successfully', type: [BookResponseDto] })
    @ApiResponse({ status: 401, description: 'Unauthorized', schema: { example: { statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' } } })
    my(@Req() req: any) {
        const userId = req?.user?.userId;
        if (typeof userId !== 'number') {
            throw new BadRequestException('Unauthorized');
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

    @Get('hash/:hash')
    @ApiOperation({ summary: 'Get book by hash' })
    @ApiResponse({
        status: 200,
        description: 'Book retrieved successfully',
        type: BookResponseDto,
    })
    @ApiResponse({ status: 404, description: 'Book not found' })
    findByHash(@Param('hash') hash: string) {
        return this.booksService.findByHash(hash);
    }

    @Post('search')
    @ApiOperation({ summary: 'Search books by tags' })
    @ApiResponse({
        status: 201,
        description: 'Books found successfully',
        type: [BookResponseDto],
    })
    @ApiResponse({ status: 400, description: 'Invalid search parameters' })
    @ApiBody({
        description: 'Provide one of the supported search patterns. If multiple patterns are supplied, priority order applies: tagKeys > (tagKey+tagValue) > tagFilters > tagId > tagIds. When none is provided, all books are returned.',
        schema: {
            oneOf: [
                {
                    title: 'Tag keys list',
                    example: { tagKeys: 'author,genre' },
                },
                {
                    title: 'Single key-value',
                    example: { tagKey: 'author', tagValue: 'John Doe' },
                },
                {
                    title: 'Multiple key-value filters (OR logic)',
                    example: {
                        tagFilters: [
                            { key: 'author', value: 'John Doe' },
                            { key: 'genre', value: 'Fiction' },
                        ],
                    },
                },
                {
                    title: 'Single tag ID',
                    example: { tagId: 12 },
                },
                {
                    title: 'Multiple tag IDs (AND logic)',
                    example: { tagIds: '12,34,56' },
                },
            ],
        },
        examples: {
            byTagKeys: {
                summary: 'Tag keys only',
                value: { tagKeys: 'author,genre' },
            },
            bySingleKeyValue: {
                summary: 'Single key-value pair',
                value: { tagKey: 'author', tagValue: 'Isaac Asimov' },
            },
            byMultipleKeyValues: {
                summary: 'Multiple key-value OR',
                value: {
                    tagFilters: [
                        { key: 'author', value: 'Isaac Asimov' },
                        { key: 'genre', value: 'Science Fiction' },
                    ],
                },
            },
            bySingleTagId: {
                summary: 'Single tag ID',
                value: { tagId: 5 },
            },
            byMultipleTagIds: {
                summary: 'Multiple tag IDs AND',
                value: { tagIds: '5,8,11' },
            },
        },
    })
    async searchByTags(@Body() searchDto: SearchBooksDto) {
        // 按tag keys搜索
        if (searchDto.tagKeys) {
            const tagKeys = searchDto.tagKeys.split(',').map((tag) => tag.trim());
            return this.booksService.findByTags(tagKeys);
        }

        // 按单个key-value对搜索
        if (searchDto.tagKey && searchDto.tagValue) {
            return this.booksService.findByTagKeyValue(
                searchDto.tagKey,
                searchDto.tagValue,
            );
        }

        // 按多个key-value对搜索
        if (searchDto.tagFilters && searchDto.tagFilters.length > 0) {
            return this.booksService.findByMultipleTagValues(searchDto.tagFilters);
        }

        // 按单个tag ID搜索
        if (searchDto.tagId) {
            return this.booksService.findByTagId(searchDto.tagId);
        }

        // 按多个tag IDs搜索
        if (searchDto.tagIds) {
            const tagIds = searchDto.tagIds
                .split(',')
                .map((id) => parseInt(id.trim()))
                .filter((id) => !isNaN(id));
            if (tagIds.length > 0) {
                return this.booksService.findByTagIds(tagIds);
            }
        }

        // 如果没有提供搜索条件，返回所有书籍
        return this.booksService.findAll();
    }

    @Get('tags/:key/:value')
    @ApiOperation({ summary: 'Get books by specific tag key-value pair' })
    @ApiResponse({
        status: 200,
        description: 'Books retrieved successfully',
        type: [BookResponseDto],
    })
    findByTagKeyValue(@Param('key') key: string, @Param('value') value: string) {
        return this.booksService.findByTagKeyValue(key, value);
    }

    @Get('tag-id/:id')
    @ApiOperation({ summary: 'Get books by tag ID' })
    @ApiResponse({
        status: 200,
        description: 'Books retrieved successfully',
        type: [BookResponseDto],
    })
    @ApiResponse({ status: 400, description: 'Invalid tag ID' })
    findByTagId(@Param('id') id: string) {
        const tagId = parseInt(id);
        if (isNaN(tagId) || tagId <= 0) {
            throw new BadRequestException('Invalid tag ID');
        }
        return this.booksService.findByTagId(tagId);
    }

    @Get('tag-ids/:ids')
    @ApiOperation({ summary: 'Get books by multiple tag IDs (comma-separated)' })
    @ApiResponse({
        status: 200,
        description: 'Books retrieved successfully',
        type: [BookResponseDto],
    })
    @ApiResponse({ status: 400, description: 'Invalid tag IDs' })
    findByTagIds(@Param('ids') ids: string) {
        const tagIds = ids
            .split(',')
            .map((id) => parseInt(id.trim()))
            .filter((id) => !isNaN(id) && id > 0);
        if (tagIds.length === 0) {
            throw new BadRequestException('No valid tag IDs provided');
        }
        return this.booksService.findByTagIds(tagIds);
    }

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
        schema: { example: { statusCode: 400, message: 'Invalid book ID', error: 'Bad Request' } },
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
                    hash: 'rec-b3',
                    title: 'Deep AI Systems',
                    description: 'Advanced concepts',
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
                    hash: 'rec-b1',
                    title: 'AI Patterns',
                    description: 'Overlap 2 tags',
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
        status: 409,
        description: 'Book with this hash already exists',
    })
    @ApiResponse({ status: 401, description: 'Unauthorized', schema: { example: { statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' } } })
    @ApiResponse({ status: 403, description: 'Forbidden (insufficient permission)', schema: { example: { statusCode: 403, message: 'Forbidden', error: 'Forbidden' } } })
    update(@Param('id') id: string, @Body() updateBookDto: UpdateBookDto) {
        return this.booksService.update(+id, updateBookDto);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, PermissionGuard)
    @ApiPermission('BOOK_DELETE', 1)
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Delete book' })
    @ApiResponse({ status: 200, description: 'Book deleted successfully' })
    @ApiResponse({ status: 404, description: 'Book not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized', schema: { example: { statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' } } })
    @ApiResponse({ status: 403, description: 'Forbidden (insufficient permission)', schema: { example: { statusCode: 403, message: 'Forbidden', error: 'Forbidden' } } })
    remove(@Param('id') id: string) {
        return this.booksService.remove(+id);
    }

    // Ratings
    @Get(':id/rating')
    @ApiOperation({ summary: 'Get book rating aggregate (public)' })
    @ApiResponse({ status: 200, description: 'Aggregate rating', schema: { example: { bookId: 1, avg: 4.5, count: 12 } } })
    @ApiResponse({ status: 404, description: 'Book not found' })
    getRating(@Param('id') id: string) {
        return this.booksService.getRating(+id);
    }

    @Get(':id/rating/me')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Get my rating for a book' })
    @ApiResponse({ status: 200, description: 'My rating', schema: { example: { bookId: 1, myRating: 5 } } })
    @ApiResponse({ status: 401, description: 'Unauthorized', schema: { example: { statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' } } })
    @ApiResponse({ status: 404, description: 'Book not found' })
    getMyRating(@Param('id') id: string, @Req() req: any) {
        return this.booksService.getMyRating(+id, req?.user?.userId);
    }

    @Post(':id/rating')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Rate a book (1-5)' })
    @ApiBody({ schema: { properties: { score: { type: 'number', minimum: 1, maximum: 5, example: 5 } }, required: ['score'] } })
    @ApiResponse({ status: 201, description: 'Rating set', schema: { example: { ok: true, bookId: 1, myRating: 5, avg: 4.5, count: 13 } } })
    @ApiResponse({ status: 400, description: 'Invalid score' })
    @ApiResponse({ status: 401, description: 'Unauthorized', schema: { example: { statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' } } })
    @ApiResponse({ status: 404, description: 'Book not found' })
    rate(@Param('id') id: string, @Body() body: RateBookDto, @Req() req: any) {
        return this.booksService.rateBook(+id, req?.user?.userId, body.score);
    }

    @Delete(':id/rating')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Remove my rating' })
    @ApiResponse({ status: 200, description: 'Removed', schema: { example: { ok: true, bookId: 1, avg: 4.3, count: 12 } } })
    @ApiResponse({ status: 401, description: 'Unauthorized', schema: { example: { statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' } } })
    removeMyRating(@Param('id') id: string, @Req() req: any) {
        return this.booksService.removeMyRating(+id, req?.user?.userId);
    }

    // Comments
    @Get(':id/comments')
    @ApiOperation({ summary: 'List comments for a book (public)' })
    @ApiQuery({ name: 'limit', required: false, example: 20 })
    @ApiQuery({ name: 'offset', required: false, example: 0 })
    @ApiResponse({ status: 200, description: 'Comments list', schema: { example: { bookId: 1, total: 1, limit: 20, offset: 0, items: [{ id: 10, content: 'Nice!', created_at: '2025-01-01T00:00:00.000Z', user: { id: 2, username: 'alice' } }] } } })
    @ApiResponse({ status: 404, description: 'Book not found' })
    listComments(@Param('id') id: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
        const lim = limit ? parseInt(limit, 10) : 20;
        const off = offset ? parseInt(offset, 10) : 0;
        return this.booksService.listComments(+id, isNaN(lim) ? 20 : lim, isNaN(off) ? 0 : off);
    }

    @Post(':id/comments')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Add a comment to a book' })
    @ApiBody({ schema: { properties: { content: { type: 'string', minLength: 1, maxLength: 2000, example: 'Great book!' } }, required: ['content'] } })
    @ApiResponse({ status: 201, description: 'Comment created', schema: { example: { id: 11, bookId: 1, content: 'Great book!', created_at: '2025-01-01T00:00:00.000Z' } } })
    @ApiResponse({ status: 401, description: 'Unauthorized', schema: { example: { statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' } } })
    @ApiResponse({ status: 404, description: 'Book not found' })
    addComment(@Param('id') id: string, @Body() body: CreateCommentDto, @Req() req: any) {
        return this.booksService.addComment(+id, req?.user?.userId, body.content);
    }

    @Delete(':id/comments/:commentId')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Delete a comment (owner or COMMENT_MANAGE)' })
    @ApiResponse({ status: 200, description: 'Deleted', schema: { example: { ok: true } } })
    @ApiResponse({ status: 401, description: 'Unauthorized', schema: { example: { statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' } } })
    @ApiResponse({ status: 403, description: 'Forbidden (not owner or missing COMMENT_MANAGE)', schema: { example: { statusCode: 403, message: 'Only owner or COMMENT_MANAGE can delete', error: 'Forbidden' } } })
    async deleteComment(@Param('id') id: string, @Param('commentId') commentId: string, @Req() req: any) {
        const currentUserId = req?.user?.userId as number;
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
        const lvl = await this.permissions.getUserPermissionLevel(currentUserId, 'COMMENT_MANAGE');
        if (lvl < 1) {
            // mimic files policy wording
            throw new ForbiddenException('Only owner or COMMENT_MANAGE can delete');
        }
        return this.booksService.removeComment(bookId, cid);
    }
}
