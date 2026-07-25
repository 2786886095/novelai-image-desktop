import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, ComicConvertRequest } from "../../src/types";

const axiosMock = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  isCancel: vi.fn(() => false),
}));

const settingsRef = vi.hoisted(() => ({
  current: {
    convertApiUrl: "",
    convertApiKey: "",
    convertApiModel: "gpt-4o-mini",
    convertSystemPrompt: "",
    convertPromptTemplates: { tags: "", natural: "", mixed: "" },
    mcpForConvert: false,
    proxyUrl: "",
    proxyForAi: true,
  } as Partial<AppSettings>,
}));

vi.mock("axios", () => ({ default: axiosMock }));

vi.mock("./store", () => ({
  addHistory: vi.fn(),
  ensureHistoryGroup: vi.fn(),
  getAccountSummary: vi.fn(() => ({ hasToken: false })),
  getHistoryGroups: vi.fn(() => []),
  getSettings: vi.fn(() => settingsRef.current),
  getToken: vi.fn(() => ""),
  setAccountSummary: vi.fn(),
  setToken: vi.fn(),
  updateHistoryItem: vi.fn(),
}));

function baseRequest(overrides: Partial<ComicConvertRequest> = {}): ComicConvertRequest {
  return {
    mode: "tags",
    globalPrompt: "moonlit fantasy story",
    globalCharacterSetting: "white hair heroine, blue dress, red eyes",
    continuityBible: "",
    globalStylePrompt: "cinematic lighting, very aesthetic",
    referencePrompts: ["white hair, blue dress, calm smile"],
    adultBranch: false,
    panels: [
      {
        panelId: "a",
        index: 1,
        cnPrompt: "女主站在月光下的走廊里，白发红眼，蓝色礼服。",
        previousCnPrompt: "",
        nextCnPrompt: "她推开门。",
        previousPrompts: [],
        previousSummaries: [],
        nextSummaries: ["door opens"],
      },
      {
        panelId: "b",
        index: 2,
        cnPrompt: "她推开门，露出微笑。",
        previousCnPrompt: "女主站在月光下的走廊里。",
        nextCnPrompt: "",
        previousPrompts: ["1girl, white hair"],
        previousSummaries: ["corridor"],
        nextSummaries: [],
      },
    ],
    ...overrides,
  };
}

describe("convertComicPanels fallback path", () => {
  beforeEach(() => {
    axiosMock.post.mockReset();
    axiosMock.get.mockReset();
    settingsRef.current = {
      convertApiUrl: "",
      convertApiKey: "",
      convertApiModel: "gpt-4o-mini",
      convertSystemPrompt: "",
      convertPromptTemplates: { tags: "", natural: "", mixed: "" },
      mcpForConvert: false,
      proxyUrl: "",
      proxyForAi: true,
    };
  });

  it("uses the local NovelAI tag template when no convert API is configured", async () => {
    const { convertComicPanels } = await import("./nai");

    const result = await convertComicPanels(baseRequest());

    expect(result.ok).toBe(true);
    expect(axiosMock.post).not.toHaveBeenCalled();
    expect(result.panels).toHaveLength(2);
    expect(result.panels.every((panel) => panel.enPrompt.includes("masterpiece"))).toBe(true);
    expect(result.panels.every((panel) => !panel.error)).toBe(true);
  });

  it("keeps every panel converted with local fallback when the convert API throws", async () => {
    settingsRef.current.convertApiUrl = "https://example.test/v1";
    settingsRef.current.convertApiKey = "sk-test";
    axiosMock.post.mockRejectedValue(new Error("rate limited"));
    const { convertComicPanels } = await import("./nai");

    const result = await convertComicPanels(baseRequest());

    expect(result.ok).toBe(true);
    expect(axiosMock.post).toHaveBeenCalledTimes(2);
    expect(result.panels.map((panel) => panel.panelId)).toEqual(["a", "b"]);
    expect(result.panels.every((panel) => panel.enPrompt.includes("masterpiece"))).toBe(true);
    expect(result.panels.every((panel) => !panel.error)).toBe(true);
  });

  it("replaces model refusals with local fallback instead of returning the refusal text", async () => {
    settingsRef.current.convertApiUrl = "https://example.test/v1";
    settingsRef.current.convertApiKey = "sk-test";
    axiosMock.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: "Sorry, I can't help with that request." }, finish_reason: "stop" }],
      },
    });
    const { convertComicPanels } = await import("./nai");

    const result = await convertComicPanels(baseRequest({ mode: "natural", panels: [baseRequest().panels[0]] }));

    expect(result.ok).toBe(true);
    expect(axiosMock.post).toHaveBeenCalledTimes(1);
    expect(result.panels).toHaveLength(1);
    expect(result.panels[0].enPrompt).toContain("Anime illustration");
    expect(result.panels[0].enPrompt).not.toContain("Sorry");
  });

  it("repairs a tag-rule violation with one extra request and one visible log", async () => {
    settingsRef.current.convertApiUrl = "https://example.test/v1";
    settingsRef.current.convertApiKey = "sk-test";
    settingsRef.current.promptCodexEnhanceEnabled = false;
    settingsRef.current.promptRuleAutoRepairEnabled = true;
    axiosMock.post
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: { content: "1girl, dogeza, dogeza, bowing" },
              finish_reason: "stop",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: { content: "1girl, dogeza" },
              finish_reason: "stop",
            },
          ],
        },
      });
    const { clearAiCallLog, convertPromptText, getAiCallLog } = await import(
      "./nai"
    );
    clearAiCallLog();

    const result = await convertPromptText("一个女孩土下座", "tags", false);

    expect(result.ok).toBe(true);
    expect(result.result).toBe("1girl, dogeza");
    expect(axiosMock.post).toHaveBeenCalledTimes(2);
    const logs = getAiCallLog();
    expect(logs).toHaveLength(1);
    expect(logs[0].label).toContain("规则校验");
    expect(logs[0].response).toContain("已自动修复");
  });
});

describe("prompt codex enhancement", () => {
  beforeEach(() => {
    axiosMock.post.mockReset();
    axiosMock.get.mockReset();
    settingsRef.current = {
      visionApiUrl: "https://example.test/v1",
      visionApiKey: "sk-vision",
      visionApiModel: "vision-test",
      visionSystemPrompt: "",
      reversePromptTemplates: { tags: "", natural: "", mixed: "" },
      convertApiUrl: "https://example.test/v1",
      convertApiKey: "sk-convert",
      convertApiModel: "text-test",
      convertSystemPrompt: "",
      convertPromptTemplates: { tags: "", natural: "", mixed: "" },
      promptCodexEnhanceEnabled: true,
      promptCodexAdultEnabled: true,
      mcpForReverse: false,
      mcpForConvert: false,
      proxyUrl: "",
      proxyForAi: true,
    };
  });

  it("injects locally retrieved codex context into conversion", async () => {
    axiosMock.post.mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content:
                "2boys, classroom, book | boy, black hair, source#offer | boy, blue hair, target#offer",
            },
            finish_reason: "stop",
          },
        ],
      },
    });
    const { convertPromptText } = await import("./nai");

    const result = await convertPromptText(
      "一个黑发男孩把书递给蓝发男孩",
      "tags",
      false,
    );

    expect(result.ok).toBe(true);
    expect(result.codexMatches?.some((item) =>
      item.id === "guidance:interaction-direction",
    )).toBe(true);
    const request = axiosMock.post.mock.calls[0]?.[1] as {
      messages?: Array<{ role: string; content: string }>;
    };
    expect(request.messages?.[0]?.content).toContain(
      "本地 NovelAI 提示词法典",
    );
  });

  it("merges two-stage reverse into one visible call-log record", async () => {
    axiosMock.post
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                content:
                  "2girls, outdoors | girl, blonde hair, hugging | girl, purple hair, hugging",
              },
              finish_reason: "stop",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                content:
                  "2girls, outdoors | girl, blonde hair, source#hug | girl, purple hair, target#hug",
              },
              finish_reason: "stop",
            },
          ],
        },
      });
    const { clearAiCallLog, getAiCallLog, reversePromptImage } = await import(
      "./nai"
    );
    clearAiCallLog();

    const result = await reversePromptImage(
      Buffer.from("fake-image").toString("base64"),
      "tags",
      "full",
      "两个女孩拥抱",
      false,
    );

    expect(result.ok).toBe(true);
    expect(axiosMock.post).toHaveBeenCalledTimes(2);
    expect(result.prompt).toContain("source#hug");
    expect(result.codexMatches?.length).toBeGreaterThan(0);
    const logs = getAiCallLog();
    expect(logs).toHaveLength(1);
    expect(logs[0].label).toContain("法典增强两阶段");
    expect(logs[0].userText).toContain("阶段一草稿");
  });
});
