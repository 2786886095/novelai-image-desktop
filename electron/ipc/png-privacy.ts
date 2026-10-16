import { PNG } from 'pngjs';
import { inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const TEXT = new Set(['tEXt', 'iTXt', 'zTXt', 'eXIf']);
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_PIXELS = 64 * 1024 * 1024;
const CRC_TABLE = Array.from({length: 256}, (_, n) => {
  for (let i = 0; i < 8; i++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
type Chunk = {type: string; bytes: Buffer; data: Buffer};
function clear16BitCarrier(raw: number): number {
  const high = raw >>> 8, rounded = Math.round(raw / 257), base = high & 254;
  let best = 0, distance = Infinity;
  for (const level of [base, base + 2]) {
    if (level > 254 || Math.abs(level - high) > 1 || Math.abs(level - rounded) > 1) continue;
    // Intersection of high-byte == level and round(sample/257) == level;
    // retain the nearest even native sample rather than discarding 16-bit detail.
    const low = Math.ceil(Math.max(256 * level, 257 * level - 128) / 2) * 2;
    const upper = Math.floor(Math.min(256 * level + 255, 257 * level + 128) / 2) * 2;
    const candidate = Math.max(low, Math.min(upper, raw & 0xfffe));
    if (Math.abs(candidate - raw) < distance) { best = candidate; distance = Math.abs(candidate - raw); }
  }
  return best;
}
function invalid(reason: string): never {
  throw new Error(`无法安全移除 PNG 元数据：${reason}`);
}

/** Validate before decoding; malformed PNGs must not be silently exported as clean. */
function inspectPng(buffer: Buffer, allowTrailing = false) {
  if (buffer.length > MAX_BYTES || buffer.length < 45) invalid('文件大小无效');
  const chunks: Chunk[] = [];
  let offset = 8, idat = false, idatEnded = false, palette = false, transparency = false, ended = false;
  while (offset < buffer.length) {
    if (offset + 12 > buffer.length) invalid('区块截断');
    const length = buffer.readUInt32BE(offset), end = offset + length + 12;
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (length > 0x7fffffff || end > buffer.length || !/^[A-Za-z]{4}$/.test(type)) invalid('区块长度或类型无效');
    if (crc32(buffer.subarray(offset + 4, end - 4)) !== buffer.readUInt32BE(end - 4)) invalid(`${type} 校验失败`);
    if ((!chunks.length && (type !== 'IHDR' || length !== 13)) || (chunks.length && type === 'IHDR')) invalid('IHDR 无效');
    if (['acTL', 'fcTL', 'fdAT'].includes(type)) invalid('暂不支持动画 PNG 的隐私清理');
    if (!['IHDR', 'PLTE', 'IDAT', 'IEND'].includes(type) && type[0] === type[0].toUpperCase()) invalid('未知关键区块');
    if (type === 'IDAT') { if (idatEnded) invalid('IDAT 不连续'); idat = true; }
    else if (idat) idatEnded = true;
    if (type === 'PLTE') {
      if (palette || idat || !length || length % 3 || length > 768) invalid('PLTE 无效');
      palette = true;
    }
    if (type === 'tRNS') {
      if (transparency || idat || (chunks[0].data[9] === 3 && !palette)) invalid('tRNS 顺序无效');
      transparency = true;
    }
    chunks.push({type, bytes: buffer.subarray(offset, end), data: buffer.subarray(offset + 8, end - 4)});
    offset = end;
    if (type === 'IEND') { if (length || !idat || (!allowTrailing && offset !== buffer.length)) invalid('IEND 无效'); ended = true; break; }
  }
  if (!ended) invalid('缺少 IEND');
  const header = chunks[0].data;
  const width = header.readUInt32BE(0), height = header.readUInt32BE(4), depth = header[8], color = header[9];
  const validDepths: Record<number, number[]> = {0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16]};
  if (!width || !height || width > 0x7fffffff || height > 0x7fffffff || width * height > MAX_PIXELS ||
      !validDepths[color]?.includes(depth) || header[10] || header[11] || header[12] > 1) invalid('尺寸或编码超出安全范围');
  const plte = chunks.find(c => c.type === 'PLTE'), trns = chunks.find(c => c.type === 'tRNS');
  if ((color === 3 && (!plte || plte.data.length / 3 > 2 ** depth)) || ([0, 4].includes(color) && plte)) invalid('调色板无效');
  if (trns && ((color === 3 && (!plte || !trns.data.length || trns.data.length > plte.data.length / 3)) ||
      (color === 0 && trns.data.length !== 2) || (color === 2 && trns.data.length !== 6) || [4, 6].includes(color))) invalid('透明度区块无效');
  if (trns && color !== 3) for (let i = 0; i < trns.data.length; i += 2) {
    if (trns.data.readUInt16BE(i) >= 2 ** depth) invalid('透明度样本无效');
  }
  return {chunks, width, height, depth, color, interlace: header[12], trns};
}

/** Chunk-only operation for compositing's keep-metadata path: never edits pixels. */
export function removePngMetadataChunks(buffer: Buffer): Buffer {
  const {chunks} = inspectPng(buffer);
  if (!chunks.some(c => TEXT.has(c.type))) return buffer;
  return Buffer.concat([SIGNATURE, ...chunks.filter(c => !TEXT.has(c.type)).map(c => c.bytes)]);
}

/**
 * Strong PNG export: decode bounded static pixels, clear all known alpha/RGB
 * LSB carrier planes, and encode a fresh RGBA PNG without copying source chunks
 * or trailing bytes. This also removes streams with damaged magic/length fields.
 * Non-PNG formats fail closed; callers must explicitly convert them first.
 */
export function removePngGenerationMetadata(buffer: Buffer): Buffer {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) {
    if (buffer.length >= 4 && buffer.subarray(0, 4).equals(SIGNATURE.subarray(0, 4))) invalid('PNG 签名截断');
    invalid('仅支持 PNG；请先转换图片格式');
  }
  const info = inspectPng(buffer, true), {chunks, width, height, depth, color, trns} = info;
  const channels = ({0: 1, 2: 3, 3: 1, 4: 2, 6: 4} as Record<number, number>)[color];
  // Bound DEFLATE output even for Adam7 (pngjs's interlaced decoder is unbounded).
  const passes = info.interlace ? [[0,0,8,8], [4,0,8,8], [0,4,4,8], [2,0,4,4], [0,2,2,4], [1,0,2,2], [0,1,1,2]] : [[0,0,1,1]];
  let expected = 0;
  for (const [x,y,dx,dy] of passes) {
    const w = Math.max(0, Math.ceil((width - x) / dx)), h = Math.max(0, Math.ceil((height - y) / dy));
    if (w && h) expected += (Math.ceil(w * channels * depth / 8) + 1) * h;
  }
  const compressed = Buffer.concat(chunks.filter(c => c.type === 'IDAT').map(c => c.data));
  try {
    const inflated = inflateSync(compressed, {maxOutputLength: expected, info: true}) as unknown as
      {buffer: Buffer; engine: {bytesWritten: number}};
    if (inflated.buffer.length !== expected || inflated.engine.bytesWritten !== compressed.length) invalid('像素数据长度无效');
  } catch { invalid('像素解压失败或超出边界'); }
  // Skip optional ICC/text parsing. pngjs clears RGB for tRNS transparent pixels;
  // decode truecolour without tRNS and restore its alpha ourselves to retain RGB.
  const decodeChunks = chunks.filter(c => ['IHDR', 'PLTE', 'IDAT', 'IEND'].includes(c.type) || (color === 3 && c.type === 'tRNS'));
  let image: ReturnType<typeof PNG.sync.read>;
  try { image = PNG.sync.read(Buffer.concat([SIGNATURE, ...decodeChunks.map(c => c.bytes)]), {skipRescale: true}); }
  catch { invalid('像素解码失败'); }
  const data = image.data as Buffer | Uint16Array;
  if (data.length !== width * height * 4) invalid('像素布局无效');
  const outputDepth = depth === 16 ? 16 : 8, max = outputDepth === 16 ? 65535 : 255;
  if (depth < 8 && color !== 3) {
    for (let i = 0; i < data.length; i++) data[i] = Math.round(data[i] * 255 / (2 ** depth - 1));
  }
  if (trns && color !== 3) {
    const transparent = Array.from({length: color === 0 ? 1 : 3}, (_, i) => trns.data.readUInt16BE(i * 2));
    for (let i = 0; i < data.length; i += 4) {
      const samples = depth < 8 ? transparent.map(v => Math.round(v * 255 / (2 ** depth - 1))) : transparent;
      data[i + 3] = samples.every((sample, c) => data[i + c] === sample) ? 0 : max;
    }
  }
  let opaqueAlpha = true;
  for (let i = 3; i < data.length; i += 4) if (data[i] < max - (outputDepth === 16 ? 257 : 1)) { opaqueAlpha = false; break; }
  for (let i = 0; i < data.length; i++) {
    if (i % 4 === 3 && opaqueAlpha) data[i] = max;
    else if (outputDepth === 16) data[i] = clear16BitCarrier(data[i]);
    else data[i] &= 254;
  }
  // Decode omitted gamma/ICC, so pngjs emits only new IHDR, IDAT and IEND chunks.
  return PNG.sync.write(image, {bitDepth: outputDepth, colorType: 6, inputColorType: 6});
}
