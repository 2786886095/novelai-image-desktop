import { app, dialog } from "electron";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { toLocalMediaUrl } from "./local-media-protocol";
import type { StylePromptPreviewImage } from "../../src/types";

const MAX_PREVIEW_IMAGES = 3;
const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const MANIFEST_NAME = "manifest.json";

type StylePromptPreviewManifest = {
  version: 1;
  images: StylePromptPreviewImage[];
};

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

function manifestPath(presetId: string, userDataRoot: string) {
  return path.join(stylePromptPreviewDirectory(presetId, userDataRoot), MANIFEST_NAME);
}

function normalizeStoredImage(
  image: Partial<StylePromptPreviewImage>,
  directory: string,
): StylePromptPreviewImage | null {
  if (typeof image.id !== "string" || !image.id.trim()) return null;
  const safeId = image.id.trim().replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId) return null;
  const matchingFile = fs.existsSync(directory)
    ? fs.readdirSync(directory).find((name) => {
        const parsed = path.parse(name);
        return parsed.name === safeId && SUPPORTED_EXTENSIONS.has(parsed.ext.toLowerCase());
      })
    : undefined;
  if (!matchingFile) return null;
  const filePath = path.join(directory, matchingFile);
  return {
    id: safeId,
    name:
      typeof image.name === "string" && image.name.trim()
        ? image.name.trim()
        : matchingFile,
    filePath,
    fileUrl: toLocalMediaUrl(filePath),
    createdAt:
      typeof image.createdAt === "string" && image.createdAt
        ? image.createdAt
        : fs.statSync(filePath).mtime.toISOString(),
  };
}

function readManifest(presetId: string, userDataRoot: string) {
  try {
    const file = manifestPath(presetId, userDataRoot);
    if (!fs.existsSync(file)) return [];
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<StylePromptPreviewManifest>;
    return Array.isArray(parsed.images) ? parsed.images : [];
  } catch {
    return [];
  }
}

function writeManifest(
  presetId: string,
  images: StylePromptPreviewImage[],
  userDataRoot: string,
) {
  const directory = stylePromptPreviewDirectory(presetId, userDataRoot);
  fs.mkdirSync(directory, { recursive: true });
  const file = manifestPath(presetId, userDataRoot);
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(
    temporary,
    JSON.stringify({ version: 1, images: images.slice(0, MAX_PREVIEW_IMAGES) }, null, 2),
    "utf8",
  );
  fs.renameSync(temporary, file);
}

/**
 * Reconnect preview files with their preset metadata.  Older builds could copy
 * files successfully and later overwrite `previewImages` in settings, leaving
 * perfectly valid images orphaned on disk.  The per-preset manifest preserves
 * display names going forward; the directory scan also restores legacy files.
 */
export function reconcileStylePromptPreviewImages(
  presetId: string,
  knownImages: StylePromptPreviewImage[] = [],
  userDataRoot = app.getPath("userData"),
): StylePromptPreviewImage[] {
  const directory = stylePromptPreviewDirectory(presetId, userDataRoot);
  if (!fs.existsSync(directory)) return [];

  const candidates = [...knownImages, ...readManifest(presetId, userDataRoot)];
  const restored = new Map<string, StylePromptPreviewImage>();
  for (const candidate of candidates) {
    const normalized = normalizeStoredImage(candidate, directory);
    if (normalized && !restored.has(normalized.id)) restored.set(normalized.id, normalized);
  }
  for (const name of fs.readdirSync(directory)) {
    const parsed = path.parse(name);
    if (!SUPPORTED_EXTENSIONS.has(parsed.ext.toLowerCase()) || restored.has(parsed.name)) continue;
    const filePath = path.join(directory, name);
    const stats = fs.statSync(filePath);
    restored.set(parsed.name, {
      id: parsed.name,
      name,
      filePath,
      fileUrl: toLocalMediaUrl(filePath),
      createdAt: stats.mtime.toISOString(),
    });
  }
  const images = [...restored.values()]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .slice(0, MAX_PREVIEW_IMAGES);
  writeManifest(presetId, images, userDataRoot);
  return images;
}

export function copyStylePromptPreviewImages(
  sourcePaths: string[],
  presetId: string,
  availableSlots: number,
  userDataRoot = app.getPath("userData"),
): StylePromptPreviewImage[] {
  const directory = stylePromptPreviewDirectory(presetId, userDataRoot);
  fs.mkdirSync(directory, { recursive: true });
  const existing = reconcileStylePromptPreviewImages(presetId, [], userDataRoot);
  const count = Math.max(
    0,
    Math.min(MAX_PREVIEW_IMAGES - existing.length, Math.floor(availableSlots)),
  );
  if (count === 0) return [];
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
      fileUrl: toLocalMediaUrl(filePath),
      createdAt: new Date().toISOString(),
    });
  }
  writeManifest(presetId, [...existing, ...copied], userDataRoot);
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
  reconcileStylePromptPreviewImages(presetId);
  return { ok: true };
}

export function deleteStylePromptPresetImages(presetId: string) {
  const directory = stylePromptPreviewDirectory(presetId);
  fs.rmSync(directory, { recursive: true, force: true });
  return { ok: true };
}
