import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { extractEmbeddedImageMetadata } from "../electron/image-metadata";
import { buildPayload } from "../electron/ipc/nai";
import { inspectImageMetadata, parseImageMeta } from "./png-meta";
import { metadataApplyKeys, selectedMetadata } from "./metadata-selection";
import { DEFAULT_PARAMS, normalizeGenerateParams } from "./types";

// Issue #76: a NovelAI PNG that also carries an A1111-style `parameters` text
// chunk was classified as Stable Diffusion, dropping character prompts and the
// hidden replay values (issue #78: skip_cfg_below_sigma). WebP EXIF never
// produced that key, which is why only PNG was affected.
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (bytes: Buffer) => { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function pngWithText(entries: [string, string][]): Buffer {
  const image = new PNG({ width: 16, height: 16 });
  image.data.fill(255);
  const png = PNG.sync.write(image);
  const ihdrEnd = 8 + 12 + png.readUInt32BE(8);
  const chunks = entries.map(([key, value]) => {
    const data = Buffer.concat([Buffer.from(key, "latin1"), Buffer.from([0]), Buffer.from(value, "utf8")]);
    const head = Buffer.alloc(8); head.writeUInt32BE(data.length); head.write("tEXt", 4, "latin1");
    const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])));
    return Buffer.concat([head, data, tail]);
  });
  return Buffer.concat([png.subarray(0, ihdrEnd), ...chunks, png.subarray(ihdrEnd)]);
}
function novelAiComment(skip?: number) {
  return {
    prompt: "2girls, classroom", uc: "lowres", steps: 28, scale: 5.5, seed: 1234567890, width: 832, height: 1216,
    sampler: "k_euler_ancestral", noise_schedule: "karras", cfg_rescale: 0,
    v4_prompt: { caption: { base_caption: "2girls, classroom", char_captions: [
      { char_caption: "girl, red hair", centers: [{ x: 0.3, y: 0.5 }] },
      { char_caption: "girl, glasses", centers: [{ x: 0.7, y: 0.5 }] },
    ] }, use_coords: true, use_order: true },
    v4_negative_prompt: { caption: { base_caption: "lowres", char_captions: [
      { char_caption: "bad hands", centers: [{ x: 0.3, y: 0.5 }] },
      { char_caption: "", centers: [{ x: 0.7, y: 0.5 }] },
    ] }, legacy_uc: false },
    ...(skip === undefined ? {} : { skip_cfg_below_sigma: skip }),
  };
}
const sdParameters = "2girls, classroom\nNegative prompt: lowres\nSteps: 28, Sampler: Euler a, CFG scale: 5.5, Seed: 1234567890, Size: 832x1216";
function novelAiPng(skip: number | undefined, withSd: boolean) {
  return pngWithText([
    ["Title", "NovelAI generated image"], ["Description", "2girls, classroom"], ["Software", "NovelAI"],
    ["Source", "NovelAI Diffusion V4.5 4BDE2A90"], ["Comment", JSON.stringify(novelAiComment(skip))],
    ...(withSd ? [["parameters", sdParameters] as [string, string]] : []),
  ]);
}
const skipOf = (parameters: Record<string, unknown>) => Object.hasOwn(parameters, "skip_cfg_below_sigma") ? parameters.skip_cfg_below_sigma : "absent";

describe("issue #76: NovelAI PNG with a coexisting SD parameters chunk", () => {
  it("baseline-equivalent PNG without parameters stays NovelAI", () => {
    const report = inspectImageMetadata(parseImageMeta(Uint8Array.from(novelAiPng(0, false)).buffer));
    expect(report.kind).toBe("novelai");
    expect(report.characterCaptions).toHaveLength(2);
  });
  it("classifies as NovelAI, restores positive/negative characters and centres, and keeps the SD text visible", async () => {
    const bytes = novelAiPng(0, true);
    const report = inspectImageMetadata(parseImageMeta(Uint8Array.from(bytes).buffer));
    expect(report.kind).toBe("novelai");
    expect(report.characterCaptions).toEqual([
      { prompt: "girl, red hair", negativePrompt: "bad hands", useCoords: true, x: 0.3, y: 0.5 },
      { prompt: "girl, glasses", negativePrompt: "", useCoords: true, x: 0.7, y: 0.5 },
    ]);
    expect(metadataApplyKeys(report)).toContain("characterCaptions");
    expect(report.entries).toContainEqual({ key: "parameters", value: sdParameters, group: "raw" });
    expect(report.rawMetadata.parameters).toBe(sdParameters);
    // The real workbench loader (drag & drop / import data) sees the same result.
    const embedded = await extractEmbeddedImageMetadata(bytes);
    expect(embedded?.characterCaptions).toHaveLength(2);
    expect(embedded?.imported.positivePrompt).toBe("2girls, classroom");
  });
  it("a genuine SD WebUI image is still Stable Diffusion", () => {
    const report = inspectImageMetadata(parseImageMeta(Uint8Array.from(pngWithText([["parameters", sdParameters]])).buffer));
    expect(report.kind).toBe("stable-diffusion");
    expect(report.imported.steps).toBe(28);
  });
  it("an unsigned Comment without generation fields does not hide SD parameters", () => {
    const report = inspectImageMetadata(parseImageMeta(Uint8Array.from(pngWithText([["Comment", "{\"note\":\"x\"}"], ["parameters", sdParameters]])).buffer));
    expect(report.kind).toBe("stable-diffusion");
  });
});

describe("issue #78: skip_cfg_below_sigma import -> state -> payload", () => {
  for (const withSd of [false, true]) for (const skip of [undefined, 0, 1.5]) {
    it(`skip=${skip ?? "absent"} sdParameters=${withSd}`, () => {
      const report = inspectImageMetadata(parseImageMeta(Uint8Array.from(novelAiPng(skip, withSd)).buffer));
      const { patch } = selectedMetadata(report, new Set(metadataApplyKeys(report)));
      const params = normalizeGenerateParams({ ...DEFAULT_PARAMS, ...patch });
      const payload = buildPayload(params as any, 1, { charCaptions: report.characterCaptions, vibeImages: [] } as any) as any;
      expect(skipOf(payload.parameters)).toBe(skip ?? "absent");
      // A changed model must not replay the value (version-bound replay).
      const other = buildPayload({ ...params, model: "nai-diffusion-4-full" } as any, 1, { charCaptions: [], vibeImages: [] } as any) as any;
      expect(skipOf(other.parameters)).toBe("absent");
    });
  }
});
