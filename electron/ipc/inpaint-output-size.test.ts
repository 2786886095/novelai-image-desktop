import fs from "node:fs";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { compositeInpaintBuffers, prepareInpaintAssets } from "./nai";
import { calculateFeatureAnlasQuote } from "../../src/anlas";
import { DEFAULT_PARAMS } from "../../src/types";

function solid(width: number, height: number, red: number) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = red;
    png.data[i + 3] = 255;
  }
  return png;
}

describe("selected inpaint output dimensions", () => {
  it("restores the existing size selector and uses selected params at submission", () => {
    const app = fs.readFileSync("src/App.tsx", "utf8");
    expect(app).not.toContain("lockSizeToSource");
    const store = fs.readFileSync("src/store.ts", "utf8");
    const action = store.slice(store.indexOf("  async inpaint()"), store.indexOf("  async upscale()"));
    expect(action).not.toContain("width: sourceImage.width,\n      height: sourceImage.height");
    expect(fs.readFileSync("electron/ipc/nai.ts", "utf8")).toContain("prepareInpaintAssets(buffer, maskBase64, params)");
  });

  it("scales a 1024x2048 source and its mask to 704x1408 and saves that size", () => {
    const source = solid(1024, 2048, 40);
    const mask = solid(1024, 2048, 0);
    for (let y = 1024; y < 1536; y++) {
      for (let x = 512; x < 768; x++) mask.data[(y * 1024 + x) * 4] = 255;
    }
    const assets = prepareInpaintAssets(PNG.sync.write(source), PNG.sync.write(mask).toString("base64"), { width: 704, height: 1408 });
    const uploadedMask = PNG.sync.read(Buffer.from(assets.maskBase64, "base64"));
    expect([uploadedMask.width, uploadedMask.height]).toEqual([704, 1408]);
    expect(uploadedMask.data[(880 * 704 + 440) * 4]).toBe(255);
    expect(uploadedMask.data[0]).toBe(0);
    const output = PNG.sync.read(compositeInpaintBuffers([PNG.sync.write(solid(704, 1408, 220))], assets)[0]);
    expect([output.width, output.height]).toEqual([704, 1408]);
    expect(output.data[0]).toBe(40);
    expect(output.data[(880 * 704 + 440) * 4]).toBeGreaterThan(200);
  });

  it("quotes the requested output rather than the larger imported image", () => {
    const request = { feature: "inpaint" as const, params: { ...DEFAULT_PARAMS, width: 704, height: 1408 }, account: { hasToken: true, tierLevel: 1, hasActiveSubscription: true, anlasBalance: 1000 } };
    const quote = calculateFeatureAnlasQuote({ ...request, image: { width: 1024, height: 2048 } });
    const expected = calculateFeatureAnlasQuote({ ...request, image: { width: 704, height: 1408 } });
    expect(quote.ok).toBe(true);
    expect(quote.amount).toBe(expected.amount);
    const larger = calculateFeatureAnlasQuote({ ...request, params: { ...request.params, width: 1024, height: 2048 } });
    expect(quote.amount!).toBeLessThan(larger.amount!);
  });
});
