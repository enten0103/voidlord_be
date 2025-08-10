import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Book } from '../../entities/book.entity';
import { Tag } from '../../entities/tag.entity';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';

@Injectable()
export class BooksService {
  constructor(
    @InjectRepository(Book)
    private bookRepository: Repository<Book>,
    @InjectRepository(Tag)
    private tagRepository: Repository<Tag>,
  ) {}

  async create(createBookDto: CreateBookDto): Promise<Book> {
    // 检查hash是否已存在
    const existingBook = await this.bookRepository.findOne({
      where: { hash: createBookDto.hash },
    });

    if (existingBook) {
      throw new ConflictException('Book with this hash already exists');
    }

    // 处理标签
    let tags: Tag[] = [];
    if (createBookDto.tags && createBookDto.tags.length > 0) {
      tags = await this.processTags(createBookDto.tags);
    }

    // 创建书籍
    const book = this.bookRepository.create({
      hash: createBookDto.hash,
      title: createBookDto.title,
      description: createBookDto.description,
      tags,
    });

    return this.bookRepository.save(book);
  }

  async findAll(): Promise<Book[]> {
    return this.bookRepository.find({
      relations: ['tags'],
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Book> {
    const book = await this.bookRepository.findOne({
      where: { id },
      relations: ['tags'],
    });

    if (!book) {
      throw new NotFoundException(`Book with ID ${id} not found`);
    }

    return book;
  }

  async findByHash(hash: string): Promise<Book> {
    const book = await this.bookRepository.findOne({
      where: { hash },
      relations: ['tags'],
    });

    if (!book) {
      throw new NotFoundException(`Book with hash ${hash} not found`);
    }

    return book;
  }

  async update(id: number, updateBookDto: UpdateBookDto): Promise<Book> {
    const book = await this.findOne(id);

    // 如果更新hash，检查是否冲突
    if (updateBookDto.hash && updateBookDto.hash !== book.hash) {
      const existingBook = await this.bookRepository.findOne({
        where: { hash: updateBookDto.hash },
      });

      if (existingBook) {
        throw new ConflictException('Book with this hash already exists');
      }
    }

    // 处理标签更新
    if (updateBookDto.tags) {
      const tags = await this.processTags(updateBookDto.tags);
      book.tags = tags;
    }

    // 更新其他字段
    if (updateBookDto.title) book.title = updateBookDto.title;
    if (updateBookDto.hash) book.hash = updateBookDto.hash;
    if (updateBookDto.description !== undefined)
      book.description = updateBookDto.description;

    return this.bookRepository.save(book);
  }

  async remove(id: number): Promise<void> {
    const book = await this.findOne(id);
    await this.bookRepository.remove(book);
  }

  async findByTags(tagKeys: string[]): Promise<Book[]> {
    return this.bookRepository
      .createQueryBuilder('book')
      .leftJoinAndSelect('book.tags', 'tag')
      .where('tag.key IN (:...tagKeys)', { tagKeys })
      .orderBy('book.created_at', 'DESC')
      .getMany();
  }

  async findByTagKeyValue(key: string, value: string): Promise<Book[]> {
    return this.bookRepository
      .createQueryBuilder('book')
      .leftJoinAndSelect('book.tags', 'tag')
      .where('tag.key = :key AND tag.value = :value', { key, value })
      .orderBy('book.created_at', 'DESC')
      .getMany();
  }

  async findByMultipleTagValues(
    tagFilters: { key: string; value: string }[],
  ): Promise<Book[]> {
    const queryBuilder = this.bookRepository
      .createQueryBuilder('book')
      .leftJoinAndSelect('book.tags', 'tag');

    const conditions = tagFilters
      .map(
        (filter, index) =>
          `(tag.key = :key${index} AND tag.value = :value${index})`,
      )
      .join(' OR ');

    const parameters = tagFilters.reduce((params, filter, index) => {
      params[`key${index}`] = filter.key;
      params[`value${index}`] = filter.value;
      return params;
    }, {} as any);

    return queryBuilder
      .where(conditions, parameters)
      .orderBy('book.created_at', 'DESC')
      .getMany();
  }

  async findByTagId(tagId: number): Promise<Book[]> {
    return this.bookRepository
      .createQueryBuilder('book')
      .leftJoinAndSelect('book.tags', 'tag')
      .where('tag.id = :tagId', { tagId })
      .orderBy('book.created_at', 'DESC')
      .getMany();
  }

  async findByTagIds(tagIds: number[]): Promise<Book[]> {
    return this.bookRepository
      .createQueryBuilder('book')
      .leftJoinAndSelect('book.tags', 'tag')
      .where(
        'book.id IN (' +
          'SELECT bt.book_id FROM book_tags bt ' +
          'WHERE bt.tag_id IN (:...tagIds) ' +
          'GROUP BY bt.book_id ' +
          'HAVING COUNT(DISTINCT bt.tag_id) = :tagCount' +
          ')',
        { tagIds, tagCount: tagIds.length },
      )
      .orderBy('book.created_at', 'DESC')
      .getMany();
  }

  /**
   * 根据指定书籍的标签推荐相似书籍：
   *  - 统计与目标书籍共享标签的数量（去重计数）
   *  - 按共享标签数倒序，其次按创建时间倒序
   *  - 限制最大返回 50 条
   */
  async recommendByBook(bookId: number, limit = 5): Promise<Book[]> {
    if (limit <= 0) return [];
    if (limit > 50) limit = 50;

    const base = await this.bookRepository.findOne({
      where: { id: bookId },
      relations: ['tags'],
    });
    if (!base) throw new NotFoundException('Book not found');
    if (!base.tags || base.tags.length === 0) return [];

    const tagIds = base.tags.map((t) => t.id);

    const raw = await this.bookRepository
      .createQueryBuilder('book')
      .innerJoin('book.tags', 'tag')
      .where('tag.id IN (:...tagIds)', { tagIds })
      .andWhere('book.id <> :bookId', { bookId })
      .select('book.id', 'id')
      .addSelect('COUNT(DISTINCT tag.id)', 'overlap')
      .groupBy('book.id')
      .orderBy('overlap', 'DESC')
      .addOrderBy('book.created_at', 'DESC')
      .limit(limit)
      .getRawMany();

    if (raw.length === 0) return [];
    const ids = raw.map((r) => Number(r.id));
    const books = await this.bookRepository.find({
      where: ids.map((id) => ({ id })),
      relations: ['tags'],
    });
    const map = new Map(books.map((b) => [b.id, b]));
    return ids.map((id) => map.get(id)).filter((b): b is Book => !!b);
  }

  private async processTags(tagDtos: any[]): Promise<Tag[]> {
    const tags: Tag[] = [];

    for (const tagDto of tagDtos) {
      // 查找是否已存在相同的key和value的标签
      let tag = await this.tagRepository.findOne({
        where: {
          key: tagDto.key,
          value: tagDto.value,
        },
      });

      if (!tag) {
        // 创建新标签
        tag = this.tagRepository.create({
          key: tagDto.key,
          value: tagDto.value,
          shown: tagDto.shown !== undefined ? tagDto.shown : true,
        });
        tag = await this.tagRepository.save(tag);
      }

      tags.push(tag);
    }

    return tags;
  }
}
