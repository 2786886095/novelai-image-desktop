import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  post: vi.fn(),
  settings: {
    visionApiUrl: "https://vision.fixture.invalid/v1", visionApiKey: "FIXTURE_NOT_A_USER_KEY", visionApiModel: "fixture-vision",
    reversePromptTemplates: { natural: "Neutral natural caption" }, reverseConvertDshEnabled: false,
  },
}));
vi.mock("axios", () => ({ default: { post: fixture.post, get: vi.fn(), isCancel: () => false } }));
vi.mock("./proxy", () => ({ proxyConfig: () => ({}), proxyConfigForUrl: vi.fn(async () => ({ proxy: false })) }));
vi.mock("./store", () => ({
  getSettings: () => fixture.settings, addHistory: vi.fn(), ensureHistoryGroup: vi.fn(),
  getAccountSummary: () => ({ hasToken: false }), getHistoryGroups: () => [], getToken: () => "",
  setAccountSummary: vi.fn(), setToken: vi.fn(), updateHistoryItem: vi.fn(),
}));
import { reversePromptImage } from "./nai";
import { cleanPromptOutput } from "../../src/prompt-mode";
beforeEach(() => fixture.post.mockReset());
const run = (content: string) => {
  fixture.post.mockResolvedValue({ data: { choices: [{ message: { content }, finish_reason: "stop" }] } });
  return reversePromptImage(Buffer.from("offline fixture").toString("base64"), "natural", "full", "", false, "v5");
};

describe("assistant refusal prefix versus scene text", () => {
  it.each([
    "I'm sorry, but I can't assist with this request. I can describe non-sensitive elements instead.",
    "I cannot assist with generating that content.",
    "Sorry, I can't help identify that person in the image.",
    "抱歉，我无法协助处理这个请求。我可以描述其他可见元素。",
    "我无法帮助识别图片中这个人的身份，但可以描述服装。",
  ])("rejects an opening explicit refusal without format retries: %s", async content => {
    const result = await run(content);
    expect(result.ok).toBe(false); expect(result.message).toContain("拒绝");
    expect(fixture.post).toHaveBeenCalledTimes(1);
  });
  it.each([
    'A woman holds a sign reading "I\'m sorry, but I can\'t assist with this request.".',
    'A woman stands beside a sign. The sign says "I cannot assist with generating that content.".',
    'A poster reads "Sorry, I can\'t help identify that person in the image.".',
    'Text: "I cannot assist with generating that content."',
    'A sign says "抱歉，我无法协助处理这个请求。"',
    "I can't help but notice a blue coat in the image.",
  ])("keeps quoted descriptions and cannot-help-but observations: %s", async content => {
    const result = await run(content);
    expect(result).toMatchObject({ ok: true, prompt: cleanPromptOutput(content) });
    expect(fixture.post).toHaveBeenCalledTimes(1);
  });
});
