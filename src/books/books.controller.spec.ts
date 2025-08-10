import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { BooksController } from './books.controller';
import { BooksService } from './books.service';

describe('BooksController (src/books)', () => {
    let controller: BooksController;
    let service: { recommendByBook: jest.Mock };

    const mockBook = { id: 2, title: 'Recommended', hash: 'h2', tags: [] };

    beforeEach(async () => {
        service = { recommendByBook: jest.fn() };
        const module: TestingModule = await Test.createTestingModule({
            controllers: [BooksController],
            providers: [
                { provide: BooksService, useValue: service },
            ],
        }).compile();

        controller = module.get(BooksController);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('recommend', () => {
        it('should call service with default limit = 5 when limit not provided', async () => {
            service.recommendByBook.mockResolvedValue([mockBook]);
            const res = await controller.recommend('1');
            expect(res).toEqual([mockBook]);
            expect(service.recommendByBook).toHaveBeenCalledWith(1, 5);
        });

        it('should parse and pass custom positive limit', async () => {
            service.recommendByBook.mockResolvedValue([mockBook]);
            await controller.recommend('3', '10');
            expect(service.recommendByBook).toHaveBeenCalledWith(3, 10);
        });

        it('should fallback to 5 when limit is non-numeric', async () => {
            service.recommendByBook.mockResolvedValue([]);
            await controller.recommend('3', 'abc');
            expect(service.recommendByBook).toHaveBeenCalledWith(3, 5);
        });

        it('should fallback to 5 when limit <= 0', async () => {
            service.recommendByBook.mockResolvedValue([]);
            await controller.recommend('3', '-2');
            expect(service.recommendByBook).toHaveBeenCalledWith(3, 5);
        });

        it('should throw BadRequestException for non-numeric id', async () => {
            await expect(controller.recommend('abc')).rejects.toBeInstanceOf(BadRequestException);
        });

        it('should throw BadRequestException for negative id', async () => {
            await expect(controller.recommend('-1')).rejects.toBeInstanceOf(BadRequestException);
        });

        it('should forward large limit value unchanged (clamping handled in service)', async () => {
            service.recommendByBook.mockResolvedValue([mockBook]);
            await controller.recommend('5', '200');
            expect(service.recommendByBook).toHaveBeenCalledWith(5, 200);
        });
    });
});

