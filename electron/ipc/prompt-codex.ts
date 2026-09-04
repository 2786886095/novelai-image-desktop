import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import {
  buildPromptCodexSnapshot,
  PROMPT_CODEX_BOOKS,
  type PromptCodexSnapshot,
} from "../../src/prompt-codex";

const CACHE_FILE = "prompt-codex-v1.json";
const BUNDLED_FILE = "prompt-codex.json.gz";
const gunzipAsync = promisify(gunzip);
let bundledSnapshotPromise: Promise<PromptCodexSnapshot> | null = null;

function cachePath() {
  return path.join(app.getPath("userData"), "cache", CACHE_FILE);
}

function isSnapshot(value: unknown): value is PromptCodexSnapshot {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PromptCodexSnapshot>;
  return (
    item.schemaVersion === 1 &&
    Array.isArray(item.books) &&
    item.books.length === PROMPT_CODEX_BOOKS.length &&
    Array.isArray(item.entries) &&
    item.entries.length > 100
  );
}

export async function loadPromptCodexCache() {
  try {
    const value: unknown = JSON.parse(await fs.readFile(cachePath(), "utf8"));
    return isSnapshot(value) ? value : null;
  } catch {
    return null;
  }
}

async function readBundledPromptCodex(): Promise<PromptCodexSnapshot> {
  const appRoot = app.getAppPath();
  const candidates = [
    path.join(appRoot, "dist", BUNDLED_FILE),
    path.join(appRoot, "public", BUNDLED_FILE),
  ];
  let lastError: unknown;
  for (const file of candidates) {
    try {
      const compressed = await fs.readFile(file);
      const value: unknown = JSON.parse(
        (await gunzipAsync(compressed)).toString("utf8"),
      );
      if (!isSnapshot(value)) throw new Error("内置法典数据不完整");
      return value;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("未找到内置法典资源");
}

export function loadBundledPromptCodex(): Promise<PromptCodexSnapshot> {
  bundledSnapshotPromise ??= readBundledPromptCodex().catch((error) => {
    bundledSnapshotPromise = null;
    throw error;
  });
  return bundledSnapshotPromise;
}

export async function updatePromptCodex(): Promise<PromptCodexSnapshot> {
  const pages = await Promise.all(
    PROMPT_CODEX_BOOKS.map(async (book) => {
      const response = await fetch(book.sourceUrl, {
        headers: {
          "user-agent": `Langbai-NovelAI-Studio/${app.getVersion()} Prompt-Codex`,
        },
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) {
        throw new Error(`${book.title}: HTTP ${response.status}`);
      }
      return { book, html: await response.text() };
    }),
  );
  const snapshot = buildPromptCodexSnapshot(pages);
  const target = cachePath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(snapshot), "utf8");
  return snapshot;
}
