import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReadingRecordsService } from '../reading-records.service';
import { ReadingRecord } from '../../../entities/reading-record.entity';
import { Book } from '../../../entities/book.entity';
import { NotFoundException } from '@nestjs/common';
import { MediaLibrary } from '../../../entities/media-library.entity';
import { MediaLibraryItem } from '../../../entities/media-library-item.entity';

describe('ReadingRecordsService', () => {
  let service: ReadingRecordsService;
  let recordRepo: jest.Mocked<Repository<ReadingRecord>>;
  let bookRepo: jest.Mocked<Repository<Book>>;
  let libraryRepo: jest.Mocked<Repository<MediaLibrary>>;
  let itemRepo: jest.Mocked<Repository<MediaLibraryItem>>;

  const mockRecordRepo: Partial<jest.Mocked<Repository<ReadingRecord>>> = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const mockBookRepo: Partial<jest.Mocked<Repository<Book>>> = {
    findOne: jest.fn(),
  };
  const mockLibraryRepo: Partial<jest.Mocked<Repository<MediaLibrary>>> = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const mockItemRepo: Partial<jest.Mocked<Repository<MediaLibraryItem>>> = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReadingRecordsService,
        {
          provide: getRepositoryToken(ReadingRecord),
          useValue: mockRecordRepo,
        },
        { provide: getRepositoryToken(Book), useValue: mockBookRepo },
        {
          provide: getRepositoryToken(MediaLibrary),
          useValue: mockLibraryRepo,
        },
        {
          provide: getRepositoryToken(MediaLibraryItem),
          useValue: mockItemRepo,
        },
      ],
    }).compile();
    service = moduleRef.get(ReadingRecordsService);
    recordRepo = moduleRef.get(getRepositoryToken(ReadingRecord));
    bookRepo = moduleRef.get(getRepositoryToken(Book));
    libraryRepo = moduleRef.get(getRepositoryToken(MediaLibrary));
    itemRepo = moduleRef.get(getRepositoryToken(MediaLibraryItem));
  });

  afterEach(() => jest.clearAllMocks());

  it('creates a new record on upsert', async () => {
    bookRepo.findOne.mockResolvedValueOnce({ id: 1 } as unknown as Book);
    recordRepo.findOne.mockResolvedValueOnce(null);
    recordRepo.create.mockReturnValueOnce({
      id: 9,
    } as unknown as ReadingRecord);
    recordRepo.save.mockResolvedValueOnce({
      id: 9,
      progress: 0,
      status: 'reading',
      total_minutes: 0,
      updated_at: new Date(),
    } as unknown as ReadingRecord);
    // system library ensure + item insertion
    libraryRepo.findOne.mockResolvedValueOnce(null);
    libraryRepo.create.mockReturnValueOnce({ id: 50 } as MediaLibrary);
    libraryRepo.save.mockResolvedValueOnce({ id: 50 } as MediaLibrary);
    itemRepo.findOne.mockResolvedValueOnce(null);
    itemRepo.create.mockReturnValueOnce({ id: 77 } as MediaLibraryItem);
    itemRepo.save.mockResolvedValueOnce({ id: 77 } as MediaLibraryItem);
    const res = await service.upsert(5, { bookId: 1 });
    expect(res.id).toBe(9);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(libraryRepo.create).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(itemRepo.create).toHaveBeenCalled();
  });

  it('updates existing record and increments minutes', async () => {
    bookRepo.findOne.mockResolvedValueOnce({ id: 1 } as unknown as Book);
    recordRepo.findOne.mockResolvedValueOnce({
      id: 9,
      status: 'reading',
      progress: 50,
      total_minutes: 10,
    } as unknown as ReadingRecord);
    recordRepo.save.mockResolvedValueOnce({
      id: 9,
      progress: 60,
      status: 'reading',
      total_minutes: 25,
      updated_at: new Date(),
    } as unknown as ReadingRecord);
    libraryRepo.findOne.mockResolvedValueOnce({ id: 50 } as MediaLibrary); // existing system library
    itemRepo.findOne.mockResolvedValueOnce({ id: 77 } as MediaLibraryItem); // item already exists
    const res = await service.upsert(5, {
      bookId: 1,
      progress: 60,
      minutes_increment: 15,
    });
    expect(res.total_minutes).toBe(25);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(libraryRepo.create).not.toHaveBeenCalled();
  });

  it('getOne returns record', async () => {
    recordRepo.findOne.mockResolvedValueOnce({
      id: 9,
      book: { id: 1, title: 'T' },
    } as unknown as ReadingRecord);
    const res = await service.getOne(5, 1);
    expect(res.book?.id).toBe(1);
  });

  it('getOne 404', async () => {
    recordRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.getOne(5, 1)).rejects.toThrow(NotFoundException);
  });

  it('list returns array', async () => {
    recordRepo.find.mockResolvedValueOnce([
      {
        id: 9,
        book: { id: 1, title: 'T' } as unknown as Book,
      } as unknown as ReadingRecord,
    ]);
    const res = await service.list(5);
    expect(res.length).toBe(1);
  });

  it('remove deletes record', async () => {
    recordRepo.findOne.mockResolvedValueOnce({
      id: 9,
    } as unknown as ReadingRecord);
    recordRepo.remove.mockResolvedValueOnce(
      undefined as unknown as ReadingRecord,
    );
    const res = await service.remove(5, 9);
    expect(res.ok).toBe(true);
  });
});
