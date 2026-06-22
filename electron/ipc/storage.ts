import { dialog, shell } from "electron";
import fs from "fs/promises";
import path from "path";
import JSZip from "jszip";
import type { HistoryItem } from "../../src/types";
import { pathToFileURL } from "url";
import {
  createHistoryGroup,
  deleteHistoryGroup,
  getHistory,
  getHistoryDates,
  getHistoryGroups,
  getSetting,
  removeHistory,
  renameHistoryGroup,
  setHistoryGroup,
  setSetting,
  updateHistoryItem,
} from "./store";

/** Sanitize a string for safe use inside a filename. */
function safeName(value: string) {
  return (value || "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_").slice(0, 80);
}

/** Render a filename from the user template + a history item. */
function formatImageName(template: string, item: HistoryItem, seq: number): string {
  const created = new Date(item.createdAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(created.getHours())}${pad(created.getMinutes())}${pad(created.getSeconds())}`;
  const tokens: Record<string, string> = {
    date: item.date,
    time,
    seq: String(seq + 1).padStart(3, "0"),
    seed: String(item.actualSeed ?? 0),
    model: safeName(item.model),
  };
  let name = (template && template.trim()) || "{date}_{seq}_{model}";
  name = name.replace(/\{(\w+)\}/g, (_m, key: string) => tokens[key] ?? "");
  name = safeName(name);
  return name || `image_${seq + 1}`;
}

export function renameGroup(id: string, name: string) {
  return renameHistoryGroup(id, name);
}

export function removeGroup(id: string) {
  return deleteHistoryGroup(id);
}

/** Bundle all images in a group into a ZIP at a user-chosen location. */
export async function exportGroup(groupId: string) {
  // Pack in ascending file-name order (1, 2, 10…) — history is stored newest-first,
  // which would otherwise zip the images in descending order.
  const items = [...getHistory(undefined, groupId || undefined)].sort((a, b) =>
    path.basename(a.filePath).localeCompare(path.basename(b.filePath), "zh-CN", { numeric: true }),
  );
  if (items.length === 0) return { ok: false, message: "该分组没有可导出的图片。" };

  const groups = getHistoryGroups();
  const groupName =
    groupId === "__ungrouped"
      ? "未分组"
      : groups.find((g) => g.id === groupId)?.name ?? "全部";
  const result = await dialog.showSaveDialog({
    title: "导出分组为 ZIP",
    defaultPath: `${safeName(groupName)}.zip`,
    filters: [{ name: "ZIP 压缩包", extensions: ["zip"] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, message: "已取消导出。" };

  const template = getSetting("imageNameTemplate");
  const zip = new JSZip();
  const used = new Set<string>();
  let added = 0;
  for (let i = 0; i < items.length; i++) {
    try {
      const buf = await fs.readFile(items[i].filePath);
      const ext = path.extname(items[i].filePath) || ".png";
      let base = formatImageName(template, items[i], i);
      let name = `${base}${ext}`;
      let dup = 1;
      while (used.has(name)) name = `${base}_${dup++}${ext}`;
      used.add(name);
      zip.file(name, buf);
      added++;
    } catch {
      // Skip images whose file was deleted/moved.
    }
  }
  if (added === 0) return { ok: false, message: "分组内的图片文件已不存在。" };

  const content = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  await fs.writeFile(result.filePath, content);
  return { ok: true, message: `已导出 ${added} 张图片。`, path: result.filePath };
}

export function listHistory(date?: string, groupId?: string) {
  return getHistory(date, groupId);
}

export function listHistoryDates() {
  return getHistoryDates();
}

export function listHistoryGroups() {
  return getHistoryGroups();
}

export function createGroup(name: string) {
  return createHistoryGroup(name);
}

export function assignHistoryGroup(id: string, groupId?: string) {
  return setHistoryGroup(id, groupId);
}

/**
 * Rename a saved image from the history panel: rename the file on disk (keeping
 * its extension, in the same folder, avoiding collisions) and update the index.
 */
export async function renameHistoryItem(id: string, rawName: string): Promise<{ ok: boolean; message?: string; item?: HistoryItem }> {
  const items = getHistory();
  const item = items.find((it) => it.id === id);
  if (!item) return { ok: false, message: "找不到该图片记录。" };
  const cleaned = safeName(rawName);
  if (!cleaned) return { ok: false, message: "文件名不能为空。" };
  const dir = path.dirname(item.filePath);
  const ext = path.extname(item.filePath) || ".png";
  let target = path.join(dir, `${cleaned}${ext}`);
  if (path.resolve(target) === path.resolve(item.filePath)) {
    return { ok: true, item }; // unchanged
  }
  // Avoid clobbering an existing file.
  let n = 1;
  while (true) {
    try {
      await fs.access(target);
      target = path.join(dir, `${cleaned}-${n++}${ext}`);
    } catch {
      break;
    }
  }
  try {
    await fs.rename(item.filePath, target);
  } catch (e: any) {
    return { ok: false, message: `重命名失败：${e?.message ?? "未知错误"}` };
  }
  const updated = updateHistoryItem(id, { filePath: target, fileUrl: pathToFileURL(target).toString() });
  return { ok: true, item: updated ?? { ...item, filePath: target, fileUrl: pathToFileURL(target).toString() } };
}

export async function deleteHistoryItem(id: string) {
  const item = removeHistory(id);
  if (item?.filePath) {
    try {
      await fs.unlink(item.filePath);
    } catch {
      // History index deletion should still succeed if the file was already removed.
    }
  }
  return { ok: true };
}

export async function openTarget(targetPath: string) {
  if (!targetPath) return { ok: false };
  try {
    const stat = await fs.stat(targetPath);
    if (stat.isDirectory()) {
      await shell.openPath(targetPath);
    } else {
      shell.showItemInFolder(targetPath);
    }
    return { ok: true };
  } catch {
    const fallback = path.dirname(targetPath);
    await shell.openPath(fallback);
    return { ok: true };
  }
}

export async function selectOutputDir() {
  const result = await dialog.showOpenDialog({
    title: "选择图片保存目录",
    properties: ["openDirectory", "createDirectory"],
    defaultPath: getSetting("outputDir"),
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const selected = result.filePaths[0];
  setSetting("outputDir", selected);
  return selected;
}
