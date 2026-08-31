import axios from "axios";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { app, BrowserWindow, shell } from "electron";
import type {
  ArtistStyleCatalogScope,
  ResourceCacheStats,
  ResourceDatabaseDownloadResult,
  ResourceDatabaseId,
  ResourceDatabaseOverview,
  ResourceDatabaseProgressEvent,
  ResourceDatabaseStatus,
  TagSuggestion,
} from "../../src/types";
import { proxyConfig } from "./proxy";
import { artistStyleExactNames } from "./artist-style-taxonomy";

type ResourceDefinition = {
  id: ResourceDatabaseId;
  label: string;
  description: string;
  dataVersion: string;
  schemaVersion: number;
  databaseName: string;
  downloadName: string;
  downloadUrl: string;
  downloadSize: number;
  downloadSha256: string;
  databaseSize: number;
  databaseSha256: string;
  expectedTags: number;
  expectedEdges?: number;
  compressed: boolean;
  sourceName: string;
  sourceUrl: string;
  license: string;
};

// Immutable release assets and checksums published by Aaalice NAI Launcher.
// The databases are not bundled: installation is always a user-confirmed
// download, with source/license shown in Settings before replacement.
const DEFINITIONS: Record<ResourceDatabaseId, ResourceDefinition> = {
  tagCatalog: {
    id: "tagCatalog",
    label: "基础 Danbooru 标签目录",
    description: "完整标签、类别、热度与别名；安装后作为本地补全主数据库。",
    dataVersion: "42f35be9d394",
    schemaVersion: 2,
    databaseName: "tag_catalog.db",
    downloadName: "tag_catalog.db",
    downloadUrl: "https://github.com/Aaalice233/Aaalice_NAI_Launcher/releases/download/autocomplete-data-tag-catalog-42f35be9-v1/tag_catalog.db",
    downloadSize: 46_772_224,
    downloadSha256: "270538fc623bb1a88acf1f347372568d51bf55510c53e0fb700cb370e0da798d",
    databaseSize: 46_772_224,
    databaseSha256: "270538fc623bb1a88acf1f347372568d51bf55510c53e0fb700cb370e0da798d",
    expectedTags: 221_787,
    compressed: false,
    sourceName: "ComfyUI-Lora-Manager tag catalog snapshot",
    sourceUrl: "https://github.com/willmiao/ComfyUI-Lora-Manager",
    license: "Unlicense / public-domain upstream data",
  },
  cooccurrence: {
    id: "cooccurrence",
    label: "本地相关标签数据库",
    description: "约 323 万组共现关系；安装后替代内置小型相关推荐表。",
    dataVersion: "2dadc5bfcbcc-v2",
    schemaVersion: 2,
    databaseName: "cooccurrence-v2.db",
    downloadName: "cooccurrence-v2.db.gz",
    downloadUrl: "https://github.com/Aaalice233/Aaalice_NAI_Launcher/releases/download/autocomplete-data-cooccurrence-2dadc5bf-v2/cooccurrence-v2.db.gz",
    downloadSize: 31_804_631,
    downloadSha256: "63c87b92e2ae7ff7206a5ecb0012a616284fec0795a77b9e3098d64cc21ee63a",
    databaseSize: 82_505_728,
    databaseSha256: "df5e58d94d00db9e000aa7a9962e0aaf9b1615a78985fdb11a6b1c203d103a50",
    expectedTags: 31_060,
    expectedEdges: 6_473_918,
    compressed: true,
    sourceName: "newtextdoc1111/danbooru-tag-csv",
    sourceUrl: "https://huggingface.co/datasets/newtextdoc1111/danbooru-tag-csv",
    license: "MIT",
  },
};

type ActiveDownload = {
  controller: AbortController;
  received: number;
  total: number;
  startedAt: number;
  initialBytes: number;
};

const activeDownloads = new Map<ResourceDatabaseId, ActiveDownload>();
const queryCache = new Map<string, TagSuggestion[]>();
let cacheHits = 0;
let cacheMisses = 0;
const MAX_QUERY_CACHE = 240;

function resourceRoot() {
  return path.join(app.getPath("userData"), "resources", "autocomplete");
}

function databasePath(definition: ResourceDefinition) {
  return path.join(resourceRoot(), definition.databaseName);
}

function previousPath(definition: ResourceDefinition) {
  return path.join(resourceRoot(), `${definition.databaseName}.previous`);
}

function partialPath(definition: ResourceDefinition) {
  return path.join(resourceRoot(), `${definition.downloadName}.part`);
}

function stagedPath(definition: ResourceDefinition) {
  return path.join(resourceRoot(), `${definition.databaseName}.installing`);
}

async function exists(filePath: string) {
  try { await fs.access(filePath); return true; } catch { return false; }
}

async function fileSize(filePath: string) {
  try { return (await fs.stat(filePath)).size; } catch { return 0; }
}

function emit(event: ResourceDatabaseProgressEvent) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send("resource-database:progress", event);
  }
}

function progress(
  id: ResourceDatabaseId,
  phase: ResourceDatabaseProgressEvent["phase"],
  received: number,
  total: number,
  speedBytesPerSecond = 0,
  message = "",
) {
  emit({
    id,
    phase,
    receivedBytes: received,
    totalBytes: total,
    percent: total > 0 ? Math.min(100, Math.max(0, received / total * 100)) : 0,
    speedBytesPerSecond,
    message,
  });
}

async function sha256(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

function sqliteMetadata(db: DatabaseSync) {
  const rows = db.prepare("SELECT key, value FROM metadata").all() as Array<{ key: string; value: string }>;
  return Object.fromEntries(rows.map((row) => [String(row.key), String(row.value)]));
}

function tableColumns(db: DatabaseSync, table: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => String(row.name)));
}

function requireColumns(db: DatabaseSync, table: string, expected: string[]) {
  const columns = tableColumns(db, table);
  for (const column of expected) {
    if (!columns.has(column)) throw new Error(`数据库表 ${table} 缺少字段 ${column}`);
  }
}

async function validateDatabase(
  definition: ResourceDefinition,
  filePath: string,
  thorough: boolean,
  requireCurrentVersion = true,
) {
  const header = Buffer.alloc(16);
  const handle = await fs.open(filePath, "r");
  try { await handle.read(header, 0, 16, 0); } finally { await handle.close(); }
  if (header.toString("utf8") !== "SQLite format 3\u0000") throw new Error("下载内容不是 SQLite 数据库");
  const db = new DatabaseSync(filePath, { readOnly: true });
  try {
    requireColumns(db, "metadata", ["key", "value"]);
    requireColumns(db, "tags", ["id", "name"]);
    const metadata = sqliteMetadata(db);
    if (metadata.schema_version !== String(definition.schemaVersion)) throw new Error("数据库结构版本不匹配");
    if (!metadata.data_version) throw new Error("数据库缺少数据版本");
    if (requireCurrentVersion && metadata.data_version !== definition.dataVersion) throw new Error("数据库数据版本不匹配");
    if (definition.id === "tagCatalog") {
      requireColumns(db, "tags", ["category", "post_count"]);
      requireColumns(db, "aliases", ["tag_id", "alias"]);
      requireColumns(db, "tag_search", ["term", "search_key", "tag_id", "kind"]);
    } else {
      requireColumns(db, "edges", ["source_tag_id", "target_tag_id", "count"]);
    }
    if (thorough) {
      const check = db.prepare("PRAGMA quick_check").get() as Record<string, unknown> | undefined;
      if (!check || String(Object.values(check)[0]) !== "ok") throw new Error("SQLite 完整性检查失败");
      const tagCount = Number((db.prepare("SELECT COUNT(*) AS count FROM tags").get() as { count: number | bigint }).count);
      if (tagCount <= 0) throw new Error("数据库中没有标签数据");
      if (requireCurrentVersion && tagCount !== definition.expectedTags) throw new Error(`标签数量不匹配：${tagCount}`);
      if (definition.expectedEdges != null) {
        const edgeCount = Number((db.prepare("SELECT COUNT(*) AS count FROM edges").get() as { count: number | bigint }).count);
        if (edgeCount <= 0) throw new Error("数据库中没有关联数据");
        if (requireCurrentVersion && edgeCount !== definition.expectedEdges) throw new Error(`关联数量不匹配：${edgeCount}`);
      }
    }
    return metadata;
  } finally {
    db.close();
  }
}

async function installedStatus(definition: ResourceDefinition): Promise<ResourceDatabaseStatus> {
  const live = databasePath(definition);
  const installed = await exists(live);
  let valid = false;
  let version = "";
  let count = 0;
  let message = "";
  if (installed) {
    try {
      const metadata = await validateDatabase(definition, live, false, false);
      valid = true;
      version = metadata.data_version ?? definition.dataVersion;
      count = Number(metadata.tag_count ?? metadata.directed_edge_count ?? definition.expectedTags) || definition.expectedTags;
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
  }
  const active = activeDownloads.get(definition.id);
  return {
    id: definition.id,
    label: definition.label,
    description: definition.description,
    installed,
    valid,
    version,
    count,
    sizeBytes: await fileSize(live),
    downloadBytes: definition.downloadSize,
    databaseBytes: definition.databaseSize,
    downloading: Boolean(active),
    resumableBytes: await fileSize(partialPath(definition)),
    hasPrevious: await exists(previousPath(definition)),
    replacementRequiresConfirmation: true,
    sourceName: definition.sourceName,
    sourceUrl: definition.sourceUrl,
    license: definition.license,
    message,
  };
}

export async function getResourceDatabaseOverview(): Promise<ResourceDatabaseOverview> {
  await fs.mkdir(resourceRoot(), { recursive: true });
  const resources = await Promise.all(Object.values(DEFINITIONS).map(installedStatus));
  const total = cacheHits + cacheMisses;
  const cache: ResourceCacheStats = {
    memoryEntries: queryCache.size,
    memoryHits: cacheHits,
    memoryMisses: cacheMisses,
    memoryHitRate: total > 0 ? cacheHits / total : 0,
  };
  return { dataDirectory: resourceRoot(), resources, cache };
}

async function downloadToPartial(definition: ResourceDefinition) {
  await fs.mkdir(resourceRoot(), { recursive: true });
  const destination = partialPath(definition);
  let initialBytes = await fileSize(destination);
  if (initialBytes > definition.downloadSize) {
    await fs.rm(destination, { force: true });
    initialBytes = 0;
  }
  const controller = new AbortController();
  const active: ActiveDownload = {
    controller,
    received: initialBytes,
    total: definition.downloadSize,
    startedAt: Date.now(),
    initialBytes,
  };
  activeDownloads.set(definition.id, active);
  if (initialBytes === definition.downloadSize) {
    progress(definition.id, "verifying", initialBytes, definition.downloadSize, 0, "继续校验已完成的下载");
    return destination;
  }
  let response = await axios.get<NodeJS.ReadableStream>(definition.downloadUrl, {
    responseType: "stream",
    timeout: 120_000,
    signal: controller.signal,
    headers: initialBytes > 0 ? { Range: `bytes=${initialBytes}-` } : undefined,
    maxContentLength: definition.downloadSize + 1024,
    maxBodyLength: definition.downloadSize + 1024,
    ...proxyConfig("update"),
  });
  if (initialBytes > 0 && response.status !== 206) {
    await fs.rm(destination, { force: true });
    initialBytes = 0;
    active.initialBytes = 0;
    active.received = 0;
    response = await axios.get<NodeJS.ReadableStream>(definition.downloadUrl, {
      responseType: "stream",
      timeout: 120_000,
      signal: controller.signal,
      maxContentLength: definition.downloadSize + 1024,
      maxBodyLength: definition.downloadSize + 1024,
      ...proxyConfig("update"),
    });
  }
  const contentRange = String(response.headers["content-range"] ?? "");
  const rangeTotal = Number(contentRange.match(/\/(\d+)$/)?.[1] ?? 0);
  const contentLength = Number(response.headers["content-length"] ?? 0);
  active.total = rangeTotal || initialBytes + contentLength || definition.downloadSize;
  let lastEmit = 0;
  const source = response.data as NodeJS.ReadableStream & AsyncIterable<Buffer>;
  const destinationStream = createWriteStream(destination, { flags: initialBytes > 0 ? "a" : "w" });
  await pipeline(source as any, async function* (chunks: AsyncIterable<Uint8Array>) {
      for await (const chunk of chunks) {
        const bytes = Buffer.from(chunk as Uint8Array);
        active.received += bytes.length;
        const now = Date.now();
        if (now - lastEmit >= 120) {
          const elapsed = Math.max(0.1, (now - active.startedAt) / 1000);
          const speed = Math.max(0, (active.received - active.initialBytes) / elapsed);
          progress(definition.id, "downloading", active.received, active.total, speed, "正在下载");
          lastEmit = now;
        }
        yield bytes;
      }
    }, destinationStream);
  progress(definition.id, "verifying", active.received, active.total, 0, "正在校验文件");
  return destination;
}

async function verifyDownloadedFile(definition: ResourceDefinition, filePath: string, expectedSize: number, expectedSha: string) {
  const size = await fileSize(filePath);
  if (size !== expectedSize) throw new Error(`文件大小校验失败：${size} / ${expectedSize}`);
  const hash = await sha256(filePath);
  if (hash !== expectedSha) throw new Error("SHA-256 校验失败，现有数据库未被改动");
}

async function atomicallyInstall(definition: ResourceDefinition, staged: string) {
  const live = databasePath(definition);
  const previous = previousPath(definition);
  const rollback = `${live}.rollback`;
  await fs.rm(rollback, { force: true });
  if (await exists(live)) {
    const previousTemp = `${previous}.tmp`;
    await fs.rm(previousTemp, { force: true });
    await fs.copyFile(live, previousTemp);
    await fs.rm(previous, { force: true });
    await fs.rename(previousTemp, previous);
    await fs.rename(live, rollback);
  }
  try {
    await fs.rename(staged, live);
    await fs.rm(rollback, { force: true });
  } catch (error) {
    if (await exists(rollback)) await fs.rename(rollback, live);
    throw error;
  }
  queryCache.clear();
}

export async function downloadResourceDatabase(
  id: ResourceDatabaseId,
  confirmReplace = false,
): Promise<ResourceDatabaseDownloadResult> {
  const definition = DEFINITIONS[id];
  if (!definition) return { ok: false, message: "未知资源数据库" };
  if (!confirmReplace) {
    return {
      ok: false,
      requiresConfirmation: true,
      message: `${definition.label}会替换当前本地补全/相关推荐数据库。图片、参考图、预设和历史记录不会被覆盖。`,
    };
  }
  if (activeDownloads.has(id)) return { ok: false, message: "该资源正在下载" };
  try {
    const archive = await downloadToPartial(definition);
    await verifyDownloadedFile(definition, archive, definition.downloadSize, definition.downloadSha256);
    const staged = stagedPath(definition);
    await fs.rm(staged, { force: true });
    if (definition.compressed) {
      progress(id, "extracting", definition.downloadSize, definition.downloadSize, 0, "正在解压数据库");
      await pipeline(createReadStream(archive), createGunzip(), createWriteStream(staged));
      await verifyDownloadedFile(definition, staged, definition.databaseSize, definition.databaseSha256);
    } else {
      await fs.rename(archive, staged);
    }
    progress(id, "installing", definition.downloadSize, definition.downloadSize, 0, "正在验证并替换数据库");
    await validateDatabase(definition, staged, true);
    await atomicallyInstall(definition, staged);
    if (definition.compressed) await fs.rm(archive, { force: true });
    progress(id, "complete", definition.downloadSize, definition.downloadSize, 0, "安装完成");
    return { ok: true, message: `${definition.label}已安全安装；旧数据库已保留为可回滚副本。` };
  } catch (error) {
    const paused = axios.isCancel(error) || (error instanceof Error && error.name === "CanceledError");
    const message = paused ? "下载已暂停，可稍后继续。" : error instanceof Error ? error.message : String(error);
    if (!paused) {
      await fs.rm(stagedPath(definition), { force: true }).catch(() => undefined);
      if (await fileSize(partialPath(definition)) >= definition.downloadSize) {
        await fs.rm(partialPath(definition), { force: true }).catch(() => undefined);
      }
    }
    progress(id, paused ? "paused" : "error", await fileSize(partialPath(definition)), definition.downloadSize, 0, message);
    return { ok: false, paused, message };
  } finally {
    activeDownloads.delete(id);
  }
}

export function pauseResourceDatabaseDownload(id: ResourceDatabaseId) {
  const active = activeDownloads.get(id);
  if (!active) return { ok: false, message: "当前没有进行中的下载" };
  active.controller.abort();
  return { ok: true, message: "正在暂停" };
}

export async function restorePreviousResourceDatabase(id: ResourceDatabaseId, confirmed = false) {
  const definition = DEFINITIONS[id];
  if (!definition) return { ok: false, message: "未知资源数据库" };
  if (!confirmed) return { ok: false, requiresConfirmation: true, message: "恢复旧数据库会替换当前资源数据库，但不会改动任何图片或用户记录。" };
  const previous = previousPath(definition);
  if (!await exists(previous)) return { ok: false, message: "没有可恢复的旧数据库" };
  const staged = stagedPath(definition);
  try {
    await fs.rm(staged, { force: true });
    await fs.copyFile(previous, staged);
    await validateDatabase(definition, staged, true, false);
    await atomicallyInstall(definition, staged);
    progress(id, "complete", definition.databaseSize, definition.databaseSize, 0, "已恢复上一版数据库");
    return { ok: true, message: "已恢复上一版数据库。" };
  } catch (error) {
    await fs.rm(staged, { force: true }).catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    progress(id, "error", 0, definition.databaseSize, 0, message);
    return { ok: false, message: `恢复失败：${message}` };
  }
}

export async function openResourceDatabaseDirectory() {
  await fs.mkdir(resourceRoot(), { recursive: true });
  const error = await shell.openPath(resourceRoot());
  return { ok: !error, message: error || undefined };
}

export function clearResourceQueryCache() {
  queryCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
  return { ok: true };
}

function cacheGet(key: string) {
  const value = queryCache.get(key);
  if (value) { cacheHits += 1; return value; }
  cacheMisses += 1;
  return undefined;
}

function cacheSet(key: string, value: TagSuggestion[]) {
  if (queryCache.size >= MAX_QUERY_CACHE) queryCache.delete(queryCache.keys().next().value ?? "");
  queryCache.set(key, value);
  return value;
}

function withDatabase<T>(id: ResourceDatabaseId, callback: (db: DatabaseSync) => T): T | null {
  const file = databasePath(DEFINITIONS[id]);
  try {
    const db = new DatabaseSync(file, { readOnly: true });
    try { return callback(db); } finally { db.close(); }
  } catch {
    return null;
  }
}

function ftsExpression(query: string) {
  return query
    .replaceAll("_", " ")
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}()-]/gu, ""))
    .filter(Boolean)
    .map((token) => `"${token.replaceAll('"', '""')}"*`)
    .join(" ");
}

export function searchResourceTagCatalog(query: string, limit = 20): TagSuggestion[] {
  const normalized = query.trim().slice(0, 255);
  if (!normalized) return [];
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
  const key = `search:${normalized.toLowerCase()}:${safeLimit}`;
  const hit = cacheGet(key);
  if (hit) return hit;
  const expression = ftsExpression(normalized);
  if (!expression) return [];
  const result = withDatabase("tagCatalog", (db) => {
    const rows = db.prepare(`
      SELECT f.term, f.kind, t.id, t.name, t.category, t.post_count,
        (SELECT GROUP_CONCAT(alias, ' ') FROM aliases WHERE tag_id = t.id) AS aliases
      FROM tag_search f
      JOIN tags t ON t.id = f.tag_id
      WHERE tag_search MATCH ?
      ORDER BY bm25(tag_search), t.post_count DESC, t.name ASC
      LIMIT ?
    `).all(expression, safeLimit * 5) as Array<Record<string, unknown>>;
    const seen = new Set<number>();
    const output: TagSuggestion[] = [];
    for (const row of rows) {
      const id = Number(row.id);
      if (seen.has(id)) continue;
      seen.add(id);
      output.push({
        tag: String(row.name),
        category: Number(row.category),
        count: Number(row.post_count),
        description: String(row.aliases ?? "").trim(),
      });
      if (output.length >= safeLimit) break;
    }
    return output;
  }) ?? [];
  return cacheSet(key, result);
}

export function browseResourceTagCatalog(category: number, offset: number, limit: number): TagSuggestion[] {
  const safeOffset = Math.max(0, Math.trunc(offset));
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  const result = withDatabase("tagCatalog", (db) => {
    const rows = category < 0
      ? db.prepare("SELECT name, category, post_count FROM tags ORDER BY post_count DESC, name ASC LIMIT ? OFFSET ?").all(safeLimit, safeOffset)
      : db.prepare("SELECT name, category, post_count FROM tags WHERE category = ? ORDER BY post_count DESC, name ASC LIMIT ? OFFSET ?").all(category, safeLimit, safeOffset);
    return (rows as Array<Record<string, unknown>>).map((row) => ({
      tag: String(row.name), category: Number(row.category), count: Number(row.post_count), description: "",
    }));
  });
  return result ?? [];
}

/** Query the visual taxonomy and source-work namespace without loading the
 * complete Danbooru database into renderer memory. `_` is literal in SQLite
 * GLOB, so `*_(style)` follows Danbooru's qualified style-tag convention. */
export function browseResourceArtistStyleCatalog(
  scope: ArtistStyleCatalogScope,
  query: string,
  offset: number,
  limit: number,
): { items: TagSuggestion[]; total: number } | null {
  const safeOffset = Math.max(0, Math.trunc(offset));
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  const needle = query.trim().toLocaleLowerCase().replaceAll(" ", "_").slice(0, 160);
  return withDatabase("tagCatalog", (db) => {
    const exactNames = artistStyleExactNames(scope);
    const exactClause = exactNames.length > 0
      ? `name IN (${exactNames.map(() => "?").join(", ")})`
      : "0";
    const visualClause = scope === "style"
      ? "name GLOB '*_(style)'"
      : scope === "stylization" || scope === "all"
        ? `(name GLOB '*_(style)' OR ${exactClause})`
        : exactClause;
    const where = scope === "copyright"
      ? "category = 3"
      : scope === "all"
        ? `(category = 3 OR (category = 0 AND ${visualClause}))`
        : `category = 0 AND ${visualClause}`;
    const baseParams = exactNames;
    const queryWhere = needle ? " AND LOWER(name) LIKE ? ESCAPE '\\'" : "";
    const escaped = `%${needle.replace(/[\\%_]/g, (value) => `\\${value}`)}%`;
    const queryParams = needle ? [...baseParams, escaped] : baseParams;
    const totalRow = needle
      ? db.prepare(`SELECT COUNT(*) AS count FROM tags WHERE ${where}${queryWhere}`).get(...queryParams)
      : db.prepare(`SELECT COUNT(*) AS count FROM tags WHERE ${where}`).get(...baseParams);
    const rows = needle
      ? db.prepare(`SELECT name, category, post_count FROM tags WHERE ${where}${queryWhere} ORDER BY post_count DESC, name ASC LIMIT ? OFFSET ?`).all(...queryParams, safeLimit, safeOffset)
      : db.prepare(`SELECT name, category, post_count FROM tags WHERE ${where} ORDER BY post_count DESC, name ASC LIMIT ? OFFSET ?`).all(...baseParams, safeLimit, safeOffset);
    return {
      total: Number((totalRow as { count?: number | bigint } | undefined)?.count ?? 0),
      items: (rows as Array<Record<string, unknown>>).map((row) => ({
        tag: String(row.name),
        category: Number(row.category),
        count: Number(row.post_count),
        description: "",
      })),
    };
  });
}

export function relatedResourceTags(tags: string[], limit = 8): TagSuggestion[] {
  const normalized = [...new Set(tags.map((tag) => tag.trim().toLowerCase().replaceAll(" ", "_")).filter(Boolean))].slice(-12);
  if (!normalized.length) return [];
  const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
  const key = `related:${normalized.join("|")}:${safeLimit}`;
  const hit = cacheGet(key);
  if (hit) return hit;
  const result = withDatabase("cooccurrence", (db) => {
    const aggregate = new Map<string, number>();
    const statement = db.prepare(`
      SELECT target.name AS related_tag, edge.count AS count
      FROM tags source
      JOIN edges edge ON edge.source_tag_id = source.id
      JOIN tags target ON target.id = edge.target_tag_id
      WHERE source.name = ? COLLATE NOCASE
      ORDER BY edge.count DESC
      LIMIT 48
    `);
    for (const tag of normalized) {
      for (const row of statement.all(tag) as Array<{ related_tag: string; count: number | bigint }>) {
        const related = String(row.related_tag);
        if (normalized.includes(related.toLowerCase())) continue;
        aggregate.set(related, (aggregate.get(related) ?? 0) + Number(row.count));
      }
    }
    return [...aggregate.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, safeLimit)
      .map(([tag, count]) => ({ tag, count, category: 0, description: "本地共现数据库" }));
  }) ?? [];
  return cacheSet(key, result);
}
