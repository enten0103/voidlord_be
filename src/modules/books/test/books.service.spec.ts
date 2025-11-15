import { Test, TestingModule } from '@nestjs/testing';
import { SelectQueryBuilder } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { BooksService } from '../books.service';
import { createRepoMock } from '../../../../test/repo-mocks';
import { Book } from '../../../entities/book.entity';
import { Tag } from '../../../entities/tag.entity';
import { BookRating } from '../../../entities/book-rating.entity';
import { Comment } from '../../../entities/comment.entity';
import { User } from '../../../entities/user.entity';

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

      mockBookRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as unknown as SelectQueryBuilder<Book>,
      );

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

      mockBookRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as unknown as SelectQueryBuilder<Book>,
      );

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

      mockBookRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as unknown as SelectQueryBuilder<Book>,
      );

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

      mockBookRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as unknown as SelectQueryBuilder<Book>,
      );

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

      mockBookRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as unknown as SelectQueryBuilder<Book>,
      );

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

  describe('findByFuzzy', () => {
    it('should return empty array on blank query', async () => {
      const res = await service.findByFuzzy('   ');
      expect(res).toEqual([]);
    });

    it('should perform fuzzy ILIKE search on tag key/value', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockBook]),
      };
      mockBookRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as unknown as SelectQueryBuilder<Book>,
      );
      const res = await service.findByFuzzy('john');
      expect(res).toEqual([mockBook]);
      expect(mockBookRepository.createQueryBuilder).toHaveBeenCalledWith(
        'book',
      );
      expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'book.tags',
        'tag',
      );
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'tag.key ILIKE :pattern OR tag.value ILIKE :pattern',
        { pattern: '%john%' },
      );
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'book.created_at',
        'DESC',
      );
    });
  });

  describe('searchByConditions', () => {
    it('should delegate to findAll when conditions empty', async () => {
      const spy = jest
        .spyOn(service, 'findAll')
        .mockResolvedValueOnce([mockBook]);
      const res = await service.searchByConditions([]);
      expect(spy).toHaveBeenCalled();
      expect(res).toEqual([mockBook]);
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
        { target: 'y', op: 'invalid', value: '2' } as unknown as {
          target: string;
          op: 'eq' | 'neq' | 'match';
          value: string;
        },
      ];
      await expect(service.searchByConditions(invalid)).rejects.toThrow(
        'Unsupported op: invalid',
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
