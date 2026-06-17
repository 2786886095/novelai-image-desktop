import { app } from "electron";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { AccountSummary, AppSettings, HistoryGroup, HistoryItem, SettingKey } from "../../src/types";

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

export function defaultSettings(): AppSettings {
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
    reversePromptTemplates: { tags: "", natural: "", mixed: "" },
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
  };
}

function normalize(raw: Partial<PersistedData> | null): PersistedData {
  const defaults = defaultSettings();
  return {
    token: typeof raw?.token === "string" ? raw.token : undefined,
    account: raw?.account && typeof raw.account === "object" ? raw.account : undefined,
    settings: { ...defaults, ...(raw?.settings ?? {}) },
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
