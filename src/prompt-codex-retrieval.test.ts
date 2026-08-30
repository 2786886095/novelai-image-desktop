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

  it("places mature Danbooru tags before ordinary codex references", () => {
    const result = buildPromptCodexEnhancement(
      "女孩以七分身构图站立",
      "convert",
      false,
      [
        {
          tag: "cowboy_shot",
          description: "七分身构图",
          count: 600000,
        },
      ],
    );
    expect(result.matches[0].id).toBe("danbooru:cowboy_shot");
    expect(result.context.indexOf("cowboy shot")).toBeLessThan(
      result.context.indexOf("本地 NovelAI 提示词法典"),
    );
    expect(result.context).toContain("禁止再叠加它的拆解词");
  });

  it("always retrieves the mature-tag priority rule", () => {
    const matches = retrievePromptCodex("普通女孩", {
      mode: "reverse",
      allowAdult: false,
    });
    expect(
      matches.some((item) => item.id === "guidance:canonical-tag-priority"),
    ).toBe(true);
  });

  it("retrieves the dual-version known-character rule for conversion", () => {
    const result = buildPromptCodexEnhancement(
      "芙宁娜\n已知角色 角色名版 特征版 动漫角色 游戏角色 角色 Tag",
      "convert",
      false,
    );
    expect(
      result.matches.some((item) => item.id === "guidance:known-character"),
    ).toBe(true);
    expect(result.context).toContain("特征版必须删除角色名与作品名");
    expect(result.context).toContain("角色名版与特征版的场景");
  });
});
