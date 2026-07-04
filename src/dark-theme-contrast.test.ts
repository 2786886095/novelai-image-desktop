/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Rgb = { r: number; g: number; b: number; a?: number };

function extractLastDarkThemeVariables(): Record<string, string> {
  const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
  const blocks = [...css.matchAll(/\.theme-dark\s*\{([^{}]*)\}/g)].map((match) => match[1] ?? "");
  const block = blocks.at(-1);
  if (!block) throw new Error("Missing .theme-dark token block");
  const entries = [...block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)].map((match) => [
    match[1],
    match[2].trim(),
  ]);
  return Object.fromEntries(entries);
}

function parseRgb(value: string): Rgb {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const raw = Number.parseInt(hex[1], 16);
    return { r: (raw >> 16) & 255, g: (raw >> 8) & 255, b: raw & 255, a: 1 };
  }

  const rgba = value.match(/^rgba?\(([^)]+)\)$/i);
  if (rgba) {
    const parts = rgba[1].split(",").map((part) => Number.parseFloat(part.trim()));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
  }

  throw new Error(`Unsupported color value: ${value}`);
}

function composite(top: Rgb, bottom: Rgb): Rgb {
  const alpha = top.a ?? 1;
  return {
    r: top.r * alpha + bottom.r * (1 - alpha),
    g: top.g * alpha + bottom.g * (1 - alpha),
    b: top.b * alpha + bottom.b * (1 - alpha),
    a: 1,
  };
}

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(color: Rgb): number {
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("desktop dark theme contrast", () => {
  it("keeps the dark palette calm while preserving readable text contrast", () => {
    const vars = extractLastDarkThemeVariables();
    const window = parseRgb(vars["bg-window"]);
    const panel = composite(parseRgb(vars["bg-panel"]), window);
    const input = composite(parseRgb(vars["bg-input"]), window);
    const primaryText = parseRgb(vars["text-primary"]);
    const secondaryText = parseRgb(vars["text-secondary"]);
    const mutedText = parseRgb(vars["text-muted"]);

    expect(luminance(window)).toBeLessThan(0.006);
    expect(luminance(panel)).toBeLessThan(0.012);
    expect(luminance(input)).toBeLessThan(0.008);

    expect(primaryText.r).toBeLessThan(245);
    expect(primaryText.g).toBeLessThan(245);
    expect(primaryText.b).toBeLessThan(250);

    expect(contrast(primaryText, panel)).toBeGreaterThanOrEqual(10);
    expect(contrast(secondaryText, panel)).toBeGreaterThanOrEqual(6);
    expect(contrast(mutedText, panel)).toBeGreaterThanOrEqual(3);
  });
});
