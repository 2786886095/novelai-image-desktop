import type { AppLanguage, CatalogNames } from "./types";

export type ReferenceCatalogCategory = "游戏内角色图" | "角色立绘" | "角色资源";

export const REFERENCE_CATALOG_GAME_NAMES: Record<string, Record<AppLanguage, string>> = {
  "原神": { "zh-CN": "原神" },
  "妮姬": { "zh-CN": "胜利女神：妮姬" },
  "崩坏三": { "zh-CN": "崩坏3" },
  "异环": { "zh-CN": "异环" },
  "明日方舟": { "zh-CN": "明日方舟" },
  "星穹铁道": { "zh-CN": "崩坏：星穹铁道" },
  "终末地": { "zh-CN": "明日方舟：终末地" },
  "绝区零": { "zh-CN": "绝区零" },
  "蔚蓝档案": { "zh-CN": "蔚蓝档案" },
  "鸣潮": { "zh-CN": "鸣潮" },
};

const REFERENCE_CATALOG_CATEGORY_NAMES: Record<ReferenceCatalogCategory, Record<AppLanguage, string>> = {
  "游戏内角色图": { "zh-CN": "游戏内角色图" },
  "角色立绘": { "zh-CN": "角色立绘" },
  "角色资源": { "zh-CN": "角色资源" },
};

export function catalogGameName(game: string, language: AppLanguage | undefined, names?: CatalogNames) {
  const locale = language ?? "zh-CN";
  return names?.[locale] || names?.["zh-CN"] || REFERENCE_CATALOG_GAME_NAMES[game]?.[locale] || REFERENCE_CATALOG_GAME_NAMES[game]?.["zh-CN"] || game;
}

export function catalogCategoryName(category: string, language: AppLanguage | undefined) {
  const locale = language ?? "zh-CN";
  return REFERENCE_CATALOG_CATEGORY_NAMES[category as ReferenceCatalogCategory]?.[locale] || category;
}

export function catalogGroupName(group: string, language: AppLanguage | undefined) {
  const [game, category, ...rest] = group.split(" · ");
  if (!category || rest.length || !REFERENCE_CATALOG_GAME_NAMES[game]) return catalogGameName(group, language);
  return `${catalogGameName(game, language)} · ${catalogCategoryName(category, language)}`;
}

export interface ReferenceCatalogAsset {
  id: string;
  game: string;
  category: ReferenceCatalogCategory;
  roleId: string;
  names: CatalogNames & { "zh-CN": string };
  gameNames?: CatalogNames;
  searchAliases?: string[];
  variant?: string;
  width: number;
  height: number;
  bytes: number;
  sha256?: string;
  downloadUrl: string;
  downloadMirrors?: Partial<Record<"gitee" | "github", string>>;
  thumbnailUrl?: string;
  thumbnailMirrors?: Partial<Record<"gitee" | "github", string>>;
  source?: string;
}

export interface ReferenceCatalogManifest {
  schema: "langbai-reference-catalog/v1";
  generatedAt: string;
  provider: string;
  games?: Array<{ id: string; names?: CatalogNames; categories: ReferenceCatalogCategory[] }>;
  assets: ReferenceCatalogAsset[];
}

interface ReferenceCatalogPayload {
  schema?: string;
  generatedAt?: string;
  provider?: string;
  games?: ReferenceCatalogManifest["games"];
  assets?: ReferenceCatalogAsset[];
  chunks?: Array<{ game: string; url: string }>;
}

export const REFERENCE_CATALOG_URLS = [
  import.meta.env.VITE_REFERENCE_CATALOG_URL,
  "https://2786886095.github.io/novelai-image-desktop/reference-catalog/index.json",
  "https://raw.githubusercontent.com/2786886095/novelai-reference-assets/main/catalog/index.json",
  // Bundled copy, relative to the page: dist/ in the packaged app (file://) or the dev server.
  "reference-catalog/index.json",
].filter((value): value is string => Boolean(value));

/** Ignore retired mirrors even when reading an older cached catalog. */
export function catalogThumbnailUrls(asset: ReferenceCatalogAsset): string[] {
  return [...new Set([asset.thumbnailMirrors?.github, asset.downloadMirrors?.github, asset.thumbnailUrl, asset.downloadUrl]
    .filter((url): url is string => {
      if (!url) return false;
      try { const host = new URL(url).hostname.toLowerCase(); return host !== 'gitee.com' && !host.endsWith('.gitee.com'); }
      catch { return false; }
    }))];
}

export function catalogName(asset: ReferenceCatalogAsset, language: AppLanguage | undefined) {
  return asset.names[language ?? "zh-CN"] || asset.names["zh-CN"] || asset.roleId;
}

export function catalogSearchText(asset: ReferenceCatalogAsset) {
  return [asset.game, asset.category, asset.roleId, asset.variant, ...(asset.searchAliases ?? []), ...Object.values(asset.names), ...Object.values(asset.gameNames ?? {})]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

export function formatCatalogBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function catalogSeriesMetrics(
  assets: readonly ReferenceCatalogAsset[],
  downloadedIds: ReadonlySet<string>,
) {
  let totalBytes = 0;
  let pendingBytes = 0;
  let downloadedCount = 0;
  for (const asset of assets) {
    const bytes = Number.isFinite(asset.bytes) ? Math.max(0, asset.bytes) : 0;
    totalBytes += bytes;
    if (downloadedIds.has(asset.id)) downloadedCount += 1;
    else pendingBytes += bytes;
  }
  return {
    totalCount: assets.length,
    downloadedCount,
    pendingCount: assets.length - downloadedCount,
    totalBytes,
    pendingBytes,
  };
}

export function dataUrlFromBytes(bytes: Uint8Array, mime = "image/png") {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunk, bytes.length)));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

async function unpackCatalogPayload(payload: unknown): Promise<ReferenceCatalogPayload> {
  if (!payload || typeof payload !== "object") return {};
  const packed = payload as { encoding?: string; payload?: string };
  if (packed.encoding !== "gzip-base64" || typeof packed.payload !== "string") return payload as ReferenceCatalogPayload;
  const binary = atob(packed.payload);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text()) as ReferenceCatalogPayload;
}

let cachedReferenceCatalog: ReferenceCatalogManifest | null = null;

export async function loadReferenceCatalog(signal?: AbortSignal, refresh = false): Promise<ReferenceCatalogManifest> {
  if (!refresh && cachedReferenceCatalog) return cachedReferenceCatalog;
  let lastError: unknown;
  for (const entry of REFERENCE_CATALOG_URLS) {
    // Absolute, so the fetch and the asset and chunk URLs resolved against it work under file:// too.
    const url = new URL(entry, document.baseURI).href;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    const forwardAbort = () => controller.abort();
    signal?.addEventListener("abort", forwardAbort, { once: true });
    try {
      const response = await fetch(url, { signal: controller.signal, cache: refresh ? "no-store" : "force-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      let parsed = await response.json() as ReferenceCatalogPayload;
      if (parsed.schema === "langbai-reference-catalog/federated-v1" && Array.isArray(parsed.chunks)) {
        const chunkManifests = await Promise.all(parsed.chunks.map(async (chunk) => {
          const chunkResponse = await fetch(new URL(chunk.url, url), { signal: controller.signal, cache: refresh ? "no-store" : "force-cache" });
          if (!chunkResponse.ok) throw new Error(`HTTP ${chunkResponse.status}`);
          const chunkManifest = await unpackCatalogPayload(await chunkResponse.json());
          if (chunkManifest.schema !== "langbai-reference-catalog/v1" || !Array.isArray(chunkManifest.assets)) {
            throw new Error("在线目录分片格式无效。");
          }
          return chunkManifest;
        }));
        parsed = {
          schema: "langbai-reference-catalog/v1",
          generatedAt: parsed.generatedAt,
          provider: parsed.provider,
          games: parsed.games,
          assets: chunkManifests.flatMap((chunk) => chunk.assets ?? []),
        };
      }
      if (parsed.schema !== "langbai-reference-catalog/v1" || !Array.isArray(parsed.assets)) {
        throw new Error("在线目录格式无效。");
      }
      const assets = (parsed.assets as ReferenceCatalogAsset[]).map((asset) => ({
        ...asset,
        downloadUrl: new URL(asset.downloadUrl, url).toString(),
        downloadMirrors: asset.downloadMirrors
          ? Object.fromEntries(Object.entries(asset.downloadMirrors).map(([key, value]) => [key, new URL(value, url).toString()]))
          : undefined,
        thumbnailUrl: asset.thumbnailUrl ? new URL(asset.thumbnailUrl, url).toString() : undefined,
        thumbnailMirrors: asset.thumbnailMirrors
          ? Object.fromEntries(Object.entries(asset.thumbnailMirrors).map(([key, value]) => [key, new URL(value, url).toString()]))
          : undefined,
      }));
      return cachedReferenceCatalog = { schema: parsed.schema, generatedAt: String(parsed.generatedAt ?? ""), provider: String(parsed.provider ?? ""), games: parsed.games, assets };
    } catch (error) {
      lastError = error;
    } finally {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", forwardAbort);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("在线目录暂不可用。");
}

export async function fetchReferenceAsset(
  asset: ReferenceCatalogAsset,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal,
) {
  const sources = [...new Set([asset.downloadMirrors?.github, asset.downloadUrl].filter((value): value is string => Boolean(value) && !/gitee\.com/i.test(value!)))];
  if (window.naiDesktop?.downloadReferenceCatalogAsset) {
    const requestId = `${asset.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const unsubscribe = window.naiDesktop.onReferenceCatalogDownloadProgress((progress) => {
      if (progress.id === requestId) onProgress(progress.loaded, progress.total || asset.bytes || progress.loaded);
    });
    try {
      const result = await window.naiDesktop.downloadReferenceCatalogAsset({ id: requestId, urls: sources });
      if (!result.ok || !result.base64) throw new Error(result.message || "精准参考图暂不可用。");
      const binary = atob(result.base64);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      onProgress(bytes.byteLength, result.bytes || asset.bytes || bytes.byteLength);
      return bytes;
    } finally {
      unsubscribe();
    }
  }
  let response: Response | undefined;
  let lastError: unknown;
  for (const source of sources) {
    try {
      const candidate = await fetch(source, { signal, cache: "force-cache" });
      if (!candidate.ok) throw new Error(`HTTP ${candidate.status}`);
      response = candidate;
      break;
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw error;
    }
  }
  if (!response) throw lastError instanceof Error ? lastError : new Error("精准参考图暂不可用。");
  const total = Number(response.headers.get("content-length")) || asset.bytes || 0;
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    onProgress(bytes.byteLength, total || bytes.byteLength);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    if (next.value) {
      chunks.push(next.value);
      loaded += next.value.byteLength;
      onProgress(loaded, total || loaded);
    }
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
