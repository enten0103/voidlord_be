/* eslint-disable */
import * as fs from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';
import FormData from 'form-data';

interface ParsedMeta {
  author: string;
  title: string;
  volume?: string;
}

interface Tag {
  key: string;
  value: string;
}

interface LoginResponse {
  access_token: string;
}

const BASE_URL = process.env.BULK_API_BASE_URL || 'http://115.190.182.209:3000';
const ADMIN_USERNAME = process.env.BULK_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.BULK_ADMIN_PASSWORD || 'admin123';

function parseDirName(dirName: string): ParsedMeta | null {
  const authorMatch = dirName.match(/^\[([^\]]+)\]/);
  if (!authorMatch) return null;
  const author = authorMatch[1].trim();
  let rest = dirName.replace(authorMatch[0], '');
  if (rest.startsWith('.')) rest = rest.slice(1);
  const segs = rest.split('.').filter((s) => s.length > 0);
  if (segs.length === 0) {
    return { author, title: 'Untitled' };
  }
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

async function login(): Promise<string> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[login] failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as LoginResponse;
  if (!data.access_token) {
    throw new Error('[login] response missing access_token');
  }
  return data.access_token;
}

async function uploadCover(
  filePath: string,
  token: string,
  objectKeySuggestion: string,
): Promise<string> {
  // 使用 /files/upload multipart API，符合 FILES_GUIDE.md 描述
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType =
    ext === '.jpg' || ext === '.jpeg'
      ? 'image/jpeg'
      : ext === '.png'
        ? 'image/png'
        : ext === '.webp'
          ? 'image/webp'
          : 'application/octet-stream';

  const form = new FormData();
  form.append('file', buffer, path.basename(filePath));
  form.append('key', objectKeySuggestion);
  form.append('contentType', contentType);

  const res = await fetch(`${BASE_URL}/files/upload`, {
    method: 'POST',
    // 让 form-data 自行设置 Content-Type（含 boundary）
    headers: {
      Authorization: `Bearer ${token}`,
      ...form.getHeaders(),
    },
    // node-fetch v2 的类型定义对 FormData 不友好，这里断言 any
    body: form as any,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[uploadCover] failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { key: string; ok?: boolean };
  if (!data.key) {
    throw new Error('[uploadCover] response missing key');
  }
  return data.key;
}

async function createBook(tags: Tag[], token: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/books`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ tags }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[createBook] failed: ${res.status} ${text}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const typoDescriptionKey = args.includes('--use-typo-key');
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
    console.error('[bulk-upload-http] 基础目录不存在或不是目录:', base);
    process.exit(1);
  }

  console.log('[bulk-upload-http] BASE_URL =', BASE_URL);
  console.log('[bulk-upload-http] 使用目录:', base);
  console.log('[bulk-upload-http] dry-run =', dryRun);

  let token: string | null = null;
  if (!dryRun) {
    token = await login();
    console.log('[bulk-upload-http] 登录成功');
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
      console.warn('[bulk-upload-http] 跳过命名不符合规范目录:', dirName);
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
        const safeName = dirName.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_');
        const objectKey = `covers/${Date.now()}_${safeName}_${coverFile}`;
        if (!dryRun) {
          try {
            coverKey = await uploadCover(coverPath, token as string, objectKey);
          } catch (e) {
            console.error('[bulk-upload-http] 封面上传失败:', dirName, e);
          }
        } else {
          coverKey = objectKey;
        }
      } else {
        console.warn(
          '[bulk-upload-http] 未找到封面文件 cover.* 路径:',
          coverDir,
        );
      }
    } else {
      console.warn('[bulk-upload-http] Images 目录缺失:', coverDir);
    }

    const summaryPath = path.join(fullDir, 'OEBPS', 'Text', 'summary.xhtml');
    const summary = extractSummary(summaryPath);
    const descriptionKey = typoDescriptionKey ? 'DESCRTIPION' : 'DESCRIPTION';

    const tags: Tag[] = [
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

    console.log(`\n[bulk-upload-http] 处理目录: ${dirName}`);
    console.log('[bulk-upload-http] 解析作者:', meta.author);
    console.log('[bulk-upload-http] 解析标题:', meta.title);
    if (meta.volume) console.log('[bulk-upload-http] 卷号:', meta.volume);
    if (coverKey) console.log('[bulk-upload-http] 封面对象键:', coverKey);
    if (summary) console.log('[bulk-upload-http] 摘要长度:', summary.length);
    console.log(
      '[bulk-upload-http] Tags:',
      tags.map((t) => `${t.key}=${t.value.substring(0, 40)}`),
    );

    if (dryRun) {
      skipped++;
      continue;
    }

    try {
      await createBook(tags, token as string);
      success++;
    } catch (err) {
      console.error('[bulk-upload-http] 创建书籍失败:', dirName, err);
      failed++;
    }
  }

  console.log('\n[bulk-upload-http] 总结:');
  console.log('[bulk-upload-http] 成功创建:', success);
  console.log('[bulk-upload-http] 跳过/仅 dry-run:', skipped);
  console.log('[bulk-upload-http] 失败:', failed);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[bulk-upload-http] 脚本异常退出', err);
  process.exit(1);
});
