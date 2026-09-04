import type { AgentToolBridgeResponse } from "./types";

const BLOCKED_KEYS = new Set([
  "apikey",
  "token",
  "authorization",
  "base64",
  "imagebase64",
  "maskbase64",
  "filepath",
  "fileurl",
  "sourcepath",
  "outputpath",
  "localpath",
  "path",
]);

function safeText(value: string) {
  return value
    .replace(/file:\/\/\/[^\s"'<>]+/gi, "[local-file]")
    .replace(/\b[A-Za-z]:[\\/][^\r\n"'<>]*/g, "[local-path]");
}

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 20) return "[truncated]";
  if (typeof value === "string") return safeText(value);
  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (BLOCKED_KEYS.has(key.toLocaleLowerCase())) continue;
    output[key] = scrub(entry, depth + 1);
  }
  return output;
}

/** Strip local paths, embedded bytes, and credentials at the model boundary. */
export function redactAgentToolResponseForModel(
  result: AgentToolBridgeResponse,
): Record<string, unknown> {
  const data = scrub(result.data);
  const generatedImages = Array.isArray(result.generatedImages)
    ? scrub(result.generatedImages)
    : undefined;
  return {
    ok: result.ok,
    title: safeText(result.title),
    output: typeof data === "string" ? data : JSON.stringify(data, null, 2),
    data,
    ...(Array.isArray(generatedImages) && generatedImages.length ? { generatedImages } : {}),
  };
}
