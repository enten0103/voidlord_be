import { Test, TestingModule } from '@nestjs/testing';
import { BooksController } from './books.controller';
import { BooksService } from './books.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

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
