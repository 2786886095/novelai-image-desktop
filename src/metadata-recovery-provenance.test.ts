import { describe, expect, it, vi } from "vitest";
import { OFFICIAL_METADATA_ORIGINAL, originalOfficialMetadata } from "../shared/official-metadata-result";
import { inspectImageMetadata } from "./png-meta";
import { readImageMetadataForRecovery } from "./metadata-recovery";

const reader = vi.hoisted(() => vi.fn());
vi.mock("./official-metadata-online", () => ({ parseOfficialImageMetadataOnline: reader }));

describe("official direct-JSON mapping provenance", () => {
  it("preserves original typed data outside the app Comment wrapper", async () => {
    const original = { prompt: "neutral fixture", uc: "neutral negative", seed: 42, steps: 27, width: 832, height: 1216 };
    const mapped = { Comment: JSON.stringify(original) };
    Object.defineProperty(mapped, OFFICIAL_METADATA_ORIGINAL, { value: original });
    reader.mockResolvedValueOnce(mapped);
    const restored = await readImageMetadataForRecovery(new ArrayBuffer(0), "online");
    expect(Object.keys(restored)).toEqual(["Comment"]);
    expect(originalOfficialMetadata(restored)).toEqual(original);
    expect(typeof originalOfficialMetadata(restored)?.seed).toBe("number");
    expect(Object.getOwnPropertyDescriptor(restored, OFFICIAL_METADATA_ORIGINAL)?.enumerable).toBe(false);
  });

  it("maps direct official generation JSON without treating prompt text as a Comfy graph", () => {
    const original = { prompt: "neutral fixture", uc: "neutral negative", seed: 42, steps: 27, width: 832, height: 1216 };
    const report = inspectImageMetadata({ Comment: JSON.stringify(original) });
    expect(report.kind).toBe("novelai");
    expect(report.imported.positivePrompt).toBe(original.prompt);
    expect(report.imported.negativePrompt).toBe(original.uc);
    expect(report.imported.seed).toBe(42);
    expect(report.imported.steps).toBe(27);
  });

  it("does not add provenance or invented source/software to ordinary metadata", async () => {
    const ordinary = { Software: "NovelAI", Comment: '{"prompt":"neutral"}' };
    reader.mockResolvedValueOnce(ordinary);
    const restored = await readImageMetadataForRecovery(new ArrayBuffer(0), "online");
    expect(originalOfficialMetadata(restored)).toBeUndefined();
    expect(Object.keys(restored)).toEqual(["Software", "Comment"]);
    expect(restored.Source).toBeUndefined();
  });
});
