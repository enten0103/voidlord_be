import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { BooksService } from './books.service';
import { Book } from '../entities/book.entity';
import { Tag } from '../entities/tag.entity';

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
            expect(mockBookRepository.findOne).toHaveBeenCalledWith({ where: { hash: 'abc123' } });
            expect(mockBookRepository.save).toHaveBeenCalled();
        });

        it('should throw ConflictException if book hash already exists', async () => {
            const createBookDto = {
                hash: 'abc123',
                title: 'Test Book',
            };

            mockBookRepository.findOne.mockResolvedValue(mockBook);

            await expect(service.create(createBookDto)).rejects.toThrow(ConflictException);
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

            await expect(service.findByHash('nonexistent')).rejects.toThrow(NotFoundException);
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

            await expect(service.update(1, updateBookDto)).rejects.toThrow(ConflictException);
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
                getMany: jest.fn().mockResolvedValue([mockBook]),
            };

            mockBookRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

            const result = await service.findByTags(['author', 'genre']);

            expect(result).toEqual([mockBook]);
            expect(mockBookRepository.createQueryBuilder).toHaveBeenCalledWith('book');
            expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('book.tags', 'tag');
            expect(mockQueryBuilder.where).toHaveBeenCalledWith('tag.key IN (:...tagKeys)', { tagKeys: ['author', 'genre'] });
        });
    });
});
