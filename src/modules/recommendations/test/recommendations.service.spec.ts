import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecommendationsService } from '../recommendations.service';
import { RecommendationSection } from '../../../entities/recommendation-section.entity';
import { RecommendationItem } from '../../../entities/recommendation-item.entity';
import { FavoriteList } from '../../../entities/favorite-list.entity';
import { User } from '../../../entities/user.entity';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('RecommendationsService', () => {
  let service: RecommendationsService;
  let sectionRepo: jest.Mocked<Repository<RecommendationSection>>;
  let itemRepo: jest.Mocked<Repository<RecommendationItem>>;
  let listRepo: jest.Mocked<Repository<FavoriteList>>;

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

  const mockList: FavoriteList = {
    id: 10,
    name: '精选书单',
    description: 'desc',
    is_public: true,
    owner: { id: 1 } as User,
    created_at: new Date(),
    updated_at: new Date(),
    items: [],
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
  const mockListRepo: Partial<jest.Mocked<Repository<FavoriteList>>> = {
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
        { provide: getRepositoryToken(FavoriteList), useValue: mockListRepo },
      ],
    }).compile();

    service = module.get(RecommendationsService);
    sectionRepo = module.get(getRepositoryToken(RecommendationSection));
    itemRepo = module.get(getRepositoryToken(RecommendationItem));
    listRepo = module.get(getRepositoryToken(FavoriteList));
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
    listRepo.findOne.mockResolvedValue(mockList);
    itemRepo.findOne.mockResolvedValue(null);
    const newItem: RecommendationItem = {
      id: 99,
      position: 0,
      section: mockSection,
      list: mockList,
      created_at: new Date(),
      updated_at: new Date(),
    } as RecommendationItem;
    itemRepo.create.mockReturnValue(newItem);
    itemRepo.save.mockResolvedValue(newItem);
    const item = await service.addItem(1, { bookListId: 10 });
    expect(item.list.id).toBe(10);
  });

  it('addItem duplicate', async () => {
    sectionRepo.findOne.mockResolvedValue({
      ...mockSection,
      items: [],
    } as RecommendationSection);
    listRepo.findOne.mockResolvedValue(mockList);
    itemRepo.findOne.mockResolvedValue({ id: 1 } as RecommendationItem);
    await expect(service.addItem(1, { bookListId: 10 })).rejects.toThrow(
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
