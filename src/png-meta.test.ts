import { describe, it, expect } from "vitest";
import { parsePngMeta, parseImportedParams } from "./png-meta";

// Build a minimal PNG ArrayBuffer containing the given tEXt key/value chunks.
// parsePngMeta does not verify CRCs, so we can leave them zeroed.
function makePng(chunks: Array<[string, string]>): ArrayBuffer {
  const enc = new TextEncoder();
  const parts: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const pushChunk = (type: string, data: number[]) => {
    const len = data.length;
    parts.push((len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff);
    for (const c of type) parts.push(c.charCodeAt(0));
    parts.push(...data);
    parts.push(0, 0, 0, 0); // CRC placeholder
  };
  for (const [key, value] of chunks) {
    const data = [...enc.encode(key), 0, ...enc.encode(value)];
    pushChunk("tEXt", data);
  }
  pushChunk("IEND", []);
  return new Uint8Array(parts).buffer;
}

describe("parsePngMeta", () => {
  it("reads tEXt chunks", () => {
    const buf = makePng([
      ["Description", "1girl, masterpiece"],
      ["Software", "NovelAI"],
    ]);
    const meta = parsePngMeta(buf);
    expect(meta.Description).toBe("1girl, masterpiece");
    expect(meta.Software).toBe("NovelAI");
  });

  it("returns empty for a non-PNG buffer", () => {
    expect(parsePngMeta(new Uint8Array([1, 2, 3]).buffer)).toEqual({});
  });
});

describe("parseImportedParams", () => {
  it("maps NovelAI Description + Comment JSON to params", () => {
    const comment = JSON.stringify({
      uc: "lowres, bad",
      steps: 28,
      scale: 6,
      seed: 12345,
      width: 832,
      height: 1216,
      sampler: "k_euler_ancestral",
      sm: true,
      sm_dyn: false,
    });
    const out = parseImportedParams({ Description: "1girl, masterpiece", Comment: comment });
    expect(out.positivePrompt).toBe("1girl, masterpiece");
    expect(out.negativePrompt).toBe("lowres, bad");
    expect(out.steps).toBe(28);
    expect(out.seed).toBe(12345);
    expect(out.width).toBe(832);
    expect(out.sampler).toBe("k_euler_ancestral");
    expect(out.smea).toBe(true);
  });

  it("ignores unknown sampler/model values", () => {
    const out = parseImportedParams({ Comment: JSON.stringify({ sampler: "nope", model: "fake" }) });
    expect(out.sampler).toBeUndefined();
    expect(out.model).toBeUndefined();
  });

  it("omits absent fields (no undefined keys)", () => {
    const out = parseImportedParams({ Comment: "{}" });
    expect(Object.keys(out)).toHaveLength(0);
  });

  it("survives malformed Comment JSON", () => {
    const out = parseImportedParams({ Description: "x", Comment: "{not json" });
    expect(out.positivePrompt).toBe("x");
  });
});
