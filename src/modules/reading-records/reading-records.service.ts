import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ReadingRecord } from '../../entities/reading-record.entity';
import { StartReadingDto } from './dto/start-reading.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { EndReadingDto } from './dto/end-reading.dto';

@Injectable()
export class ReadingRecordsService {
  constructor(
    @InjectRepository(ReadingRecord)
    private readonly repo: Repository<ReadingRecord>,
  ) {}

  /**
   * Start a new reading session.
   * Any previous un-ended session for the same user+book is auto-closed first.
   */
  async start(userId: number, dto: StartReadingDto): Promise<ReadingRecord> {
    // Auto-close previous un-ended sessions for same user+book
    await this.repo.update(
      { user_id: userId, book_id: dto.bookId, ended_at: IsNull() },
      { ended_at: new Date() },
    );

    const record = this.repo.create({
      user_id: userId,
      book_id: dto.bookId,
      instance_hash: dto.instanceHash ?? null,
      last_active_at: new Date(),
      start_xhtml_index: dto.xhtmlIndex ?? null,
      start_element_index: dto.elementIndex ?? null,
      end_xhtml_index: dto.xhtmlIndex ?? null,
      end_element_index: dto.elementIndex ?? null,
    });
    return this.repo.save(record);
  }

  /**
   * Update "last_active_at" and optionally the current reading position.
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
    if (record.ended_at) {
      throw new NotFoundException('Session already ended');
    }

    record.last_active_at = new Date();
    if (dto.xhtmlIndex != null) record.end_xhtml_index = dto.xhtmlIndex;
    if (dto.elementIndex != null) record.end_element_index = dto.elementIndex;
    return this.repo.save(record);
  }

  /**
   * Explicitly end a reading session.
   */
  async end(
    userId: number,
    recordId: number,
    dto: EndReadingDto,
  ): Promise<ReadingRecord> {
    const record = await this.repo.findOne({
      where: { id: recordId, user_id: userId },
    });
    if (!record) throw new NotFoundException('Reading record not found');

    record.ended_at = new Date();
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
}
