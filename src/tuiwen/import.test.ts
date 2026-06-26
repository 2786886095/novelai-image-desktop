import { describe, expect, it } from "vitest";
import { inferTuiwenFileKind, parseAss, parseLrc, parseSrt, parseTuiwenTextFile } from "./import";

describe("tuiwen import parsers", () => {
  it("parses SRT cues with millisecond durations", () => {
    const cues = parseSrt(`1
00:00:01,200 --> 00:00:03,450
第一句旁白。

2
00:00:04.000 --> 00:00:06.000
第二句旁白。`);

    expect(cues).toEqual([
      { text: "第一句旁白。", startMs: 1200, durationMs: 2250 },
      { text: "第二句旁白。", startMs: 4000, durationMs: 2000 },
    ]);
  });

  it("parses LRC timestamps and derives duration from the next line", () => {
    const cues = parseLrc(`[00:01.00]第一句
[00:04.50]第二句`, 3000);

    expect(cues).toEqual([
      { text: "第一句", startMs: 1000, durationMs: 3500 },
      { text: "第二句", startMs: 4500, durationMs: 3000 },
    ]);
  });

  it("parses ASS dialogue and strips override tags", () => {
    const cues = parseAss(`Dialogue: 0,0:00:01.50,0:00:03.00,Default,,0,0,0,,{\\an8}第一句\\N第二行`);

    expect(cues).toEqual([{ text: "第一句\n第二行", startMs: 1500, durationMs: 1500 }]);
  });

  it("infers source type from extension", () => {
    expect(inferTuiwenFileKind("story.txt")).toEqual({ type: "novel" });
    expect(inferTuiwenFileKind("caps.srt")).toEqual({ type: "subtitle", subtitleFormat: "srt" });
  });

  it("keeps novel text as raw script without subtitle cues", () => {
    const result = parseTuiwenTextFile("novel.txt", "第一段。\n第二段。", 3000);
    expect(result.source).toEqual({ type: "novel", fileName: "novel.txt" });
    expect(result.cues).toEqual([]);
    expect(result.rawScript).toContain("第一段");
  });
});

