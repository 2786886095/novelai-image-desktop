import fs from "node:fs";
import path from "node:path";

// Match the existing image-processing limits without loading native codecs in
// every settings/store read. This checks a static WebP container, not pixels.
const MAX_WEBP_BYTES = 32 * 1024 * 1024;
const MAX_WEBP_PIXELS = 64 * 1024 * 1024;
const MAX_WEBP_CHUNKS = 256;

export type ConvertedWebpLookup =
  | { status: "match"; path: string }
  | { status: "none" }
  | { status: "unavailable" };
// Operation-local snapshots only. Index every directory once so H history rows
// in D entries cost O(H + D), rather than filtering D entries for every row.
export type ConvertedWebpDirectoryCache = Map<string, Map<string, fs.Dirent[]> | "missing" | "unavailable">;

const nameKey = (value: string) => process.platform === "win32" ? value.toLowerCase() : value;

function fileSignature(stat: fs.Stats): string {
  return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(":");
}

/** Bounded header/chunk validation; it deliberately does not claim pixel decode. */
function webpDimensions(file: string): { width: number; height: number } | null {
  let fd: number | undefined;
  try {
    const before = fs.lstatSync(file);
    if (!before.isFile() || before.isSymbolicLink() || before.size < 26 || before.size > MAX_WEBP_BYTES) return null;
    fd = fs.openSync(file, "r");
    if (fileSignature(fs.fstatSync(fd)) !== fileSignature(before)) return null;
    const read = (at: number, length: number) => {
      const bytes = Buffer.alloc(length);
      return fs.readSync(fd!, bytes, 0, length, at) === length ? bytes : null;
    };
    const riff = read(0, 12);
    if (!riff || riff.toString("ascii", 0, 4) !== "RIFF" || riff.toString("ascii", 8, 12) !== "WEBP" || riff.readUInt32LE(4) + 8 !== before.size) return null;
    let offset = 12, count = 0, images = 0;
    let canvas: { width: number; height: number } | null = null;
    let image: { width: number; height: number } | null = null;
    while (offset < before.size) {
      if (++count > MAX_WEBP_CHUNKS || offset + 8 > before.size) return null;
      const header = read(offset, 8); if (!header) return null;
      const type = header.toString("ascii", 0, 4), size = header.readUInt32LE(4);
      const start = offset + 8, end = start + size, next = end + (size & 1);
      if (end > before.size || next > before.size) return null;
      if (size & 1) { const pad = read(end, 1); if (!pad || pad[0] !== 0) return null; }
      if (type === "VP8X") {
        if (offset !== 12 || size !== 10 || canvas) return null;
        const data = read(start, 10);
        // Animation is not an unambiguous static replacement of one image.
        if (!data || data[0] & 0xc3 || data[1] || data[2] || data[3]) return null;
        canvas = { width: data.readUIntLE(4, 3) + 1, height: data.readUIntLE(7, 3) + 1 };
      } else if (type === "VP8L") {
        if (size <= 5 || ++images !== 1) return null;
        const data = read(start, 5); if (!data || data[0] !== 0x2f) return null;
        const bits = data.readUInt32LE(1); if (bits >>> 29) return null;
        image = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
      } else if (type === "VP8 ") {
        if (size <= 10 || ++images !== 1) return null;
        const data = read(start, 10);
        if (!data || data[0] & 1 || !data.subarray(3, 6).equals(Buffer.from([0x9d, 0x01, 0x2a]))) return null;
        image = { width: data.readUInt16LE(6) & 0x3fff, height: data.readUInt16LE(8) & 0x3fff };
      } else if (type === "ANIM" || type === "ANMF") return null;
      offset = next;
    }
    if (offset !== before.size || images !== 1 || !image || !image.width || !image.height || image.width * image.height > MAX_WEBP_PIXELS) return null;
    if (canvas && (canvas.width !== image.width || canvas.height !== image.height)) return null;
    const after = fs.lstatSync(file);
    if (!after.isFile() || after.isSymbolicLink() || fileSignature(after) !== fileSignature(before)) return null;
    if (fileSignature(fs.fstatSync(fd)) !== fileSignature(before)) return null;
    return image;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* retain the lookup result */ } }
  }
}

/**
 * Recover only a uniquely named, same-directory PNG/JPEG -> WebP counterpart.
 * No recursive same-stem search, fuzzy matching, image conversion or writes.
 * A present-but-invalid/ambiguous candidate is uncertain, never evidence of
 * deletion. Callers must preserve the original record in that situation.
 */
export function findConvertedWebpCounterpart(
  item: { filePath: string; width: number; height: number },
  cache: ConvertedWebpDirectoryCache = new Map(),
): ConvertedWebpLookup {
  if (!item.filePath || !path.isAbsolute(item.filePath) || ![".png", ".jpg", ".jpeg"].includes(path.extname(item.filePath).toLowerCase())) return { status: "none" };
  const directory = path.dirname(item.filePath), key = process.platform === "win32" ? path.resolve(directory).toLowerCase() : path.resolve(directory);
  if (!cache.has(key)) {
    try {
      const stems = new Map<string, fs.Dirent[]>();
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const name = entry.name, extension = path.extname(name);
        if (extension.toLowerCase() !== ".webp") continue;
        const stem = nameKey(path.basename(name, extension));
        const matches = stems.get(stem);
        if (matches) matches.push(entry); else stems.set(stem, [entry]);
      }
      cache.set(key, stems);
    }
    catch (error) { cache.set(key, (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "unavailable"); }
  }
  const entries = cache.get(key)!;
  if (entries === "missing") return { status: "none" };
  if (entries === "unavailable") return { status: "unavailable" };
  const stem = path.basename(item.filePath, path.extname(item.filePath));
  const candidates = entries.get(nameKey(stem)) ?? [];
  if (!candidates.length) return { status: "none" };
  if (candidates.length !== 1 || !candidates[0].isFile() || candidates[0].isSymbolicLink()) return { status: "unavailable" };
  if (!Number.isSafeInteger(item.width) || !Number.isSafeInteger(item.height) || item.width <= 0 || item.height <= 0 || item.width * item.height > MAX_WEBP_PIXELS) return { status: "unavailable" };
  const candidate = path.join(directory, candidates[0].name), dimensions = webpDimensions(candidate);
  if (!dimensions || dimensions.width !== item.width || dimensions.height !== item.height) return { status: "unavailable" };
  return { status: "match", path: candidate };
}
