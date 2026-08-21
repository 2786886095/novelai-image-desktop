import type { AppLanguage } from "./types";

export type ReferenceCatalogCategory = "游戏内角色图" | "角色立绘" | "角色资源";

export interface ReferenceCatalogAsset {
  id: string;
  game: string;
  category: ReferenceCatalogCategory;
  roleId: string;
  names: Partial<Record<AppLanguage, string>> & { "zh-CN": string };
  variant?: string;
  width: number;
  height: number;
  bytes: number;
  sha256?: string;
  downloadUrl: string;
  source?: string;
}

export interface ReferenceCatalogManifest {
  schema: "langbai-reference-catalog/v1";
  generatedAt: string;
  provider: string;
  assets: ReferenceCatalogAsset[];
}

export const REFERENCE_CATALOG_URLS = [
  import.meta.env.VITE_REFERENCE_CATALOG_URL,
  "https://gitee.com/2786886095/novelai-reference-assets/raw/main/catalog/index.json",
  "https://raw.githubusercontent.com/2786886095/novelai-reference-assets/main/catalog/index.json",
  "/reference-catalog/index.json",
].filter((value): value is string => Boolean(value));

export function catalogName(asset: ReferenceCatalogAsset, language: AppLanguage | undefined) {
  return asset.names[language ?? "zh-CN"] || asset.names["zh-CN"] || asset.roleId;
}

export function catalogSearchText(asset: ReferenceCatalogAsset) {
  return [asset.game, asset.category, asset.roleId, asset.variant, ...Object.values(asset.names)]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

export function formatCatalogBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function dataUrlFromBytes(bytes: Uint8Array, mime = "image/png") {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunk, bytes.length)));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

export async function loadReferenceCatalog(signal?: AbortSignal): Promise<ReferenceCatalogManifest> {
  let lastError: unknown;
  for (const url of REFERENCE_CATALOG_URLS) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 7000);
    const forwardAbort = () => controller.abort();
    signal?.addEventListener("abort", forwardAbort, { once: true });
    try {
      const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = await response.json() as Partial<ReferenceCatalogManifest>;
      if (parsed.schema !== "langbai-reference-catalog/v1" || !Array.isArray(parsed.assets)) {
        throw new Error("Invalid reference catalog");
      }
      const assets = (parsed.assets as ReferenceCatalogAsset[]).map((asset) => ({
        ...asset,
        downloadUrl: new URL(asset.downloadUrl, url).toString(),
      }));
      return { schema: parsed.schema, generatedAt: String(parsed.generatedAt ?? ""), provider: String(parsed.provider ?? ""), assets };
    } catch (error) {
      lastError = error;
    } finally {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", forwardAbort);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Online reference catalog is unavailable");
}

export async function fetchReferenceAsset(
  asset: ReferenceCatalogAsset,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal,
) {
  const response = await fetch(asset.downloadUrl, { signal, cache: "force-cache" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
