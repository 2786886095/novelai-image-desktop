import FormData from "form-data";
import { describe, expect, it } from "vitest";
import {
  buildPayload,
  buildGenerateImageHttpBody,
  isOfficialNaiHost,
  isPreflightNetworkFailure,
  prepareImageBufferForSave,
  stripPngMetadata,
} from "./nai";
import { DEFAULT_PARAMS, normalizeGenerateParams } from "../../src/types";

function b64(text: string) {
  return Buffer.from(text, "utf8").toString("base64");
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
    pngChunk("iTXt", Buffer.from("Comment\u0000{\"seed\":123}")),
    pngChunk("eXIf", Buffer.from("private exif")),
    pngChunk("IDAT", Buffer.from([1, 2, 3, 4])),
    pngChunk("IEND"),
  ]);
}

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
      model: "nai-diffusion-4-5-full",
      width: 1600,
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
      width: 1600,
      height: 64,
      steps: 1,
      cfg_rescale: 1,
      sampler: "k_euler_ancestral",
      seed: 1,
    });
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
  it("preserves per-character negative prompts restored from NovelAI metadata", () => {
    const payload = buildPayload(
      { ...DEFAULT_PARAMS, positivePrompt: "forest", qualityToggle: false, ucPreset: 3 },
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
