import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecommendationsService } from '../recommendations.service';
import { RecommendationSection } from '../../../entities/recommendation-section.entity';
import { RecommendationItem } from '../../../entities/recommendation-item.entity';
import { Book } from '../../../entities/book.entity';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('RecommendationsService', () => {
  let service: RecommendationsService;
  let sectionRepo: jest.Mocked<Repository<RecommendationSection>>;
  let itemRepo: jest.Mocked<Repository<RecommendationItem>>;
  let bookRepo: jest.Mocked<Repository<Book>>;

  const mockSection: RecommendationSection = {
    id: 1,
    key: 'today_hot',
    title: '今日最热',
    description: 'desc',
    sort_order: 0,
    active: true,
    created_at: new Date(),
    updated_at: new Date(),
    items: [],
  };

  const mockBook: Book = {
    id: 10,
    hash: 'hash10',
    title: 'Book 10',
    description: 'd',
    created_at: new Date(),
    updated_at: new Date(),
    tags: [],
  };

  const mockSectionRepo: Partial<
    jest.Mocked<Repository<RecommendationSection>>
  > = {
    findOne: jest.fn(),
    find: jest.fn(),
    findBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const mockItemRepo: Partial<jest.Mocked<Repository<RecommendationItem>>> = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const mockBookRepo: Partial<jest.Mocked<Repository<Book>>> = {
    findOne: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecommendationsService,
        {
          provide: getRepositoryToken(RecommendationSection),
          useValue: mockSectionRepo,
        },
        {
          provide: getRepositoryToken(RecommendationItem),
          useValue: mockItemRepo,
        },
        { provide: getRepositoryToken(Book), useValue: mockBookRepo },
      ],
    }).compile();

    service = module.get(RecommendationsService);
    sectionRepo = module.get(getRepositoryToken(RecommendationSection));
    itemRepo = module.get(getRepositoryToken(RecommendationItem));
    bookRepo = module.get(getRepositoryToken(Book));
  });

  afterEach(() => jest.clearAllMocks());

  it('createSection ok', async () => {
    sectionRepo.findOne.mockResolvedValue(null);
    sectionRepo.create.mockReturnValue(mockSection);
    sectionRepo.save.mockResolvedValue(mockSection);
    const r = await service.createSection({
      key: 'today_hot',
      title: '今日最热',
    });
    expect(r.key).toBe('today_hot');
  });

  it('createSection duplicate', async () => {
    sectionRepo.findOne.mockResolvedValue(mockSection);
    await expect(
      service.createSection({ key: 'today_hot', title: 'A' }),
    ).rejects.toThrow(ConflictException);
  });

  it('addItem flow', async () => {
    sectionRepo.findOne.mockResolvedValue({
      ...mockSection,
      items: [],
    } as RecommendationSection);
    bookRepo.findOne.mockResolvedValue(mockBook);
    itemRepo.findOne.mockResolvedValue(null);
    const newItem: RecommendationItem = {
      id: 99,
      position: 0,
      section: mockSection,
      book: mockBook,
      created_at: new Date(),
      updated_at: new Date(),
    } as RecommendationItem;
    itemRepo.create.mockReturnValue(newItem);
    itemRepo.save.mockResolvedValue(newItem);
    const item = await service.addItem(1, { bookId: 10 });
    expect(item.book.id).toBe(10);
  });

  it('addItem duplicate', async () => {
    sectionRepo.findOne.mockResolvedValue({
      ...mockSection,
      items: [],
    } as RecommendationSection);
    bookRepo.findOne.mockResolvedValue(mockBook);
    itemRepo.findOne.mockResolvedValue({ id: 1 } as RecommendationItem);
    await expect(service.addItem(1, { bookId: 10 })).rejects.toThrow(
      ConflictException,
    );
  });

  it('removeItem ok', async () => {
    itemRepo.findOne.mockResolvedValue({
      id: 5,
      section: { id: 1 },
    } as RecommendationItem);
    itemRepo.remove.mockResolvedValue({} as RecommendationItem);
    await service.removeItem(1, 5);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(itemRepo.remove).toHaveBeenCalled();
  });

  it('removeItem not found', async () => {
    itemRepo.findOne.mockResolvedValue(null);
    await expect(service.removeItem(1, 5)).rejects.toThrow(NotFoundException);
  });
});
