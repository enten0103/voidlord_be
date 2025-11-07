import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { BooksService } from '../books.service';
import { Book } from '../../../entities/book.entity';
import { Tag } from '../../../entities/tag.entity';
import { BookRating } from '../../../entities/book-rating.entity';
import { Comment } from '../../../entities/comment.entity';

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

  const mockCommentRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    findAndCount: jest.fn(),
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
        {
          provide: getRepositoryToken(Comment),
          useValue: mockCommentRepository,
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

  describe('comments', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    describe('listComments', () => {
      it('should list comments with pagination (default 20/0)', async () => {
        const now = new Date();
        (mockBookRepository.findOne as any).mockResolvedValueOnce(mockBook);
        (mockCommentRepository.findAndCount as any).mockResolvedValueOnce([
          [
            {
              id: 10,
              content: 'Nice!',
              created_at: now,
              updated_at: now,
              user: { id: 2, username: 'alice' },
            },
          ],
          1,
        ]);
        // reply count for comment id=10
        (mockCommentRepository.count as any).mockResolvedValueOnce(3);

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

        expect(mockCommentRepository.findAndCount).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ book: { id: 1 } }),
            take: 20,
            skip: 0,
          }),
        );
      });

      it('should clamp invalid limit/offset', async () => {
        (mockBookRepository.findOne as any).mockResolvedValueOnce(mockBook);
        (mockCommentRepository.findAndCount as any).mockResolvedValueOnce([
          [],
          0,
        ]);
        await service.listComments(1, 1000, -5);
        expect(mockCommentRepository.findAndCount).toHaveBeenCalledWith(
          expect.objectContaining({ take: 100, skip: 0 }),
        );
      });

      it('should throw NotFoundException when book not found', async () => {
        (mockBookRepository.findOne as any).mockResolvedValueOnce(null);
        await expect(service.listComments(999)).rejects.toThrow(
          NotFoundException,
        );
      });
    });

    describe('addComment', () => {
      it('should add comment successfully', async () => {
        const now = new Date();
        (mockBookRepository.findOne as any).mockResolvedValueOnce(mockBook);
        (mockCommentRepository.create as any).mockReturnValueOnce({
          id: 11,
          content: 'Great book!',
          created_at: now,
        });
        (mockCommentRepository.save as any).mockResolvedValueOnce({
          id: 11,
          content: 'Great book!',
          created_at: now,
        });

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
        (mockBookRepository.findOne as any).mockResolvedValueOnce(null);
        await expect(service.addComment(999, 1, 'x')).rejects.toThrow(
          NotFoundException,
        );
      });
    });

    describe('removeComment', () => {
      it('should remove comment when exists', async () => {
        (mockCommentRepository.findOne as any).mockResolvedValueOnce({
          id: 10,
          book: { id: 1 },
          user: { id: 2 },
        });
        (mockCommentRepository.remove as any).mockResolvedValueOnce(undefined);
        const res = await service.removeComment(1, 10);
        expect(res).toEqual({ ok: true });
        expect(mockCommentRepository.remove).toHaveBeenCalled();
      });

      it('should throw NotFound when comment missing', async () => {
        (mockCommentRepository.findOne as any).mockResolvedValueOnce(null);
        await expect(service.removeComment(1, 999)).rejects.toThrow(
          NotFoundException,
        );
      });
    });

    describe('getCommentOwnerId', () => {
      it('should return user id when exists', async () => {
        (mockCommentRepository.findOne as any).mockResolvedValueOnce({
          id: 10,
          book: { id: 1 },
          user: { id: 7 },
        });
        await expect(service.getCommentOwnerId(1, 10)).resolves.toBe(7);
      });

      it('should return null when not found', async () => {
        (mockCommentRepository.findOne as any).mockResolvedValueOnce(null);
        await expect(service.getCommentOwnerId(1, 999)).resolves.toBeNull();
      });

      it('should return null when has no user', async () => {
        (mockCommentRepository.findOne as any).mockResolvedValueOnce({
          id: 10,
          book: { id: 1 },
          user: null,
        });
        await expect(service.getCommentOwnerId(1, 10)).resolves.toBeNull();
      });
    });

    describe('replies', () => {
      it('should add a reply successfully', async () => {
        (mockBookRepository.findOne as any).mockResolvedValueOnce(mockBook); // book exists
        (mockCommentRepository.findOne as any).mockResolvedValueOnce({
          id: 10,
          book: { id: 1 },
        }); // parent exists
        (mockCommentRepository.create as any).mockReturnValueOnce({
          id: 12,
          content: 'Thanks!',
          created_at: new Date(),
        });
        (mockCommentRepository.save as any).mockResolvedValueOnce({
          id: 12,
          content: 'Thanks!',
          created_at: new Date(),
        });

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
        (mockBookRepository.findOne as any).mockResolvedValueOnce(mockBook); // book
        (mockCommentRepository.findOne as any).mockResolvedValueOnce({
          id: 10,
          book: { id: 1 },
        }); // parent
        (mockCommentRepository.findAndCount as any).mockResolvedValueOnce([
          [
            {
              id: 12,
              content: 'r',
              created_at: now,
              updated_at: now,
              user: { id: 5, username: 'bob' },
            },
          ],
          1,
        ]);
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
        (mockBookRepository.findOne as any).mockResolvedValueOnce(mockBook);
        (mockCommentRepository.findOne as any).mockResolvedValueOnce(null);
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
