import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { Readable } from 'stream';
import AdmZip from 'adm-zip';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as mime from 'mime-types';

import { TonoService } from '../tono.service';
import { Book } from '../../../entities/book.entity';
import { ReaderEngine } from '../../../entities/reader-engine.entity';
import { ReaderInstance } from '../../../entities/reader-instance.entity';
import { createRepoMock } from '../../../../test/repo-mocks';
import { FilesService } from '../../files/files.service';
import { S3_CLIENT } from '../../files/tokens';
import { ConfigService } from '@nestjs/config';

function createInMemoryStorage() {
    const store = new Map<string, { body: Buffer; contentType?: string }>();
    return {
        put: (key: string, body: Buffer, contentType?: string) => {
            store.set(key, { body: Buffer.from(body), contentType });
        },
        get: (key: string) => store.get(key),
        has: (key: string) => store.has(key),
        keys: () => Array.from(store.keys()),
        clear: () => store.clear(),
    };
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

describe('TonoService', () => {
    let service: TonoService;
    const mockBookRepository = createRepoMock<Book>();
    const mockEngineRepository = createRepoMock<ReaderEngine>();
    const mockInstanceRepository = createRepoMock<ReaderInstance>();
    const storage = createInMemoryStorage();

    const mockFilesService = {
        putObject: jest
            .fn()
            .mockImplementation(
                async (key: string, body: Buffer, contentType?: string) => {
                    storage.put(key, Buffer.isBuffer(body) ? body : Buffer.from(body as any), contentType);
                    return key;
                },
            ),
        getBucket: jest.fn().mockReturnValue('voidlord'),
        listObjects: jest.fn().mockImplementation(async (prefix: string) => {
            return storage.keys().filter((k) => k.startsWith(prefix));
        }),
        deleteObjects: jest.fn().mockImplementation(async (_keys: string[]) => undefined),
        deleteRecordsByKeys: jest.fn().mockImplementation(async (_keys: string[]) => undefined),
        ensureObjectExists: jest.fn().mockImplementation(async (_bucket: string, key: string) => storage.has(key)),
    } as unknown as Pick<
        FilesService,
        | 'putObject'
        | 'getBucket'
        | 'listObjects'
        | 'deleteObjects'
        | 'deleteRecordsByKeys'
        | 'ensureObjectExists'
    >;

    const mockS3 = {
        send: jest.fn().mockImplementation(async (command: any) => {
            const key = command?.input?.Key as string | undefined;
            if (!key) throw new Error('Missing Key');
            const obj = storage.get(key);
            if (!obj) throw new Error('NoSuchKey');
            return {
                Body: Readable.from(obj.body),
                ContentType: obj.contentType,
                ContentLength: obj.body.length,
            };
        }),
    };

    beforeEach(async () => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TonoService,
                { provide: getRepositoryToken(Book), useValue: mockBookRepository },
                { provide: getRepositoryToken(ReaderEngine), useValue: mockEngineRepository },
                { provide: getRepositoryToken(ReaderInstance), useValue: mockInstanceRepository },
                { provide: FilesService, useValue: mockFilesService },
                { provide: S3_CLIENT, useValue: mockS3 },
                { provide: ConfigService, useValue: { get: jest.fn() } },
            ],
        }).compile();

        service = module.get<TonoService>(TonoService);
    });

    afterEach(() => {
        storage.clear();
        jest.clearAllMocks();
    });

    it('throws NotFoundException when book does not exist', async () => {
        mockBookRepository.findOne.mockResolvedValue(null);
        await expect(service.parseBookToTono(1)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when book has no epub', async () => {
        mockBookRepository.findOne.mockResolvedValue({ id: 1, has_epub: false } as Book);
        await expect(service.parseBookToTono(1)).rejects.toThrow(BadRequestException);
    });

    it('parses test.epub into tono.json and widget outputs', async () => {
        mockBookRepository.findOne.mockResolvedValue({ id: 1, has_epub: true } as Book);
        mockEngineRepository.findOne.mockResolvedValue({ id: 1, key: 'tono' } as ReaderEngine);
        mockInstanceRepository.findOne.mockResolvedValue(null);
        mockInstanceRepository.create.mockImplementation((v) => ({ ...v } as ReaderInstance));
        mockInstanceRepository.save.mockImplementation(async (v) => v);

        const fixturePath = join(__dirname, '../../epub/test/test.epub');
        const buf = readFileSync(fixturePath);
        const zip = new AdmZip(buf);
        const entries = zip.getEntries();
        for (const entry of entries) {
            if (entry.isDirectory) continue;
            const key = `books/1/epub/${entry.entryName}`;
            const contentType = mime.lookup(entry.entryName) || 'application/octet-stream';
            storage.put(key, entry.getData(), contentType as string);
        }

        const result = await service.parseBookToTono(1, { force: true });
        expect(result.hash).toBe('book-1');
        expect(result.xhtmls.length).toBeGreaterThan(0);

        const tonoKey = 'tono/book-1/tono.json';
        expect(storage.has(tonoKey)).toBe(true);

        const firstXhtml = result.xhtmls[0];
        const widgetKey = `tono/book-1/widgets/${firstXhtml}.json`;
        expect(storage.has(widgetKey)).toBe(true);
    });

    it('returns cached tono.json when force is false and tono already exists', async () => {
        mockBookRepository.findOne.mockResolvedValue({ id: 2, has_epub: true } as Book);
        mockEngineRepository.findOne.mockResolvedValue({ id: 1, key: 'tono' } as ReaderEngine);
        mockInstanceRepository.findOne.mockResolvedValue({
            id: 1,
            hash: 'book-2',
            status: 'ready',
        } as ReaderInstance);
        mockInstanceRepository.save.mockImplementation(async (v) => v);
        const tonoKey = 'tono/book-2/tono.json';
        storage.put(
            tonoKey,
            Buffer.from(JSON.stringify({
                bookInfo: { title: 'cached', coverUrl: '' },
                hash: 'book-2',
                navItems: [],
                xhtmls: [],
                deepth: 0,
                widgetProvider: {
                    _type: 'NetTonoWidgetProvider',
                    hash: 'book-2',
                    baseUrl: 'http://localhost:3000',
                    widgetPathTemplate: '/tono/{hash}/widgets/{id}',
                    assetPathTemplate: '/tono/{hash}/assets/{id}',
                    fontListPath: '/tono/{hash}/fonts',
                    fontPathTemplate: '/tono/{hash}/fonts/{id}',
                },
            })),
            'application/json',
        );

        const result = await service.parseBookToTono(2);
        expect(result.hash).toBe('book-2');
        expect(mockFilesService.ensureObjectExists).toHaveBeenCalled();
    });

    it('getTono throws when tono.json is missing', async () => {
        await expect(service.getTono('missing')).rejects.toThrow(NotFoundException);
    });

    it('getWidget throws when widget json is missing', async () => {
        await expect(service.getWidget('book-1', 'OPS/missing.xhtml')).rejects.toThrow(
            NotFoundException,
        );
    });

    it('getFontList returns empty array when no index exists', async () => {
        const list = await service.getFontList('book-1');
        expect(list).toEqual([]);
    });

    it('getAsset returns stream and contentType', async () => {
        storage.put('tono/book-3/assets/cover', Buffer.from('img'), 'image/png');
        const res = await service.getAsset('book-3', 'cover');
        const buf = await streamToBuffer(res.body);
        expect(buf.toString('utf-8')).toBe('img');
        expect(res.type).toBe('image/png');
    });

    it('startParseJob records status', async () => {
        mockBookRepository.findOne.mockResolvedValue({ id: 1, has_epub: true } as Book);
        mockEngineRepository.findOne.mockResolvedValue({ id: 1, key: 'tono' } as ReaderEngine);
        mockInstanceRepository.findOne.mockResolvedValue(null);
        mockInstanceRepository.save.mockImplementation(async (v) => v);
        const fixturePath = join(__dirname, '../../epub/test/test.epub');
        const buf = readFileSync(fixturePath);
        const zip = new AdmZip(buf);
        const entries = zip.getEntries();
        for (const entry of entries) {
            if (entry.isDirectory) continue;
            const key = `books/1/epub/${entry.entryName}`;
            const contentType = mime.lookup(entry.entryName) || 'application/octet-stream';
            storage.put(key, entry.getData(), contentType as string);
        }

        const { jobId } = await service.startParseJob(1, { force: true });
        const job = service.getJob(jobId);
        expect(['pending', 'running', 'done', 'error']).toContain(job.status);
    });
});
