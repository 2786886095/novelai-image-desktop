import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ get: vi.fn(), choose: vi.fn(), settings: { onlineGalleryDownloadDir: "", outputDir: "" } }));
vi.mock("axios", () => ({ default: { get: mock.get } }));
vi.mock("electron", () => ({ dialog: { showOpenDialog: mock.choose } }));
vi.mock("./proxy", () => ({ proxyConfig: () => ({}) }));
vi.mock("./store", () => ({ getSettings: () => mock.settings, setSetting: (key: string, value: string) => Object.assign(mock.settings, { [key]: value }) }));
import { downloadOnlineGalleryImages } from "./online-gallery";
import { galleryDownloadFeedback, galleryImageExtension, galleryImageHeaders, validateGalleryImage } from "../../src/gallery-download";

const webp = Uint8Array.from([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 32]);
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const input = { source: "aitag", itemId: "test", title: "test", images: [{ id: "one", url: "https://cdn.example/a.webp", extension: "png" }] };
let root = "";
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-download-")); mock.settings.onlineGalleryDownloadDir = root; mock.get.mockReset(); mock.choose.mockReset(); mock.get.mockResolvedValue({ data: webp, headers: { "content-type": "image/webp" } }); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

it("uses the same source context as previews and saves the actual WebP format", async () => {
  const result = await downloadOnlineGalleryImages(input);
  expect(result.ok).toBe(true);
  expect(mock.get.mock.calls[0][1].headers).toEqual(galleryImageHeaders("aitag"));
  expect(result.savedPaths[0]).toMatch(/\.webp$/);
  expect(await fs.readFile(result.savedPaths[0])).toEqual(Buffer.from(webp));
});
it("does not save HTML error bodies as successful images", async () => {
  mock.get.mockResolvedValue({ data: Buffer.from("<html>blocked</html>"), headers: { "content-type": "text/html" } });
  const result = await downloadOnlineGalleryImages(input);
  expect(result.savedPaths).toEqual([]);
  expect(result.failures).toEqual([{ id: "one", reason: "INVALID_IMAGE_RESPONSE" }]);
  expect(await fs.readdir(result.outputDir)).toEqual([]);
});
it("continues a series after a failed or invalid URL and reports partial failure", async () => {
  mock.get.mockRejectedValueOnce({ response: { status: 403 } });
  const result = await downloadOnlineGalleryImages({ ...input, images: [...input.images, { id: "bad", url: "file:///wrong" }, { id: "last", url: "https://cdn.example/c.webp" }] });
  expect(result.savedPaths).toHaveLength(1);
  expect(result.failed).toBe(2);
  expect(result.ok).toBe(false);
  expect(galleryDownloadFeedback(result, "已保存 {count} 张", "下载失败")).toBe("已保存 1 张 · 下载失败 (2) [HTTP_403, INVALID_IMAGE_URL]");
});
it("never silently truncates a series after 100 images", async () => {
  const result = await downloadOnlineGalleryImages({ ...input, images: Array.from({ length: 101 }, (_, i) => ({ ...input.images[0], id: String(i) })) });
  expect(result.savedPaths).toHaveLength(101);
  expect(mock.get).toHaveBeenCalledTimes(101);
});
it("does not overwrite files on concurrent repeated downloads", async () => {
  const results = await Promise.all([downloadOnlineGalleryImages(input), downloadOnlineGalleryImages(input)]);
  expect(new Set(results.flatMap(r => r.savedPaths)).size).toBe(2);
  for (const result of results) expect(await fs.readFile(result.savedPaths[0])).toEqual(Buffer.from(webp));
});
it("remembers the first folder and does no network IO on cancellation", async () => {
  mock.settings.onlineGalleryDownloadDir = "";
  mock.choose.mockResolvedValueOnce({ canceled: true, filePaths: [] });
  expect((await downloadOnlineGalleryImages(input)).cancelled).toBe(true);
  expect(mock.get).not.toHaveBeenCalled();
  mock.choose.mockResolvedValueOnce({ canceled: false, filePaths: [root] });
  await downloadOnlineGalleryImages(input);
  await downloadOnlineGalleryImages(input);
  expect(mock.choose).toHaveBeenCalledTimes(2);
});
it("uses signatures over URL or model-category hints, but rejects empty and mislabeled responses", () => {
  expect(validateGalleryImage(webp, "application/octet-stream")).toBe("webp");
  expect(validateGalleryImage(png, "image/png")).toBe("png");
  expect(galleryImageExtension(new Uint8Array())).toBeNull();
  expect(() => validateGalleryImage(webp, "text/html")).toThrow("INVALID_IMAGE_RESPONSE");
  expect(galleryImageHeaders("quicktag").Referer).toBe("https://novelai.quicktagcloud.com/");
});
