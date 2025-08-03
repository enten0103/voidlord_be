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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { BooksService } from './books.service';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { BookResponseDto } from './dto/book-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('books')
@Controller('books')
@UseInterceptors(ClassSerializerInterceptor)
export class BooksController {
    constructor(private readonly booksService: BooksService) { }

    @Post()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
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

    @Patch(':id')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
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
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Delete book' })
    @ApiResponse({ status: 200, description: 'Book deleted successfully' })
    @ApiResponse({ status: 404, description: 'Book not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    remove(@Param('id') id: string) {
        return this.booksService.remove(+id);
    }
}
