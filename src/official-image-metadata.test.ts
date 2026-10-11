import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { extractEmbeddedImageMetadata, readNativeImageMetadata } from "../electron/image-metadata";
import { inspectImageMetadata, parseImageMetaAsync } from "./png-meta";
import { MAX_METADATA_IMAGE_PIXELS, metadataImageHeader, metadataPixelBytes, type MetadataPixelDecoder } from "./image-metadata-pixels";

const root = path.join(process.cwd(), "shared/official-image-metadata-fixtures");
const fixtures: { name: string; expected: Record<string, unknown> }[] = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const decode: MetadataPixelDecoder = async bytes => {
  const {data, info} = await sharp(bytes, {limitInputPixels: MAX_METADATA_IMAGE_PIXELS, page: 0, pages: 1})
    .toColourspace("srgb").ensureAlpha().raw({depth: "uchar"}).toBuffer({resolveWithObject: true});
  return {data, width: info.width, height: info.height, channels: info.channels};
};

describe("official PNG and WebP metadata containers and pixel encodings", () => {
  for (const fixture of fixtures) it(fixture.name, async () => {
    const bytes = fs.readFileSync(path.join(root, fixture.name));
    const original = Uint8Array.from(bytes);
    const report = inspectImageMetadata(await parseImageMetaAsync(Uint8Array.from(bytes).buffer, decode));
    const frontend: Record<string, unknown> = {...report.imported, characters: report.characterCaptions.length};
    const embedded = await extractEmbeddedImageMetadata(bytes);
    const backend: Record<string, unknown> = {...embedded?.imported, characters: embedded?.characterCaptions.length};
    const agentReport = inspectImageMetadata(await readNativeImageMetadata(bytes));
    expect(agentReport.imported).toEqual(report.imported);
    expect(agentReport.characterCaptions).toEqual(report.characterCaptions);
    for (const [key, value] of Object.entries(fixture.expected)) {
      expect(frontend[key], `frontend ${key}`).toEqual(value);
      expect(backend[key], `backend ${key}`).toEqual(value);
    }
    expect(Uint8Array.from(bytes)).toEqual(original);
  });

  it("rejects excessive dimensions before requesting pixel allocation", async () => {
    const bytes = Uint8Array.from(fs.readFileSync(path.join(root, "rgba-16-plain.png")));
    new DataView(bytes.buffer).setUint32(16, MAX_METADATA_IMAGE_PIXELS);
    expect(metadataImageHeader(bytes)).toBeNull();
    const decoder = vi.fn(decode);
    await parseImageMetaAsync(bytes.buffer, decoder);
    expect(decoder).not.toHaveBeenCalled();
  });

  it("rejects short input and truncated WebP chunks", async () => {
    for (const bytes of [new Uint8Array(8), Uint8Array.from(fs.readFileSync(path.join(root, "webp-lossy-alpha.webp")).subarray(0, 36))]) {
      expect(metadataImageHeader(bytes)).toBeNull();
      const decoder = vi.fn(decode);
      await parseImageMetaAsync(bytes.buffer, decoder);
      expect(decoder).not.toHaveBeenCalled();
    }
  });

  it("does not trust a decoder returning mismatched dimensions", async () => {
    const bytes = Uint8Array.from(fs.readFileSync(path.join(root, "rgba-16-plain.png")));
    const metadata = await parseImageMetaAsync(bytes.buffer, async () => ({data: new Uint8Array(64 * 128 * 4), width: 128, height: 64, channels: 4}));
    expect(inspectImageMetadata(metadata).imported.positivePrompt).toBeUndefined();
  });

  it("isolates optional decoder failures", async () => {
    const bytes = Uint8Array.from(fs.readFileSync(path.join(root, "rgba-16-plain.png")));
    await expect(parseImageMetaAsync(bytes.buffer, async () => {throw new Error("damaged pixels");})).resolves.toEqual({});
  });

  it("strips optional text before pixel decoding", () => {
    const bytes = Uint8Array.from(fs.readFileSync(path.join(root, "png-text-plus-stealth.png")));
    const clean = metadataPixelBytes(bytes);
    expect(clean.length).toBeLessThan(bytes.length);
    expect(metadataImageHeader(clean)).toEqual(metadataImageHeader(bytes));
  });
});
