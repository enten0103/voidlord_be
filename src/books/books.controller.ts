import {
    BadRequestException,
    Controller,
    Get,
    Param,
    Query
} from '@nestjs/common';
import { BooksService } from './books.service';

@Controller('books')
export class BooksController {
    constructor(private readonly booksService: BooksService) { }

    // ...existing methods...

    @Get('recommend/:id')
    async recommend(@Param('id') id: string, @Query('limit') limit?: string) {
        const bookId = parseInt(id, 10);
        if (isNaN(bookId) || bookId <= 0)
            throw new BadRequestException('Invalid book ID');
        let lim = limit ? parseInt(limit, 10) : 5;
        if (isNaN(lim) || lim <= 0) lim = 5;
        return this.booksService.recommendByBook(bookId, lim);
    }
}
