import FormData from "form-data";
import fs from "node:fs";
import { encode } from "@msgpack/msgpack";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import {
  applyOfficialInpaintParameters,
  buildPayload,
  buildGenerateImageHttpBody,
  compositeInpaintBuffers,
  consumeGenerateImageStream,
  extractEmbeddedGenerationMetadata,
  isOfficialNaiHost,
  isPreflightNetworkFailure,
  parseAccount,
  prepareExtras,
  prepareInpaintAssets,
  prepareImageBufferForSave,
  resolveUpscaleBaseUrl,
  resolveUpscaleModel,
  resolveUpscaleOutputSize,
  stripPngMetadata,
} from "./nai";
import { frameNaiStreamMessage } from "./nai-stream";
import {
  DEFAULT_PARAMS,
  normalizeGenerateParams,
  supportsNAIModelMode,
  supportsNAIPreciseReference,
} from "../../src/types";

function b64(text: string) {
  return Buffer.from(text, "utf8").toString("base64");
}

function solidPng(width: number, height: number, rgba: [number, number, number, number]) {
  const png = new PNG({ width, height });
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = rgba[0];
    png.data[index + 1] = rgba[1];
    png.data[index + 2] = rgba[2];
    png.data[index + 3] = rgba[3];
  }
  return png;
}

function pngPixel(png: PNG, x: number, y: number) {
  const index = (y * png.width + x) * 4;
  return {
    red: png.data[index],
    green: png.data[index + 1],
    blue: png.data[index + 2],
    alpha: png.data[index + 3],
  };
}

function setPngPixel(png: PNG, x: number, y: number, value: number) {
  const index = (y * png.width + x) * 4;
  png.data[index] = value;
  png.data[index + 1] = value;
  png.data[index + 2] = value;
  png.data[index + 3] = 255;
}

function pngChunk(type: string, data = Buffer.alloc(0)) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);
  // stripPngMetadata only needs chunk framing; CRC contents do not affect the
  // lossless chunk filter and are deliberately left zeroed in this fixture.
  return chunk;
}

function pngWithGenerationMetadata() {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", Buffer.alloc(13)),
    pngChunk("tEXt", Buffer.from("Description\u00001girl, private prompt")),
    pngChunk("iTXt", Buffer.from("Comment\u0000\u0000\u0000\u0000\u0000{\"seed\":123}")),
    pngChunk("eXIf", Buffer.from("private exif")),
    pngChunk("IDAT", Buffer.from([1, 2, 3, 4])),
    pngChunk("IEND"),
  ]);
}

describe("streaming final image recovery", () => {
  it("keeps a completed final frame when the transport reports aborted afterwards", async () => {
    const finalImage = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const finalFrame = frameNaiStreamMessage(encode({
      event_type: "final",
      samp_ix: 0,
      step_ix: 27,
      image: Uint8Array.from(finalImage),
    }));
    async function* interruptedAfterFinal() {
      yield finalFrame;
      const error = Object.assign(new Error("aborted"), { code: "ECONNRESET" });
      throw error;
    }
    const previews: number[] = [];

    const images = await consumeGenerateImageStream(
      interruptedAfterFinal(),
      28,
      (event) => previews.push(event.progress),
      "application/x-msgpack",
    );

    expect(images).toEqual([finalImage]);
    expect(previews).toContain(1);
  });

  it("does not hide an explicit server error that follows a final frame", async () => {
    const finalFrame = frameNaiStreamMessage(encode({
      event_type: "final",
      samp_ix: 0,
      image: Uint8Array.from([1, 2, 3]),
    }));
    const errorFrame = frameNaiStreamMessage(encode({
      event_type: "error",
      message: "aborted",
    }));
    async function* serverErrorStream() {
      yield Buffer.concat([finalFrame, errorFrame]);
    }

    await expect(consumeGenerateImageStream(
      serverErrorStream(),
      28,
      () => undefined,
      "application/x-msgpack",
    )).rejects.toThrow("aborted");
  });
});

describe("persisted generation parameter migration", () => {
  it("repairs legacy enums, invalid numbers, dimensions, and dependent flags", () => {
    const params = normalizeGenerateParams({
      ...DEFAULT_PARAMS,
      model: "retired-model" as any,
      width: 99999,
      height: 95,
      steps: 500,
      cfgScale: Number.NaN,
      cfgRescale: 4,
      sampler: "retired-sampler" as any,
      noiseSchedule: "retired-schedule",
      seed: -10,
      seedMode: "legacy" as any,
      ucPreset: 99 as any,
      smea: false,
      smeaDyn: true,
    });
    expect(params).toMatchObject({
      model: "nai-diffusion-5-full",
      width: 49152,
      height: 64,
      steps: 50,
      cfgScale: 6,
      cfgRescale: 1,
      sampler: "k_euler_ancestral",
      noiseSchedule: "karras",
      seed: 0,
      seedMode: "random",
      ucPreset: 3,
      smeaDyn: false,
    });
  });

  it("keeps Light quality and transparent background V5-only", () => {
    const legacy = normalizeGenerateParams({
      ...DEFAULT_PARAMS,
      model: "nai-diffusion-4-5-full",
      qualityPreset: "light",
      transparentBackground: true,
    });
    expect(legacy).toMatchObject({
      qualityPreset: "standard",
      transparentBackground: false,
    });
  });

  it("sanitizes a direct payload even when a caller bypasses the UI store", () => {
    const payload = buildPayload(
      {
        ...DEFAULT_PARAMS,
        positivePrompt: "1girl",
        width: 99999,
        height: 95,
        steps: -4,
        cfgRescale: 8,
        sampler: "removed" as any,
      },
      -100,
    );
    expect(payload.parameters).toMatchObject({
      width: 49152,
      height: 64,
      steps: 1,
      cfg_rescale: 1,
      sampler: "k_euler_ancestral",
      seed: 1,
    });
  });

  it("preserves imported unsigned 32-bit NovelAI seeds through normalization and payload building", () => {
    const seed = 4_000_000_000;
    const params = normalizeGenerateParams({ ...DEFAULT_PARAMS, seed, seedMode: "fixed" });
    expect(params.seed).toBe(seed);
    expect(buildPayload({ ...params, positivePrompt: "1girl" }, seed).parameters.seed).toBe(seed);
  });

  it("extracts generation parameters for generation-workbench drops", () => {
    const metadata = extractEmbeddedGenerationMetadata(pngWithGenerationMetadata());
    expect(metadata?.imported).toMatchObject({
      positivePrompt: "1girl, private prompt",
      seed: 123,
      seedMode: "fixed",
    });
  });
});

describe("official quality and transparency controls", () => {
  it("builds the V5 Light quality preset without Standard's masterpiece tag", () => {
    const payload = buildPayload(
      {
        ...DEFAULT_PARAMS,
        positivePrompt: "1girl",
        qualityPreset: "light",
        qualityToggle: true,
      },
      123,
    );

    expect(payload.input).toBe("1girl, very aesthetic, amazing quality, no text");
    expect(payload.input).not.toContain("masterpiece");
    expect(payload.parameters).toMatchObject({
      qualityPresetId: "light",
      tag_hint_qt: 3,
    });
  });

  it("drops the preset's contradictory no-text tag when Text: is requested", () => {
    const payload = buildPayload(
      {
        ...DEFAULT_PARAMS,
        positivePrompt: "1girl, text, chinese text, Text: 末班车",
        qualityPreset: "standard",
        qualityToggle: true,
      },
      123,
    );

    expect(payload.input).toContain("Text: 末班车");
    expect(payload.input).toContain("very aesthetic, masterpiece");
    expect(payload.input).not.toMatch(/(?:^|,\s*)no text(?:,|$)/i);
  });

  it("requests V5 straight-alpha output when Transparent BG is enabled", () => {
    const payload = buildPayload(
      {
        ...DEFAULT_PARAMS,
        positivePrompt: "sticker",
        qualityPreset: "none",
        qualityToggle: false,
        transparentBackground: true,
      },
      123,
    );

    expect(payload.input).toBe("sticker, transparent background");
    expect(payload.parameters).toMatchObject({
      tag_hint_transparent_background: true,
      straight_alpha: true,
    });
  });
});

describe("official-style inpaint preparation and compositing", () => {
  it("submits a full-size mask quantized to the 8px grid and official infill fields", () => {
    const source = solidPng(256, 256, [220, 10, 10, 255]);
    const mask = solidPng(256, 256, [0, 0, 0, 255]);
    for (let y = 128; y < 136; y += 1) {
      for (let x = 128; x < 136; x += 1) {
        setPngPixel(mask, x, y, 255);
      }
    }
    const assets = prepareInpaintAssets(
      PNG.sync.write(source),
      PNG.sync.write(mask).toString("base64"),
    );
    const requestMask = PNG.sync.read(Buffer.from(assets.maskBase64, "base64"));
    expect([requestMask.width, requestMask.height]).toEqual([256, 256]);
    expect(requestMask.data[(128 * requestMask.width + 128) * 4]).toBe(255);
    expect(requestMask.data[(135 * requestMask.width + 135) * 4]).toBe(255);
    expect(requestMask.data[(136 * requestMask.width + 136) * 4]).toBe(0);
    expect(requestMask.data[0]).toBe(0);

    const parameters: Record<string, unknown> = { strength: 0.4 };
    applyOfficialInpaintParameters(parameters, assets, 0.8, 0.72, 123);
    expect(parameters).toMatchObject({
      add_original_image: false,
      inpaintImg2ImgStrength: 0.8,
      img2img: { strength: 0.8, color_correct: true },
      noise: 0,
      extra_noise_seed: 122,
    });
    expect(parameters.strength).toBe(0.7);

    const officialDefault: Record<string, unknown> = {};
    applyOfficialInpaintParameters(officialDefault, assets, 1, 0, 123);
    expect(officialDefault).toMatchObject({
      strength: 0.7,
      inpaintImg2ImgStrength: 1,
    });
    expect(officialDefault.img2img).toBeUndefined();
  });

  it("feathers the generated image over the source and preserves untouched pixels", () => {
    const source = solidPng(256, 256, [220, 10, 10, 255]);
    const mask = solidPng(256, 256, [0, 0, 0, 255]);
    for (let y = 128; y < 136; y += 1) {
      for (let x = 128; x < 136; x += 1) {
        setPngPixel(mask, x, y, 255);
      }
    }
    const assets = prepareInpaintAssets(
      PNG.sync.write(source),
      PNG.sync.write(mask).toString("base64"),
    );
    const generated = PNG.sync.write(solidPng(256, 256, [10, 20, 230, 255]));
    const output = PNG.sync.read(compositeInpaintBuffers([generated], assets)[0]);
    const corner = pngPixel(output, 0, 0);
    const center = pngPixel(output, 132, 132);
    expect([corner.red, corner.green, corner.blue, corner.alpha]).toEqual([
      220, 10, 10, 255,
    ]);
    expect(center.blue).toBeGreaterThan(center.red);
    expect(assets.blendAlpha[132 * assets.width + 132]).toBeGreaterThan(200);
  });

  it("resizes to the official 64-aligned request size and keeps that output size", () => {
    const source = solidPng(65, 67, [20, 30, 40, 255]);
    const mask = solidPng(65, 67, [255, 255, 255, 255]);
    const assets = prepareInpaintAssets(
      PNG.sync.write(source),
      PNG.sync.write(mask).toString("base64"),
    );
    expect([assets.width, assets.height, assets.resized]).toEqual([128, 128, true]);
    expect([PNG.sync.read(assets.sourcePng).width, PNG.sync.read(assets.sourcePng).height]).toEqual([128, 128]);
    const generated = PNG.sync.write(solidPng(128, 128, [200, 210, 220, 255]));
    const output = PNG.sync.read(compositeInpaintBuffers([generated], assets)[0]);
    expect([output.width, output.height]).toEqual([128, 128]);
  });
});

describe("NovelAI V5 Opus usage parsing", () => {
  it("uses the official image API user-data route for live allowance refresh", () => {
    const source = fs.readFileSync(new URL("./nai.ts", import.meta.url), "utf8");
    expect(source).toContain('"https://image.novelai.net"');
    expect(source).toContain('axios.get(`${imageBaseUrl}/user/data`');
  });

  it("keeps the official percentage, exhaustion flag, and refill interval", () => {
    const account = parseAccount({
      subscription: {
        tier: 3,
        active: true,
        trainingStepsLeft: { fixedTrainingStepsLeft: 10000, purchasedTrainingSteps: 25 },
        usage: { percent: 73.4, isNegative: false, timeUntilNextPercent: 6041.958 },
      },
    });
    expect(account).toMatchObject({
      tierName: "Opus",
      tierLevel: 3,
      anlasBalance: 10025,
      opusUsage: { percent: 73.4, isNegative: false, timeUntilNextPercent: 6041.958 },
    });
    expect(account.opusUsageUpdatedAt).toBeTypeOf("number");
  });

  it("does not invent usage when the official response omits it", () => {
    expect(parseAccount({ subscription: { tier: 2 } }).opusUsage).toBeUndefined();
  });

  it("accepts the wrappers observed from the official web account route", () => {
    const usage = { percent: 41.2, isNegative: false, timeUntilNextPercent: 7000 };
    expect(parseAccount({ information: { subscription: { tier: 3, usage } } }).opusUsage).toEqual(usage);
    expect(parseAccount({ data: { information: { subscription: { tier: 3, usage } } } }).opusUsage).toEqual(usage);
  });
});

describe("paid request retry boundary", () => {
  it("retries only failures known to happen before the TLS request is sent", () => {
    expect(
      isPreflightNetworkFailure({
        code: "ECONNRESET",
        message:
          "Client network socket disconnected before secure TLS connection was established",
      }),
    ).toBe(true);
    expect(
      isPreflightNetworkFailure({
        code: "ECONNRESET",
        message: "socket hang up",
      }),
    ).toBe(false);
    expect(
      isPreflightNetworkFailure({
        message: "TLS handshake failed",
        response: { status: 500 },
      }),
    ).toBe(false);
  });
});

describe("image metadata save preference", () => {
  it("removes PNG generation metadata without re-encoding image chunks", () => {
    const source = pngWithGenerationMetadata();
    const stripped = stripPngMetadata(source);

    expect(stripped.toString("latin1")).not.toContain("Description");
    expect(stripped.toString("latin1")).not.toContain("Comment");
    expect(stripped.toString("latin1")).not.toContain("private exif");
    expect(stripped.toString("latin1")).toContain("IDAT");
    expect(stripped.subarray(0, 8)).toEqual(source.subarray(0, 8));
  });

  it("uses the same preference for every save path and leaves non-PNG bytes untouched", () => {
    const source = pngWithGenerationMetadata();
    expect(prepareImageBufferForSave(source, true)).toBe(source);
    expect(prepareImageBufferForSave(source, false).toString("latin1")).not.toContain("Description");

    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    expect(prepareImageBufferForSave(jpeg, false)).toBe(jpeg);
  });
});

describe("buildGenerateImageHttpBody", () => {
  it("uploads img2img image and mask as form parts when precise references force multipart", () => {
    const payload = {
      input: "1girl",
      model: "nai-diffusion-4-5-full",
      action: "generate",
      parameters: {
        image: b64("source image bytes"),
        mask: b64("mask bytes"),
        director_reference_images: [b64("director reference bytes")],
        director_reference_images_cached: [{ cache_secret_key: "hash", data: "director_ref_0" }],
      },
    } as any;

    const result = buildGenerateImageHttpBody(payload);

    expect(result.useMultipart).toBe(true);
    expect(result.bodyHeaders["content-type"]).toContain("multipart/form-data");
    expect(result.body).toBeInstanceOf(FormData);

    const formText = (result.body as FormData).getBuffer().toString("latin1");
    expect(formText).toContain('name="request"');
    expect(formText).toContain('name="image"; filename="image"');
    expect(formText).toContain('name="mask"; filename="mask"');
    expect(formText).toContain('name="director_ref_0"; filename="blob"');
    expect(formText).toContain('"image":"image"');
    expect(formText).toContain('"mask":"mask"');
    expect(formText).toContain('"data":"director_ref_0"');
    expect(formText).not.toContain("director_reference_images\":[");
  });

  it("keeps ordinary text-to-image requests as JSON", () => {
    const payload = {
      input: "1girl",
      model: "nai-diffusion-4-5-full",
      action: "generate",
      parameters: { width: 832, height: 1216 },
    } as any;

    const result = buildGenerateImageHttpBody(payload);

    expect(result.useMultipart).toBe(false);
    expect(result.body).toBe(payload);
    expect(result.bodyHeaders["Content-Type"]).toBe("application/json");
  });
});

describe("V4 character prompt payload", () => {
  it("uses V5 Full while preserving the app's established V4.5 parameter defaults", () => {
    expect(DEFAULT_PARAMS).toMatchObject({
      model: "nai-diffusion-5-full",
      steps: 28,
      cfgScale: 6,
      sampler: "k_euler_ancestral",
      noiseSchedule: "karras",
    });
  });

  it("builds a V5 payload with V5 capabilities instead of replaying V4-only fields", () => {
    const charCaptions = Array.from({ length: 40 }, (_, index) => ({
      prompt: `character ${index + 1}`,
      negativePrompt: "",
      useCoords: false,
      x: 0.5,
      y: 0.5,
    }));
    const payload = buildPayload(
      {
        ...DEFAULT_PARAMS,
        positivePrompt: "group",
        cfgRescale: 0.5,
        noiseSchedule: "exponential",
        variety: true,
      },
      123,
      {
        vibeImages: [{ base64: b64("vibe"), infoExtracted: 1, strength: 1 }],
        charCaptions,
        preciseReferences: [{
          base64: b64("precise"),
          type: "character",
          strength: 1,
          fidelity: 1,
        }],
      },
    );
    const prompt = payload.parameters.v4_prompt as {
      caption: { char_captions: unknown[] };
    };

    expect(payload.model).toBe("nai-diffusion-5-full");
    expect(payload.parameters.params_version).toBe(4);
    expect(payload.parameters.noise_schedule).toBe("karras");
    expect(payload.parameters.dynamic_thresholding).toBe(false);
    expect(payload.parameters.skip_cfg_above_sigma).toBeNull();
    expect(payload.parameters.reference_image_multiple).toBeUndefined();
    expect(payload.parameters.director_reference_images).toBeUndefined();
    expect(payload.parameters.v4_negative_prompt.legacy_uc).toBe(false);
    expect(prompt.caption.char_captions).toHaveLength(32);
  });

  it("keeps Precise Reference limited to V4.5 while V5 remains a structured-prompt model", () => {
    expect(supportsNAIPreciseReference("nai-diffusion-4-5-full")).toBe(true);
    expect(supportsNAIPreciseReference("nai-diffusion-4-5-curated-inpainting")).toBe(true);
    expect(supportsNAIPreciseReference("nai-diffusion-5-full")).toBe(false);
    expect(supportsNAIPreciseReference("nai-diffusion-5-curated")).toBe(false);
  });

  it("rejects V5 Precise Reference before building or posting a generation request", async () => {
    await expect(
      prepareExtras(DEFAULT_PARAMS, {
        vibeImages: [],
        charCaptions: [],
        preciseReferences: [
          { base64: b64("precise"), type: "character", strength: 1, fidelity: 1 },
        ],
      }),
    ).rejects.toThrow(/仅支持 NovelAI V4\.5/);
  });

  it("uses the current V5 checkpoint in Furry mode and prefixes the official dataset tag once", () => {
    expect(supportsNAIModelMode("nai-diffusion-5-full", "furry")).toBe(true);
    expect(supportsNAIModelMode("nai-diffusion-5-curated", "furry")).toBe(true);
    expect(supportsNAIModelMode("nai-diffusion-3", "furry")).toBe(false);
    const furry = buildPayload(
      { ...DEFAULT_PARAMS, positivePrompt: "anthro wolf", qualityPreset: "none", qualityToggle: false },
      123,
      { vibeImages: [], preciseReferences: [], charCaptions: [], modelMode: "furry" },
    );
    expect(furry.model).toBe("nai-diffusion-5-full");
    expect(furry.input).toBe("fur dataset, anthro wolf");
    expect((furry.parameters.v4_prompt as any).caption.base_caption).toBe(
      "fur dataset, anthro wolf",
    );

    const alreadyTagged = buildPayload(
      { ...DEFAULT_PARAMS, positivePrompt: "fur dataset, anthro fox", qualityPreset: "none", qualityToggle: false },
      123,
      { vibeImages: [], preciseReferences: [], charCaptions: [], modelMode: "furry" },
    );
    expect(alreadyTagged.input.match(/fur dataset/gi)).toHaveLength(1);
  });

  it("keeps the dedicated Furry V3 prompt unchanged", () => {
    const payload = buildPayload(
      {
        ...DEFAULT_PARAMS,
        model: "nai-diffusion-furry-3",
        positivePrompt: "anthro wolf",
        qualityPreset: "none",
        qualityToggle: false,
      },
      123,
      { vibeImages: [], preciseReferences: [], charCaptions: [], modelMode: "furry" },
    );
    expect(payload.input).toBe("anthro wolf");
  });

  it("preserves per-character negative prompts restored from NovelAI metadata", () => {
    const payload = buildPayload(
      { ...DEFAULT_PARAMS, positivePrompt: "forest", qualityPreset: "none", qualityToggle: false, ucPreset: 3 },
      123,
      { vibeImages: [], preciseReferences: [], charCaptions: [{
        prompt: "girl, blue hair",
        negativePrompt: "short hair, smiling",
        useCoords: false,
        x: 0.5,
        y: 0.5,
      }] },
    );
    const negative = payload.parameters.v4_negative_prompt as {
      caption: { char_captions: Array<{ char_caption: string }> };
    };
    expect(negative.caption.char_captions).toEqual([{
      char_caption: "short hair, smiling",
      centers: [{ x: 0.5, y: 0.5 }],
    }]);
  });

  it("uses Human Focus with Variety+ disabled for new-user defaults", () => {
    const payload = buildPayload(
      { ...DEFAULT_PARAMS, positivePrompt: "1girl", negativePrompt: "custom negative" },
      123,
      { vibeImages: [], preciseReferences: [], charCaptions: [] },
    );

    expect(DEFAULT_PARAMS.ucPreset).toBe(2);
    expect(DEFAULT_PARAMS.variety).toBe(false);
    expect(payload.parameters.uc).toContain("custom negative");
    expect(payload.parameters.uc).toContain("bad anatomy");
    expect(payload.parameters.uc).toContain("mismatched pupils");
    expect(payload.parameters.skip_cfg_above_sigma).toBeNull();
  });

  it("uses the AI-choice center when character position is unspecified", () => {
    const payload = buildPayload(
      { ...DEFAULT_PARAMS, positivePrompt: "2girls" },
      123,
      {
        vibeImages: [],
        preciseReferences: [],
        charCaptions: [
          { prompt: "girl, blue hair", useCoords: false, x: 0.1, y: 0.9 },
        ],
      },
    );
    const v4Prompt = payload.parameters.v4_prompt as {
      caption: { char_captions: Array<{ centers: Array<{ x: number; y: number }> }> };
      use_coords: boolean;
    };

    expect(payload.parameters.use_coords).toBe(false);
    expect(v4Prompt.use_coords).toBe(false);
    expect(v4Prompt.caption.char_captions[0].centers).toEqual([{ x: 0.5, y: 0.5 }]);
  });

  it("keeps the selected center when character position is specified", () => {
    const payload = buildPayload(
      { ...DEFAULT_PARAMS, positivePrompt: "2girls" },
      123,
      {
        vibeImages: [],
        preciseReferences: [],
        charCaptions: [
          { prompt: "girl, red hair", useCoords: true, x: 0.2, y: 0.8 },
        ],
      },
    );
    const v4Prompt = payload.parameters.v4_prompt as {
      caption: { char_captions: Array<{ centers: Array<{ x: number; y: number }> }> };
      use_coords: boolean;
    };

    expect(payload.parameters.use_coords).toBe(true);
    expect(v4Prompt.use_coords).toBe(true);
    expect(v4Prompt.caption.char_captions[0].centers).toEqual([{ x: 0.2, y: 0.8 }]);
  });
});

describe("isOfficialNaiHost (P1-14)", () => {
  it("accepts the real API/image hosts over HTTPS", () => {
    expect(isOfficialNaiHost("https://api.novelai.net")).toBe(true);
    expect(isOfficialNaiHost("https://image.novelai.net")).toBe(true);
    expect(isOfficialNaiHost("https://text.novelai.net")).toBe(true);
  });

  it("rejects a novelai.net host over plain HTTP (token would go in the clear)", () => {
    expect(isOfficialNaiHost("http://api.novelai.net")).toBe(false);
    expect(isOfficialNaiHost("http://image.novelai.net")).toBe(false);
  });

  it("rejects a lookalike host regardless of scheme", () => {
    expect(isOfficialNaiHost("https://novelai.net.attacker.com")).toBe(false);
    expect(isOfficialNaiHost("https://notnovelai.net")).toBe(false);
  });

  it("still allows loopback over plain HTTP (local dev/reverse-proxy)", () => {
    expect(isOfficialNaiHost("http://localhost:8080")).toBe(true);
    expect(isOfficialNaiHost("http://127.0.0.1:8080")).toBe(true);
  });

  it("returns false for an unparseable URL", () => {
    expect(isOfficialNaiHost("not a url")).toBe(false);
  });
});

describe("resolveUpscaleBaseUrl", () => {
  it("routes the dedicated upscaler through the NovelAI image host", () => {
    expect(resolveUpscaleBaseUrl("https://image.novelai.net")).toBe(
      "https://image.novelai.net",
    );
    expect(resolveUpscaleBaseUrl("https://api.novelai.net")).toBe(
      "https://image.novelai.net",
    );
  });

  it("keeps an explicitly configured loopback endpoint", () => {
    expect(resolveUpscaleBaseUrl("http://127.0.0.1:9000/")).toBe(
      "http://127.0.0.1:9000",
    );
  });
});

describe("resolveUpscaleModel", () => {
  it("uses supported generation models and strips renderer-only aliases", () => {
    expect(resolveUpscaleModel("nai-diffusion-5-full")).toBe("nai-diffusion-5-full");
    expect(resolveUpscaleModel("nai-diffusion-5-full-inpainting")).toBe("nai-diffusion-5-full");
    expect(resolveUpscaleModel("nai-diffusion-4-5-full")).toBe("nai-diffusion-4-5-curated");
    expect(resolveUpscaleModel("nai-diffusion-4-5-full-inpainting")).toBe("nai-diffusion-4-5-curated");
    expect(resolveUpscaleModel("nai-diffusion-4-5-curated")).toBe("nai-diffusion-4-5-curated");
    expect(resolveUpscaleModel("nai-diffusion-furry-3")).toBe("nai-diffusion-3-furry");
  });

  it("falls back to the current SDK default for unknown models", () => {
    expect(resolveUpscaleModel("retired-model")).toBe("nai-diffusion-5-curated");
  });
});

describe("resolveUpscaleOutputSize", () => {
  it("allows output up to 4096px on either edge", () => {
    expect(resolveUpscaleOutputSize(1024, 1024, 4)).toEqual({
      width: 4096,
      height: 4096,
      exceedsLimit: false,
    });
  });

  it("blocks an oversized result before the upscale request", () => {
    expect(resolveUpscaleOutputSize(832, 1216, 4)).toEqual({
      width: 3328,
      height: 4864,
      exceedsLimit: true,
    });
  });
});
