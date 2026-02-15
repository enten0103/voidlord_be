import { Test, TestingModule } from '@nestjs/testing';
import { ReadingRecordsController } from '../reading-records.controller';
import { ReadingRecordsService } from '../reading-records.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { PermissionsService } from '../../permissions/permissions.service';
import type { JwtRequestWithUser } from '../../../types/request.interface';

describe('ReadingRecordsController', () => {
  let controller: ReadingRecordsController;

  const mockService = {
    start: jest.fn(),
    heartbeat: jest.fn(),
    getTimeline: jest.fn(),
    getByBook: jest.fn(),
    getGroupedByBook: jest.fn(),
  };

  const mockPermissionsService = {
    getUserPermissionLevel: jest.fn().mockResolvedValue(0),
  };

  const mockReq = {
    user: { userId: 42, username: 'tester' },
  } as unknown as JwtRequestWithUser;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReadingRecordsController],
      providers: [
        { provide: ReadingRecordsService, useValue: mockService },
        { provide: PermissionsService, useValue: mockPermissionsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<ReadingRecordsController>(
      ReadingRecordsController,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ── start ──────────────────────────────────────────────

  describe('start', () => {
    it('delegates to service.start with userId from JWT', async () => {
      const record = { id: 1, user_id: 42, book_id: 10 };
      mockService.start.mockResolvedValue(record);

      const dto = {
        bookId: 10,
        instanceHash: 'abc',
        xhtmlIndex: 0,
        elementIndex: 0,
      };
      const result = await controller.start(mockReq, dto);

      expect(result).toEqual(record);
      expect(mockService.start).toHaveBeenCalledWith(42, dto);
    });
  });

  // ── heartbeat ──────────────────────────────────────────

  describe('heartbeat', () => {
    it('delegates to service.heartbeat with userId and recordId', async () => {
      const record = { id: 5, user_id: 42, end_xhtml_index: 3 };
      mockService.heartbeat.mockResolvedValue(record);

      const dto = { xhtmlIndex: 3, elementIndex: 7 };
      const result = await controller.heartbeat(mockReq, 5, dto);

      expect(result).toEqual(record);
      expect(mockService.heartbeat).toHaveBeenCalledWith(42, 5, dto);
    });
  });

  // ── getTimeline ────────────────────────────────────────

  describe('getTimeline', () => {
    it('uses default limit/offset when not provided', async () => {
      const page = { items: [], total: 0 };
      mockService.getTimeline.mockResolvedValue(page);

      const result = await controller.getTimeline(mockReq);

      expect(result).toEqual(page);
      expect(mockService.getTimeline).toHaveBeenCalledWith(42, 20, 0);
    });

    it('parses string query params to numbers', async () => {
      const page = { items: [{ id: 1 }], total: 1 };
      mockService.getTimeline.mockResolvedValue(page);

      const result = await controller.getTimeline(mockReq, '5', '10');

      expect(result).toEqual(page);
      expect(mockService.getTimeline).toHaveBeenCalledWith(42, 5, 10);
    });
  });

  // ── getGroupedByBook ──────────────────────────────────

  describe('getGroupedByBook', () => {
    it('uses default limit/offset/previewCount when not provided', async () => {
      const page = { items: [], total: 0 };
      mockService.getGroupedByBook.mockResolvedValue(page);

      const result = await controller.getGroupedByBook(mockReq);

      expect(result).toEqual(page);
      expect(mockService.getGroupedByBook).toHaveBeenCalledWith(42, 10, 0, 5);
    });

    it('parses all string query params to numbers', async () => {
      const page = {
        items: [
          {
            bookId: 10,
            book: null,
            sessionCount: 3,
            totalDurationSeconds: 600,
            lastReadAt: new Date(),
            recentRecords: [],
          },
        ],
        total: 1,
      };
      mockService.getGroupedByBook.mockResolvedValue(page);

      const result = await controller.getGroupedByBook(
        mockReq,
        '5',
        '10',
        '3',
      );

      expect(result).toEqual(page);
      expect(mockService.getGroupedByBook).toHaveBeenCalledWith(42, 5, 10, 3);
    });

    it('returns paginated BookTimelineGroup items', async () => {
      const groups = [
        {
          bookId: 10,
          book: { id: 10, tags: [] },
          sessionCount: 5,
          totalDurationSeconds: 900,
          lastReadAt: new Date('2026-02-15'),
          recentRecords: [
            { id: 1, book_id: 10 },
            { id: 2, book_id: 10 },
          ],
        },
        {
          bookId: 20,
          book: { id: 20, tags: [] },
          sessionCount: 2,
          totalDurationSeconds: 120,
          lastReadAt: new Date('2026-02-14'),
          recentRecords: [{ id: 3, book_id: 20 }],
        },
      ];
      const page = { items: groups, total: 2 };
      mockService.getGroupedByBook.mockResolvedValue(page);

      const result = await controller.getGroupedByBook(mockReq);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.items[0].bookId).toBe(10);
      expect(result.items[0].sessionCount).toBe(5);
      expect(result.items[0].recentRecords).toHaveLength(2);
      expect(result.items[1].bookId).toBe(20);
    });
  });

  // ── getByBook ──────────────────────────────────────────

  describe('getByBook', () => {
    it('uses default limit/offset when not provided', async () => {
      const page = { items: [], total: 0 };
      mockService.getByBook.mockResolvedValue(page);

      const result = await controller.getByBook(mockReq, 10);

      expect(result).toEqual(page);
      expect(mockService.getByBook).toHaveBeenCalledWith(42, 10, 20, 0);
    });

    it('parses string query params and passes bookId', async () => {
      const page = { items: [{ id: 1 }], total: 1 };
      mockService.getByBook.mockResolvedValue(page);

      const result = await controller.getByBook(mockReq, 10, '5', '10');

      expect(result).toEqual(page);
      expect(mockService.getByBook).toHaveBeenCalledWith(42, 10, 5, 10);
    });
  });
});
