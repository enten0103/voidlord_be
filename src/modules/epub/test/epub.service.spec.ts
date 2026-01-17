import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { Readable } from 'stream';
import AdmZip from 'adm-zip';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as mime from 'mime-types';

import { EpubService } from '../epub.service';
import { Book } from '../../../entities/book.entity';
import { createRepoMock } from '../../../../test/repo-mocks';
import { FilesService } from '../../files/files.service';
import { S3_CLIENT } from '../../files/tokens';

describe('EpubService', () => {
  let service: EpubService;

  const mockBookRepository = createRepoMock<Book>();
  const mockFilesService = {
    putObject: jest.fn(),
    getBucket: jest.fn().mockReturnValue('voidlord'),
    listObjects: jest.fn(),
    deleteObjects: jest.fn(),
    deleteRecordByKey: jest.fn(),
    deleteRecordsByKeys: jest.fn(),
  } as unknown as Pick<
    FilesService,
    | 'putObject'
    | 'getBucket'
    | 'listObjects'
    | 'deleteObjects'
    | 'deleteRecordByKey'
    | 'deleteRecordsByKeys'
  >;

  const mockS3 = {
    send: jest.fn(),
  };

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EpubService,
        {
          provide: getRepositoryToken(Book),
          useValue: mockBookRepository,
        },
        {
          provide: FilesService,
          useValue: mockFilesService,
        },
        {
          provide: S3_CLIENT,
          useValue: mockS3,
        },
        {
          provide: ConfigService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<EpubService>(EpubService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadEpub', () => {
    it('throws NotFoundException when book does not exist', async () => {
      mockBookRepository.findOne.mockResolvedValue(null);
      await expect(service.uploadEpub(1, Buffer.from('x'), 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException for invalid zip', async () => {
      mockBookRepository.findOne.mockResolvedValue({
        id: 1,
        has_epub: false,
      } as unknown as Book);

      await expect(
        service.uploadEpub(1, Buffer.from('not-a-zip'), 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when missing mimetype entry', async () => {
      mockBookRepository.findOne.mockResolvedValue({
        id: 1,
        has_epub: false,
      } as unknown as Book);

      const zip = new AdmZip();
      zip.addFile('OPS/content.xhtml', Buffer.from('<html />'));
      const buf = zip.toBuffer();

      await expect(service.uploadEpub(1, buf, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('uploads all files and marks book as has_epub', async () => {
      const book = { id: 1, has_epub: false } as unknown as Book;
      mockBookRepository.findOne.mockResolvedValue(book);
      mockBookRepository.save.mockResolvedValue({
        ...book,
        has_epub: true,
      } as unknown as Book);

      const zip = new AdmZip();
      zip.addFile('mimetype', Buffer.from('application/epub+zip'));
      zip.addFile('META-INF/container.xml', Buffer.from('<container/>'));
      zip.addFile('OPS/content.xhtml', Buffer.from('<html />'));
      const buf = zip.toBuffer();

      await service.uploadEpub(1, buf, 123);

      expect((mockFilesService.putObject as jest.Mock).mock.calls.length).toBe(
        3,
      );
      const firstCall = (mockFilesService.putObject as jest.Mock).mock.calls[0];
      expect(firstCall[4]).toBe(123);
      expect(mockBookRepository.save).toHaveBeenCalled();
      const saved = (mockBookRepository.save as jest.Mock).mock.calls[0][0];
      expect(saved.has_epub).toBe(true);
    });

    it('real test.epub: uploads every non-directory entry with expected keys', async () => {
      const book = { id: 1, has_epub: false } as unknown as Book;
      mockBookRepository.findOne.mockResolvedValue(book);
      mockBookRepository.save.mockResolvedValue({
        ...book,
        has_epub: true,
      } as unknown as Book);

      const fixturePath = join(__dirname, 'test.epub');
      const buf = readFileSync(fixturePath);
      const zip = new AdmZip(buf);
      const entries = zip.getEntries();
      const fileEntries = entries.filter((e) => !e.isDirectory);

      await service.uploadEpub(1, buf, 123);

      const calls = (mockFilesService.putObject as jest.Mock).mock.calls as Array<
        [string, Buffer, string]
      >;
      expect(calls.length).toBe(fileEntries.length);

      // spot-check a few canonical EPUB files
      const expectedKeys = [
        'books/1/epub/mimetype',
        'books/1/epub/META-INF/container.xml',
      ];
      for (const key of expectedKeys) {
        expect(calls.some((c) => c[0] === key)).toBe(true);
      }

      // verify content-type mapping for container.xml follows mime-types
      const containerCall = calls.find(
        (c) => c[0] === 'books/1/epub/META-INF/container.xml',
      );
      expect(containerCall).toBeDefined();
      expect(containerCall![2]).toBe(
        (mime.lookup('META-INF/container.xml') || 'application/octet-stream') as string,
      );

      // verify bytes for container.xml are exactly what is in the epub
      const expectedContainer = zip
        .getEntries()
        .find((e) => e.entryName === 'META-INF/container.xml')
        ?.getData();
      expect(expectedContainer).toBeDefined();
      expect(containerCall![1].equals(expectedContainer!)).toBe(true);
    });
  });

  describe('getFile', () => {
    it('throws NotFoundException when book has no epub', async () => {
      mockBookRepository.findOne.mockResolvedValue({
        id: 1,
        has_epub: false,
      } as unknown as Book);

      await expect(service.getFile(1, 'OPS/content.xhtml')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns stream + contentType + length when object exists', async () => {
      mockBookRepository.findOne.mockResolvedValue({
        id: 1,
        has_epub: true,
      } as unknown as Book);

      mockS3.send.mockResolvedValue({
        Body: Readable.from('x'),
        ContentType: 'text/plain',
        ContentLength: 1,
      });

      const res = await service.getFile(1, 'OPS/content.xhtml');
      expect(res.contentType).toBe('text/plain');
      expect(res.length).toBe(1);
      expect(mockS3.send).toHaveBeenCalled();
    });

    it('throws NotFoundException when object missing', async () => {
      mockBookRepository.findOne.mockResolvedValue({
        id: 1,
        has_epub: true,
      } as unknown as Book);

      mockS3.send.mockRejectedValue(new Error('NoSuchKey'));

      await expect(service.getFile(1, 'OPS/missing.xhtml')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteEpub', () => {
    it('throws NotFoundException when book does not exist', async () => {
      mockBookRepository.findOne.mockResolvedValue(null);

      await expect(service.deleteEpub(999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when book has no epub', async () => {
      const book = { id: 1, has_epub: false } as unknown as Book;
      mockBookRepository.findOne.mockResolvedValue(book);

      await expect(service.deleteEpub(1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('deletes all epub objects and sets has_epub to false', async () => {
      const book = { id: 1, has_epub: true } as unknown as Book;
      mockBookRepository.findOne.mockResolvedValue(book);
      mockBookRepository.save.mockResolvedValue({
        ...book,
        has_epub: false,
      } as unknown as Book);

      const keys = [
        'books/1/epub/mimetype',
        'books/1/epub/META-INF/container.xml',
      ];
      (mockFilesService.listObjects as jest.Mock).mockResolvedValue(keys);

      await service.deleteEpub(1);

      expect(mockFilesService.listObjects).toHaveBeenCalledWith('books/1/epub/');
      expect(mockFilesService.deleteObjects).toHaveBeenCalledWith(keys);
      expect(mockFilesService.deleteRecordsByKeys).toHaveBeenCalledWith(keys);
      expect(mockBookRepository.save).toHaveBeenCalledWith({
        ...book,
        has_epub: false,
      });
    });
  });

  describe('upload rollback', () => {
    it('cleans up prefix when an upload fails', async () => {
      const book = { id: 1, has_epub: false } as unknown as Book;
      mockBookRepository.findOne.mockResolvedValue(book);

      // valid zip with 2 entries
      const zip = new AdmZip();
      zip.addFile('mimetype', Buffer.from('application/epub+zip'));
      zip.addFile('OPS/content.xhtml', Buffer.from('<html />'));
      const buf = zip.toBuffer();

      (mockFilesService.putObject as jest.Mock).mockRejectedValueOnce(
        new Error('boom'),
      );
      (mockFilesService.listObjects as jest.Mock).mockResolvedValue([
        'books/1/epub/mimetype',
      ]);

      await expect(service.uploadEpub(1, buf, 7)).rejects.toThrow('boom');
      expect(mockFilesService.deleteObjects).toHaveBeenCalled();
      expect(mockFilesService.deleteRecordsByKeys).toHaveBeenCalled();
    });
  });
});
