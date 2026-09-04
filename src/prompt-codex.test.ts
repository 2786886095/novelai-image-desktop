import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import {
  buildPromptCodexSnapshot,
  dedupePromptCodexEntries,
  extractPromptCodexIntroduction,
  isPromptCodexIntroductionEntry,
  parsePromptCodexHtml,
  type PromptCodexBook,
} from "./prompt-codex";

const book: PromptCodexBook = {
  id: "test",
  title: "Test Codex",
  sourceUrl: "https://example.com/codex",
  adult: false,
};

describe("prompt codex parser", () => {
  it("ships the complete desktop corpus as a compressed lazy resource", () => {
    const compressed = fs.readFileSync(path.join(process.cwd(), "public", "prompt-codex.json.gz"));
    const snapshot = JSON.parse(gunzipSync(compressed).toString("utf8"));
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.books).toHaveLength(3);
    expect(snapshot.entries.length).toBeGreaterThan(10_000);
    expect(compressed.byteLength).toBeLessThan(2_000_000);
    expect(fs.existsSync(path.join(process.cwd(), "src", "data", "prompt-codex.json"))).toBe(false);
  });
  it("preserves section hierarchy and prompt text while stripping markup", () => {
    const html = `
      <div class="sl-markdown-content">
        <h1>Codex</h1>
        <h2>各种风格</h2>
        <h3 id="fantasy"><a href="#fantasy">#</a>西幻</h3>
        <p>fantasy, <strong>castle</strong><br>dramatic lighting</p>
        <h3>水彩</h3><p>watercolor, soft colors</p>
      </div>`;
    const entries = parsePromptCodexHtml(html, book);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      section: "各种风格",
      title: "西幻",
      prompt: "fantasy, castle\ndramatic lighting",
      category: "style",
    });
    expect(entries[1].prompt).toBe("watercolor, soft colors");
  });

  it("keeps paragraphs that do not have an h3 title", () => {
    const html = `
      <div class="sl-markdown-content">
        <h2>编纂者常用画师组</h2>
        <p>1. 1.2::artist:first ::, 0.8::artist:second ::</p>
      </div>`;
    const entries = parsePromptCodexHtml(html, book);
    expect(entries).toHaveLength(1);
    expect(entries[0].prompt).toContain("artist:first");
    expect(entries[0].category).toBe("artist");
  });

  it("keeps out-of-range numeric entities instead of aborting the import", () => {
    const html = '<div class="sl-markdown-content"><h2>画风</h2><h3>异常实体</h3><p>tag, &#99999999;, &#x110000;</p></div>';
    expect(() => parsePromptCodexHtml(html, book)).not.toThrow();
    expect(parsePromptCodexHtml(html, book)[0].prompt).toContain("&#99999999;");
  });

  it("rejects an incomplete online update", () => {
    expect(() =>
      buildPromptCodexSnapshot([
        {
          book,
          html: '<div class="sl-markdown-content"><h2>x</h2><h3>y</h3><p>z</p></div>',
        },
      ]),
    ).toThrow(/incomplete/);
  });

  it("separates shared documentation from searchable prompt entries", () => {
    const intro = {
      id: "regular-1",
      bookId: "regular",
      section: "前言",
      category: "other",
      title: "作者：一般所长",
      prompt: "作者与使用说明",
      adult: false,
      sourceUrl: book.sourceUrl,
    };
    const prompt = {
      ...intro,
      id: "regular-2",
      section: "画风",
      title: "水彩",
      prompt: "watercolor",
    };
    expect(isPromptCodexIntroductionEntry(intro)).toBe(true);
    expect(isPromptCodexIntroductionEntry(prompt)).toBe(false);
    expect(extractPromptCodexIntroduction([intro, prompt])).toEqual([
      { title: intro.title, content: intro.prompt },
    ]);
    expect(
      dedupePromptCodexEntries([
        prompt,
        { ...prompt, id: "adult-upper-2", bookId: "adult-upper" },
      ]),
    ).toEqual([prompt]);
  });
});
