import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import type { ArtistTagRecord } from "../../src/artist-lab";

const MAGIC = "LBART001", HEADER = 24, STRIDE = 12;
export class ArtistCatalog {
  readonly total: number;
  readonly savedAt: number;
  private readonly strings: number;
  constructor(private readonly body: Buffer) {
    if (body.length < HEADER || body.toString("ascii", 0, 8) !== MAGIC) throw new Error("Invalid catalog header");
    this.total = body.readUInt32LE(8); this.savedAt = body.readDoubleLE(12);
    this.strings = HEADER + this.total * STRIDE;
    if (!this.total || this.total > 10_000_000 || !Number.isSafeInteger(this.savedAt) || this.savedAt <= 0 || this.strings >= body.length) throw new Error("Invalid catalog size/date");
    const bytes = body.length - this.strings;
    for (let i = 0; i < this.total; i++) {
      const position = HEADER + i * STRIDE, offset = body.readUInt32LE(position + 8);
      const end = i + 1 < this.total ? body.readUInt32LE(position + STRIDE + 8) : bytes;
      if (!body.readUInt32LE(position) || (i === 0 && offset !== 0) || offset >= end || end > bytes) throw new Error("Invalid catalog record");
    }
  }
  row(index: number): ArtistTagRecord {
    if (!Number.isInteger(index) || index < 0 || index >= this.total) throw new Error("Invalid catalog index");
    const position = HEADER + index * STRIDE, start = this.strings + this.body.readUInt32LE(position + 8);
    const end = index + 1 < this.total ? this.strings + this.body.readUInt32LE(position + STRIDE + 8) : this.body.length;
    return { id: this.body.readUInt32LE(position), postCount: this.body.readUInt32LE(position + 4), name: this.body.toString("utf8", start, end), deprecated: false };
  }
}

export function encodeArtistCatalog(rows: ArtistTagRecord[], savedAt: number): Buffer {
  if (!Number.isSafeInteger(savedAt) || savedAt <= 0) throw new Error("Invalid catalog date");
  const ids = new Set<number>(), names = new Set<string>();
  const sorted = [...rows].sort((a,b) => b.postCount-a.postCount || a.id-b.id);
  const unique = sorted.filter(row => {
    if (!Number.isInteger(row.id) || row.id <= 0 || row.id > 0xffffffff || !Number.isInteger(row.postCount) || row.postCount < 0 || row.postCount > 0xffffffff || row.deprecated !== false || typeof row.name !== "string" || !row.name.trim()) throw new Error("Invalid artist record");
    if (ids.has(row.id)) throw new Error("Repeated artist ID");
    ids.add(row.id);
    if (names.has(row.name.trim())) return false;
    names.add(row.name.trim()); return true;
  });
  if (!unique.length) throw new Error("Empty catalog");
  const tags = unique.map(row => Buffer.from(row.name.trim(), "utf8"));
  const body = Buffer.alloc(HEADER + unique.length * STRIDE + tags.reduce((sum,tag) => sum+tag.length,0));
  body.write(MAGIC,0,"ascii"); body.writeUInt32LE(unique.length,8); body.writeDoubleLE(savedAt,12);
  let offset = 0;
  unique.forEach((row,i) => {
    const position = HEADER + i * STRIDE;
    body.writeUInt32LE(row.id,position); body.writeUInt32LE(row.postCount,position+4); body.writeUInt32LE(offset,position+8);
    tags[i].copy(body,HEADER+unique.length*STRIDE+offset); offset += tags[i].length;
  });
  return gzipSync(Buffer.concat([body,createHash("sha256").update(body).digest()]), { level: 9 });
}

export function decodeArtistCatalog(compressed: Buffer): ArtistCatalog {
  const data = gunzipSync(compressed,{ maxOutputLength: 512*1024*1024 });
  if (data.length < HEADER+32) throw new Error("Incomplete catalog");
  const body = data.subarray(0,-32);
  if (!createHash("sha256").update(body).digest().equals(data.subarray(-32))) throw new Error("Catalog checksum mismatch");
  return new ArtistCatalog(body);
}

/** Sparse partial Fisher-Yates: O(k) memory/time, no prefix bias or duplicates.
 * Rejection sampling avoids modulo bias. Same seed/catalog reproduces a selection.
 */
export function sampleArtistIndices(total: number, count: number, seed: number): number[] {
  if (!Number.isSafeInteger(total) || total < 0 || total > 0xffffffff || !Number.isSafeInteger(count) || count < 0) throw new Error("Invalid sample size");
  let state = seed >>> 0;
  const randomInt = (range: number) => {
    const ceiling = Math.floor(0x100000000/range)*range;
    for (;;) {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = Math.imul(state ^ (state >>> 15), state | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      const unsigned = (value ^ (value >>> 14)) >>> 0;
      if (unsigned < ceiling) return unsigned % range;
    }
  };
  const swaps = new Map<number,number>(), result: number[] = [];
  for (let i = 0; i < Math.min(count,total); i++) {
    const j = i + randomInt(total-i), chosen = swaps.get(j) ?? j;
    swaps.set(j, swaps.get(i) ?? i); swaps.delete(i); result.push(chosen);
  }
  return result;
}
