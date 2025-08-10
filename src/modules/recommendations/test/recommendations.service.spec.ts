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

    const mockSectionRepo = {
        findOne: jest.fn(),
        find: jest.fn(),
        findBy: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        remove: jest.fn(),
    } as any;
    const mockItemRepo = {
        findOne: jest.fn(),
        find: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        remove: jest.fn(),
    } as any;
    const mockBookRepo = {
        findOne: jest.fn(),
        find: jest.fn(),
    } as any;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RecommendationsService,
                { provide: getRepositoryToken(RecommendationSection), useValue: mockSectionRepo },
                { provide: getRepositoryToken(RecommendationItem), useValue: mockItemRepo },
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
        sectionRepo.create.mockReturnValue(mockSection as any);
        sectionRepo.save.mockResolvedValue(mockSection as any);
        const r = await service.createSection({ key: 'today_hot', title: '今日最热' });
        expect(r.key).toBe('today_hot');
    });

    it('createSection duplicate', async () => {
        sectionRepo.findOne.mockResolvedValue(mockSection as any);
        await expect(service.createSection({ key: 'today_hot', title: 'A' })).rejects.toThrow(ConflictException);
    });

    it('addItem flow', async () => {
        sectionRepo.findOne.mockResolvedValue({ ...mockSection, items: [] } as any);
        bookRepo.findOne.mockResolvedValue(mockBook as any);
        itemRepo.findOne.mockResolvedValue(null);
        itemRepo.create.mockReturnValue({ id: 99, position: 0, section: mockSection, book: mockBook } as any);
        itemRepo.save.mockResolvedValue({ id: 99, position: 0, section: mockSection, book: mockBook } as any);
        const item = await service.addItem(1, { bookId: 10 });
        expect(item.book.id).toBe(10);
    });

    it('addItem duplicate', async () => {
        sectionRepo.findOne.mockResolvedValue({ ...mockSection, items: [] } as any);
        bookRepo.findOne.mockResolvedValue(mockBook as any);
        itemRepo.findOne.mockResolvedValue({ id: 1 } as any);
        await expect(service.addItem(1, { bookId: 10 })).rejects.toThrow(ConflictException);
    });

    it('removeItem ok', async () => {
        itemRepo.findOne.mockResolvedValue({ id: 5, section: { id: 1 } } as any);
        itemRepo.remove.mockResolvedValue({} as any);
        await service.removeItem(1, 5);
        expect(itemRepo.remove).toHaveBeenCalled();
    });

    it('removeItem not found', async () => {
        itemRepo.findOne.mockResolvedValue(null);
        await expect(service.removeItem(1, 5)).rejects.toThrow(NotFoundException);
    });
});
