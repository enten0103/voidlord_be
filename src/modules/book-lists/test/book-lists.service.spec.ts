import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BookListsService } from '../book-lists.service';
import { FavoriteList } from '../../../entities/favorite-list.entity';
import { FavoriteListItem } from '../../../entities/favorite-list-item.entity';
import { Book } from '../../../entities/book.entity';
import {
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';

describe('BookListsService', () => {
    let service: BookListsService;
    let listRepo: jest.Mocked<Repository<FavoriteList>>;
    let itemRepo: jest.Mocked<Repository<FavoriteListItem>>;
    let bookRepo: jest.Mocked<Repository<Book>>;

    const mockListRepo = {
        findOne: jest.fn(),
        find: jest.fn(),
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
        count: jest.fn(),
    } as any;
    const mockBookRepo = {
        findOne: jest.fn(),
    } as any;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BookListsService,
                { provide: getRepositoryToken(FavoriteList), useValue: mockListRepo },
                {
                    provide: getRepositoryToken(FavoriteListItem),
                    useValue: mockItemRepo,
                },
                { provide: getRepositoryToken(Book), useValue: mockBookRepo },
            ],
        }).compile();

        service = module.get(BookListsService);
        listRepo = module.get(getRepositoryToken(FavoriteList));
        itemRepo = module.get(getRepositoryToken(FavoriteListItem));
        bookRepo = module.get(getRepositoryToken(Book));
    });

    afterEach(() => jest.clearAllMocks());

    describe('create', () => {
        it('creates list', async () => {
            (listRepo.findOne as any).mockResolvedValueOnce(null);
            (listRepo.create as any).mockReturnValueOnce({
                id: 1,
                name: 'Fav',
                is_public: false,
            });
            (listRepo.save as any).mockResolvedValueOnce({
                id: 1,
                name: 'Fav',
                is_public: false,
                created_at: new Date(),
            });
            const res = await service.create(5, { name: 'Fav' });
            expect(res.name).toBe('Fav');
        });
        it('duplicate name', async () => {
            (listRepo.findOne as any).mockResolvedValueOnce({ id: 9 });
            await expect(service.create(5, { name: 'Fav' })).rejects.toThrow(
                ConflictException,
            );
        });
    });

    describe('listMine', () => {
        it('lists mine with counts', async () => {
            (listRepo.find as any).mockResolvedValueOnce([
                {
                    id: 1,
                    name: 'A',
                    is_public: false,
                    created_at: new Date(),
                    updated_at: new Date(),
                },
            ]);
            (itemRepo.count as any).mockResolvedValueOnce(3);
            const res = await service.listMine(5);
            expect(res[0].items_count).toBe(3);
        });
    });

    describe('getOne', () => {
        it('owner can view private', async () => {
            (listRepo.findOne as any).mockResolvedValueOnce({
                id: 1,
                name: 'A',
                is_public: false,
                owner: { id: 5 },
                created_at: new Date(),
                updated_at: new Date(),
            });
            (itemRepo.find as any).mockResolvedValueOnce([]);
            const res = await service.getOne(1, 5);
            expect(res.id).toBe(1);
        });
        it('non-owner blocked private', async () => {
            (listRepo.findOne as any).mockResolvedValueOnce({
                id: 1,
                is_public: false,
                owner: { id: 5 },
            });
            await expect(service.getOne(1, 6)).rejects.toThrow(ForbiddenException);
        });
        it('public visible', async () => {
            (listRepo.findOne as any).mockResolvedValueOnce({
                id: 1,
                is_public: true,
                owner: { id: 5 },
                created_at: new Date(),
                updated_at: new Date(),
            });
            (itemRepo.find as any).mockResolvedValueOnce([]);
            const res = await service.getOne(1, 6);
            expect(res.id).toBe(1);
        });
    });

    describe('update', () => {
        it('updates name and description', async () => {
            (listRepo.findOne as any).mockResolvedValueOnce({
                id: 1,
                name: 'Old',
                description: null,
                is_public: false,
                owner: { id: 5 },
            });
            (listRepo.findOne as any).mockResolvedValueOnce(null); // duplicate check
            (listRepo.save as any).mockResolvedValueOnce({
                id: 1,
                name: 'New',
                description: 'Desc',
                is_public: true,
                updated_at: new Date(),
            });
            const res = await service.update(1, 5, {
                name: 'New',
                description: 'Desc',
                is_public: true,
            });
            expect(res.name).toBe('New');
            expect(res.is_public).toBe(true);
        });
        it('rejects not owner', async () => {
            (listRepo.findOne as any).mockResolvedValueOnce({
                id: 1,
                owner: { id: 5 },
            });
            await expect(service.update(1, 6, { name: 'x' })).rejects.toThrow(
                ForbiddenException,
            );
        });
        it('duplicate name change', async () => {
            (listRepo.findOne as any).mockResolvedValueOnce({
                id: 1,
                name: 'Old',
                owner: { id: 5 },
            });
            (listRepo.findOne as any).mockResolvedValueOnce({
                id: 2,
                name: 'New',
                owner: { id: 5 },
            });
            await expect(service.update(1, 5, { name: 'New' })).rejects.toThrow(
                ConflictException,
            );
        });
    });

    describe('remove', () => {
        it('removes list', async () => {
            const listObj = { id: 1, owner: { id: 5 } };
            (listRepo.findOne as any).mockResolvedValueOnce(listObj);
            (listRepo.remove as any).mockResolvedValueOnce(undefined);
            const res = await service.remove(1, 5);
            expect(res.ok).toBe(true);
        });
        it('not owner', async () => {
            (listRepo.findOne as any).mockResolvedValueOnce({
                id: 1,
                owner: { id: 5 },
            });
            await expect(service.remove(1, 6)).rejects.toThrow(ForbiddenException);
        });
    });

    describe('addBook/removeBook', () => {
        it('adds book', async () => {
            (listRepo.findOne as any).mockResolvedValueOnce({
                id: 1,
                owner: { id: 5 },
            });
            (bookRepo.findOne as any).mockResolvedValueOnce({ id: 9 });
            (itemRepo.findOne as any).mockResolvedValueOnce(null);
            (itemRepo.create as any).mockReturnValueOnce({ id: 11 });
            (itemRepo.save as any).mockResolvedValueOnce({
                id: 11,
                added_at: new Date(),
            });
            const res = await service.addBook(1, 5, 9);
            expect(res.bookId).toBe(9);
        });

        describe('copy', () => {
            it('copies public list with unique name and items', async () => {
                (listRepo.findOne as any).mockResolvedValueOnce({
                    id: 1,
                    name: 'A',
                    description: 'd',
                    is_public: true,
                    owner: { id: 2 },
                });
                (listRepo.findOne as any).mockResolvedValueOnce(null); // name not exists
                (listRepo.create as any).mockReturnValueOnce({ id: 9, name: 'A' });
                (listRepo.save as any).mockResolvedValueOnce({
                    id: 9,
                    name: 'A',
                    is_public: false,
                });
                (itemRepo.find as any).mockResolvedValueOnce([
                    { id: 11, book: { id: 7 } },
                ]);
                (itemRepo.create as any).mockReturnValueOnce({ id: 20 });
                (itemRepo.save as any).mockResolvedValueOnce(undefined);
                (itemRepo.count as any).mockResolvedValueOnce(1);
                const res = await service.copy(1, 5);
                expect(res.items_count).toBe(1);
                expect(res.is_public).toBe(false);
            });

            it('forbid copying private list of others', async () => {
                (listRepo.findOne as any).mockResolvedValueOnce({
                    id: 1,
                    name: 'A',
                    is_public: false,
                    owner: { id: 2 },
                });
                await expect(service.copy(1, 5)).rejects.toThrow(ForbiddenException);
            });

            it('increments name to avoid conflicts', async () => {
                (listRepo.findOne as any).mockResolvedValueOnce({
                    id: 1,
                    name: 'A',
                    is_public: true,
                    owner: { id: 2 },
                });
                // first check returns exists, second returns exists, third returns null
                (listRepo.findOne as any)
                    .mockResolvedValueOnce({ id: 2 })
                    .mockResolvedValueOnce({ id: 3 })
                    .mockResolvedValueOnce(null);
                (listRepo.create as any).mockReturnValueOnce({
                    id: 9,
                    name: 'A (copy 2)',
                });
                (listRepo.save as any).mockResolvedValueOnce({
                    id: 9,
                    name: 'A (copy 2)',
                    is_public: false,
                });
                (itemRepo.find as any).mockResolvedValueOnce([]);
                (itemRepo.count as any).mockResolvedValueOnce(0);
                const res = await service.copy(1, 5);
                expect(res.name).toContain('copy');
            });
        });
        it('rejects duplicate book', async () => {
            (listRepo.findOne as any).mockResolvedValueOnce({
                id: 1,
                owner: { id: 5 },
            });
            (bookRepo.findOne as any).mockResolvedValueOnce({ id: 9 });
            (itemRepo.findOne as any).mockResolvedValueOnce({ id: 99 });
            await expect(service.addBook(1, 5, 9)).rejects.toThrow(ConflictException);
        });
        it('removes book', async () => {
            (listRepo.findOne as any).mockResolvedValueOnce({
                id: 1,
                owner: { id: 5 },
            });
            (itemRepo.findOne as any).mockResolvedValueOnce({ id: 99 });
            (itemRepo.remove as any).mockResolvedValueOnce(undefined);
            const res = await service.removeBook(1, 5, 9);
            expect(res.ok).toBe(true);
        });
        it('remove missing book', async () => {
            (listRepo.findOne as any).mockResolvedValueOnce({
                id: 1,
                owner: { id: 5 },
            });
            (itemRepo.findOne as any).mockResolvedValueOnce(null);
            await expect(service.removeBook(1, 5, 9)).rejects.toThrow(
                NotFoundException,
            );
        });
    });
});
