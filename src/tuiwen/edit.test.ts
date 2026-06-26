import { describe, expect, it } from "vitest";
import { createTuiwenShot } from "./project";
import {
  insertTuiwenShotAfter,
  mergeTuiwenShotWithNext,
  moveTuiwenShot,
  removeTuiwenShot,
} from "./edit";

function shots() {
  return [
    createTuiwenShot("第一镜。", 1, 1200),
    createTuiwenShot("第二镜。", 2, 1800),
    createTuiwenShot("第三镜。", 3, 2200),
  ];
}

describe("tuiwen shot editing", () => {
  it("inserts and reindexes a shot after the active shot", () => {
    const source = shots();
    const inserted = createTuiwenShot("新增镜。", 99, 1000);
    const result = insertTuiwenShotAfter(source, source[0].id, inserted);
    expect(result.map((shot) => shot.narration)).toEqual(["第一镜。", "新增镜。", "第二镜。", "第三镜。"]);
    expect(result.map((shot) => shot.index)).toEqual([1, 2, 3, 4]);
  });

  it("moves shots without breaking continuous indices", () => {
    const source = shots();
    const result = moveTuiwenShot(source, source[1].id, -1);
    expect(result.map((shot) => shot.narration)).toEqual(["第二镜。", "第一镜。", "第三镜。"]);
    expect(result.map((shot) => shot.index)).toEqual([1, 2, 3]);
  });

  it("merges narration and duration while clearing stale media bindings", () => {
    const source = shots();
    source[0].outputPath = "old.png";
    source[0].audio = { filePath: "old.wav", fileUrl: "old.wav", durationMs: 1200, source: "import" };
    source[1].enPrompt = "second prompt";
    source[1].transition = { preset: "wipe", durationMs: 400 };
    const result = mergeTuiwenShotWithNext(source, source[0].id);
    expect(result).toHaveLength(2);
    expect(result[0].narration).toBe("第一镜。\n第二镜。");
    expect(result[0].durationMs).toBe(3000);
    expect(result[0].outputPath).toBeUndefined();
    expect(result[0].audio).toBeUndefined();
    expect(result[0].transition).toEqual({ preset: "wipe", durationMs: 400 });
    expect(result[0].status).toBe("converted");
  });

  it("removes a shot and selects a continuous index layout", () => {
    const source = shots();
    const result = removeTuiwenShot(source, source[1].id);
    expect(result.map((shot) => shot.narration)).toEqual(["第一镜。", "第三镜。"]);
    expect(result.map((shot) => shot.index)).toEqual([1, 2]);
  });
});
