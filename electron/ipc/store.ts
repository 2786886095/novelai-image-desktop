import { app, safeStorage } from "electron";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import type { AccountSummary, AppSettings, HistoryGroup, HistoryItem, SettingKey } from "../../src/types";
import { COMIC_ANALYZE_SYSTEM_PROMPT, SCOPED_REVERSE_SYSTEM_PROMPTS } from "../../src/data/prompt-templates";

interface PersistedData {
  token?: string;
  account?: Omit<AccountSummary, "hasToken">;
  settings: AppSettings;
  history: HistoryItem[];
  historyGroups: HistoryGroup[];
}

let cache: PersistedData | null = null;

function storePath() {
  return path.join(app.getPath("userData"), "novelai-image-desktop.json");
}

// --- At-rest encryption for credentials -------------------------------------
// The NovelAI token and the third-party AI keys are encrypted with Electron's
// safeStorage (OS keychain / DPAPI) before being written to disk. The in-memory
// cache always holds plaintext; only the JSON file holds ciphertext. Existing
// plaintext stores are transparently migrated on the next write.
const ENC_PREFIX = "enc:v1:";
const SENSITIVE_SETTING_KEYS: SettingKey[] = [
  "visionApiKey",
  "convertApiKey",
  "tagServerApiKey",
  "baiduSecret",
];

const SUPPORTED_LANGUAGES = new Set(["zh-CN", "zh-TW", "en-US", "ja-JP", "ko-KR"]);

function normalizeLanguage(value: unknown): AppSettings["language"] {
  return typeof value === "string" && SUPPORTED_LANGUAGES.has(value) ? (value as AppSettings["language"]) : "zh-CN";
}

function canEncrypt(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function encField(value: unknown): unknown {
  if (typeof value !== "string" || value === "" || value.startsWith(ENC_PREFIX)) return value;
  if (!canEncrypt()) return value;
  try {
    return ENC_PREFIX + safeStorage.encryptString(value).toString("base64");
  } catch {
    return value;
  }
}

function decField(value: unknown): unknown {
  if (typeof value !== "string" || !value.startsWith(ENC_PREFIX)) return value;
  if (!canEncrypt()) return value;
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(ENC_PREFIX.length), "base64"));
  } catch {
    return value;
  }
}

function encryptForDisk(data: PersistedData): PersistedData {
  const clone: PersistedData = { ...data, settings: { ...data.settings } };
  if (clone.token) clone.token = encField(clone.token) as string;
  const settings = clone.settings as unknown as Record<string, unknown>;
  for (const key of SENSITIVE_SETTING_KEYS) {
    settings[key] = encField(settings[key]);
  }
  return clone;
}

function decryptFromDisk(raw: Partial<PersistedData>): Partial<PersistedData> {
  const clone: Partial<PersistedData> = { ...raw };
  if (typeof clone.token === "string") clone.token = decField(clone.token) as string;
  if (clone.settings) {
    clone.settings = { ...clone.settings };
    const settings = clone.settings as unknown as Record<string, unknown>;
    for (const key of SENSITIVE_SETTING_KEYS) {
      const current = settings[key];
      if (typeof current === "string") settings[key] = decField(current);
    }
  }
  return clone;
}

function emptyModeTemplates(): AppSettings["reversePromptTemplates"] {
  return { tags: "", natural: "", mixed: "" };
}

function parseScopedReverseTemplateFile(text: string): AppSettings["reversePromptTemplates"] | null {
  const normalized = text.replace(/^\uFEFF/, "");
  const tagsMarker = "danbooru标签｜支持反推范围选择";
  const naturalMarker = "自然语言｜支持反推范围选择";
  const mixedMarker = "混合模式｜支持反推范围选择";
  const tagsIndex = normalized.indexOf(tagsMarker);
  const naturalIndex = normalized.indexOf(naturalMarker);
  const mixedIndex = normalized.indexOf(mixedMarker);
  if (tagsIndex < 0 || naturalIndex < 0 || mixedIndex < 0) return null;
  if (!(tagsIndex < naturalIndex && naturalIndex < mixedIndex)) return null;
  return {
    tags: normalized.slice(tagsIndex, naturalIndex).trim(),
    natural: normalized.slice(naturalIndex, mixedIndex).trim(),
    mixed: normalized.slice(mixedIndex).trim(),
  };
}

function loadOwnerScopedReverseTemplates(): AppSettings["reversePromptTemplates"] {
  const candidates = [
    "D:\\Downloads\\ai反推提示词模版_支持范围选择版.txt",
    path.join(app.getPath("downloads"), "ai反推提示词模版_支持范围选择版.txt"),
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const parsed = parseScopedReverseTemplateFile(fs.readFileSync(file, "utf8"));
      if (parsed) return parsed;
    } catch {
      // Ignore unreadable optional owner template files and fall back safely.
    }
  }
  return emptyModeTemplates();
}

// Canonical defaults for the AI-reverse templates: the owner-provided file when
// present, otherwise the built-in SCOPED_REVERSE_SYSTEM_PROMPTS. The settings page
// uses this for "restore default" so it never mistakes a user's customized
// template for the default.
export function getReversePromptTemplateDefaults(): AppSettings["reversePromptTemplates"] {
  const owner = loadOwnerScopedReverseTemplates();
  if (!isEmptyModeTemplates(owner)) return owner;
  return {
    tags: SCOPED_REVERSE_SYSTEM_PROMPTS.tags,
    natural: SCOPED_REVERSE_SYSTEM_PROMPTS.natural,
    mixed: SCOPED_REVERSE_SYSTEM_PROMPTS.mixed,
  };
}

function isEmptyModeTemplates(value: unknown): boolean {
  if (!value || typeof value !== "object") return true;
  const next = value as Partial<AppSettings["reversePromptTemplates"]>;
  return !next.tags?.trim() && !next.natural?.trim() && !next.mixed?.trim();
}

function isLegacyScopedReverseTemplates(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const next = value as Partial<AppSettings["reversePromptTemplates"]>;
  const text = [next.tags, next.natural, next.mixed].filter(Boolean).join("\n");
  return (
    text.includes("You are a NovelAI V4.5 image-to-prompt specialist") &&
    text.includes("The user message will include an explicit reverse scope") &&
    text.includes("Scope rules:")
  );
}

export function defaultSettings(): AppSettings {
  const reversePromptTemplates = loadOwnerScopedReverseTemplates();
  return {
    hasOnboarded: false,
    language: "zh-CN",
    outputDir: path.join(app.getPath("pictures"), "Langbai NovelAI Studio"),
    logDir: "",
    apiBaseUrl: "https://api.novelai.net",
    imageBaseUrl: "https://image.novelai.net",
    allowCustomEndpoint: false,
    proxyMode: "http",
    proxyUrl: "http://127.0.0.1:7890",
    proxyForNai: true,
    proxyForMcp: true,
    proxyForAi: true,
    proxyForUpdate: true,
    proxyForTranslate: true,
    theme: "light",
    autoComplete: true,
    weightHighlight: true,
    promptRandomizer: true,
    superDrop: true,
    showFloatingToolbar: true,
    historyJumpAfterGenerate: true,
    historyRetentionDays: 30,
    loggingEnabled: true,
    keepImageMetadata: true,
    visionApiUrl: "https://api.openai.com/v1",
    visionApiKey: "",
    visionApiModel: "gpt-4o",
    visionSystemPrompt: "",
    reversePromptMode: "tags" as const,
    reversePromptTemplates,
    comicAnalyzePromptTemplates: { tags: "", natural: "", mixed: "" },
    comicAnalyzePromptTemplate: COMIC_ANALYZE_SYSTEM_PROMPT,
    convertApiUrl: "https://api.openai.com/v1",
    convertApiKey: "",
    convertApiModel: "gpt-4o-mini",
    convertSystemPrompt: "",
    convertMode: "tags" as const,
    convertPromptTemplates: { tags: "", natural: "", mixed: "" },
    tagServerEnabled: false,
    tagServerUrl: "",
    tagServerApiKey: "",
    tagServerType: "rest" as const,
    tagServerCommand: "",
    tagServerArgs: "",
    tagServerTool: "search_tags",
    mcpForCapsule: true,
    mcpForReverse: false,
    mcpForConvert: false,
    translateProvider: "google" as const,
    baiduAppId: "",
    baiduSecret: "",
    activeHistoryGroupId: "",
    modelMode: "anime" as const,
    lockStylePrompt: false,
    lockNegativePrompt: false,
    savedStylePrompt: "",
    savedNegativePrompt: "",
    imageNameTemplate: "{date}_{seq}_{model}",
    promptTemplates: [],
    lastGenerationState: null,
  };
}

function normalize(raw: Partial<PersistedData> | null): PersistedData {
  const defaults = defaultSettings();
  const rawSettings = (raw?.settings ?? {}) as Partial<AppSettings>;
  const settings = { ...defaults, ...rawSettings };
  settings.language = normalizeLanguage(settings.language);
  if (!rawSettings.proxyMode) {
    const legacyProxy = rawSettings.proxyUrl?.trim() ?? "";
    if (!legacyProxy) {
      settings.proxyMode = "http";
      settings.proxyUrl = defaults.proxyUrl;
    } else if (/^socks/i.test(legacyProxy)) {
      settings.proxyMode = "socks";
    } else if (legacyProxy.toLowerCase().replace(/\/$/, "") === defaults.proxyUrl) {
      settings.proxyMode = "http";
    } else {
      settings.proxyMode = "custom";
    }
  }
  if (isEmptyModeTemplates(rawSettings.reversePromptTemplates) || isLegacyScopedReverseTemplates(rawSettings.reversePromptTemplates)) {
    settings.reversePromptTemplates = defaults.reversePromptTemplates;
  }
  if (!settings.comicAnalyzePromptTemplate?.trim()) {
    settings.comicAnalyzePromptTemplate =
      rawSettings.comicAnalyzePromptTemplates?.natural?.trim() ||
      rawSettings.comicAnalyzePromptTemplates?.tags?.trim() ||
      rawSettings.comicAnalyzePromptTemplates?.mixed?.trim() ||
      defaults.comicAnalyzePromptTemplate;
  }
  return {
    token: typeof raw?.token === "string" ? raw.token : undefined,
    account: raw?.account && typeof raw.account === "object" ? raw.account : undefined,
    settings,
    history: Array.isArray(raw?.history) ? raw.history : [],
    historyGroups: Array.isArray(raw?.historyGroups) ? raw.historyGroups : [],
  };
}

export function readStore(): PersistedData {
  if (cache) return cache;

  try {
    const file = storePath();
    if (!fs.existsSync(file)) {
      cache = normalize(null);
      writeStore(cache);
      return cache;
    }

    const raw = decryptFromDisk(JSON.parse(fs.readFileSync(file, "utf8")) as Partial<PersistedData>);
    cache = normalize(raw);
    return cache;
  } catch {
    // Don't silently wipe a corrupt store (would lose the saved token/history).
    // Back it up as .corrupt so it can be recovered.
    try {
      const file = storePath();
      if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`);
    } catch {
      // ignore backup failure
    }
    cache = normalize(null);
    writeStore(cache);
    return cache;
  }
}

export function writeStore(next: PersistedData) {
  cache = next; // in-memory cache stays plaintext
  const file = storePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(encryptForDisk(next), null, 2), "utf8");
}

export function getSettings(): AppSettings {
  return readStore().settings;
}

export function getSetting<K extends SettingKey>(key: K): AppSettings[K] {
  return getSettings()[key];
}

export function setSetting<K extends SettingKey>(key: K, value: AppSettings[K]): AppSettings[K] {
  const data = readStore();
  data.settings = {
    ...data.settings,
    [key]: key === "language" ? normalizeLanguage(value) : value,
  };
  writeStore(data);
  return data.settings[key];
}

export function completeSetup() {
  setSetting("hasOnboarded", true);
}

export function getToken() {
  return readStore().token;
}

export function setToken(token: string) {
  const data = readStore();
  data.token = token;
  writeStore(data);
}

export function clearToken() {
  const data = readStore();
  delete data.token;
  delete data.account;
  writeStore(data);
}

export function getAccountSummary(): AccountSummary {
  const data = readStore();
  return { hasToken: Boolean(data.token), ...(data.account ?? {}) };
}

export function setAccountSummary(account: Omit<AccountSummary, "hasToken">) {
  const data = readStore();
  data.account = account;
  writeStore(data);
}

export function addHistory(items: HistoryItem[]) {
  const data = readStore();
  // The selected history group is a view filter, not a save destination.
  // Callers that own a destination (for example a comic project) set groupId
  // explicitly on their history items.
  data.history = [...items, ...data.history];
  writeStore(data);
}

function sanitizeGroupFolderName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 80);
  return cleaned || "group";
}

function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function isInside(parent: string, child: string): boolean {
  try {
    const rel = path.relative(path.resolve(parent), path.resolve(child));
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  } catch {
    return false;
  }
}

function inferGroupIdFromPath(filePath: string, data: PersistedData): string | undefined {
  const outputDir = data.settings.outputDir?.trim();
  if (!outputDir || !isInside(outputDir, filePath)) return undefined;
  const relParts = path.relative(outputDir, filePath).split(path.sep).filter(Boolean);
  if (relParts.length < 3 || !/^\d{4}-\d{2}-\d{2}$/.test(relParts[0])) return undefined;

  const folderName = relParts[1];
  const folderKey = folderName.toLowerCase();
  const existing = data.historyGroups.find((group) => {
    const nameKey = group.name.trim().toLowerCase();
    const safeKey = sanitizeGroupFolderName(group.name).toLowerCase();
    return nameKey === folderKey || safeKey === folderKey;
  });
  if (existing) return existing.id;

  const created: HistoryGroup = {
    id: crypto.randomUUID(),
    name: folderName.replace(/_/g, " ").trim() || folderName,
    createdAt: new Date().toISOString(),
  };
  data.historyGroups = [...data.historyGroups, created];
  return created.id;
}

function buildFileNameIndex(root: string): Map<string, string[]> {
  const index = new Map<string, string[]>();
  if (!root || !fileExists(root)) return index;
  const stack = [root];
  let scanned = 0;
  const maxScan = 60_000;
  while (stack.length > 0 && scanned < maxScan) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    scanned += entries.length;
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        const key = entry.name.toLowerCase();
        const list = index.get(key);
        if (list) list.push(full);
        else index.set(key, [full]);
      }
    }
  }
  return index;
}

function findMovedHistoryFile(
  item: HistoryItem,
  data: PersistedData,
  indexCache: Map<string, Map<string, string[]>>,
): string | null {
  if (!item.filePath) return null;
  const fileName = path.basename(item.filePath).toLowerCase();
  const roots = [
    data.settings.outputDir && item.date ? path.join(data.settings.outputDir, item.date) : "",
    data.settings.outputDir,
  ].filter(Boolean);
  const uniqueRoots = Array.from(new Set(roots.map((root) => path.resolve(root))));
  for (const root of uniqueRoots) {
    if (!fileExists(root)) continue;
    let index = indexCache.get(root);
    if (!index) {
      index = buildFileNameIndex(root);
      indexCache.set(root, index);
    }
    const candidate = index.get(fileName)?.find((p) => fileExists(p));
    if (candidate) return candidate;
  }
  return null;
}

// History is permanent now: records are never deleted because they are old.
// Instead the index mirrors real files. If an image was moved inside the output
// directory (for example from one group folder to another), the record follows
// that file and keeps its original createdAt/date. If it cannot be found, only
// the stale record is removed.
function reconcileHistoryFiles(): void {
  const data = readStore();
  if (data.history.length === 0) return;
  const indexCache = new Map<string, Map<string, string[]>>();
  let changed = false;
  const next: HistoryItem[] = [];

  for (const item of data.history) {
    if (!item.filePath) {
      next.push(item);
      continue;
    }

    if (fileExists(item.filePath)) {
      const inferredGroupId = inferGroupIdFromPath(item.filePath, data);
      if (inferredGroupId !== item.groupId) {
        next.push({ ...item, groupId: inferredGroupId });
        changed = true;
      } else {
        next.push(item);
      }
      continue;
    }

    const movedPath = findMovedHistoryFile(item, data, indexCache);
    if (!movedPath) {
      changed = true;
      continue;
    }

    next.push({
      ...item,
      filePath: movedPath,
      fileUrl: pathToFileURL(movedPath).toString(),
      groupId: inferGroupIdFromPath(movedPath, data),
    });
    changed = true;
  }

  if (changed) {
    data.history = next;
    writeStore(data);
  }
}

// Remove a single history record when its image file is gone from disk (called
// when the renderer fails to load a thumbnail/preview mid-session). Never
// deletes a file — only drops the record, and only after confirming the file is
// actually missing, so a transient decode error for a present file can't erase
// it. Returns true if a record was removed.
export function pruneMissingHistoryItem(id: string): boolean {
  const data = readStore();
  const item = data.history.find((h) => h.id === id);
  if (!item || !item.filePath) return false;
  if (fileExists(item.filePath)) return false;
  const movedPath = findMovedHistoryFile(item, data, new Map());
  if (movedPath) {
    const updated = {
      ...item,
      filePath: movedPath,
      fileUrl: pathToFileURL(movedPath).toString(),
      groupId: inferGroupIdFromPath(movedPath, data),
    };
    data.history = data.history.map((h) => (h.id === id ? updated : h));
    writeStore(data);
    return false;
  }
  data.history = data.history.filter((h) => h.id !== id);
  writeStore(data);
  return true;
}

export function getHistory(date?: string, groupId?: string): HistoryItem[] {
  reconcileHistoryFiles();
  const history = readStore().history;
  return history.filter((item) => {
    if (date && item.date !== date) return false;
    if (!groupId) return true;
    if (groupId === "__ungrouped") return !item.groupId;
    return item.groupId === groupId;
  });
}

export function getHistoryDates(): string[] {
  reconcileHistoryFiles();
  return Array.from(new Set(readStore().history.map((item) => item.date))).sort().reverse();
}

export function removeHistory(id: string): HistoryItem | null {
  const data = readStore();
  const found = data.history.find((item) => item.id === id) ?? null;
  data.history = data.history.filter((item) => item.id !== id);
  writeStore(data);
  return found;
}

export function updateHistoryItem(id: string, patch: Partial<HistoryItem>): HistoryItem | null {
  const data = readStore();
  let updated: HistoryItem | null = null;
  data.history = data.history.map((item) => {
    if (item.id !== id) return item;
    updated = { ...item, ...patch };
    return updated;
  });
  if (updated) writeStore(data);
  return updated;
}

export function getHistoryGroups(): HistoryGroup[] {
  reconcileHistoryFiles();
  return readStore().historyGroups;
}

export function ensureHistoryGroup(name: string, preferredId?: string): HistoryGroup {
  const normalizedName = name.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "未命名漫画项目";
  const data = readStore();
  const preferred = preferredId ? data.historyGroups.find((group) => group.id === preferredId) : undefined;
  if (preferred) {
    if (preferred.name !== normalizedName) {
      const updated = { ...preferred, name: normalizedName };
      data.historyGroups = data.historyGroups.map((group) => (group.id === preferred.id ? updated : group));
      writeStore(data);
      return updated;
    }
    return preferred;
  }
  const existing = data.historyGroups.find((group) => group.name.toLowerCase() === normalizedName.toLowerCase());
  if (existing) return existing;
  const created = { id: crypto.randomUUID(), name: normalizedName, createdAt: new Date().toISOString() };
  data.historyGroups = [...data.historyGroups, created];
  writeStore(data);
  return created;
}

export function createHistoryGroup(name: string): HistoryGroup[] {
  const trimmed = name.trim();
  const data = readStore();
  if (!trimmed) return data.historyGroups;
  const exists = data.historyGroups.some((group) => group.name.toLowerCase() === trimmed.toLowerCase());
  if (!exists) {
    data.historyGroups = [
      ...data.historyGroups,
      { id: crypto.randomUUID(), name: trimmed, createdAt: new Date().toISOString() },
    ];
    writeStore(data);
  }
  return data.historyGroups;
}

export function renameHistoryGroup(id: string, name: string): HistoryGroup[] {
  const trimmed = name.trim();
  const data = readStore();
  if (trimmed) {
    data.historyGroups = data.historyGroups.map((group) =>
      group.id === id ? { ...group, name: trimmed } : group,
    );
    writeStore(data);
  }
  return data.historyGroups;
}

export function deleteHistoryGroup(id: string): HistoryGroup[] {
  const data = readStore();
  data.historyGroups = data.historyGroups.filter((group) => group.id !== id);
  // Items in the deleted group fall back to ungrouped (images are kept).
  data.history = data.history.map((item) => (item.groupId === id ? { ...item, groupId: undefined } : item));
  if (data.settings.activeHistoryGroupId === id) {
    data.settings = { ...data.settings, activeHistoryGroupId: "" };
  }
  writeStore(data);
  return data.historyGroups;
}

export function setHistoryGroup(id: string, groupId?: string) {
  const data = readStore();
  const normalized = groupId && groupId !== "__ungrouped" ? groupId : undefined;
  data.history = data.history.map((item) => (item.id === id ? { ...item, groupId: normalized } : item));
  writeStore(data);
  return { ok: true };
}
