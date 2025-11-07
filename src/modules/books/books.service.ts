import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Book } from '../../entities/book.entity';
import { Tag } from '../../entities/tag.entity';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { BookRating } from '../../entities/book-rating.entity';
import { Comment } from '../../entities/comment.entity';

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
  ) {}

  async create(createBookDto: CreateBookDto, userId?: number): Promise<Book> {
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

  async rateBook(bookId: number, userId: number, score: number) {
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new ConflictException('Score must be an integer between 1 and 5');
    }
    const book = await this.bookRepository.findOne({ where: { id: bookId } });
    if (!book) throw new NotFoundException('Book not found');
    let rating = await this.ratingRepository.findOne({
      where: { book: { id: bookId }, user: { id: userId } } as any,
    });
    if (!rating) {
      rating = this.ratingRepository.create({
        book: { id: bookId } as any,
        user: { id: userId } as any,
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

  async getRating(bookId: number) {
    const book = await this.bookRepository.findOne({ where: { id: bookId } });
    if (!book) throw new NotFoundException('Book not found');
    const agg = await this.ratingRepository
      .createQueryBuilder('r')
      .where('r.bookId = :bid', { bid: bookId })
      .select('COUNT(1)', 'count')
      .addSelect('AVG(r.score)', 'avg')
      .getRawOne<{ count: string; avg: string }>();
    return {
      bookId,
      count: Number(agg?.count ?? 0),
      avg: agg?.avg ? Number(agg.avg) : 0,
    };
  }

  async getMyRating(bookId: number, userId: number) {
    const book = await this.bookRepository.findOne({ where: { id: bookId } });
    if (!book) throw new NotFoundException('Book not found');
    const r = await this.ratingRepository.findOne({
      where: { book: { id: bookId }, user: { id: userId } } as any,
    });
    return { bookId, myRating: r?.score ?? null };
  }

  async removeMyRating(bookId: number, userId: number) {
    const r = await this.ratingRepository.findOne({
      where: { book: { id: bookId }, user: { id: userId } } as any,
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
      where: { book: { id: bookId }, parent: IsNull() } as any,
      order: { created_at: 'DESC' },
      take: limit,
      skip: offset,
      relations: ['user'],
    });
    // compute reply counts for each top-level comment
    const counts = await Promise.all(
      items.map((c) =>
        this.commentRepository.count({
          where: { book: { id: bookId }, parent: { id: c.id } } as any,
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
        user: c.user
          ? { id: c.user.id, username: (c.user as any).username }
          : null,
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
      book: { id: bookId } as any,
      user: userId ? ({ id: userId } as any) : null,
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
      where: { id: commentId, book: { id: bookId } } as any,
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
      where: { id: commentId, book: { id: bookId } } as any,
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
      where: { id: parentCommentId, book: { id: bookId } } as any,
    });
    if (!parent) throw new NotFoundException('Parent comment not found');
    const entity = this.commentRepository.create({
      book: { id: bookId } as any,
      user: userId ? ({ id: userId } as any) : null,
      content: content.trim(),
      parent: { id: parentCommentId } as any,
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
      where: { id: parentCommentId, book: { id: bookId } } as any,
    });
    if (!parent) throw new NotFoundException('Parent comment not found');
    if (limit <= 0) limit = 20;
    if (limit > 100) limit = 100;
    if (offset < 0) offset = 0;
    const [items, total] = await this.commentRepository.findAndCount({
      where: { book: { id: bookId }, parent: { id: parentCommentId } } as any,
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
        user: c.user
          ? { id: c.user.id, username: (c.user as any).username }
          : null,
      })),
    };
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
