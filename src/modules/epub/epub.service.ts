import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import AdmZip from 'adm-zip';
import * as mime from 'mime-types';
import { Readable } from 'stream';
import * as path from 'path';
import { Book } from '../../entities/book.entity';
import { FilesService } from '../files/files.service';
import { S3_CLIENT } from '../files/tokens';

@Injectable()
export class EpubService {
  private readonly logger = new Logger(EpubService.name);

  private normalizeStoragePath(inputPath: string): string {
    const normalized = path.posix
      .normalize((inputPath || '').replace(/\\/g, '/'))
      .replace(/^\/+/, '');

    if (!normalized || normalized === '.') return '';
    if (normalized.startsWith('..') || normalized.includes('/..')) {
      throw new BadRequestException('Invalid path');
    }
    return normalized;
  }

  constructor(
    @InjectRepository(Book) private bookRepo: Repository<Book>,
    private filesService: FilesService,
    @Inject(S3_CLIENT) private s3: S3Client,
    private config: ConfigService,
  ) { }

  private async cleanupEpubPrefix(prefix: string): Promise<void> {
    const keys = await this.filesService.listObjects(prefix);
    await this.filesService.deleteObjects(keys);
    await this.filesService.deleteRecordsByKeys(keys);
  }

  async uploadEpub(bookId: number, fileBuffer: Buffer, ownerId: number) {
    if (!Number.isInteger(bookId)) {
      throw new BadRequestException('Invalid book id');
    }
    const book = await this.bookRepo.findOne({ where: { id: bookId } });
    if (!book) throw new NotFoundException('Book not found');

    const prefix = `books/${bookId}/epub/`;

    // Replace behavior: clear previous extracted files to avoid stale/wild EPUB objects.
    if (book.has_epub) {
      await this.cleanupEpubPrefix(prefix);
      book.has_epub = false;
      await this.bookRepo.save(book);
    }

    let zip: AdmZip;
    try {
      zip = new AdmZip(fileBuffer);
    } catch (e) {
      this.logger.error(e);
      throw new BadRequestException('Invalid EPUB file');
    }

    const zipEntries = zip.getEntries();
    // Verify mimetype file exists to ensure it is an EPUB
    const mimetypeEntry = zipEntries.find(
      (entry) => entry.entryName === 'mimetype',
    );
    if (!mimetypeEntry) {
      throw new BadRequestException('Not a valid EPUB: missing mimetype file');
    }

    const uploadPromises = zipEntries.map(async (entry) => {
      if (entry.isDirectory) return;
      const contentType =
        mime.lookup(entry.entryName) || 'application/octet-stream';
      const entryPath = this.normalizeStoragePath(entry.entryName);
      if (!entryPath) return;
      // Key format: books/{bookId}/epub/{entryPath}
      const key = `books/${bookId}/epub/${entryPath}`;

      try {
        await this.filesService.putObject(
          key,
          entry.getData(),
          contentType as string,
          undefined,
          ownerId,
        );
      } catch (err) {
        this.logger.error(`Failed to upload ${key}`, err);
        throw err;
      }
    });

    try {
      await Promise.all(uploadPromises);
      book.has_epub = true;
      await this.bookRepo.save(book);
      this.logger.log(`Epub uploaded and extracted for book ${bookId}`);
    } catch (e) {
      // rollback to avoid leaving partial/wild extracted objects
      try {
        await this.cleanupEpubPrefix(prefix);
      } catch {
        /* ignore rollback errors */
      }
      throw e;
    }
  }

  async getFile(
    bookId: number,
    path: string,
  ): Promise<{ stream: Readable; contentType: string; length?: number }> {
    if (!Number.isInteger(bookId)) {
      throw new BadRequestException('Invalid book id');
    }
    const book = await this.bookRepo.findOne({ where: { id: bookId } });
    if (!book || !book.has_epub) {
      throw new NotFoundException('Book EPUB not available');
    }

    // path comes from url, might need decoding
    const decodedPath = decodeURIComponent(path);
    const safePath = this.normalizeStoragePath(decodedPath);
    if (!safePath) throw new NotFoundException('File not found');
    const key = `books/${bookId}/epub/${safePath}`;

    try {
      const command = new GetObjectCommand({
        Bucket: this.filesService.getBucket(),
        Key: key,
      });
      const response = await this.s3.send(command);
      return {
        stream: response.Body as Readable,
        contentType: response.ContentType || 'application/octet-stream',
        length: response.ContentLength,
      };
    } catch (e) {
      throw new NotFoundException(`File not found: ${path}`);
    }
  }

  async deleteEpub(bookId: number): Promise<void> {
    if (!Number.isInteger(bookId)) {
      throw new BadRequestException('Invalid book id');
    }
    const book = await this.bookRepo.findOne({ where: { id: bookId } });
    if (!book) throw new NotFoundException('Book not found');
    if (!book.has_epub) {
      throw new BadRequestException('Book has no EPUB to delete');
    }

    const prefix = `books/${bookId}/epub/`;
    const keys = await this.filesService.listObjects(prefix);
    await this.filesService.deleteObjects(keys);
    await this.filesService.deleteRecordsByKeys(keys);

    book.has_epub = false;
    await this.bookRepo.save(book);
    this.logger.log(`Deleted EPUB for book ${bookId}, removed ${keys.length} objects`);
  }
}
