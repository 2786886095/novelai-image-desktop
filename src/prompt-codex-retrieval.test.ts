import { describe, expect, it } from "vitest";
import {
  buildPromptCodexEnhancement,
  retrievePromptCodex,
} from "./prompt-codex-retrieval";

describe("prompt codex retrieval", () => {
  it("retrieves multi-character and interaction guidance", () => {
    const matches = retrievePromptCodex("两个女孩互相拥抱", {
      mode: "convert",
      allowAdult: true,
    });
    expect(matches.some((item) => item.id === "guidance:multi-character")).toBe(true);
    expect(matches.some((item) => item.id === "guidance:interaction-direction")).toBe(true);
  });

  it("does not leak classified guidance into an unrelated prompt", () => {
    const matches = retrievePromptCodex("白发女孩站在雪山前", {
      mode: "convert",
      allowAdult: true,
    });
    expect(matches.some((item) => item.adult)).toBe(false);
  });

  it("can retrieve classified guidance when both enabled and relevant", () => {
    const enabled = retrievePromptCodex("成年女性穿着破损连裤袜", {
      mode: "convert",
      allowAdult: true,
    });
    const disabled = retrievePromptCodex("成年女性穿着破损连裤袜", {
      mode: "convert",
      allowAdult: false,
    });
    expect(enabled.some((item) => item.id === "guidance:classified-clothing")).toBe(true);
    expect(disabled.some((item) => item.adult)).toBe(false);
  });

  it("formats a bounded context block", () => {
    const result = buildPromptCodexEnhancement(
      "一个男孩把书递给另一个男孩",
      "convert",
      true,
    );
    expect(result.context).toContain("本地 NovelAI 提示词法典");
    expect(result.context).toContain("互动");
    expect(result.matches.length).toBeLessThanOrEqual(11);
  });
});
