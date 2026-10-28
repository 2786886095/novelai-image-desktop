import { describe, expect, it, vi } from "vitest";
import { decodeSystemPromptFile, importImageSystemPrompt, MAX_SYSTEM_PROMPT_IMPORT_BYTES, SystemPromptImportError } from "./system-prompt-import";
import { systemPromptImportErrorText, systemPromptImportText } from "./system-prompt-import-text";

const importText = (text: string, filename = "fixture.txt") => importImageSystemPrompt(text, { filename, sourceHash: "sha-fixture", now: "2026-10-14T00:00:00.000Z" });
function rejects(text: string, filename: string, code: string) {
  try { importText(text, filename); throw Error("unexpected acceptance"); }
  catch (error) { expect(error).toBeInstanceOf(SystemPromptImportError); expect((error as SystemPromptImportError).code).toBe(code); }
}

describe("bounded image-system-prompt imports", () => {
  it.each(["txt", "md", "TXT"])("preserves complete %s text including whitespace, macros and non-ASCII", extension => {
    const body = "  # 图像 rules\r\n{{char}}\n<script>declarative example</script>\n\n";
    const result = importText(body, `fixture.${extension}`);
    expect(result.preset).toMatchObject({ name: "fixture", systemPrompt: body, jailbreakPrompt: "", sourceHash: "sha-fixture", createdAt: "2026-10-14T00:00:00.000Z" });
    expect(result.warnings).toEqual([]);
  });
  it.each(["systemPrompt", "system_prompt"])("accepts %s JSON and preserves the supplied name and optional postscript", key => {
    const result = importText(JSON.stringify({ name: "My custom preset", [key]: "  Rule\n\n", jailbreak_prompt: "Postscript", temperature: 0.4 }), "fixture.json");
    expect(result.preset).toMatchObject({ name: "My custom preset", systemPrompt: "  Rule\n\n", jailbreakPrompt: "Postscript", temperature: 0.4 });
  });
  it.each(["builtin-ig5-convert", "existing-custom"])("never accepts an imported JSON id as local identity: %s", id => {
    const source = JSON.stringify({ id, systemPrompt: "Different imported content" });
    const first = importText(source, "fixture.json"), second = importText(source, "fixture.json");
    expect(first.preset.id).not.toBe(id); expect(second.preset.id).not.toBe(id);
    expect(first.preset.id).not.toBe(second.preset.id); expect(first.preset.id).toMatch(/^sampler-/);
  });
  it("imports ST order, skips scripts and assistant prefill without adding roleplay defaults", () => {
    const result = importText(JSON.stringify({ prompts: [
      { identifier: "one", content: "ONE" }, { identifier: "two", content: "TWO", role: "user" },
      { identifier: "script", content: "<<taskjs>>fetch('example')" }, { identifier: "prefill", role: "assistant", content: "ASSISTANT" },
    ], prompt_order: [{ order: [{ identifier: "one", enabled: true }] }, { order: ["two", "one", "script", "prefill"].map(identifier => ({ identifier, enabled: true })) }] }), "fixture.json");
    expect(result.preset.systemPrompt).toBe("TWO\n\nONE");
    expect(result.preset.jailbreakPrompt).toBe("");
    expect(result.warnings).toHaveLength(2);
  });
  it("preserves an explicitly enabled ST jailbreak block without fallback", () => {
    const result = importText(JSON.stringify({ prompts: [{ content: "System" }, { identifier: "jailbreak", content: "Post" }] }), "fixture.json");
    expect(result.preset).toMatchObject({ systemPrompt: "System", jailbreakPrompt: "Post" });
  });
  it.each(["", " \r\n", "\uFEFF"])("rejects empty text %j without a neutral fallback", source => rejects(source, "fixture.txt", "empty"));
  it.each(["{", "broken json"])("rejects malformed JSON %j", source => rejects(source, "fixture.json", "json"));
  it.each(["null", "[]", "{}", '{"spec":"chara_card_v2"}', '{"systemPrompt":1}', '{"systemPrompt":"x","jailbreakPrompt":1}'])("rejects non-preset JSON %s", source => rejects(source, "fixture.json", "shape"));
  it.each([{ prompts: [] }, { prompts: [{ content: "x", enabled: false }] }, { prompts: [{ role: "assistant", content: "prefill" }] }, { prompts: [{ content: "<<taskjs>>fetch('x')" }] }, { prompts: [{ identifier: "jailbreak", content: "only postscript" }] }])("rejects ST content-less presets %#", source => rejects(JSON.stringify(source), "fixture.json", "empty"));
  it("rejects unsupported extensions", () => rejects("Rule", "fixture.exe", "extension"));
  it("accepts exact body limits and rejects overflow before normalization can truncate", () => {
    const systemPrompt = "x".repeat(200_000), jailbreakPrompt = "y".repeat(100_000);
    const result = importText(JSON.stringify({ systemPrompt, jailbreakPrompt }), "fixture.json");
    expect(result.preset.systemPrompt).toHaveLength(200_000);
    expect(result.preset.jailbreakPrompt).toHaveLength(100_000);
    rejects(systemPrompt + "x", "fixture.md", "system-limit");
    rejects(JSON.stringify({ systemPrompt: systemPrompt + "x" }), "fixture.json", "system-limit");
    rejects(JSON.stringify({ systemPrompt: "x", jailbreakPrompt: jailbreakPrompt + "y" }), "fixture.json", "postscript-limit");
  });
  it("preflights combined ST body and postscript before the legacy parser slices", () => {
    rejects(JSON.stringify({ prompts: [{ content: "x".repeat(100_000) }, { content: "y".repeat(100_000) }] }), "fixture.json", "system-limit");
    rejects(JSON.stringify({ prompts: [{ content: "System" }, { identifier: "jailbreak", content: "x".repeat(100_001) }] }), "fixture.json", "postscript-limit");
  });
  it("rejects raw file overflow independently of prompt length", () => {
    rejects("x".repeat(MAX_SYSTEM_PROMPT_IMPORT_BYTES + 1), "fixture.txt", "bytes");
    expect(() => decodeSystemPromptFile(new Uint8Array(MAX_SYSTEM_PROMPT_IMPORT_BYTES + 1))).toThrow("bytes");
  });
  it("decodes valid UTF-8/BOM but rejects illegal UTF-8 instead of replacing bytes", () => {
    expect(decodeSystemPromptFile(new TextEncoder().encode("\uFEFF完整正文"))).toBe("完整正文");
    expect(() => decodeSystemPromptFile(new Uint8Array([0xc3, 0x28]))).toThrow("utf8");
  });
  it("does not execute imports or make a network request", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    try { importText("fetch('https://fixture.invalid')\n<script>declarative text</script>"); expect(fetch).not.toHaveBeenCalled(); }
    finally { fetch.mockRestore(); }
  });
  it("has format, switch and every bounded failure message", () => {
    const language = "zh-CN";
    const text = systemPromptImportText(language);
    expect(text.hint).toContain("UTF-8");
    expect(text.enabled.length).toBeGreaterThan(5);
    for (const code of ["empty", "bytes", "utf8", "extension", "json", "shape", "system-limit", "postscript-limit"] as const) expect(systemPromptImportErrorText(new SystemPromptImportError(code), language)).not.toBe(code);
  });
});
