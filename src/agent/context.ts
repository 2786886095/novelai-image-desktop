import type { AgentContextSnapshot, AgentMessage, AgentTokenUsage } from "./types";

export const DEFAULT_AGENT_CONTEXT_WINDOW = 1_048_576;
export const DEFAULT_AGENT_COMPACT_THRESHOLD = 0.88;

export function clampContextWindow(value: unknown): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return DEFAULT_AGENT_CONTEXT_WINDOW;
  return Math.max(8_192, Math.min(2_000_000, parsed));
}

export function clampCompactThreshold(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_AGENT_COMPACT_THRESHOLD;
  return Math.max(0.5, Math.min(0.95, parsed));
}

/**
 * Keep enough room for the next answer and tool traffic without asking users
 * to understand a low-level threshold. The value is intentionally derived
 * from the detected model limits and is therefore safe to recompute whenever
 * a provider/model changes or an old backup is imported.
 */
export function adaptiveAgentCompactThreshold(
  contextWindowValue: unknown,
  maxOutputTokensValue: unknown,
): number {
  const contextWindow = clampContextWindow(contextWindowValue);
  const maxOutputTokens = Math.max(
    512,
    Math.min(contextWindow, Math.trunc(Number(maxOutputTokensValue) || 8_192)),
  );
  const baseline = contextWindow <= 32_768
    ? 0.70
    : contextWindow <= 65_536
      ? 0.75
      : contextWindow <= 131_072
        ? 0.80
        : contextWindow <= 262_144
          ? 0.84
          : contextWindow <= 1_048_576
            ? 0.88
            : 0.90;
  const reserve = Math.min(contextWindow * 0.5, maxOutputTokens + 4_096);
  return clampCompactThreshold(Math.min(baseline, 1 - reserve / contextWindow));
}

/**
 * A deliberately conservative pre-response estimate. CJK characters commonly
 * occupy about one token while Latin prose averages about four characters.
 * Completed provider turns replace this estimate with provider usage data.
 */
export function estimateTextTokens(text: string): number {
  const normalized = String(text ?? "");
  if (!normalized) return 0;
  const cjk = (normalized.match(/[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/g) ?? []).length;
  const remaining = Math.max(0, normalized.length - cjk);
  return Math.max(1, Math.ceil(cjk + remaining / 4));
}

export function emptyTokenUsage(estimated = false): AgentTokenUsage {
  return {
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
    estimated,
  };
}

export function normalizeTokenUsage(raw: Partial<AgentTokenUsage> | undefined): AgentTokenUsage {
  const number = (value: unknown) => Math.max(0, Math.trunc(Number(value) || 0));
  const input = number(raw?.input);
  const output = number(raw?.output);
  const reasoning = number(raw?.reasoning);
  const cacheRead = number(raw?.cacheRead);
  const cacheWrite = number(raw?.cacheWrite);
  return {
    input,
    output,
    reasoning,
    cacheRead,
    cacheWrite,
    total: number(raw?.total) || input + output + reasoning,
    ...(typeof raw?.cost === "number" && Number.isFinite(raw.cost) ? { cost: raw.cost } : {}),
    estimated: raw?.estimated === true,
  };
}

export function estimateConversationTokens(messages: AgentMessage[]): number {
  return messages.reduce((total, message) => {
    const attachments = message.attachments.reduce(
      (sum, attachment) => sum + (attachment.kind === "image" ? 1_200 : estimateTextTokens(attachment.name) + 80),
      0,
    );
    const tools = message.tools.reduce(
      (sum, tool) => sum + estimateTextTokens(JSON.stringify(tool.input ?? {})) + estimateTextTokens(tool.output ?? tool.error ?? ""),
      0,
    );
    return total + estimateTextTokens(message.content) + estimateTextTokens(message.reasoning ?? "") + attachments + tools + 8;
  }, 0);
}

/**
 * Return the effective context after a completed roleplay compaction. The
 * original transcript stays in local history, while providers and token
 * accounting receive only the continuity summary plus newer turns.
 */
export function effectiveContextMessages(
  messages: AgentMessage[],
  lastSummary?: string,
  lastCompactedAt?: string,
): AgentMessage[] {
  const boundary = lastCompactedAt?.trim();
  const summary = lastSummary?.trim();
  if (!boundary || !summary) return messages;
  return [
    {
      id: `context-summary-${boundary}`,
      role: "system",
      content: summary,
      attachments: [],
      tools: [],
      status: "complete",
      createdAt: boundary,
      completedAt: boundary,
    },
    ...messages.filter((message) => message.createdAt.localeCompare(boundary) > 0),
  ];
}

export function contextUsedFromLatestUsage(
  messages: AgentMessage[],
  latestUsage?: AgentTokenUsage,
): { used: number; estimated: boolean } {
  if (latestUsage && latestUsage.input > 0) {
    return {
      used: latestUsage.input + latestUsage.cacheRead + latestUsage.output + latestUsage.reasoning,
      estimated: latestUsage.estimated === true,
    };
  }
  return { used: estimateConversationTokens(messages), estimated: true };
}

export function createContextSnapshot(
  messages: AgentMessage[],
  limitValue: unknown,
  thresholdValue: unknown,
  latestUsage?: AgentTokenUsage,
): AgentContextSnapshot {
  const limit = clampContextWindow(limitValue);
  const threshold = clampCompactThreshold(thresholdValue);
  const { used, estimated } = contextUsedFromLatestUsage(messages, latestUsage);
  const percent = Math.min(100, Math.max(0, used / limit * 100));
  return {
    used,
    limit,
    percent,
    danger: used >= limit * threshold,
    estimated,
    updatedAt: new Date().toISOString(),
  };
}

export function shouldAutoCompact(
  snapshot: AgentContextSnapshot,
  enabled: boolean,
  thresholdValue: unknown,
): boolean {
  if (!enabled || snapshot.limit <= 0) return false;
  return snapshot.used >= snapshot.limit * clampCompactThreshold(thresholdValue);
}
