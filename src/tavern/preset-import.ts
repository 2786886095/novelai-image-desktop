import type { TavernSamplerPreset } from "../agent/types";
import { createTavernSamplerPreset, tavernId, tavernNow } from "./compat";

type JsonRecord = Record<string, unknown>;

export interface TavernPresetImportResult {
  preset: TavernSamplerPreset;
  warnings: string[];
  importedPromptCount: number;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function number(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function cleanName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").trim().slice(0, 160) || "导入预设";
}

function containsExecutablePayload(value: string) {
  return /<script\b|<<\s*taskjs\s*>>|javascript\s*:|scheduledTasks|\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/i.test(value);
}

function orderedPromptRows(root: JsonRecord) {
  const prompts = Array.isArray(root.prompts) ? root.prompts.map(record) : [];
  const orders = Array.isArray(root.prompt_order) ? root.prompt_order.map(record) : [];
  const selectedOrder = orders
    .filter((item) => Array.isArray(item.order) && item.order.length > 0)
    .sort((left, right) => {
      const enabled = (item: JsonRecord) => Array.isArray(item.order)
        ? item.order.map(record).filter((row) => row.enabled === true).length
        : 0;
      return enabled(right) - enabled(left);
    })[0];
  if (!selectedOrder || !Array.isArray(selectedOrder.order)) {
    return prompts.filter((item) => item.enabled !== false);
  }
  const promptById = new Map(prompts.map((item) => [String(item.identifier ?? ""), item]));
  return selectedOrder.order
    .map(record)
    .filter((item) => item.enabled === true)
    .map((item) => promptById.get(String(item.identifier ?? "")))
    .filter((item): item is JsonRecord => Boolean(item));
}

/**
 * Imports the declarative part of a SillyTavern-compatible completion preset.
 * Static system and user instruction blocks are merged into the app's system
 * layer because the Tavern runtime owns the live user turn. Executable
 * extension/task payloads and assistant-prefill blocks are never run or imported.
 */
export function importTavernSamplerPresetJson(json: string, fileName = "preset.json"): TavernPresetImportResult {
  const root = record(JSON.parse(json));
  const fallback = createTavernSamplerPreset(cleanName(fileName));
  const warnings: string[] = [];
  const systemBlocks: string[] = [];
  let jailbreakPrompt = "";
  let ignoredExecutable = 0;
  let ignoredPrefill = 0;

  for (const row of orderedPromptRows(root)) {
    const role = String(row.role ?? "system").toLowerCase();
    const identifier = String(row.identifier ?? "").toLowerCase();
    const content = String(row.content ?? "").trim();
    if (!content || row.marker === true) continue;
    if (role === "assistant") {
      ignoredPrefill++;
      continue;
    }
    if (role !== "system" && role !== "user") continue;
    if (containsExecutablePayload(content)) {
      ignoredExecutable++;
      continue;
    }
    if (identifier === "jailbreak") jailbreakPrompt = content;
    else systemBlocks.push(content);
  }

  if (ignoredExecutable) warnings.push(`已忽略 ${ignoredExecutable} 个可执行脚本或任务块。`);
  if (ignoredPrefill) warnings.push(`已忽略 ${ignoredPrefill} 个 assistant 预填充块。`);
  if (!systemBlocks.length) warnings.push("未找到启用的 system 提示块，已使用中性默认提示。 ");

  const sourcePrompt = systemBlocks.join("\n\n").slice(0, 200_000);
  const timestamp = tavernNow();
  const maxOutput = root.openai_max_tokens ?? root.max_tokens ?? root.maxOutputTokens;
  const stopValue = root.stop ?? root.stop_sequences ?? root.stopping_strings;
  const stop = (Array.isArray(stopValue) ? stopValue : typeof stopValue === "string" ? [stopValue] : [])
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.slice(0, 2_000))
    .slice(0, 32);

  return {
    preset: {
      ...fallback,
      id: tavernId("sampler"),
      name: String(root.name ?? root.preset_name ?? cleanName(fileName)).trim().slice(0, 160) || cleanName(fileName),
      systemPrompt: sourcePrompt || fallback.systemPrompt,
      jailbreakPrompt: jailbreakPrompt.slice(0, 100_000) || fallback.jailbreakPrompt,
      temperature: number(root.temperature, fallback.temperature, 0, 2),
      topP: number(root.top_p ?? root.topP, fallback.topP, 0, 1),
      frequencyPenalty: number(root.frequency_penalty ?? root.frequencyPenalty, 0, -2, 2),
      presencePenalty: number(root.presence_penalty ?? root.presencePenalty, 0, -2, 2),
      ...(Number.isFinite(Number(maxOutput)) ? { maxOutputTokens: Math.round(number(maxOutput, 4096, 128, 131_072)) } : {}),
      stop,
      source: "sillytavern-json",
      sourceName: fileName.slice(0, 260),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    warnings,
    importedPromptCount: systemBlocks.length + (jailbreakPrompt ? 1 : 0),
  };
}
