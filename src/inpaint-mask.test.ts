import { describe, expect, it } from "vitest";
import {
  buildBinaryInpaintMask,
  buildInpaintMaskPreview,
} from "./inpaint-mask";

function mask(width: number, height: number, points: Array<[number, number]>) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of points) {
    const index = (y * width + x) * 4;
    rgba[index] = 255;
    rgba[index + 1] = 255;
    rgba[index + 2] = 255;
    rgba[index + 3] = 255;
  }
  return buildBinaryInpaintMask(rgba, width, height);
}

describe("buildBinaryInpaintMask", () => {
  it("keeps painted pixels exact instead of expanding them to 64px cells", () => {
    const result = mask(128, 128, [[1, 1], [70, 90]]);
    const redAt = (x: number, y: number) => result.rgba[(y * 128 + x) * 4];
    expect(redAt(1, 1)).toBe(255);
    expect(redAt(70, 90)).toBe(255);
    expect(redAt(2, 1)).toBe(0);
    expect(redAt(64, 64)).toBe(0);
    expect(result.any).toBe(true);
  });

  it("produces a transparent, binary empty mask", () => {
    const result = mask(96, 64, []);
    expect([...result.rgba.slice(0, 8)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(result.any).toBe(false);
  });

  it("normalizes antialiased source pixels to black or white", () => {
    const rgba = new Uint8ClampedArray([12, 12, 12, 40, 0, 0, 0, 0]);
    const result = buildBinaryInpaintMask(rgba, 2, 1);
    expect([...result.rgba]).toEqual([255, 255, 255, 255, 0, 0, 0, 0]);
  });
});

describe("buildInpaintMaskPreview", () => {
  it("keeps preserved pixels transparent and colors selected pixels", () => {
    const binary = new Uint8ClampedArray([
      0, 0, 0, 0,
      255, 255, 255, 255,
    ]);
    expect([...buildInpaintMaskPreview(binary, 2, 1, "#7c3aed")]).toEqual([
      0, 0, 0, 0,
      124, 58, 237, 255,
    ]);
  });

  it("rejects incomplete buffers", () => {
    expect(() => buildInpaintMaskPreview(new Uint8ClampedArray(4), 2, 1))
      .toThrow(RangeError);
  });
});
