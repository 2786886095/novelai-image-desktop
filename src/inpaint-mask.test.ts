import { describe, expect, it } from "vitest";
import { buildLatentMaskCells } from "./inpaint-mask";

function mask(width: number, height: number, points: Array<[number, number]>) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of points) {
    const index = (y * width + x) * 4;
    rgba[index] = 255;
    rgba[index + 1] = 255;
    rgba[index + 2] = 255;
    rgba[index + 3] = 255;
  }
  return buildLatentMaskCells(rgba, width, height);
}

describe("buildLatentMaskCells", () => {
  it("expands arbitrary painted pixels into their 64px latent cells", () => {
    const result = mask(128, 128, [[1, 1], [70, 90]]);
    expect([...result.cells]).toEqual([1, 0, 0, 1]);
    expect(result.any).toBe(true);
  });

  it("keeps an empty mask empty", () => {
    const result = mask(96, 64, []);
    expect([...result.cells]).toEqual([0, 0]);
    expect(result.any).toBe(false);
  });
});
