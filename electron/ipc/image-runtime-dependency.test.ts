import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
describe("image decoding is a declared Windows production dependency", () => {
  it("unpacks version-suffixed native libraries as well as their bindings", () => {
    expect(manifest.build.asarUnpack).toEqual(expect.arrayContaining([
      "node_modules/sharp/**", "node_modules/@img/**", "node_modules/onnxruntime-node/**",
    ]));
  });
  it("pins the direct sharp dependency, override and lockfile root consistently", () => {
    expect(manifest.dependencies.sharp).toBe("0.35.4");
    expect(manifest.overrides.sharp).toBe(manifest.dependencies.sharp);
    expect(lock.packages[""].dependencies.sharp).toBe(manifest.dependencies.sharp);
    expect(lock.packages["node_modules/sharp"].version).toBe(manifest.dependencies.sharp);
  });
  it.each(["win"])("does not strip mandatory sharp or its native libraries from %s", platform => {
    expect(manifest.build[platform].files ?? []).not.toContain("!node_modules/sharp/**");
    expect(manifest.build[platform].files ?? []).not.toContain("!node_modules/@img/**");
  });
});

it.each(['win'])('includes actual scoring runtime for %s instead of advertising an excluded feature',platform=>{
 for(const excluded of ['!node_modules/@huggingface/transformers/**','!node_modules/onnxruntime-node/**'])expect(manifest.build[platform].files??[]).not.toContain(excluded);
});
