import { describe, expect, it } from "vitest";
import {
  analyzeTuiwenNarrationPacing,
  encodeTuiwenPcm16Wav,
  estimateTuiwenNarrationDurationMs,
  sliceTuiwenPcm,
  splitTuiwenNarration,
  wrapTuiwenSubtitle,
} from "./audio";

describe("tuiwen audio helpers", () => {
  it("adjusts estimated narration duration by speaking rate", () => {
    const normal = estimateTuiwenNarrationDurationMs("她推开门，看见雨夜里的灯。", 0);
    const fast = estimateTuiwenNarrationDurationMs("她推开门，看见雨夜里的灯。", 30);
    expect(normal).toBeGreaterThan(fast);
    expect(normal).toBeGreaterThanOrEqual(800);
  });

  it("flags long narration and suggests multiple shots", () => {
    const pacing = analyzeTuiwenNarrationPacing("这是一个很长的旁白。".repeat(15));
    expect(pacing.tooLong).toBe(true);
    expect(pacing.suggestedShotCount).toBeGreaterThan(1);
  });

  it("splits narration on semantic punctuation without losing text", () => {
    const input = "她推开门，看见雨夜里的灯。远处传来脚步声，她立刻回头。";
    const segments = splitTuiwenNarration(input, 12);
    expect(segments.length).toBeGreaterThan(1);
    expect(segments.join("")).toBe(input);
  });

  it("wraps vertical subtitles and caps excessive lines", () => {
    const wrapped = wrapTuiwenSubtitle("这是一段需要在竖屏视频中清楚展示的超长字幕文本", 8, 2);
    const lines = wrapped.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/…$/u);
  });

  it("slices PCM by subtitle timecode and encodes a valid PCM16 WAV", () => {
    const source = new Float32Array(8_000);
    source.fill(0.5);
    const slice = sliceTuiwenPcm([source], 8_000, 250, 500);
    expect(slice.durationMs).toBe(500);
    expect(slice.channels[0]).toHaveLength(4_000);

    const wav = encodeTuiwenPcm16Wav(slice.channels, slice.sampleRate);
    const bytes = new Uint8Array(wav);
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(bytes.subarray(8, 12))).toBe("WAVE");
    expect(wav.byteLength).toBe(44 + 4_000 * 2);
  });

  it("rejects subtitle slices beyond the decoded audio", () => {
    expect(() => sliceTuiwenPcm([new Float32Array(1_000)], 1_000, 2_000, 500))
      .toThrow("Subtitle timecode is outside the long audio range.");
  });
});
