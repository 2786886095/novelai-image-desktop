import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OFFICIAL_METADATA_ASSETS, OFFICIAL_METADATA_ASSET_TIMEOUT_MS } from "../shared/official-metadata-assets";

function pngInput(): ArrayBuffer {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13); view.setUint32(12, 0x49484452);
  view.setUint32(16, 32); view.setUint32(20, 32);
  return bytes.buffer;
}
beforeEach(() => vi.resetModules());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("official online metadata transport guards", () => {
  it("importing the online module performs no network or worker side effect", async () => {
    const fetch = vi.fn(), worker = vi.fn();
    vi.stubGlobal("fetch", fetch); vi.stubGlobal("Worker", worker);
    await import("./official-metadata-online");
    expect(fetch).not.toHaveBeenCalled(); expect(worker).not.toHaveBeenCalled();
  });
  it("pins unique public assets without user-controlled destinations", () => {
    expect(new Set(OFFICIAL_METADATA_ASSETS.map(asset => asset.id)).size).toBe(OFFICIAL_METADATA_ASSETS.length);
    for (const asset of OFFICIAL_METADATA_ASSETS) {
      const url = new URL(asset.url);
      expect(url.protocol).toBe("https:"); expect(url.hostname).toBe("novelai.net");
      expect(url.pathname.startsWith("/_next/static/")).toBe(true);
      expect(url.username + url.password).toBe("");
      expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/); expect(asset.bytes).toBeGreaterThan(0);
    }
  });
  it("rejects unsupported formats before download", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const { parseOfficialImageMetadataOnline } = await import("./official-metadata-online");
    await expect(parseOfficialImageMetadataOnline(new Uint8Array([71, 73, 70]).buffer)).rejects.toThrow("PNG / WebP");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects input larger than 64MiB before download", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const { parseOfficialImageMetadataOnline } = await import("./official-metadata-online");
    await expect(parseOfficialImageMetadataOnline(new ArrayBuffer(64 * 1024 * 1024 + 1))).rejects.toThrow("64MiB");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects wrong asset size and sends the bridge an ID, never an image", async () => {
    const getter = vi.fn(async () => new Uint8Array(1));
    const { fetchVerifiedOfficialMetadataAssets } = await import("./official-metadata-online");
    await expect(fetchVerifiedOfficialMetadataAssets(getter)).rejects.toThrow("大小不匹配");
    expect(getter).toHaveBeenCalledExactlyOnceWith("png-text");
  });
  it("rejects changed SHA before any downloaded script can execute", async () => {
    const worker = vi.fn(); vi.stubGlobal("Worker", worker);
    const getter = vi.fn(async () => new Uint8Array(OFFICIAL_METADATA_ASSETS[0].bytes));
    const { fetchVerifiedOfficialMetadataAssets } = await import("./official-metadata-online");
    await expect(fetchVerifiedOfficialMetadataAssets(getter)).rejects.toThrow("校验失败");
    expect(worker).not.toHaveBeenCalled(); expect(getter).toHaveBeenCalledTimes(1);
  });
  it("browser fallback uses fixed public GETs with no credentials, redirects or body", async () => {
    const fetch = vi.fn(async () => new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetch); vi.stubGlobal("window", {});
    const { parseOfficialImageMetadataOnline } = await import("./official-metadata-online");
    await expect(parseOfficialImageMetadataOnline(pngInput())).rejects.toThrow("下载失败");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(OFFICIAL_METADATA_ASSETS[0].url);
    expect(options).toMatchObject({ method: "GET", credentials: "omit", redirect: "error" });
    expect(options.body).toBeUndefined(); expect(options.headers).toBeUndefined();
  });
  it("pre-aborted reads do not download or create a worker", async () => {
    const getter = vi.fn(), worker = vi.fn(); vi.stubGlobal("Worker", worker);
    vi.stubGlobal("window", { naiDesktop: { fetchOfficialMetadataAsset: getter } });
    const controller = new AbortController(); controller.abort();
    const { parseOfficialImageMetadataOnline } = await import("./official-metadata-online");
    await expect(parseOfficialImageMetadataOnline(pngInput(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(getter).not.toHaveBeenCalled(); expect(worker).not.toHaveBeenCalled();
  });
  it("mid-download cancellation starts no following asset request", async () => {
    const getter = vi.fn(() => new Promise<Uint8Array>(() => undefined));
    const controller = new AbortController();
    const { fetchVerifiedOfficialMetadataAssets } = await import("./official-metadata-online");
    const pending = fetchVerifiedOfficialMetadataAssets(getter, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(getter).toHaveBeenCalledExactlyOnceWith("png-text");
  });
  it("aborting calls the no-argument native cancel bridge, and the loader can retry", async () => {
    const getter = vi.fn(() => new Promise<Uint8Array>(() => undefined));
    const cancel = vi.fn(async () => undefined), worker = vi.fn();
    vi.stubGlobal("Worker", worker);
    vi.stubGlobal("window", { naiDesktop: {
      fetchOfficialMetadataAsset: getter, cancelOfficialMetadataAssetDownloads: cancel,
    } });
    const { parseOfficialImageMetadataOnline } = await import("./official-metadata-online");
    const first = new AbortController(), a = parseOfficialImageMetadataOnline(pngInput(), first.signal);
    first.abort(); await expect(a).rejects.toMatchObject({ name: "AbortError" });
    const second = new AbortController(), b = parseOfficialImageMetadataOnline(pngInput(), second.signal);
    second.abort(); await expect(b).rejects.toMatchObject({ name: "AbortError" });
    expect(getter).toHaveBeenCalledTimes(2); expect(cancel).toHaveBeenCalledTimes(2);
    expect(cancel.mock.calls.every(args => args.length === 0)).toBe(true);
    expect(worker).not.toHaveBeenCalled();
  });
  it("hard asset timeout fails explicitly, without starting later downloads", async () => {
    vi.useFakeTimers();
    const getter = vi.fn(() => new Promise<Uint8Array>(() => undefined));
    const { fetchVerifiedOfficialMetadataAssets } = await import("./official-metadata-online");
    const pending = fetchVerifiedOfficialMetadataAssets(getter);
    const assertion = expect(pending).rejects.toThrow("超时");
    await vi.advanceTimersByTimeAsync(OFFICIAL_METADATA_ASSET_TIMEOUT_MS);
    await assertion; expect(getter).toHaveBeenCalledTimes(1);
  });
  it("an immediate new read after abort does not reuse the aborted loader promise", async () => {
    const getter = vi.fn(() => new Promise<Uint8Array>(() => undefined));
    vi.stubGlobal("window", { naiDesktop: {
      fetchOfficialMetadataAsset: getter, cancelOfficialMetadataAssetDownloads: async () => undefined,
    } });
    const { parseOfficialImageMetadataOnline } = await import("./official-metadata-online");
    const first = new AbortController(), second = new AbortController();
    const a = parseOfficialImageMetadataOnline(pngInput(), first.signal);
    first.abort();
    // Deliberately start B before awaiting A's rejection/microtask cleanup.
    const b = parseOfficialImageMetadataOnline(pngInput(), second.signal);
    expect(getter).toHaveBeenCalledTimes(2);
    second.abort();
    await expect(a).rejects.toMatchObject({ name: "AbortError" });
    await expect(b).rejects.toMatchObject({ name: "AbortError" });
  });
  it("wraps exact typed official EXIF JSON without a misleading direct prompt or invented fields", async () => {
    vi.stubGlobal("onmessage", undefined);
    const { normalizeOfficialMetadataResult } = await import("./official-metadata-worker");
    const original = { prompt: "neutral fixture", seed: 7, steps: 12, extra: { keep: true } };
    const normalized = normalizeOfficialMetadataResult(original);
    expect(Object.keys(normalized)).toEqual(["Comment"]);
    expect(JSON.parse(normalized.Comment)).toEqual(original);
    expect(normalized.Software).toBeUndefined(); expect(normalized.Source).toBeUndefined();
  });
  it("does not rewrite an existing official Comment string", async () => {
    vi.stubGlobal("onmessage", undefined);
    const { normalizeOfficialMetadataResult } = await import("./official-metadata-worker");
    const original = { Software: "NovelAI", Comment: '{ "prompt": "neutral", "seed": 7 }' };
    expect(normalizeOfficialMetadataResult(original)).toEqual(original);
  });
});
