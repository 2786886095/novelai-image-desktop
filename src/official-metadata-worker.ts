import { OFFICIAL_METADATA_ASSETS, type OfficialMetadataAssetPayload } from "../shared/official-metadata-assets";
import { MAX_METADATA_BYTES, inflateMetadata } from "./png-metadata-codecs";
import { MAX_METADATA_IMAGE_BYTES, MAX_METADATA_IMAGE_PIXELS, metadataImageHeader } from "./image-metadata-pixels";

type ModuleExports = Record<string, unknown>;
type Factory = (runtime: Record<string, unknown>, module?: { exports: ModuleExports }, exports?: ModuleExports) => void;
const workerScope = globalThis as unknown as {
  TURBOPACK: unknown[][];
  postMessage: (message: unknown) => void;
  onmessage: (event: MessageEvent<{ assets: OfficialMetadataAssetPayload[]; image: ArrayBuffer }>) => void;
};

function directGenerationObject(raw: Record<string, unknown>): boolean {
  return !("Comment" in raw) && !("comment" in raw) &&
    ("prompt" in raw || "v4_prompt" in raw) && ("seed" in raw || "steps" in raw || "sampler" in raw);
}
/** A restoration envelope is not the original official schema; the latter travels separately. */
export function normalizeOfficialMetadataResult(raw: Record<string, unknown>): Record<string, string> {
  const metadata: Record<string, string> = Object.create(null);
  if (directGenerationObject(raw)) {
    // A direct "prompt" would trigger the existing ComfyUI classifier. Only the
    // mapping view gets this envelope; originalMetadata preserves every native
    // key and numeric/object type for raw display and provenance comparisons.
    metadata.Comment = JSON.stringify(raw);
  } else {
    for (const [key, value] of Object.entries(raw)) metadata[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  if (new TextEncoder().encode(JSON.stringify(metadata)).byteLength > MAX_METADATA_BYTES)
    throw new Error("官方元数据超过 8MiB 安全限制。");
  return metadata;
}

/**
 * This module executes downloaded, pinned production functions. Adapters are
 * limited to the Turbopack runtime, muted UI/logging, an asset-only in-memory
 * fetch and bounded gzip. Format selection/metadata priority/bit reading and
 * pixel decoding remain the real official implementations.
 */
async function readOfficial(assets: OfficialMetadataAssetPayload[], input: ArrayBuffer): Promise<{
  metadata: Record<string, string>; originalMetadata?: Record<string, unknown>;
}> {
  const bytes = new Uint8Array(input);
  if (bytes.byteLength > MAX_METADATA_IMAGE_BYTES) throw new Error("图片超过 64MiB 安全限制。");
  const png = bytes.length >= 33 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  if (png) {
    const view = new DataView(input), width = view.getUint32(16), height = view.getUint32(20);
    if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452)
      throw new Error("图片 PNG 头部无效，未执行像素解码。");
    if (!width || !height || width * height > MAX_METADATA_IMAGE_PIXELS) throw new Error("图片超过 16777216 像素安全限制。");
  } else if (!metadataImageHeader(bytes)) {
    throw new Error("无法安全确认 WebP 图片尺寸，未执行像素解码。");
  }
  const verified = new Map<string, ArrayBuffer>();
  for (const asset of OFFICIAL_METADATA_ASSETS) {
    const payload = assets.find(item => item.id === asset.id);
    if (!payload || payload.bytes.byteLength !== asset.bytes) throw new Error("官方资源不完整：" + asset.id);
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", payload.bytes));
    if (Array.from(hash, value => value.toString(16).padStart(2, "0")).join("") !== asset.sha256)
      throw new Error("隔离 Worker 的官方资源校验失败：" + asset.id);
    verified.set(asset.id, payload.bytes);
  }

  const deny = () => { throw new Error("官方解析器沙箱禁止网络或持久化访问。"); };
  const assetOnlyFetch = async (request: unknown) => {
    const url = new URL(String(request), "https://novelai.net");
    const asset = OFFICIAL_METADATA_ASSETS.find(item => item.kind === "wasm" && item.url === url.href);
    if (!asset) return deny();
    return new Response(verified.get(asset.id)!.slice(0), { headers: { "Content-Type": "application/wasm" } });
  };
  // Nonconfigurable gates prevent downloaded factories from restoring network
  // constructors. No renderer DOM, Node integration or credential bridge exists.
  for (const name of ["XMLHttpRequest", "WebSocket", "WebTransport", "EventSource", "Worker", "SharedWorker", "importScripts", "indexedDB", "caches", "navigator"]) {
    Object.defineProperty(globalThis, name, { value: undefined, writable: false, configurable: false });
  }
  Object.defineProperty(globalThis, "fetch", { value: assetOnlyFetch, writable: false, configurable: false });
  Object.defineProperty(globalThis, "console", {
    value: Object.freeze({ log() {}, warn() {}, error() {}, info() {}, debug() {} }), writable: false, configurable: false,
  });
  workerScope.TURBOPACK = [];
  for (const asset of OFFICIAL_METADATA_ASSETS) {
    if (asset.kind !== "script") continue;
    const text = new TextDecoder("utf-8", { fatal: true }).decode(verified.get(asset.id));
    new Function(text)();
  }
  const registry = new Map<number, Factory>();
  for (const record of workerScope.TURBOPACK) {
    let ids: number[] = [];
    for (const value of record.slice(1)) {
      if (typeof value === "number") ids.push(value);
      else if (typeof value === "function") { for (const id of ids) registry.set(id, value as Factory); ids = []; }
    }
  }
  let metadataInflateError: Error | undefined;
  let parserFailure = false;
  const cache = new Map<number, ModuleExports>([
    [421464, {}], [240748, { toast() { parserFailure = true; } }],
    [760727, { logError() { parserFailure = true; } }],
    [845555, { default: { release: { name: "node" }, versions: { node: "0.0.0" } } }],
    [661332, { decompressSync(value: Uint8Array) {
      try { return inflateMetadata(value); }
      catch (error) {
        metadataInflateError = new Error(error instanceof Error && error.message.includes("too large")
          ? "官方隐写元数据解压超过 8MiB 安全限制。" : "官方隐写元数据压缩数据无效。");
        throw metadataInflateError;
      }
    } }],
    [740039, { getPicaInstance: deny }],
    [588307, { fromPng() { throw new Error("官方 PNG JS fallback 不在联网隔离读取范围。"); }, toPng: deny }],
  ]);
  const dynamicTargets = new Map([[636994, 988471], [979997, 199733]]);
  function load(id: number): ModuleExports {
    if (cache.has(id)) return cache.get(id)!;
    const factory = registry.get(id);
    if (!factory) throw new Error("官方解析器缺少已验证模块：" + id);
    const exports: ModuleExports = {}, module = { exports };
    cache.set(id, exports);
    const runtime = {
      i: load, r(target: number) { const item = load(target); return item.default ?? item; },
      A(target: number) { const mapped = dynamicTargets.get(target); if (mapped === undefined) return Promise.reject(new Error("未允许的官方动态模块。")); return Promise.resolve(load(mapped)); },
      U: class extends URL { constructor(value: string) { super(value, "https://novelai.net"); } },
      F(value: string) { return new URL(value, "https://novelai.net/").href; },
      q(value: unknown) { exports.default = value; },
      s(fields: unknown[]) {
        for (let index = 0; index < fields.length; index += 3) {
          if (fields[index + 1] !== 0) throw new Error("未支持的官方导出格式。");
          exports[String(fields[index])] = fields[index + 2];
        }
      },
    };
    factory(runtime, module, exports);
    cache.set(id, module.exports);
    return module.exports;
  }
  const codec = load(217354);
  const helperText = new TextDecoder("utf-8", { fatal: true }).decode(verified.get("alpha-helper"));
  const helper = helperText.slice(9326, 9463);
  const helperHash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(helper)));
  if (Array.from(helperHash, byte => byte.toString(16).padStart(2, "0")).join("") !== "ab89ae6b282d7739b16da1f6d901e7d184495e0279a2f494e3cadb171408b65e")
    throw new Error("官方 alpha 辅助函数边界校验失败。");
  const getStealth = new Function("h", "p", "return (" + helper + ")")(codec.decodeImage, codec);
  cache.set(939743, { getStealthPngCompString: getStealth });
  // Inspect reads an ArrayBuffer and then explicitly uses its own Buffer.from
  // (verified current Inspect chunk offset 34401). Both ExifReader.isBuffer and
  // the pixel codec's .length dispatch depend on that exact browser contract.
  const officialBuffer = load(671861).Buffer as { from(value: ArrayBuffer): Uint8Array };
  const importer = load(522560).getMetadataFromBuffer as (value: Uint8Array) => Promise<unknown>;
  const raw = await importer(officialBuffer.from(input));
  // The official helper intentionally swallows some decode errors. Safety
  // failures must remain visible instead of masquerading as "no metadata".
  if (metadataInflateError) throw metadataInflateError;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(parserFailure ? "官方解析器处理失败；未切换离线。" : "官方解析器没有读出元数据；未切换离线。");
  }
  const original = raw as Record<string, unknown>;
  const metadata = normalizeOfficialMetadataResult(original);
  return { metadata, originalMetadata: directGenerationObject(original) ? original : undefined };
}

workerScope.onmessage = event => {
  void readOfficial(event.data.assets, event.data.image).then(result => {
    workerScope.postMessage({ ok: true, ...result });
  }).catch(error => {
    // Do not send raw JSON, image bytes or private prompts in diagnostics.
    const message = error instanceof Error && /^(官方|图片|无法|隔离|未)/u.test(error.message)
      ? error.message : "官方解析器隔离执行失败；未切换离线。";
    workerScope.postMessage({ ok: false, error: message });
  });
};
