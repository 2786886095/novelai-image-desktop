import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { inspectImageMetadata, parseImageMeta } from "./png-meta";
import { extractEmbeddedGenerationMetadata } from "../electron/ipc/nai";

const root = path.join(process.cwd(), "shared/image-metadata-compat-fixtures");
const fixtures: { name: string; expected: Record<string, string | number> }[] =
  JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
describe("generation metadata encoding compatibility", () => {
  for (const fixture of fixtures) it(fixture.name, () => {
    const bytes = fs.readFileSync(path.join(root, fixture.name));
    const original = Uint8Array.from(bytes);
    const report = inspectImageMetadata(parseImageMeta(Uint8Array.from(bytes).buffer));
    const actual: Record<string, unknown> = { ...report.imported, characters: report.characterCaptions.length };
    for (const [key, value] of Object.entries(fixture.expected)) expect(actual[key], key).toEqual(value);
    if (!Object.keys(fixture.expected).length) expect(report.imported).toEqual({});
    const backend = extractEmbeddedGenerationMetadata(bytes);
    for (const [key, value] of Object.entries(fixture.expected)) {
      expect(key === "characters" ? backend?.characterCaptions.length : backend?.imported[key as keyof typeof report.imported], key).toEqual(value);
    }
    if (!Object.keys(fixture.expected).length) expect(backend).toBeUndefined();
    expect(Uint8Array.from(bytes)).toEqual(original);
  });
});
