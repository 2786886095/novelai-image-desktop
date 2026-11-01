process.env.TZ = "Asia/Shanghai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { encode as encodePng } from "fast-png";
import { PNG } from "pngjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_PARAMS } from "../../src/types";
import { inspectImageMetadata, parseImageMeta } from "../../src/png-meta";
import { readStealthMetadataPixels } from "../../src/png-metadata-codecs";

const fixture = vi.hoisted(() => ({ root: "", post: undefined as any }));
vi.mock("electron", () => ({
  app: { getPath: (key: string) => path.join(fixture.root, key === "exe" ? "install/app.exe" : key) },
  safeStorage: { isEncryptionAvailable: () => false }, nativeImage: {}, dialog: {},
}));
vi.mock("axios", () => ({ default: { post: (...args: unknown[]) => fixture.post(...args), get: async () => { throw new Error("no network in tests"); }, isCancel: () => false } }));
vi.mock("./proxy", () => ({ proxyConfig: () => ({ proxy: false }), proxyConfigForUrl: async () => ({ proxy: false }) }));
vi.mock("./store", async (original) => ({ ...(await original<typeof import("./store")>()), getToken: () => "fixture-token" }));

type Nai = typeof import("./nai");
type Store = typeof import("./store");
let nai: Nai, store: Store;

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (bytes: Buffer) => { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** NovelAI-like PNG: tEXt chunks and an alpha-LSB payload, 128x96 RGBA. */
function novelAiPng(): Buffer {
  const image = new PNG({ width: 128, height: 96 });
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = (i / 4) % 251; image.data[i + 1] = (i / 8) % 253; image.data[i + 2] = 40; image.data[i + 3] = 254 + ((i / 4) % 2);
  }
  const png = PNG.sync.write(image);
  const comment = JSON.stringify({ prompt: "girl", uc: "lowres", steps: 28, seed: 7, sampler: "k_euler_ancestral",
    v4_prompt: { caption: { base_caption: "girl", char_captions: [{ char_caption: "red hair", centers: [{ x: 0.2, y: 0.8 }] }] }, use_coords: true },
    v4_negative_prompt: { caption: { base_caption: "lowres", char_captions: [{ char_caption: "bad hands" }] } } });
  const text = (key: string, value: string) => {
    const data = Buffer.concat([Buffer.from(key, "latin1"), Buffer.from([0]), Buffer.from(value, "utf8")]);
    const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length); out.write("tEXt", 4, "latin1"); data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const end = 8 + 12 + png.readUInt32BE(8);
  return Buffer.concat([png.subarray(0, end), text("Title", "NovelAI generated image"), text("Description", "girl"),
    text("Software", "NovelAI"), text("Source", "NovelAI Diffusion V4.5 4BDE2A90"), text("Generation time", "3.2"),
    text("Comment", comment), png.subarray(end)]);
}
const raw = async (bytes: Buffer) => sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const isWebp = (bytes: Buffer) => bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP";

beforeAll(async () => {
  fixture.root = fs.mkdtempSync(path.join(os.tmpdir(), "image-output-format-"));
  store = await import("./store");
  nai = await import("./nai");
  store.setSetting("outputDir", path.join(fixture.root, "output"));
  store.setSetting("streamPreviewEnabled", false);
  store.setSetting("imageNameTemplate", "{date}-{seq}");
});
afterAll(() => fs.rmSync(fixture.root, { recursive: true, force: true }));

describe("issue #77: lossless WebP output", () => {
  it("defaults to PNG and validates the persisted setting", () => {
    expect(store.getSettings().imageOutputFormat).toBe("png");
    expect(() => store.setSetting("imageOutputFormat", "jpg" as any)).toThrow(/Invalid image output format/);
    expect(store.setSetting("imageOutputFormat", "webp")).toBe("webp");
    const disk = JSON.parse(fs.readFileSync(path.join(fixture.root, "userData", "novelai-image-desktop.json"), "utf8"));
    expect(disk.settings.imageOutputFormat).toBe("webp");
    store.setSetting("imageOutputFormat", "png");
  });

  it("keeps PNG bytes untouched when PNG is selected", async () => {
    const source = novelAiPng();
    expect(await nai.encodeImageForSave(source, true, "png")).toBe(source);
    expect(await nai.encodeImageForSave(source, true, undefined)).toBe(source);
  });

  it("keeps 16-bit PNG as PNG instead of silently reducing it to 8-bit WebP", async () => {
    const source = Buffer.from(encodePng({ width: 2, height: 1, channels: 4, depth: 16,
      data: Uint16Array.from([12345, 23456, 34567, 65535, 54321, 43210, 32109, 0]) }));
    expect(source[24]).toBe(16);
    const saved = await nai.encodeImageForSave(source, true, "webp");
    expect(saved).toEqual(source);
    expect((await sharp(saved).metadata()).depth).toBe("ushort");
  });

  it("metadata on: pixel-exact WebP with NovelAI EXIF layout and alpha payload", async () => {
    const source = novelAiPng();
    const webp = await nai.encodeImageForSave(source, true, "webp");
    expect(isWebp(webp)).toBe(true);
    expect((await sharp(webp).metadata()).format).toBe("webp");
    const [a, b] = await Promise.all([raw(source), raw(webp)]);
    expect(b.data.equals(a.data)).toBe(true);
    const meta = parseImageMeta(Uint8Array.from(webp).buffer);
    // Official layout tags, plus every PNG text field inside UserComment.
    expect(meta).toMatchObject({ Title: "NovelAI generated image", ImageDescription: "girl", Software: "NovelAI Diffusion V4.5 4BDE2A90", Artist: "NovelAI", "Generation time": "3.2" });
    const report = inspectImageMetadata(meta);
    expect(report.kind).toBe("novelai");
    expect(report.characterCaptions).toEqual([{ prompt: "red hair", negativePrompt: "bad hands", useCoords: true, x: 0.2, y: 0.8 }]);
    expect(report.imported.seed).toBe(7);
  });

  it("metadata off: WebP of the privacy-stripped pixels, without EXIF", async () => {
    const source = novelAiPng();
    const webp = await nai.encodeImageForSave(source, false, "webp");
    expect(isWebp(webp)).toBe(true);
    expect(webp.includes(Buffer.from("EXIF"))).toBe(false);
    expect(Object.keys(parseImageMeta(Uint8Array.from(webp).buffer))).toEqual([]);
    const [a, b] = await Promise.all([raw(nai.prepareImageBufferForSave(source, false)), raw(webp)]);
    expect(b.data.equals(a.data)).toBe(true);
    expect(readStealthMetadataPixels(b.data, b.info.width, b.info.height, 4)).toEqual({});
  });

  it("a failed optional conversion keeps the PNG instead of losing the result", async () => {
    const broken = Buffer.concat([novelAiPng().subarray(0, 60), Buffer.from("not a complete png")]);
    expect(await nai.encodeImageForSave(broken, true, "webp")).toBe(broken);
  });

  it("generation saves a real .webp file and history record through the real save path", async () => {
    const zip = new JSZip(); zip.file("image_0.png", novelAiPng());
    const body = await zip.generateAsync({ type: "nodebuffer" });
    fixture.post = vi.fn(async () => ({ data: body, headers: { "content-type": "application/zip" } }));
    store.setSetting("imageOutputFormat", "webp");
    store.setSetting("keepImageMetadata", true);
    const result = await nai.generateImage({ ...DEFAULT_PARAMS, model: "nai-diffusion-4-5-full", positivePrompt: "girl", seedMode: "fixed", seed: 7 } as any);
    expect(result.ok).toBe(true);
    const item = result.items[0];
    expect(path.extname(item.filePath)).toBe(".webp");
    const saved = fs.readFileSync(item.filePath);
    expect(isWebp(saved)).toBe(true);
    expect(store.getHistory(undefined, undefined, true).some((h) => h.filePath === item.filePath)).toBe(true);
    const loaded = await nai.loadImageFromPath(item.filePath);
    expect(loaded.metadata?.characterCaptions).toHaveLength(1);
    store.setSetting("imageOutputFormat", "png");
  });
});

describe("issue #79 regression: local calendar dates across midnight and month end (UTC+8)", () => {
  it("indexes and lists each image under its local save date", async () => {
    const zip = new JSZip(); zip.file("image_0.png", novelAiPng());
    const body = await zip.generateAsync({ type: "nodebuffer" });
    fixture.post = vi.fn(async () => ({ data: body, headers: { "content-type": "application/zip" } }));
    const saved: string[] = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      for (const instant of ["2026-10-30T23:59:59Z", "2026-10-31T15:59:59Z", "2026-10-31T16:00:01Z", "2026-11-30T16:00:01Z"]) {
        vi.setSystemTime(new Date(instant));
        const result = await nai.generateImage({ ...DEFAULT_PARAMS, model: "nai-diffusion-4-5-full", positivePrompt: "girl", seedMode: "fixed", seed: 9 } as any);
        saved.push(`${result.items[0].date}|${path.basename(path.dirname(result.items[0].filePath))}`);
      }
    } finally { vi.useRealTimers(); }
    expect(saved).toEqual(["2026-10-31|2026-10-31", "2026-10-31|2026-10-31", "2026-11-01|2026-11-01", "2026-12-01|2026-12-01"]);
    const dates = store.getHistoryDates();
    for (const date of ["2026-12-01", "2026-11-01", "2026-10-31"]) expect(dates).toContain(date);
    expect(store.getHistory("2026-10-31", undefined, true).filter((h) => h.model === "nai-diffusion-4-5-full" && h.date === "2026-10-31")).toHaveLength(2);
  });
});
