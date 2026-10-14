import { describe, expect, it, vi } from "vitest";
import { OFFICIAL_METADATA_ASSETS } from "../../shared/official-metadata-assets";
import { createOfficialMetadataAssetDownloader } from "./official-metadata-assets";

describe("official metadata public-asset bridge", () => {
  it.each(["https://example.com/image.png", "../token", "", null, { image: "private" }])("rejects non-allowlisted input %j before requesting", async input => {
    const request = vi.fn();
    await expect(createOfficialMetadataAssetDownloader(request as typeof fetch)(input)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it("requests only a fixed public GET with no image, auth or cookie", async () => {
    const asset = OFFICIAL_METADATA_ASSETS[0];
    const request = vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 }));
    await expect(createOfficialMetadataAssetDownloader(request as typeof fetch)(asset.id)).rejects.toThrow("download failed");
    expect(request).toHaveBeenCalledTimes(1);
    const [url, options] = request.mock.calls[0];
    expect(url).toBe(asset.url);
    expect(options.method).toBe("GET");
    expect(options.credentials).toBe("omit");
    expect(options.redirect).toBe("error");
    expect(options.body).toBeUndefined();
    expect(options.headers).toEqual({ Accept: "application/octet-stream" });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("bounds the response before reading a declared excessive asset", async () => {
    const request = vi.fn().mockResolvedValue(new Response("x", { headers: { "content-length": "999999999" } }));
    await expect(createOfficialMetadataAssetDownloader(request as typeof fetch)(OFFICIAL_METADATA_ASSETS[0].id)).rejects.toThrow("too large");
  });

  it("rejects a short response rather than running changed official code", async () => {
    const request = vi.fn().mockResolvedValue(new Response(new Uint8Array([1])));
    await expect(createOfficialMetadataAssetDownloader(request as typeof fetch)(OFFICIAL_METADATA_ASSETS[0].id)).rejects.toThrow("integrity changed");
  });

  it("rejects a same-length response with the wrong SHA", async () => {
    const asset = OFFICIAL_METADATA_ASSETS[0];
    const request = vi.fn().mockResolvedValue(new Response(new Uint8Array(asset.bytes)));
    await expect(createOfficialMetadataAssetDownloader(request as typeof fetch)(asset.id)).rejects.toThrow("integrity changed");
  });

  it("rejects a streaming oversized response and cancels the stream", async () => {
    const asset = OFFICIAL_METADATA_ASSETS[0]; const cancel = vi.fn();
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(asset.bytes + 1)); }, cancel });
    const request = vi.fn().mockResolvedValue(new Response(body));
    await expect(createOfficialMetadataAssetDownloader(request as typeof fetch)(asset.id)).rejects.toThrow("size changed");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("deduplicates in-flight downloads but allows a retry after failure", async () => {
    const asset = OFFICIAL_METADATA_ASSETS[0];
    const request = vi.fn().mockImplementation(async () => new Response("unavailable", { status: 503 }));
    const download = createOfficialMetadataAssetDownloader(request as typeof fetch);
    await Promise.allSettled([download(asset.id), download(asset.id)]);
    expect(request).toHaveBeenCalledOnce();
    await expect(download(asset.id)).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("cancels in-flight public asset requests when leaving online mode", async () => {
    const request = vi.fn().mockImplementation((_url, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
    }));
    const download = createOfficialMetadataAssetDownloader(request as typeof fetch);
    const pending = download(OFFICIAL_METADATA_ASSETS[0].id);
    download.cancel();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(request.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("an immediate new read cannot inherit the cancelled request promise", async () => {
    const request = vi.fn()
      .mockImplementationOnce((_url, options: RequestInit) => new Promise((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
      }))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    const download = createOfficialMetadataAssetDownloader(request as typeof fetch);
    const old = download(OFFICIAL_METADATA_ASSETS[0].id);
    const oldCheck = expect(old).rejects.toMatchObject({ name: "AbortError" });
    download.cancel();
    const next = download(OFFICIAL_METADATA_ASSETS[0].id);
    await oldCheck;
    await expect(next).rejects.toThrow("download failed");
    expect(request).toHaveBeenCalledTimes(2);
  });
});
