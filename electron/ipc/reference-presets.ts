import { app, dialog } from "electron";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { pathToFileURL } from "url";
import JSZip from "jszip";
import type {
  PreciseReferenceType,
  ReferencePreset,
  ReferencePresetExportRequest,
  ReferencePresetLibrary,
  ReferencePresetOperationResult,
  ReferencePresetSaveRequest,
} from "../../src/types";

const FORMAT = "langbai-reference-presets";
const VERSION = 1;
const MAX_PRESETS = 5000;
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function rootDirectory(userDataRoot = app.getPath("userData")) {
  return path.join(userDataRoot, "reference-presets");
}

function libraryPath(userDataRoot = app.getPath("userData")) {
  return path.join(rootDirectory(userDataRoot), "library.json");
}

function cleanText(value: unknown, max = 120) {
  return String(value ?? "").trim().slice(0, max);
}

function numberIn(value: unknown, fallback: number, min = 0, max = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function cleanExtension(value: unknown) {
  const raw = String(value ?? "").toLowerCase();
  const extension = raw.startsWith(".") ? raw : `.${raw}`;
  return SUPPORTED_EXTENSIONS.has(extension) ? extension : ".png";
}

function publicPreset(preset: Omit<ReferencePreset, "fileUrl">): ReferencePreset {
  return { ...preset, fileUrl: pathToFileURL(preset.filePath).toString() };
}

function serializablePreset(preset: ReferencePreset | Omit<ReferencePreset, "fileUrl">) {
  const { fileUrl: _fileUrl, ...stored } = preset as ReferencePreset;
  return stored;
}

function normalizePreset(raw: Record<string, unknown>, filePath: string) {
  const kind = raw.kind === "precise" ? "precise" : "vibe";
  const preciseType: PreciseReferenceType =
    raw.preciseType === "style" || raw.preciseType === "character&style"
      ? raw.preciseType
      : "character";
  const name = cleanText(raw.name);
  if (!name) return null;
  return publicPreset({
    id: cleanText(raw.id, 96) || randomUUID(),
    name,
    group: cleanText(raw.group),
    kind,
    filePath,
    createdAt: cleanText(raw.createdAt, 64) || new Date().toISOString(),
    infoExtracted: numberIn(raw.infoExtracted, 0.7),
    strength: numberIn(raw.strength, kind === "precise" ? 1 : 0.6),
    preciseType,
    fidelity: numberIn(raw.fidelity, 1),
    informationExtracted: numberIn(raw.informationExtracted, 1),
    width: Math.max(0, Math.floor(Number(raw.width) || 0)),
    height: Math.max(0, Math.floor(Number(raw.height) || 0)),
  } satisfies Omit<ReferencePreset, "fileUrl">);
}

async function fileExists(filePath: string) {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function writeLibrary(library: ReferencePresetLibrary, userDataRoot?: string) {
  const root = rootDirectory(userDataRoot);
  await fs.mkdir(root, { recursive: true });
  const payload = JSON.stringify({
    version: VERSION,
    groups: [...new Set(library.groups.map((group) => cleanText(group)).filter(Boolean))],
    presets: library.presets.map(serializablePreset),
  });
  const target = libraryPath(userDataRoot);
  const temp = `${target}.tmp`;
  await fs.writeFile(temp, payload, "utf8");
  await fs.rename(temp, target);
}

export async function listReferencePresets(
  userDataRoot?: string,
): Promise<ReferencePresetLibrary> {
  const target = libraryPath(userDataRoot);
  try {
    const parsed = JSON.parse(await fs.readFile(target, "utf8")) as {
      groups?: unknown[];
      presets?: Record<string, unknown>[];
    };
    const presets: ReferencePreset[] = [];
    for (const raw of Array.isArray(parsed.presets) ? parsed.presets : []) {
      if (!raw || typeof raw !== "object") continue;
      const storedPath = cleanText(raw.filePath, 4096);
      if (!storedPath || !(await fileExists(storedPath))) continue;
      const normalized = normalizePreset(raw, storedPath);
      if (normalized) presets.push(normalized);
      if (presets.length >= MAX_PRESETS) break;
    }
    const library = {
      groups: [...new Set((parsed.groups ?? []).map((value) => cleanText(value)).filter(Boolean))],
      presets,
    };
    if ((parsed.presets?.length ?? 0) !== presets.length) {
      await writeLibrary(library, userDataRoot);
    }
    return library;
  } catch {
    return { groups: [], presets: [] };
  }
}

export async function saveReferencePreset(
  request: ReferencePresetSaveRequest,
  userDataRoot?: string,
): Promise<ReferencePresetOperationResult> {
  const name = cleanText(request.name);
  if (!name) return { ok: false, message: "请输入预设名称。" };
  const base64 = String(request.base64 ?? "").replace(/^data:[^,]+,/, "");
  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, "base64");
  } catch {
    return { ok: false, message: "参考图片数据无效。" };
  }
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) {
    return { ok: false, message: "参考图片为空或超过 50 MB。" };
  }
  const library = await listReferencePresets(userDataRoot);
  if (library.presets.length >= MAX_PRESETS) {
    return { ok: false, message: "预设数量已达到上限。" };
  }
  const id = randomUUID();
  const root = rootDirectory(userDataRoot);
  await fs.mkdir(root, { recursive: true });
  const filePath = path.join(root, `${id}${cleanExtension(request.extension)}`);
  await fs.writeFile(filePath, bytes, { flag: "wx" });
  const preset = normalizePreset(
    {
      ...request,
      id,
      name,
      group: cleanText(request.group),
      createdAt: new Date().toISOString(),
    },
    filePath,
  );
  if (!preset) {
    await fs.rm(filePath, { force: true });
    return { ok: false, message: "预设参数无效。" };
  }
  const groups = preset.group
    ? [...new Set([...library.groups, preset.group])]
    : library.groups;
  const next = { groups, presets: [...library.presets, preset] };
  await writeLibrary(next, userDataRoot);
  return { ok: true, preset, library: next };
}

export async function readReferencePreset(
  presetId: string,
  userDataRoot?: string,
): Promise<ReferencePresetOperationResult> {
  const library = await listReferencePresets(userDataRoot);
  const preset = library.presets.find((item) => item.id === presetId);
  if (!preset) return { ok: false, message: "找不到该参考图预设。" };
  try {
    return {
      ok: true,
      preset,
      base64: (await fs.readFile(preset.filePath)).toString("base64"),
    };
  } catch {
    return { ok: false, message: "预设图片不存在，请重新导入。" };
  }
}

export async function deleteReferencePreset(
  presetId: string,
  userDataRoot?: string,
): Promise<ReferencePresetOperationResult> {
  const library = await listReferencePresets(userDataRoot);
  const preset = library.presets.find((item) => item.id === presetId);
  if (!preset) return { ok: true, library };
  const root = path.resolve(rootDirectory(userDataRoot));
  const candidate = path.resolve(preset.filePath);
  if (path.dirname(candidate) === root) await fs.rm(candidate, { force: true });
  const next = {
    groups: library.groups,
    presets: library.presets.filter((item) => item.id !== presetId),
  };
  await writeLibrary(next, userDataRoot);
  return { ok: true, library: next };
}

export async function createReferencePresetGroup(
  value: string,
  userDataRoot?: string,
): Promise<ReferencePresetOperationResult> {
  const name = cleanText(value);
  if (!name) return { ok: false, message: "请输入分组名称。" };
  const library = await listReferencePresets(userDataRoot);
  const next = { ...library, groups: [...new Set([...library.groups, name])] };
  await writeLibrary(next, userDataRoot);
  return { ok: true, library: next };
}

export async function exportReferencePresets(
  request: ReferencePresetExportRequest = {},
  userDataRoot?: string,
): Promise<ReferencePresetOperationResult> {
  const library = await listReferencePresets(userDataRoot);
  const presets = request.presetId
    ? library.presets.filter((item) => item.id === request.presetId)
    : request.group !== undefined
      ? library.presets.filter((item) => item.group === request.group)
      : library.presets;
  if (!presets.length) return { ok: false, message: "没有可导出的预设。" };
  const result = await dialog.showSaveDialog({
    title: "导出参考图预设",
    defaultPath: `${request.presetId ? presets[0].name : request.group || "reference-presets"}.nairp`,
    filters: [{ name: "Langbai 参考图预设", extensions: ["nairp"] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, message: "已取消导出。" };
  const zip = new JSZip();
  const manifestPresets: Record<string, unknown>[] = [];
  for (let index = 0; index < presets.length; index++) {
    const preset = presets[index];
    const extension = cleanExtension(path.extname(preset.filePath));
    const asset = `images/${index + 1}${extension}`;
    const bytes = await fs.readFile(preset.filePath);
    zip.file(asset, bytes);
    manifestPresets.push({
      ...serializablePreset(preset),
      filePath: "",
      asset,
    });
  }
  zip.file(
    "manifest.json",
    JSON.stringify({
      format: FORMAT,
      version: VERSION,
      groups: library.groups,
      presets: manifestPresets,
    }),
  );
  await fs.writeFile(
    result.filePath,
    await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
  );
  return { ok: true, path: result.filePath, count: presets.length };
}

export async function importReferencePresets(
  userDataRoot?: string,
): Promise<ReferencePresetOperationResult> {
  const result = await dialog.showOpenDialog({
    title: "导入参考图预设",
    properties: ["openFile"],
    filters: [{ name: "Langbai 参考图预设", extensions: ["nairp", "zip"] }],
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, message: "已取消导入。" };
  try {
    const zip = await JSZip.loadAsync(await fs.readFile(result.filePaths[0]));
    const manifestEntry = zip.file("manifest.json");
    if (!manifestEntry) throw new Error("Missing manifest");
    const manifest = JSON.parse(await manifestEntry.async("string")) as {
      format?: string;
      version?: number;
      groups?: unknown[];
      presets?: Record<string, unknown>[];
    };
    if (manifest.format !== FORMAT || Number(manifest.version) !== VERSION) {
      throw new Error("Unsupported format");
    }
    const library = await listReferencePresets(userDataRoot);
    const imported: ReferencePreset[] = [];
    for (const raw of (manifest.presets ?? []).slice(0, MAX_PRESETS - library.presets.length)) {
      const asset = cleanText(raw.asset, 512).replace(/\\/g, "/");
      if (!/^images\/[a-zA-Z0-9._-]+$/.test(asset) || asset.includes("..")) continue;
      const entry = zip.file(asset);
      if (!entry) continue;
      const bytes = await entry.async("nodebuffer");
      if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) continue;
      const id = randomUUID();
      const root = rootDirectory(userDataRoot);
      await fs.mkdir(root, { recursive: true });
      const filePath = path.join(root, `${id}${cleanExtension(path.extname(asset))}`);
      await fs.writeFile(filePath, bytes, { flag: "wx" });
      const preset = normalizePreset({ ...raw, id }, filePath);
      if (preset) imported.push(preset);
      else await fs.rm(filePath, { force: true });
    }
    const groups = [...new Set([
      ...library.groups,
      ...(manifest.groups ?? []).map((value) => cleanText(value)).filter(Boolean),
      ...imported.map((preset) => preset.group).filter(Boolean),
    ])];
    const next = { groups, presets: [...library.presets, ...imported] };
    await writeLibrary(next, userDataRoot);
    return { ok: true, count: imported.length, library: next };
  } catch {
    return { ok: false, message: "预设文件无效或已损坏，导入失败。" };
  }
}
