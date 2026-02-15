import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MediaLibrariesService } from '../media-libraries.service';
import { MediaLibrary } from '../../../entities/media-library.entity';
import { MediaLibraryItem } from '../../../entities/media-library-item.entity';
import { Book } from '../../../entities/book.entity';
import { Tag } from '../../../entities/tag.entity';
import { User } from '../../../entities/user.entity';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

const stubUser = (id: number): User => ({
  id,
  username: `user${id}`,
  email: `user${id}@example.com`,
  password: '',
  created_at: new Date(),
  updated_at: new Date(),
});

describe('MediaLibrariesService', () => {
  let service: MediaLibrariesService;
  let libraryRepo: jest.Mocked<Repository<MediaLibrary>>;
  let itemRepo: jest.Mocked<Repository<MediaLibraryItem>>;
  let bookRepo: jest.Mocked<Repository<Book>>;
  let tagRepo: jest.Mocked<Repository<Tag>>;

  const mockLibraryRepo: Partial<jest.Mocked<Repository<MediaLibrary>>> = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    count: jest.fn(),
  };
  const mockItemRepo: Partial<jest.Mocked<Repository<MediaLibraryItem>>> = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    count: jest.fn(),
    findAndCount: jest.fn(),
  };
  const mockBookRepo: Partial<jest.Mocked<Repository<Book>>> = {
    findOne: jest.fn(),
  };
  const mockTagRepo: Partial<jest.Mocked<Repository<Tag>>> = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        MediaLibrariesService,
        {
          provide: getRepositoryToken(MediaLibrary),
          useValue: mockLibraryRepo,
        },
        {
          provide: getRepositoryToken(MediaLibraryItem),
          useValue: mockItemRepo,
        },
        { provide: getRepositoryToken(Book), useValue: mockBookRepo },
        { provide: getRepositoryToken(Tag), useValue: mockTagRepo },
      ],
    }).compile();
    service = moduleRef.get(MediaLibrariesService);
    libraryRepo = moduleRef.get(getRepositoryToken(MediaLibrary));
    itemRepo = moduleRef.get(getRepositoryToken(MediaLibraryItem));
    bookRepo = moduleRef.get(getRepositoryToken(Book));
    tagRepo = moduleRef.get(getRepositoryToken(Tag));
  });

  afterEach(() => jest.clearAllMocks());

  it('create ok', async () => {
    libraryRepo.findOne.mockResolvedValueOnce(null);
    tagRepo.findOne.mockResolvedValue(null);
    tagRepo.create.mockReturnValue({
      id: 1,
      key: 'genre',
      value: 'fantasy',
      shown: true,
    } as unknown as Tag);
    tagRepo.save.mockResolvedValue({
      id: 1,
      key: 'genre',
      value: 'fantasy',
      shown: true,
    } as unknown as Tag);
    libraryRepo.create.mockReturnValue({ id: 10 } as MediaLibrary);
    libraryRepo.save.mockResolvedValueOnce({
      id: 10,
      name: 'Lib',
      description: null,
      is_public: false,
      is_system: false,
      owner: stubUser(5),
      tags: [{ id: 1, key: 'genre', value: 'fantasy' } as Tag],
      created_at: new Date(),
      updated_at: new Date(),
      items: [],
    } as MediaLibrary);
    const r = await service.create(5, {
      name: 'Lib',
      tags: [{ key: 'genre', value: 'fantasy' }],
    });
    expect(r.name).toBe('Lib');
    expect(r.tags[0].key).toBe('genre');
  });

  it('create duplicate name', async () => {
    libraryRepo.findOne.mockResolvedValueOnce({
      id: 10,
      name: 'Lib',
      description: null,
      is_public: false,
      is_system: false,
      owner: stubUser(5),
      tags: [],
      created_at: new Date(),
      updated_at: new Date(),
      items: [],
    } as MediaLibrary);
    await expect(service.create(5, { name: 'Lib' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('addBook ok', async () => {
    libraryRepo.findOne.mockResolvedValueOnce({
      id: 10,
      name: 'L',
      description: null,
      is_public: false,
      is_system: false,
      owner: stubUser(5),
      tags: [],
      created_at: new Date(),
      updated_at: new Date(),
      items: [],
    } as MediaLibrary);
    bookRepo.findOne.mockResolvedValueOnce({ id: 7 } as Book);
    itemRepo.findOne.mockResolvedValueOnce(null);
    itemRepo.create.mockReturnValue({ id: 22 } as MediaLibraryItem);
    itemRepo.save.mockResolvedValueOnce({
      id: 22,
      library: { id: 10 } as MediaLibrary,
      book: { id: 7 } as Book,
      child_library: null,
      added_at: new Date(),
    } as MediaLibraryItem);
    const res = await service.addBook(10, 5, 7);
    expect(res.bookId).toBe(7);
  });

  it('addBook forbidden when not owner', async () => {
    libraryRepo.findOne.mockResolvedValueOnce({
      id: 10,
      name: 'Other',
      description: null,
      is_public: false,
      is_system: false,
      owner: stubUser(8),
      tags: [],
      created_at: new Date(),
      updated_at: new Date(),
      items: [],
    } as MediaLibrary);
    await expect(service.addBook(10, 5, 7)).rejects.toThrow(ForbiddenException);
  });

  it('addBook system locked', async () => {
    libraryRepo.findOne.mockResolvedValueOnce({
      id: 10,
      name: 'Sys',
      description: null,
      is_public: false,
      is_system: true,
      owner: stubUser(5),
      tags: [],
      created_at: new Date(),
      updated_at: new Date(),
      items: [],
    } as MediaLibrary);
    bookRepo.findOne.mockResolvedValueOnce({ id: 7 } as Book);
    itemRepo.findOne.mockResolvedValueOnce(null);
    itemRepo.create.mockReturnValue({ id: 33 } as MediaLibraryItem);
    itemRepo.save.mockResolvedValueOnce({
      id: 33,
      library: { id: 10 } as MediaLibrary,
      book: { id: 7 } as Book,
      child_library: null,
      added_at: new Date(),
    } as MediaLibraryItem);
    const res = await service.addBook(10, 5, 7);
    expect(res.bookId).toBe(7);
  });

  it('addLibrary self conflict', async () => {
    await expect(service.addLibrary(10, 5, 10)).rejects.toThrow(
      ConflictException,
    );
  });

  it('addLibrary duplicate', async () => {
    libraryRepo.findOne.mockResolvedValueOnce({
      id: 10,
      name: 'Parent',
      description: null,
      is_public: false,
      is_system: false,
      owner: stubUser(5),
      tags: [],
      created_at: new Date(),
      updated_at: new Date(),
      items: [],
    } as MediaLibrary);
    libraryRepo.findOne.mockResolvedValueOnce({
      id: 11,
      name: 'Child',
      description: null,
      is_public: false,
      is_system: false,
      owner: stubUser(5),
      tags: [],
      created_at: new Date(),
      updated_at: new Date(),
      items: [],
    } as MediaLibrary); // child
    itemRepo.findOne.mockResolvedValueOnce({
      id: 3,
      library: { id: 10 } as MediaLibrary,
      book: null,
      child_library: { id: 11 } as MediaLibrary,
      added_at: new Date(),
    } as MediaLibraryItem); // existing
    await expect(service.addLibrary(10, 5, 11)).rejects.toThrow(
      ConflictException,
    );
  });

  it('copy ok with name disambiguation', async () => {
    libraryRepo.findOne.mockResolvedValueOnce({
      id: 10,
      name: 'Base',
      description: 'd',
      is_public: true,
      is_system: false,
      owner: stubUser(5),
      tags: [],
      created_at: new Date(),
      updated_at: new Date(),
      items: [],
    } as MediaLibrary); // src
    libraryRepo.findOne.mockResolvedValueOnce({
      id: 11,
      name: 'Base',
      description: 'd',
      is_public: true,
      is_system: false,
      owner: stubUser(5),
      tags: [],
      created_at: new Date(),
      updated_at: new Date(),
      items: [],
    } as MediaLibrary); // existing name clash
    libraryRepo.findOne.mockResolvedValueOnce(null); // newName available
    itemRepo.find.mockResolvedValueOnce([]);
    libraryRepo.create.mockReturnValue({ id: 12 } as MediaLibrary);
    libraryRepo.save.mockResolvedValueOnce({
      id: 12,
      name: 'Base (copy)',
      description: 'd',
      is_public: false,
      is_system: false,
      owner: stubUser(5),
      tags: [],
      created_at: new Date(),
      updated_at: new Date(),
      items: [],
    } as MediaLibrary);
    itemRepo.count.mockResolvedValueOnce(0);
    const r = await service.copy(10, 5);
    expect(r.copied_from).toBe(10);
    expect(r.name.startsWith('Base')).toBe(true);
  });

  it('getOne not found', async () => {
    libraryRepo.findOne.mockResolvedValueOnce(null as unknown as MediaLibrary);
    await expect(service.getOne(99, 5)).rejects.toThrow(NotFoundException);
  });

  it('getOne pagination returns subset with metadata', async () => {
    const libEntity = {
      id: 50,
      name: 'PagedLib',
      description: null,
      is_public: true,
      is_system: false,
      owner: stubUser(5),
      tags: [],
      created_at: new Date(),
      updated_at: new Date(),
    } as MediaLibrary;
    libraryRepo.findOne.mockResolvedValueOnce(libEntity);
    const fullItems: MediaLibraryItem[] = [
      {
        id: 1,
        library: libEntity,
        book: { id: 10 } as Book,
        child_library: null,
      } as MediaLibraryItem,
      {
        id: 2,
        library: libEntity,
        book: { id: 11 } as Book,
        child_library: null,
      } as MediaLibraryItem,
      {
        id: 3,
        library: libEntity,
        book: { id: 12 } as Book,
        child_library: null,
      } as MediaLibraryItem,
    ];
    (itemRepo.findAndCount as unknown as jest.Mock).mockResolvedValueOnce([
      fullItems.slice(0, 2),
      fullItems.length,
    ]);
    const res = await service.getOne(50, 5, 2, 0);
    interface PagedShape {
      items: MediaLibraryItem[];
      items_count: number;
      limit: number;
      offset: number;
    }
    const paged = res as unknown as PagedShape;
    expect(paged.items.length).toBe(2);
    expect(paged.items_count).toBe(3);
    expect(paged.limit).toBe(2);
    expect(paged.offset).toBe(0);
  });


  it('getVirtualUploaded returns all user books', async () => {
    // mock books
    bookRepo.findOne.mockReset(); // not used here
    (bookRepo.find as any) = jest.fn().mockResolvedValue([
      {
        id: 1,
        create_by: 5,
        created_at: new Date(),
        updated_at: new Date(),
        tags: [],
      },
      {
        id: 2,
        create_by: 5,
        created_at: new Date(),
        updated_at: new Date(),
        tags: [],
      },
    ] as Book[]);
    const r = await service.getVirtualUploaded(5);
    expect(r.is_virtual).toBe(true);
    expect(r.items_count).toBe(2);
    expect(r.items[0].book?.id).toBe(1);
  });
});
