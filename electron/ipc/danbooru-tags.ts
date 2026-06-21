// Local Danbooru tag index for tag autocomplete.
//
// Source: SuzumiyaAkizuki/DanbooruSearchOnline `tags_enhanced.csv` — Danbooru
// tags (>=100 posts, general/character/copyright) WITH Chinese translations.
// Columns: name, cn_name, wiki, post_count, category, nsfw.
//
// REQUIREMENT: every suggested tag must have a Chinese translation, so the index
// keeps ONLY rows whose cn_name is non-empty. (This is why we use this curated
// bilingual set rather than a larger English-only list — coverage is bounded by
// what actually has Chinese.)
//
// LICENSING NOTE: this dataset is GPL-3.0 while the app is MIT, so it is NOT
// bundled. It is an OPTIONAL, user-initiated download into the app-data dir; the
// app ships and works without it (built-in dictionary fallback).
//
// ENCODING NOTE: the CSV is GBK-encoded (verified bytes B8F6 C5AE BAA2 = 个女孩),
// NOT UTF-8 — decode with TextDecoder("gbk").

import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { app } from "electron";
import type { TagSuggestion } from "../../src/types";
import { proxyConfig } from "./proxy";

// Pinned to a specific commit (NOT the mutable `main` branch) so the downloaded
// data can't silently change shape underneath us.
const PINNED_COMMIT = "2975a0aae0a375abf9d3f7abadc19276633a8e42";
const CN_CSV_URL = `https://raw.githubusercontent.com/SuzumiyaAkizuki/DanbooruSearchOnline/${PINNED_COMMIT}/origin_database/tags_enhanced.csv`;
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024; // hard size cap
const MIN_RECORDS = 10_000; // sanity floor for a valid dataset

interface DanbooruTag {
  name: string; // English tag (danbooru underscore form)
  cn: string[]; // Chinese aliases/translations (always non-empty in the index)
  post: number; // post count
  category: number; // 0 general, 1 artist, 3 copyright, 4 character, 5 meta
}

let index: DanbooruTag[] | null = null;
let loading: Promise<DanbooruTag[]> | null = null;

function dataPath(): string {
  return path.join(app.getPath("userData"), "danbooru-cn.csv");
}

// "downloaded" means present AND valid (parses with enough Chinese records). A
// corrupt/truncated file reports downloaded:false so the UI offers re-download.
export async function danbooruStatus(): Promise<{ downloaded: boolean; sizeBytes: number; count: number }> {
  let sizeBytes = 0;
  try {
    sizeBytes = (await fs.stat(dataPath())).size;
  } catch {
    return { downloaded: false, sizeBytes: 0, count: 0 };
  }
  try {
    const idx = await loadDanbooruIndex();
    return { downloaded: idx.length >= MIN_RECORDS, sizeBytes, count: idx.length };
  } catch {
    return { downloaded: false, sizeBytes, count: 0 };
  }
}

export async function downloadDanbooruTags(): Promise<{ ok: boolean; message: string; count?: number }> {
  let buf: Buffer;
  try {
    const res = await axios.get(CN_CSV_URL, {
      responseType: "arraybuffer",
      timeout: 120_000,
      maxContentLength: MAX_DOWNLOAD_BYTES,
      maxBodyLength: MAX_DOWNLOAD_BYTES,
      ...proxyConfig("nai"),
    });
    buf = Buffer.from(res.data);
  } catch (error: any) {
    return { ok: false, message: `下载失败：${error?.message ?? "未知错误"}` };
  }
  if (buf.length > MAX_DOWNLOAD_BYTES) {
    return { ok: false, message: "下载内容超过 20MB 上限，已放弃。" };
  }
  // Validate BEFORE touching the live file: header shape + record count.
  let parsed: DanbooruTag[];
  try {
    parsed = parseIndexFromBuffer(buf);
  } catch (error: any) {
    return { ok: false, message: `数据校验失败：${error?.message ?? "格式不符"}，未覆盖现有文件。` };
  }
  if (parsed.length < MIN_RECORDS) {
    return { ok: false, message: `数据校验失败：仅解析出 ${parsed.length} 条（< ${MIN_RECORDS}），未覆盖现有文件。` };
  }
  // Atomic replace: write a temp file, then rename over the real one.
  const tmp = `${dataPath()}.tmp`;
  try {
    await fs.writeFile(tmp, buf);
    await fs.rename(tmp, dataPath());
  } catch (error: any) {
    try {
      await fs.rm(tmp, { force: true });
    } catch {
      /* ignore */
    }
    return { ok: false, message: `写入失败：${error?.message ?? "未知错误"}` };
  }
  index = parsed;
  loading = null;
  return { ok: true, message: `已下载中文标签库（${parsed.length} 条，均含中文）。`, count: parsed.length };
}

// Minimal CSV line parser: handles double-quoted fields containing commas and ""
// escapes (cn_name and wiki are quoted).
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// Parse + validate a GBK CSV buffer into the index. Throws on a wrong header so
// a corrupt/HTML/error-page download is rejected rather than silently accepted.
function parseIndexFromBuffer(buf: Buffer): DanbooruTag[] {
  const text = new TextDecoder("gbk").decode(buf);
  const lines = text.split(/\r?\n/);
  const header = (lines[0] ?? "").toLowerCase();
  if (!header.includes("name") || !header.includes("cn_name")) {
    throw new Error("表头不符（缺少 name/cn_name 列）");
  }
  const out: DanbooruTag[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    const cols = parseCsvLine(line);
    const name = cols[0]?.trim();
    if (!name) continue;
    const cn = (cols[1] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (cn.length === 0) continue; // REQUIREMENT: every tag must have Chinese
    const post = Number.parseInt(cols[3], 10) || 0;
    const category = Number.parseInt(cols[4], 10) || 0;
    out.push({ name, cn, post, category });
  }
  out.sort((a, b) => b.post - a.post);
  return out;
}

export async function loadDanbooruIndex(): Promise<DanbooruTag[]> {
  if (index) return index;
  if (loading) return loading;
  loading = (async () => {
    try {
      const out = parseIndexFromBuffer(await fs.readFile(dataPath()));
      index = out;
      return out;
    } catch (error) {
      loading = null; // allow a later retry (e.g. after re-download)
      throw error;
    }
  })();
  return loading;
}

/**
 * Browse the local index by frequency for the inspiration capsule. The index is
 * already sorted by post_count desc, so slicing yields the most-used tags first.
 * `category` is a Danbooru category code (0 general, 1 artist, 3 copyright, 4
 * character); pass -1 for all categories. Paginated via offset/limit.
 */
export async function browseDanbooru(category: number, offset: number, limit: number): Promise<TagSuggestion[]> {
  let idx: DanbooruTag[];
  try {
    idx = await loadDanbooruIndex();
  } catch {
    return [];
  }
  const filtered = category < 0 ? idx : idx.filter((t) => t.category === category);
  return filtered.slice(offset, offset + limit).map((t) => ({
    tag: t.name,
    count: t.post,
    category: t.category,
    description: t.cn.join(" "),
  }));
}

/**
 * Search the local index. Chinese queries match the cn aliases; latin queries
 * match the English tag name. Scored exact > prefix > substring, tie-broken by
 * post count, mapped to the shared TagSuggestion shape so the existing
 * autocomplete dropdown renders them (every entry carries Chinese).
 */
export async function searchDanbooru(query: string, limit = 12): Promise<TagSuggestion[]> {
  const raw = query.trim();
  if (!raw) return [];
  let idx: DanbooruTag[];
  try {
    idx = await loadDanbooruIndex();
  } catch {
    return []; // not downloaded yet
  }
  if (idx.length === 0) return [];
  const isCjk = /[㐀-鿿]/.test(raw);
  const q = raw.toLowerCase();
  const normalized = q.replace(/_/g, " ");
  const scored: Array<{ t: DanbooruTag; score: number }> = [];
  for (const t of idx) {
    let score = 0;
    if (isCjk) {
      for (const c of t.cn) {
        if (c === raw) {
          score = 3;
          break;
        }
        if (c.startsWith(raw)) score = Math.max(score, 2);
        else if (c.includes(raw)) score = Math.max(score, 1);
      }
    } else {
      const name = t.name.toLowerCase().replace(/_/g, " ");
      if (name === normalized) score = 3;
      else if (name.startsWith(normalized)) score = 2;
      else if (name.includes(normalized)) score = 1;
    }
    if (score > 0) scored.push({ t, score });
  }
  scored.sort((a, b) => b.score - a.score || b.t.post - a.t.post);
  return scored.slice(0, limit).map(({ t }) => ({
    tag: t.name,
    count: t.post,
    category: t.category,
    description: t.cn.join(" "),
  }));
}
