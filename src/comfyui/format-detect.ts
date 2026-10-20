import { COMFY_LIMITS } from "./contract";
import type { ComfyIssue, ComfyIssueCode } from "./contract";

export interface ComfyJsonLimits { maxBytes?: number; maxDepth?: number; maxStringChars?: number; maxNodes?: number }
export class ComfyValidationError extends Error {
  readonly issues: ComfyIssue[];
  constructor(issues: ComfyIssue[] | string, code: ComfyIssueCode = "invalid-json") {
    const list: ComfyIssue[] = typeof issues === "string" ? [{ code, severity: "block", message: issues }] : issues;
    super(list.map((item) => item.message).join("; "));
    this.name = "ComfyValidationError"; this.issues = list;
  }
}
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
const forbidden = new Set(["__proto__", "constructor", "prototype"]);
export function assertUntrustedValue(value: unknown, limits: ComfyJsonLimits = {}): void {
  let count = 0; const seen = new Set<object>();
  const visit = (item: unknown, depth: number): void => {
    if (++count > (limits.maxNodes ?? 1_000_000)) throw new ComfyValidationError("JSON value count exceeds the limit", "too-large");
    if (depth > (limits.maxDepth ?? COMFY_LIMITS.jsonDepth)) throw new ComfyValidationError("JSON nesting exceeds the limit", "too-large");
    if (typeof item === "string") {
      if (item.length > (limits.maxStringChars ?? COMFY_LIMITS.stringValueChars)) throw new ComfyValidationError("JSON string exceeds the limit", "too-large");
      return;
    }
    if (item === null || typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item))) return;
    if (!Array.isArray(item) && !isPlainRecord(item)) throw new ComfyValidationError("Only finite, plain JSON data is accepted");
    if (seen.has(item)) throw new ComfyValidationError("Cyclic JSON value");
    seen.add(item);
    for (const [key, child] of Object.entries(item)) {
      if (forbidden.has(key)) throw new ComfyValidationError(`Forbidden JSON key: ${key}`, "forbidden-key");
      visit(child, depth + 1);
    }
    seen.delete(item);
  };
  visit(value, 0);
}
export function parseUntrustedJson(text: string, limits: ComfyJsonLimits = {}): unknown {
  if (typeof text !== "string") throw new ComfyValidationError("Expected JSON text");
  if (new TextEncoder().encode(text).length > (limits.maxBytes ?? COMFY_LIMITS.workflowJsonChars)) throw new ComfyValidationError("JSON exceeds the byte limit", "too-large");
  let parsed: unknown;
  try { parsed = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text); }
  catch (error) { throw new ComfyValidationError(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`); }
  assertUntrustedValue(parsed, limits); return parsed;
}

export interface ComfyDetectedPayload {
  kind: "api" | "ui" | "wrapped" | "unknown";
  format: "api" | "ui" | null;
  payload: unknown;
}
const NODE_ID = /^[A-Za-z0-9:_-]{1,64}$/;
function apiShape(value: unknown): boolean {
  return isPlainRecord(value) && Object.keys(value).length > 0 && Object.entries(value).every(([id, node]) => NODE_ID.test(id) && isPlainRecord(node) && typeof node.class_type === "string" && isPlainRecord(node.inputs));
}
function direct(value: unknown): "api" | "ui" | null {
  if (isPlainRecord(value) && Array.isArray(value.nodes) && Array.isArray(value.links)) return "ui";
  return apiShape(value) ? "api" : null;
}
export function detectComfyPayload(value: unknown): ComfyDetectedPayload {
  const initial = direct(value);
  if (initial) return { kind: initial, format: initial, payload: value };
  const unwrap = (candidate: unknown, depth: number): ComfyDetectedPayload | null => {
    if (depth > 8) return null;
    if (typeof candidate === "string") { try { candidate = parseUntrustedJson(candidate); } catch { return null; } }
    const format = direct(candidate); if (format) return { kind: "wrapped", format, payload: candidate };
    if (!isPlainRecord(candidate)) return null;
    // Actual history has prompt=[queue number,prompt id,API prompt,extra data,...].
    if (Array.isArray(candidate.prompt) && candidate.prompt.length >= 3) {
      const result = unwrap(candidate.prompt[2], depth + 1); if (result) return result;
    }
    for (const key of ["prompt", "workflow"]) {
      if (candidate[key] !== undefined && !Array.isArray(candidate[key])) { const result = unwrap(candidate[key], depth + 1); if (result) return result; }
    }
    // A one-entry /history/<id> response; ambiguous multi-job histories are not selected.
    if (Object.keys(candidate).length === 1) return unwrap(Object.values(candidate)[0], depth + 1);
    return null;
  };
  return unwrap(value, 0) ?? { kind: "unknown", format: null, payload: value };
}
export function payloadFromImageMetadata(meta: unknown): ComfyDetectedPayload { return detectComfyPayload(meta); }
