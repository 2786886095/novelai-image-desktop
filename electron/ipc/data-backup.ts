import { app, dialog, shell } from "electron";
import crypto, { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import type {
  AppSettings,
  DataBackupCategory,
  DataBackupCategorySummary,
  DataBackupExportRequest,
  DataBackupImportRequest,
  DataBackupImportResult,
  DataBackupInspectResult,
  DataBackupOperationResult,
  DataBackupStatus,
  HistoryGroup,
  HistoryItem,
  ReferencePreset,
  StylePromptPreset,
  StylePromptPreviewImage,
  TextToolHistoryItem,
} from "../../src/types";
import { DEFAULT_AUGMENT_OPTIONS, DEFAULT_I2I_PARAMS, DEFAULT_PARAMS } from "../../src/types";
import {
  defaultSettings,
  readStore,
  writeStore,
  type PersistedData,
} from "./store";
import {
  ARTIST_FAVORITE_COLLECTIONS,
  loadArtistFavoriteLibrary,
  saveArtistFavoriteCollection,
} from "./artist-favorites";
import {
  listReferencePresets,
  saveReferencePreset,
} from "./reference-presets";
import {
  reconcileStylePromptPreviewImages,
  stylePromptPreviewDirectory,
} from "./style-preset-images";
import { toLocalMediaUrl } from "./local-media-protocol";

const FORMAT = "langbai-novelai-studio-backup";
const FORMAT_VERSION = 1;
const MAX_JSON_BYTES = 128 * 1024 * 1024;
const MAX_ASSET_BYTES = 256 * 1024 * 1024;
const ALL_CATEGORIES: DataBackupCategory[] = [
  "configuration",
  "apiCredentials",
  "artistLibrary",
  "textHistory",
  "referencePresets",
  "imageHistory",
  "promptPresets",
  "workspaceData",
];
const API_SETTING_KEYS: Array<keyof AppSettings> = [
  "apiBaseUrl",
  "imageBaseUrl",
  "allowCustomEndpoint",
  "allowCustomEndpointFallback",
  "visionApiUrl",
  "visionApiKey",
  "visionApiModel",
  "visionSystemPrompt",
  "convertApiUrl",
  "convertApiKey",
  "convertApiModel",
  "convertSystemPrompt",
  "tagServerEnabled",
  "tagServerUrl",
  "tagServerApiKey",
  "tagServerType",
  "tagServerCommand",
  "tagServerArgs",
  "tagServerTool",
  "mcpForCapsule",
  "mcpForReverse",
  "mcpForConvert",
  "translateProvider",
  "baiduAppId",
  "baiduSecret",
];
const PRESET_SETTING_KEYS: Array<keyof AppSettings> = [
  "promptTemplates",
  "stylePromptPresets",
  "stylePromptPresetGroups",
];
const DEVICE_PATH_KEYS: Array<keyof AppSettings> = ["outputDir", "logDir", "backupDir"];

type AssetReference = {
  asset: string;
  sha256: string;
  bytes: number;
  originalName: string;
};

type PortableHistoryItem = Omit<HistoryItem, "filePath" | "fileUrl"> & {
  filePath?: string;
  fileUrl?: string;
  asset?: AssetReference;
};

type PortableTextHistoryItem = TextToolHistoryItem & {
  sourceAsset?: AssetReference;
};

type PortableReferencePreset = Omit<ReferencePreset, "filePath" | "fileUrl"> & {
  asset?: AssetReference;
};

type PortableStylePreview = Omit<StylePromptPreviewImage, "filePath" | "fileUrl"> & {
  asset?: AssetReference;
};

type PortableStylePreset = Omit<StylePromptPreset, "previewImages"> & {
  previewImages: PortableStylePreview[];
};

type BackupManifest = {
  format: typeof FORMAT;
  version: typeof FORMAT_VERSION;
  createdAt: string;
  source: {
    platform: string;
    appVersion: string;
  };
  categories: DataBackupCategorySummary[];
};

type BuiltArchive = {
  bytes: Buffer;
  categories: DataBackupCategorySummary[];
};

function sanitizeCategories(categories: unknown): DataBackupCategory[] {
  if (!Array.isArray(categories)) return [...ALL_CATEGORIES];
  const selected = new Set(
    categories.filter((value): value is DataBackupCategory =>
      typeof value === "string" && ALL_CATEGORIES.includes(value as DataBackupCategory)),
  );
  return ALL_CATEGORIES.filter((category) => selected.has(category));
}

function sha256(bytes: Uint8Array) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function sha256File(filePath: string): Promise<string | null> {
  try {
    return sha256(await fs.readFile(filePath));
  } catch {
    return null;
  }
}

function safeFileName(value: string, fallback = "image") {
  const parsed = path.parse(String(value ?? ""));
  const base = parsed.name
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 150) || fallback;
  const extension = /^\.[a-zA-Z0-9]{1,8}$/.test(parsed.ext) ? parsed.ext.toLowerCase() : ".png";
  return `${base}${extension}`;
}

function safeFolderName(value: string, fallback = "Imported") {
  return String(value ?? "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 80) || fallback;
}

async function uniqueDestination(directory: string, requested: string) {
  const safe = safeFileName(requested);
  const parsed = path.parse(safe);
  let candidate = path.join(directory, safe);
  let index = 1;
  while (true) {
    try {
      await fs.access(candidate);
      candidate = path.join(directory, `${parsed.name} (${index++})${parsed.ext}`);
    } catch {
      return { filePath: candidate, renamed: index > 1 };
    }
  }
}

async function atomicWrite(filePath: string, bytes: Uint8Array) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, bytes, { flag: "wx" });
  try {
    await fs.rename(temporary, filePath);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

function cloneJson<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function pickSettings(settings: AppSettings, keys: Array<keyof AppSettings>) {
  const result: Record<string, unknown> = {};
  for (const key of keys) result[key] = cloneJson(settings[key]);
  return result;
}

function portableConfiguration(settings: AppSettings) {
  const result = cloneJson(settings) as unknown as Record<string, unknown>;
  for (const key of [...API_SETTING_KEYS, ...PRESET_SETTING_KEYS]) delete result[key];
  return result;
}

async function addAsset(
  zip: JSZip,
  filePath: string | undefined,
  assetByHash: Map<string, AssetReference>,
  includeAssets: boolean,
): Promise<AssetReference | undefined> {
  if (!includeAssets || !filePath) return undefined;
  let bytes: Buffer;
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_ASSET_BYTES) return undefined;
    bytes = await fs.readFile(filePath);
  } catch {
    return undefined;
  }
  const digest = sha256(bytes);
  const existing = assetByHash.get(digest);
  if (existing) return existing;
  const extension = path.extname(filePath).toLowerCase();
  const safeExtension = /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : ".bin";
  const reference: AssetReference = {
    asset: `assets/${digest}${safeExtension}`,
    sha256: digest,
    bytes: bytes.length,
    originalName: safeFileName(path.basename(filePath)),
  };
  // PNG/JPEG/WebP payloads are already compressed. Asking DEFLATE to process
  // hundreds of them again wastes CPU without a meaningful size reduction.
  zip.file(reference.asset, bytes, { binary: true, compression: "STORE" });
  assetByHash.set(digest, reference);
  return reference;
}

async function portableHistory(
  item: HistoryItem,
  zip: JSZip,
  assetByHash: Map<string, AssetReference>,
  includeAssets: boolean,
): Promise<PortableHistoryItem> {
  const { fileUrl: _fileUrl, ...stored } = cloneJson(item);
  return {
    ...stored,
    filePath: "",
    asset: await addAsset(zip, item.filePath, assetByHash, includeAssets),
  };
}

async function portableFavorite(
  favorite: unknown,
  zip: JSZip,
  assetByHash: Map<string, AssetReference>,
  includeAssets: boolean,
) {
  const cloned = cloneJson(favorite) as Record<string, unknown>;
  const image = cloned?.image as HistoryItem | undefined;
  if (image?.filePath) cloned.image = await portableHistory(image, zip, assetByHash, includeAssets);
  return cloned;
}

function normalizeArtistFavoriteForDesktop(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const favorite = cloneJson(value) as Record<string, unknown>;
  const nested = favorite.recipe && typeof favorite.recipe === "object"
    ? favorite.recipe as Record<string, unknown>
    : undefined;
  if (nested) {
    for (const key of [
      "id",
      "pairId",
      "variant",
      "prompt",
      "basePrompt",
      "artistPrompt",
      "artists",
      "auxiliary",
      "mutations",
      "franchiseStyles",
    ]) {
      if (favorite[key] === undefined && nested[key] !== undefined) favorite[key] = nested[key];
    }
  }

  const id = typeof favorite.id === "string" ? favorite.id.trim() : "";
  if (!id) return null;
  const prompt = String(favorite.artistPrompt ?? favorite.prompt ?? "");
  const weights = new Map<string, number>();
  const pattern = /(-?\d+(?:\.\d+)?)\s*::\s*artist\s*:\s*([^,]+?)\s*::/gi;
  for (const match of prompt.matchAll(pattern)) {
    const name = String(match[2] ?? "").trim();
    const weight = Number(match[1]);
    if (name && Number.isFinite(weight)) weights.set(name.toLowerCase().replace(/\s+/g, "_"), weight);
  }
  favorite.artists = (Array.isArray(favorite.artists) ? favorite.artists : [])
    .map((entry) => {
      if (entry && typeof entry === "object") {
        const artist = entry as Record<string, unknown>;
        const name = typeof artist.name === "string" ? artist.name.trim() : "";
        if (!name) return null;
        const rawWeight = Number(artist.weight);
        return {
          name,
          weight: Number.isFinite(rawWeight)
            ? rawWeight
            : weights.get(name.toLowerCase().replace(/\s+/g, "_")) ?? 1,
        };
      }
      const name = String(entry ?? "").trim();
      if (!name) return null;
      return {
        name,
        weight: weights.get(name.toLowerCase().replace(/\s+/g, "_")) ?? 1,
      };
    })
    .filter(Boolean);
  favorite.id = id;
  favorite.pairId = typeof favorite.pairId === "string" && favorite.pairId.trim()
    ? favorite.pairId
    : id;
  favorite.variant = favorite.variant === "mutated" ? "mutated" : "plain";
  favorite.prompt = String(favorite.prompt ?? favorite.basePrompt ?? prompt);
  favorite.basePrompt = String(favorite.basePrompt ?? favorite.prompt);
  favorite.auxiliary = Array.isArray(favorite.auxiliary) ? favorite.auxiliary : [];
  favorite.mutations = Array.isArray(favorite.mutations) ? favorite.mutations : [];
  favorite.franchiseStyles = Array.isArray(favorite.franchiseStyles) ? favorite.franchiseStyles : [];
  favorite.sequence = Number.isFinite(Number(favorite.sequence)) ? Number(favorite.sequence) : 1;
  favorite.status = ["pending", "generating", "done", "failed"].includes(String(favorite.status))
    ? favorite.status
    : "done";
  favorite.generationSeed ??= favorite.seed;
  favorite.liked = true;
  delete favorite.saving;
  return favorite;
}

function summary(category: DataBackupCategory, items = 0, bytes = 0): DataBackupCategorySummary {
  return { category, items, bytes };
}

async function buildArchive(
  requestedCategories: DataBackupCategory[],
  workspaceData?: Record<string, string>,
  options: { includeAssets?: boolean } = {},
): Promise<BuiltArchive> {
  const categories = sanitizeCategories(requestedCategories);
  const selected = new Set(categories);
  const zip = new JSZip();
  const data = readStore();
  const includeAssets = options.includeAssets !== false;
  const assetByHash = new Map<string, AssetReference>();
  const summaries: DataBackupCategorySummary[] = [];

  if (selected.has("configuration")) {
    const payload = portableConfiguration(data.settings);
    const generationParams = data.settings.lastGenerationState?.params ?? DEFAULT_PARAMS;
    zip.file("data/configuration.json", JSON.stringify(payload));
    zip.file("data/generation-params.json", JSON.stringify(generationParams));
    summaries.push(summary(
      "configuration",
      Object.keys(payload).length + Object.keys(generationParams).length,
    ));
  }

  if (selected.has("apiCredentials")) {
    const payload = {
      token: data.token ?? "",
      account: data.account ?? null,
      settings: pickSettings(data.settings, API_SETTING_KEYS),
    };
    zip.file("data/api-credentials.json", JSON.stringify(payload));
    summaries.push(summary("apiCredentials", API_SETTING_KEYS.length + (data.token ? 1 : 0)));
  }

  if (selected.has("imageHistory")) {
    const items: PortableHistoryItem[] = [];
    for (const item of data.history) {
      items.push(await portableHistory(item, zip, assetByHash, includeAssets));
    }
    zip.file("data/image-history.json", JSON.stringify({ groups: data.historyGroups, items }));
    summaries.push(summary(
      "imageHistory",
      items.length,
      items.reduce((total, item) => total + (item.asset?.bytes ?? 0), 0),
    ));
  }

  if (selected.has("textHistory")) {
    const reverse: PortableTextHistoryItem[] = [];
    for (const item of data.reverseHistory) {
      reverse.push({
        ...cloneJson(item),
        sourceImagePath: item.sourceImagePath ? "" : undefined,
        sourceAsset: await addAsset(zip, item.sourceImagePath, assetByHash, includeAssets),
      });
    }
    const payload = { convert: data.convertHistory, reverse };
    zip.file("data/text-history.json", JSON.stringify(payload));
    summaries.push(summary("textHistory", data.convertHistory.length + reverse.length));
  }

  if (selected.has("artistLibrary")) {
    const library = await loadArtistFavoriteLibrary(app.getPath("userData"));
    const collections: Record<string, unknown[]> = {};
    for (const collection of ARTIST_FAVORITE_COLLECTIONS) {
      collections[collection] = [];
      for (const favorite of library.collections[collection]) {
        collections[collection].push(await portableFavorite(favorite, zip, assetByHash, includeAssets));
      }
    }
    zip.file("data/artist-library.json", JSON.stringify({ ...library, collections }));
    summaries.push(summary(
      "artistLibrary",
      Object.values(collections).reduce((total, items) => total + items.length, 0),
    ));
  }

  if (selected.has("referencePresets")) {
    const library = await listReferencePresets(app.getPath("userData"));
    const presets: PortableReferencePreset[] = [];
    for (const preset of library.presets) {
      const { filePath: _filePath, fileUrl: _fileUrl, ...stored } = cloneJson(preset);
      presets.push({
        ...stored,
        asset: await addAsset(zip, preset.filePath, assetByHash, includeAssets),
      });
    }
    zip.file("data/reference-presets.json", JSON.stringify({ groups: library.groups, presets }));
    summaries.push(summary(
      "referencePresets",
      presets.length,
      presets.reduce((total, preset) => total + (preset.asset?.bytes ?? 0), 0),
    ));
  }

  if (selected.has("promptPresets")) {
    const styles: PortableStylePreset[] = [];
    for (const preset of data.settings.stylePromptPresets ?? []) {
      const previewImages: PortableStylePreview[] = [];
      for (const preview of preset.previewImages ?? []) {
        const { filePath: _filePath, fileUrl: _fileUrl, ...stored } = cloneJson(preview);
        previewImages.push({
          ...stored,
          asset: await addAsset(zip, preview.filePath, assetByHash, includeAssets),
        });
      }
      const { previewImages: _previews, ...storedPreset } = cloneJson(preset);
      styles.push({ ...storedPreset, previewImages });
    }
    const payload = {
      promptTemplates: data.settings.promptTemplates ?? [],
      stylePromptPresetGroups: data.settings.stylePromptPresetGroups ?? [],
      stylePromptPresets: styles,
    };
    zip.file("data/prompt-presets.json", JSON.stringify(payload));
    summaries.push(summary("promptPresets", payload.promptTemplates.length + styles.length));
  }

  if (selected.has("workspaceData")) {
    const owned = Object.fromEntries(
      Object.entries(workspaceData ?? {}).filter(([key, value]) =>
        key.startsWith("langbai.") && typeof value === "string"),
    );
    zip.file("data/workspace.json", JSON.stringify(owned));
    summaries.push(summary("workspaceData", Object.keys(owned).length));
  }

  const manifest: BackupManifest = {
    format: FORMAT,
    version: FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    source: {
      platform: process.platform,
      appVersion: app.getVersion(),
    },
    categories: summaries,
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  return {
    bytes: await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      // Level 1 is enough for JSON and avoids a prolonged main-process CPU
      // spike. Image entries above are stored as-is.
      compressionOptions: { level: 1 },
      platform: "UNIX",
    }),
    categories: summaries,
  };
}

function configuredBackupDirectory(settings = readStore().settings) {
  const configured = String(settings.backupDir ?? "").trim();
  return configured ? path.resolve(configured) : path.join(app.getPath("userData"), "backups");
}

function stampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function saveBuiltArchive(filePath: string, built: BuiltArchive) {
  await atomicWrite(filePath, built.bytes);
  return {
    ok: true,
    message: "备份已创建。",
    path: filePath,
    categories: built.categories,
  } satisfies DataBackupOperationResult;
}

async function createInternalBackup(
  prefix: "auto" | "before-import" | "manual",
  workspaceData?: Record<string, string>,
  categories = ALL_CATEGORIES,
  options: { includeAssets?: boolean } = {},
) {
  const directory = configuredBackupDirectory();
  await fs.mkdir(directory, { recursive: true });
  const built = await buildArchive(categories, workspaceData, options);
  return saveBuiltArchive(
    path.join(directory, `${prefix}-${stampForFile()}.naisbackup`),
    built,
  );
}

export async function exportDataBackup(
  request: DataBackupExportRequest,
): Promise<DataBackupOperationResult> {
  const categories = sanitizeCategories(request.categories);
  if (!categories.length) return { ok: false, message: "请至少选择一类数据。" };
  if (request.destination === "automatic") {
    return createInternalBackup("auto", request.workspaceData, categories);
  }
  if (request.destination === "internal") {
    return createInternalBackup("manual", request.workspaceData, categories);
  }
  const result = await dialog.showSaveDialog({
    title: "导出 Langbai Studio 数据",
    defaultPath: path.join(
      app.getPath("documents"),
      `Langbai-Studio-${stampForFile()}.naisbackup`,
    ),
    filters: [{ name: "Langbai Studio 备份", extensions: ["naisbackup"] }],
  });
  if (result.canceled || !result.filePath) {
    return { ok: false, cancelled: true, message: "已取消导出。" };
  }
  try {
    return await saveBuiltArchive(
      result.filePath,
      await buildArchive(categories, request.workspaceData),
    );
  } catch (error: any) {
    return { ok: false, message: `导出失败：${error?.message ?? String(error)}` };
  }
}

async function loadArchive(filePath: string) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size <= 0) throw new Error("备份文件为空。");
  const zip = await JSZip.loadAsync(await fs.readFile(filePath), {
    checkCRC32: true,
    createFolders: false,
  });
  const manifestEntry = zip.file("manifest.json");
  if (!manifestEntry) throw new Error("缺少备份清单。");
  const manifestText = await manifestEntry.async("string");
  if (Buffer.byteLength(manifestText) > MAX_JSON_BYTES) throw new Error("备份清单过大。");
  const manifest = JSON.parse(manifestText) as BackupManifest;
  if (manifest.format !== FORMAT || manifest.version !== FORMAT_VERSION) {
    throw new Error("备份格式或版本不受支持。");
  }
  return { zip, manifest };
}

async function readJsonEntry<T>(zip: JSZip, entryName: string, fallback: T): Promise<T> {
  const entry = zip.file(entryName);
  if (!entry) return fallback;
  const text = await entry.async("string");
  if (Buffer.byteLength(text) > MAX_JSON_BYTES) throw new Error(`${entryName} 过大。`);
  return JSON.parse(text) as T;
}

export async function inspectDataBackup(): Promise<DataBackupInspectResult> {
  const result = await dialog.showOpenDialog({
    title: "选择 Langbai Studio 备份",
    properties: ["openFile"],
    filters: [
      { name: "Langbai Studio 备份", extensions: ["naisbackup", "zip"] },
    ],
  });
  if (result.canceled || !result.filePaths[0]) {
    return { ok: false, cancelled: true, categories: [], message: "已取消导入。" };
  }
  try {
    const { manifest } = await loadArchive(result.filePaths[0]);
    return {
      ok: true,
      path: result.filePaths[0],
      formatVersion: manifest.version,
      createdAt: manifest.createdAt,
      sourcePlatform: manifest.source?.platform,
      appVersion: manifest.source?.appVersion,
      categories: Array.isArray(manifest.categories) ? manifest.categories : [],
      requiresConfigurationConfirmation: manifest.categories.some((item) =>
        item.category === "configuration" || item.category === "apiCredentials"),
    };
  } catch (error: any) {
    return { ok: false, categories: [], message: `无法读取备份：${error?.message ?? String(error)}` };
  }
}

function validAssetReference(value: unknown): value is AssetReference {
  if (!value || typeof value !== "object") return false;
  const ref = value as Partial<AssetReference>;
  return typeof ref.asset === "string"
    && /^assets\/[a-f0-9]{64}\.[a-z0-9]{1,8}$/.test(ref.asset)
    && !ref.asset.includes("..")
    && typeof ref.sha256 === "string"
    && /^[a-f0-9]{64}$/.test(ref.sha256)
    && Number.isFinite(ref.bytes)
    && Number(ref.bytes) > 0
    && Number(ref.bytes) <= MAX_ASSET_BYTES;
}

async function readAsset(zip: JSZip, value: unknown) {
  if (!validAssetReference(value)) return null;
  const entry = zip.file(value.asset);
  if (!entry) return null;
  const bytes = await entry.async("nodebuffer");
  if (!bytes.length || bytes.length > MAX_ASSET_BYTES || sha256(bytes) !== value.sha256) {
    throw new Error(`资源校验失败：${value.originalName || value.asset}`);
  }
  return { bytes, reference: value };
}

async function historyHashIndex(items: HistoryItem[]) {
  const index = new Map<string, HistoryItem>();
  for (const item of items) {
    const digest = await sha256File(item.filePath);
    if (digest && !index.has(digest)) index.set(digest, item);
  }
  return index;
}

function mergeGroups(existing: HistoryGroup[], incoming: HistoryGroup[]) {
  const groups = [...existing];
  const byId = new Map(groups.map((group) => [group.id, group]));
  const byName = new Map(groups.map((group) => [group.name.trim().toLocaleLowerCase(), group]));
  const idMap = new Map<string, string>();
  for (const raw of incoming) {
    if (!raw || typeof raw.name !== "string" || !raw.name.trim()) continue;
    const name = raw.name.trim().slice(0, 120);
    const matched = byName.get(name.toLocaleLowerCase());
    if (matched) {
      idMap.set(raw.id, matched.id);
      continue;
    }
    let id = typeof raw.id === "string" && raw.id && !byId.has(raw.id) ? raw.id : randomUUID();
    if (byId.has(id)) id = randomUUID();
    const group: HistoryGroup = {
      id,
      name,
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    };
    groups.push(group);
    byId.set(id, group);
    byName.set(name.toLocaleLowerCase(), group);
    idMap.set(raw.id, id);
  }
  return { groups, idMap };
}

function dateFolder(value: unknown) {
  const date = String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? date
    : new Date().toISOString().slice(0, 10);
}

function safeHistoryShape(raw: PortableHistoryItem): Omit<HistoryItem, "id" | "filePath" | "fileUrl" | "groupId"> {
  return {
    date: dateFolder(raw.date),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    params: raw.params && typeof raw.params === "object" ? raw.params : cloneJson(DEFAULT_PARAMS),
    actualSeed: Number.isFinite(Number(raw.actualSeed)) ? Number(raw.actualSeed) : 0,
    model: String(raw.model ?? "unknown"),
    width: Math.max(0, Math.trunc(Number(raw.width) || 0)),
    height: Math.max(0, Math.trunc(Number(raw.height) || 0)),
    feature: typeof raw.feature === "string" ? raw.feature : undefined,
    comicProjectId: typeof raw.comicProjectId === "string" ? raw.comicProjectId : undefined,
    comicPanelNo: Number.isFinite(Number(raw.comicPanelNo)) ? Number(raw.comicPanelNo) : undefined,
  };
}

async function restoreHistoryItem(
  zip: JSZip,
  raw: PortableHistoryItem,
  state: {
    store: PersistedData;
    outputDir: string;
    groupIdMap: Map<string, string>;
    historyByHash: Map<string, HistoryItem>;
    historyBySourceId: Map<string, HistoryItem>;
    importedIds: Set<string>;
    imported: { count: number; skipped: number; renamed: number };
  },
) {
  const asset = await readAsset(zip, raw.asset);
  if (!asset) {
    state.imported.skipped += 1;
    return null;
  }
  const duplicate = state.historyByHash.get(asset.reference.sha256);
  if (duplicate) {
    state.imported.skipped += 1;
    if (typeof raw.id === "string") state.historyBySourceId.set(raw.id, duplicate);
    return duplicate;
  }
  const groupId = raw.groupId ? state.groupIdMap.get(raw.groupId) : undefined;
  const group = groupId ? state.store.historyGroups.find((item) => item.id === groupId) : undefined;
  const folder = group
    ? path.join(state.outputDir, dateFolder(raw.date), safeFolderName(group.name, "group"))
    : path.join(state.outputDir, dateFolder(raw.date));
  await fs.mkdir(folder, { recursive: true });
  const destination = await uniqueDestination(folder, asset.reference.originalName);
  await atomicWrite(destination.filePath, asset.bytes);
  if (destination.renamed) state.imported.renamed += 1;
  let id = typeof raw.id === "string" && raw.id && !state.importedIds.has(raw.id)
    ? raw.id
    : randomUUID();
  if (state.importedIds.has(id)) id = randomUUID();
  state.importedIds.add(id);
  const item: HistoryItem = {
    id,
    filePath: destination.filePath,
    fileUrl: toLocalMediaUrl(destination.filePath),
    groupId,
    ...safeHistoryShape(raw),
  };
  state.store.history.push(item);
  state.historyByHash.set(asset.reference.sha256, item);
  if (typeof raw.id === "string") state.historyBySourceId.set(raw.id, item);
  state.imported.count += 1;
  return item;
}

function uniqueLabel(existing: Set<string>, requested: string) {
  const base = String(requested ?? "").trim().slice(0, 120) || "Imported";
  let candidate = base;
  let index = 1;
  while (existing.has(candidate.toLocaleLowerCase())) candidate = `${base} (${index++})`;
  existing.add(candidate.toLocaleLowerCase());
  return { value: candidate, renamed: candidate !== base };
}

function textHistoryIdentity(item: TextToolHistoryItem) {
  return [item.createdAt, item.mode, item.input, item.result].join("\u241f");
}

async function restoreTextHistory(
  zip: JSZip,
  payload: { convert?: TextToolHistoryItem[]; reverse?: PortableTextHistoryItem[] },
  store: PersistedData,
  outputDir: string,
  counters: { count: number; skipped: number; renamed: number },
) {
  const merge = (existing: TextToolHistoryItem[], incoming: TextToolHistoryItem[]) => {
    const identities = new Set(existing.map(textHistoryIdentity));
    const ids = new Set(existing.map((item) => item.id));
    for (const raw of incoming) {
      if (!raw || typeof raw.input !== "string" || typeof raw.result !== "string") continue;
      if (identities.has(textHistoryIdentity(raw))) {
        counters.skipped += 1;
        continue;
      }
      const item = cloneJson(raw);
      if (!item.id || ids.has(item.id)) item.id = randomUUID();
      ids.add(item.id);
      identities.add(textHistoryIdentity(item));
      existing.push(item);
      counters.count += 1;
    }
  };
  merge(store.convertHistory, Array.isArray(payload.convert) ? payload.convert : []);
  const restoredReverse: TextToolHistoryItem[] = [];
  for (const raw of Array.isArray(payload.reverse) ? payload.reverse : []) {
    const item = cloneJson(raw) as PortableTextHistoryItem;
    delete item.sourceAsset;
    if (raw.sourceAsset) {
      const asset = await readAsset(zip, raw.sourceAsset);
      if (asset) {
        const directory = path.join(outputDir, "Imported sources");
        await fs.mkdir(directory, { recursive: true });
        const destination = await uniqueDestination(directory, asset.reference.originalName);
        await atomicWrite(destination.filePath, asset.bytes);
        item.sourceImagePath = destination.filePath;
        if (destination.renamed) counters.renamed += 1;
      }
    }
    restoredReverse.push(item);
  }
  merge(store.reverseHistory, restoredReverse);
}

async function restoreArtistLibrary(
  zip: JSZip,
  payload: { collections?: Record<string, unknown[]> },
  storeState: Parameters<typeof restoreHistoryItem>[2],
  counters: { count: number; skipped: number; renamed: number },
) {
  const existing = await loadArtistFavoriteLibrary(app.getPath("userData"));
  for (const collection of ARTIST_FAVORITE_COLLECTIONS) {
    const current = [...existing.collections[collection]] as Array<Record<string, unknown>>;
    const ids = new Set(current.map((item) => String(item?.id ?? "")).filter(Boolean));
    for (const rawValue of payload.collections?.[collection] ?? []) {
      const favorite = normalizeArtistFavoriteForDesktop(rawValue);
      const incomingId = favorite?.id as string | undefined;
      if (!favorite || !incomingId || ids.has(incomingId)) {
        counters.skipped += 1;
        continue;
      }
      const image = favorite.image as PortableHistoryItem | undefined;
      if (image?.asset) favorite.image = await restoreHistoryItem(zip, image, storeState) ?? undefined;
      current.push(favorite);
      ids.add(incomingId);
      counters.count += 1;
    }
    await saveArtistFavoriteCollection(app.getPath("userData"), collection, current);
  }
}

async function restoreReferencePresets(
  zip: JSZip,
  payload: { groups?: string[]; presets?: PortableReferencePreset[] },
  counters: { count: number; skipped: number; renamed: number },
) {
  const existing = await listReferencePresets(app.getPath("userData"));
  const hashes = new Set<string>();
  for (const preset of existing.presets) {
    const digest = await sha256File(preset.filePath);
    if (digest) hashes.add(digest);
  }
  const names = new Set(existing.presets.map((preset) => preset.name.toLocaleLowerCase()));
  for (const raw of Array.isArray(payload.presets) ? payload.presets : []) {
    const asset = await readAsset(zip, raw.asset);
    if (!asset || hashes.has(asset.reference.sha256)) {
      counters.skipped += 1;
      continue;
    }
    const name = uniqueLabel(names, raw.name);
    if (name.renamed) counters.renamed += 1;
    const result = await saveReferencePreset({
      name: name.value,
      group: typeof raw.group === "string" ? raw.group : "",
      kind: raw.kind === "precise" ? "precise" : "vibe",
      base64: asset.bytes.toString("base64"),
      extension: path.extname(asset.reference.originalName),
      infoExtracted: raw.infoExtracted,
      strength: raw.strength,
      preciseType: raw.preciseType,
      fidelity: raw.fidelity,
      informationExtracted: raw.informationExtracted,
      width: raw.width,
      height: raw.height,
      sourceId: raw.sourceId,
      sourceNames: raw.sourceNames,
      sourceGameNames: raw.sourceGameNames,
      sourceGameId: raw.sourceGameId,
      sourceCategory: raw.sourceCategory,
    }, app.getPath("userData"));
    if (result.ok) {
      hashes.add(asset.reference.sha256);
      counters.count += 1;
    } else {
      counters.skipped += 1;
    }
  }
}

async function restoreStylePreviews(
  zip: JSZip,
  presetId: string,
  existing: StylePromptPreviewImage[],
  incoming: PortableStylePreview[],
  counters: { count: number; skipped: number; renamed: number },
) {
  const previews = reconcileStylePromptPreviewImages(presetId, existing, app.getPath("userData"));
  const hashes = new Set<string>();
  for (const preview of previews) {
    const digest = await sha256File(preview.filePath);
    if (digest) hashes.add(digest);
  }
  const directory = stylePromptPreviewDirectory(presetId, app.getPath("userData"));
  await fs.mkdir(directory, { recursive: true });
  for (const raw of incoming) {
    if (previews.length >= 3) break;
    const asset = await readAsset(zip, raw.asset);
    if (!asset || hashes.has(asset.reference.sha256)) {
      counters.skipped += 1;
      continue;
    }
    const extension = path.extname(asset.reference.originalName).toLowerCase() || ".png";
    const id = randomUUID();
    const filePath = path.join(directory, `${id}${extension}`);
    await atomicWrite(filePath, asset.bytes);
    previews.push({
      id,
      name: safeFileName(raw.name || asset.reference.originalName),
      filePath,
      fileUrl: toLocalMediaUrl(filePath),
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    });
    hashes.add(asset.reference.sha256);
    counters.count += 1;
  }
  return reconcileStylePromptPreviewImages(presetId, previews, app.getPath("userData"));
}

async function restorePromptPresets(
  zip: JSZip,
  payload: {
    promptTemplates?: AppSettings["promptTemplates"];
    stylePromptPresetGroups?: string[];
    stylePromptPresets?: PortableStylePreset[];
  },
  store: PersistedData,
  counters: { count: number; skipped: number; renamed: number },
) {
  const promptTemplates = [...(store.settings.promptTemplates ?? [])];
  const promptIdentity = new Set(promptTemplates.map((item) =>
    [item.name, item.prefix, item.suffix, item.negativePrompt].join("\u241f")));
  const promptNames = new Set(promptTemplates.map((item) => item.name.toLocaleLowerCase()));
  const promptIds = new Set(promptTemplates.map((item) => item.id));
  for (const raw of payload.promptTemplates ?? []) {
    const identity = [raw.name, raw.prefix, raw.suffix, raw.negativePrompt].join("\u241f");
    if (promptIdentity.has(identity)) {
      counters.skipped += 1;
      continue;
    }
    const name = uniqueLabel(promptNames, raw.name);
    if (name.renamed) counters.renamed += 1;
    const id = raw.id && !promptIds.has(raw.id) ? raw.id : randomUUID();
    promptIds.add(id);
    promptIdentity.add(identity);
    promptTemplates.push({ ...cloneJson(raw), id, name: name.value });
    counters.count += 1;
  }

  const styles = [...(store.settings.stylePromptPresets ?? [])];
  const styleNames = new Set(styles.map((item) => item.name.toLocaleLowerCase()));
  const styleIds = new Set(styles.map((item) => item.id));
  for (const raw of payload.stylePromptPresets ?? []) {
    if (!raw || typeof raw.name !== "string" || typeof raw.prompt !== "string") continue;
    let target = styles.find((item) => item.name === raw.name && item.prompt === raw.prompt);
    if (!target) {
      const name = uniqueLabel(styleNames, raw.name);
      if (name.renamed) counters.renamed += 1;
      const id = raw.id && !styleIds.has(raw.id) ? raw.id : randomUUID();
      styleIds.add(id);
      target = {
        id,
        name: name.value,
        prompt: raw.prompt,
        group: String(raw.group || "Default"),
        createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
        previewImages: [],
      };
      styles.push(target);
      counters.count += 1;
    }
    target.previewImages = await restoreStylePreviews(
      zip,
      target.id,
      target.previewImages ?? [],
      Array.isArray(raw.previewImages) ? raw.previewImages : [],
      counters,
    );
  }
  store.settings.promptTemplates = promptTemplates;
  store.settings.stylePromptPresets = styles;
  store.settings.stylePromptPresetGroups = Array.from(new Set([
    "Default",
    ...(store.settings.stylePromptPresetGroups ?? []),
    ...(payload.stylePromptPresetGroups ?? []).filter((value) => typeof value === "string" && value.trim()),
    ...styles.map((item) => item.group).filter(Boolean),
  ]));
}

export async function importDataBackup(
  request: DataBackupImportRequest,
): Promise<DataBackupImportResult> {
  const categories = sanitizeCategories(request.categories);
  const requiresConfirmation = categories.includes("configuration") || categories.includes("apiCredentials");
  if (requiresConfirmation && request.confirmConfigurationOverwrite !== true) {
    return {
      ok: false,
      message: "配置与 API 数据需要第二次确认后才能覆盖。",
      imported: 0,
      skipped: 0,
      renamed: 0,
    };
  }
  if (!categories.length) {
    return { ok: false, message: "请至少选择一类数据。", imported: 0, skipped: 0, renamed: 0 };
  }

  let archive: Awaited<ReturnType<typeof loadArchive>>;
  try {
    archive = await loadArchive(request.path);
  } catch (error: any) {
    return { ok: false, message: `无法读取备份：${error?.message ?? String(error)}`, imported: 0, skipped: 0, renamed: 0 };
  }

  // Import is never allowed to be the first destructive operation. A complete
  // rescue archive is committed first; if it cannot be created, nothing else
  // is touched and the user keeps their current data exactly as-is.
  let rescue: DataBackupOperationResult;
  try {
    rescue = await createInternalBackup("before-import", request.currentWorkspaceData);
  } catch (error: any) {
    return {
      ok: false,
      message: `导入前安全备份失败，已停止导入：${error?.message ?? String(error)}`,
      imported: 0,
      skipped: 0,
      renamed: 0,
    };
  }

  const selected = new Set(categories);
  const counters = { count: 0, skipped: 0, renamed: 0 };
  try {
    const current = readStore();
    const next = cloneJson(current);
    const outputDir = current.settings.outputDir;
    const portableHistoryPayload = await readJsonEntry<{
      groups?: HistoryGroup[];
      items?: PortableHistoryItem[];
    }>(archive.zip, "data/image-history.json", {});
    const artistPayload = await readJsonEntry<{ collections?: Record<string, unknown[]> }>(
      archive.zip,
      "data/artist-library.json",
      {},
    );

    const incomingGroups = selected.has("imageHistory")
      ? portableHistoryPayload.groups ?? []
      : [];
    // Artist favorites carry their own HistoryItem and group id. Add missing
    // groups only when the full image-history category supplied group names;
    // artist-only restores safely fall back to the ungrouped date folder.
    const mergedGroups = mergeGroups(next.historyGroups, incomingGroups);
    next.historyGroups = mergedGroups.groups;
    const storeState = {
      store: next,
      outputDir,
      groupIdMap: mergedGroups.idMap,
      historyByHash: await historyHashIndex(next.history),
      historyBySourceId: new Map<string, HistoryItem>(),
      importedIds: new Set(next.history.map((item) => item.id)),
      imported: counters,
    };

    if (selected.has("imageHistory")) {
      for (const item of portableHistoryPayload.items ?? []) {
        await restoreHistoryItem(archive.zip, item, storeState);
      }
    }

    if (selected.has("textHistory")) {
      const payload = await readJsonEntry<{
        convert?: TextToolHistoryItem[];
        reverse?: PortableTextHistoryItem[];
      }>(archive.zip, "data/text-history.json", {});
      await restoreTextHistory(archive.zip, payload, next, outputDir, counters);
    }

    if (selected.has("artistLibrary")) {
      await restoreArtistLibrary(archive.zip, artistPayload, storeState, counters);
    }

    if (selected.has("referencePresets")) {
      const payload = await readJsonEntry<{
        groups?: string[];
        presets?: PortableReferencePreset[];
      }>(archive.zip, "data/reference-presets.json", {});
      await restoreReferencePresets(archive.zip, payload, counters);
    }

    if (selected.has("promptPresets")) {
      const payload = await readJsonEntry<{
        promptTemplates?: AppSettings["promptTemplates"];
        stylePromptPresetGroups?: string[];
        stylePromptPresets?: PortableStylePreset[];
      }>(archive.zip, "data/prompt-presets.json", {});
      await restorePromptPresets(archive.zip, payload, next, counters);
    }

    if (selected.has("configuration")) {
      const incoming = await readJsonEntry<Record<string, unknown> | null>(
        archive.zip,
        "data/configuration.json",
        null,
      );
      if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
        throw new Error("备份缺少有效的应用配置，未执行覆盖。");
      }
      const devicePaths = pickSettings(current.settings, DEVICE_PATH_KEYS);
      const preservedPresets = pickSettings(next.settings, PRESET_SETTING_KEYS);
      const preservedApis = pickSettings(next.settings, API_SETTING_KEYS);
      next.settings = {
        ...defaultSettings(),
        ...incoming,
        ...devicePaths,
        ...preservedPresets,
        ...preservedApis,
      } as AppSettings;
      const incomingParams = await readJsonEntry<Record<string, unknown> | null>(
        archive.zip,
        "data/generation-params.json",
        null,
      ) ?? (
        await readJsonEntry<{ params?: Record<string, unknown> }>(
          archive.zip,
          "data/mobile-configuration.json",
          {},
        )
      ).params;
      if (incomingParams && typeof incomingParams === "object" && !Array.isArray(incomingParams)) {
        const previous = next.settings.lastGenerationState
          ?? current.settings.lastGenerationState
          ?? {
            params: cloneJson(DEFAULT_PARAMS),
            batchCount: 1,
            i2iParams: cloneJson(DEFAULT_I2I_PARAMS),
            inpaintModel: "nai-diffusion-5-full-inpainting" as const,
            inpaintStrength: 1,
            inpaintNoise: 0,
            inpaintPositivePrompt: "",
            brushSize: 4,
            brushOpacity: 0.55,
            brushColor: "#ffffff",
            brushShape: "round" as const,
            brushSizeUnit: "grid8" as const,
            upscaleScale: 4 as const,
            directorTool: "bg-removal" as const,
            augmentOptions: cloneJson(DEFAULT_AUGMENT_OPTIONS),
          };
        next.settings.lastGenerationState = {
          ...previous,
          params: {
            ...cloneJson(DEFAULT_PARAMS),
            ...cloneJson(incomingParams),
          },
        };
        counters.count += Object.keys(incomingParams).length;
      }
      counters.count += Object.keys(incoming).length;
    }

    if (selected.has("apiCredentials")) {
      const incoming = await readJsonEntry<{
        token?: string;
        account?: PersistedData["account"];
        settings?: Partial<AppSettings>;
      } | null>(archive.zip, "data/api-credentials.json", null);
      if (!incoming || typeof incoming !== "object") {
        throw new Error("备份缺少有效的 API 与敏感数据，未执行覆盖。");
      }
      for (const key of API_SETTING_KEYS) {
        if (incoming.settings && key in incoming.settings) {
          (next.settings as unknown as Record<string, unknown>)[key] = cloneJson(incoming.settings[key]);
          counters.count += 1;
        }
      }
      if (typeof incoming.token === "string") next.token = incoming.token;
      if (incoming.account && typeof incoming.account === "object") next.account = incoming.account;
    }

    next.history.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    next.convertHistory.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    next.reverseHistory.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    writeStore(next);

    const workspaceData = selected.has("workspaceData")
      ? await readJsonEntry<Record<string, string>>(archive.zip, "data/workspace.json", {})
      : undefined;
    return {
      ok: true,
      message: `导入完成：新增 ${counters.count} 项，跳过 ${counters.skipped} 项，重命名 ${counters.renamed} 项。`,
      imported: counters.count,
      skipped: counters.skipped,
      renamed: counters.renamed,
      workspaceData,
      rescueBackupPath: rescue.path,
    };
  } catch (error: any) {
    return {
      ok: false,
      message: `导入中止；当前数据的导入前备份已保留：${error?.message ?? String(error)}`,
      imported: counters.count,
      skipped: counters.skipped,
      renamed: counters.renamed,
      rescueBackupPath: rescue.path,
    };
  }
}

async function automaticBackupFiles(directory: string) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = await Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name.startsWith("auto-") && entry.name.endsWith(".naisbackup"))
      .map(async (entry) => {
        const filePath = path.join(directory, entry.name);
        const stat = await fs.stat(filePath);
        return { path: filePath, createdAt: stat.mtime, bytes: stat.size };
      }));
    return files.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  } catch {
    return [];
  }
}

export async function getDataBackupStatus(): Promise<DataBackupStatus> {
  const settings = readStore().settings;
  const directory = configuredBackupDirectory(settings);
  const files = await automaticBackupFiles(directory);
  const intervalHours = Math.max(1, Math.min(24 * 30, Math.trunc(Number(settings.autoBackupIntervalHours) || 24)));
  const retentionCount = Math.max(1, Math.min(100, Math.trunc(Number(settings.autoBackupRetentionCount) || 7)));
  const latest = files[0];
  const due = !latest || Date.now() - latest.createdAt.getTime() >= intervalHours * 60 * 60 * 1000;
  return {
    directory,
    automaticEnabled: settings.autoBackupEnabled !== false,
    intervalHours,
    retentionCount,
    latestPath: latest?.path,
    latestCreatedAt: latest?.createdAt.toISOString(),
    backupCount: files.length,
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
    due,
  };
}

export async function runAutomaticBackup(
  workspaceData?: Record<string, string>,
): Promise<DataBackupOperationResult> {
  const settings = readStore().settings;
  const status = await getDataBackupStatus();
  if (!settings.autoBackupEnabled) return { ok: true, message: "自动备份已关闭。" };
  if (!status.due) return { ok: true, message: "自动备份尚未到期。", path: status.latestPath };
  // Metadata and grouping remain protected in lightweight mode; only the
  // large binary payloads are omitted. Manual export continues to include all
  // checked assets by default.
  const result = await createInternalBackup("auto", workspaceData, ALL_CATEGORIES, {
    includeAssets: settings.autoBackupIncludeImages === true,
  });
  const files = await automaticBackupFiles(configuredBackupDirectory(settings));
  const retention = Math.max(1, Math.min(100, Math.trunc(Number(settings.autoBackupRetentionCount) || 7)));
  for (const obsolete of files.slice(retention)) {
    await fs.rm(obsolete.path, { force: true }).catch(() => undefined);
  }
  return result;
}

export async function selectBackupDirectory() {
  const result = await dialog.showOpenDialog({
    title: "选择自动备份目录",
    properties: ["openDirectory", "createDirectory"],
    defaultPath: configuredBackupDirectory(),
  });
  return result.canceled || !result.filePaths[0] ? null : result.filePaths[0];
}

export async function openBackupDirectory() {
  const directory = configuredBackupDirectory();
  await fs.mkdir(directory, { recursive: true });
  const message = await shell.openPath(directory);
  return message ? { ok: false, message } : { ok: true };
}

export { ALL_CATEGORIES as DATA_BACKUP_CATEGORIES };
