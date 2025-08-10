import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BooksService } from '../modules/books/books.service';
import { Book } from '../entities/book.entity';
import { Tag } from '../entities/tag.entity';
import { NotFoundException } from '@nestjs/common';

describe('BooksService (legacy spec refactored)', () => {
    let service: BooksService;
    const mockBookRepository = {
        findOne: jest.fn(),
        createQueryBuilder: jest.fn(),
        find: jest.fn(),
    };
    const mockTagRepository = {};

    beforeEach(async () => {
        jest.clearAllMocks();
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BooksService,
                { provide: getRepositoryToken(Book), useValue: mockBookRepository },
                { provide: getRepositoryToken(Tag), useValue: mockTagRepository },
            ],
        }).compile();
        service = module.get(BooksService);
    });

    describe('recommendByBook (subset)', () => {
        it('returns [] when limit <= 0', async () => {
            const res = await service.recommendByBook(10, 0);
            expect(res).toEqual([]);
            expect(mockBookRepository.findOne).not.toHaveBeenCalled();
        });

        it('throws NotFound when base book missing', async () => {
            mockBookRepository.findOne.mockResolvedValueOnce(null);
            await expect(service.recommendByBook(999)).rejects.toBeInstanceOf(NotFoundException);
        });

        it('returns [] when base book has no tags', async () => {
            mockBookRepository.findOne.mockResolvedValueOnce({ id: 1, tags: [] });
            const res = await service.recommendByBook(1);
            expect(res).toEqual([]);
        });
    });
});
