import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MediaLibrary } from '../../entities/media-library.entity';
import { MediaLibraryItem } from '../../entities/media-library-item.entity';
import { Book } from '../../entities/book.entity';
import { Tag } from '../../entities/tag.entity';
import { User } from '../../entities/user.entity';
import { CreateMediaLibraryDto } from './dto/create-media-library.dto';

@Injectable()
export class MediaLibrariesService {
  constructor(
    @InjectRepository(MediaLibrary)
    private libraryRepo: Repository<MediaLibrary>,
    @InjectRepository(MediaLibraryItem)
    private itemRepo: Repository<MediaLibraryItem>,
    @InjectRepository(Book)
    private bookRepo: Repository<Book>,
    @InjectRepository(Tag)
    private tagRepo: Repository<Tag>,
  ) {}

  async create(userId: number, dto: CreateMediaLibraryDto) {
    const exists = await this.libraryRepo.findOne({
      where: { owner: { id: userId }, name: dto.name },
    });
    if (exists) throw new ConflictException('Library name already exists');
    const tags = dto.tags ? await this.processTags(dto.tags) : [];
    const entity = this.libraryRepo.create({
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      is_public: dto.is_public ?? false,
      is_system: false,
      tags,
      owner: { id: userId } as User,
    });
    const saved = await this.libraryRepo.save(entity);
    return {
      id: saved.id,
      name: saved.name,
      description: saved.description,
      is_public: saved.is_public,
      is_system: saved.is_system,
      tags: tags.map((t) => ({ key: t.key, value: t.value })),
      created_at: saved.created_at,
    };
  }

  async listMine(userId: number) {
    const libs = await this.libraryRepo.find({
      where: { owner: { id: userId } },
      relations: ['tags'],
      order: { created_at: 'DESC' },
    });
    const counts = await Promise.all(
      libs.map((l) =>
        this.itemRepo.count({ where: { library: { id: l.id } } }),
      ),
    );
    return libs.map((l, idx) => ({
      id: l.id,
      name: l.name,
      description: l.description,
      is_public: l.is_public,
      is_system: l.is_system,
      tags: (l.tags || []).map((t) => ({ key: t.key, value: t.value })),
      created_at: l.created_at,
      updated_at: l.updated_at,
      items_count: counts[idx] ?? 0,
    }));
  }

  async getOne(id: number, userId?: number, limit?: number, offset?: number) {
    const lib = await this.libraryRepo.findOne({
      where: { id },
      relations: ['owner', 'tags'],
    });
    if (!lib) throw new NotFoundException('Library not found');
    const isOwner = userId && lib.owner?.id === userId;
    if (!lib.is_public && !isOwner) throw new ForbiddenException('Private');
    const pagingRequested =
      typeof limit === 'number' || typeof offset === 'number';
    let items: MediaLibraryItem[] = [];
    let totalCount = 0;
    if (pagingRequested) {
      let take = typeof limit === 'number' ? limit : 20;
      if (take <= 0) take = 20;
      if (take > 100) take = 100;
      let skip = typeof offset === 'number' ? offset : 0;
      if (skip < 0) skip = 0;
      const [subset, count] = await this.itemRepo.findAndCount({
        where: { library: { id } },
        relations: ['book', 'child_library'],
        order: { added_at: 'DESC' },
        take,
        skip,
      });
      items = subset;
      totalCount = count;
    } else {
      items = await this.itemRepo.find({
        where: { library: { id } },
        relations: ['book', 'child_library'],
        order: { added_at: 'DESC' },
      });
      totalCount = items.length;
    }
    return {
      id: lib.id,
      name: lib.name,
      description: lib.description,
      is_public: lib.is_public,
      is_system: lib.is_system,
      tags: (lib.tags || []).map((t) => ({ key: t.key, value: t.value })),
      owner_id: lib.owner?.id || null,
      created_at: lib.created_at,
      updated_at: lib.updated_at,
      items: items.map((i) => ({
        id: i.id,
        book: i.book ? { id: i.book.id } : null,
        child_library: i.child_library
          ? { id: i.child_library.id, name: i.child_library.name }
          : null,
      })),
      items_count: totalCount,
      ...(pagingRequested
        ? {
            limit:
              typeof limit === 'number' && limit > 0
                ? limit > 100
                  ? 100
                  : limit
                : 20,
            offset: typeof offset === 'number' && offset >= 0 ? offset : 0,
          }
        : {}),
    };
  }

  /**
   * 构造一个“虚拟媒体库”视图，包含当前用户上传的全部书籍。
   * 不持久化库与条目，仅在访问时动态生成，id 固定为 0，is_virtual = true。
   */
  async getVirtualUploaded(userId: number, limit?: number, offset?: number) {
    const pagingRequested =
      typeof limit === 'number' || typeof offset === 'number';
    let books: Book[] = [];
    let totalCount = 0;
    if (pagingRequested) {
      let take = typeof limit === 'number' ? limit : 20;
      if (take <= 0) take = 20;
      if (take > 100) take = 100;
      let skip = typeof offset === 'number' ? offset : 0;
      if (skip < 0) skip = 0;
      const [subset, count] = await this.bookRepo.findAndCount({
        where: { create_by: userId },
        order: { created_at: 'DESC' },
        take,
        skip,
      });
      books = subset;
      totalCount = count;
    } else {
      books = await this.bookRepo.find({
        where: { create_by: userId },
        order: { created_at: 'DESC' },
      });
      totalCount = books.length;
    }
    return {
      id: 0,
      name: '我的上传图书 (虚拟库)',
      description: null,
      is_public: false,
      is_system: false,
      is_virtual: true,
      tags: [] as { key: string; value: string }[],
      owner_id: userId,
      created_at: books[0]?.created_at || new Date(),
      updated_at: books[0]?.updated_at || new Date(),
      items: books.map((b) => ({
        id: b.id,
        book: { id: b.id },
        child_library: null,
      })),
      items_count: totalCount,
      ...(pagingRequested
        ? {
            limit:
              typeof limit === 'number' && limit > 0
                ? limit > 100
                  ? 100
                  : limit
                : 20,
            offset: typeof offset === 'number' && offset >= 0 ? offset : 0,
          }
        : {}),
    };
  }

  async addBook(libraryId: number, userId: number, bookId: number) {
    const lib = await this.libraryRepo.findOne({
      where: { id: libraryId },
      relations: ['owner'],
    });
    if (!lib) throw new NotFoundException('Library not found');
    if (lib.owner?.id !== userId) throw new ForbiddenException('Not owner');
    // 系统库现在允许添加书籍（用于记录历史），仍需拥有者校验
    const book = await this.bookRepo.findOne({ where: { id: bookId } });
    if (!book) throw new NotFoundException('Book not found');
    const existing = await this.itemRepo.findOne({
      where: { library: { id: libraryId }, book: { id: bookId } },
    });
    if (existing) throw new ConflictException('Book already in library');
    const entity = this.itemRepo.create({
      library: { id: libraryId } as MediaLibrary,
      book: { id: bookId } as Book,
    });
    const saved = await this.itemRepo.save(entity);
    return { id: saved.id, libraryId, bookId, added_at: saved.added_at };
  }

  async addLibrary(libraryId: number, userId: number, childLibraryId: number) {
    if (libraryId === childLibraryId)
      throw new ConflictException('Cannot nest into itself');
    const parent = await this.libraryRepo.findOne({
      where: { id: libraryId },
      relations: ['owner'],
    });
    if (!parent) throw new NotFoundException('Library not found');
    if (parent.owner?.id !== userId) throw new ForbiddenException('Not owner');
    // 系统库现在允许嵌套其他库（若业务不需要可再次禁止）
    const child = await this.libraryRepo.findOne({
      where: { id: childLibraryId },
    });
    if (!child) throw new NotFoundException('Child library not found');
    const existing = await this.itemRepo.findOne({
      where: {
        library: { id: libraryId },
        child_library: { id: childLibraryId },
      },
    });
    if (existing) throw new ConflictException('Already nested');
    const entity = this.itemRepo.create({
      library: { id: libraryId } as MediaLibrary,
      child_library: { id: childLibraryId } as MediaLibrary,
    });
    const saved = await this.itemRepo.save(entity);
    return {
      id: saved.id,
      libraryId,
      childLibraryId,
      added_at: saved.added_at,
    };
  }

  async removeItem(libraryId: number, userId: number, itemId: number) {
    const lib = await this.libraryRepo.findOne({
      where: { id: libraryId },
      relations: ['owner'],
    });
    if (!lib) throw new NotFoundException('Library not found');
    if (lib.owner?.id !== userId) throw new ForbiddenException('Not owner');
    // 系统库现在允许移除条目
    const item = await this.itemRepo.findOne({
      where: { id: itemId },
      relations: ['library'],
    });
    if (!item || item.library.id !== libraryId)
      throw new NotFoundException('Item not in library');
    await this.itemRepo.remove(item);
    return { ok: true };
  }

  async update(
    libraryId: number,
    userId: number,
    dto: Partial<CreateMediaLibraryDto>,
  ) {
    const lib = await this.libraryRepo.findOne({
      where: { id: libraryId },
      relations: ['owner', 'tags'],
    });
    if (!lib) throw new NotFoundException('Library not found');
    if (lib.owner?.id !== userId) throw new ForbiddenException('Not owner');
    if (lib.is_system) throw new ForbiddenException('System library locked');
    if (dto.name && dto.name.trim() !== lib.name) {
      const dup = await this.libraryRepo.findOne({
        where: { owner: { id: userId }, name: dto.name.trim() },
      });
      if (dup) throw new ConflictException('Library name already exists');
      lib.name = dto.name.trim();
    }
    if (dto.description !== undefined)
      lib.description = dto.description?.trim() || null;
    if (dto.is_public !== undefined) lib.is_public = dto.is_public;
    if (dto.tags) lib.tags = await this.processTags(dto.tags);
    const saved = await this.libraryRepo.save(lib);
    return {
      id: saved.id,
      name: saved.name,
      description: saved.description,
      is_public: saved.is_public,
      is_system: saved.is_system,
      tags: saved.tags.map((t) => ({ key: t.key, value: t.value })),
      updated_at: saved.updated_at,
    };
  }

  async copy(libraryId: number, userId: number) {
    const src = await this.libraryRepo.findOne({
      where: { id: libraryId },
      relations: ['owner', 'tags'],
    });
    if (!src) throw new NotFoundException('Library not found');
    if (!src.is_public && src.owner?.id !== userId)
      throw new ForbiddenException('Private');
    const baseName = src.name;
    let newName = baseName;
    let idx = 1;
    while (
      await this.libraryRepo.findOne({
        where: { owner: { id: userId }, name: newName },
      })
    ) {
      newName = `${baseName} (copy${idx > 1 ? ' ' + idx : ''})`;
      idx++;
      if (newName.length > 200) newName = newName.slice(0, 200);
    }
    const created = this.libraryRepo.create({
      name: newName,
      description: src.description,
      is_public: false,
      is_system: false,
      tags: src.tags,
      owner: { id: userId } as User,
    });
    const saved = await this.libraryRepo.save(created);
    const items = await this.itemRepo.find({
      where: { library: { id: libraryId } },
      relations: ['book'],
    });
    if (items.length) {
      const newItems = items
        .filter((i) => i.book?.id)
        .map((i) =>
          this.itemRepo.create({
            library: { id: saved.id } as MediaLibrary,
            book: { id: i.book!.id } as Book,
          }),
        );
      if (newItems.length) await this.itemRepo.save(newItems);
    }
    const count = await this.itemRepo.count({
      where: { library: { id: saved.id } },
    });
    return {
      id: saved.id,
      name: saved.name,
      tags: (src.tags || []).map((t) => ({ key: t.key, value: t.value })),
      items_count: count,
      is_public: saved.is_public,
      copied_from: libraryId,
    };
  }

  async remove(libraryId: number, userId: number) {
    const lib = await this.libraryRepo.findOne({
      where: { id: libraryId },
      relations: ['owner'],
    });
    if (!lib) throw new NotFoundException('Library not found');
    if (lib.owner?.id !== userId) throw new ForbiddenException('Not owner');
    if (lib.is_system) throw new ForbiddenException('System library locked');
    await this.libraryRepo.remove(lib);
    return { ok: true };
  }

  private async processTags(
    tagDtos: { key: string; value: string; shown?: boolean }[],
  ): Promise<Tag[]> {
    const tags: Tag[] = [];
    for (const tagDto of tagDtos) {
      let tag = await this.tagRepo.findOne({
        where: { key: tagDto.key, value: tagDto.value },
      });
      if (!tag) {
        tag = this.tagRepo.create({
          key: tagDto.key,
          value: tagDto.value,
          shown: tagDto.shown !== undefined ? tagDto.shown : true,
        });
        tag = await this.tagRepo.save(tag);
      }
      tags.push(tag);
    }
    return tags;
  }
}
