import { app } from "electron";
import crypto from "crypto";
import fs from "fs";
import path from "path";
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
    apiBaseUrl: "https://api.novelai.net",
    imageBaseUrl: "https://image.novelai.net",
    proxyUrl: "",
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
    deleteProtectionSeconds: 1,
    historyRetentionDays: 30,
    debugLogs: false,
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

    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<PersistedData>;
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
  cache = next;
  const file = storePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2), "utf8");
}

export function getSettings(): AppSettings {
  return readStore().settings;
}

export function getSetting<K extends SettingKey>(key: K): AppSettings[K] {
  return getSettings()[key];
}

export function setSetting<K extends SettingKey>(key: K, value: AppSettings[K]): AppSettings[K] {
  const data = readStore();
  data.settings = { ...data.settings, [key]: value };
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
  const groupId = data.settings.activeHistoryGroupId || undefined;
  const nextItems = groupId ? items.map((item) => ({ ...item, groupId })) : items;
  data.history = [...nextItems, ...data.history];
  writeStore(data);
}

export function getHistory(date?: string, groupId?: string): HistoryItem[] {
  const history = readStore().history;
  return history.filter((item) => {
    if (date && item.date !== date) return false;
    if (!groupId) return true;
    if (groupId === "__ungrouped") return !item.groupId;
    return item.groupId === groupId;
  });
}

export function getHistoryDates(): string[] {
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
  return readStore().historyGroups;
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
