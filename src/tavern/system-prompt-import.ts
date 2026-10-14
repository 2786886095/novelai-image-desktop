import type { TavernSamplerPreset } from "../agent/types";
import { normalizeTavernSamplerPreset, tavernId } from "./compat";
import { importTavernSamplerPresetJson } from "./preset-import";

export const MAX_SYSTEM_PROMPT_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORTED_SYSTEM_PROMPT_CHARS = 200_000;
export const MAX_IMPORTED_POSTSCRIPT_CHARS = 100_000;
export type SystemPromptImportErrorCode = "empty" | "bytes" | "utf8" | "extension" | "json" | "shape" | "system-limit" | "postscript-limit";
export class SystemPromptImportError extends Error {
  constructor(public readonly code: SystemPromptImportErrorCode) {
    super(code);
    this.name = "SystemPromptImportError";
  }
}
function fail(code: SystemPromptImportErrorCode): never { throw new SystemPromptImportError(code); }

/** Decode only declarative text. Never execute imported scripts or macros. */
export function decodeSystemPromptFile(bytes: Uint8Array): string {
  if (bytes.byteLength > MAX_SYSTEM_PROMPT_IMPORT_BYTES) fail("bytes");
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return fail("utf8"); }
}

function validateBodies(systemPrompt: string, jailbreakPrompt: string) {
  if (!systemPrompt.trim()) fail("empty");
  if (systemPrompt.length > MAX_IMPORTED_SYSTEM_PROMPT_CHARS) fail("system-limit");
  if (jailbreakPrompt.length > MAX_IMPORTED_POSTSCRIPT_CHARS) fail("postscript-limit");
}

type Row = Record<string, unknown>;
const row = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};

/** Match the existing ST importer's ordering and exclusions, before its slices. */
function strictStBodies(root: Row) {
  const prompts = (root.prompts as unknown[]).map(row);
  const orders = (Array.isArray(root.prompt_order) ? root.prompt_order : []).map(row);
  const selected = orders.filter(order => Array.isArray(order.order) && order.order.length)
    .sort((a, b) => {
      const enabled = (order: Row) => (order.order as unknown[]).map(row).filter(item => item.enabled === true).length;
      return enabled(b) - enabled(a);
    })[0];
  const byId = new Map(prompts.map(item => [String(item.identifier ?? ""), item]));
  const active = selected
    ? (selected.order as unknown[]).map(row).filter(item => item.enabled === true).map(item => byId.get(String(item.identifier ?? ""))).filter((item): item is Row => Boolean(item))
    : prompts.filter(item => item.enabled !== false);
  const blocks: string[] = [];
  let postscript = "";
  for (const item of active) {
    const role = String(item.role ?? "system").toLowerCase();
    if (item.marker === true || role !== "system" && role !== "user") continue;
    if (item.content !== undefined && typeof item.content !== "string") fail("shape");
    const content = String(item.content ?? "").trim();
    if (!content || /<script\b|<<\s*taskjs\s*>>|javascript\s*:|scheduledTasks|\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/i.test(content)) continue;
    if (String(item.identifier ?? "").toLowerCase() === "jailbreak") postscript = content;
    else blocks.push(content);
  }
  const system = blocks.join("\n\n");
  validateBodies(system, postscript);
  return { system, postscript };
}

/** The sole bounded importer used by conversion, reverse and Studio resources. */
export function importImageSystemPrompt(text: string, options: { filename: string; sourceHash?: string; now?: string }): { preset: TavernSamplerPreset; warnings: string[] } {
  if (new TextEncoder().encode(text).byteLength > MAX_SYSTEM_PROMPT_IMPORT_BYTES) fail("bytes");
  const source = text.replace(/^\uFEFF/, "");
  if (!source.trim()) fail("empty");
  const extension = options.filename.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
  if (!extension || !["txt", "md", "json"].includes(extension)) fail("extension");
  const fallbackName = options.filename.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "").trim() || "Imported system prompt";
  let preset: TavernSamplerPreset;
  let warnings: string[] = [];
  if (extension !== "json") {
    validateBodies(source, "");
    preset = normalizeTavernSamplerPreset({ name: fallbackName, systemPrompt: source, jailbreakPrompt: "", source: "langbai" });
  } else {
    let parsed: unknown;
    try { parsed = JSON.parse(source); } catch { return fail("json"); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail("shape");
    const root = parsed as Row;
    if (root.systemPrompt !== undefined || root.system_prompt !== undefined) {
      const system = root.systemPrompt ?? root.system_prompt;
      const postscript = root.jailbreakPrompt ?? root.jailbreak_prompt ?? "";
      if (typeof system !== "string" || typeof postscript !== "string") fail("shape");
      validateBodies(system, postscript);
      preset = normalizeTavernSamplerPreset({ ...root, name: root.name ?? root.preset_name ?? fallbackName, systemPrompt: system, jailbreakPrompt: postscript, source: "langbai" });
    } else {
      if (!Array.isArray(root.prompts)) fail("shape");
      const bodies = strictStBodies(root);
      const result = importTavernSamplerPresetJson(source, options.filename);
      // Empty optional postscript must stay empty, never the roleplay fallback.
      preset = { ...result.preset, systemPrompt: bodies.system, jailbreakPrompt: bodies.postscript };
      warnings = result.warnings;
    }
  }
  return {
    preset: {
      ...preset,
      // Imported identifiers are untrusted data, never local library identity.
      id: tavernId("sampler"),
      sourceName: options.filename.replace(/^.*[\\/]/, "").slice(0, 260),
      ...(options.sourceHash ? { sourceHash: options.sourceHash } : {}),
      ...(options.now ? { createdAt: options.now, updatedAt: options.now } : {}),
    },
    warnings,
  };
}
