import FormData from "form-data";
import { describe, expect, it } from "vitest";
import {
  buildGenerateImageHttpBody,
  isOfficialNaiHost,
  prepareImageBufferForSave,
  stripPngMetadata,
} from "./nai";

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
