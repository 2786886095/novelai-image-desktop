import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPENAI_EDIT_MODEL,
  editFormFields,
  featherSelection,
  imageEditEndpoint,
  maskSelection,
  normalizeOpenAIImageEditSettings,
  planEditCanvas,
  resizeSelection,
} from "./openai-image-edit";

describe("openai image edit helpers", () => {
  it("defaults to the official endpoint and gpt-image-2.5-sunburst", () => {
    const settings = normalizeOpenAIImageEditSettings(undefined);
    expect(settings).toEqual({ baseUrl: "https://api.openai.com/v1", model: DEFAULT_OPENAI_EDIT_MODEL, quality: "auto", inputFidelity: "", size: "fit" });
    expect(DEFAULT_OPENAI_EDIT_MODEL).toBe("gpt-image-2.5-sunburst");
    expect(normalizeOpenAIImageEditSettings({ model: "  my-relay-model ", quality: "ultra", inputFidelity: "max", size: "huge" }))
      .toMatchObject({ model: "my-relay-model", quality: "auto", inputFidelity: "", size: "fit" });
    expect(normalizeOpenAIImageEditSettings({ size: "1536x1024", quality: "high", inputFidelity: "high" }))
      .toMatchObject({ size: "1536x1024", quality: "high", inputFidelity: "high" });
  });

  it("derives the edits route from base, generations or edits URLs (official or relay)", () => {
    expect(imageEditEndpoint("https://api.openai.com/v1")).toBe("https://api.openai.com/v1/images/edits");
    expect(imageEditEndpoint("https://relay.example/v1/")).toBe("https://relay.example/v1/images/edits");
    expect(imageEditEndpoint("https://relay.example/v1/images/generations")).toBe("https://relay.example/v1/images/edits");
    expect(imageEditEndpoint("https://relay.example/v1/images/edits")).toBe("https://relay.example/v1/images/edits");
    expect(imageEditEndpoint("http://127.0.0.1:3000/v1")).toBe("http://127.0.0.1:3000/v1/images/edits");
    expect(() => imageEditEndpoint("http://relay.example/v1")).toThrow();
    expect(() => imageEditEndpoint("https://user:pass@relay.example/v1")).toThrow();
    expect(() => imageEditEndpoint("https://relay.example/v1?key=secret")).toThrow();
  });

  it("pads to the closest standard size without cropping", () => {
    const wide = planEditCanvas(1216, 832, "fit");
    expect(wide.size).toBe("1536x1024");
    expect(wide.canvas).toEqual({ width: 1248, height: 832 });
    expect(wide.offset).toEqual({ x: 16, y: 0 });
    expect(wide.upload).toEqual({ width: 1536, height: 1024 });
    const tall = planEditCanvas(832, 1216, "fit");
    expect(tall.size).toBe("1024x1536");
    expect(tall.canvas.height).toBe(1248);
    expect(planEditCanvas(1000, 1000, "fit").size).toBe("1024x1024");
    const explicit = planEditCanvas(1000, 1000, "2048x1024");
    expect(explicit).toMatchObject({ size: "2048x1024", canvas: { width: 2000, height: 1000 }, offset: { x: 500, y: 0 } });
    const auto = planEditCanvas(4096, 2048, "auto");
    expect(auto).toMatchObject({ size: "auto", canvas: { width: 4096, height: 2048 }, upload: { width: 2048, height: 1024 } });
  });

  it("builds validated form fields and omits defaults the provider may reject", () => {
    expect(editFormFields({ model: "m", quality: "auto", inputFidelity: "" }, "make it night", "1536x1024"))
      .toEqual([["model", "m"], ["prompt", "make it night"], ["n", "1"], ["size", "1536x1024"]]);
    expect(editFormFields({ model: "m", quality: "high", inputFidelity: "high" }, "x", "auto"))
      .toEqual(expect.arrayContaining([["quality", "high"], ["input_fidelity", "high"]]));
    expect(() => editFormFields({ model: "", quality: "auto", inputFidelity: "" }, "x", "auto")).toThrow();
    expect(() => editFormFields({ model: "m", quality: "auto", inputFidelity: "" }, "  ", "auto")).toThrow();
    expect(() => editFormFields({ model: "m\nx", quality: "auto", inputFidelity: "" }, "x", "auto")).toThrow();
  });

  it("reads alpha-encoded and legacy brightness masks like the NovelAI path", () => {
    // 2x1: [selected (alpha 255), unselected (alpha 0)]
    expect([...maskSelection([255, 255, 255, 255, 255, 255, 255, 0], 2, 1)]).toEqual([1, 0]);
    // legacy opaque: white = repaint, black = keep
    expect([...maskSelection([255, 255, 255, 255, 0, 0, 0, 255], 2, 1)]).toEqual([1, 0]);
    expect([...resizeSelection(Uint8Array.from([1, 0]), 2, 1, 4, 2)]).toEqual([1, 1, 0, 0, 1, 1, 0, 0]);
  });

  it("grows and feathers the paste-back alpha", () => {
    const width = 40, height = 1;
    const selection = new Uint8Array(width);
    for (let x = 18; x < 22; x += 1) selection[x] = 1;
    const alpha = featherSelection(selection, width, height, 4, 6);
    expect(alpha[20]).toBe(255);         // inside stays fully replaced
    expect(alpha[16]).toBeGreaterThan(200); // grown edge is still mostly replaced
    expect(alpha[0]).toBe(0);           // far outside keeps the source
    expect(alpha[39]).toBe(0);
    for (let x = 1; x < 20; x += 1) expect(alpha[x]).toBeGreaterThanOrEqual(alpha[x - 1]); // monotonic ramp
  });
});
