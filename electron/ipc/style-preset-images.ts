import { app, dialog } from "electron";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { pathToFileURL } from "url";
import type { StylePromptPreviewImage } from "../../src/types";

const MAX_PREVIEW_IMAGES = 3;
const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function safePresetId(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 96);
}

export function stylePromptPreviewDirectory(
  presetId: string,
  userDataRoot = app.getPath("userData"),
) {
  const safeId = safePresetId(presetId);
  if (!safeId) throw new Error("Invalid style preset id.");
  return path.join(userDataRoot, "style-prompt-previews", safeId);
}

export function copyStylePromptPreviewImages(
  sourcePaths: string[],
  presetId: string,
  availableSlots: number,
  userDataRoot = app.getPath("userData"),
): StylePromptPreviewImage[] {
  const count = Math.max(0, Math.min(MAX_PREVIEW_IMAGES, Math.floor(availableSlots)));
  if (count === 0) return [];
  const directory = stylePromptPreviewDirectory(presetId, userDataRoot);
  fs.mkdirSync(directory, { recursive: true });
  const copied: StylePromptPreviewImage[] = [];
  for (const sourcePath of sourcePaths.slice(0, count)) {
    const extension = path.extname(sourcePath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension) || !fs.existsSync(sourcePath)) continue;
    const id = randomUUID();
    const filePath = path.join(directory, `${id}${extension}`);
    fs.copyFileSync(sourcePath, filePath, fs.constants.COPYFILE_EXCL);
    copied.push({
      id,
      name: path.basename(sourcePath),
      filePath,
      fileUrl: pathToFileURL(filePath).toString(),
      createdAt: new Date().toISOString(),
    });
  }
  return copied;
}

export async function importStylePromptPresetImages(
  presetId: string,
  availableSlots: number,
  dialogTitle = "Images",
) {
  const count = Math.max(0, Math.min(MAX_PREVIEW_IMAGES, Math.floor(availableSlots)));
  if (count === 0) return [];
  const result = await dialog.showOpenDialog({
    title: dialogTitle,
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: dialogTitle, extensions: ["png", "jpg", "jpeg", "webp"] },
    ],
  });
  if (result.canceled) return [];
  return copyStylePromptPreviewImages(result.filePaths, presetId, count);
}

export function deleteStylePromptPresetImage(presetId: string, imageId: string) {
  const safeImageId = imageId.trim().replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeImageId) return { ok: false };
  const directory = stylePromptPreviewDirectory(presetId);
  if (!fs.existsSync(directory)) return { ok: true };
  for (const name of fs.readdirSync(directory)) {
    if (path.parse(name).name !== safeImageId) continue;
    fs.rmSync(path.join(directory, name), { force: true });
  }
  return { ok: true };
}

export function deleteStylePromptPresetImages(presetId: string) {
  const directory = stylePromptPreviewDirectory(presetId);
  fs.rmSync(directory, { recursive: true, force: true });
  return { ok: true };
}
