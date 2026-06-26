import FormData from "form-data";
import { describe, expect, it } from "vitest";
import { buildGenerateImageHttpBody } from "./nai";

function b64(text: string) {
  return Buffer.from(text, "utf8").toString("base64");
}

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
