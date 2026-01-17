import { Test, TestingModule } from '@nestjs/testing';
import { SelectQueryBuilder } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { BooksService } from '../books.service';
import { createRepoMock } from '../../../../test/repo-mocks';
import { Book } from '../../../entities/book.entity';
import { Tag } from '../../../entities/tag.entity';
import { BookRating } from '../../../entities/book-rating.entity';
import { Comment } from '../../../entities/comment.entity';
import { User } from '../../../entities/user.entity';
import { FilesService } from '../../files/files.service';

describe('BooksService', () => {
  let service: BooksService;

  const mockBook: Book = {
    id: 1,
    tags: [],
    created_at: new Date(),
    updated_at: new Date(),
  } as unknown as Book;

  const mockTag: Tag = {
    id: 1,
    key: 'author',
    value: 'John Doe',
    shown: true,
    books: [],
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockBookRepository = createRepoMock<Book>();
  const mockTagRepository = createRepoMock<Tag>();
  const mockRatingRepository = createRepoMock<BookRating>();
  const mockCommentRepository = createRepoMock<Comment>();
  const mockFilesService = {
    putObject: jest.fn(),
    deleteObject: jest.fn(),
    deleteRecordByKey: jest.fn(),
    listObjects: jest.fn(),
    deleteObjects: jest.fn(),
    deleteRecordsByKeys: jest.fn(),
    getPublicUrl: jest.fn().mockImplementation((k: string) => `http://x/${k}`),
  } as unknown as Pick<
    FilesService,
    | 'putObject'
    | 'deleteObject'
    | 'deleteRecordByKey'
    | 'listObjects'
    | 'deleteObjects'
    | 'deleteRecordsByKeys'
    | 'getPublicUrl'
  >;

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
        {
          provide: getRepositoryToken(Comment),
          useValue: mockCommentRepository,
        },
        {
          provide: FilesService,
          useValue: mockFilesService,
        },
      ],
    }).compile();

    service = module.get<BooksService>(BooksService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a book successfully', async () => {
      const createBookDto = {
        tags: [{ key: 'author', value: 'John Doe' }],
      } as { tags: Array<{ key: string; value: string }> };

      mockTagRepository.findOne.mockResolvedValue(null);
      mockTagRepository.create.mockReturnValue(mockTag);
      mockTagRepository.save.mockResolvedValue(mockTag);
      mockBookRepository.create.mockReturnValue(mockBook);
      mockBookRepository.save.mockResolvedValue(mockBook);

      const result = await service.create(createBookDto);

      expect(result).toEqual(mockBook);
      expect(mockBookRepository.save).toHaveBeenCalled();
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

  describe('setCover', () => {
    it('throws NotFoundException when book not found', async () => {
      mockBookRepository.findOne.mockResolvedValue(null);
      await expect(
        service.setCover(1, { buffer: Buffer.from('x') } as any, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for non-image content type', async () => {
      mockBookRepository.findOne.mockResolvedValue({
        ...mockBook,
        tags: [],
      } as unknown as Book);

      await expect(
        service.setCover(
          1,
          { buffer: Buffer.from('x'), mimetype: 'application/pdf' } as any,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('uploads cover, updates cover tags, and deletes old cover after save', async () => {
      const oldCoverKey = 'books/1/cover.png';
      const book = {
        ...mockBook,
        tags: [
          { id: 1, key: 'cover', value: oldCoverKey, shown: false } as Tag,
          { id: 2, key: 'author', value: 'A', shown: true } as Tag,
        ],
      } as unknown as Book;
      mockBookRepository.findOne.mockResolvedValue(book);
      mockBookRepository.save.mockResolvedValue(book);

      const processSpy = jest
        .spyOn(service as any, 'processTags')
        .mockResolvedValue([
          { id: 3, key: 'author', value: 'A', shown: true } as Tag,
          { id: 4, key: 'cover', value: 'books/1/cover.jpg', shown: false } as Tag,
          { id: 5, key: 'cover_mime', value: 'image/jpeg', shown: false } as Tag,
        ]);

      const res = await service.setCover(
        1,
        { buffer: Buffer.from('img'), mimetype: 'image/jpeg' } as any,
        7,
      );

      expect(mockFilesService.putObject).toHaveBeenCalledWith(
        'books/1/cover.jpg',
        expect.any(Buffer),
        'image/jpeg',
        undefined,
        7,
      );
      expect(processSpy).toHaveBeenCalled();
      expect(mockBookRepository.save).toHaveBeenCalled();
      expect(mockFilesService.deleteObject).toHaveBeenCalledWith(oldCoverKey);
      expect(mockFilesService.deleteRecordByKey).toHaveBeenCalledWith(oldCoverKey);
      expect(res.key).toBe('books/1/cover.jpg');
    });

    it('rolls back uploaded cover if saving book fails', async () => {
      const book = { ...mockBook, tags: [] } as unknown as Book;
      mockBookRepository.findOne.mockResolvedValue(book);
      mockBookRepository.save.mockRejectedValue(new Error('db failed'));
      jest
        .spyOn(service as any, 'processTags')
        .mockResolvedValue([{ id: 1, key: 'cover', value: 'books/1/cover.png', shown: false } as Tag]);

      await expect(
        service.setCover(
          1,
          { buffer: Buffer.from('img'), mimetype: 'image/png' } as any,
          7,
        ),
      ).rejects.toThrow('db failed');

      expect(mockFilesService.deleteObject).toHaveBeenCalledWith('books/1/cover.png');
      expect(mockFilesService.deleteRecordByKey).toHaveBeenCalledWith('books/1/cover.png');
    });
  });

  // findByHash removed

  describe('update', () => {
    it('should update book tags successfully', async () => {
      const updateBookDto = { tags: [{ key: 'author', value: 'New' }] } as {
        tags: Array<{ key: string; value: string }>;
      };
      const updatedBook = { ...mockBook, tags: [mockTag] } as Book;

      mockBookRepository.findOne.mockResolvedValue(mockBook);
      mockTagRepository.findOne.mockResolvedValue(null);
      mockTagRepository.create.mockReturnValue(mockTag);
      mockTagRepository.save.mockResolvedValue(mockTag);
      mockBookRepository.save.mockResolvedValue(updatedBook);

      const result = await service.update(1, updateBookDto as never);
      expect(result).toEqual(updatedBook);
      expect(mockBookRepository.save).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should remove a book successfully', async () => {
      mockBookRepository.findOne.mockResolvedValue(mockBook);
      mockBookRepository.remove.mockResolvedValue(mockBook);

      await service.remove(1);

      expect(mockBookRepository.remove).toHaveBeenCalledWith(mockBook);
    });

    it('cleans up cover + epub objects before removing book', async () => {
      const bookWithAssets = {
        ...mockBook,
        id: 1,
        has_epub: true,
        tags: [{ id: 1, key: 'cover', value: 'books/1/cover.png', shown: false } as any],
      } as Book;

      const epubKeys = ['books/1/epub/mimetype', 'books/1/epub/META-INF/container.xml'];
      mockBookRepository.findOne.mockResolvedValue(bookWithAssets);
      (mockFilesService.listObjects as jest.Mock).mockResolvedValue(epubKeys);
      mockBookRepository.remove.mockResolvedValue(bookWithAssets);

      await service.remove(1);

      expect(mockFilesService.deleteObject).toHaveBeenCalledWith('books/1/cover.png');
      expect(mockFilesService.deleteRecordByKey).toHaveBeenCalledWith('books/1/cover.png');
      expect(mockFilesService.listObjects).toHaveBeenCalledWith('books/1/epub/');
      expect(mockFilesService.deleteObjects).toHaveBeenCalledWith(epubKeys);
      expect(mockFilesService.deleteRecordsByKeys).toHaveBeenCalledWith(epubKeys);
      expect(mockBookRepository.remove).toHaveBeenCalledWith(bookWithAssets);
    });

    it('should throw NotFoundException if book not found', async () => {
      mockBookRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('searchByConditions', () => {
    it('should sort by created_at desc by default', async () => {
      mockBookRepository.find.mockResolvedValue([mockBook]);
      const res = await service.searchByConditions([]);
      expect(res).toEqual([mockBook]);
      expect(mockBookRepository.find).toHaveBeenCalledWith({
        relations: ['tags'],
        order: { created_at: 'DESC' },
      });
    });

    it('should sort by updated_at asc', async () => {
      mockBookRepository.find.mockResolvedValue([mockBook]);
      const res = await service.searchByConditions(
        [],
        undefined,
        undefined,
        'updated_at',
        'asc',
      );
      expect(res).toEqual([mockBook]);
      expect(mockBookRepository.find).toHaveBeenCalledWith({
        relations: ['tags'],
        order: { updated_at: 'ASC' },
      });
    });

    it('should sort by rating desc (no paging)', async () => {
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockBook]),
      } as unknown as Pick<
        SelectQueryBuilder<Book>,
        'leftJoinAndSelect' | 'leftJoin' | 'orderBy' | 'addOrderBy' | 'getMany'
      >;
      mockBookRepository.createQueryBuilder.mockReturnValue(
        qb as unknown as SelectQueryBuilder<Book>,
      );
      const res = await service.searchByConditions(
        [],
        undefined,
        undefined,
        'rating',
        'desc',
      );
      expect(res).toEqual([mockBook]);
      expect(qb.leftJoin).toHaveBeenCalled();
      expect(qb.orderBy).toHaveBeenCalledWith(
        'COALESCE(br.avg_rating, -1)',
        'DESC',
      );
      expect(qb.addOrderBy).toHaveBeenCalledWith('book.created_at', 'DESC');
      expect(qb.getMany).toHaveBeenCalled();
    });

    it('should sort by rating asc with paging', async () => {
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockBook], 1]),
      } as unknown as Pick<
        SelectQueryBuilder<Book>,
        | 'leftJoinAndSelect'
        | 'leftJoin'
        | 'orderBy'
        | 'addOrderBy'
        | 'take'
        | 'skip'
        | 'getManyAndCount'
      >;
      mockBookRepository.createQueryBuilder.mockReturnValue(
        qb as unknown as SelectQueryBuilder<Book>,
      );
      const res = await service.searchByConditions([], 10, 0, 'rating', 'asc');
      expect(res).toEqual({
        total: 1,
        limit: 10,
        offset: 0,
        items: [mockBook],
      });
      expect(qb.leftJoin).toHaveBeenCalled();
      expect(qb.orderBy).toHaveBeenCalledWith(
        'COALESCE(br.avg_rating, -1)',
        'ASC',
      );
      expect(qb.addOrderBy).toHaveBeenCalledWith('book.created_at', 'DESC');
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.getManyAndCount).toHaveBeenCalled();
    });
    it('should fetch all with default created_at desc when conditions empty', async () => {
      mockBookRepository.find.mockResolvedValueOnce([mockBook]);
      const res = await service.searchByConditions([]);
      expect(res).toEqual([mockBook]);
      expect(mockBookRepository.find).toHaveBeenCalledWith({
        relations: ['tags'],
        order: { created_at: 'DESC' },
      });
    });

    it('should build AND chain for eq, neq, match', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockBook]),
      };
      mockBookRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as unknown as SelectQueryBuilder<Book>,
      );
      const res = await service.searchByConditions([
        { target: 'author', op: 'eq', value: 'John Doe' },
        { target: 'genre', op: 'neq', value: 'Fiction' },
        { target: 'year', op: 'match', value: '195' },
      ]);
      expect(res).toEqual([mockBook]);
      expect(mockBookRepository.createQueryBuilder).toHaveBeenCalledWith(
        'book',
      );
      expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'book.tags',
        'tag',
      );
      // andWhere call assertions (eq, neq, match)
      type AndWhereCall = [string, Record<string, unknown>];
      const calls: AndWhereCall[] = (
        mockQueryBuilder.andWhere as unknown as jest.Mock
      ).mock.calls as AndWhereCall[];
      expect(calls).toHaveLength(3);
      // eq
      expect(calls[0][0]).toContain('EXISTS');
      expect(calls[0][0]).toContain('t.key = :key0');
      expect(calls[0][0]).toContain('t.value = :val0');
      expect(calls[0][1]).toEqual({
        key0: 'author',
        val0: 'John Doe',
      });
      // neq
      expect(calls[1][0]).toContain('NOT EXISTS');
      expect(calls[1][0]).toContain('t.key = :key1');
      expect(calls[1][0]).toContain('t.value = :val1');
      expect(calls[1][1]).toEqual({
        key1: 'genre',
        val1: 'Fiction',
      });
      // match
      expect(calls[2][0]).toContain('EXISTS');
      expect(calls[2][0]).toContain('ILIKE :val2');
      expect(calls[2][1]).toEqual({
        key2: 'year',
        val2: '%195%',
      });
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'book.created_at',
        'DESC',
      );
    });

    it('should throw BadRequestException for unsupported op', async () => {
      const invalid = [
        { target: 'x', op: 'eq', value: '1' },
        { target: 'y', op: 'invalid' as unknown as 'eq', value: '2' },
      ];
      // 静态类型被强制为合法，运行时抛错验证防线
      await expect(
        service.searchByConditions(
          invalid as unknown as Array<{
            target: string;
            op: 'eq' | 'neq' | 'match';
            value: string;
          }>,
        ),
      ).rejects.toThrow('Unsupported op: invalid');
    });

    it('should handle duplicate conditions (same key/value eq twice)', async () => {
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockBook]),
      } as unknown as Pick<
        SelectQueryBuilder<Book>,
        'leftJoinAndSelect' | 'andWhere' | 'orderBy' | 'getMany'
      >;
      mockBookRepository.createQueryBuilder.mockReturnValue(
        qb as unknown as SelectQueryBuilder<Book>,
      );
      const res = await service.searchByConditions([
        { target: 'author', op: 'eq', value: 'John Doe' },
        { target: 'author', op: 'eq', value: 'John Doe' },
      ]);
      expect(res).toEqual([mockBook]);
      const calls = (qb as unknown as { andWhere: jest.Mock }).andWhere.mock
        .calls as Array<[string, Record<string, unknown>]>;
      expect(calls.length).toBe(2);
      calls.forEach((c) => expect(c[0]).toContain('EXISTS'));
    });

    it('should accept empty string value (eq)', async () => {
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      } as unknown as Pick<
        SelectQueryBuilder<Book>,
        'leftJoinAndSelect' | 'andWhere' | 'orderBy' | 'getMany'
      >;
      mockBookRepository.createQueryBuilder.mockReturnValue(
        qb as unknown as SelectQueryBuilder<Book>,
      );
      const res = await service.searchByConditions([
        { target: 'emptyField', op: 'eq', value: '' },
      ]);
      expect(res).toEqual([]);
      const calls = (qb as unknown as { andWhere: jest.Mock }).andWhere.mock
        .calls as Array<[string, Record<string, unknown>]>;
      expect(calls[0][0]).toContain('EXISTS');
      expect(calls[0][1]).toEqual({ key0: 'emptyField', val0: '' });
    });

    it('should return paged object when limit provided and no conditions', async () => {
      mockBookRepository.findAndCount.mockResolvedValueOnce([[mockBook], 10]);
      const res = await service.searchByConditions([], 5, 0);
      if (!Array.isArray(res)) {
        expect(res.total).toBe(10);
        expect(res.limit).toBe(5);
        expect(res.offset).toBe(0);
        expect(res.items).toHaveLength(1);
      } else {
        throw new Error('Expected paged object');
      }
    });

    it('should apply pagination when limit/offset provided with conditions', async () => {
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockBook], 3]),
      } as unknown as Pick<
        SelectQueryBuilder<Book>,
        | 'leftJoinAndSelect'
        | 'andWhere'
        | 'orderBy'
        | 'take'
        | 'skip'
        | 'getManyAndCount'
      >;
      mockBookRepository.createQueryBuilder.mockReturnValue(
        qb as unknown as SelectQueryBuilder<Book>,
      );
      const res = await service.searchByConditions(
        [{ target: 'author', op: 'eq', value: 'John Doe' }],
        2,
        0,
      );
      expect(Array.isArray(res)).toBe(false);
      if (!Array.isArray(res)) {
        expect(res.total).toBe(3);
        expect(res.limit).toBe(2);
        expect(res.items[0]).toEqual(mockBook);
      }
      // access mocked methods via original qb object (typed) to avoid any
      const qbObj = qb as unknown as {
        take: jest.Mock;
        skip: jest.Mock;
        getManyAndCount: jest.Mock;
      };
      expect(qbObj.take).toHaveBeenCalledWith(2);
      expect(qbObj.skip).toHaveBeenCalledWith(0);
      expect(qbObj.getManyAndCount).toHaveBeenCalled();
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
        tags: [{ id: 10 } as unknown as Tag, { id: 11 } as unknown as Tag],
      };
      mockBookRepository.findOne.mockResolvedValueOnce(baseBook);

      // Typed lightweight QB stub to avoid any leakage
      type J<T extends any[] = any[]> = jest.Mock<any, T>;
      interface QB {
        innerJoin: J<[string, string?, string?]>;
        where: J<[string, Record<string, unknown>?]>;
        andWhere: J<[string, Record<string, unknown>?]>;
        select: J<[string]>;
        addSelect: J<[string, string?]>;
        groupBy: J<[string]>;
        orderBy: J<[string, 'ASC' | 'DESC']>;
        addOrderBy: J<[string, 'ASC' | 'DESC']>;
        limit: J<[number]>;
        getRawMany: jest.Mock<
          Promise<Array<{ id: number; overlap: number }>>,
          []
        >;
      }
      const qb: QB = {
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
      } as unknown as QB;
      // Provide only the used subset of SelectQueryBuilder<Book>
      mockBookRepository.createQueryBuilder.mockReturnValue(
        qb as unknown as SelectQueryBuilder<Book>,
      );

      // find recommended book entities
      const recommended = { ...mockBook, id: 2 };
      mockBookRepository.find.mockResolvedValueOnce([recommended]);

      const result = await service.recommendByBook(1, 5);
      expect(result.map((b) => b.id)).toEqual([2]);
      expect(mockBookRepository.find).toHaveBeenCalled();
    });
  });

  describe('comments', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    describe('listComments', () => {
      it('should list comments with pagination (default 20/0)', async () => {
        const now = new Date();
        mockBookRepository.findOne.mockResolvedValueOnce(mockBook);
        const comment: Comment = {
          id: 10,
          content: 'Nice!',
          created_at: now,
          updated_at: now,
          user: {
            id: 2,
            username: 'alice',
            email: 'a@b.c',
            password: '',
            created_at: now,
            updated_at: now,
          } as User,
          book: { ...mockBook } as Book,
        } as Comment;
        mockCommentRepository.findAndCount.mockResolvedValueOnce([
          [comment],
          1,
        ]);
        // reply count for comment id=10
        mockCommentRepository.count.mockResolvedValueOnce(3);

        const result = await service.listComments(1);
        expect(result.bookId).toBe(1);
        expect(result.total).toBe(1);
        expect(result.limit).toBe(20);
        expect(result.offset).toBe(0);
        expect(result.items[0]).toMatchObject({
          id: 10,
          content: 'Nice!',
          user: { id: 2, username: 'alice' },
          reply_count: 3,
        });
      });

      it('should clamp invalid limit/offset', async () => {
        mockBookRepository.findOne.mockResolvedValueOnce(mockBook);
        mockCommentRepository.findAndCount.mockResolvedValueOnce([[], 0]);
        await service.listComments(1, 1000, -5);
        expect(mockCommentRepository.findAndCount).toHaveBeenCalledWith(
          expect.objectContaining({ take: 100, skip: 0 }),
        );
      });

      it('should throw NotFoundException when book not found', async () => {
        mockBookRepository.findOne.mockResolvedValueOnce(null);
        await expect(service.listComments(999)).rejects.toThrow(
          NotFoundException,
        );
      });
    });

    describe('addComment', () => {
      it('should add comment successfully', async () => {
        const now = new Date();
        mockBookRepository.findOne.mockResolvedValueOnce(mockBook);
        mockCommentRepository.create.mockReturnValueOnce({
          id: 11,
          content: 'Great book!',
          created_at: now,
        } as unknown as Comment);
        mockCommentRepository.save.mockResolvedValueOnce({
          id: 11,
          content: 'Great book!',
          created_at: now,
        } as unknown as Comment);

        const res = await service.addComment(1, 42, '  Great book!  ');
        expect(res).toMatchObject({
          id: 11,
          bookId: 1,
          content: 'Great book!',
        });
        expect(mockCommentRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            book: { id: 1 },
            user: { id: 42 },
            content: 'Great book!',
          }),
        );
      });

      it('should reject empty content', async () => {
        await expect(service.addComment(1, 1, '')).rejects.toThrow(
          ConflictException,
        );
        await expect(service.addComment(1, 1, '   ')).rejects.toThrow(
          ConflictException,
        );
      });

      it('should reject too long content (>2000)', async () => {
        const long = 'a'.repeat(2001);
        await expect(service.addComment(1, 1, long)).rejects.toThrow(
          ConflictException,
        );
      });

      it('should throw NotFound when book missing', async () => {
        mockBookRepository.findOne.mockResolvedValueOnce(null);
        await expect(service.addComment(999, 1, 'x')).rejects.toThrow(
          NotFoundException,
        );
      });
    });

    describe('removeComment', () => {
      it('should remove comment when exists', async () => {
        mockCommentRepository.findOne.mockResolvedValueOnce({
          id: 10,
          book: { id: 1 } as Book,
          user: {
            id: 2,
            username: 'alice',
            email: 'a@b.c',
            password: '',
            created_at: new Date(),
            updated_at: new Date(),
          } as User,
        } as Comment);
        mockCommentRepository.remove.mockResolvedValueOnce({
          id: 10,
        } as Comment);
        const res = await service.removeComment(1, 10);
        expect(res).toEqual({ ok: true });
        expect(mockCommentRepository.remove).toHaveBeenCalled();
      });

      it('should throw NotFound when comment missing', async () => {
        mockCommentRepository.findOne.mockResolvedValueOnce(null);
        await expect(service.removeComment(1, 999)).rejects.toThrow(
          NotFoundException,
        );
      });
    });

    describe('getCommentOwnerId', () => {
      it('should return user id when exists', async () => {
        mockCommentRepository.findOne.mockResolvedValueOnce({
          id: 10,
          book: { id: 1 } as Book,
          user: {
            id: 7,
            username: 'bob',
            email: 'b@b.c',
            password: '',
            created_at: new Date(),
            updated_at: new Date(),
          } as User,
        } as Comment);
        await expect(service.getCommentOwnerId(1, 10)).resolves.toBe(7);
      });

      it('should return null when not found', async () => {
        mockCommentRepository.findOne.mockResolvedValueOnce(null);
        await expect(service.getCommentOwnerId(1, 999)).resolves.toBeNull();
      });

      it('should return null when has no user', async () => {
        mockCommentRepository.findOne.mockResolvedValueOnce({
          id: 10,
          content: 'stub',
          created_at: new Date(),
          updated_at: new Date(),
          book: { id: 1 } as Book,
          user: null,
        } as Comment);
        await expect(service.getCommentOwnerId(1, 10)).resolves.toBeNull();
      });
    });

    describe('replies', () => {
      it('should add a reply successfully', async () => {
        mockBookRepository.findOne.mockResolvedValueOnce(mockBook); // book exists
        const parent: Comment = {
          id: 10,
          content: 'parent',
          created_at: new Date(),
          updated_at: new Date(),
          book: { id: 1 } as Book,
          user: {
            id: 99,
            username: 'u99',
            email: 'u99@x.com',
            password: '',
            created_at: new Date(),
            updated_at: new Date(),
          } as User,
        } as Comment;
        mockCommentRepository.findOne.mockResolvedValueOnce(parent); // parent exists
        const created: Comment = {
          id: 12,
          content: 'Thanks!',
          created_at: new Date(),
          updated_at: new Date(),
          book: parent.book,
          user: {
            id: 42,
            username: 'u42',
            email: 'u42@x.com',
            password: '',
            created_at: new Date(),
            updated_at: new Date(),
          } as User,
        } as Comment;
        mockCommentRepository.create.mockReturnValueOnce(created);
        mockCommentRepository.save.mockResolvedValueOnce(created);

        const res = await service.addReply(1, 42, 10, ' Thanks! ');
        expect(res).toMatchObject({
          id: 12,
          bookId: 1,
          parentId: 10,
          content: 'Thanks!',
        });
        expect(mockCommentRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            book: { id: 1 },
            parent: { id: 10 },
            user: { id: 42 },
            content: 'Thanks!',
          }),
        );
      });

      it('should list replies with pagination', async () => {
        const now = new Date();
        mockBookRepository.findOne.mockResolvedValueOnce(mockBook); // book
        const parent: Comment = {
          id: 10,
          content: 'parent',
          created_at: new Date(),
          updated_at: new Date(),
          book: { id: 1 } as Book,
          user: {
            id: 99,
            username: 'u99',
            email: 'u99@x.com',
            password: '',
            created_at: new Date(),
            updated_at: new Date(),
          } as User,
        } as Comment;
        mockCommentRepository.findOne.mockResolvedValueOnce(parent); // parent
        const reply: Comment = {
          id: 12,
          content: 'r',
          created_at: now,
          updated_at: now,
          book: parent.book,
          user: {
            id: 5,
            username: 'bob',
            email: 'bob@x.com',
            password: '',
            created_at: now,
            updated_at: now,
          } as User,
        } as Comment;
        mockCommentRepository.findAndCount.mockResolvedValueOnce([[reply], 1]);
        const res = await service.listReplies(1, 10, 50, 0);
        expect(res).toMatchObject({
          bookId: 1,
          parentId: 10,
          total: 1,
          limit: 50,
          offset: 0,
        });
        expect(mockCommentRepository.findAndCount).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { book: { id: 1 }, parent: { id: 10 } },
            take: 50,
            skip: 0,
          }),
        );
      });

      it('should throw NotFound when parent missing', async () => {
        mockBookRepository.findOne.mockResolvedValueOnce(mockBook);
        mockCommentRepository.findOne.mockResolvedValueOnce(null);
        await expect(service.listReplies(1, 999)).rejects.toThrow(
          NotFoundException,
        );
        await expect(service.addReply(1, 1, 999, 'x')).rejects.toThrow(
          NotFoundException,
        );
      });

      it('should validate reply content', async () => {
        await expect(service.addReply(1, 1, 10, '')).rejects.toThrow(
          ConflictException,
        );
        const long = 'a'.repeat(2001);
        await expect(service.addReply(1, 1, 10, long)).rejects.toThrow(
          ConflictException,
        );
      });
    });
  });
});
