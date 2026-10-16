export type AiPromptResponseResult =
  | { ok: true; content: string }
  | {
      ok: false;
      kind: "refusal" | "filtered" | "truncated" | "empty" | "invalid";
      message: string;
      retryableEmptyLength: boolean;
    };

/** Redact configured plaintext/URL-encoded keys from untrusted diagnostics. */
export function redactAiCredentials(text: string, secrets: readonly unknown[]): string {
  const values = [...new Set(secrets.flatMap(value => {
    if (typeof value !== "string" || !value.trim()) return [];
    const key = value.trim();
    return [key, encodeURIComponent(key)];
  }))].sort((a, b) => b.length - a.length);
  return values.reduce((output, secret) => output.split(secret).join("[REDACTED]"), text);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasRefusal(value: unknown): boolean {
  return typeof value === "string"
    ? value.trim().length > 0
    : value !== undefined && value !== null && value !== false;
}

/** Only an opening assistant refusal, never a keyword elsewhere in scene text. */
export function isExplicitPromptRefusal(text: string): boolean {
  let normalized = text.trim();
  const fence = /^```(?:text|txt|markdown)?\s*\r?\n([\s\S]*?)\r?\n```$/i.exec(normalized);
  if (fence) normalized = fence[1].trim();
  normalized = normalized.replace(/[’‘]/g, "'").replace(/\s+/g, " ");
  const english = normalized.replace(/^(?:(?:i(?:'m| am)\s+)?sorry|i apologize)[\s,.!:;—-]*(?:but\s+)?/i, "");
  // Do not constrain the refused object or reject only an exact one-sentence form:
  // a provider may explain its refusal or offer a different kind of assistance.
  // "can't help but notice" is an observation, not a refusal to help the user.
  if (/^i(?:\s+(?:can't|cannot|can not)|(?:'m| am)\s+unable to)\s+(?:assist\b|comply\b|help\b(?!\s+but\b))/i.test(english)) return true;
  const apology = /^(?:很|非常)?(?:抱歉|对不起)[\s，,。:：]*(?:但(?:是)?[\s，,]*)?/;
  const chinese = normalized.replace(apology, "");
  return /^我(?:无法|不能|没办法)(?:为你|为您)?(?:帮助|协助|处理|完成|满足|提供)/.test(chinese)
    || (apology.test(normalized) && /^(?:无法|不能|没办法)(?:为你|为您)?(?:帮助|协助|处理|完成|满足|提供)/.test(chinese));
}

function failure(
  kind: Exclude<AiPromptResponseResult, { ok: true }>['kind'],
  retryableEmptyLength = false,
): AiPromptResponseResult {
  const messages = {
    refusal: "视觉模型拒绝了本次反推请求，未生成可用提示词。请检查请求内容及模型服务的使用要求。",
    filtered: "视觉模型服务返回内容过滤结果，未生成可用提示词。",
    truncated: "反推响应被长度截断，未接受为提示词；请缩短请求或提高服务输出上限。",
    empty: retryableEmptyLength
      ? "视觉模型返回被长度截断且内容为空；请提高服务输出上限或选择合适的模型。"
      : "视觉模型返回内容为空，请检查所选模型和接口是否支持图片反推。",
    invalid: "视觉模型返回了不支持的响应格式，未生成可用提示词。",
  };
  return { ok: false, kind, message: messages[kind], retryableEmptyLength };
}

/** Classify Chat Completions replies without changing JSON escapes or whitespace. */
export function classifyAiPromptResponse(data: unknown): AiPromptResponseResult {
  if (!record(data) || !Array.isArray(data.choices) || !record(data.choices[0])) {
    return failure("invalid");
  }
  const choice = data.choices[0];
  if (choice.finish_reason === "content_filter") return failure("filtered");
  if (!record(choice.message)) return failure("invalid");
  const message = choice.message;
  if (hasRefusal(message.refusal)) return failure("refusal");
  if (Array.isArray(message.content) && message.content.some(part =>
    record(part) && (part.type === "refusal" || hasRefusal(part.refusal)))) {
    return failure("refusal");
  }

  let content: string;
  if (typeof message.content === "string") {
    content = message.content;
  } else if (message.content === null || message.content === undefined) {
    content = "";
  } else if (Array.isArray(message.content)) {
    const parts: string[] = [];
    for (const part of message.content) {
      if (!record(part) || (part.type !== "text" && part.type !== "output_text") || typeof part.text !== "string") {
        return failure("invalid");
      }
      parts.push(part.text);
    }
    content = parts.join("");
  } else {
    return failure("invalid");
  }
  if (isExplicitPromptRefusal(content)) return failure("refusal");
  if (!content.trim()) return failure("empty", choice.finish_reason === "length");
  if (choice.finish_reason === "length") return failure("truncated");
  return { ok: true, content };
}

/** Do not echo provider errors: those may contain request bodies or credentials. */
export function visionPromptRequestError(error: unknown): string {
  const response = record(error) && record(error.response) ? error.response : undefined;
  const status = response?.status;
  if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599) {
    if (status === 401 || status === 403) return `视觉模型请求未获授权（HTTP ${status}），请检查服务权限和密钥配置。`;
    if (status === 429) return "视觉模型服务请求过于频繁或额度不足（HTTP 429），请稍后重试并检查服务额度。";
    return `视觉模型请求失败（HTTP ${status}），请检查服务配置及请求支持情况。`;
  }
  const code = record(error) ? error.code : undefined;
  if (code === "ECONNABORTED" || code === "ETIMEDOUT") return "视觉模型请求超时，请检查网络连接或稍后重试。";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ECONNREFUSED" || code === "ERR_NETWORK") {
    return "无法连接视觉模型服务，请检查接口地址、网络和代理配置。";
  }
  return "视觉模型请求失败，未生成可用提示词；请检查网络和服务配置。";
}
