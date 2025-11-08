import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReadingRecord } from '../../entities/reading-record.entity';
import { Book } from '../../entities/book.entity';
import { User } from '../../entities/user.entity';
import { UpsertReadingRecordDto } from './dto/upsert-reading-record.dto';

export interface ReadingRecordResponse {
  id: number;
  bookId: number | undefined;
  status: string;
  progress: number;
  current_chapter: string | null;
  notes: string | null;
  started_at: Date | null;
  finished_at: Date | null;
  last_read_at: Date;
  total_minutes: number;
  updated_at: Date;
  book?: { id: number; title: string };
}

@Injectable()
export class ReadingRecordsService {
  constructor(
    @InjectRepository(ReadingRecord)
    private readonly recordRepo: Repository<ReadingRecord>,
    @InjectRepository(Book)
    private readonly bookRepo: Repository<Book>,
  ) {}

  async upsert(userId: number, dto: UpsertReadingRecordDto) {
    const book = await this.bookRepo.findOne({ where: { id: dto.bookId } });
    if (!book) throw new NotFoundException('Book not found');
    let record = await this.recordRepo.findOne({
      where: { user: { id: userId }, book: { id: dto.bookId } },
    });
    const now = new Date();
    if (!record) {
      record = this.recordRepo.create({
        // TypeORM accepts relation ids via partial objects
        user: { id: userId } as User,
        book: { id: dto.bookId } as Book,
        status: dto.status || 'reading',
        progress: dto.progress ?? 0,
        current_chapter: dto.current_chapter?.trim() || null,
        notes: dto.notes?.trim() || null,
        started_at: ['reading', 'finished'].includes(dto.status || 'reading')
          ? now
          : null,
        finished_at:
          dto.status === 'finished' || dto.progress === 100 ? now : null,
        last_read_at: now,
        total_minutes: dto.minutes_increment || 0,
      });
    } else {
      if (dto.status) record.status = dto.status;
      if (dto.progress !== undefined) record.progress = dto.progress;
      if (dto.current_chapter !== undefined)
        record.current_chapter = dto.current_chapter?.trim() || null;
      if (dto.notes !== undefined) record.notes = dto.notes?.trim() || null;
      if (!record.started_at && ['reading', 'finished'].includes(record.status))
        record.started_at = now;
      if (
        (record.status === 'finished' || record.progress === 100) &&
        !record.finished_at
      ) {
        record.finished_at = now;
      }
      record.last_read_at = now;
      if (dto.minutes_increment) record.total_minutes += dto.minutes_increment;
    }
    const saved = await this.recordRepo.save(record);
    return this.toResponse(saved);
  }

  async getOne(userId: number, bookId: number) {
    const record = await this.recordRepo.findOne({
      where: { user: { id: userId }, book: { id: bookId } },
      relations: ['book'],
    });
    if (!record) throw new NotFoundException('Record not found');
    return this.toResponse(record, true);
  }

  async list(userId: number) {
    const records = await this.recordRepo.find({
      where: { user: { id: userId } },
      relations: ['book'],
      order: { updated_at: 'DESC' },
    });
    return records.map((r) => this.toResponse(r, true));
  }

  async stats(userId: number) {
    // aggregate counts and minutes
    const raw = await this.recordRepo.find({ where: { user: { id: userId } } });
    const total = raw.length;
    const finished = raw.filter((r) => r.status === 'finished').length;
    const reading = raw.filter((r) => r.status === 'reading').length;
    const planned = raw.filter((r) => r.status === 'planned').length;
    const paused = raw.filter((r) => r.status === 'paused').length;
    const total_minutes = raw.reduce(
      (acc, r) => acc + (r.total_minutes || 0),
      0,
    );
    return {
      total,
      finished,
      reading,
      planned,
      paused,
      total_minutes,
      finished_ratio: total ? finished / total : 0,
    };
  }

  async remove(userId: number, recordId: number) {
    const record = await this.recordRepo.findOne({
      where: { id: recordId, user: { id: userId } },
    });
    if (!record) throw new NotFoundException('Record not found');
    await this.recordRepo.remove(record);
    return { ok: true };
  }

  private toResponse(
    r: ReadingRecord,
    includeBook = false,
  ): ReadingRecordResponse {
    const base: ReadingRecordResponse = {
      id: r.id,
      bookId: r.book?.id,
      status: r.status,
      progress: r.progress,
      current_chapter: r.current_chapter,
      notes: r.notes,
      started_at: r.started_at,
      finished_at: r.finished_at,
      last_read_at: r.last_read_at,
      total_minutes: r.total_minutes,
      updated_at: r.updated_at,
    };
    if (includeBook && r.book) {
      base.book = { id: r.book.id, title: r.book.title };
    }
    return base;
  }
}
