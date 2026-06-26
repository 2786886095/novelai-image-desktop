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
});
