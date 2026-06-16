import { dialog, shell } from "electron";
import fs from "fs/promises";
import path from "path";
import { getHistory, getHistoryDates, getSetting, removeHistory, setSetting } from "./store";

export function listHistory(date?: string) {
  return getHistory(date);
}

export function listHistoryDates() {
  return getHistoryDates();
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
