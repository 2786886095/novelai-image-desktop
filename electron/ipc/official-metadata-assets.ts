import { createHash } from "node:crypto";
import { OFFICIAL_METADATA_ASSETS } from "../../shared/official-metadata-assets";

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ASSET_BYTES = 10 * 1024 * 1024;

/** Public GETs only. This transport never receives an image, token, cookie or arbitrary URL. */
export function createOfficialMetadataAssetDownloader(request: typeof fetch = globalThis.fetch) {
  const cache = new Map<string, Promise<Uint8Array>>();
  const active = new Set<AbortController>();
  return Object.assign(async function fetchOfficialMetadataAsset(assetId: unknown): Promise<Uint8Array> {
    if (typeof assetId !== "string" || assetId.length > 128) throw new Error("Invalid official metadata asset ID");
    const asset = OFFICIAL_METADATA_ASSETS.find(item => item.id === assetId);
    if (!asset) throw new Error("Unknown official metadata asset ID");
    const url = new URL(asset.url);
    const fixedDeployQuery = !url.search || (url.searchParams.size === 1 && url.searchParams.has("dpl") && /^[a-zA-Z0-9-]+$/.test(url.searchParams.get("dpl") || ""));
    if (url.protocol !== "https:" || url.hostname !== "novelai.net" || !url.pathname.startsWith("/_next/static/") || !fixedDeployQuery || url.username || url.password) {
      throw new Error("Invalid official metadata asset source");
    }
    if (asset.bytes <= 0 || asset.bytes > MAX_ASSET_BYTES) throw new Error("Official metadata asset exceeds the safety limit");
    let pending = cache.get(asset.id);
    if (!pending) {
      pending = (async () => {
        const controller = new AbortController();
        active.add(controller);
        try {
        const response = await request(asset.url, {
          method: "GET", credentials: "omit", redirect: "error", cache: "no-store",
          headers: { Accept: "application/octet-stream" }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
        });
        if (response.status !== 200 || !response.body) throw new Error("Official metadata asset download failed");
        const declared = response.headers.get("content-length");
        if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_ASSET_BYTES)) throw new Error("Official metadata asset response is too large");
        const reader = response.body.getReader();
        const bytes = new Uint8Array(asset.bytes);
        let offset = 0;
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            if (offset + part.value.byteLength > bytes.byteLength) throw new Error("Official metadata asset size changed");
            bytes.set(part.value, offset); offset += part.value.byteLength;
          }
        } catch (error) {
          await reader.cancel().catch(() => undefined);
          throw error;
        } finally { reader.releaseLock(); }
        if (offset !== asset.bytes || createHash("sha256").update(bytes).digest("hex") !== asset.sha256) {
          throw new Error("Official metadata asset integrity changed; select offline mode or update the reader");
        }
        return bytes;
        } finally { active.delete(controller); }
      })();
      cache.set(asset.id, pending);
      pending.catch(() => { if (cache.get(asset.id) === pending) cache.delete(asset.id); });
    }
    return Uint8Array.from(await pending);
  }, { cancel() {
    // Evict synchronously: a new online read must not inherit an aborted promise.
    cache.clear();
    for (const controller of active) controller.abort(new DOMException("Official parser download cancelled", "AbortError"));
  } });
}

export const fetchOfficialMetadataAsset = createOfficialMetadataAssetDownloader();
export function cancelOfficialMetadataAssetDownloads(): void { fetchOfficialMetadataAsset.cancel(); }
