import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FavoriteList } from '../../entities/favorite-list.entity';
import { FavoriteListItem } from '../../entities/favorite-list-item.entity';
import { Book } from '../../entities/book.entity';
import { CreateListDto } from './dto/create-list.dto';
import { UpdateListDto } from './dto/update-list.dto';

@Injectable()
export class BookListsService {
  constructor(
    @InjectRepository(FavoriteList) private listRepo: Repository<FavoriteList>,
    @InjectRepository(FavoriteListItem)
    private itemRepo: Repository<FavoriteListItem>,
    @InjectRepository(Book) private bookRepo: Repository<Book>,
  ) {}

  async create(userId: number, dto: CreateListDto) {
    const exists = await this.listRepo.findOne({
      where: { owner: { id: userId }, name: dto.name },
    });
    if (exists) throw new ConflictException('List name already exists');
    const entity = this.listRepo.create({
      name: dto.name.trim(),
      description: dto.description?.trim(),
      is_public: dto.is_public ?? false,
      owner: {
        id: userId,
      } as unknown as import('../../entities/user.entity').User,
    });
    const saved = await this.listRepo.save(entity);
    return {
      id: saved.id,
      name: saved.name,
      description: saved.description,
      is_public: saved.is_public,
      created_at: saved.created_at,
    };
  }

  async listMine(userId: number) {
    const lists = await this.listRepo.find({
      where: { owner: { id: userId } },
      order: { created_at: 'DESC' },
    });
    // count items for each list
    const counts = await Promise.all(
      lists.map((l) => this.itemRepo.count({ where: { list: { id: l.id } } })),
    );
    return lists.map((l, idx) => ({
      id: l.id,
      name: l.name,
      description: l.description,
      is_public: l.is_public,
      created_at: l.created_at,
      updated_at: l.updated_at,
      items_count: counts[idx] ?? 0,
    }));
  }

  async getOne(listId: number, userId?: number) {
    const list = await this.listRepo.findOne({
      where: { id: listId },
      relations: ['owner'],
    });
    if (!list) throw new NotFoundException('List not found');
    const isOwner = userId && list.owner?.id === userId;
    if (!isOwner && !list.is_public)
      throw new ForbiddenException('List is private');
    const items = await this.itemRepo.find({
      where: { list: { id: listId } },
      relations: ['book'],
    });
    return {
      id: list.id,
      name: list.name,
      description: list.description,
      is_public: list.is_public,
      owner_id: list.owner?.id ?? null,
      created_at: list.created_at,
      updated_at: list.updated_at,
      items: items.map((i) => ({
        id: i.id,
        book: { id: i.book.id },
      })),
      items_count: items.length,
    };
  }

  async update(listId: number, userId: number, dto: UpdateListDto) {
    const list = await this.listRepo.findOne({
      where: { id: listId },
      relations: ['owner'],
    });
    if (!list) throw new NotFoundException('List not found');
    if (list.owner?.id !== userId) throw new ForbiddenException('Not owner');
    if (dto.name && dto.name.trim() !== list.name) {
      const dup = await this.listRepo.findOne({
        where: { owner: { id: userId }, name: dto.name.trim() },
      });
      if (dup) throw new ConflictException('List name already exists');
      list.name = dto.name.trim();
    }
    if (dto.description !== undefined)
      list.description = dto.description?.trim() || null;
    if (dto.is_public !== undefined) list.is_public = dto.is_public;
    const saved = await this.listRepo.save(list);
    return {
      id: saved.id,
      name: saved.name,
      description: saved.description,
      is_public: saved.is_public,
      updated_at: saved.updated_at,
    };
  }

  async remove(listId: number, userId: number) {
    const list = await this.listRepo.findOne({
      where: { id: listId },
      relations: ['owner'],
    });
    if (!list) throw new NotFoundException('List not found');
    if (list.owner?.id !== userId) throw new ForbiddenException('Not owner');
    await this.listRepo.remove(list);
    return { ok: true };
  }

  async addBook(listId: number, userId: number, bookId: number) {
    const list = await this.listRepo.findOne({
      where: { id: listId },
      relations: ['owner'],
    });
    if (!list) throw new NotFoundException('List not found');
    if (list.owner?.id !== userId) throw new ForbiddenException('Not owner');
    const book = await this.bookRepo.findOne({ where: { id: bookId } });
    if (!book) throw new NotFoundException('Book not found');
    const existing = await this.itemRepo.findOne({
      where: { list: { id: listId }, book: { id: bookId } },
    });
    if (existing) throw new ConflictException('Book already in list');
    const entity = this.itemRepo.create({
      list: { id: listId } as unknown as FavoriteList,
      book: { id: bookId } as unknown as Book,
    });
    const saved = await this.itemRepo.save(entity);
    return { id: saved.id, listId, bookId, added_at: saved.added_at };
  }

  async removeBook(listId: number, userId: number, bookId: number) {
    const list = await this.listRepo.findOne({
      where: { id: listId },
      relations: ['owner'],
    });
    if (!list) throw new NotFoundException('List not found');
    if (list.owner?.id !== userId) throw new ForbiddenException('Not owner');
    const item = await this.itemRepo.findOne({
      where: { list: { id: listId }, book: { id: bookId } },
    });
    if (!item) throw new NotFoundException('Book not in list');
    await this.itemRepo.remove(item);
    return { ok: true };
  }

  async copy(listId: number, userId: number) {
    const src = await this.listRepo.findOne({
      where: { id: listId },
      relations: ['owner'],
    });
    if (!src) throw new NotFoundException('List not found');
    if (!src.is_public && src.owner?.id !== userId)
      throw new ForbiddenException('List is private');
    // ensure name uniqueness for target user
    const baseName = src.name;
    let newName = baseName;
    let idx = 1;
    // if user already has list with same name, append (copy n)
    while (
      await this.listRepo.findOne({
        where: { owner: { id: userId }, name: newName },
      })
    ) {
      newName = `${baseName} (copy${idx > 1 ? ' ' + idx : ''})`;
      idx++;
      if (newName.length > 200) newName = newName.slice(0, 200); // safety
    }
    const created = this.listRepo.create({
      name: newName,
      description: src.description,
      is_public: false, // copies default to private
      owner: {
        id: userId,
      } as unknown as import('../../entities/user.entity').User,
    });
    const saved = await this.listRepo.save(created);
    // fetch items from source
    const items = await this.itemRepo.find({
      where: { list: { id: listId } },
      relations: ['book'], // need book id for recreation
    });
    if (items.length > 0) {
      const newItems = items
        .filter((i) => i.book?.id)
        .map((i) =>
          this.itemRepo.create({
            list: { id: saved.id } as unknown as FavoriteList,
            book: { id: i.book.id } as unknown as Book,
          }),
        );
      if (newItems.length > 0) await this.itemRepo.save(newItems);
    }
    const count = await this.itemRepo.count({
      where: { list: { id: saved.id } },
    });
    return {
      id: saved.id,
      name: saved.name,
      items_count: count,
      is_public: saved.is_public,
      copied_from: listId,
    };
  }
}
