import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, IsNull, Repository } from 'typeorm';
import * as mime from 'mime-types';
import { Book } from '../../entities/book.entity';
import { Tag } from '../../entities/tag.entity';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { BookRating } from '../../entities/book-rating.entity';
import { Comment } from '../../entities/comment.entity';
import { User } from '../../entities/user.entity';
import { FilesService } from '../files/files.service';

@Injectable()
export class BooksService {
  constructor(
    @InjectRepository(Book)
    private bookRepository: Repository<Book>,
    @InjectRepository(Tag)
    private tagRepository: Repository<Tag>,
    @InjectRepository(BookRating)
    private ratingRepository: Repository<BookRating>,
    @InjectRepository(Comment)
    private commentRepository: Repository<Comment>,
    private files: FilesService,
  ) {}

  async create(createBookDto: CreateBookDto, userId?: number): Promise<Book> {
    // 处理标签（现仅支持标签）
    let tags: Tag[] = [];
    if (createBookDto.tags && createBookDto.tags.length > 0) {
      tags = await this.processTags(createBookDto.tags);
    }
    const book = this.bookRepository.create({
      create_by: userId,
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

  async findMine(userId: number): Promise<Book[]> {
    return this.bookRepository.find({
      where: { create_by: userId },
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

  // findByHash 已移除（不再存在 hash 字段）

  async update(id: number, updateBookDto: UpdateBookDto): Promise<Book> {
    const book = await this.findOne(id);
    if (updateBookDto.tags) {
      book.tags = await this.processTags(updateBookDto.tags);
    }
    return this.bookRepository.save(book);
  }

  async remove(id: number): Promise<void> {
    const book = await this.findOne(id);

    // Cleanup bound cover if exists (stored via tags)
    const coverKey = book.tags?.find((t) => t.key === 'cover')?.value;
    if (coverKey) {
      await this.files.deleteObject(coverKey);
      await this.files.deleteRecordByKey(coverKey);
    }

    // Cleanup extracted EPUB objects if present
    if (book.has_epub) {
      const prefix = `books/${id}/epub/`;
      const keys = await this.files.listObjects(prefix);
      await this.files.deleteObjects(keys);
      await this.files.deleteRecordsByKeys(keys);
    }

    await this.bookRepository.remove(book);
  }

  async setCover(
    bookId: number,
    file: Express.Multer.File,
    userId: number,
  ): Promise<{ key: string; url: string }> {
    const book = await this.bookRepository.findOne({
      where: { id: bookId },
      relations: ['tags'],
    });
    if (!book) throw new NotFoundException(`Book with ID ${bookId} not found`);
    if (!file?.buffer) throw new BadRequestException('File is required');

    const contentType = file.mimetype || 'application/octet-stream';
    if (!contentType.startsWith('image/')) {
      throw new BadRequestException('Cover must be an image');
    }

    const extRaw = mime.extension(contentType) || '';
    const ext = extRaw === 'jpeg' ? 'jpg' : extRaw;
    if (!ext) {
      throw new BadRequestException('Unsupported cover image type');
    }

    const newKey = `books/${bookId}/cover.${ext}`;
    const oldKey =
      book.tags?.find((t) => t.key === 'cover')?.value || undefined;

    await this.files.putObject(
      newKey,
      file.buffer,
      contentType,
      undefined,
      userId,
    );

    try {
      const baseTagDtos = (book.tags || [])
        .filter((t) => t.key !== 'cover' && t.key !== 'cover_mime')
        .map((t) => ({ key: t.key, value: t.value, shown: t.shown }));

      const updatedTags = await this.processTags([
        ...baseTagDtos,
        { key: 'cover', value: newKey, shown: false },
        { key: 'cover_mime', value: contentType, shown: false },
      ]);

      book.tags = updatedTags;
      await this.bookRepository.save(book);
    } catch (e) {
      // rollback to avoid orphaned objects
      try {
        await this.files.deleteObject(newKey);
        await this.files.deleteRecordByKey(newKey);
      } catch {
        /* ignore rollback errors */
      }
      throw e;
    }

    if (oldKey && oldKey !== newKey) {
      try {
        await this.files.deleteObject(oldKey);
        await this.files.deleteRecordByKey(oldKey);
      } catch {
        /* ignore cleanup errors */
      }
    }

    return { key: newKey, url: this.files.getPublicUrl(newKey) };
  }

  async rateBook(bookId: number, userId: number, score: number) {
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new ConflictException('Score must be an integer between 1 and 5');
    }
    const book = await this.bookRepository.findOne({ where: { id: bookId } });
    if (!book) throw new NotFoundException('Book not found');
    let rating = await this.ratingRepository.findOne({
      where: {
        book: { id: bookId } as Book,
        user: { id: userId } as User,
      } as FindOptionsWhere<BookRating>,
    });
    if (!rating) {
      rating = this.ratingRepository.create({
        book: { id: bookId } as Book,
        user: { id: userId } as User, // user entity id reference
        score,
      });
    } else {
      rating.score = score;
    }
    await this.ratingRepository.save(rating);
    const agg = await this.ratingRepository
      .createQueryBuilder('r')
      .where('r.bookId = :bid', { bid: bookId })
      .select('COUNT(1)', 'count')
      .addSelect('AVG(r.score)', 'avg')
      .getRawOne<{ count: string; avg: string }>();
    return {
      ok: true,
      bookId,
      myRating: score,
      count: Number(agg?.count ?? 0),
      avg: agg?.avg ? Number(agg.avg) : 0,
    };
  }

  async getRating(bookId: number, userId?: number) {
    const book = await this.bookRepository.findOne({ where: { id: bookId } });
    if (!book) throw new NotFoundException('Book not found');
    const agg = await this.ratingRepository
      .createQueryBuilder('r')
      .where('r.bookId = :bid', { bid: bookId })
      .select('COUNT(1)', 'count')
      .addSelect('AVG(r.score)', 'avg')
      .getRawOne<{ count: string; avg: string }>();
    let myRating: number | null = null;
    if (typeof userId === 'number') {
      const r = await this.ratingRepository.findOne({
        where: {
          book: { id: bookId } as Book,
          user: { id: userId } as User,
        } as FindOptionsWhere<BookRating>,
      });
      myRating = r?.score ?? null;
    }
    return {
      bookId,
      count: Number(agg?.count ?? 0),
      avg: agg?.avg ? Number(agg.avg) : 0,
      myRating,
    };
  }

  async getMyRating(bookId: number, userId: number) {
    const book = await this.bookRepository.findOne({ where: { id: bookId } });
    if (!book) throw new NotFoundException('Book not found');
    const r = await this.ratingRepository.findOne({
      where: {
        book: { id: bookId } as Book,
        user: { id: userId } as User,
      } as FindOptionsWhere<BookRating>,
    });
    return { bookId, myRating: r?.score ?? null };
  }

  async removeMyRating(bookId: number, userId: number) {
    const r = await this.ratingRepository.findOne({
      where: {
        book: { id: bookId } as Book,
        user: { id: userId } as User,
      } as FindOptionsWhere<BookRating>,
    });
    if (r) await this.ratingRepository.remove(r);
    const agg = await this.ratingRepository
      .createQueryBuilder('r')
      .where('r.bookId = :bid', { bid: bookId })
      .select('COUNT(1)', 'count')
      .addSelect('AVG(r.score)', 'avg')
      .getRawOne<{ count: string; avg: string }>();
    return {
      ok: true,
      bookId,
      count: Number(agg?.count ?? 0),
      avg: agg?.avg ? Number(agg.avg) : 0,
    };
  }

  // Comments
  async listComments(bookId: number, limit = 20, offset = 0) {
    const book = await this.bookRepository.findOne({ where: { id: bookId } });
    if (!book) throw new NotFoundException('Book not found');
    if (limit <= 0) limit = 20;
    if (limit > 100) limit = 100;
    if (offset < 0) offset = 0;
    const [items, total] = await this.commentRepository.findAndCount({
      where: {
        book: { id: bookId } as Book,
        parent: IsNull(),
      } as FindOptionsWhere<Comment>,
      order: { created_at: 'DESC' },
      take: limit,
      skip: offset,
      relations: ['user'],
    });
    // compute reply counts for each top-level comment
    const counts = await Promise.all(
      items.map((c) =>
        this.commentRepository.count({
          where: {
            book: { id: bookId } as Book,
            parent: { id: c.id } as Comment,
          } as FindOptionsWhere<Comment>,
        }),
      ),
    );
    return {
      bookId,
      total,
      limit,
      offset,
      items: items.map((c, idx) => ({
        id: c.id,
        content: c.content,
        created_at: c.created_at,
        updated_at: c.updated_at,
        user: c.user ? { id: c.user.id, username: c.user.username } : null,
        reply_count: counts[idx] ?? 0,
      })),
    };
  }

  async addComment(bookId: number, userId: number, content: string) {
    if (
      !content ||
      typeof content !== 'string' ||
      content.trim().length === 0
    ) {
      throw new ConflictException('Content is required');
    }
    if (content.length > 2000) {
      throw new ConflictException('Content too long (max 2000)');
    }
    const book = await this.bookRepository.findOne({ where: { id: bookId } });
    if (!book) throw new NotFoundException('Book not found');
    const entity = this.commentRepository.create({
      book: { id: bookId } as Book,
      user: userId ? ({ id: userId } as User) : null,
      content: content.trim(),
    });
    const saved = await this.commentRepository.save(entity);
    return {
      id: saved.id,
      bookId,
      content: saved.content,
      created_at: saved.created_at,
    };
  }

  async removeComment(bookId: number, commentId: number) {
    const c = await this.commentRepository.findOne({
      where: {
        id: commentId,
        book: { id: bookId } as Book,
      } as FindOptionsWhere<Comment>,
      relations: ['user'],
    });
    if (!c) throw new NotFoundException('Comment not found');
    await this.commentRepository.remove(c);
    return { ok: true };
  }

  async getCommentOwnerId(
    bookId: number,
    commentId: number,
  ): Promise<number | null> {
    const c = await this.commentRepository.findOne({
      where: {
        id: commentId,
        book: { id: bookId } as Book,
      } as FindOptionsWhere<Comment>,
      relations: ['user'],
    });
    if (!c) return null;
    return c.user?.id ?? null;
  }

  async addReply(
    bookId: number,
    userId: number,
    parentCommentId: number,
    content: string,
  ) {
    if (
      !content ||
      typeof content !== 'string' ||
      content.trim().length === 0
    ) {
      throw new ConflictException('Content is required');
    }
    if (content.length > 2000) {
      throw new ConflictException('Content too long (max 2000)');
    }
    const book = await this.bookRepository.findOne({ where: { id: bookId } });
    if (!book) throw new NotFoundException('Book not found');
    const parent = await this.commentRepository.findOne({
      where: {
        id: parentCommentId,
        book: { id: bookId } as Book,
      } as FindOptionsWhere<Comment>,
    });
    if (!parent) throw new NotFoundException('Parent comment not found');
    const entity = this.commentRepository.create({
      book: { id: bookId } as Book,
      user: userId ? ({ id: userId } as User) : null,
      content: content.trim(),
      parent: { id: parentCommentId } as Comment,
    });
    const saved = await this.commentRepository.save(entity);
    return {
      id: saved.id,
      bookId,
      parentId: parentCommentId,
      content: saved.content,
      created_at: saved.created_at,
    };
  }

  async listReplies(
    bookId: number,
    parentCommentId: number,
    limit = 20,
    offset = 0,
  ) {
    const book = await this.bookRepository.findOne({ where: { id: bookId } });
    if (!book) throw new NotFoundException('Book not found');
    const parent = await this.commentRepository.findOne({
      where: {
        id: parentCommentId,
        book: { id: bookId } as Book,
      } as FindOptionsWhere<Comment>,
    });
    if (!parent) throw new NotFoundException('Parent comment not found');
    if (limit <= 0) limit = 20;
    if (limit > 100) limit = 100;
    if (offset < 0) offset = 0;
    const [items, total] = await this.commentRepository.findAndCount({
      where: {
        book: { id: bookId } as Book,
        parent: { id: parentCommentId } as Comment,
      } as FindOptionsWhere<Comment>,
      order: { created_at: 'DESC' },
      take: limit,
      skip: offset,
      relations: ['user'],
    });
    return {
      bookId,
      parentId: parentCommentId,
      total,
      limit,
      offset,
      items: items.map((c) => ({
        id: c.id,
        content: c.content,
        created_at: c.created_at,
        updated_at: c.updated_at,
        user: c.user ? { id: c.user.id, username: c.user.username } : null,
      })),
    };
  }

  /**
   * 条件数组搜索：每个条件在指定 tag.key 上应用一个操作符；多个条件逻辑 AND。
   * 支持操作符：
   *  - eq  : 存在指定 key 且 value 全等
   *  - neq : 不存在指定 key+value 组合（允许该 key 缺失或值不同）
   *  - match : 存在指定 key 且 value ILIKE 模糊匹配
   */
  async searchByConditions(
    conditions: Array<{
      target: string;
      op: 'eq' | 'neq' | 'match';
      value: string;
    }>,
    limit?: number,
    offset?: number,
    sortBy?: 'created_at' | 'updated_at' | 'rating',
    sortOrder?: 'asc' | 'desc',
  ): Promise<
    Book[] | { total: number; limit: number; offset: number; items: Book[] }
  > {
    const list = (conditions || []).filter(
      (c) => c && c.target && c.op && typeof c.value === 'string',
    );
    const pagingRequested =
      typeof limit === 'number' || typeof offset === 'number';
    const sortField = sortBy || 'created_at';
    const sortDir =
      (sortOrder || 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    if (list.length === 0) {
      // no conditions -> either full list or paged full list
      if (!pagingRequested) {
        // 非分页直接返回全部，排序
        if (sortField === 'rating') {
          // 评分排序
          return this.bookRepository
            .createQueryBuilder('book')
            .leftJoinAndSelect('book.tags', 'tag')
            .leftJoin(
              (qb) =>
                qb
                  .select('book_rating.bookId', 'book_id')
                  .addSelect('AVG(book_rating.score)', 'avg_rating')
                  .from('book_rating', 'book_rating')
                  .groupBy('book_rating.bookId'),
              'br',
              'br.book_id = book.id',
            )
            .orderBy('COALESCE(br.avg_rating, -1)', sortDir)
            .addOrderBy('book.created_at', 'DESC')
            .getMany();
        } else {
          // created_at/updated_at
          return this.bookRepository.find({
            relations: ['tags'],
            order: { [sortField]: sortDir },
          });
        }
      }
      let take = typeof limit === 'number' ? limit : 20;
      if (take <= 0) take = 20;
      if (take > 100) take = 100;
      let skip = typeof offset === 'number' ? offset : 0;
      if (skip < 0) skip = 0;
      if (sortField === 'rating') {
        // 分页+评分排序
        const qb = this.bookRepository
          .createQueryBuilder('book')
          .leftJoinAndSelect('book.tags', 'tag')
          .leftJoin(
            (qb) =>
              qb
                .select('book_rating.bookId', 'book_id')
                .addSelect('AVG(book_rating.score)', 'avg_rating')
                .from('book_rating', 'book_rating')
                .groupBy('book_rating.bookId'),
            'br',
            'br.book_id = book.id',
          )
          .orderBy('COALESCE(br.avg_rating, -1)', sortDir)
          .addOrderBy('book.created_at', 'DESC');
        const [items, total] = await qb.take(take).skip(skip).getManyAndCount();
        return { total, limit: take, offset: skip, items };
      } else {
        // created_at/updated_at
        const [items, total] = await this.bookRepository.findAndCount({
          relations: ['tags'],
          order: { [sortField]: sortDir },
          take,
          skip,
        });
        return { total, limit: take, offset: skip, items };
      }
    }
    const qb = this.bookRepository
      .createQueryBuilder('book')
      .leftJoinAndSelect('book.tags', 'tag');

    list.forEach((c, idx) => {
      const keyParam = `key${idx}`;
      const valParam = `val${idx}`;
      switch (c.op) {
        case 'eq':
          qb.andWhere(
            `EXISTS (SELECT 1 FROM book_tags bt JOIN tag t ON t.id = bt.tag_id WHERE bt.book_id = book.id AND t.key = :${keyParam} AND t.value = :${valParam})`,
            { [keyParam]: c.target, [valParam]: c.value },
          );
          break;
        case 'neq':
          qb.andWhere(
            `NOT EXISTS (SELECT 1 FROM book_tags bt JOIN tag t ON t.id = bt.tag_id WHERE bt.book_id = book.id AND t.key = :${keyParam} AND t.value = :${valParam})`,
            { [keyParam]: c.target, [valParam]: c.value },
          );
          break;
        case 'match':
          qb.andWhere(
            `EXISTS (SELECT 1 FROM book_tags bt JOIN tag t ON t.id = bt.tag_id WHERE bt.book_id = book.id AND t.key = :${keyParam} AND t.value ILIKE :${valParam})`,
            { [keyParam]: c.target, [valParam]: `%${c.value}%` },
          );
          break;
        default:
          throw new BadRequestException('Unsupported op: ' + String(c.op));
      }
    });

    // 排序
    if (sortField === 'rating') {
      qb.leftJoin(
        (qb2) =>
          qb2
            .select('book_rating.bookId', 'book_id')
            .addSelect('AVG(book_rating.score)', 'avg_rating')
            .from('book_rating', 'book_rating')
            .groupBy('book_rating.bookId'),
        'br',
        'br.book_id = book.id',
      );
      qb.orderBy('COALESCE(br.avg_rating, -1)', sortDir);
      qb.addOrderBy('book.created_at', 'DESC');
    } else {
      qb.orderBy(`book.${sortField}`, sortDir);
    }

    if (!pagingRequested) {
      return qb.getMany();
    }
    let take = typeof limit === 'number' ? limit : 20;
    if (take <= 0) take = 20;
    if (take > 100) take = 100;
    let skip = typeof offset === 'number' ? offset : 0;
    if (skip < 0) skip = 0;
    const [items, total] = await qb.take(take).skip(skip).getManyAndCount();
    return { total, limit: take, offset: skip, items };
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

    interface RawOverlapRow {
      id: string;
      overlap: string;
    }
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
      .getRawMany<RawOverlapRow>();

    if (raw.length === 0) return [];
    const ids = raw.map((r) => Number(r.id));
    const books = await this.bookRepository.find({
      where: ids.map((id) => ({ id })),
      relations: ['tags'],
    });
    const map = new Map(books.map((b) => [b.id, b]));
    return ids.map((id) => map.get(id)).filter((b): b is Book => !!b);
  }

  private async processTags(
    tagDtos: { key: string; value: string; shown?: boolean }[],
  ): Promise<Tag[]> {
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
