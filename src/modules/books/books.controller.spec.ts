import { Test, TestingModule } from '@nestjs/testing';
import { BooksController } from './books.controller';
import { BooksService } from './books.service';
import { JwtAuthGuard } from '../modules/auth/guards/jwt-auth.guard';
import { BadRequestException } from '@nestjs/common';

describe('BooksController', () => {
    let controller: BooksController;
    let service: jest.Mocked<BooksService>;

    const mockBook = {
        id: 1,
        hash: 'abc123',
        title: 'Test Book',
        description: 'A test book',
        tags: [],
        created_at: new Date(),
        updated_at: new Date(),
    };

    const mockBooksService = {
        create: jest.fn(),
        findAll: jest.fn(),
        findOne: jest.fn(),
        findByHash: jest.fn(),
        update: jest.fn(),
        remove: jest.fn(),
        findByTags: jest.fn(),
        findByTagKeyValue: jest.fn(),
        findByMultipleTagValues: jest.fn(),
        findByTagId: jest.fn(),
        findByTagIds: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [BooksController],
            providers: [
                {
                    provide: BooksService,
                    useValue: mockBooksService,
                },
            ],
        })
            .overrideGuard(JwtAuthGuard)
            .useValue({ canActivate: jest.fn(() => true) })
            .compile();

        controller = module.get<BooksController>(BooksController);
        service = module.get(BooksService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('create', () => {
        it('should create a book', async () => {
            const createBookDto = {
                hash: 'abc123',
                title: 'Test Book',
                description: 'A test book',
            };

            mockBooksService.create.mockResolvedValue(mockBook);

            const result = await controller.create(createBookDto);

            expect(result).toEqual(mockBook);
            expect(service.create).toHaveBeenCalledWith(createBookDto);
        });
    });

    describe('findAll', () => {
        it('should return all books', async () => {
            mockBooksService.findAll.mockResolvedValue([mockBook]);

            const result = await controller.findAll();

            expect(result).toEqual([mockBook]);
            expect(service.findAll).toHaveBeenCalled();
        });

        it('should return books filtered by tags', async () => {
            mockBooksService.findByTags.mockResolvedValue([mockBook]);

            const result = await controller.findAll('author,genre');

            expect(result).toEqual([mockBook]);
            expect(service.findByTags).toHaveBeenCalledWith(['author', 'genre']);
        });
    });

    describe('findOne', () => {
        it('should return a book by ID', async () => {
            mockBooksService.findOne.mockResolvedValue(mockBook);

            const result = await controller.findOne('1');

            expect(result).toEqual(mockBook);
            expect(service.findOne).toHaveBeenCalledWith(1);
        });
    });

    describe('findByHash', () => {
        it('should return a book by hash', async () => {
            mockBooksService.findByHash.mockResolvedValue(mockBook);

            const result = await controller.findByHash('abc123');

            expect(result).toEqual(mockBook);
            expect(service.findByHash).toHaveBeenCalledWith('abc123');
        });
    });

    describe('searchByTags', () => {
        it('should search books by tag keys', async () => {
            const searchDto = { tagKeys: 'author,genre' };
            mockBooksService.findByTags.mockResolvedValue([mockBook]);

            const result = await controller.searchByTags(searchDto);

            expect(result).toEqual([mockBook]);
            expect(service.findByTags).toHaveBeenCalledWith(['author', 'genre']);
        });

        it('should search books by tag key-value pair', async () => {
            const searchDto = { tagKey: 'author', tagValue: 'John Doe' };
            mockBooksService.findByTagKeyValue.mockResolvedValue([mockBook]);

            const result = await controller.searchByTags(searchDto);

            expect(result).toEqual([mockBook]);
            expect(service.findByTagKeyValue).toHaveBeenCalledWith('author', 'John Doe');
        });

        it('should search books by multiple tag filters', async () => {
            const searchDto = {
                tagFilters: [
                    { key: 'author', value: 'John Doe' },
                    { key: 'genre', value: 'Fiction' }
                ]
            };
            mockBooksService.findByMultipleTagValues.mockResolvedValue([mockBook]);

            const result = await controller.searchByTags(searchDto);

            expect(result).toEqual([mockBook]);
            expect(service.findByMultipleTagValues).toHaveBeenCalledWith(searchDto.tagFilters);
        });

        it('should return all books when no search criteria provided', async () => {
            const searchDto = {};
            mockBooksService.findAll.mockResolvedValue([mockBook]);

            const result = await controller.searchByTags(searchDto);

            expect(result).toEqual([mockBook]);
            expect(service.findAll).toHaveBeenCalled();
        });

        it('should search books by single tag ID', async () => {
            const searchDto = { tagId: 1 };
            mockBooksService.findByTagId.mockResolvedValue([mockBook]);

            const result = await controller.searchByTags(searchDto);

            expect(result).toEqual([mockBook]);
            expect(service.findByTagId).toHaveBeenCalledWith(1);
        });

        it('should search books by multiple tag IDs', async () => {
            const searchDto = { tagIds: '1,2,3' };
            mockBooksService.findByTagIds.mockResolvedValue([mockBook]);

            const result = await controller.searchByTags(searchDto);

            expect(result).toEqual([mockBook]);
            expect(service.findByTagIds).toHaveBeenCalledWith([1, 2, 3]);
        });
    });

    describe('findByTagKeyValue', () => {
        it('should return books by specific tag key-value pair', async () => {
            mockBooksService.findByTagKeyValue.mockResolvedValue([mockBook]);

            const result = await controller.findByTagKeyValue('author', 'John Doe');

            expect(result).toEqual([mockBook]);
            expect(service.findByTagKeyValue).toHaveBeenCalledWith('author', 'John Doe');
        });
    });

    describe('findByTagId', () => {
        it('should return books by tag ID', async () => {
            mockBooksService.findByTagId.mockResolvedValue([mockBook]);

            const result = await controller.findByTagId('1');

            expect(result).toEqual([mockBook]);
            expect(service.findByTagId).toHaveBeenCalledWith(1);
        });

        it('should throw BadRequestException for invalid tag ID', async () => {
            try {
                await controller.findByTagId('invalid');
                fail('Expected BadRequestException to be thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(BadRequestException);
                expect(error.message).toBe('Invalid tag ID');
            }
        });

        it('should throw BadRequestException for negative tag ID', async () => {
            try {
                await controller.findByTagId('-1');
                fail('Expected BadRequestException to be thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(BadRequestException);
                expect(error.message).toBe('Invalid tag ID');
            }
        });
    });

    describe('findByTagIds', () => {
        it('should return books by multiple tag IDs', async () => {
            mockBooksService.findByTagIds.mockResolvedValue([mockBook]);

            const result = await controller.findByTagIds('1,2,3');

            expect(result).toEqual([mockBook]);
            expect(service.findByTagIds).toHaveBeenCalledWith([1, 2, 3]);
        });

        it('should filter out invalid tag IDs', async () => {
            mockBooksService.findByTagIds.mockResolvedValue([mockBook]);

            const result = await controller.findByTagIds('1,invalid,3,0');

            expect(result).toEqual([mockBook]);
            expect(service.findByTagIds).toHaveBeenCalledWith([1, 3]);
        });

        it('should throw BadRequestException when no valid tag IDs provided', async () => {
            try {
                await controller.findByTagIds('invalid,0,-1');
                fail('Expected BadRequestException to be thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(BadRequestException);
                expect(error.message).toBe('No valid tag IDs provided');
            }
        });
    });

    describe('update', () => {
        it('should update a book', async () => {
            const updateBookDto = { title: 'Updated Title' };
            const updatedBook = { ...mockBook, title: 'Updated Title' };

            mockBooksService.update.mockResolvedValue(updatedBook);

            const result = await controller.update('1', updateBookDto);

            expect(result).toEqual(updatedBook);
            expect(service.update).toHaveBeenCalledWith(1, updateBookDto);
        });
    });

    describe('remove', () => {
        it('should remove a book', async () => {
            mockBooksService.remove.mockResolvedValue(null);
            await controller.remove('1');
            expect(service.remove).toHaveBeenCalledWith(1);
        });
    });
});
