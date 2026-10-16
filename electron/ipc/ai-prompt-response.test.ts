import { describe, expect, it } from "vitest";
import { classifyAiPromptResponse, isExplicitPromptRefusal, visionPromptRequestError } from "./ai-prompt-response";

const reply = (content: unknown, finish_reason: string | null = "stop", extra = {}) => ({
  choices: [{ message: { content, ...extra }, finish_reason }],
});

describe("vision prompt response classification", () => {
  it.each([
    "I'm sorry, but I can't assist with this request.",
    "Sorry, I cannot help with that request.",
    "I can’t assist with this request.",
    "I am unable to help with that.",
    "I cannot help.",
    "抱歉，我无法协助处理这个请求。",
    "对不起，我不能帮助你完成这个请求。",
    "抱歉，我无法提供此类内容。",
    "```text\nI'm sorry, but I can't assist with this request.\n```",
  ])("rejects an explicit whole refusal: %s", content => {
    expect(isExplicitPromptRefusal(content)).toBe(true);
    expect(classifyAiPromptResponse(reply(content))).toMatchObject({ ok: false, kind: "refusal", retryableEmptyLength: false });
  });

  it.each([
    'A woman holds a sign reading "I\'m sorry, but I can\'t assist with this request.".',
    '1girl, holding book, Text: "Sorry"',
    "A woman cannot see the man behind the tree.",
    "画面中写着“抱歉，我无法提供此类内容。”的标牌。",
    "A woman stands beside the window.",
  ])("does not reject normal scene text or quoted refusals: %s", content => {
    expect(isExplicitPromptRefusal(content)).toBe(false);
    expect(classifyAiPromptResponse(reply(content))).toEqual({ ok: true, content });
  });

  it("preserves all JSON characters until the final parser", () => {
    const content = '  ```json\n{"namePrompt":"Text: \\"Sorry\\", blue sky", "featurePrompt":"first\\nsecond"}\n```  ';
    expect(classifyAiPromptResponse(reply(content))).toEqual({ ok: true, content });
  });
  it("extracts only validated text parts in order without inventing separators", () => {
    expect(classifyAiPromptResponse(reply([{ type: "text", text: " 1girl, " }, { type: "output_text", text: "smile " }]))).toEqual({ ok: true, content: " 1girl, smile " });
  });
  it("prioritizes message.refusal even when usable-looking text exists", () => {
    expect(classifyAiPromptResponse(reply("1girl, smile", "length", { refusal: "upstream private details" }))).toMatchObject({ ok: false, kind: "refusal", retryableEmptyLength: false });
  });
  it("prioritizes refusal parts even among other invalid parts", () => {
    expect(classifyAiPromptResponse(reply([{ type: "image_url" }, { type: "refusal", refusal: "details" }], "length"))).toMatchObject({ ok: false, kind: "refusal", retryableEmptyLength: false });
  });
  it("rejects content_filter with nonempty text", () => {
    expect(classifyAiPromptResponse(reply("A woman stands.", "content_filter"))).toMatchObject({ ok: false, kind: "filtered", retryableEmptyLength: false });
  });
  it("rejects nonempty length truncation", () => {
    expect(classifyAiPromptResponse(reply("A woman stands beside", "length"))).toMatchObject({ ok: false, kind: "truncated", retryableEmptyLength: false });
  });
  it("only empty length responses authorize the existing bounded retry", () => {
    expect(classifyAiPromptResponse(reply(" \n ", "length"))).toMatchObject({ ok: false, kind: "empty", retryableEmptyLength: true });
    expect(classifyAiPromptResponse(reply(null))).toMatchObject({ ok: false, kind: "empty", retryableEmptyLength: false });
  });
  it.each([true, 123, {}, ["text"], [{ type: "text", text: {} }], [{ type: "other", text: "untyped" }]])("rejects unsupported content without throwing: %j", content => {
    expect(classifyAiPromptResponse(reply(content))).toMatchObject({ ok: false, kind: "invalid", retryableEmptyLength: false });
  });
  it.each([undefined, {}, { choices: [] }, { choices: [{ message: true }] }])("rejects invalid envelopes: %j", data => {
    expect(classifyAiPromptResponse(data)).toMatchObject({ ok: false, kind: "invalid" });
  });
  it("does not disclose upstream refusal details", () => {
    const result = classifyAiPromptResponse(reply(null, "stop", { refusal: "PAYLOAD TOKEN PRIVATE_IMAGE" }));
    expect(JSON.stringify(result)).not.toMatch(/PAYLOAD|TOKEN|PRIVATE_IMAGE/);
  });
});

describe("vision request errors", () => {
  it.each([401, 403, 429, 500])("reports HTTP status without exposing provider messages: %s", status => {
    const message = visionPromptRequestError({ response: { status, data: { error: { message: "TOKEN PAYLOAD" } } }, message: "TOKEN PAYLOAD" });
    expect(message).toContain(String(status));
    expect(message).not.toMatch(/TOKEN|PAYLOAD/);
  });
  it.each(["ECONNABORTED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ERR_NETWORK", "OTHER"])('sanitizes transport error %s', code => {
    expect(visionPromptRequestError({ code, message: "TOKEN PAYLOAD" })).not.toMatch(/TOKEN|PAYLOAD/);
  });
});
