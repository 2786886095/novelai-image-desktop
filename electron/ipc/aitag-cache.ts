import { app } from "electron";
import axios from "axios";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { proxyConfig } from "./proxy";

const MAX_IMAGE_BYTES = 64 * 1024 * 1024;

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

export async function pruneAitagCache(rawDays: unknown) {
  const days = retentionDays(rawDays);
  if (days === 0) return aitagCacheStats();
  const threshold = Date.now() - days * 86_400_000;
  try {
    const entries = await fs.readdir(cacheDir(), { withFileTypes: true });
    await Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
      const file = path.join(cacheDir(), entry.name);
      const info = await fs.stat(file);
      if (info.mtimeMs < threshold) await fs.rm(file, { force: true });
    }));
  } catch { /* Empty cache. */ }
  return aitagCacheStats();
}

export async function cacheAitagImage(rawUrl: unknown, rawDays?: unknown) {
  await pruneAitagCache(rawDays);
  const url = safeImageUrl(rawUrl);
  const dir = cacheDir();
  const target = path.join(dir, cacheName(url));
  try {
    const info = await fs.stat(target);
    if (info.isFile() && info.size > 0) {
      const now = new Date();
      await fs.utimes(target, now, now);
      return pathToFileURL(target).toString();
    }
  } catch {
    // Cache miss.
  }
  await fs.mkdir(dir, { recursive: true });
  const response = await axios.get<ArrayBuffer>(url.toString(), {
    responseType: "arraybuffer",
    timeout: 30_000,
    maxContentLength: MAX_IMAGE_BYTES,
    maxBodyLength: MAX_IMAGE_BYTES,
    ...proxyConfig("update"),
  });
  const bytes = Buffer.from(response.data);
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error("Invalid AITag image response");
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, bytes);
  try {
    await fs.rename(temporary, target);
  } catch {
    await fs.rm(temporary, { force: true });
  }
  return pathToFileURL(target).toString();
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
  return { bytes: 0, files: 0 };
}
