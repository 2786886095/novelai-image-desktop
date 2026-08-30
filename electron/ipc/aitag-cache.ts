import { app } from "electron";
import axios from "axios";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { proxyConfig } from "./proxy";
import { toLocalMediaUrl } from "./local-media-protocol";

const MAX_IMAGE_BYTES = 64 * 1024 * 1024;
const AUTOMATIC_PRUNE_INTERVAL_MS = 30 * 60_000;
let lastAutomaticPruneAt = 0;
let automaticPruneInFlight: Promise<void> | null = null;
const imageRequests = new Map<string, Promise<string>>();
type GalleryImageSource = "aitag" | "danbooru" | "safebooru" | "gelbooru" | "quicktag";

function isSupportedImageBuffer(bytes: Buffer) {
  if (bytes.length < 12) return false;
  // PNG
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;
  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  // GIF
  if (bytes.subarray(0, 6).toString("ascii") === "GIF87a" || bytes.subarray(0, 6).toString("ascii") === "GIF89a") return true;
  // WebP
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return true;
  // AVIF/HEIF-family files expose their brand in the ISO BMFF ftyp box.
  return bytes.subarray(4, 8).toString("ascii") === "ftyp"
    && /^(?:avif|avis|mif1|msf1|heic|heix)$/i.test(bytes.subarray(8, 12).toString("ascii"));
}

async function isUsableCachedImage(file: string) {
  try {
    const info = await fs.stat(file);
    if (!info.isFile() || info.size < 12 || info.size > MAX_IMAGE_BYTES) return false;
    const handle = await fs.open(file, "r");
    try {
      const header = Buffer.alloc(Math.min(32, info.size));
      await handle.read(header, 0, header.length, 0);
      return isSupportedImageBuffer(header);
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
}

function cacheDir() {
  return path.join(app.getPath("userData"), "aitag-image-cache");
}

function safeImageUrl(raw: unknown) {
  if (typeof raw !== "string") throw new Error("Invalid AITag image URL");
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("Only HTTPS AITag images can be cached");
  return url;
}

function cacheName(url: URL) {
  const ext = path.extname(url.pathname).toLowerCase();
  const safeExt = /^\.(?:png|jpe?g|webp|gif|avif)$/.test(ext) ? ext : ".webp";
  return `${createHash("sha256").update(url.toString()).digest("hex")}${safeExt}`;
}

function retentionDays(raw: unknown) {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.min(3650, Math.trunc(value))) : 30;
}

async function pruneAitagCacheFiles(rawDays: unknown) {
  const days = retentionDays(rawDays);
  if (days === 0) return;
  const threshold = Date.now() - days * 86_400_000;
  try {
    const entries = await fs.readdir(cacheDir(), { withFileTypes: true });
    await Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
      const file = path.join(cacheDir(), entry.name);
      const info = await fs.stat(file);
      if (info.mtimeMs < threshold) await fs.rm(file, { force: true });
    }));
  } catch { /* Empty cache. */ }
}

async function ensureAutomaticPrune(rawDays: unknown) {
  if (Date.now() - lastAutomaticPruneAt < AUTOMATIC_PRUNE_INTERVAL_MS) return;
  if (!automaticPruneInFlight) {
    automaticPruneInFlight = pruneAitagCacheFiles(rawDays).finally(() => {
      lastAutomaticPruneAt = Date.now();
      automaticPruneInFlight = null;
    });
  }
  await automaticPruneInFlight;
}

export async function pruneAitagCache(rawDays: unknown) {
  await pruneAitagCacheFiles(rawDays);
  lastAutomaticPruneAt = Date.now();
  return aitagCacheStats();
}

function requestHeaders(source: GalleryImageSource) {
  const origin = source === "aitag"
    ? "https://aitag.win"
    : source === "danbooru"
      ? "https://danbooru.donmai.us"
      : source === "safebooru"
        ? "https://safebooru.donmai.us"
        : source === "gelbooru"
          ? "https://gelbooru.com"
          : "https://novelai.quicktagcloud.com";
  return {
    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    Referer: `${origin}/`,
    Origin: origin,
    "User-Agent": "Langbai-NovelAI-Studio/Online-Gallery-Image-Client",
  };
}

function safeGallerySource(value: unknown): GalleryImageSource {
  return value === "danbooru" || value === "safebooru" || value === "gelbooru" || value === "quicktag"
    ? value
    : "aitag";
}

async function cacheGalleryImage(rawSource: unknown, rawUrl: unknown, rawDays?: unknown, rawForce?: unknown) {
  await ensureAutomaticPrune(rawDays);
  const url = safeImageUrl(rawUrl);
  const source = safeGallerySource(rawSource);
  const dir = cacheDir();
  const target = path.join(dir, cacheName(url));
  const force = rawForce === true;
  if (!force && await isUsableCachedImage(target)) {
    const now = new Date();
    await fs.utimes(target, now, now);
    return toLocalMediaUrl(target);
  }
  // Older builds accepted any non-empty response as an image. Remove a stale
  // HTML/error body or an explicitly forced retry before downloading again.
  if (force || await fs.stat(target).then(() => true, () => false)) {
    await fs.rm(target, { force: true });
  }
  const existingRequest = imageRequests.get(target);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    await fs.mkdir(dir, { recursive: true });
    const response = await axios.get<ArrayBuffer>(url.toString(), {
      responseType: "arraybuffer",
      timeout: 30_000,
      maxContentLength: MAX_IMAGE_BYTES,
      maxBodyLength: MAX_IMAGE_BYTES,
      // Third-party galleries commonly reject renderer hotlinks. Fetch in the
      // main process with the matching source context and expose only a
      // validated cached file through the allow-listed local media protocol.
      headers: requestHeaders(source),
      ...proxyConfig("update"),
    });
    const bytes = Buffer.from(response.data);
    const contentType = String(response.headers?.["content-type"] ?? "").toLowerCase();
    if (
      !bytes.length
      || bytes.length > MAX_IMAGE_BYTES
      || (contentType && !contentType.startsWith("image/"))
      || !isSupportedImageBuffer(bytes)
    ) {
      throw new Error("Invalid AITag image response");
    }
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporary, bytes);
    try {
      await fs.rename(temporary, target);
    } catch {
      await fs.rm(temporary, { force: true });
    }
    return toLocalMediaUrl(target);
  })();
  imageRequests.set(target, request);
  try {
    return await request;
  } finally {
    imageRequests.delete(target);
  }
}

export function cacheAitagImage(rawUrl: unknown, rawDays?: unknown, rawForce?: unknown) {
  return cacheGalleryImage("aitag", rawUrl, rawDays, rawForce);
}

export function cacheOnlineGalleryImage(rawSource: unknown, rawUrl: unknown, rawDays?: unknown, rawForce?: unknown) {
  return cacheGalleryImage(rawSource, rawUrl, rawDays, rawForce);
}

export async function aitagCacheStats() {
  try {
    const entries = await fs.readdir(cacheDir(), { withFileTypes: true });
    let bytes = 0;
    let files = 0;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const info = await fs.stat(path.join(cacheDir(), entry.name));
      bytes += info.size;
      files += 1;
    }
    return { bytes, files };
  } catch {
    return { bytes: 0, files: 0 };
  }
}

export async function clearAitagCache() {
  await fs.rm(cacheDir(), { recursive: true, force: true });
  lastAutomaticPruneAt = 0;
  return { bytes: 0, files: 0 };
}
