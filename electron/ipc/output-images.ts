import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { DEFAULT_PARAMS, type HistoryItem } from "../../src/types";
import { toLocalMediaUrl } from "./local-media-protocol";

/** Scan real output files, including older date folders, without following links. */
export async function scanOutputImages(root: string, known: HistoryItem[]): Promise<HistoryItem[]> {
  const byPath = new Map(known.map(item => [path.resolve(item.filePath).toLowerCase(), item]));
  const images: HistoryItem[] = [];
  async function visit(directory: string) {
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); }
    catch (error) {
      if (directory === root && (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return;
    }
    for (const entry of entries) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) { await visit(filePath); continue; }
      if (!entry.isFile() || !/\.(png|jpe?g|webp|gif|avif|tiff?|bmp)$/i.test(entry.name)) continue;
      try {
        const previous = byPath.get(path.resolve(filePath).toLowerCase());
        if (previous) {
          images.push({ ...previous, filePath, fileUrl: toLocalMediaUrl(filePath) });
          continue;
        }
        const stat = await fs.stat(filePath);
        const metadata = await sharp(filePath).metadata();
        const createdAt = stat.mtime.toISOString();
        images.push({
          id: `output-${createHash("sha256").update(path.resolve(filePath).toLowerCase()).digest("hex")}`,
          filePath, fileUrl: toLocalMediaUrl(filePath), createdAt, date: createdAt.slice(0, 10),
          params: { ...DEFAULT_PARAMS }, actualSeed: 0, model: "", feature: "local",
          width: metadata.width ?? 1, height: metadata.height ?? 1,
        });
      } catch { /* An unreadable or invalid file must not hide the remaining images. */ }
    }
  }
  await visit(root);
  return images.sort((a, b) => path.basename(a.filePath).localeCompare(path.basename(b.filePath), "zh-CN", { numeric: true, sensitivity: "base" }) || a.filePath.localeCompare(b.filePath, "zh-CN", { numeric: true }));
}
