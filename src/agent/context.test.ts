import { describe, expect, it } from "vitest";
import {
  adaptiveAgentCompactThreshold,
  createContextSnapshot,
  effectiveContextMessages,
  estimateTextTokens,
  shouldAutoCompact,
} from "./context";
import type { AgentMessage } from "./types";

const message = (content: string): AgentMessage => ({
  id: content,
  role: "user",
  content,
  attachments: [],
  tools: [],
  status: "complete",
  createdAt: new Date(0).toISOString(),
});

describe("agent context accounting", () => {
  it("uses conservative CJK estimates before provider usage arrives", () => {
    expect(estimateTextTokens("测试生成一张图")).toBeGreaterThan(5);
    expect(estimateTextTokens("generate a portrait")).toBeLessThan(10);
  });

  it("prefers real latest-turn usage and triggers the configured danger threshold", () => {
    const snapshot = createContextSnapshot(
      [message("ignored estimate")],
      10_000,
      0.8,
      { input: 7_500, output: 400, reasoning: 100, cacheRead: 0, cacheWrite: 0, total: 8_000 },
    );
    expect(snapshot.used).toBe(8_000);
    expect(snapshot.estimated).toBe(false);
    expect(snapshot.danger).toBe(true);
    expect(shouldAutoCompact(snapshot, true, 0.8)).toBe(true);
  });

  it("derives a safer internal threshold from model and output limits", () => {
    expect(adaptiveAgentCompactThreshold(32_768, 4_096)).toBeCloseTo(0.70);
    expect(adaptiveAgentCompactThreshold(1_048_576, 32_768)).toBeCloseTo(0.88);
    expect(adaptiveAgentCompactThreshold(8_192, 8_192)).toBe(0.5);
  });

  it("keeps full local history but accounts only for the summary and newer turns", () => {
    const old = { ...message("old turn"), createdAt: "2026-09-02T00:00:00.000Z" };
    const recent = { ...message("recent turn"), createdAt: "2026-09-02T00:02:00.000Z" };
    const result = effectiveContextMessages(
      [old, recent],
      "continuity summary",
      "2026-09-02T00:01:00.000Z",
    );
    expect(result.map((item) => item.content)).toEqual(["continuity summary", "recent turn"]);
    expect([old, recent]).toHaveLength(2);
  });
});
