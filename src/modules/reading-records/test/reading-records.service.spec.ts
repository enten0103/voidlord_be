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
      (mockRepo as any).update = jest.fn().mockResolvedValue({ affected: 0 });
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
        ended_at: null,
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

    it('throws if session already ended', async () => {
      mockRepo.findOne.mockResolvedValue({
        id: 1,
        user_id: 42,
        ended_at: new Date(),
      } as any);
      await expect(service.heartbeat(42, 1, {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('end', () => {
    it('sets ended_at and final position', async () => {
      const existing = {
        id: 1,
        user_id: 42,
        ended_at: null,
        last_active_at: new Date(),
      };
      mockRepo.findOne.mockResolvedValue(existing as any);
      mockRepo.save.mockImplementation(async (r) => r);

      const result = await service.end(42, 1, {
        xhtmlIndex: 20,
        elementIndex: 30,
      });

      expect(result.ended_at).toBeInstanceOf(Date);
      expect(result.end_xhtml_index).toBe(20);
      expect(result.end_element_index).toBe(30);
    });

    it('throws if record not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.end(42, 999, {})).rejects.toThrow(NotFoundException);
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
});
