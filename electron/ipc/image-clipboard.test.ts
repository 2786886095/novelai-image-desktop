import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS } from "./image-codec";
import { localMediaUrlToPath, toLocalMediaUrl } from "./local-media-protocol";
import { copyImageWithMetadata, readClipboardImageFiles, savePastedImageFiles } from "./image-clipboard";

const { pngWithComment } = require("../../tests/image-clipboard-fixture.cjs");
const fixture = vi.hoisted(() => ({ root: "", raw: new Map<string, Buffer>(),
  readImage: vi.fn(), readBuffer: vi.fn(), writeBuffer: vi.fn(), writer: vi.fn(), formats: vi.fn(),
}));
vi.mock("electron", () => ({
  app: { getPath: () => fixture.root },
  clipboard: {
    has: (format: string) => fixture.raw.has(format), readImage: fixture.readImage,
    readBuffer: fixture.readBuffer, writeBuffer: fixture.writeBuffer, availableFormats: fixture.formats,
  },
}));
vi.mock("./windows-png-clipboard", () => ({ writeWindowsPngClipboard: fixture.writer }));

const nativeImage = (bytes: Buffer, empty = false, pixels = 2) => ({
  isEmpty: () => empty, getSize: () => ({ width: pixels, height: 1 }), toPNG: () => bytes,
});
let png: Buffer;
beforeEach(async () => {
  vi.resetAllMocks();
  fixture.root = await fs.mkdtemp(path.join(os.tmpdir(), "nai-copy-test-"));
  fixture.raw.clear();
  png = pngWithComment();
  fixture.readImage.mockReturnValue(nativeImage(png));
  fixture.readBuffer.mockImplementation((format: string) => fixture.raw.get(format) || Buffer.alloc(0));
  fixture.formats.mockReturnValue([]);
  fixture.writeBuffer.mockImplementation((format: string, bytes: Buffer) => { fixture.raw.clear(); fixture.raw.set(format, bytes); });
  fixture.writer.mockImplementation(async (bytes: Buffer) => { fixture.raw.clear(); fixture.raw.set("PNG", bytes); });
});
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(fixture.root, { recursive: true, force: true }); });
async function source(bytes = png, name = "source 中文.png") {
  const file = path.join(fixture.root, name);
  await fs.writeFile(file, bytes);
  return { file, url: toLocalMediaUrl(file, "test identity") };
}

describe("original PNG clipboard paste", () => {
  it.each(["PNG", "image/png", "public.png"])("reads %s without a lossy NativeImage conversion", async format => {
    fixture.raw.set(format, png);
    const pasted = await readClipboardImageFiles();
    expect(pasted).toEqual([{ name: "clipboard.png", bytes: png }]);
    expect(fixture.readImage).not.toHaveBeenCalled();
  });
  it("falls back for malformed raw formats without hiding a valid native bitmap", async () => {
    const malformed = Buffer.from(png); malformed.fill(0, 30);
    fixture.raw.set("PNG", malformed);
    expect((await readClipboardImageFiles())[0].bytes).toEqual(png);
    expect(fixture.readImage).toHaveBeenCalledOnce();
  });
  it("falls back if a raw-format API throws", async () => {
    fixture.raw.set("PNG", png);
    fixture.readBuffer.mockImplementation(() => { throw new Error("fixture"); });
    expect((await readClipboardImageFiles())[0].bytes).toEqual(png);
  });
  it("rejects oversized raw PNGs before decoding", async () => {
    const bytes = Buffer.alloc(MAX_IMAGE_BYTES + 1); png.copy(bytes);
    fixture.raw.set("PNG", bytes);
    await expect(readClipboardImageFiles()).rejects.toThrow("32 MB");
    expect(fixture.readImage).not.toHaveBeenCalled();
  });
  it("rejects excessive raw PNG dimensions before decoding", async () => {
    const bytes = Buffer.from(png); bytes.writeUInt32BE(MAX_IMAGE_PIXELS + 1, 16);
    fixture.raw.set("PNG", bytes);
    await expect(readClipboardImageFiles()).rejects.toThrow("64 megapixels");
  });
  it("retains native bitmap limits", async () => {
    fixture.readImage.mockReturnValue(nativeImage(png, false, MAX_IMAGE_PIXELS + 1));
    await expect(readClipboardImageFiles()).rejects.toThrow("64 megapixels");
    fixture.readImage.mockReturnValue(nativeImage(Buffer.alloc(MAX_IMAGE_BYTES + 1)));
    await expect(readClipboardImageFiles()).rejects.toThrow("32 MB");
  });
  it("returns empty for an empty clipboard", async () => {
    fixture.readImage.mockReturnValue(nativeImage(png, true));
    expect(await readClipboardImageFiles()).toEqual([]);
  });
  it.skipIf(process.platform !== "win32")("retains FileNameW fallback", async () => {
    const { file } = await source();
    fixture.readImage.mockReturnValue(nativeImage(png, true));
    fixture.formats.mockReturnValue(["FileNameW"]);
    fixture.readBuffer.mockReturnValue(Buffer.from(`${file}\0`, "utf16le"));
    expect(await readClipboardImageFiles()).toEqual([{ name: path.basename(file), bytes: png }]);
  });
  it("saves pasted PNGs byte-for-byte after validation", async () => {
    const saved = await savePastedImageFiles([{ name: "clipboard.png", bytes: png }]);
    expect(await fs.readFile(saved[0])).toEqual(png);
    await expect(savePastedImageFiles([{ bytes: new Uint8Array([1]) }])).rejects.toThrow();
    await expect(savePastedImageFiles(Array(17).fill({ bytes: png }))).rejects.toThrow("16");
  });
});

describe("trusted native metadata copy", () => {
  it("copies a registered local PNG exactly without modifying the source", async () => {
    const { file, url } = await source();
    expect(localMediaUrlToPath(url)).toBe(file);
    expect(await copyImageWithMetadata(url)).toEqual({ status: "copied" });
    expect(await fs.readFile(file)).toEqual(png);
    if (process.platform === "win32") expect(fixture.writer).toHaveBeenCalledExactlyOnceWith(png);
    else expect(fixture.writeBuffer).toHaveBeenCalledOnce();
  });
  it.each(["https://example.test/a.png", "file:///C:/private.png", "data:image/png;base64,a", "blob:fixture", "C:/private.png", "not-a-url"])("rejects %s without writing", async value => {
    expect(await copyImageWithMetadata(value)).toEqual({ status: "unsupported" });
    expect(fixture.writer).not.toHaveBeenCalled(); expect(fixture.writeBuffer).not.toHaveBeenCalled();
  });
  it("rejects guessed unregistered local-media URLs", async () => {
    const file = path.join(fixture.root, "private.png"); await fs.writeFile(file, png);
    const url = `nai-local://file/${encodeURIComponent(pathToFileURL(file).toString())}`;
    expect(await copyImageWithMetadata(url)).toEqual({ status: "unsupported" });
  });
  it("rejects non-PNG filenames and mismatched content", async () => {
    expect(await copyImageWithMetadata((await source(png, "other.jpg")).url)).toEqual({ status: "unsupported" });
    expect(await copyImageWithMetadata((await source(Buffer.from("not a PNG"))).url)).toEqual({ status: "unsupported" });
  });
  it("returns a failed result for unavailable files (never raw errors)", async () => {
    expect(await copyImageWithMetadata(toLocalMediaUrl(path.join(fixture.root, "missing.png")))).toEqual({ status: "failed" });
  });
  it("rejects directories and oversized files before reading content", async () => {
    const directory = path.join(fixture.root, "directory.png"); await fs.mkdir(directory);
    expect(await copyImageWithMetadata(toLocalMediaUrl(directory))).toEqual({ status: "unsupported" });
    const { file, url } = await source(); await fs.truncate(file, MAX_IMAGE_BYTES + 1);
    expect(await copyImageWithMetadata(url)).toEqual({ status: "unsupported" });
    expect(fixture.writer).not.toHaveBeenCalled();
  });
  it("rejects link/junction redirection even for a registered URL", async () => {
    const directory = path.join(fixture.root, "real"); await fs.mkdir(directory);
    await fs.writeFile(path.join(directory, "image.png"), png);
    const link = path.join(fixture.root, "link"); await fs.symlink(directory, link, "junction");
    expect(await copyImageWithMetadata(toLocalMediaUrl(path.join(link, "image.png")))).toEqual({ status: "unsupported" });
  });
  it("does not claim copied when the readback differs or the native image is empty", async () => {
    const { url } = await source(); fixture.readBuffer.mockReturnValue(Buffer.alloc(0));
    expect(await copyImageWithMetadata(url)).toEqual({ status: "failed" });
    fixture.readBuffer.mockReturnValue(png); fixture.readImage.mockReturnValue(nativeImage(png, true));
    expect(await copyImageWithMetadata(url)).toEqual({ status: "failed" });
  });
  it.skipIf(process.platform !== "win32")("does not leak native-writer errors or URLs", async () => {
    const { url } = await source(); fixture.writer.mockRejectedValue(new Error("private fixture data"));
    const log = vi.spyOn(console, "error");
    expect(await copyImageWithMetadata(url)).toEqual({ status: "failed" });
    expect(log).not.toHaveBeenCalled();
  });
});
