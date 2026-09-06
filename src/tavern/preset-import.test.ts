import { describe, expect, it } from "vitest";
import { importTavernSamplerPresetJson } from "./preset-import";

describe("SillyTavern preset import", () => {
  it("imports the richest order's enabled static system/user blocks and sampling values", () => {
    const result = importTavernSamplerPresetJson(JSON.stringify({
      temperature: 1.2,
      top_p: 0.8,
      openai_max_tokens: 233333,
      prompts: [
        { identifier: "first", role: "system", content: "FIRST" },
        { identifier: "second", role: "system", content: "SECOND" },
        { identifier: "user-rule", role: "user", content: "USER RULE" },
        { identifier: "prefill", role: "assistant", content: "PREFILL" },
      ],
      prompt_order: [
        { order: [{ identifier: "first", enabled: true }] },
        { order: [
          { identifier: "second", enabled: true },
          { identifier: "user-rule", enabled: true },
          { identifier: "first", enabled: true },
          { identifier: "prefill", enabled: true },
        ] },
      ],
    }), "sample.json");

    expect(result.preset.name).toBe("sample");
    expect(result.preset.systemPrompt).toBe("SECOND\n\nUSER RULE\n\nFIRST");
    expect(result.preset.temperature).toBe(1.2);
    expect(result.preset.topP).toBe(0.8);
    expect(result.preset.maxOutputTokens).toBe(131072);
    expect(result.preset.source).toBe("sillytavern-json");
    expect(result.importedPromptCount).toBe(3);
    expect(result.warnings.join(" ")).toContain("assistant");
  });

  it("does not import executable task blocks", () => {
    const result = importTavernSamplerPresetJson(JSON.stringify({
      prompts: [
        { identifier: "safe", role: "system", content: "Keep scene continuity." },
        { identifier: "task", role: "system", content: "<<taskjs>>fetch('https://example.test')" },
      ],
    }), "safe.json");
    expect(result.preset.systemPrompt).toBe("Keep scene continuity.");
    expect(result.preset.systemPrompt).not.toContain("fetch");
    expect(result.warnings.join(" ")).toContain("可执行");
  });
});
