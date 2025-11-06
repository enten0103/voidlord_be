import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { BooksService } from '../books.service';
import { Book } from '../../../entities/book.entity';
import { Tag } from '../../../entities/tag.entity';
import { BookRating } from '../../../entities/book-rating.entity';

describe('BooksService', () => {
    let service: BooksService;
    let bookRepository: jest.Mocked<Repository<Book>>;
    let tagRepository: jest.Mocked<Repository<Tag>>;

    const mockBook: Book = {
        id: 1,
        hash: 'abc123',
        title: 'Test Book',
        description: 'A test book',
        tags: [],
        created_at: new Date(),
        updated_at: new Date(),
    };

    const mockTag: Tag = {
        id: 1,
        key: 'author',
        value: 'John Doe',
        shown: true,
        books: [],
        created_at: new Date(),
        updated_at: new Date(),
    };

    const mockBookRepository = {
        create: jest.fn(),
        save: jest.fn(),
        find: jest.fn(),
        findOne: jest.fn(),
        remove: jest.fn(),
        createQueryBuilder: jest.fn(),
    };

    const mockTagRepository = {
        create: jest.fn(),
        save: jest.fn(),
        findOne: jest.fn(),
    };

    const mockRatingRepository = {
        create: jest.fn(),
        save: jest.fn(),
        findOne: jest.fn(),
        remove: jest.fn(),
        createQueryBuilder: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BooksService,
                {
                    provide: getRepositoryToken(Book),
                    useValue: mockBookRepository,
                },
                {
                    provide: getRepositoryToken(Tag),
                    useValue: mockTagRepository,
                },
                {
                    provide: getRepositoryToken(BookRating),
                    useValue: mockRatingRepository,
                },
            ],
        }).compile();

        service = module.get<BooksService>(BooksService);
        bookRepository = module.get(getRepositoryToken(Book));
        tagRepository = module.get(getRepositoryToken(Tag));
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('create', () => {
        it('should create a book successfully', async () => {
            const createBookDto = {
                hash: 'abc123',
                title: 'Test Book',
                description: 'A test book',
                tags: [{ key: 'author', value: 'John Doe' }],
            };

            mockBookRepository.findOne.mockResolvedValue(null);
            mockTagRepository.findOne.mockResolvedValue(null);
            mockTagRepository.create.mockReturnValue(mockTag);
            mockTagRepository.save.mockResolvedValue(mockTag);
            mockBookRepository.create.mockReturnValue(mockBook);
            mockBookRepository.save.mockResolvedValue(mockBook);

            const result = await service.create(createBookDto);

            expect(result).toEqual(mockBook);
            expect(mockBookRepository.findOne).toHaveBeenCalledWith({
                where: { hash: 'abc123' },
            });
            expect(mockBookRepository.save).toHaveBeenCalled();
        });

        it('should throw ConflictException if book hash already exists', async () => {
            const createBookDto = {
                hash: 'abc123',
                title: 'Test Book',
            };

            mockBookRepository.findOne.mockResolvedValue(mockBook);

            await expect(service.create(createBookDto)).rejects.toThrow(
                ConflictException,
            );
        });
    });

    describe('findAll', () => {
        it('should return all books', async () => {
            mockBookRepository.find.mockResolvedValue([mockBook]);

            const result = await service.findAll();

            expect(result).toEqual([mockBook]);
            expect(mockBookRepository.find).toHaveBeenCalledWith({
                relations: ['tags'],
                order: { created_at: 'DESC' },
            });
        });
    });

    describe('findMine', () => {
        it('should return books created by user', async () => {
            mockBookRepository.find.mockResolvedValue([mockBook]);
            const result = await service.findMine(42);
            expect(result).toEqual([mockBook]);
            expect(mockBookRepository.find).toHaveBeenCalledWith({
                where: { create_by: 42 },
                relations: ['tags'],
                order: { created_at: 'DESC' },
            });
        });
    });

    describe('findOne', () => {
        it('should return a book by ID', async () => {
            mockBookRepository.findOne.mockResolvedValue(mockBook);

            const result = await service.findOne(1);

            expect(result).toEqual(mockBook);
            expect(mockBookRepository.findOne).toHaveBeenCalledWith({
                where: { id: 1 },
                relations: ['tags'],
            });
        });

        it('should throw NotFoundException if book not found', async () => {
            mockBookRepository.findOne.mockResolvedValue(null);

            await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
        });
    });

    describe('findByHash', () => {
        it('should return a book by hash', async () => {
            mockBookRepository.findOne.mockResolvedValue(mockBook);

            const result = await service.findByHash('abc123');

            expect(result).toEqual(mockBook);
            expect(mockBookRepository.findOne).toHaveBeenCalledWith({
                where: { hash: 'abc123' },
                relations: ['tags'],
            });
        });

        it('should throw NotFoundException if book not found', async () => {
            mockBookRepository.findOne.mockResolvedValue(null);

            await expect(service.findByHash('nonexistent')).rejects.toThrow(
                NotFoundException,
            );
        });
    });

    describe('update', () => {
        it('should update a book successfully', async () => {
            const updateBookDto = { title: 'Updated Title' };
            const updatedBook = { ...mockBook, title: 'Updated Title' };

            mockBookRepository.findOne.mockResolvedValue(mockBook);
            mockBookRepository.save.mockResolvedValue(updatedBook);

            const result = await service.update(1, updateBookDto);

            expect(result).toEqual(updatedBook);
            expect(mockBookRepository.save).toHaveBeenCalled();
        });

        it('should throw ConflictException if updating to existing hash', async () => {
            const updateBookDto = { hash: 'existing-hash' };
            const existingBook = { ...mockBook, id: 2, hash: 'existing-hash' };

            mockBookRepository.findOne
                .mockResolvedValueOnce(mockBook) // findOne call
                .mockResolvedValueOnce(existingBook); // hash conflict check

            await expect(service.update(1, updateBookDto)).rejects.toThrow(
                ConflictException,
            );
        });
    });

    describe('remove', () => {
        it('should remove a book successfully', async () => {
            mockBookRepository.findOne.mockResolvedValue(mockBook);
            mockBookRepository.remove.mockResolvedValue(mockBook);

            await service.remove(1);

            expect(mockBookRepository.remove).toHaveBeenCalledWith(mockBook);
        });

        it('should throw NotFoundException if book not found', async () => {
            mockBookRepository.findOne.mockResolvedValue(null);

            await expect(service.remove(999)).rejects.toThrow(NotFoundException);
        });
    });

    describe('findByTags', () => {
        it('should return books filtered by tags', async () => {
            const mockQueryBuilder = {
                leftJoinAndSelect: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                orderBy: jest.fn().mockReturnThis(),
                getMany: jest.fn().mockResolvedValue([mockBook]),
            };

            mockBookRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

            const result = await service.findByTags(['author', 'genre']);

            expect(result).toEqual([mockBook]);
            expect(mockBookRepository.createQueryBuilder).toHaveBeenCalledWith(
                'book',
            );
            expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
                'book.tags',
                'tag',
            );
            expect(mockQueryBuilder.where).toHaveBeenCalledWith(
                'tag.key IN (:...tagKeys)',
                { tagKeys: ['author', 'genre'] },
            );
            expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
                'book.created_at',
                'DESC',
            );
        });
    });

    describe('findByTagKeyValue', () => {
        it('should return books filtered by specific tag key-value pair', async () => {
            const mockQueryBuilder = {
                leftJoinAndSelect: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                orderBy: jest.fn().mockReturnThis(),
                getMany: jest.fn().mockResolvedValue([mockBook]),
            };

            mockBookRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

            const result = await service.findByTagKeyValue('author', 'John Doe');

            expect(result).toEqual([mockBook]);
            expect(mockBookRepository.createQueryBuilder).toHaveBeenCalledWith(
                'book',
            );
            expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
                'book.tags',
                'tag',
            );
            expect(mockQueryBuilder.where).toHaveBeenCalledWith(
                'tag.key = :key AND tag.value = :value',
                { key: 'author', value: 'John Doe' },
            );
            expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
                'book.created_at',
                'DESC',
            );
        });
    });

    describe('findByMultipleTagValues', () => {
        it('should return books filtered by multiple tag key-value pairs', async () => {
            const mockQueryBuilder = {
                leftJoinAndSelect: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                orderBy: jest.fn().mockReturnThis(),
                getMany: jest.fn().mockResolvedValue([mockBook]),
            };

            mockBookRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

            const tagFilters = [
                { key: 'author', value: 'John Doe' },
                { key: 'genre', value: 'Fiction' },
            ];

            const result = await service.findByMultipleTagValues(tagFilters);

            expect(result).toEqual([mockBook]);
            expect(mockBookRepository.createQueryBuilder).toHaveBeenCalledWith(
                'book',
            );
            expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
                'book.tags',
                'tag',
            );
            expect(mockQueryBuilder.where).toHaveBeenCalledWith(
                '(tag.key = :key0 AND tag.value = :value0) OR (tag.key = :key1 AND tag.value = :value1)',
                {
                    key0: 'author',
                    value0: 'John Doe',
                    key1: 'genre',
                    value1: 'Fiction',
                },
            );
            expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
                'book.created_at',
                'DESC',
            );
        });
    });

    describe('findByTagId', () => {
        it('should return books filtered by tag ID', async () => {
            const mockQueryBuilder = {
                leftJoinAndSelect: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                orderBy: jest.fn().mockReturnThis(),
                getMany: jest.fn().mockResolvedValue([mockBook]),
            };

            mockBookRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

            const result = await service.findByTagId(1);

            expect(result).toEqual([mockBook]);
            expect(mockBookRepository.createQueryBuilder).toHaveBeenCalledWith(
                'book',
            );
            expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
                'book.tags',
                'tag',
            );
            expect(mockQueryBuilder.where).toHaveBeenCalledWith('tag.id = :tagId', {
                tagId: 1,
            });
            expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
                'book.created_at',
                'DESC',
            );
        });
    });

    describe('findByTagIds', () => {
        it('should return books filtered by multiple tag IDs', async () => {
            const mockQueryBuilder = {
                leftJoinAndSelect: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                orderBy: jest.fn().mockReturnThis(),
                getMany: jest.fn().mockResolvedValue([mockBook]),
            };

            mockBookRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

            const result = await service.findByTagIds([1, 2, 3]);

            expect(result).toEqual([mockBook]);
            expect(mockBookRepository.createQueryBuilder).toHaveBeenCalledWith(
                'book',
            );
            expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
                'book.tags',
                'tag',
            );
            expect(mockQueryBuilder.where).toHaveBeenCalledWith(
                'book.id IN (' +
                'SELECT bt.book_id FROM book_tags bt ' +
                'WHERE bt.tag_id IN (:...tagIds) ' +
                'GROUP BY bt.book_id ' +
                'HAVING COUNT(DISTINCT bt.tag_id) = :tagCount' +
                ')',
                { tagIds: [1, 2, 3], tagCount: 3 },
            );
            expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
                'book.created_at',
                'DESC',
            );
        });
    });

    describe('recommendByBook', () => {
        it('should return empty array when limit <= 0', async () => {
            const result = await service.recommendByBook(1, 0);
            expect(result).toEqual([]);
        });

        it('should throw NotFoundException when base book not found', async () => {
            mockBookRepository.findOne.mockResolvedValueOnce(null);
            await expect(service.recommendByBook(999)).rejects.toThrow(
                NotFoundException,
            );
        });

        it('should return empty when base book has no tags', async () => {
            mockBookRepository.findOne.mockResolvedValueOnce({
                ...mockBook,
                tags: [],
            });
            const result = await service.recommendByBook(1);
            expect(result).toEqual([]);
        });

        it('should return recommended books ordered by overlap', async () => {
            const baseBook = {
                ...mockBook,
                tags: [{ id: 10 } as any, { id: 11 } as any],
            };
            mockBookRepository.findOne.mockResolvedValueOnce(baseBook as any);

            const mockQB = {
                createQueryBuilder: jest.fn(),
                innerJoin: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                andWhere: jest.fn().mockReturnThis(),
                select: jest.fn().mockReturnThis(),
                addSelect: jest.fn().mockReturnThis(),
                groupBy: jest.fn().mockReturnThis(),
                orderBy: jest.fn().mockReturnThis(),
                addOrderBy: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                getRawMany: jest.fn().mockResolvedValue([{ id: 2, overlap: 2 }]),
            } as any;

            // chain starting from repository.createQueryBuilder
            (mockBookRepository.createQueryBuilder as any).mockReturnValue(mockQB);

            // find recommended book entities
            const recommended = { ...mockBook, id: 2 };
            mockBookRepository.find.mockResolvedValueOnce([recommended as any]);

            const result = await service.recommendByBook(1, 5);
            expect(result.map((b) => b.id)).toEqual([2]);
            expect(mockBookRepository.find).toHaveBeenCalled();
        });
    });
});
