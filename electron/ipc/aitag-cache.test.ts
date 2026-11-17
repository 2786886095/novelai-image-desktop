import fs from "fs";
import os from "os";
import path from "path";
import { createHash } from "crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ userData: "" }));
const axiosGet = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({
  app: { getPath: () => state.userData },
}));
vi.mock("axios", () => ({
  default: { get: axiosGet },
}));
vi.mock("./gallery-network", async () => {
  const actual = await vi.importActual<typeof import("./gallery-network")>("./gallery-network");
  return { ...actual };
});
vi.mock("./proxy", () => ({ proxyConfig: () => ({}), proxyConfigForUrl: async () => ({ proxy: false }) }));
vi.mock("./store", () => ({ getSettings: () => ({ proxyMode: "direct" }), setSetting: vi.fn() }));
vi.mock("./local-media-protocol", () => ({
  toLocalMediaUrl: (file: string) => `local://${path.basename(file)}`,
}));

import { cacheAitagImage,cacheOnlineGalleryImage } from "./aitag-cache";

let root = "";

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "nai-aitag-cache-"));
  state.userData = root;
  axiosGet.mockResolvedValue({
    data: Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
    ]).buffer,
    headers: { "content-type": "image/webp" },
  });
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("AITag image cache", () => {
  it("deduplicates concurrent downloads and does not rescan the cache per image", async () => {
    const readdir = vi.spyOn(fs.promises, "readdir");
    const same = "https://example.com/image-a.webp";
    const [first, second] = await Promise.all([
      cacheAitagImage(same, 30),
      cacheAitagImage(same, 30),
    ]);
    await cacheAitagImage("https://example.com/image-b.webp", 30);

    expect(first).toBe(second);
    expect(axiosGet).toHaveBeenCalledTimes(2);
    expect(axiosGet).toHaveBeenCalledWith(same, expect.objectContaining({
      headers: expect.objectContaining({ Referer: "https://aitag.win/" }),
    }));
    expect(readdir).toHaveBeenCalledTimes(1);
    readdir.mockRestore();
  });

  it("replaces an invalid legacy cache body instead of exposing it to the renderer", async () => {
    const url = "https://example.com/stale.webp";
    await cacheAitagImage(url, 30);
    const cacheFile = path.join(
      root,
      "aitag-image-cache",
      `${createHash("sha256").update(url).digest("hex")}.webp`,
    );
    expect(fs.existsSync(cacheFile)).toBe(true);
    fs.writeFileSync(cacheFile, "<!doctype html>blocked");
    const callsBefore = axiosGet.mock.calls.length;

    await cacheAitagImage(url, 30);

    expect(axiosGet.mock.calls.length).toBe(callsBefore + 1);
    expect(fs.readFileSync(cacheFile).subarray(0, 4).toString("ascii")).toBe("RIFF");
  });

  it("does not publish a local media URL for a failed cache rename", async () => {
    const url = "https://example.com/rename-error.webp";
    const file = path.join(root, "aitag-image-cache", createHash("sha256").update(url).digest("hex") + ".webp");
    const rename = vi.spyOn(fs.promises, "rename").mockRejectedValueOnce(new Error("cache locked"));
    try {
      await expect(cacheAitagImage(url, 30)).rejects.toThrow("cache locked");
      expect(fs.existsSync(file)).toBe(false);
      expect(fs.readdirSync(path.dirname(file)).some(name => name.startsWith(path.basename(file) + "."))).toBe(false);
    } finally { rename.mockRestore(); }
    await expect(cacheAitagImage(url, 30)).resolves.toMatch(/^local:/);
    expect(fs.existsSync(file)).toBe(true);
  });
});

it("uses the NAX media context with no redirects and rejects other NAX image hosts",async()=>{
 const valid="https://cdn.zele.st/data/NAX/Images/danbooru-hair-tags-v5/bob.webp";
 await expect(cacheOnlineGalleryImage("nax",valid)).resolves.toMatch(/^local:/);
 expect(axiosGet).toHaveBeenCalledWith(valid,expect.objectContaining({maxRedirects:0,headers:expect.objectContaining({Referer:"https://nax.moe/"})}));
 const calls=axiosGet.mock.calls.length;
 await expect(cacheOnlineGalleryImage("nax",valid.replace("cdn.zele.st","example.invalid"))).rejects.toThrow("Invalid NAX image");
 expect(axiosGet.mock.calls).toHaveLength(calls);
});
