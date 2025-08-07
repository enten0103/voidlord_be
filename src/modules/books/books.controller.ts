import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Query,
    UseGuards,
    UseInterceptors,
    ClassSerializerInterceptor,
    BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { BooksService } from './books.service';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { BookResponseDto } from './dto/book-response.dto';
import { SearchBooksDto } from './dto/search-books.dto';
import { JwtAuthGuard } from '../modules/auth/guards/jwt-auth.guard';

@ApiTags('books')
@Controller('books')
@UseInterceptors(ClassSerializerInterceptor)
export class BooksController {
    constructor(private readonly booksService: BooksService) { }

    @Post()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Create a new book' })
    @ApiResponse({
        status: 201,
        description: 'Book created successfully',
        type: BookResponseDto,
    })
    @ApiResponse({ status: 409, description: 'Book with this hash already exists' })
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
        example: 'author,genre'
    })
    findAll(@Query('tags') tags?: string) {
        if (tags) {
            const tagKeys = tags.split(',').map(tag => tag.trim());
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
    async searchByTags(@Body() searchDto: SearchBooksDto) {
        // 按tag keys搜索
        if (searchDto.tagKeys) {
            const tagKeys = searchDto.tagKeys.split(',').map(tag => tag.trim());
            return this.booksService.findByTags(tagKeys);
        }

        // 按单个key-value对搜索
        if (searchDto.tagKey && searchDto.tagValue) {
            return this.booksService.findByTagKeyValue(searchDto.tagKey, searchDto.tagValue);
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
            const tagIds = searchDto.tagIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
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
        const tagIds = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id) && id > 0);
        if (tagIds.length === 0) {
            throw new BadRequestException('No valid tag IDs provided');
        }
        return this.booksService.findByTagIds(tagIds);
    }

    @Patch(':id')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Update book' })
    @ApiResponse({
        status: 200,
        description: 'Book updated successfully',
        type: BookResponseDto,
    })
    @ApiResponse({ status: 404, description: 'Book not found' })
    @ApiResponse({ status: 409, description: 'Book with this hash already exists' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    update(@Param('id') id: string, @Body() updateBookDto: UpdateBookDto) {
        return this.booksService.update(+id, updateBookDto);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Delete book' })
    @ApiResponse({ status: 200, description: 'Book deleted successfully' })
    @ApiResponse({ status: 404, description: 'Book not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    remove(@Param('id') id: string) {
        return this.booksService.remove(+id);
    }
}
