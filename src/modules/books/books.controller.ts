import {
    BadRequestException,
    Body,
    ClassSerializerInterceptor,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
    UseGuards,
    UseInterceptors,
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

@ApiTags('books')
@Controller('books')
@UseInterceptors(ClassSerializerInterceptor)
export class BooksController {
    constructor(private readonly booksService: BooksService) { }

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
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    create(@Body() createBookDto: CreateBookDto) {
        return this.booksService.create(createBookDto);
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
    @ApiResponse({ status: 401, description: 'Unauthorized' })
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
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    remove(@Param('id') id: string) {
        return this.booksService.remove(+id);
    }
}
