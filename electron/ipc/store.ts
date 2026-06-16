import { app } from "electron";
import fs from "fs";
import path from "path";
import type { AccountSummary, AppSettings, HistoryItem, SettingKey } from "../../src/types";

interface PersistedData {
  token?: string;
  account?: Omit<AccountSummary, "hasToken">;
  settings: AppSettings;
  history: HistoryItem[];
}

let cache: PersistedData | null = null;

function storePath() {
  return path.join(app.getPath("userData"), "novelai-image-desktop.json");
}

export function defaultSettings(): AppSettings {
  return {
    hasOnboarded: false,
    language: "zh-CN",
    outputDir: path.join(app.getPath("pictures"), "NovelAI Studio"),
    apiBaseUrl: "https://api.novelai.net",
    imageBaseUrl: "https://image.novelai.net",
    proxyUrl: "",
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
  data.history = [...items, ...data.history];
  writeStore(data);
}

export function getHistory(date?: string): HistoryItem[] {
  const history = readStore().history;
  return date ? history.filter((item) => item.date === date) : history;
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
