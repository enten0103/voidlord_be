import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
    Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Book } from '../../entities/book.entity';
import { ReaderEngine } from '../../entities/reader-engine.entity';
import { ReaderInstance, ReaderInstanceStatus } from '../../entities/reader-instance.entity';
import { FilesService } from '../files/files.service';
import { S3_CLIENT } from '../files/tokens';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { XMLParser } from 'fast-xml-parser';
import { parse as parseHtml, HTMLElement, Node as HtmlNode } from 'node-html-parser';
import * as css from 'css';
import * as path from 'path';
import * as mime from 'mime-types';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';

interface TonoStyle {
    property: string;
    value: string;
    priority: number;
}

interface TonoText {
    _type: 'tonoText';
    className: 'text_node';
    text: string;
    css: TonoStyle[];
}

interface TonoImage {
    _type: 'tonoImage';
    url: string;
    css: TonoStyle[];
}

interface TonoSvg {
    _type: 'tonoSvg';
    src: string;
    css: TonoStyle[];
}

interface RubyItem {
    text: string;
    ruby?: string | null;
}

interface TonoRuby {
    _type: 'tonoRuby';
    className: 'ruby';
    css: TonoStyle[];
    texts: RubyItem[];
}

interface TonoContainer {
    _type: 'tonoContainer';
    className: string;
    display: string;
    css: TonoStyle[];
    children: TonoWidget[];
}

type TonoWidget = TonoContainer | TonoText | TonoImage | TonoRuby | TonoSvg;

interface SelectorPart {
    isUniversal: boolean;
    element?: string;
    id?: string;
    classes: string[];
    pseudos: string[];
    attributes: string[];
    idCount: number;
    classCount: number;
    attributeCount: number;
    elementCount: number;
}

interface SelectorGroup {
    parts: SelectorPart[];
    combinators: string[];
    specificity: number;
}

interface SelectorInfo {
    groups: SelectorGroup[];
}

interface TonoStyleSheetBlock {
    selector: SelectorInfo;
    properties: Record<string, string>;
}

interface TonoNavItem {
    path: string;
    title: string;
}

interface TonoBookInfo {
    title: string;
    coverUrl: string;
}

interface TonoDocument {
    bookInfo: TonoBookInfo;
    hash: string;
    navItems: TonoNavItem[];
    xhtmls: string[];
    deepth: number;
    widgetProvider: {
        _type: 'NetTonoWidgetProvider';
        hash: string;
        baseUrl: string;
        headers?: Record<string, string> | null;
        widgetPathTemplate: string;
        assetPathTemplate: string;
        fontListPath: string;
        fontPathTemplate: string;
    };
}

@Injectable()
export class TonoService {
    private readonly logger = new Logger(TonoService.name);
    private readonly xmlParser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '',
        attributesGroupName: 'attr',
        removeNSPrefix: true,
        textNodeName: 'text',
    });

    private readonly jobs = new Map<string, {
        status: 'pending' | 'running' | 'done' | 'error' | 'expired';
        result?: { hash: string };
        error?: string;
        createdAt: number;
        expiresAt: number;
    }>();

    private readonly jobTtlMs = 15 * 60 * 1000; // 15 minutes

    constructor(
        @InjectRepository(Book) private readonly bookRepo: Repository<Book>,
        @InjectRepository(ReaderEngine)
        private readonly engineRepo: Repository<ReaderEngine>,
        @InjectRepository(ReaderInstance)
        private readonly instanceRepo: Repository<ReaderInstance>,
        private readonly files: FilesService,
        private readonly config: ConfigService,
        @Inject(S3_CLIENT) private readonly s3: S3Client,
    ) { }

    async parseBookToTono(
        bookId: number,
        options?: { force?: boolean; variant?: string },
    ): Promise<TonoDocument> {
        if (!Number.isInteger(bookId) || bookId <= 0) {
            throw new BadRequestException('Invalid book id');
        }
        const book = await this.bookRepo.findOne({ where: { id: bookId } });
        if (!book) throw new NotFoundException('Book not found');
        if (!book.has_epub) {
            throw new BadRequestException('Book has no EPUB to parse');
        }

        const force = options?.force === true;
        const variant = (options?.variant || 'default').trim() || 'default';
        const engine = await this.ensureEngine('tono', 'Tono Reader');
        const hash = this.buildHash(bookId, engine.key, variant);
        const tonoPrefix = `tono/${hash}/`;

        let instance = await this.instanceRepo.findOne({
            where: {
                book: { id: bookId },
                engine: { id: engine.id },
                variant,
            },
        });

        if (!instance) {
            instance = this.instanceRepo.create({
                book: { id: bookId } as Book,
                engine,
                variant,
                hash,
                status: 'processing',
            });
            await this.instanceRepo.save(instance);
        } else {
            instance.hash = hash;
            instance.status = 'processing';
            await this.instanceRepo.save(instance);
        }

        if (!force) {
            const exists = await this.files
                .ensureObjectExists(this.files.getBucket(), `${tonoPrefix}tono.json`)
                .catch(() => false);
            if (exists) {
                instance.status = 'ready';
                await this.instanceRepo.save(instance);
                return this.getTono(hash);
            }
        }

        await this.cleanupPrefix(tonoPrefix);

        const containerKey = `books/${bookId}/epub/META-INF/container.xml`;
        const containerXml = await this.getObjectText(containerKey);
        const opfPath = this.parseContainerXml(containerXml);

        const opfKey = `books/${bookId}/epub/${opfPath}`;
        const opfXml = await this.getObjectText(opfKey);

        const {
            title,
            coverUrl,
            xhtmls,
            navItems,
            manifestItems,
        } = await this.parseOpf(opfXml, opfPath, bookId);

        if (!xhtmls.length) {
            throw new BadRequestException('No XHTML content found in EPUB');
        }

        const widgetMap = new Map<string, TonoWidget>();
        for (const xhtmlPath of xhtmls) {
            const xhtmlKey = `books/${bookId}/epub/${xhtmlPath}`;
            const html = await this.getObjectText(xhtmlKey);
            const widget = await this.parseXhtmlToWidget(html, xhtmlPath, bookId);
            widgetMap.set(xhtmlPath, widget);
            await this.putJson(
                `${tonoPrefix}widgets/${xhtmlPath}.json`,
                widget,
            );
        }

        const fontIds = new Set<string>();

        for (const item of manifestItems) {
            if (!item.href) continue;
            const fullPath = this.resolvePath(opfPath, item.href);
            const key = `books/${bookId}/epub/${fullPath}`;
            if (item.mediaType?.startsWith('image')) {
                const id = this.basenameWithoutExt(fullPath);
                const data = await this.getObjectBuffer(key);
                const contentType =
                    item.mediaType || mime.lookup(fullPath) || 'application/octet-stream';
                await this.files.putObject(
                    `${tonoPrefix}assets/${id}`,
                    data,
                    contentType as string,
                );
            }
            if (item.mediaType?.includes('font')) {
                const id = this.basenameWithoutExt(fullPath);
                const data = await this.getObjectBuffer(key);
                const contentType =
                    item.mediaType || mime.lookup(fullPath) || 'application/octet-stream';
                await this.files.putObject(
                    `${tonoPrefix}fonts/${id}`,
                    data,
                    contentType as string,
                );
                fontIds.add(id);
            }
        }

        await this.putJson(`${tonoPrefix}fonts/index.json`, Array.from(fontIds));

        const deepth = this.calcScrollableDeepth(widgetMap, xhtmls);
        const tonoDoc: TonoDocument = {
            bookInfo: { title, coverUrl },
            hash,
            navItems,
            xhtmls,
            deepth,
            widgetProvider: {
                _type: 'NetTonoWidgetProvider',
                hash,
                baseUrl: this.getBaseUrl(),
                widgetPathTemplate: '/tono/{hash}/widgets/{id}',
                assetPathTemplate: '/tono/{hash}/assets/{id}',
                fontListPath: '/tono/{hash}/fonts',
                fontPathTemplate: '/tono/{hash}/fonts/{id}',
            },
        };

        await this.putJson(`${tonoPrefix}tono.json`, tonoDoc);

        instance.status = 'ready';
        await this.instanceRepo.save(instance);

        return tonoDoc;
    }

    async startParseJob(
        bookId: number,
        options?: { force?: boolean; variant?: string },
    ): Promise<{ jobId: string }> {
        const jobId = randomUUID();
        const now = Date.now();
        this.jobs.set(jobId, {
            status: 'pending',
            createdAt: now,
            expiresAt: now + this.jobTtlMs,
        });
        setImmediate(async () => {
            const running = this.jobs.get(jobId);
            if (!running || running.status === 'expired') return;
            this.jobs.set(jobId, { ...running, status: 'running' });
            try {
                const result = await this.parseBookToTono(bookId, options);
                const done = this.jobs.get(jobId);
                if (!done || done.status === 'expired') return;
                this.jobs.set(jobId, {
                    ...done,
                    status: 'done',
                    result: { hash: result.hash },
                });
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                const failed = this.jobs.get(jobId);
                if (!failed || failed.status === 'expired') return;
                this.jobs.set(jobId, {
                    ...failed,
                    status: 'error',
                    error: message,
                });
            }
        });
        return { jobId };
    }

    getJob(jobId: string): {
        status: string;
        result?: { hash: string };
        error?: string;
        expiresAt?: number;
    } {
        const job = this.jobs.get(jobId);
        if (!job) throw new NotFoundException('Job not found');
        const now = Date.now();
        if (job.status !== 'expired' && now > job.expiresAt) {
            const expired = { ...job, status: 'expired' as const };
            this.jobs.set(jobId, expired);
            return { status: 'expired', expiresAt: job.expiresAt };
        }
        const { status, result, error, expiresAt } = job;
        return { status, result, error, expiresAt };
    }

    async listInstances(bookId: number) {
        const book = await this.bookRepo.findOne({ where: { id: bookId } });
        if (!book) throw new NotFoundException('Book not found');
        const items = await this.instanceRepo.find({
            where: { book: { id: bookId } },
            relations: ['engine'],
            order: { updated_at: 'DESC' },
        });
        return items.map((i) => ({
            id: i.id,
            engine: i.engine.key,
            variant: i.variant,
            hash: i.hash,
            status: i.status,
            updated_at: i.updated_at,
        }));
    }

    async getTono(hash: string): Promise<TonoDocument> {
        const safeHash = this.normalizeSimpleHash(hash);
        const key = `tono/${safeHash}/tono.json`;
        const buf = await this.getObjectBuffer(key).catch(() => null);
        if (!buf) throw new NotFoundException('Tono data not found');
        const json = JSON.parse(buf.toString('utf-8')) as TonoDocument;
        return json;
    }

    async getWidget(hash: string, id: string): Promise<TonoWidget> {
        const safeHash = this.normalizeSimpleHash(hash);
        const safeId = this.normalizePath(id);
        const key = `tono/${safeHash}/widgets/${safeId}.json`;
        const buf = await this.getObjectBuffer(key).catch(() => null);
        if (!buf) throw new NotFoundException('Widget not found');
        return JSON.parse(buf.toString('utf-8')) as TonoWidget;
    }

    async getAsset(hash: string, id: string): Promise<{ body: Readable; type: string; length?: number }> {
        const safeHash = this.normalizeSimpleHash(hash);
        const safeId = this.normalizePath(id);
        const key = `tono/${safeHash}/assets/${safeId}`;
        return this.getObjectStream(key);
    }

    async getFontList(hash: string): Promise<string[]> {
        const safeHash = this.normalizeSimpleHash(hash);
        const key = `tono/${safeHash}/fonts/index.json`;
        const buf = await this.getObjectBuffer(key).catch(() => null);
        if (!buf) return [];
        try {
            const list = JSON.parse(buf.toString('utf-8')) as string[];
            return Array.isArray(list) ? list : [];
        } catch {
            return [];
        }
    }

    async getFont(hash: string, id: string): Promise<{ body: Readable; type: string; length?: number }> {
        const safeHash = this.normalizeSimpleHash(hash);
        const safeId = this.normalizePath(id);
        const key = `tono/${safeHash}/fonts/${safeId}`;
        return this.getObjectStream(key);
    }

    private async getObjectBuffer(key: string): Promise<Buffer> {
        const cmd = new GetObjectCommand({
            Bucket: this.files.getBucket(),
            Key: key,
        });
        const res = await this.s3.send(cmd);
        const body = res.Body as Readable | undefined;
        if (!body) throw new NotFoundException(`Missing object: ${key}`);
        return this.streamToBuffer(body);
    }

    private async getObjectText(key: string): Promise<string> {
        const buf = await this.getObjectBuffer(key);
        return buf.toString('utf-8');
    }

    private async getObjectStream(key: string): Promise<{ body: Readable; type: string; length?: number }> {
        const cmd = new GetObjectCommand({
            Bucket: this.files.getBucket(),
            Key: key,
        });
        const res = await this.s3.send(cmd);
        const body = res.Body as Readable | undefined;
        if (!body) throw new NotFoundException(`Missing object: ${key}`);
        return {
            body,
            type: res.ContentType || 'application/octet-stream',
            length: res.ContentLength,
        };
    }

    private async streamToBuffer(stream: Readable): Promise<Buffer> {
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
    }

    private parseContainerXml(xml: string): string {
        const obj = this.xmlParser.parse(xml) as Record<string, any>;
        const container = obj.container ?? obj['container'];
        const rootfiles = container?.rootfiles?.rootfile;
        const rootfile = Array.isArray(rootfiles) ? rootfiles[0] : rootfiles;
        const fullPath = rootfile?.attr?.['full-path'] || rootfile?.['full-path'];
        if (!fullPath || typeof fullPath !== 'string') {
            throw new BadRequestException('Invalid container.xml');
        }
        return this.normalizePath(fullPath);
    }

    private async parseOpf(
        xml: string,
        opfPath: string,
        bookId: number,
    ): Promise<{
        title: string;
        coverUrl: string;
        xhtmls: string[];
        navItems: TonoNavItem[];
        manifestItems: Array<{ id?: string; href?: string; mediaType?: string; properties?: string }>;
    }> {
        const obj = this.xmlParser.parse(xml) as Record<string, any>;
        const pkg = obj.package ?? obj['package'];
        const metadata = pkg?.metadata ?? {};
        const title =
            this.extractText(metadata?.title) ||
            this.extractText(metadata?.['dc:title']) ||
            'Untitled';

        const manifestRaw = pkg?.manifest?.item ?? [];
        const manifestItems = this.toArray(manifestRaw).map((item) => {
            const attr = item?.attr ?? {};
            return {
                id: attr.id ?? item?.id,
                href: attr.href ?? item?.href,
                mediaType: attr['media-type'] ?? item?.['media-type'],
                properties: attr.properties ?? item?.properties,
            };
        });

        const idToHref = new Map<string, string>();
        let coverUrl = '';
        let ncxPath: string | null = null;
        let navPath: string | null = null;

        for (const item of manifestItems) {
            if (!item.href) continue;
            const fullPath = this.resolvePath(opfPath, item.href);
            if (item.mediaType === 'application/xhtml+xml' && item.id) {
                idToHref.set(item.id, fullPath);
            }
            if (item.mediaType?.startsWith('image')) {
                if (item.id?.startsWith('cover')) {
                    coverUrl = this.basenameWithoutExt(fullPath);
                }
            }
            if (item.mediaType?.includes('ncx')) {
                ncxPath = fullPath;
            }
            if (item.properties?.includes('nav') && item.href?.endsWith('.xhtml')) {
                navPath = fullPath;
            }
        }

        const spineRaw = pkg?.spine?.itemref ?? [];
        const spineItems = this.toArray(spineRaw).map((item) => {
            const attr = item?.attr ?? {};
            return {
                idref: attr.idref ?? item?.idref,
                linear: attr.linear ?? item?.linear,
            };
        });

        const xhtmls: string[] = [];
        for (const item of spineItems) {
            if (item.linear === 'no') continue;
            if (item.idref && idToHref.has(item.idref)) {
                xhtmls.push(idToHref.get(item.idref)!);
            }
        }

        let navItems: TonoNavItem[] = [];
        if (ncxPath) {
            const ncxXml = await this.getObjectText(
                `books/${bookId}/epub/${ncxPath}`,
            ).catch(() => null);
            if (ncxXml) {
                navItems = this.parseNcx(ncxXml, ncxPath);
            }
        }
        if (!navItems.length && navPath) {
            const navHtml = await this.getObjectText(
                `books/${bookId}/epub/${navPath}`,
            ).catch(() => null);
            if (navHtml) {
                navItems = this.parseNavHtml(navHtml, navPath);
            }
        }

        return { title, coverUrl, xhtmls, navItems, manifestItems };
    }

    private parseNcx(xml: string, ncxPath: string): TonoNavItem[] {
        const obj = this.xmlParser.parse(xml) as Record<string, any>;
        const navMap = obj.ncx?.navMap ?? obj.navMap ?? obj?.navMap;
        if (!navMap) return [];
        const points = this.extractNavPoints(navMap.navPoint ?? navMap);
        return points
            .map((p) => {
                const src = p?.content?.attr?.src ?? p?.content?.src;
                const title = this.extractText(p?.navLabel?.text) ||
                    this.extractText(p?.navLabel?.['text']) ||
                    this.extractText(p?.navLabel) ||
                    '';
                if (!src) return null;
                return {
                    path: this.resolvePath(ncxPath, src),
                    title: title || src,
                } as TonoNavItem;
            })
            .filter(Boolean) as TonoNavItem[];
    }

    private extractNavPoints(node: any): any[] {
        if (!node) return [];
        if (Array.isArray(node)) {
            return node.flatMap((n) => this.extractNavPoints(n));
        }
        const current = [node];
        const children = node.navPoint ? this.extractNavPoints(node.navPoint) : [];
        return current.concat(children);
    }

    private parseNavHtml(html: string, navPath: string): TonoNavItem[] {
        const doc = parseHtml(html);
        const nav = doc.querySelector('nav') ?? doc;
        const links = nav.querySelectorAll('a');
        return links
            .map((a) => {
                const href = a.getAttribute('href');
                if (!href) return null;
                const title = a.text?.trim() || href;
                return {
                    path: this.resolvePath(navPath, href),
                    title,
                } as TonoNavItem;
            })
            .filter(Boolean) as TonoNavItem[];
    }

    private async parseXhtmlToWidget(
        html: string,
        currentPath: string,
        bookId: number,
    ): Promise<TonoWidget> {
        const safeHtml = this.convertSelfClosingTags(html);
        const doc = parseHtml(safeHtml);
        const cssRules = await this.collectCssRules(doc, currentPath, bookId);
        const root = doc.querySelector('html') ?? doc;
        const baseInherited: TonoStyle[] = [
            { property: 'font-size', value: '1em', priority: 0 },
        ];
        const children = await this.parseHtmlNodeChildren(
            root,
            currentPath,
            bookId,
            cssRules,
            baseInherited,
        );
        return {
            _type: 'tonoContainer',
            className: 'html',
            display: 'block',
            css: [],
            children,
        };
    }

    private async parseHtmlNodeChildren(
        node: HtmlNode,
        currentPath: string,
        bookId: number,
        cssRules: TonoStyleSheetBlock[],
        inherited: TonoStyle[],
    ): Promise<TonoWidget[]> {
        if (!('childNodes' in node)) return [];
        const widgets: TonoWidget[] = [];
        for (const child of node.childNodes) {
            widgets.push(...await this.parseHtmlNode(
                child,
                currentPath,
                bookId,
                cssRules,
                inherited,
            ));
        }
        return widgets;
    }

    private async parseHtmlNode(
        node: HtmlNode,
        currentPath: string,
        bookId: number,
        cssRules: TonoStyleSheetBlock[],
        inherited: TonoStyle[],
    ): Promise<TonoWidget[]> {
        // Text node
        if (node.nodeType === 3) {
            const text = (node as any).rawText ?? (node as any).text ?? '';
            const parentCount = (node as any).parentNode?.childNodes?.length;
            if (!text || (text.trim().length === 0 && parentCount !== 1)) return [];
            return [
                {
                    _type: 'tonoText',
                    className: 'text_node',
                    text,
                    css: this.pickInheritedStyles(inherited),
                },
            ];
        }

        if (node.nodeType !== 1) return [];
        const el = node as HTMLElement;
        const tag = (el.tagName || '').toLowerCase();
        if (['head', 'noscript', 'nav', 'aside'].includes(tag)) return [];

        const matchedCss = this.matchAll(el, cssRules, inherited);

        if (tag === 'br') {
            const parentCount = (el.parentNode as HTMLElement | null)?.childNodes
                ?.length;
            const brText = parentCount === 1 ? ' ' : '\n';
            return [
                {
                    _type: 'tonoText',
                    className: 'text_node',
                    text: brText,
                    css: this.pickInheritedStyles(matchedCss),
                },
            ];
        }

        if (tag === 'img') {
            const src = el.getAttribute('src') || '';
            if (!src) return [];
            const fullPath = this.resolvePath(currentPath, this.stripQuery(src));
            return [
                {
                    _type: 'tonoImage',
                    url: fullPath,
                    css: matchedCss,
                },
            ];
        }

        if (tag === 'svg') {
            const svgWithInline = await this.inlineSvgImages(
                el.toString(),
                currentPath,
                bookId,
            );
            return [
                {
                    _type: 'tonoContainer',
                    className: 'svg',
                    display: 'inline',
                    css: matchedCss,
                    children: [
                        {
                            _type: 'tonoSvg',
                            src: svgWithInline,
                            css: matchedCss,
                        },
                    ],
                },
            ];
        }

        if (tag === 'ruby') {
            return [this.parseRuby(el, matchedCss)];
        }

        const children = await this.parseHtmlNodeChildren(
            el,
            currentPath,
            bookId,
            cssRules,
            this.pickInheritedStyles(matchedCss),
        );
        const display = this.pickDisplay(tag, matchedCss);
        return [
            {
                _type: 'tonoContainer',
                className: tag || 'div',
                display,
                css: matchedCss,
                children,
            },
        ];
    }

    private parseRuby(el: HTMLElement, matchedCss: TonoStyle[]): TonoRuby {
        const rb = el.querySelectorAll('rb');
        const rt = el.querySelectorAll('rt');
        const texts: RubyItem[] = [];
        if (rb.length) {
            for (let i = 0; i < rb.length; i += 1) {
                texts.push({
                    text: rb[i].text ?? '',
                    ruby: rt[i]?.text ?? null,
                });
            }
        } else {
            texts.push({ text: el.text ?? '' });
        }
        return {
            _type: 'tonoRuby',
            className: 'ruby',
            css: matchedCss,
            texts,
        };
    }

    private async collectCssRules(
        doc: HTMLElement,
        currentPath: string,
        bookId: number,
    ): Promise<TonoStyleSheetBlock[]> {
        const rules: TonoStyleSheetBlock[] = [];
        const visited = new Set<string>();

        const links = doc.querySelectorAll('link');
        for (const link of links) {
            const rel = (link.getAttribute('rel') || '').toLowerCase();
            const href = link.getAttribute('href');
            if (!href || !rel.includes('stylesheet')) continue;
            const cssPath = this.resolvePath(currentPath, this.stripQuery(href));
            await this.collectCssFromPath(cssPath, bookId, rules, visited);
        }

        const styles = doc.querySelectorAll('style');
        for (const style of styles) {
            const cssText = style.text || '';
            await this.parseCssText(cssText, currentPath, bookId, rules, visited);
        }

        return rules;
    }

    private async collectCssFromPath(
        cssPath: string,
        bookId: number,
        rules: TonoStyleSheetBlock[],
        visited: Set<string>,
    ): Promise<void> {
        if (!cssPath || visited.has(cssPath)) return;
        visited.add(cssPath);
        const cssText = await this.getEpubObjectText(bookId, cssPath).catch(() => null);
        if (!cssText) return;
        await this.parseCssText(cssText, cssPath, bookId, rules, visited);
    }

    private async parseCssText(
        cssText: string,
        basePath: string,
        bookId: number,
        rules: TonoStyleSheetBlock[],
        visited: Set<string>,
    ): Promise<void> {
        const imports = this.extractImports(cssText);
        for (const url of imports) {
            const importPath = this.resolvePath(basePath, url);
            await this.collectCssFromPath(importPath, bookId, rules, visited);
        }

        const ast = css.parse(cssText, { silent: true }) as any;
        const stylesheetRules = ast?.stylesheet?.rules ?? [];
        this.collectCssRulesFromAst(stylesheetRules, rules);
    }

    private collectCssRulesFromAst(
        cssRules: any[],
        output: TonoStyleSheetBlock[],
    ): void {
        for (const rule of cssRules) {
            if (rule.type === 'rule') {
                const selectorText = (rule.selectors || []).join(',');
                if (!selectorText) continue;
                if (selectorText.includes('type*="check"')) continue;
                if (selectorText.includes(':hover')) continue;
                const properties = this.buildPropertiesFromDeclarations(
                    rule.declarations || [],
                );
                if (!Object.keys(properties).length) continue;
                output.push({
                    selector: this.parseSelector(selectorText),
                    properties,
                });
            }
            if (rule.type === 'media' && Array.isArray(rule.rules)) {
                this.collectCssRulesFromAst(rule.rules, output);
            }
        }
    }

    private buildPropertiesFromDeclarations(declarations: any[]): Record<string, string> {
        const props: Record<string, string> = {};
        for (const decl of declarations) {
            if (decl.type !== 'declaration') continue;
            const property = String(decl.property || '').trim();
            const value = String(decl.value || '').trim();
            if (!property) continue;
            if (property === 'margin') {
                Object.assign(props, this.marginSegmentation(value));
            } else if (property === 'border-width') {
                Object.assign(props, this.borderWidthSegmentation(value));
            } else if (property === 'border') {
                Object.assign(
                    props,
                    this.borderDirectionSegmentation(value, [
                        'left',
                        'top',
                        'right',
                        'bottom',
                    ]),
                );
            } else if (property === 'border-left') {
                Object.assign(props, this.borderDirectionSegmentation(value, ['left']));
            } else if (property === 'border-right') {
                Object.assign(props, this.borderDirectionSegmentation(value, ['right']));
            } else if (property === 'border-top') {
                Object.assign(props, this.borderDirectionSegmentation(value, ['top']));
            } else if (property === 'border-bottom') {
                Object.assign(props, this.borderDirectionSegmentation(value, ['bottom']));
            } else if (property === 'border-color') {
                Object.assign(props, this.borderColorSegmentation(value));
            } else if (property === 'border-style') {
                Object.assign(props, this.borderStyleSegmentation(value));
            } else if (property === 'padding') {
                Object.assign(props, this.paddingSegmentation(value));
            } else {
                props[property] = value;
            }
        }
        return props;
    }

    private extractImports(cssText: string): string[] {
        const results: string[] = [];
        const regex = /@import\s+(?:url\()?['"]?([^'"\)]+)['"]?\)?/gi;
        let match: RegExpExecArray | null = null;
        while ((match = regex.exec(cssText)) !== null) {
            if (match[1]) results.push(match[1].trim());
        }
        return results;
    }

    private parseSelector(selector: string): SelectorInfo {
        const info: SelectorInfo = { groups: [] };
        selector
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((s) => {
                const group: SelectorGroup = { parts: [], combinators: [], specificity: 0 };
                const [replaced, attributes] = this.extractAttributes(s);
                const [rawParts, combinators] = this.splitCombinators(replaced);
                const parts = rawParts.map((p) => this.restoreAttributes(p, attributes));
                group.parts = parts.map((p) => this.parseSimpleSelector(p));
                group.combinators = combinators;
                group.specificity = this.calcSpecificity(group.parts);
                info.groups.push(group);
            });
        return info;
    }

    private extractAttributes(selector: string): [string, string[]] {
        const attrPattern = /\[.*?\]/g;
        const attributes: string[] = [];
        const replaced = selector.replace(attrPattern, (match) => {
            attributes.push(match);
            return `__ATTR_${attributes.length - 1}__`;
        });
        return [replaced, attributes];
    }

    private splitCombinators(selectorPart: string): [string[], string[]] {
        const pattern = /(\s*>\s*|\s*\+\s*|\s*\~\s*|\s+)/g;
        const matches = selectorPart.matchAll(pattern);
        const parts: string[] = [];
        const combinators: string[] = [];
        let lastEnd = 0;
        for (const match of matches) {
            if (match.index === undefined) continue;
            if (match.index > lastEnd) {
                parts.push(selectorPart.substring(lastEnd, match.index));
            }
            const comb = match[0];
            const trimmed = comb.trim();
            if (trimmed === '>') combinators.push('child');
            else if (trimmed === '+') combinators.push('next-sibling');
            else if (trimmed === '~') combinators.push('general-sibling');
            else combinators.push('descendant');
            lastEnd = match.index + comb.length;
        }
        if (lastEnd < selectorPart.length) {
            parts.push(selectorPart.substring(lastEnd));
        }
        return [parts, combinators];
    }

    private restoreAttributes(part: string, attributes: string[]): string {
        return part.replace(/__ATTR_(\d+)__/g, (_, idx) => {
            const index = Number(idx);
            return attributes[index] ?? '';
        });
    }

    private parseSimpleSelector(part: string): SelectorPart {
        const components: SelectorPart = {
            isUniversal: false,
            classes: [],
            pseudos: [],
            attributes: [],
            idCount: 0,
            classCount: 0,
            attributeCount: 0,
            elementCount: 0,
        };
        if (part === '*') {
            components.isUniversal = true;
            return components;
        }
        const elementReg = /^[a-zA-Z_][\w-]*/;
        const elementMatch = part.match(elementReg);
        if (elementMatch) {
            components.element = elementMatch[0];
        }
        const idReg = /#([\w-]+)/;
        const idMatch = part.match(idReg);
        if (idMatch) {
            components.id = idMatch[1];
        }
        const classReg = /\.([\w-]+)/g;
        components.classes = Array.from(part.matchAll(classReg)).map((m) => m[1]);
        const attrReg = /\[.*?\]/g;
        components.attributes = Array.from(part.matchAll(attrReg)).map((m) => m[0]);
        const pseudoReg = /:([\w-]+)/g;
        components.pseudos = Array.from(part.matchAll(pseudoReg)).map((m) => m[1]);

        components.idCount = components.id ? 1 : 0;
        components.classCount = components.classes.length;
        components.attributeCount = components.attributes.length;
        components.elementCount = components.element ? 1 : 0;
        return components;
    }

    private calcSpecificity(parts: SelectorPart[]): number {
        return parts.reduce((acc, part) => {
            return (
                acc +
                part.idCount * 100 +
                (part.classCount + part.attributeCount) * 10 +
                part.elementCount
            );
        }, 0);
    }

    private matchAll(
        element: HTMLElement,
        css: TonoStyleSheetBlock[],
        inheritStyles?: TonoStyle[],
    ): TonoStyle[] {
        const result: TonoStyle[] = this.genInlineStyle(element);
        const inheritFontSize = inheritStyles?.find(
            (e) => e.property === 'font-size',
        )?.value;

        if (inheritStyles) {
            for (const ist of inheritStyles) {
                const existing = result.find((e) => e.property === ist.property);
                if (!existing) {
                    let priority = -100;
                    if (ist.value.includes('important')) priority = 1000;
                    if (ist.property === 'font-family') priority = -1000;
                    result.push({
                        priority,
                        value: ist.value,
                        property: ist.property,
                    });
                }
            }
        }

        for (const cssBlock of css) {
            const selector = cssBlock.selector;
            for (const group of selector.groups) {
                let isSelect = false;
                let combinator: string | null = null;
                const reversedParts = [...group.parts].reverse();
                for (let i = 0; i < reversedParts.length; i += 1) {
                    const part = reversedParts[i];
                    if (combinator) {
                        isSelect = this.combinatorMatch(element, part, combinator);
                    } else {
                        isSelect = this.selectMatch(element, part);
                    }
                    if (i < group.combinators.length) {
                        combinator = group.combinators[i];
                    }
                    if (!isSelect) break;
                }
                if (!isSelect) continue;

                for (const [k, rawValue] of Object.entries(cssBlock.properties)) {
                    const existing = result.find((e) => e.property === k);
                    let v = rawValue;
                    if (existing) {
                        if (k === 'font-size') {
                            const specificity = v.includes('!important')
                                ? 1000000000000000000
                                : group.specificity;
                            const normalized = v.replaceAll('!important', '').trim();
                            let base = inheritFontSize ?? existing.value;
                            base = base.replaceAll('!important', '').trim();
                            const resolved = this.resolveFontSize(normalized, base);
                            if (existing.priority <= specificity) {
                                const idx = result.indexOf(existing);
                                result.splice(idx, 1);
                                result.push({
                                    priority: specificity,
                                    value: resolved,
                                    property: k,
                                });
                            }
                        } else {
                            const specificity = v.includes('!important')
                                ? 1000000000000000000
                                : group.specificity;
                            v = v.trim();
                            if (existing.priority <= group.specificity) {
                                const idx = result.indexOf(existing);
                                result.splice(idx, 1);
                                result.push({
                                    priority: specificity,
                                    value: v.replaceAll('!important', '').trim(),
                                    property: k,
                                });
                            }
                        }
                    } else {
                        const specificity = v.includes('!important')
                            ? 1000000000000000000
                            : group.specificity;
                        if (k === 'font-size') {
                            const normalized = v.replaceAll('!important', '').trim();
                            const base = inheritFontSize?.replaceAll('!important', '').trim();
                            const resolved = this.resolveFontSize(normalized, base);
                            result.push({
                                priority: specificity,
                                value: resolved,
                                property: k,
                            });
                            continue;
                        }
                        result.push({
                            priority: specificity,
                            value: v.replaceAll('!important', '').trim(),
                            property: k,
                        });
                    }
                }
            }
        }
        return result;
    }

    private resolveFontSize(normalized: string, base?: string | null): string {
        let resolved: string | undefined;
        if (base) {
            if (normalized.endsWith('em')) {
                const newFontSize = parseFloat(normalized.replaceAll('em', ''));
                if (base.endsWith('em')) {
                    const oldFontSize = parseFloat(base.replaceAll('em', ''));
                    resolved = `${newFontSize * oldFontSize}em`;
                } else if (base.endsWith('px')) {
                    const oldFontSize = parseFloat(base.replaceAll('px', ''));
                    resolved = `${newFontSize * oldFontSize}px`;
                } else if (base.endsWith('%')) {
                    const oldFontSize = parseFloat(base.replaceAll('%', '')) / 100;
                    resolved = `${newFontSize * oldFontSize}em`;
                }
            } else if (normalized.endsWith('%')) {
                const newFontSize = parseFloat(normalized.replaceAll('%', '')) / 100;
                if (base.endsWith('px')) {
                    const oldFontSize = parseFloat(base.replaceAll('px', ''));
                    resolved = `${newFontSize * oldFontSize}px`;
                } else if (base.endsWith('em')) {
                    const oldFontSize = parseFloat(base.replaceAll('em', ''));
                    resolved = `${newFontSize * oldFontSize}em`;
                } else if (base.endsWith('%')) {
                    const oldFontSize = parseFloat(base.replaceAll('%', '')) / 100;
                    resolved = `${newFontSize * oldFontSize}em`;
                }
            } else if (normalized.endsWith('px')) {
                resolved = normalized;
            }
        } else if (normalized.endsWith('px')) {
            resolved = normalized;
        }
        return resolved ?? normalized;
    }

    private genInlineStyle(element: HTMLElement): TonoStyle[] {
        const style = element.getAttribute('style');
        const result: TonoStyle[] = [];

        const tag = (element.tagName || '').toLowerCase();
        if (tag === 'hr') {
            result.push({ priority: -100, value: '1px', property: 'border-top-width' });
            result.push({ priority: -100, value: '0.5em', property: 'margin-top' });
            result.push({ priority: -100, value: '0.5em', property: 'margin-bottom' });
        }
        if (tag === 'tr') {
            result.push({ priority: -100, value: 'flex', property: 'display' });
        }
        if (tag === 'table' || tag === 'tbody') {
            result.push({ priority: -100, value: 'fit-content', property: 'width' });
        }

        if (!style) return result;
        const splitedStyle = style.split(';');
        for (const ss of splitedStyle) {
            if (ss.trim() === '') continue;
            const rule = ss.split(':');
            if (rule.length < 2) continue;
            const property = rule[0].trim();
            const value = rule.slice(1).join(':').trim();
            const priority = 10000000000;
            if (property === 'margin') {
                const margins = this.marginSegmentation(value);
                for (const key of Object.keys(margins)) {
                    result.push({ priority, value: margins[key]!, property: key });
                }
            } else if (property === 'padding') {
                const paddings = this.paddingSegmentation(value);
                for (const key of Object.keys(paddings)) {
                    result.push({ priority, value: paddings[key]!, property: key });
                }
            } else if (property === 'border-width') {
                const borderWidths = this.borderWidthSegmentation(value);
                for (const key of Object.keys(borderWidths)) {
                    result.push({ priority, value: borderWidths[key]!, property: key });
                }
            } else if (property === 'border') {
                const borders = this.borderDirectionSegmentation(value, [
                    'left',
                    'right',
                    'top',
                    'bottom',
                ]);
                for (const key of Object.keys(borders)) {
                    result.push({ priority, value: borders[key]!, property: key });
                }
            } else if (property === 'border-left') {
                const borders = this.borderDirectionSegmentation(value, ['left']);
                for (const key of Object.keys(borders)) {
                    result.push({ priority, value: borders[key]!, property: key });
                }
            } else if (property === 'border-right') {
                const borders = this.borderDirectionSegmentation(value, ['right']);
                for (const key of Object.keys(borders)) {
                    result.push({ priority, value: borders[key]!, property: key });
                }
            } else if (property === 'border-top') {
                const borders = this.borderDirectionSegmentation(value, ['top']);
                for (const key of Object.keys(borders)) {
                    result.push({ priority, value: borders[key]!, property: key });
                }
            } else if (property === 'border-bottom') {
                const borders = this.borderDirectionSegmentation(value, ['bottom']);
                for (const key of Object.keys(borders)) {
                    result.push({ priority, value: borders[key]!, property: key });
                }
            } else {
                result.push({ priority, value, property });
            }

            result.push({ priority, value: rule[1].trim(), property: rule[0].trim() });
        }

        return result;
    }

    private selectMatch(element: HTMLElement, selector: SelectorPart): boolean {
        if (selector.isUniversal) return true;
        const tag = (element.tagName || '').toLowerCase();
        if (selector.element && tag !== selector.element.toLowerCase()) return false;
        if (selector.id && selector.id !== element.getAttribute('id')) return false;
        if (selector.classes.length) {
            const classAttr = (element.getAttribute('class') || '')
                .split(/\s+/)
                .filter(Boolean);
            const classSet = new Set(classAttr);
            for (const cls of selector.classes) {
                if (!classSet.has(cls)) return false;
            }
        }
        if (selector.attributes.length) {
            for (const attribute of selector.attributes) {
                if (element.getAttribute(attribute) != null) return false;
            }
        }
        return true;
    }

    private combinatorMatch(
        element: HTMLElement,
        selector: SelectorPart,
        combinator: string,
    ): boolean {
        switch (combinator) {
            case 'child':
                return this.childCombinator(element, selector);
            case 'next-sibling':
                return this.nextSiblingCombinator(element, selector);
            case 'general-sibling':
                return this.generalSiblingCombinator(element, selector);
            case 'descendant':
                return this.descendantCombinator(element, selector);
            default:
                throw new Error('未知组合器');
        }
    }

    private childCombinator(element: HTMLElement, selector: SelectorPart): boolean {
        const pn = element.parentNode as HTMLElement | null;
        if (!pn) return false;
        return this.selectMatch(pn, selector);
    }

    private nextSiblingCombinator(
        element: HTMLElement,
        selector: SelectorPart,
    ): boolean {
        const pn = (element as any).previousElementSibling as HTMLElement | null;
        if (!pn) return false;
        return this.selectMatch(pn, selector);
    }

    private generalSiblingCombinator(
        element: HTMLElement,
        selector: SelectorPart,
    ): boolean {
        let nn = (element as any).nextElementSibling as HTMLElement | null;
        while (nn) {
            if (this.selectMatch(nn, selector)) return true;
            nn = (nn as any).nextElementSibling as HTMLElement | null;
        }
        return false;
    }

    private descendantCombinator(
        element: HTMLElement,
        selector: SelectorPart,
    ): boolean {
        let pn = element.parentNode as HTMLElement | null;
        while (pn) {
            if (this.selectMatch(pn, selector)) return true;
            pn = pn.parentNode as HTMLElement | null;
        }
        return false;
    }

    private pickInheritedStyles(styles: TonoStyle[]): TonoStyle[] {
        const inheritable = new Set([
            'color',
            'text-align',
            'font-family',
            'font-size',
            'font-weight',
            'text-indent',
            'text-shadow',
            'line-height',
        ]);
        return styles.filter((s) => inheritable.has(s.property));
    }

    private pickDisplay(tag: string, styles: TonoStyle[]): string {
        let display = 'block';
        if (this.isInlineTag(tag)) display = 'inline';
        const map = this.stylesToMap(styles);
        if (map['display']?.includes('block')) display = 'block';
        if (map['display']?.includes('flex')) display = 'flex';
        return display;
    }

    private stylesToMap(styles: TonoStyle[]): Record<string, string> {
        const map: Record<string, string> = {};
        for (const style of styles) {
            map[style.property] = style.value;
        }
        return map;
    }

    private paddingSegmentation(value: string): Record<string, string> {
        value = value.trim();
        const values = value.split(/\s+/);
        const length = values.length;
        const props: Record<string, string> = {};
        let top: string, right: string, bottom: string, left: string;
        if (length === 1) {
            top = right = bottom = left = values[0];
        } else if (length === 2) {
            top = bottom = values[0];
            right = left = values[1];
        } else if (length === 3) {
            top = values[0];
            right = left = values[1];
            bottom = values[2];
        } else if (length === 4) {
            [top, right, bottom, left] = values;
        } else {
            return props;
        }
        props['padding-top'] = top;
        props['padding-right'] = right;
        props['padding-bottom'] = bottom;
        props['padding-left'] = left;
        return props;
    }

    private marginSegmentation(value: string): Record<string, string> {
        value = value.trim();
        const values = value.split(/\s+/);
        const length = values.length;
        const props: Record<string, string> = {};
        let top: string, right: string, bottom: string, left: string;
        if (length === 1) {
            top = right = bottom = left = values[0];
        } else if (length === 2) {
            top = bottom = values[0];
            right = left = values[1];
        } else if (length === 3) {
            top = values[0];
            right = left = values[1];
            bottom = values[2];
        } else if (length === 4) {
            [top, right, bottom, left] = values;
        } else {
            return props;
        }
        props['margin-top'] = top;
        props['margin-right'] = right;
        props['margin-bottom'] = bottom;
        props['margin-left'] = left;
        return props;
    }

    private borderWidthSegmentation(value: string): Record<string, string> {
        value = value.trim();
        const values = value.split(/\s+/);
        const length = values.length;
        const props: Record<string, string> = {};
        let top: string, right: string, bottom: string, left: string;
        if (length === 1) {
            top = right = bottom = left = values[0];
        } else if (length === 2) {
            top = bottom = values[0];
            right = left = values[1];
        } else if (length === 3) {
            top = values[0];
            right = left = values[1];
            bottom = values[2];
        } else if (length === 4) {
            [top, right, bottom, left] = values;
        } else {
            return props;
        }
        props['border-top-width'] = top;
        props['border-right-width'] = right;
        props['border-bottom-width'] = bottom;
        props['border-left-width'] = left;
        return props;
    }

    private borderColorSegmentation(value: string): Record<string, string> {
        value = value.trim();
        const values = value.split(/\s+/);
        const length = values.length;
        const props: Record<string, string> = {};
        let top: string, right: string, bottom: string, left: string;
        if (length === 1) {
            top = right = bottom = left = values[0];
        } else if (length === 2) {
            top = bottom = values[0];
            right = left = values[1];
        } else if (length === 3) {
            top = values[0];
            right = left = values[1];
            bottom = values[2];
        } else if (length === 4) {
            [top, right, bottom, left] = values;
        } else {
            return props;
        }
        props['border-top-color'] = top;
        props['border-right-color'] = right;
        props['border-bottom-color'] = bottom;
        props['border-left-color'] = left;
        return props;
    }

    private borderStyleSegmentation(value: string): Record<string, string> {
        const valuePart = value.replaceAll(';', '').trim();
        if (!valuePart) throw new Error('Empty value in border-style');
        const values = valuePart.split(/\s+/);
        let fourStyles: string[];
        switch (values.length) {
            case 1:
                fourStyles = Array(4).fill(values[0]);
                break;
            case 2:
                fourStyles = [values[0], values[1], values[0], values[1]];
                break;
            case 3:
                fourStyles = [values[0], values[1], values[2], values[1]];
                break;
            case 4:
                fourStyles = values.slice(0, 4);
                break;
            default:
                throw new Error(`Invalid value count: ${values.length}`);
        }
        return {
            'border-top-style': fourStyles[0],
            'border-right-style': fourStyles[1],
            'border-bottom-style': fourStyles[2],
            'border-left-style': fourStyles[3],
        };
    }

    private borderDirectionSegmentation(
        borderValue: string,
        sides: string[],
    ): Record<string, string> {
        const widthKeywords = new Set(['thin', 'medium', 'thick']);
        const styleKeywords = new Set([
            'none',
            'hidden',
            'dotted',
            'dashed',
            'solid',
            'double',
            'groove',
            'ridge',
            'inset',
            'outset',
        ]);
        const cssColorKeywords: Record<string, string> = {
            black: '#000',
            white: '#fff',
            red: '#f00',
            green: '#080',
            blue: '#00f',
            yellow: '#ff0',
            gray: '#888',
        };

        const parseColor = (colorStr: string) => {
            const lower = colorStr.toLowerCase();
            if (cssColorKeywords[lower]) return cssColorKeywords[lower];
            return colorStr;
        };

        const isWidth = (token: string) => {
            const lower = token.toLowerCase();
            if (widthKeywords.has(lower)) return true;
            return /^\d+\.?\d*(px|em|rem|pt|in|cm|mm)$/.test(lower);
        };

        const tokens = borderValue.trim().split(/\s+/).filter(Boolean);
        let width: string | undefined;
        let style: string | undefined;
        let color: string | undefined;
        for (const token of tokens) {
            if (!width && isWidth(token)) width = token;
            else if (!style && styleKeywords.has(token.toLowerCase())) style = token;
            else if (!color) color = parseColor(token);
        }

        const result: Record<string, string> = {};
        for (const side of sides) {
            if (width) result[`border-${side}-width`] = width;
            if (style) result[`border-${side}-style`] = style;
            if (color) result[`border-${side}-color`] = color;
        }
        return result;
    }

    private async inlineSvgImages(
        svgText: string,
        currentPath: string,
        bookId: number,
    ): Promise<string> {
        const doc = parseHtml(svgText);
        const images = doc.querySelectorAll('image');
        for (const img of images) {
            const href = img.getAttribute('href') || img.getAttribute('xlink:href');
            if (!href || href.startsWith('data:')) continue;
            const fullPath = this.resolvePath(currentPath, this.stripQuery(href));
            const data = await this.getEpubObjectBuffer(bookId, fullPath).catch(() => null);
            if (!data) continue;
            const contentType = mime.lookup(fullPath) || 'image/png';
            const dataUri = `data:${contentType};base64,${data.toString('base64')}`;
            img.setAttribute('href', dataUri);
            img.removeAttribute('xlink:href');
        }
        return doc.toString();
    }

    private convertSelfClosingTags(input: string): string {
        return input.replace(
            /<([A-Za-z][\w:-]*)(\s[^>]*?)?\s*\/>/g,
            (_match, tag, attributes) => {
                const attrs = attributes ?? '';
                return `<${tag}${attrs}></${tag}>`;
            },
        );
    }

    private async getEpubObjectText(bookId: number, relativePath: string): Promise<string> {
        const key = `books/${bookId}/epub/${relativePath}`;
        return this.getObjectText(key);
    }

    private async getEpubObjectBuffer(bookId: number, relativePath: string): Promise<Buffer> {
        const key = `books/${bookId}/epub/${relativePath}`;
        return this.getObjectBuffer(key);
    }

    private isInlineTag(tag: string): boolean {
        return ['a', 'span', 'ruby', 'sup', 'sub', 'b', 'i', 'em', 'strong'].includes(
            tag,
        );
    }

    private calcScrollableDeepth(
        widgetMap: Map<string, TonoWidget>,
        xhtmls: string[],
    ): number {
        let deepth = this.getDeepth(widgetMap.get(xhtmls[0])!);
        for (let i = 1; i < xhtmls.length; i += 1) {
            const w = widgetMap.get(xhtmls[i]);
            if (!w) continue;
            const d = this.getDeepth(w);
            deepth = d < deepth ? d : deepth;
        }
        return deepth;
    }

    private getDeepth(widget: TonoWidget): number {
        let deepth = 0;
        let current: TonoWidget | undefined = widget;
        while (
            current &&
            current._type === 'tonoContainer' &&
            current.children.length === 1
        ) {
            deepth += 1;
            current = current.children[0];
        }
        return deepth;
    }

    private resolvePath(basePath: string, relative: string): string {
        const normalized = this.stripQuery(relative).replace(/\\/g, '/');
        const baseDir = path.posix.dirname(basePath);
        return this.normalizePath(path.posix.join(baseDir, normalized));
    }

    private normalizePath(inputPath: string): string {
        const normalized = path.posix
            .normalize((inputPath || '').replace(/\\/g, '/'))
            .replace(/^\/+/, '');
        if (!normalized || normalized === '.') return '';
        if (normalized.startsWith('..') || normalized.includes('/..')) {
            throw new BadRequestException('Invalid path');
        }
        return normalized;
    }

    private normalizeSimpleHash(hash: string): string {
        return hash.replace(/[^a-zA-Z0-9._-]/g, '');
    }

    private stripQuery(input: string): string {
        return input.split('?')[0].split('#')[0];
    }

    private basenameWithoutExt(p: string): string {
        const clean = this.stripQuery(p);
        return path.posix.basename(clean, path.posix.extname(clean));
    }

    private extractText(node: any): string | null {
        if (node == null) return null;
        if (typeof node === 'string') return node;
        if (typeof node === 'number') return String(node);
        if (Array.isArray(node)) {
            for (const n of node) {
                const res = this.extractText(n);
                if (res) return res;
            }
        }
        if (typeof node === 'object') {
            if (typeof node.text === 'string') return node.text;
            if (typeof node['#text'] === 'string') return node['#text'];
        }
        return null;
    }

    private toArray<T>(input: T | T[]): T[] {
        if (!input) return [];
        return Array.isArray(input) ? input : [input];
    }

    private async putJson(key: string, value: unknown): Promise<void> {
        const payload = Buffer.from(JSON.stringify(value));
        await this.files.putObject(key, payload, 'application/json');
    }

    private async cleanupPrefix(prefix: string): Promise<void> {
        try {
            const keys = await this.files.listObjects(prefix);
            await this.files.deleteObjects(keys);
            await this.files.deleteRecordsByKeys(keys);
        } catch (e) {
            this.logger.warn(`Failed to cleanup prefix ${prefix}`, e as Error);
        }
    }

    private getBaseUrl(): string {
        const host = this.config.get<string>('PUBLIC_HOST_IP');
        const port = this.config.get<string>('PORT') || '3000';
        return host ? `http://${host}:${port}` : `http://localhost:${port}`;
    }

    private async ensureEngine(key: string, name: string): Promise<ReaderEngine> {
        let engine = await this.engineRepo.findOne({ where: { key } });
        if (!engine) {
            engine = this.engineRepo.create({ key, name, active: true });
            engine = await this.engineRepo.save(engine);
        }
        return engine;
    }

    private buildHash(bookId: number, engineKey: string, variant: string): string {
        const safeVariant = variant.replace(/[^a-zA-Z0-9._-]/g, '');
        if (!safeVariant || safeVariant === 'default') {
            return `book-${bookId}`;
        }
        return `book-${bookId}-${engineKey}-${safeVariant}`;
    }
}
