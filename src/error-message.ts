export interface CompactRemoteErrorOptions {
  status?: number;
  fallback?: string;
  serviceLabel?: string;
  maxLength?: number;
}

const ERROR_TEXT_KEYS = ["message", "detail", "error", "title"] as const;

function objectStatus(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const direct = Number(record.statusCode ?? record.status);
  if (Number.isInteger(direct) && direct >= 100 && direct <= 599) return direct;
  const response = record.response;
  if (response && typeof response === "object") {
    const nested = Number((response as Record<string, unknown>).status);
    if (Number.isInteger(nested) && nested >= 100 && nested <= 599) return nested;
  }
  return undefined;
}

function errorValueText(value: unknown, depth = 0): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Error) return value.message || value.name;
  if (depth > 2 || typeof value !== "object") return String(value);

  const record = value as Record<string, unknown>;
  const response = record.response;
  if (response && typeof response === "object" && "data" in response) {
    const nested = errorValueText((response as Record<string, unknown>).data, depth + 1);
    if (nested) return nested;
  }
  for (const key of ERROR_TEXT_KEYS) {
    if (!(key in record)) continue;
    const nested = errorValueText(record[key], depth + 1);
    if (nested && nested !== "[object Object]") return nested;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value
    .replace(/&#(\d+);?/g, (_match, digits: string) => {
      const code = Number(digits);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : " ";
    })
    .replace(/&#x([\da-f]+);?/gi, (_match, digits: string) => {
      const code = Number.parseInt(digits, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : " ";
    })
    .replace(/&([a-z]+);/gi, (match, name: string) => named[name.toLowerCase()] ?? match);
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--([\s\S]*?)-->/g, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function detectedHttpStatus(value: string): number | undefined {
  const explicit = value.match(/\bHTTP\s*[-:]?\s*([45]\d\d)\b/i)?.[1];
  const cloudflare = value.match(/\b(?:error\s*code|status(?:\s*code)?)\s*[:#-]?\s*([45]\d\d)\b/i)?.[1];
  const gateway = value.match(/\b(502|503|504)\b/)?.[1];
  const parsed = Number(explicit ?? cloudflare ?? gateway);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function unavailableMessage(service: string, status: number): string {
  const labels: Record<number, string> = {
    502: "Bad Gateway",
    503: "Service Unavailable",
    504: "Gateway Timeout",
  };
  const suffix = labels[status] ? ` ${labels[status]}` : "";
  return `${service}暂时不可用（HTTP ${status}${suffix}），请稍后重试。`;
}

/**
 * Converts rejected IPC/Axios payloads into a bounded, plain-text UI message.
 * In particular, Cloudflare occasionally returns a complete HTML error page;
 * that page must never be rendered verbatim in the renderer status bar/toast.
 */
export function compactRemoteErrorText(
  value: unknown,
  options: CompactRemoteErrorOptions = {},
): string {
  const fallback = options.fallback?.trim() || "请求失败，请稍后重试。";
  const service = options.serviceLabel?.trim() || "上游服务";
  const maxLength = Math.max(80, Math.min(2_000, options.maxLength ?? 420));
  const raw = errorValueText(value).trim();
  if (!raw) return fallback;

  const status = options.status ?? objectStatus(value) ?? detectedHttpStatus(raw);
  const looksLikeHtml = /<!doctype\s+html|<html\b|<head\b|<body\b|<\/?(?:div|span|script|style|h[1-6]|p)\b/i.test(raw);
  const looksLikeGatewayPage = /cloudflare|cf-error|bad\s+gateway|gateway\s+time-?out|service\s+unavailable/i.test(raw);
  if (status === 502 || status === 503 || status === 504) {
    return unavailableMessage(service, status);
  }
  if (looksLikeHtml || looksLikeGatewayPage) {
    return `${service}返回了网页错误，请稍后重试。`;
  }

  const plain = stripHtml(raw)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return fallback;
  return plain.length > maxLength ? `${plain.slice(0, maxLength - 1).trimEnd()}…` : plain;
}
