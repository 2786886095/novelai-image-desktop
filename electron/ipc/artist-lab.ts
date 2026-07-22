import { app, dialog } from "electron";
import axios from "axios";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import type {
  ArtistLabImageScore,
  ArtistLabModelMode,
  ArtistLabModelStatus,
  ArtistTagRecord,
} from "../../src/artist-lab";
import { proxyConfig } from "./proxy";

const DANBOORU_TAGS_URL = "https://danbooru.donmai.us/tags.json";
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

function modelCacheDir() {
  return path.join(app.getPath("userData"), "artist-lab-model-cache");
}

function popularArtistCacheFile() {
  return path.join(app.getPath("userData"), "artist-lab-popular-artists.json");
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
  return { filePath, fileUrl: pathToFileURL(filePath).toString(), name: path.basename(filePath) };
}

function safeArtistQuery(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 120)
    : "";
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

export async function loadPopularArtistTags(rawLimit: unknown, rawForce: unknown): Promise<ArtistTagRecord[]> {
  const limit = Math.max(20, Math.min(500, Number(rawLimit) || 300));
  const force = rawForce === true;
  let cachedItems: ArtistTagRecord[] = [];
  try {
    const cached = JSON.parse(fs.readFileSync(popularArtistCacheFile(), "utf8")) as {
      savedAt?: number;
      items?: ArtistTagRecord[];
    };
    if (Array.isArray(cached.items)) cachedItems = cached.items;
    if (!force) {
      if (
        Number.isFinite(cached.savedAt) &&
        Date.now() - Number(cached.savedAt) < POPULAR_ARTIST_CACHE_MAX_AGE &&
        cachedItems.length >= limit
      ) {
        return cachedItems.slice(0, limit);
      }
    }
  } catch {
    // Missing or unreadable cache falls through to the live ranking.
  }

  const output: ArtistTagRecord[] = [];
  const seen = new Set<number>();
  try {
    for (let page = 1; output.length < limit && page <= 5; page += 1) {
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
    if (cachedItems.length > 0) return cachedItems.slice(0, limit);
    throw error;
  }
  output.sort((left, right) => right.postCount - left.postCount || left.name.localeCompare(right.name));
  try {
    fs.writeFileSync(popularArtistCacheFile(), JSON.stringify({ savedAt: Date.now(), items: output }), "utf8");
  } catch {
    // The ranking is still usable for this session if persistence fails.
  }
  return output.slice(0, limit);
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

async function embedding(pipe: any, filePath: string): Promise<Float32Array> {
  if (!path.isAbsolute(filePath) || !fs.existsSync(filePath)) throw new Error("Image file is unavailable");
  const output = await pipe(filePath);
  const data = output?.data;
  if (!data || typeof data.length !== "number") throw new Error("The scoring model returned no image features");
  const values = data instanceof Float32Array ? data : Float32Array.from(data);
  const dims = Array.isArray(output?.dims) ? output.dims.map(Number) : [];
  // DINOv2 returns [batch, CLS + patch tokens, hidden size]. The CLS token is
  // its global image representation. Comparing the entire flattened patch map
  // would over-weight identical composition and punish the same style in a
  // different pose, which is the opposite of this tool's purpose.
  if (dims.length === 3 && dims[0] === 1 && dims[2] > 0 && values.length >= dims[2]) {
    return values.slice(0, dims[2]);
  }
  return values;
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
  if (loading.size > 0) throw new Error("Model is still loading; try again after it finishes");
  fs.rmSync(modelCacheDir(), { recursive: true, force: true });
  return artistLabModelStatus("high");
}
