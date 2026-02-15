/* eslint-disable */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../modules/app/app.module';
import { BooksService } from '../modules/books/books.service';
import { FilesService } from '../modules/files/files.service';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { User } from '../entities/user.entity';
import * as fs from 'fs';
import * as path from 'path';

interface ParsedMeta {
  author: string;
  title: string;
  volume?: string;
}

function parseDirName(dirName: string): ParsedMeta | null {
  // Pattern example: [村田天].我跟妹妹，其实没有血缘关系.01 或 [犬甘あんず].心上人的妹妹.01.[台简]
  const authorMatch = dirName.match(/^\[([^\]]+)\]/);
  if (!authorMatch) return null;
  const author = authorMatch[1].trim();
  let rest = dirName.replace(authorMatch[0], '');
  if (rest.startsWith('.')) rest = rest.slice(1);
  const segs = rest.split('.').filter((s) => s.length > 0);
  if (segs.length === 0) {
    return { author, title: 'Untitled' };
  }
  // Find last purely numeric segment as volume; ignore bracketed language segments like [台简]
  let volumeIdx = -1;
  for (let i = segs.length - 1; i >= 0; i--) {
    if (/^\d+$/.test(segs[i])) {
      volumeIdx = i;
      break;
    }
  }
  let volume: string | undefined;
  let titleSegs: string[] = segs;
  if (volumeIdx !== -1) {
    volume = segs[volumeIdx];
    titleSegs = segs.slice(0, volumeIdx);
  }
  // Remove trailing bracketed language segment from title if present
  if (titleSegs.length > 0) {
    const last = titleSegs[titleSegs.length - 1];
    if (/^\[[^\]]+\]$/.test(last)) {
      titleSegs = titleSegs.slice(0, -1);
    }
  }
  const title = titleSegs.join('.').trim() || 'Untitled';
  return { author, title, volume };
}

function extractSummary(summaryPath: string): string | null {
  if (!fs.existsSync(summaryPath)) return null;
  const raw = fs.readFileSync(summaryPath, 'utf8');
  const paragraphs: string[] = [];
  const regex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(raw))) {
    const inner = m[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
    if (inner) paragraphs.push(inner);
  }
  return paragraphs.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const typoDescriptionKey = args.includes('--use-typo-key'); // 如果需要故意使用 DESCRTIPION 拼写
  const limitArgIdx = args.findIndex((a) => a.startsWith('--limit='));
  const limit =
    limitArgIdx !== -1
      ? parseInt(args[limitArgIdx].split('=')[1], 10)
      : undefined;
  const baseArgIdx = args.findIndex((a) => a.startsWith('--base='));
  const base =
    baseArgIdx !== -1
      ? args[baseArgIdx].split('=')[1]
      : path.resolve(process.cwd(), 'example');

  if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) {
    console.error('[bulk-upload] 基础目录不存在或不是目录:', base);
    process.exit(1);
  }

  console.log('[bulk-upload] 使用目录:', base);
  console.log('[bulk-upload] dry-run =', dryRun);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const booksService = app.get(BooksService);
  const filesService = app.get(FilesService);
  const config = app.get(ConfigService);
  const ds = app.get(DataSource);

  // 获取 admin 用户 (可选)
  const adminUsername = config.get<string>('ADMIN_USERNAME', 'admin');
  const userRepo = ds.getRepository(User);
  const admin = await userRepo.findOne({ where: { username: adminUsername } });
  const adminId = admin?.id;
  if (adminId) {
    console.log('[bulk-upload] 使用 admin 用户 id=', adminId);
  } else {
    console.warn('[bulk-upload] 未找到 admin 用户，将以匿名方式创建书籍');
  }

  const entries = fs
    .readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory());
  const targetEntries =
    typeof limit === 'number' ? entries.slice(0, limit) : entries;

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const dirent of targetEntries) {
    const dirName = dirent.name;
    const fullDir = path.join(base, dirName);
    const meta = parseDirName(dirName);
    if (!meta) {
      console.warn('[bulk-upload] 跳过命名不符合规范目录:', dirName);
      skipped++;
      continue;
    }
    const coverDir = path.join(fullDir, 'OEBPS', 'Images');
    let coverKey: string | undefined;
    if (fs.existsSync(coverDir) && fs.statSync(coverDir).isDirectory()) {
      const coverFile = fs
        .readdirSync(coverDir)
        .find((f) => /^cover\./i.test(f));
      if (coverFile) {
        const coverPath = path.join(coverDir, coverFile);
        const ext = path.extname(coverFile).toLowerCase();
        const contentType =
          ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : ext === '.png'
              ? 'image/png'
              : ext === '.webp'
                ? 'image/webp'
                : 'application/octet-stream';
        const buffer = fs.readFileSync(coverPath);
        const safeName = dirName.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_');
        const objectKey = `covers/${Date.now()}_${safeName}_${coverFile}`;
        if (!dryRun) {
          try {
            coverKey = await filesService.putObject(
              objectKey,
              buffer,
              contentType,
              undefined,
              adminId,
            );
          } catch (e) {
            console.error('[bulk-upload] 封面上传失败:', dirName, e);
          }
        } else {
          coverKey = objectKey; // dry-run 展示预期 key
        }
      } else {
        console.warn('[bulk-upload] 未找到封面文件 cover.* 路径:', coverDir);
      }
    } else {
      console.warn('[bulk-upload] Images 目录缺失:', coverDir);
    }

    const summaryPath = path.join(fullDir, 'OEBPS', 'Text', 'summary.xhtml');
    const summary = extractSummary(summaryPath);

    const descriptionKey = typoDescriptionKey ? 'DESCRTIPION' : 'DESCRIPTION';

    const tags: { key: string; value: string }[] = [
      { key: 'AUTHOR', value: meta.author },
      { key: 'TITLE', value: meta.title },
    ];
    if (coverKey) tags.push({ key: 'COVER', value: coverKey });
    if (summary) {
      const trimmed = summary.length > 2000 ? summary.slice(0, 2000) : summary;
      tags.push({ key: descriptionKey, value: trimmed });
    }
    if (meta.volume) {
      tags.push({ key: 'VOLUME', value: meta.volume });
    }

    console.log(`\n[bulk-upload] 处理目录: ${dirName}`);
    console.log('[bulk-upload] 解析作者:', meta.author);
    console.log('[bulk-upload] 解析标题:', meta.title);
    if (meta.volume) console.log('[bulk-upload] 卷号:', meta.volume);
    if (coverKey) console.log('[bulk-upload] 封面对象键:', coverKey);
    if (summary) console.log('[bulk-upload] 摘要长度:', summary.length);
    console.log(
      '[bulk-upload] Tags:',
      tags.map((t) => `${t.key}=${t.value.substring(0, 40)}`),
    );

    if (dryRun) {
      skipped++;
      continue;
    }
    try {
      await booksService.create({ tags }, adminId);
      success++;
    } catch (err) {
      console.error('[bulk-upload] 创建书籍失败:', dirName, err);
      failed++;
    }
  }

  console.log('\n[bulk-upload] 总结:');
  console.log('[bulk-upload] 成功创建:', success);
  console.log('[bulk-upload] 跳过/仅 dry-run:', skipped);
  console.log('[bulk-upload] 失败:', failed);

  await app.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[bulk-upload] 脚本异常退出', err);
  process.exit(1);
});
