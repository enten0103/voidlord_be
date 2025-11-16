import { Test, TestingModule } from '@nestjs/testing';
import { BooksController } from '../books.controller';
import { BooksService } from '../books.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { BadRequestException } from '@nestjs/common';
import { PermissionsService } from '../../permissions/permissions.service';
import type { JwtRequestWithUser } from '../../../types/request.interface';
import { CreateBookDto } from '../dto/create-book.dto';
import { UpdateBookDto } from '../dto/update-book.dto';
import { SearchBooksDto } from '../dto/search-books.dto';

describe('BooksController', () => {
  let controller: BooksController;
  let service: jest.Mocked<BooksService>;

  const mockBook = {
    id: 1,
    tags: [],
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockBooksService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findMine: jest.fn(),
    findOne: jest.fn(),
    // findByHash removed
    update: jest.fn(),
    remove: jest.fn(),
    searchByConditions: jest.fn(),
    recommendByBook: jest.fn(),
  };

  const mockPermissionsService = {
    getUserPermissionLevel: jest.fn().mockResolvedValue(0),
  } as Partial<PermissionsService> as PermissionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BooksController],
      providers: [
        {
          provide: BooksService,
          useValue: mockBooksService,
        },
        {
          provide: PermissionsService,
          useValue: mockPermissionsService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(PermissionGuard)
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
      const createBookDto: CreateBookDto = { tags: [] };

      mockBooksService.create.mockResolvedValue(mockBook);

      const req = {
        user: { userId: 1, username: 'tester' },
      } as unknown as JwtRequestWithUser;
      const result = await controller.create(createBookDto, req);

      expect(result).toEqual(mockBook);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(service.create).toHaveBeenCalledWith(createBookDto, 1);
    });
  });

  describe('findAll', () => {
    it('should return all books', async () => {
      mockBooksService.findAll.mockResolvedValue([mockBook]);
      const result = await controller.findAll();
      expect(result).toEqual([mockBook]);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('my', () => {
    it("should return current user's books", async () => {
      const req = {
        user: { userId: 42, username: 'u' },
      } as unknown as JwtRequestWithUser;
      const books = [mockBook];
      mockBooksService.findMine.mockResolvedValue(books as never);
      const result = await controller.my(req);
      expect(result).toEqual(books);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(service.findMine).toHaveBeenCalledWith(42);
    });

    it('should throw BadRequest when user missing', () => {
      expect(() => controller.my({} as unknown as JwtRequestWithUser)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('findOne', () => {
    it('should return a book by ID', async () => {
      mockBooksService.findOne.mockResolvedValue(mockBook);

      const result = await controller.findOne('1');

      expect(result).toEqual(mockBook);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(service.findOne).toHaveBeenCalledWith(1);
    });
  });

  // findByHash removed

  describe('searchByTags (condition-based)', () => {
    it('should search books with single eq condition', async () => {
      const searchDto: SearchBooksDto = {
        conditions: [{ target: 'author', op: 'eq', value: 'John Doe' }],
      };
      mockBooksService.searchByConditions.mockResolvedValue([mockBook]);
      const result = await controller.searchByTags(searchDto);
      expect(result).toEqual([mockBook]);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(service.searchByConditions).toHaveBeenCalledWith(
        searchDto.conditions,
        searchDto.limit,
        searchDto.offset,
        searchDto.sortBy,
        searchDto.sortOrder,
      );
    });

    it('should search books with multiple AND eq conditions', async () => {
      const searchDto: SearchBooksDto = {
        conditions: [
          { target: 'author', op: 'eq', value: 'John Doe' },
          { target: 'genre', op: 'eq', value: 'Fiction' },
        ],
      };
      mockBooksService.searchByConditions.mockResolvedValue([mockBook]);
      const result = await controller.searchByTags(searchDto);
      expect(result).toEqual([mockBook]);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(service.searchByConditions).toHaveBeenCalledWith(
        searchDto.conditions,
        searchDto.limit,
        searchDto.offset,
        searchDto.sortBy,
        searchDto.sortOrder,
      );
    });

    it('should return all books when conditions missing', async () => {
      const searchDto: SearchBooksDto = {};
      mockBooksService.searchByConditions.mockResolvedValue([mockBook]);
      const result = await controller.searchByTags(searchDto);
      expect(result).toEqual([mockBook]);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(service.searchByConditions).toHaveBeenCalledWith(
        [],
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });
  });

  describe('recommend', () => {
    it('should recommend books by book ID', async () => {
      mockBooksService.recommendByBook.mockResolvedValue([mockBook]);
      const result = await controller.recommend('1');
      expect(result).toEqual([mockBook]);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(service.recommendByBook).toHaveBeenCalledWith(1, 5);
    });

    it('should respect custom limit and clamp invalid', async () => {
      mockBooksService.recommendByBook.mockResolvedValue([mockBook]);
      await controller.recommend('1', '10');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(service.recommendByBook).toHaveBeenCalledWith(1, 10);
      await controller.recommend('1', '-3');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(service.recommendByBook).toHaveBeenCalledWith(1, 5);
    });

    it('should throw BadRequestException for invalid book ID', () => {
      expect(() => controller.recommend('invalid')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('update', () => {
    it('should update a book', async () => {
      const updateBookDto: UpdateBookDto = { tags: [] };
      const updatedBook = { ...mockBook };

      mockBooksService.update.mockResolvedValue(updatedBook);

      const result = await controller.update('1', updateBookDto);

      expect(result).toEqual(updatedBook);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(service.update).toHaveBeenCalledWith(1, updateBookDto);
    });
  });

  describe('remove', () => {
    it('should remove a book', async () => {
      mockBooksService.remove.mockResolvedValue(null);
      await controller.remove('1');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(service.remove).toHaveBeenCalledWith(1);
    });
  });
});
