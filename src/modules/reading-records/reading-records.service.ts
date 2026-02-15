import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReadingRecord } from '../../entities/reading-record.entity';
import { StartReadingDto } from './dto/start-reading.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';

export interface BookTimelineGroup {
  bookId: number;
  book: Record<string, unknown> | null;
  sessionCount: number;
  totalDurationSeconds: number;
  lastReadAt: Date;
  recentRecords: ReadingRecord[];
}

@Injectable()
export class ReadingRecordsService {
  constructor(
    @InjectRepository(ReadingRecord)
    private readonly repo: Repository<ReadingRecord>,
  ) {}

  /**
   * Start a new reading session.
   * Previous stale (no heartbeat for >10 min) sessions are left as-is;
   * they are already "implicitly ended" by their last_active_at.
   */
  async start(userId: number, dto: StartReadingDto): Promise<ReadingRecord> {
    const record = this.repo.create({
      user_id: userId,
      book_id: dto.bookId,
      instance_hash: dto.instanceHash ?? null,
      last_active_at: new Date(),
      start_xhtml_index: dto.xhtmlIndex ?? null,
      start_element_index: dto.elementIndex ?? null,
      end_xhtml_index: dto.xhtmlIndex ?? null,
      end_element_index: dto.elementIndex ?? null,
    } as Partial<ReadingRecord>);
    return this.repo.save(record as ReadingRecord);
  }

  /**
   * Update "last_active_at" and optionally the current reading position.
   * There is no explicit "end" — the session is considered finished when
   * heartbeats stop arriving.  The duration is always
   * `last_active_at - started_at` (0 when only one heartbeat exists).
   */
  async heartbeat(
    userId: number,
    recordId: number,
    dto: HeartbeatDto,
  ): Promise<ReadingRecord> {
    const record = await this.repo.findOne({
      where: { id: recordId, user_id: userId },
    });
    if (!record) throw new NotFoundException('Reading record not found');

    record.last_active_at = new Date();
    if (dto.xhtmlIndex != null) record.end_xhtml_index = dto.xhtmlIndex;
    if (dto.elementIndex != null) record.end_element_index = dto.elementIndex;
    return this.repo.save(record);
  }

  /**
   * Get the timeline (paginated) for the current user.
   */
  async getTimeline(
    userId: number,
    limit = 20,
    offset = 0,
  ): Promise<{ items: ReadingRecord[]; total: number }> {
    const [items, total] = await this.repo.findAndCount({
      where: { user_id: userId },
      relations: ['book', 'book.tags'],
      order: { started_at: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { items, total };
  }

  /**
   * Get reading records for a specific book by the current user.
   */
  async getByBook(
    userId: number,
    bookId: number,
    limit = 20,
    offset = 0,
  ): Promise<{ items: ReadingRecord[]; total: number }> {
    const [items, total] = await this.repo.findAndCount({
      where: { user_id: userId, book_id: bookId },
      order: { started_at: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { items, total };
  }

  /**
   * Get a paginated list of distinct books the user has read,
   * with aggregate stats and a preview of recent sessions per book.
   *
   * @param previewCount How many recent records to include per book (default 5)
   */
  async getGroupedByBook(
    userId: number,
    limit = 10,
    offset = 0,
    previewCount = 5,
  ): Promise<{ items: BookTimelineGroup[]; total: number }> {
    // 1. Aggregate: distinct books with stats, ordered by latest read
    const aggRows = await this.repo
      .createQueryBuilder('rr')
      .select('rr.book_id', 'bookId')
      .addSelect('COUNT(*)::int', 'sessionCount')
      .addSelect(
        "COALESCE(SUM(EXTRACT(EPOCH FROM (rr.last_active_at - rr.started_at))), 0)",
        'totalDurationSeconds',
      )
      .addSelect('MAX(rr.started_at)', 'lastReadAt')
      .where('rr.user_id = :userId', { userId })
      .groupBy('rr.book_id')
      .orderBy('"lastReadAt"', 'DESC')
      .limit(limit)
      .offset(offset)
      .getRawMany<{
        bookId: number;
        sessionCount: number;
        totalDurationSeconds: number;
        lastReadAt: string;
      }>();

    // 2. Total distinct books count
    const totalResult = await this.repo
      .createQueryBuilder('rr')
      .select('COUNT(DISTINCT rr.book_id)::int', 'cnt')
      .where('rr.user_id = :userId', { userId })
      .getRawOne<{ cnt: number }>();
    const total = totalResult?.cnt ?? 0;

    if (aggRows.length === 0) {
      return { items: [], total };
    }

    // 3. Load book entities with tags for all bookIds in this page
    const bookIds = aggRows.map((r) => r.bookId);
    const bookRecords = await this.repo
      .createQueryBuilder('rr')
      .leftJoinAndSelect('rr.book', 'book')
      .leftJoinAndSelect('book.tags', 'tags')
      .where('rr.user_id = :userId', { userId })
      .andWhere('rr.book_id IN (:...bookIds)', { bookIds })
      .getMany();

    // Build bookId → Book map (take first occurrence)
    const bookMap = new Map<number, unknown>();
    for (const rec of bookRecords) {
      if (rec.book && !bookMap.has(rec.book_id)) {
        bookMap.set(rec.book_id, rec.book);
      }
    }

    // 4. Load recent records (preview) for each book using lateral-style queries
    //    Use a single query with ROW_NUMBER() window function for efficiency
    const previewRecords = await this.repo.query(
      `SELECT * FROM (
        SELECT rr.*,
          ROW_NUMBER() OVER (PARTITION BY rr.book_id ORDER BY rr.started_at DESC) AS rn
        FROM reading_record rr
        WHERE rr.user_id = $1 AND rr.book_id = ANY($2)
      ) sub WHERE sub.rn <= $3
      ORDER BY sub.book_id, sub.started_at DESC`,
      [userId, bookIds, previewCount],
    ) as ReadingRecord[];

    const previewMap = new Map<number, ReadingRecord[]>();
    for (const rec of previewRecords) {
      const bid = rec.book_id;
      if (!previewMap.has(bid)) previewMap.set(bid, []);
      previewMap.get(bid)!.push(rec);
    }

    // 5. Assemble result
    const items: BookTimelineGroup[] = aggRows.map((agg) => ({
      bookId: agg.bookId,
      book: (bookMap.get(agg.bookId) as Record<string, unknown>) ?? null,
      sessionCount: Number(agg.sessionCount),
      totalDurationSeconds: Math.round(Number(agg.totalDurationSeconds)),
      lastReadAt: new Date(agg.lastReadAt),
      recentRecords: previewMap.get(agg.bookId) ?? [],
    }));

    return { items, total };
  }
}
