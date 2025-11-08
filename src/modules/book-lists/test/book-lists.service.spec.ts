import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createRepoMock, type RepoMock } from '../../../../test/repo-mocks';
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
  let listRepo: RepoMock<FavoriteList>;
  let itemRepo: RepoMock<FavoriteListItem>;
  let bookRepo: RepoMock<Book>;

  const mockListRepo = createRepoMock<FavoriteList>();
  const mockItemRepo = createRepoMock<FavoriteListItem>();
  const mockBookRepo = createRepoMock<Book>();

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
    listRepo = module.get<RepoMock<FavoriteList>>(
      getRepositoryToken(FavoriteList),
    );
    itemRepo = module.get<RepoMock<FavoriteListItem>>(
      getRepositoryToken(FavoriteListItem),
    );
    bookRepo = module.get<RepoMock<Book>>(getRepositoryToken(Book));
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('creates list', async () => {
      listRepo.findOne.mockResolvedValueOnce(null);
      listRepo.create.mockReturnValueOnce({
        id: 1,
        name: 'Fav',
        is_public: false,
      } as unknown as FavoriteList);
      listRepo.save.mockResolvedValueOnce({
        id: 1,
        name: 'Fav',
        is_public: false,
        created_at: new Date(),
      } as unknown as FavoriteList);
      const res = await service.create(5, { name: 'Fav' });
      expect(res.name).toBe('Fav');
    });
    it('duplicate name', async () => {
      listRepo.findOne.mockResolvedValueOnce({
        id: 9,
      } as unknown as FavoriteList);
      await expect(service.create(5, { name: 'Fav' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('listMine', () => {
    it('lists mine with counts', async () => {
      listRepo.find.mockResolvedValueOnce([
        {
          id: 1,
          name: 'A',
          is_public: false,
          created_at: new Date(),
          updated_at: new Date(),
          owner: {
            id: 5,
          } as unknown as import('../../../entities/user.entity').User,
        } as unknown as FavoriteList,
      ]);
      itemRepo.count.mockResolvedValueOnce(3);
      const res = await service.listMine(5);
      expect(res[0].items_count).toBe(3);
    });
  });

  describe('getOne', () => {
    it('owner can view private', async () => {
      listRepo.findOne.mockResolvedValueOnce({
        id: 1,
        name: 'A',
        is_public: false,
        owner: { id: 5 },
        created_at: new Date(),
        updated_at: new Date(),
      } as unknown as FavoriteList);
      itemRepo.find.mockResolvedValueOnce([] as unknown as FavoriteListItem[]);
      const res = await service.getOne(1, 5);
      expect(res.id).toBe(1);
    });
    it('non-owner blocked private', async () => {
      listRepo.findOne.mockResolvedValueOnce({
        id: 1,
        is_public: false,
        owner: { id: 5 },
      } as unknown as FavoriteList);
      await expect(service.getOne(1, 6)).rejects.toThrow(ForbiddenException);
    });
    it('public visible', async () => {
      listRepo.findOne.mockResolvedValueOnce({
        id: 1,
        is_public: true,
        owner: { id: 5 },
        created_at: new Date(),
        updated_at: new Date(),
      } as unknown as FavoriteList);
      itemRepo.find.mockResolvedValueOnce([] as unknown as FavoriteListItem[]);
      const res = await service.getOne(1, 6);
      expect(res.id).toBe(1);
    });
  });

  describe('update', () => {
    it('updates name and description', async () => {
      listRepo.findOne.mockResolvedValueOnce({
        id: 1,
        name: 'Old',
        description: null,
        is_public: false,
        owner: { id: 5 },
      } as unknown as FavoriteList);
      listRepo.findOne.mockResolvedValueOnce(null); // duplicate check
      listRepo.save.mockResolvedValueOnce({
        id: 1,
        name: 'New',
        description: 'Desc',
        is_public: true,
        updated_at: new Date(),
      } as unknown as FavoriteList);
      const res = await service.update(1, 5, {
        name: 'New',
        description: 'Desc',
        is_public: true,
      });
      expect(res.name).toBe('New');
      expect(res.is_public).toBe(true);
    });
    it('rejects not owner', async () => {
      listRepo.findOne.mockResolvedValueOnce({
        id: 1,
        owner: { id: 5 },
      } as unknown as FavoriteList);
      await expect(service.update(1, 6, { name: 'x' })).rejects.toThrow(
        ForbiddenException,
      );
    });
    it('duplicate name change', async () => {
      listRepo.findOne.mockResolvedValueOnce({
        id: 1,
        name: 'Old',
        owner: { id: 5 },
      } as unknown as FavoriteList);
      listRepo.findOne.mockResolvedValueOnce({
        id: 2,
        name: 'New',
        owner: { id: 5 },
      } as unknown as FavoriteList);
      await expect(service.update(1, 5, { name: 'New' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('remove', () => {
    it('removes list', async () => {
      const listObj = { id: 1, owner: { id: 5 } } as unknown as FavoriteList;
      listRepo.findOne.mockResolvedValueOnce(listObj);
      listRepo.remove.mockResolvedValueOnce(listObj);
      const res = await service.remove(1, 5);
      expect(res.ok).toBe(true);
    });
    it('not owner', async () => {
      listRepo.findOne.mockResolvedValueOnce({
        id: 1,
        owner: { id: 5 },
      } as unknown as FavoriteList);
      await expect(service.remove(1, 6)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('addBook/removeBook', () => {
    it('adds book', async () => {
      listRepo.findOne.mockResolvedValueOnce({
        id: 1,
        owner: { id: 5 },
      } as unknown as FavoriteList);
      bookRepo.findOne.mockResolvedValueOnce({ id: 9 } as unknown as Book);
      itemRepo.findOne.mockResolvedValueOnce(null);
      itemRepo.create.mockReturnValueOnce({
        id: 11,
      } as unknown as FavoriteListItem);
      itemRepo.save.mockResolvedValueOnce({
        id: 11,
        added_at: new Date(),
      } as unknown as FavoriteListItem);
      const res = await service.addBook(1, 5, 9);
      expect(res.bookId).toBe(9);
    });

    describe('copy', () => {
      it('copies public list with unique name and items', async () => {
        listRepo.findOne.mockResolvedValueOnce({
          id: 1,
          name: 'A',
          description: 'd',
          is_public: true,
          owner: { id: 2 },
        } as unknown as FavoriteList);
        listRepo.findOne.mockResolvedValueOnce(null); // name not exists
        listRepo.create.mockReturnValueOnce({
          id: 9,
          name: 'A',
        } as unknown as FavoriteList);
        listRepo.save.mockResolvedValueOnce({
          id: 9,
          name: 'A',
          is_public: false,
        } as unknown as FavoriteList);
        itemRepo.find.mockResolvedValueOnce([
          { id: 11, book: { id: 7 } } as unknown as FavoriteListItem,
        ] as unknown as FavoriteListItem[]);
        itemRepo.create.mockReturnValueOnce({
          id: 20,
        } as unknown as FavoriteListItem);
        itemRepo.save.mockResolvedValueOnce({
          id: 20,
        } as unknown as FavoriteListItem);
        itemRepo.count.mockResolvedValueOnce(1);
        const res = await service.copy(1, 5);
        expect(res.items_count).toBe(1);
        expect(res.is_public).toBe(false);
      });

      it('forbid copying private list of others', async () => {
        listRepo.findOne.mockResolvedValueOnce({
          id: 1,
          name: 'A',
          is_public: false,
          owner: { id: 2 },
        } as unknown as FavoriteList);
        await expect(service.copy(1, 5)).rejects.toThrow(ForbiddenException);
      });

      it('increments name to avoid conflicts', async () => {
        listRepo.findOne.mockResolvedValueOnce({
          id: 1,
          name: 'A',
          is_public: true,
          owner: { id: 2 },
        } as unknown as FavoriteList);
        // first check returns exists, second returns exists, third returns null
        listRepo.findOne
          .mockResolvedValueOnce({ id: 2 } as unknown as FavoriteList)
          .mockResolvedValueOnce({ id: 3 } as unknown as FavoriteList)
          .mockResolvedValueOnce(null);
        listRepo.create.mockReturnValueOnce({
          id: 9,
          name: 'A (copy 2)',
        } as unknown as FavoriteList);
        listRepo.save.mockResolvedValueOnce({
          id: 9,
          name: 'A (copy 2)',
          is_public: false,
        } as unknown as FavoriteList);
        itemRepo.find.mockResolvedValueOnce(
          [] as unknown as FavoriteListItem[],
        );
        itemRepo.count.mockResolvedValueOnce(0);
        const res = await service.copy(1, 5);
        expect(res.name).toContain('copy');
      });
    });
    it('rejects duplicate book', async () => {
      listRepo.findOne.mockResolvedValueOnce({
        id: 1,
        owner: { id: 5 },
      } as unknown as FavoriteList);
      bookRepo.findOne.mockResolvedValueOnce({ id: 9 } as unknown as Book);
      itemRepo.findOne.mockResolvedValueOnce({
        id: 99,
      } as unknown as FavoriteListItem);
      await expect(service.addBook(1, 5, 9)).rejects.toThrow(ConflictException);
    });
    it('removes book', async () => {
      listRepo.findOne.mockResolvedValueOnce({
        id: 1,
        owner: { id: 5 },
      } as unknown as FavoriteList);
      itemRepo.findOne.mockResolvedValueOnce({
        id: 99,
      } as unknown as FavoriteListItem);
      itemRepo.remove.mockResolvedValueOnce({
        id: 99,
      } as unknown as FavoriteListItem);
      const res = await service.removeBook(1, 5, 9);
      expect(res.ok).toBe(true);
    });
    it('remove missing book', async () => {
      listRepo.findOne.mockResolvedValueOnce({
        id: 1,
        owner: { id: 5 },
      } as unknown as FavoriteList);
      itemRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.removeBook(1, 5, 9)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
