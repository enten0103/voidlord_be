import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';

import { ReadingRecordsService } from '../reading-records.service';
import { ReadingRecord } from '../../../entities/reading-record.entity';
import { createRepoMock } from '../../../../test/repo-mocks';

describe('ReadingRecordsService', () => {
  let service: ReadingRecordsService;
  const mockRepo = createRepoMock<ReadingRecord>();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReadingRecordsService,
        {
          provide: getRepositoryToken(ReadingRecord),
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<ReadingRecordsService>(ReadingRecordsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('start', () => {
    it('creates a new reading record', async () => {
      const created = {
        id: 1,
        user_id: 42,
        book_id: 10,
        instance_hash: 'abc',
        started_at: new Date(),
        last_active_at: new Date(),
      };
      mockRepo.create.mockReturnValue(created as any);
      mockRepo.save.mockResolvedValue(created as any);

      const result = await service.start(42, {
        bookId: 10,
        instanceHash: 'abc',
        xhtmlIndex: 0,
        elementIndex: 0,
      });

      expect(result.id).toBe(1);
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 42,
          book_id: 10,
          instance_hash: 'abc',
        }),
      );
      expect(mockRepo.save).toHaveBeenCalled();
    });
  });

  describe('heartbeat', () => {
    it('updates last_active_at and position', async () => {
      const existing = {
        id: 1,
        user_id: 42,
        last_active_at: new Date('2026-01-01'),
        end_xhtml_index: 0,
        end_element_index: 0,
      };
      mockRepo.findOne.mockResolvedValue(existing as any);
      mockRepo.save.mockImplementation(async (r) => r);

      const result = await service.heartbeat(42, 1, {
        xhtmlIndex: 5,
        elementIndex: 10,
      });

      expect(result.end_xhtml_index).toBe(5);
      expect(result.end_element_index).toBe(10);
      expect(result.last_active_at).toBeInstanceOf(Date);
    });

    it('throws if record not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.heartbeat(42, 999, {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('allows multiple heartbeats on the same record (no end state)', async () => {
      const existing = {
        id: 1,
        user_id: 42,
        last_active_at: new Date('2026-01-01'),
        end_xhtml_index: 0,
        end_element_index: 0,
      };
      mockRepo.findOne.mockResolvedValue(existing as any);
      mockRepo.save.mockImplementation(async (r) => r);

      // First heartbeat
      await service.heartbeat(42, 1, { xhtmlIndex: 3, elementIndex: 7 });
      // Second heartbeat — should not throw
      const result = await service.heartbeat(42, 1, {
        xhtmlIndex: 20,
        elementIndex: 30,
      });

      expect(result.end_xhtml_index).toBe(20);
      expect(result.end_element_index).toBe(30);
      expect(result.last_active_at).toBeInstanceOf(Date);
    });
  });

  describe('getTimeline', () => {
    it('returns paginated results', async () => {
      const items = [{ id: 1 }, { id: 2 }];
      mockRepo.findAndCount.mockResolvedValue([items, 2] as any);

      const result = await service.getTimeline(42, 10, 0);
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(mockRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: 42 },
          take: 10,
          skip: 0,
        }),
      );
    });
  });

  describe('getByBook', () => {
    it('returns records for a specific book', async () => {
      const items = [{ id: 1 }];
      mockRepo.findAndCount.mockResolvedValue([items, 1] as any);

      const result = await service.getByBook(42, 10, 5, 0);
      expect(result.items).toHaveLength(1);
      expect(mockRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: 42, book_id: 10 },
        }),
      );
    });
  });

  describe('getGroupedByBook', () => {
    function makeQbChainMock(resolvedValue: any) {
      const chain: Record<string, jest.Mock> = {};
      const methods = [
        'select',
        'addSelect',
        'where',
        'andWhere',
        'groupBy',
        'orderBy',
        'limit',
        'offset',
        'leftJoinAndSelect',
      ];
      for (const m of methods) {
        chain[m] = jest.fn().mockReturnThis();
      }
      chain.getRawMany = jest.fn().mockResolvedValue(resolvedValue);
      chain.getRawOne = jest.fn().mockResolvedValue(resolvedValue);
      chain.getMany = jest.fn().mockResolvedValue(resolvedValue);
      return chain;
    }

    it('returns empty when user has no records', async () => {
      // First createQueryBuilder call: aggregate (getRawMany → [])
      const aggQb = makeQbChainMock([]);
      // Second createQueryBuilder call: total count (getRawOne → { cnt: 0 })
      const countQb = makeQbChainMock({ cnt: 0 });

      mockRepo.createQueryBuilder
        .mockReturnValueOnce(aggQb as any)
        .mockReturnValueOnce(countQb as any);

      const result = await service.getGroupedByBook(42, 10, 0);
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('returns grouped results with aggregates and preview records', async () => {
      const aggRows = [
        {
          bookId: 10,
          sessionCount: 3,
          totalDurationSeconds: 600,
          lastReadAt: '2026-02-15T10:00:00Z',
        },
        {
          bookId: 20,
          sessionCount: 1,
          totalDurationSeconds: 120,
          lastReadAt: '2026-02-14T08:00:00Z',
        },
      ];
      const countResult = { cnt: 2 };
      const bookRecords = [
        { book_id: 10, book: { id: 10, tags: [] } },
        { book_id: 20, book: { id: 20, tags: [] } },
      ];
      const previewRecords = [
        { id: 1, book_id: 10, started_at: new Date('2026-02-15') },
        { id: 2, book_id: 10, started_at: new Date('2026-02-14') },
        { id: 3, book_id: 20, started_at: new Date('2026-02-14') },
      ];

      // Aggregate QB
      const aggQb = makeQbChainMock(aggRows);
      // Count QB
      const countQb = makeQbChainMock(countResult);
      // Book entities QB
      const bookQb = makeQbChainMock(bookRecords);

      mockRepo.createQueryBuilder
        .mockReturnValueOnce(aggQb as any)
        .mockReturnValueOnce(countQb as any)
        .mockReturnValueOnce(bookQb as any);

      // Raw query for preview records
      (mockRepo as any).query = jest
        .fn()
        .mockResolvedValue(previewRecords);

      const result = await service.getGroupedByBook(42, 10, 0, 5);

      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].bookId).toBe(10);
      expect(result.items[0].sessionCount).toBe(3);
      expect(result.items[0].totalDurationSeconds).toBe(600);
      expect(result.items[0].recentRecords).toHaveLength(2);
      expect(result.items[1].bookId).toBe(20);
      expect(result.items[1].recentRecords).toHaveLength(1);
    });

    it('uses default pagination values', async () => {
      const aggQb = makeQbChainMock([]);
      const countQb = makeQbChainMock({ cnt: 0 });

      mockRepo.createQueryBuilder
        .mockReturnValueOnce(aggQb as any)
        .mockReturnValueOnce(countQb as any);

      await service.getGroupedByBook(42);

      expect(aggQb.limit).toHaveBeenCalledWith(10);
      expect(aggQb.offset).toHaveBeenCalledWith(0);
    });

    it('correctly applies custom limit and offset to aggregate query', async () => {
      const aggQb = makeQbChainMock([]);
      const countQb = makeQbChainMock({ cnt: 0 });

      mockRepo.createQueryBuilder
        .mockReturnValueOnce(aggQb as any)
        .mockReturnValueOnce(countQb as any);

      await service.getGroupedByBook(42, 5, 10);

      expect(aggQb.limit).toHaveBeenCalledWith(5);
      expect(aggQb.offset).toHaveBeenCalledWith(10);
      expect(aggQb.where).toHaveBeenCalledWith('rr.user_id = :userId', {
        userId: 42,
      });
    });

    it('handles null totalResult gracefully (defaults to 0)', async () => {
      const aggQb = makeQbChainMock([]);
      const countQb = makeQbChainMock(null); // getRawOne returns null

      mockRepo.createQueryBuilder
        .mockReturnValueOnce(aggQb as any)
        .mockReturnValueOnce(countQb as any);

      const result = await service.getGroupedByBook(42);
      expect(result.total).toBe(0);
      expect(result.items).toEqual([]);
    });

    it('maps book to null when book entity is missing from bookMap', async () => {
      const aggRows = [
        {
          bookId: 99,
          sessionCount: 2,
          totalDurationSeconds: 300,
          lastReadAt: '2026-02-15T10:00:00Z',
        },
      ];
      const countResult = { cnt: 1 };
      // No matching book entity — simulate deleted book
      const bookRecords = [{ book_id: 99, book: null }];
      const previewRecords = [
        { id: 1, book_id: 99, started_at: new Date('2026-02-15') },
      ];

      const aggQb = makeQbChainMock(aggRows);
      const countQb = makeQbChainMock(countResult);
      const bookQb = makeQbChainMock(bookRecords);

      mockRepo.createQueryBuilder
        .mockReturnValueOnce(aggQb as any)
        .mockReturnValueOnce(countQb as any)
        .mockReturnValueOnce(bookQb as any);

      (mockRepo as any).query = jest.fn().mockResolvedValue(previewRecords);

      const result = await service.getGroupedByBook(42);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].book).toBeNull();
      expect(result.items[0].bookId).toBe(99);
    });

    it('returns empty recentRecords when no preview records exist for a book', async () => {
      const aggRows = [
        {
          bookId: 10,
          sessionCount: 1,
          totalDurationSeconds: 60,
          lastReadAt: '2026-02-15T10:00:00Z',
        },
      ];
      const countResult = { cnt: 1 };
      const bookRecords = [{ book_id: 10, book: { id: 10, tags: [] } }];

      const aggQb = makeQbChainMock(aggRows);
      const countQb = makeQbChainMock(countResult);
      const bookQb = makeQbChainMock(bookRecords);

      mockRepo.createQueryBuilder
        .mockReturnValueOnce(aggQb as any)
        .mockReturnValueOnce(countQb as any)
        .mockReturnValueOnce(bookQb as any);

      // No preview records returned
      (mockRepo as any).query = jest.fn().mockResolvedValue([]);

      const result = await service.getGroupedByBook(42);
      expect(result.items[0].recentRecords).toEqual([]);
    });

    it('rounds totalDurationSeconds to integer', async () => {
      const aggRows = [
        {
          bookId: 10,
          sessionCount: 1,
          totalDurationSeconds: 123.789,
          lastReadAt: '2026-02-15T10:00:00Z',
        },
      ];
      const countResult = { cnt: 1 };
      const bookRecords = [{ book_id: 10, book: { id: 10, tags: [] } }];

      const aggQb = makeQbChainMock(aggRows);
      const countQb = makeQbChainMock(countResult);
      const bookQb = makeQbChainMock(bookRecords);

      mockRepo.createQueryBuilder
        .mockReturnValueOnce(aggQb as any)
        .mockReturnValueOnce(countQb as any)
        .mockReturnValueOnce(bookQb as any);

      (mockRepo as any).query = jest.fn().mockResolvedValue([]);

      const result = await service.getGroupedByBook(42);
      expect(result.items[0].totalDurationSeconds).toBe(124);
      expect(Number.isInteger(result.items[0].totalDurationSeconds)).toBe(true);
    });

    it('passes previewCount to raw query', async () => {
      const aggRows = [
        {
          bookId: 10,
          sessionCount: 5,
          totalDurationSeconds: 600,
          lastReadAt: '2026-02-15T10:00:00Z',
        },
      ];
      const countResult = { cnt: 1 };
      const bookRecords = [{ book_id: 10, book: { id: 10, tags: [] } }];

      const aggQb = makeQbChainMock(aggRows);
      const countQb = makeQbChainMock(countResult);
      const bookQb = makeQbChainMock(bookRecords);

      mockRepo.createQueryBuilder
        .mockReturnValueOnce(aggQb as any)
        .mockReturnValueOnce(countQb as any)
        .mockReturnValueOnce(bookQb as any);

      (mockRepo as any).query = jest.fn().mockResolvedValue([]);

      await service.getGroupedByBook(42, 10, 0, 3);

      expect((mockRepo as any).query).toHaveBeenCalledWith(
        expect.any(String),
        [42, [10], 3],
      );
    });

    it('preserves order from aggregate query (most recent first)', async () => {
      const aggRows = [
        {
          bookId: 30,
          sessionCount: 1,
          totalDurationSeconds: 100,
          lastReadAt: '2026-02-15T12:00:00Z',
        },
        {
          bookId: 10,
          sessionCount: 2,
          totalDurationSeconds: 200,
          lastReadAt: '2026-02-14T12:00:00Z',
        },
        {
          bookId: 20,
          sessionCount: 1,
          totalDurationSeconds: 50,
          lastReadAt: '2026-02-13T12:00:00Z',
        },
      ];
      const countResult = { cnt: 3 };
      const bookRecords = [
        { book_id: 30, book: { id: 30, tags: [] } },
        { book_id: 10, book: { id: 10, tags: [] } },
        { book_id: 20, book: { id: 20, tags: [] } },
      ];

      const aggQb = makeQbChainMock(aggRows);
      const countQb = makeQbChainMock(countResult);
      const bookQb = makeQbChainMock(bookRecords);

      mockRepo.createQueryBuilder
        .mockReturnValueOnce(aggQb as any)
        .mockReturnValueOnce(countQb as any)
        .mockReturnValueOnce(bookQb as any);

      (mockRepo as any).query = jest.fn().mockResolvedValue([]);

      const result = await service.getGroupedByBook(42);
      expect(result.items.map((i) => i.bookId)).toEqual([30, 10, 20]);
    });
  });
});
