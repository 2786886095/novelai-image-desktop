import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import JSZip from 'jszip';
import sharp from 'sharp';
import type { ReferenceState, ReferenceRecord } from '../../src/artist-comparison/reference-types';
import { normalizeReferenceTag } from '../../src/artist-comparison/reference-types';
import { toLocalMediaUrl } from '../ipc/local-media-protocol';

const MAX_BYTES = 512 * 1024 * 1024;
const digest = (data: Buffer) => crypto.createHash('sha256').update(data).digest('hex');
function atomic(file: string, data: Buffer | string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  try { fs.writeFileSync(temp, data); fs.renameSync(temp, file); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
/** Separate portable archive: no prompts, credentials, projects or AI images. */
export async function exportReferenceBackup(root: string, state: ReferenceState, output: string) {
  const zip = new JSZip();
  const records: Record<string, ReferenceRecord & { asset?: string }> = {};
  let total = 0;
  const assetByFile = new Map<string, string>();
  for (const [tag, record] of Object.entries(state.records)) {
    const copy = structuredClone(record) as ReferenceRecord & { asset?: string };
    if (record.cover?.filePath) {
      const file = fs.realpathSync(record.cover.filePath);
      if (path.dirname(file) !== fs.realpathSync(path.join(root, 'covers'))) throw Error('原作缓存路径不合法');
      let asset = assetByFile.get(file);
      if (!asset) {
        const bytes = fs.readFileSync(file);
        total += bytes.length;
        if (total > MAX_BYTES) throw Error('原作备份超过 512 MiB 的单文件保护限制，原作库未改动');
        asset = `covers/${digest(bytes)}.jpg`;
        zip.file(asset, bytes);
        assetByFile.set(file, asset);
      }
      copy.asset = asset;
      delete copy.cover!.filePath;
      copy.cover!.imageUrl = '';
      copy.cover!.source = record.cover.source === 'local' ? 'local' : 'danbooru';
      if (copy.cover!.source === 'local') {
        // A local upload has no Danbooru identity or network attribution.
        copy.cover!.postId = 0;
        copy.cover!.sourceUrl = '';
        copy.cover!.postUrl = '';
      }
    }
    records[tag] = copy;
  }
  zip.file('references.json', JSON.stringify({ version: 1, records }));
  const stream = zip.generateNodeStream({ streamFiles: true, compression: 'STORE' });
  const temp = `${output}.${crypto.randomUUID()}.tmp`;
  try {
    const { pipeline } = await import('node:stream/promises');
    await pipeline(stream, fs.createWriteStream(temp));
    fs.renameSync(temp, output);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}

/** Merge without replacing any existing global artist record. Queue remains local. */
export async function importReferenceBackup(root: string, stateFile: string, current: ReferenceState, input: string) {
  if (current.running || current.queue.some(item => item.status === 'running')) throw Error('请先暂停原作获取并等待当前项完成，再导入备份');
  if (fs.statSync(input).size > MAX_BYTES) throw Error('原作备份文件超过 512 MiB');
  const zip = await JSZip.loadAsync(fs.readFileSync(input));
  const meta = zip.file('references.json');
  if (!meta || (meta as any)._data?.uncompressedSize > 16 * 1024 * 1024) throw Error('原作备份清单无效或过大');
  const raw = JSON.parse(await meta.async('string'));
  if (raw?.version !== 1 || !raw.records || Array.isArray(raw.records) || typeof raw.records !== 'object') throw Error('不支持的原作备份格式');
  const next = structuredClone(current);
  let total = 0, added = 0;
  const staged: Array<{ file: string; bytes: Buffer }> = [];
  for (const [tag, unknownRecord] of Object.entries(raw.records)) {
    if (['__proto__', 'constructor', 'prototype'].includes(tag) || !tag || tag.length > 160 || normalizeReferenceTag(tag) !== tag || /[,，\r\n]/.test(tag)) throw Error('原作备份中存在无效画师标识');
    if (Object.prototype.hasOwnProperty.call(next.records, tag)) continue;
    const record = unknownRecord as ReferenceRecord & { asset?: string };
    if (!record || typeof record !== 'object' || record.tag !== tag) throw Error('原作记录无效');
    const clean: ReferenceRecord = { tag };
    if (typeof record.artistName === 'string' && record.artistName.length <= 160) clean.artistName = record.artistName;
    if (Number.isSafeInteger(record.artistId) && record.artistId! > 0) clean.artistId = record.artistId;
    if (Number.isSafeInteger(record.postCount) && record.postCount! >= 0) clean.postCount = record.postCount;
    if (typeof record.checkedAt === 'number' && Number.isFinite(record.checkedAt)) clean.checkedAt = record.checkedAt;
    if (record.cover) {
      const cover = record.cover;
      const sourceKind = cover.source === 'local' ? 'local' : 'danbooru';
      if (!Number.isSafeInteger(cover.postId) || (sourceKind === 'local' ? cover.postId !== 0 : cover.postId <= 0) || !/^covers\/[a-f0-9]{64}\.jpg$/.test(record.asset ?? '')) throw Error('原作图片清单无效');
      let sourceUrl = '';
      if (sourceKind === 'danbooru') {
        const source = new URL(cover.sourceUrl);
        if (source.protocol !== 'https:' || source.username || source.password || !(source.hostname === 'donmai.us' || source.hostname.endsWith('.donmai.us'))) throw Error('原作来源地址无效');
        sourceUrl = source.toString();
      } else if (cover.sourceUrl || cover.postUrl) {
        throw Error('本地原作不应包含网络来源地址');
      }
      const asset = zip.file(record.asset!);
      const size = (asset as any)?._data?.uncompressedSize;
      if (!asset || !Number.isFinite(size) || size > 8 * 1024 * 1024) throw Error('原作图片缺失或过大');
      total += size;
      if (total > MAX_BYTES) throw Error('原作图片解压后超过 512 MiB');
      const bytes = await asset.async('nodebuffer');
      if (`covers/${digest(bytes)}.jpg` !== record.asset) throw Error('原作图片校验失败');
      const processed = await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 960, height: 960, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer({ resolveWithObject: true });
      const file = path.join(root, 'covers', `${digest(processed.data)}.jpg`);
      staged.push({ file, bytes: processed.data });
      clean.cover = { postId: cover.postId, source: sourceKind, postUrl: sourceKind === 'danbooru' ? `https://danbooru.donmai.us/posts/${cover.postId}` : '', sourceUrl, filePath: file, imageUrl: toLocalMediaUrl(file), width: processed.info.width, height: processed.info.height, savedAt: Date.now() };
    }
    Object.defineProperty(next.records, tag, { value: clean, enumerable: true, writable: true, configurable: true });
    added++;
  }
  for (const { file, bytes } of staged) if (!fs.existsSync(file)) atomic(file, bytes);
  next.running = false; next.paused = true;
  atomic(stateFile, JSON.stringify(next));
  return added;
}
