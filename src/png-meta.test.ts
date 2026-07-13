import { describe, it, expect } from "vitest";
import {
  inspectImageMetadata,
  parseImageMeta,
  parsePngMeta,
  parseImportedParams,
  parseStableDiffusionParameters,
} from "./png-meta";

// Build a minimal PNG ArrayBuffer containing the given tEXt key/value chunks.
// parsePngMeta does not verify CRCs, so we can leave them zeroed.
function makePng(chunks: Array<[string, string]>): ArrayBuffer {
  const enc = new TextEncoder();
  const parts: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const pushChunk = (type: string, data: number[]) => {
    const len = data.length;
    parts.push((len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff);
    for (const c of type) parts.push(c.charCodeAt(0));
    parts.push(...data);
    parts.push(0, 0, 0, 0); // CRC placeholder
  };
  for (const [key, value] of chunks) {
    const data = [...enc.encode(key), 0, ...enc.encode(value)];
    pushChunk("tEXt", data);
  }
  pushChunk("IEND", []);
  return new Uint8Array(parts).buffer;
}

function makeExifJpeg(parameters: string): ArrayBuffer {
  const comment = [
    ...new TextEncoder().encode("ASCII\0\0\0"),
    ...new TextEncoder().encode(parameters),
    0,
  ];
  const tiff = new Uint8Array(44 + comment.length);
  const view = new DataView(tiff.buffer);
  tiff.set([0x4d, 0x4d], 0);
  view.setUint16(2, 42, false);
  view.setUint32(4, 8, false);
  view.setUint16(8, 1, false);
  view.setUint16(10, 0x8769, false);
  view.setUint16(12, 4, false);
  view.setUint32(14, 1, false);
  view.setUint32(18, 26, false);
  view.setUint32(22, 0, false);
  view.setUint16(26, 1, false);
  view.setUint16(28, 0x9286, false);
  view.setUint16(30, 7, false);
  view.setUint32(32, comment.length, false);
  view.setUint32(36, 44, false);
  view.setUint32(40, 0, false);
  tiff.set(comment, 44);
  const payload = new Uint8Array(6 + tiff.length);
  payload.set([0x45, 0x78, 0x69, 0x66, 0, 0]);
  payload.set(tiff, 6);
  const length = payload.length + 2;
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe1, (length >>> 8) & 0xff, length & 0xff,
    ...payload,
    0xff, 0xd9,
  ]).buffer;
}

describe("parsePngMeta", () => {
  it("reads tEXt chunks", () => {
    const buf = makePng([
      ["Description", "1girl, masterpiece"],
      ["Software", "NovelAI"],
    ]);
    const meta = parsePngMeta(buf);
    expect(meta.Description).toBe("1girl, masterpiece");
    expect(meta.Software).toBe("NovelAI");
  });

  it("returns empty for a non-PNG buffer", () => {
    expect(parsePngMeta(new Uint8Array([1, 2, 3]).buffer)).toEqual({});
  });
});

describe("parseImportedParams", () => {
  it("maps NovelAI Description + Comment JSON to params", () => {
    const comment = JSON.stringify({
      uc: "lowres, bad",
      steps: 28,
      scale: 6,
      seed: 12345,
      width: 832,
      height: 1216,
      sampler: "k_euler_ancestral",
      sm: true,
      sm_dyn: false,
    });
    const out = parseImportedParams({ Description: "1girl, masterpiece", Comment: comment });
    expect(out.positivePrompt).toBe("1girl, masterpiece");
    expect(out.negativePrompt).toBe("lowres, bad");
    expect(out.steps).toBe(28);
    expect(out.seed).toBe(12345);
    expect(out.seedMode).toBe("fixed");
    expect(out.width).toBe(832);
    expect(out.sampler).toBe("k_euler_ancestral");
    expect(out.smea).toBe(true);
  });

  it("ignores unknown sampler/model values", () => {
    const out = parseImportedParams({ Comment: JSON.stringify({ sampler: "nope", model: "fake" }) });
    expect(out.sampler).toBeUndefined();
    expect(out.model).toBeUndefined();
  });

  it("omits absent fields (no undefined keys)", () => {
    const out = parseImportedParams({ Comment: "{}" });
    expect(Object.keys(out)).toHaveLength(0);
  });

  it("survives malformed Comment JSON", () => {
    const out = parseImportedParams({ Description: "x", Comment: "{not json" });
    expect(out.positivePrompt).toBe("x");
  });
});

describe("Stable Diffusion metadata", () => {
  const parameters = [
    "1girl, blue hair, city",
    "Negative prompt: lowres, bad hands",
    "Steps: 24, Sampler: Euler a, Schedule type: Karras, CFG scale: 7, Seed: 42, Size: 768x1152, Model hash: abc123, Model: animeXL_v1",
  ].join("\n");

  it("parses A1111 / Forge infotext without losing comma-separated prompts", () => {
    const parsed = parseStableDiffusionParameters(parameters);
    expect(parsed.prompt).toBe("1girl, blue hair, city");
    expect(parsed.negativePrompt).toBe("lowres, bad hands");
    expect(parsed.parameters.Steps).toBe("24");
    expect(parsed.parameters.Sampler).toBe("Euler a");
    expect(parsed.parameters.Model).toBe("animeXL_v1");
  });

  it("maps compatible SD values while retaining view-only fields", () => {
    const report = inspectImageMetadata({ parameters });
    expect(report.kind).toBe("stable-diffusion");
    expect(report.imported.positivePrompt).toContain("blue hair");
    expect(report.imported.sampler).toBe("k_euler_ancestral");
    expect(report.imported.noiseSchedule).toBe("karras");
    expect(report.imported.width).toBe(768);
    expect(report.imported.height).toBe(1152);
    expect(report.entries.some((entry) => entry.key === "Model" && entry.value === "animeXL_v1")).toBe(true);
  });

  it("reads A1111 generation parameters from JPEG EXIF UserComment", () => {
    const metadata = parseImageMeta(makeExifJpeg(parameters));
    expect(metadata.parameters).toContain("Sampler: Euler a");
    const report = inspectImageMetadata(metadata);
    expect(report.kind).toBe("stable-diffusion");
    expect(report.imported.seed).toBe(42);
  });
});

describe("ComfyUI metadata", () => {
  it("extracts the sampler path and keeps the complete workflow raw", () => {
    const prompt = {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sdxl.safetensors" } },
      "2": { class_type: "CLIPTextEncode", inputs: { text: "1girl, silver hair", clip: ["1", 1] } },
      "3": { class_type: "CLIPTextEncode", inputs: { text: "lowres", clip: ["1", 1] } },
      "4": { class_type: "EmptyLatentImage", inputs: { width: 832, height: 1216, batch_size: 1 } },
      "5": {
        class_type: "KSampler",
        inputs: {
          seed: 99,
          steps: 28,
          cfg: 6,
          sampler_name: "dpmpp_2m",
          scheduler: "karras",
          denoise: 1,
          model: ["1", 0],
          positive: ["2", 0],
          negative: ["3", 0],
          latent_image: ["4", 0],
        },
      },
      "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
      "7": { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: "ComfyUI" } },
    };
    const workflow = { nodes: [{ id: 5, type: "KSampler" }] };
    const report = inspectImageMetadata({ prompt: JSON.stringify(prompt), workflow: JSON.stringify(workflow) });
    expect(report.kind).toBe("comfyui");
    expect(report.imported.positivePrompt).toBe("1girl, silver hair");
    expect(report.imported.negativePrompt).toBe("lowres");
    expect(report.imported.sampler).toBe("k_dpmpp_2m");
    expect(report.imported.width).toBe(832);
    expect(report.rawText).toContain("workflow");
    expect(report.entries.some((entry) => entry.key === "Model" && entry.value === "sdxl.safetensors")).toBe(true);
  });
});
