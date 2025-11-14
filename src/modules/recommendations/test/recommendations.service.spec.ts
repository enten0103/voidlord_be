import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecommendationsService } from '../recommendations.service';
import { RecommendationSection } from '../../../entities/recommendation-section.entity';
import { MediaLibrary } from '../../../entities/media-library.entity';
import { User } from '../../../entities/user.entity';
import { ConflictException } from '@nestjs/common';

describe('RecommendationsService', () => {
  let service: RecommendationsService;
  let sectionRepo: jest.Mocked<Repository<RecommendationSection>>;
  let libraryRepo: jest.Mocked<Repository<MediaLibrary>>;

  const mockSection: RecommendationSection = {
    id: 1,
    key: 'today_hot',
    title: '今日最热',
    description: 'desc',
    sort_order: 0,
    active: true,
    created_at: new Date(),
    updated_at: new Date(),
    library: null as unknown as MediaLibrary,
  };

  const mockLibrary: MediaLibrary = {
    id: 10,
    name: '精选媒体库',
    description: 'desc',
    is_public: true,
    is_system: false,
    owner: { id: 1 } as User,
    created_at: new Date(),
    updated_at: new Date(),
    items: [],
    tags: [],
  } as MediaLibrary;

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
  const mockLibraryRepo: Partial<jest.Mocked<Repository<MediaLibrary>>> = {
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
          provide: getRepositoryToken(MediaLibrary),
          useValue: mockLibraryRepo,
        },
      ],
    }).compile();

    service = module.get(RecommendationsService);
    sectionRepo = module.get(getRepositoryToken(RecommendationSection));
    libraryRepo = module.get(getRepositoryToken(MediaLibrary));
  });

  afterEach(() => jest.clearAllMocks());

  it('createSection ok', async () => {
    sectionRepo.findOne.mockResolvedValue(null); // uniqueness check
    libraryRepo.findOne.mockResolvedValue(mockLibrary); // library exists & public
    const createdSection: RecommendationSection = {
      ...mockSection,
      id: 1,
      key: 'today_hot',
      title: '今日最热',
      library: mockLibrary,
    } as RecommendationSection;
    sectionRepo.create.mockReturnValue(createdSection);
    sectionRepo.save.mockResolvedValue(createdSection);
    const r = await service.createSection({
      key: 'today_hot',
      title: '今日最热',
      mediaLibraryId: mockLibrary.id,
    });
    expect(r.key).toBe('today_hot');
    expect(r.library?.id).toBe(mockLibrary.id);
  });

  it('createSection duplicate', async () => {
    sectionRepo.findOne.mockResolvedValue(mockSection); // duplicate key
    libraryRepo.findOne.mockResolvedValue(mockLibrary);
    await expect(
      service.createSection({
        key: 'today_hot',
        title: 'A',
        mediaLibraryId: mockLibrary.id,
      }),
    ).rejects.toThrow(ConflictException);
  });
  it('updateSection switch library', async () => {
    // existing section with library A
    const libA = { ...mockLibrary } as MediaLibrary;
    const libB: MediaLibrary = {
      ...mockLibrary,
      id: 11,
      name: 'LibB',
    } as MediaLibrary;
    sectionRepo.findOne.mockResolvedValue({
      ...mockSection,
      library: libA,
    } as RecommendationSection);
    libraryRepo.findOne.mockResolvedValue(libB);
    sectionRepo.save.mockResolvedValue({
      ...mockSection,
      id: 1,
      library: libB,
    } as RecommendationSection);
    const updated = await service.updateSection(1, { mediaLibraryId: libB.id });
    expect(updated.library?.id).toBe(libB.id);
  });

  it('updateSection duplicate key', async () => {
    const lib = { ...mockLibrary } as MediaLibrary;
    sectionRepo.findOne.mockResolvedValueOnce({
      ...mockSection,
      library: lib,
    } as RecommendationSection); // getSection
    sectionRepo.findOne.mockResolvedValueOnce({
      id: 99,
    } as RecommendationSection); // duplicate key check
    await expect(service.updateSection(1, { key: 'dup_key' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('batchReorder updates sort_order', async () => {
    const lib = { ...mockLibrary } as MediaLibrary;
    const s1: RecommendationSection = {
      ...mockSection,
      id: 1,
      sort_order: 0,
      library: lib,
    } as RecommendationSection;
    const s2: RecommendationSection = {
      ...mockSection,
      id: 2,
      sort_order: 1,
      library: lib,
    } as RecommendationSection;
    sectionRepo.findBy.mockResolvedValue([s1, s2]);
    sectionRepo.save.mockResolvedValue(s1);
    await service.batchReorder([2, 1]);
    // objects mutated prior to save
    expect(s1.sort_order).toBe(1);
    expect(s2.sort_order).toBe(0);
  });
});
