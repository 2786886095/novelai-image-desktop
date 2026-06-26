import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { importTuiwenFile } from "./tuiwen-import";

const createdDirs: string[] = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tuiwen-import-"));
  createdDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("importTuiwenFile", () => {
  it("imports a UTF-8 SRT file into timed tuiwen shots", () => {
    const dir = makeTempDir();
    const filePath = path.join(dir, "story.srt");
    fs.writeFileSync(filePath, `1
00:00:01,000 --> 00:00:02,500
第一句旁白。

2
00:00:03,000 --> 00:00:05,000
第二句旁白。`, "utf8");

    const result = importTuiwenFile({ filePath, defaultShotDurationMs: 3000 });

    expect(result.ok).toBe(true);
    expect(result.source).toEqual({ type: "subtitle", fileName: "story.srt", subtitleFormat: "srt" });
    expect(result.shots?.map((shot) => ({ narration: shot.narration, startMs: shot.startMs, durationMs: shot.durationMs }))).toEqual([
      { narration: "第一句旁白。", startMs: 1000, durationMs: 1500 },
      { narration: "第二句旁白。", startMs: 3000, durationMs: 2000 },
    ]);
  });

  it("imports UTF-16LE novel text and splits it into narration shots", () => {
    const dir = makeTempDir();
    const filePath = path.join(dir, "novel.txt");
    const text = "她推开门。\n风从走廊尽头吹来。";
    fs.writeFileSync(filePath, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]));

    const result = importTuiwenFile({ filePath, defaultShotDurationMs: 2400 });

    expect(result.ok).toBe(true);
    expect(result.source).toEqual({ type: "novel", fileName: "novel.txt" });
    expect(result.rawScript).toBe(text);
    expect(result.shots?.map((shot) => shot.narration)).toEqual(["她推开门。", "风从走廊尽头吹来。"]);
    expect(result.shots?.every((shot) => shot.durationMs === 2400)).toBe(true);
  });

  it("falls back to GB18030 for legacy GBK novel text", () => {
    const dir = makeTempDir();
    const filePath = path.join(dir, "legacy-gbk.txt");
    // "你好，世界。" encoded as Windows code page 936 / GBK.
    fs.writeFileSync(filePath, Buffer.from("C4E3BAC3A3ACCAC0BDE7A1A3", "hex"));

    const result = importTuiwenFile({ filePath, defaultShotDurationMs: 2600 });

    expect(result.ok).toBe(true);
    expect(result.rawScript).toBe("你好，世界。");
    expect(result.shots?.map((shot) => shot.narration)).toEqual(["你好，世界。"]);
  });

  it("returns a validation failure for missing files", () => {
    const result = importTuiwenFile({ filePath: path.join(makeTempDir(), "missing.txt") });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("不存在");
  });
});
