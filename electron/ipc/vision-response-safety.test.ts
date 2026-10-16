import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  post: vi.fn(),
  route: vi.fn(),
  settings: {
    visionApiUrl: "https://vision.fixture.invalid/v1",
    visionApiKey: "FIXTURE_NOT_A_USER_KEY",
    visionApiModel: "fixture-vision",
    reversePromptTemplates: { tags: "Custom tag caption", natural: "Custom natural caption", mixed: "Custom mixed caption" },
    reverseConvertDshEnabled: false,
  },
}));
vi.mock("axios", () => ({ default: { post: fixture.post, get: vi.fn(), isCancel: () => false } }));
vi.mock("./proxy", () => ({ proxyConfig: () => ({}), proxyConfigForUrl: fixture.route }));
vi.mock("./store", () => ({
  getSettings: () => fixture.settings,
  addHistory: vi.fn(), ensureHistoryGroup: vi.fn(), getAccountSummary: () => ({ hasToken: false }),
  getHistoryGroups: () => [], getToken: () => "", setAccountSummary: vi.fn(), setToken: vi.fn(), updateHistoryItem: vi.fn(),
}));
import { clearAiCallLog, getAiCallLog, reversePromptImage } from "./nai";

const normal = "A woman in a blue coat stands beside a tree.";
const response = (content: unknown, finish_reason = "stop", extra = {}) => ({ data: { choices: [{ message: { content, ...extra }, finish_reason }] } });
const reverse = (known = false) => reversePromptImage(Buffer.from("offline fixture image").toString("base64"), "natural", "full", "", known, "v5");

beforeEach(() => {
  fixture.post.mockReset(); fixture.route.mockReset(); clearAiCallLog();
  fixture.route.mockResolvedValue({ proxy: false });
});

describe("real reverse transport response safety", () => {
  it("retries empty length only once and accepts a complete second response", async () => {
    fixture.post.mockResolvedValueOnce(response("", "length")).mockResolvedValueOnce(response(normal));
    expect(await reverse()).toMatchObject({ ok: true, prompt: normal });
    expect(fixture.post).toHaveBeenCalledTimes(2);
    expect(fixture.post.mock.calls.map(call => call[1].max_tokens)).toEqual([4000, 32000]);
  });
  it("does not lose refusal classification after the one empty length retry", async () => {
    fixture.post.mockResolvedValueOnce(response("", "length"))
      .mockResolvedValue(response(null, "stop", { refusal: "PROVIDER_PRIVATE_DETAILS" }));
    const result = await reverse();
    expect(result.ok).toBe(false); expect(result.message).toContain("拒绝");
    expect(result.message).not.toContain("PROVIDER_PRIVATE_DETAILS");
    expect(fixture.post).toHaveBeenCalledTimes(2);
    expect(getAiCallLog()[0].ok).toBe(false);
  });
  it("never retries an empty response carrying an explicit refusal even with length", async () => {
    fixture.post.mockResolvedValue(response(null, "length", { refusal: "refused" }));
    const result = await reverse();
    expect(result.ok).toBe(false); expect(result.message).toContain("拒绝");
    expect(fixture.post).toHaveBeenCalledTimes(1);
  });
  it("does not turn repeated empty length into three format retries", async () => {
    fixture.post.mockResolvedValue(response("", "length"));
    const result = await reverse();
    expect(result.ok).toBe(false); expect(result.message).toContain("截断");
    expect(fixture.post).toHaveBeenCalledTimes(2);
  });
  it("accepts a validated text-part array through actual reverse flow", async () => {
    fixture.post.mockResolvedValue(response([{ type: "text", text: "A woman in a blue coat " }, { type: "text", text: "stands beside a tree." }]));
    expect(await reverse()).toMatchObject({ ok: true, prompt: normal });
    expect(fixture.post).toHaveBeenCalledTimes(1);
  });
  it("preserves structured variants even without a numeric template protocol", async () => {
    const variants = { namePrompt: 'A woman holds a sign reading "Sorry".', featurePrompt: 'A woman with white hair holds a sign reading "Sorry".' };
    fixture.post.mockResolvedValue(response("```json\n" + JSON.stringify(variants) + "\n```"));
    expect(await reverse(true)).toMatchObject({ ok: true, prompt: variants.namePrompt, variants });
    expect(fixture.post).toHaveBeenCalledTimes(1);
    expect(fixture.post.mock.calls[0][1]).not.toHaveProperty("response_format");
  });
  it("returns a clear error for unsupported content instead of trim TypeError", async () => {
    fixture.post.mockResolvedValue(response({ text: normal }));
    const result = await reverse();
    expect(result.ok).toBe(false); expect(result.message).toContain("响应格式");
    expect(result.message).not.toMatch(/trim|TypeError/);
    expect(fixture.post).toHaveBeenCalledTimes(1);
  });
  it("does not echo provider payload/key material in returned or logged errors", async () => {
    fixture.post.mockRejectedValue({ response: { status: 422, data: { error: { message: "SECRET_KEY PRIVATE_PAYLOAD" } } } });
    const result = await reverse();
    expect(result.ok).toBe(false); expect(result.message).toContain("422");
    expect(result.message).not.toMatch(/SECRET_KEY|PRIVATE_PAYLOAD/);
    expect(JSON.stringify(getAiCallLog())).not.toMatch(/SECRET_KEY|PRIVATE_PAYLOAD/);
    expect(fixture.post).toHaveBeenCalledTimes(1);
  });
});
