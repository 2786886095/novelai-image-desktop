import path from "path";
import { describe, expect, it } from "vitest";
import { filterExportableFiles } from "./storage";

describe("filterExportableFiles (P1-12)", () => {
  const outputDir = path.join("C:", "Users", "test", "Pictures", "Langbai NovelAI Studio");

  it("keeps files that live inside the output directory", () => {
    const files = [{ filePath: path.join(outputDir, "2026-01-01", "a.png"), name: "a.png" }];
    expect(filterExportableFiles(files, outputDir)).toEqual(files);
  });

  it("drops a resultPath pointing outside the output directory (imported-project injection)", () => {
    const files = [
      { filePath: path.join(outputDir, "2026-01-01", "a.png"), name: "a.png" },
      { filePath: path.join("C:", "Users", "test", "Documents", "secret.docx"), name: "not-actually-a-render.png" },
    ];
    const result = filterExportableFiles(files, outputDir);
    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe(path.join(outputDir, "2026-01-01", "a.png"));
  });

  it("drops a path that escapes via .. traversal", () => {
    const files = [{ filePath: path.join(outputDir, "..", "..", "secret.docx"), name: "x.png" }];
    expect(filterExportableFiles(files, outputDir)).toEqual([]);
  });

  it("drops everything when outputDir is not configured", () => {
    const files = [{ filePath: path.join(outputDir, "2026-01-01", "a.png"), name: "a.png" }];
    expect(filterExportableFiles(files, undefined)).toEqual([]);
  });

  it("drops entries with an empty or missing filePath", () => {
    const files = [{ filePath: "", name: "a.png" }, { filePath: "   ", name: "b.png" }] as never[];
    expect(filterExportableFiles(files, outputDir)).toEqual([]);
  });

  it("handles a non-array input safely", () => {
    expect(filterExportableFiles(null as never, outputDir)).toEqual([]);
  });
});
