import { describe, expect, it } from "vitest";
import {
  INPAINT_BRUSH_SLIDER_MAX,
  INPAINT_BRUSH_SLIDER_MIN,
  INPAINT_MASK_GRID_SIZE,
  inpaintBrushSliderValue,
  interpolateInpaintSegment,
  normalizeInpaintBrushSize,
  rasterizeInpaintGridSegment,
} from "./inpaint-brush";

describe("official inpaint brush sizing", () => {
  it("uses one 8px source block per mask cell", () => {
    expect(INPAINT_MASK_GRID_SIZE).toBe(8);
  });

  it("keeps the official slider range while allowing finer direct entry", () => {
    expect(INPAINT_BRUSH_SLIDER_MIN).toBe(4);
    expect(INPAINT_BRUSH_SLIDER_MAX).toBe(50);
    expect(inpaintBrushSliderValue(1)).toBe(4);
    expect(inpaintBrushSliderValue(80)).toBe(50);
  });

  it("allows a 1-cell square tip and enforces even round tips", () => {
    expect(normalizeInpaintBrushSize(1, "square")).toBe(1);
    expect(normalizeInpaintBrushSize(1, "round")).toBe(2);
    expect(normalizeInpaintBrushSize(3, "round")).toBe(4);
    expect(normalizeInpaintBrushSize(499, "round")).toBe(500);
    expect(normalizeInpaintBrushSize(999, "square")).toBe(500);
  });
});

describe("interpolateInpaintSegment", () => {
  it("fills sparse pointer movement without gaps", () => {
    const samples = interpolateInpaintSegment({ x: 0, y: 0 }, { x: 20, y: 0 }, 4);
    expect(samples.length).toBeGreaterThan(20);
    expect(samples.at(-1)).toEqual({ x: 20, y: 0 });
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index].x - samples[index - 1].x).toBeLessThanOrEqual(0.65);
    }
  });

  it("always emits a stationary stamp", () => {
    expect(interpolateInpaintSegment({ x: 4, y: 7 }, { x: 4, y: 7 }, 1)).toEqual([
      { x: 4, y: 7 },
    ]);
  });

  it("keeps a diagonal square-brush path dense enough to remain continuous", () => {
    const samples = rasterizeInpaintGridSegment({ x: 4.2, y: 4.4 }, { x: 40.1, y: 40.3 });
    let previous = { x: 4, y: 4 };
    for (const sample of samples) {
      expect(Number.isInteger(sample.x)).toBe(true);
      expect(Number.isInteger(sample.y)).toBe(true);
      expect(Math.abs(sample.x - previous.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(sample.y - previous.y)).toBeLessThanOrEqual(1);
      previous = sample;
    }
    expect(previous).toEqual({ x: 40, y: 40 });
  });

  it("keeps shallow square-brush diagonals connected to the pixel grid", () => {
    const samples = rasterizeInpaintGridSegment({ x: 2, y: 3 }, { x: 12, y: 7 });
    expect(samples[0]).toEqual({ x: 2, y: 3 });
    expect(samples.at(-1)).toEqual({ x: 12, y: 7 });
    for (let index = 1; index < samples.length; index += 1) {
      expect(Math.abs(samples[index].x - samples[index - 1].x)).toBeLessThanOrEqual(1);
      expect(Math.abs(samples[index].y - samples[index - 1].y)).toBeLessThanOrEqual(1);
    }
  });
});
