import { app, dialog, nativeImage } from "electron";
import axios from "axios";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { toLocalMediaUrl } from "./local-media-protocol";
import type {
  ArtistDiscoveryResult,
  ArtistLabImageScore,
  ArtistLabModelMode,
  ArtistLabModelStatus,
  ArtistTagRecord,
  ArtistRankingSnapshot,
} from "../../src/artist-lab";
import type { ArtistStylePreviewResult } from "../../src/types";
import { ARTIST_TAG_ALIASES, CURATED_ARTIST_TAGS } from "../../src/curated-artists";
import { proxyConfig } from "./proxy";

const DANBOORU_TAGS_URL = "https://danbooru.donmai.us/tags.json";
const DANBOORU_POSTS_URL = "https://danbooru.donmai.us/posts.json";
const POPULAR_ARTIST_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const MODEL_IDS: Record<ArtistLabModelMode, string> = {
  // Base/full precision is the default Windows scorer. It is materially more
  // accurate than the small quantized fallback without shipping model weights
  // inside every installer.
  high: "onnx-community/dinov2-base",
  light: "onnx-community/dinov2-small",
};
const pipelines = new Map<ArtistLabModelMode, any>();
const loading = new Map<ArtistLabModelMode, Promise<any>>();
const embeddingCache = new Map<string, Float32Array>();

function modelCacheDir() {
  return path.join(app.getPath("userData"), "artist-lab-model-cache");
}

function popularArtistCacheFile() {
  return path.join(app.getPath("userData"), "artist-lab-popular-artists.json");
}

function referenceCacheDir() {
  return path.join(app.getPath("userData"), "artist-lab-reference-cache");
}

function stylePreviewCacheDir() {
  return path.join(app.getPath("userData"), "artist-style-preview-cache");
}

function directoryStats(root: string): { bytes: number; files: number } {
  if (!fs.existsSync(root)) return { bytes: 0, files: 0 };
  let bytes = 0;
  let files = 0;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) {
        files += 1;
        try { bytes += fs.statSync(full).size; } catch { /* best effort */ }
      }
    }
  }
  return { bytes, files };
}

export async function pickArtistLabTarget() {
  const result = await dialog.showOpenDialog({
    title: "选择目标画风图片",
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const size = nativeImage.createFromPath(filePath).getSize();
  return {
    filePath,
    fileUrl: toLocalMediaUrl(filePath),
    name: path.basename(filePath),
    width: size.width,
    height: size.height,
  };
}

function safeArtistQuery(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 120)
    : "";
}

function canonicalArtistName(value: unknown): string {
  const normalized = typeof value === "string"
    ? value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "_")
    : "";
  return ARTIST_TAG_ALIASES[normalized] ?? normalized;
}

export async function searchArtistTags(rawQuery: unknown, rawLimit: unknown): Promise<ArtistTagRecord[]> {
  const query = safeArtistQuery(rawQuery);
  const limit = Math.max(1, Math.min(100, Number(rawLimit) || 40));
  return fetchArtistTagsPage(query, limit, 1);
}

async function fetchArtistTagsPage(query: string, limit: number, page: number): Promise<ArtistTagRecord[]> {
  const response = await axios.get(DANBOORU_TAGS_URL, {
    timeout: 30_000,
    headers: {
      Accept: "application/json",
      "User-Agent": "Langbai-NovelAI-Studio/Artist-Lab",
    },
    params: {
      limit,
      page,
      "search[category]": 1,
      "search[order]": "count",
      ...(query ? { "search[name_matches]": `*${query}*` } : {}),
    },
    ...proxyConfig("update"),
  });
  if (!Array.isArray(response.data)) return [];
  return response.data
    .map((item: any): ArtistTagRecord | null => {
      const id = Number(item?.id);
      const name = typeof item?.name === "string" ? item.name.trim() : "";
      if (!Number.isSafeInteger(id) || !name || Number(item?.category) !== 1) return null;
      return {
        id,
        name,
        postCount: Math.max(0, Number(item?.post_count) || 0),
        deprecated: Boolean(item?.is_deprecated),
      };
    })
    .filter((item: ArtistTagRecord | null): item is ArtistTagRecord => Boolean(item) && !item!.deprecated);
}

function appendCuratedArtistTags(items: ArtistTagRecord[], includeCurated: boolean): ArtistTagRecord[] {
  const normalizedItems = items
    .filter((item) => Number.isSafeInteger(item.id) && item.id > 0 && !item.deprecated)
    .map((item) => ({ ...item, name: canonicalArtistName(item.name) }))
    .filter((item) => Boolean(item.name));
  const seenIds = new Set(normalizedItems.map((item) => item.id));
  const seenNames = new Set(normalizedItems.map((item) => item.name));
  const deduplicated = normalizedItems.filter((item, index) => (
    normalizedItems.findIndex((candidate) => candidate.id === item.id || candidate.name === item.name) === index
  ));
  if (!includeCurated) return deduplicated;
  return [
    ...deduplicated,
    ...CURATED_ARTIST_TAGS.filter((item) => !seenIds.has(item.id) && !seenNames.has(canonicalArtistName(item.name))),
  ];
}

export async function loadPopularArtistTags(
  rawLimit: unknown,
  rawForce: unknown,
  rawIncludeCurated: unknown = false,
): Promise<ArtistTagRecord[]> {
  const limit = Math.max(20, Math.min(5000, Math.floor(Number(rawLimit) || 300)));
  const force = rawForce === true;
  const includeCurated = rawIncludeCurated === true;
  let cachedItems: ArtistTagRecord[] = [];
  try {
    const cached = JSON.parse(fs.readFileSync(popularArtistCacheFile(), "utf8")) as {
      savedAt?: number;
      items?: ArtistTagRecord[];
    };
    if (Array.isArray(cached.items)) cachedItems = appendCuratedArtistTags(cached.items, false);
    if (!force) {
      if (
        Number.isFinite(cached.savedAt) &&
        Date.now() - Number(cached.savedAt) < POPULAR_ARTIST_CACHE_MAX_AGE &&
        cachedItems.length >= limit
      ) {
        return appendCuratedArtistTags(cachedItems.slice(0, limit), includeCurated);
      }
    }
  } catch {
    // Missing or unreadable cache falls through to the live ranking.
  }

  const output: ArtistTagRecord[] = force ? [] : [...cachedItems];
  const seen = new Set<number>(output.map((item) => item.id));
  try {
    const startPage = Math.floor(output.length / 100) + 1;
    for (let page = startPage; output.length < limit; page += 1) {
      const pageSize = Math.min(100, limit - output.length);
      const batch = await fetchArtistTagsPage("", pageSize, page);
      if (batch.length === 0) break;
      for (const artist of batch) {
        if (!seen.has(artist.id)) {
          seen.add(artist.id);
          output.push(artist);
        }
      }
      if (batch.length < pageSize) break;
    }
  } catch (error) {
    if (cachedItems.length > 0) return appendCuratedArtistTags(cachedItems.slice(0, limit), includeCurated);
    throw error;
  }
  output.sort((left, right) => right.postCount - left.postCount || left.name.localeCompare(right.name));
  try {
    fs.writeFileSync(popularArtistCacheFile(), JSON.stringify({ savedAt: Date.now(), items: output }), "utf8");
  } catch {
    // The ranking is still usable for this session if persistence fails.
  }
  return appendCuratedArtistTags(output.slice(0, limit), includeCurated);
}

/** Live/cache-backed Danbooru ranking without curated rows whose synthetic
 * post counts would corrupt the order. */
export async function loadPopularArtistRanking(
  rawLimit: unknown,
  rawForce: unknown,
): Promise<ArtistRankingSnapshot> {
  const items = await loadPopularArtistTags(rawLimit, rawForce, false);
  let savedAt = Date.now();
  try {
    const cached = JSON.parse(fs.readFileSync(popularArtistCacheFile(), "utf8")) as { savedAt?: number };
    if (Number.isFinite(cached.savedAt)) savedAt = Number(cached.savedAt);
  } catch { /* use the successful read time */ }
  return { items, savedAt };
}

async function scorer(mode: ArtistLabModelMode) {
  const existing = pipelines.get(mode);
  if (existing) return existing;
  const pending = loading.get(mode);
  if (pending) return pending;
  const promise = (async () => {
    const transformers = await import("@huggingface/transformers");
    transformers.env.cacheDir = modelCacheDir();
    transformers.env.allowLocalModels = false;
    transformers.env.allowRemoteModels = true;
    const pipe = await transformers.pipeline(
      "image-feature-extraction",
      MODEL_IDS[mode],
      { dtype: mode === "high" ? "fp32" : "q8" } as any,
    );
    pipelines.set(mode, pipe);
    return pipe;
  })();
  loading.set(mode, promise);
  try {
    return await promise;
  } finally {
    loading.delete(mode);
  }
}

function cosine(left: Float32Array | number[], right: Float32Array | number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let a = 0;
  let b = 0;
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    a += left[index] * left[index];
    b += right[index] * right[index];
  }
  return a > 0 && b > 0 ? dot / Math.sqrt(a * b) : 0;
}

function normalized(values: Float32Array): Float32Array {
  let magnitude = 0;
  for (const value of values) magnitude += value * value;
  const scale = magnitude > 0 ? 1 / Math.sqrt(magnitude) : 1;
  const output = new Float32Array(values.length);
  for (let index = 0; index < values.length; index += 1) output[index] = values[index] * scale;
  return output;
}

async function embedding(pipe: any, filePath: string): Promise<Float32Array> {
  if (!path.isAbsolute(filePath) || !fs.existsSync(filePath)) throw new Error("Image file is unavailable");
  const stat = fs.statSync(filePath);
  const key = `style-v3:${filePath}:${stat.size}:${stat.mtimeMs}`;
  const cached = embeddingCache.get(key);
  if (cached) return cached;
  const output = await pipe(filePath);
  const data = output?.data;
  if (!data || typeof data.length !== "number") throw new Error("The scoring model returned no image features");
  const values = data instanceof Float32Array ? data : Float32Array.from(data);
  const dims = Array.isArray(output?.dims) ? output.dims.map(Number) : [];
  // DINOv2 returns [batch, CLS + patch tokens, hidden size]. A CLS-only score
  // over-weights subject/composition, while flattening all patches over-weights
  // exact spatial alignment. Blend a normalized global token with the mean
  // local-patch token so linework, rendering and texture influence the score
  // without requiring the candidate to copy the target pose pixel-for-pixel.
  if (dims.length === 3 && dims[0] === 1 && dims[2] > 0 && values.length >= dims[2]) {
    const hidden = dims[2];
    const tokenCount = Math.max(1, Math.min(dims[1], Math.floor(values.length / hidden)));
    const global = normalized(values.slice(0, hidden));
    const local = new Float32Array(hidden);
    const localVariance = new Float32Array(hidden);
    const patchCount = Math.max(1, tokenCount - 1);
    for (let token = 1; token < tokenCount; token += 1) {
      const offset = token * hidden;
      for (let index = 0; index < hidden; index += 1) local[index] += values[offset + index] / patchCount;
    }
    for (let token = 1; token < tokenCount; token += 1) {
      const offset = token * hidden;
      for (let index = 0; index < hidden; index += 1) {
        const delta = values[offset + index] - local[index];
        localVariance[index] += (delta * delta) / patchCount;
      }
    }
    for (let index = 0; index < hidden; index += 1) localVariance[index] = Math.sqrt(localVariance[index]);
    const normalizedLocal = normalized(local);
    const normalizedVariance = normalized(localVariance);
    const vector = new Float32Array(hidden * 3);
    const globalScale = Math.sqrt(.28);
    const localScale = Math.sqrt(.48);
    const varianceScale = Math.sqrt(.24);
    for (let index = 0; index < hidden; index += 1) {
      vector[index] = global[index] * globalScale;
      vector[hidden + index] = normalizedLocal[index] * localScale;
      vector[hidden * 2 + index] = normalizedVariance[index] * varianceScale;
    }
    embeddingCache.set(key, vector);
    return vector;
  }
  embeddingCache.set(key, values);
  return values;
}

function referenceFile(artist: ArtistTagRecord, sourceUrl: string): string {
  const extension = (() => {
    try {
      const ext = path.extname(new URL(sourceUrl).pathname).toLowerCase();
      return [".png", ".jpg", ".jpeg", ".webp"].includes(ext) ? ext : ".jpg";
    } catch { return ".jpg"; }
  })();
  const safe = artist.name.replace(/[^a-z0-9_()-]+/gi, "_").slice(0, 90);
  const hash = crypto.createHash("sha1").update(sourceUrl).digest("hex").slice(0, 12);
  return path.join(referenceCacheDir(), `${artist.id}-${safe}-${hash}${extension}`);
}

function absoluteDanbooruMediaUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return `https://danbooru.donmai.us${trimmed}`;
  if (/^http:\/\//i.test(trimmed)) return trimmed.replace(/^http:\/\//i, "https://");
  return /^https:\/\//i.test(trimmed) ? trimmed : "";
}

const danbooruImageHeaders = {
  Accept: "image/*",
  Referer: "https://danbooru.donmai.us/",
  "User-Agent": "Langbai-NovelAI-Studio/Artist-Preview",
};

async function representativeImages(artist: ArtistTagRecord, limit = 3): Promise<string[]> {
  const manifestFile = path.join(referenceCacheDir(), `${artist.id}.json`);
  const cachedFiles: string[] = [];
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as { file?: string; files?: string[] };
    for (const file of manifest.files ?? (manifest.file ? [manifest.file] : [])) {
      if (typeof file === "string" && fs.existsSync(file) && !cachedFiles.includes(file)) cachedFiles.push(file);
    }
    if (cachedFiles.length >= limit) return cachedFiles.slice(0, limit);
  } catch { /* live lookup */ }
  const response = await axios.get(DANBOORU_POSTS_URL, {
    timeout: 30_000,
    headers: { Accept: "application/json", "User-Agent": "Langbai-NovelAI-Studio/Artist-Lab" },
    params: { limit: 12, tags: `${artist.name} rating:g order:rank` },
    ...proxyConfig("update"),
  });
  fs.mkdirSync(referenceCacheDir(), { recursive: true });
  const files = [...cachedFiles];
  const sourceUrls: string[] = [];
  for (const post of Array.isArray(response.data) ? response.data : []) {
    if (files.length >= limit) break;
    const sourceUrl = [post?.large_file_url, post?.file_url, post?.preview_file_url]
      .map(absoluteDanbooruMediaUrl)
      .find(Boolean);
    if (!sourceUrl || sourceUrls.includes(sourceUrl)) continue;
    sourceUrls.push(sourceUrl);
    const file = referenceFile(artist, sourceUrl);
    try {
      if (!fs.existsSync(file)) {
        const image = await axios.get<ArrayBuffer>(sourceUrl, {
          responseType: "arraybuffer",
          timeout: 45_000,
          maxContentLength: 12 * 1024 * 1024,
          headers: danbooruImageHeaders,
          ...proxyConfig("update"),
        });
        const bytes = Buffer.from(image.data);
        if (bytes.length < 128 || bytes.length > 12 * 1024 * 1024) continue;
        fs.writeFileSync(file, bytes);
      }
      if (!files.includes(file)) files.push(file);
    } catch {
      // A single stale CDN object must not discard the artist candidate.
    }
  }
  if (files.length > 0) {
    fs.writeFileSync(manifestFile, JSON.stringify({ file: files[0], files, sourceUrls, savedAt: Date.now() }), "utf8");
  }
  return files.slice(0, limit);
}

type StylePreviewManifest = ArtistStylePreviewResult & { filePath: string; savedAt: number };
const pendingStylePreviews = new Map<string, Promise<ArtistStylePreviewResult | null>>();

function safeStylePreviewTag(value: unknown): string {
  if (typeof value !== "string") return "";
  const tag = value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, "_");
  // Reject Danbooru metatags (rating:, order:, -tag, etc.). The picker only
  // sends canonical tag names, and the renderer never gets to change the safe
  // rating/order constraints appended below.
  return /^[a-z0-9][a-z0-9_()!'.+\-]{0,159}$/.test(tag) ? tag : "";
}

function stylePreviewFiles(tag: string, sourceUrl?: string) {
  const key = crypto.createHash("sha1").update(tag).digest("hex").slice(0, 20);
  const manifestFile = path.join(stylePreviewCacheDir(), `${key}.json`);
  if (!sourceUrl) return { manifestFile, imageFile: "" };
  const extension = (() => {
    try {
      const ext = path.extname(new URL(sourceUrl).pathname).toLocaleLowerCase();
      return [".png", ".jpg", ".jpeg", ".webp"].includes(ext) ? ext : ".jpg";
    } catch {
      return ".jpg";
    }
  })();
  return { manifestFile, imageFile: path.join(stylePreviewCacheDir(), `${key}${extension}`) };
}

async function loadArtistStylePreview(tag: string): Promise<ArtistStylePreviewResult | null> {
  const { manifestFile } = stylePreviewFiles(tag);
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as StylePreviewManifest;
    if (manifest.tag === tag && path.isAbsolute(manifest.filePath) && fs.existsSync(manifest.filePath)) {
      return {
        tag,
        imageUrl: toLocalMediaUrl(manifest.filePath),
        sourceUrl: manifest.sourceUrl,
        postUrl: manifest.postUrl,
        width: manifest.width,
        height: manifest.height,
      };
    }
  } catch {
    // Missing or stale cache: resolve one safe-rated representative below.
  }

  type PreviewPost = Record<string, unknown>;
  const posts: PreviewPost[] = [];
  const seenPosts = new Set<number>();
  const baseTag = tag.replace(/_\(style\)$/i, "");
  const queries = [
    `${tag} rating:g order:score`,
    `${tag} rating:s order:score`,
    `${tag} order:score`,
    tag,
  ];
  if (baseTag && baseTag !== tag) queries.push(`${baseTag} rating:g order:score`, `${baseTag} order:score`, baseTag);
  for (const tags of queries) {
    try {
      const response = await axios.get(DANBOORU_POSTS_URL, {
        timeout: 30_000,
        headers: { Accept: "application/json", "User-Agent": "Langbai-NovelAI-Studio/Style-Preview" },
        params: { limit: 40, tags },
        ...proxyConfig("update"),
      });
      for (const candidate of Array.isArray(response.data) ? response.data : []) {
        const id = Number(candidate?.id);
        if (!Number.isFinite(id) || seenPosts.has(id)) continue;
        seenPosts.add(id);
        posts.push(candidate as PreviewPost);
      }
      if (posts.length > 0) break;
    } catch {
      // Try the next, less restrictive form. Some Danbooru deployments reject
      // ranking metatags for anonymous requests even though plain tag lookup works.
    }
  }
  const ratingPriority: Record<string, number> = { g: 0, s: 1, q: 2, e: 3 };
  posts.sort((left, right) =>
    (ratingPriority[String(left.rating)] ?? 4) - (ratingPriority[String(right.rating)] ?? 4));

  fs.mkdirSync(stylePreviewCacheDir(), { recursive: true });
  for (const post of posts.slice(0, 16)) {
    const urls = [post.preview_file_url, post.large_file_url, post.file_url]
      .map(absoluteDanbooruMediaUrl)
      .filter(Boolean);
    for (const sourceUrl of [...new Set(urls)]) {
      try {
        const { imageFile } = stylePreviewFiles(tag, sourceUrl);
        if (!fs.existsSync(imageFile)) {
          const image = await axios.get<ArrayBuffer>(sourceUrl, {
            responseType: "arraybuffer",
            timeout: 45_000,
            maxContentLength: 12 * 1024 * 1024,
            headers: danbooruImageHeaders,
            ...proxyConfig("update"),
          });
          const bytes = Buffer.from(image.data);
          if (bytes.length < 128 || bytes.length > 12 * 1024 * 1024) continue;
          fs.writeFileSync(imageFile, bytes);
        }
        const result: ArtistStylePreviewResult = {
          tag,
          imageUrl: toLocalMediaUrl(imageFile),
          sourceUrl,
          postUrl: Number.isFinite(Number(post.id)) ? `https://danbooru.donmai.us/posts/${Number(post.id)}` : "https://danbooru.donmai.us/",
          width: Math.max(0, Number(post.image_width) || 0),
          height: Math.max(0, Number(post.image_height) || 0),
        };
        const manifest: StylePreviewManifest = { ...result, imageUrl: "", filePath: imageFile, savedAt: Date.now() };
        fs.writeFileSync(manifestFile, JSON.stringify(manifest), "utf8");
        return result;
      } catch {
        // A removed CDN object should not make the entire style unavailable;
        // continue through the other post/URL candidates.
      }
    }
  }
  return null;
}

/** Fetch one Danbooru example lazily, preferring general/sensitive ratings. */
export async function artistStylePreview(rawTag: unknown): Promise<ArtistStylePreviewResult | null> {
  const tag = safeStylePreviewTag(rawTag);
  if (!tag) return null;
  const pending = pendingStylePreviews.get(tag);
  if (pending) return pending;
  const request = loadArtistStylePreview(tag).finally(() => pendingStylePreviews.delete(tag));
  pendingStylePreviews.set(tag, request);
  return request;
}

async function mapLimit<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await task(items[index]);
    }
  }));
  return output;
}

export async function discoverSimilarArtists(
  rawMode: unknown,
  rawTargetPath: unknown,
  rawOffset: unknown,
  rawScanCount: unknown,
  rawShortlist: unknown,
  rawForce: unknown,
): Promise<ArtistDiscoveryResult> {
  const mode: ArtistLabModelMode = rawMode === "light" ? "light" : "high";
  if (typeof rawTargetPath !== "string" || !path.isAbsolute(rawTargetPath) || !fs.existsSync(rawTargetPath)) {
    throw new Error("Target image is unavailable");
  }
  const offset = Math.max(0, Math.floor(Number(rawOffset) || 0));
  const scanCount = Math.max(10, Math.min(120, Math.floor(Number(rawScanCount) || 40)));
  const shortlist = Math.max(4, Math.min(scanCount, Math.floor(Number(rawShortlist) || 20)));
  const pool = await loadPopularArtistTags(offset + scanCount, rawForce);
  const candidates = pool.slice(offset, offset + scanCount);
  const pipe = await scorer(mode);
  const target = await embedding(pipe, rawTargetPath);
  const matches = (await mapLimit(candidates, 5, async (artist) => {
    try {
      const filePaths = await representativeImages(artist, 3);
      if (filePaths.length === 0) return null;
      const vectors = await Promise.all(filePaths.map((filePath) => embedding(pipe, filePath)));
      const similarities = vectors
        .map((vector) => Math.max(0, Math.min(1, cosine(target, vector))))
        .sort((left, right) => right - left);
      const similarity = similarities.reduce((sum, value) => sum + value, 0) / similarities.length;
      return {
        artist,
        similarity,
        referencePath: filePaths[0],
        referenceUrl: toLocalMediaUrl(filePaths[0]),
      };
    } catch { return null; }
  }))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, shortlist);
  return {
    matches,
    scanned: candidates.length,
    nextOffset: offset + candidates.length,
    poolSize: pool.length,
    cachedBytes: directoryStats(referenceCacheDir()).bytes,
  };
}

export async function scoreArtistLabImages(
  rawMode: unknown,
  targetPath: unknown,
  candidatePath: unknown,
): Promise<ArtistLabImageScore> {
  const mode: ArtistLabModelMode = rawMode === "light" ? "light" : "high";
  if (typeof targetPath !== "string" || typeof candidatePath !== "string") throw new Error("Invalid image path");
  const pipe = await scorer(mode);
  const [target, candidate] = await Promise.all([
    embedding(pipe, targetPath),
    embedding(pipe, candidatePath),
  ]);
  // DINO image embeddings are compared directly. Remapping [-1, 1] to [0, 1]
  // would make unrelated images appear to start around 50% similar.
  const similarity = Math.max(0, Math.min(1, cosine(target, candidate)));
  return { similarity, model: MODEL_IDS[mode] };
}

export function artistLabModelStatus(rawMode: unknown): ArtistLabModelStatus {
  const mode: ArtistLabModelMode = rawMode === "light" ? "light" : "high";
  const stats = directoryStats(modelCacheDir());
  return { mode, modelId: MODEL_IDS[mode], cachedBytes: stats.bytes, cachedFiles: stats.files };
}

export async function clearArtistLabModels(): Promise<ArtistLabModelStatus> {
  for (const pipe of pipelines.values()) {
    try { await pipe.dispose?.(); } catch { /* best effort */ }
  }
  pipelines.clear();
  embeddingCache.clear();
  if (loading.size > 0) throw new Error("Model is still loading; try again after it finishes");
  fs.rmSync(modelCacheDir(), { recursive: true, force: true });
  return artistLabModelStatus("high");
}
