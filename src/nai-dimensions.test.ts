import { describe, expect, it } from "vitest";
import {
  adaptiveNAIImageSize,
  fitNAIImageSize,
  isNAIDimension,
  isNAIImageSize,
  NAI_MAX_PIXEL_AREA,
  resolveNAIEnhanceOutputSize,
  snapNAIDimension,
  snapNAIDimensionWithinArea,
} from "./nai-dimensions";

describe("NovelAI custom dimensions", () => {
  it("waits for a completed value, then snaps to the nearest 64 pixels", () => {
    expect(snapNAIDimension(1000)).toBe(1024);
    expect(snapNAIDimension(1025)).toBe(1024);
    expect(snapNAIDimension(1057)).toBe(1088);
    expect(isNAIDimension(1920)).toBe(true);
  });

  it("allows official wallpaper and extreme valid aspect ratios", () => {
    expect(snapNAIDimensionWithinArea(1920, 1088)).toBe(1920);
    expect(snapNAIDimensionWithinArea(4096, 768)).toBe(4096);
    expect(4096 * 768).toBe(NAI_MAX_PIXEL_AREA);
  });

  it("adapts each source image independently", () => {
    expect(adaptiveNAIImageSize(1000, 1300)).toEqual({
      width: 1024,
      height: 1280,
    });
  });

  it("fits oversized images inside the official total-pixel limit", () => {
    const fitted = fitNAIImageSize(4000, 3000);
    expect(isNAIImageSize(fitted)).toBe(true);
    expect(fitted.width * fitted.height).toBeLessThanOrEqual(
      NAI_MAX_PIXEL_AREA,
    );
  });

  it("allows Enhance 2x exactly at the official pixel limit", () => {
    expect(resolveNAIEnhanceOutputSize(1024, 768, 2)).toEqual({
      width: 2048,
      height: 1536,
      exceedsLimit: false,
    });
    expect(2048 * 1536).toBe(NAI_MAX_PIXEL_AREA);
  });

  it("flags an oversized Enhance 2x target instead of silently shrinking it", () => {
    expect(resolveNAIEnhanceOutputSize(832, 1216, 2)).toEqual({
      width: 1664,
      height: 2432,
      exceedsLimit: true,
    });
  });
});
