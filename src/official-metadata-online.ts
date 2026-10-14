import {
  OFFICIAL_METADATA_ASSETS, OFFICIAL_METADATA_ASSET_TIMEOUT_MS,
  OFFICIAL_METADATA_MAX_ASSET_BYTES, OFFICIAL_METADATA_WORKER_TIMEOUT_MS,
  type OfficialMetadataAssetId, type OfficialMetadataAssetPayload,
} from "../shared/official-metadata-assets";
import { MAX_METADATA_IMAGE_BYTES } from "./image-metadata-pixels";
import { MAX_METADATA_BYTES } from "./png-metadata-codecs";
import { OFFICIAL_METADATA_ORIGINAL } from "../shared/official-metadata-result";

export { OFFICIAL_METADATA_ASSETS } from "../shared/official-metadata-assets";
export type OfficialMetadataAssetFetcher = (id: OfficialMetadataAssetId) => Promise<Uint8Array>;
export interface OfficialMetadataReader {
  read(bytes: ArrayBuffer, signal?: AbortSignal): Promise<Record<string, string>>;
}

function abortError(): DOMException { return new DOMException("已取消官方联网读取。", "AbortError"); }
function checkAbort(signal?: AbortSignal): void { if (signal?.aborted) throw abortError(); }
function cancelNativeDownloads(): void {
  const bridge = typeof window !== "undefined"
    ? (window.naiDesktop as unknown as { cancelOfficialMetadataAssetDownloads?: () => Promise<void> } | undefined)?.cancelOfficialMetadataAssetDownloads
    : undefined;
  if (bridge) void bridge().catch(() => undefined);
}
function timeout<T>(promise: Promise<T>, milliseconds: number, message: string, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    checkAbort(signal);
    let finished = false;
    const finish = (error?: unknown, value?: T) => {
      if (finished) return;
      finished = true; clearTimeout(timer); signal?.removeEventListener("abort", abort);
      if (error) reject(error); else resolve(value!);
    };
    const abort = () => finish(abortError());
    const timer = setTimeout(() => finish(new Error(message)), milliseconds);
    signal?.addEventListener("abort", abort, { once: true });
    promise.then(value => finish(undefined, value), error => finish(error));
  });
}

/** The only network operation: GET one fixed public parser asset, without credentials. */
async function downloadAsset(id: OfficialMetadataAssetId, signal?: AbortSignal): Promise<Uint8Array> {
  checkAbort(signal);
  const bridge = typeof window !== "undefined"
    ? (window.naiDesktop as unknown as { fetchOfficialMetadataAsset?: OfficialMetadataAssetFetcher } | undefined)?.fetchOfficialMetadataAsset
    : undefined;
  if (bridge) return bridge(id);
  const asset = OFFICIAL_METADATA_ASSETS.find(item => item.id === id)!;
  const abort = new AbortController();
  const externalAbort = () => abort.abort();
  signal?.addEventListener("abort", externalAbort, { once: true });
  const timer = setTimeout(() => abort.abort(), OFFICIAL_METADATA_ASSET_TIMEOUT_MS);
  try {
    const response = await fetch(asset.url, { method: "GET", credentials: "omit", redirect: "error", signal: abort.signal });
    if (!response.ok || !response.body) throw new Error("官方解析器资源下载失败：" + id);
    const length = response.headers.get("Content-Length");
    if (length && Number(length) > OFFICIAL_METADATA_MAX_ASSET_BYTES) throw new Error("官方解析器资源超过安全大小：" + id);
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > asset.bytes || size > OFFICIAL_METADATA_MAX_ASSET_BYTES) {
          await reader.cancel(); throw new Error("官方解析器资源大小不匹配：" + id);
        }
        chunks.push(next.value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
  } catch (error) {
    if (signal?.aborted) throw abortError();
    if (error instanceof Error && error.message.startsWith("官方")) throw error;
    throw new Error("无法联网加载官方解析器（网络、超时或 CORS 限制）；不会自动切换离线，请重试或明确选择离线。");
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", externalAbort); }
}

/**
 * Verification happens before executing any remote code. The bridge receives an
 * allowlisted asset ID only: no image buffer, metadata, token or arbitrary URL.
 */
export async function fetchVerifiedOfficialMetadataAssets(
  fetchAsset?: OfficialMetadataAssetFetcher,
  signal?: AbortSignal,
): Promise<OfficialMetadataAssetPayload[]> {
  const result: OfficialMetadataAssetPayload[] = [];
  for (const asset of OFFICIAL_METADATA_ASSETS) {
    checkAbort(signal);
    const bytes = await timeout(fetchAsset ? fetchAsset(asset.id) : downloadAsset(asset.id, signal), OFFICIAL_METADATA_ASSET_TIMEOUT_MS,
      "官方解析器资源下载超时：" + asset.id, signal);
    checkAbort(signal);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== asset.bytes ||
      bytes.byteLength > OFFICIAL_METADATA_MAX_ASSET_BYTES) throw new Error("官方解析器资源大小不匹配：" + asset.id);
    const buffer = Uint8Array.from(bytes).buffer;
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
    const hex = Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
    if (hex !== asset.sha256) throw new Error("官方解析器资源校验失败：" + asset.id + "；未执行远程代码。");
    checkAbort(signal);
    result.push({ id: asset.id, bytes: buffer });
  }
  return result;
}

export function assertOfficialMetadataInput(buffer: ArrayBuffer): void {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength > MAX_METADATA_IMAGE_BYTES)
    throw new Error("图片超过 64MiB 安全限制或输入无效。");
  const bytes = new Uint8Array(buffer);
  const png = bytes.length >= 33 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  const webp = bytes.length >= 12 && new DataView(buffer).getUint32(0) === 0x52494646 &&
    new DataView(buffer).getUint32(8) === 0x57454250;
  if (!png && !webp) throw new Error("当前官方联网读取仅支持 PNG / WebP；请明确选择离线读取其他格式。");
}

/** Fresh module worker per read: remote factories never execute in the application renderer. */
function readInWorker(assets: OfficialMetadataAssetPayload[], buffer: ArrayBuffer, signal?: AbortSignal): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    checkAbort(signal);
    if (typeof Worker !== "function") { reject(new Error("当前环境不支持隔离 Worker，无法安全运行官方联网解析器。")); return; }
    const worker = new Worker(new URL("./official-metadata-worker.ts", import.meta.url), { type: "module" });
    const timer = setTimeout(() => finish(new Error("官方解析器超过安全时间限制；未切换离线。")), OFFICIAL_METADATA_WORKER_TIMEOUT_MS);
    let settled = false;
    function finish(error?: Error, metadata?: Record<string, string>) {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener("abort", abort); worker.terminate();
      if (error) reject(error); else resolve(metadata!);
    }
    const abort = () => finish(abortError());
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = () => finish(new Error("官方解析器隔离执行失败；未切换离线。"));
    worker.onmessage = (event: MessageEvent<{
      ok: boolean; metadata?: Record<string, string>; originalMetadata?: Record<string, unknown>; error?: string;
    }>) => {
      if (!event.data?.ok || !event.data.metadata) { finish(new Error(event.data?.error || "官方解析器没有返回可读元数据。")); return; }
      const metadata = event.data.metadata;
      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) ||
        Object.values(metadata).some(value => typeof value !== "string")) { finish(new Error("官方解析器返回类型无效。")); return; }
      if (new TextEncoder().encode(JSON.stringify(metadata)).byteLength > MAX_METADATA_BYTES) {
        finish(new Error("官方元数据超过 8MiB 安全限制。")); return;
      }
      const original = event.data.originalMetadata;
      if (original !== undefined) {
        if (!original || typeof original !== "object" || Array.isArray(original) ||
          new TextEncoder().encode(JSON.stringify(original)).byteLength > MAX_METADATA_BYTES) {
          finish(new Error("官方原始元数据返回类型或大小无效。")); return;
        }
        Object.defineProperty(metadata, OFFICIAL_METADATA_ORIGINAL, { value: original, enumerable: false });
      }
      finish(undefined, metadata);
    };
    // Clone the caller's buffer; transferring it must not detach the original file bytes.
    if (signal?.aborted) { abort(); return; }
    const copy = buffer.slice(0);
    worker.postMessage({ assets, image: copy }, [copy]);
  });
}

let loaded: Promise<OfficialMetadataReader> | undefined;
let loadingSignal: AbortSignal | undefined;
let loadingPending = false;
export function loadOfficialMetadataReader(signal?: AbortSignal): Promise<OfficialMetadataReader> {
  checkAbort(signal);
  // An immediate replacement read must not inherit the aborted owner's pending
  // promise while its rejection cleanup is still waiting for a microtask.
  if (loaded && loadingPending && loadingSignal?.aborted) {
    loaded = undefined; loadingSignal = undefined; loadingPending = false;
  }
  if (!loaded) {
    const pending = fetchVerifiedOfficialMetadataAssets(undefined, signal).then(assets => ({
      read: async (buffer: ArrayBuffer, readSignal?: AbortSignal) => {
        checkAbort(readSignal);
        assertOfficialMetadataInput(buffer);
        return readInWorker(assets, buffer, readSignal);
      },
    }));
    loaded = pending; loadingSignal = signal; loadingPending = true;
    void pending.then(() => {
      if (loaded === pending) { loadingPending = false; loadingSignal = undefined; }
    }, () => {
      if (loaded === pending) { loaded = undefined; loadingPending = false; loadingSignal = undefined; }
    });
  }
  return timeout(loaded, OFFICIAL_METADATA_ASSET_TIMEOUT_MS * OFFICIAL_METADATA_ASSETS.length,
    "官方解析器加载超时；未切换离线。", signal);
}

/** No server recognition and no implicit offline fallback. */
export async function parseOfficialImageMetadataOnline(buffer: ArrayBuffer, signal?: AbortSignal): Promise<Record<string, string>> {
  checkAbort(signal);
  assertOfficialMetadataInput(buffer);
  const onAbort = () => cancelNativeDownloads();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const reader = await loadOfficialMetadataReader(signal);
    checkAbort(signal);
    return await reader.read(buffer, signal);
  } finally { signal?.removeEventListener("abort", onAbort); }
}
