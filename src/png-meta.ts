// Embedded image metadata parsing and mapping to GenerateParams.
//
// Supported inputs:
// - NovelAI PNG tEXt / uncompressed iTXt (Description + Comment JSON)
// - AUTOMATIC1111 / Forge PNG parameters
// - AUTOMATIC1111 / Forge JPEG/WebP EXIF UserComment
// - ComfyUI PNG prompt + workflow
//
// The parser intentionally keeps the original metadata alongside the compatible
// NovelAI patch. Unsupported SD/ComfyUI values remain visible instead of being
// silently discarded.
import { NAI_MODELS, NAI_SAMPLERS } from "./types";
import type { CharCaptionItem, ImportedParams, NAIModel, NAISampler } from "./types";

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type ImageMetadataKind = "novelai" | "stable-diffusion" | "comfyui" | "unknown";

export interface ImageMetadataEntry {
  key: string;
  value: string;
  group: "generation" | "model" | "image" | "raw";
}

export interface ImageMetadataReport {
  kind: ImageMetadataKind;
  software: string;
  imported: ImportedParams;
  characterCaptions: CharCaptionItem[];
  entries: ImageMetadataEntry[];
  rawMetadata: Record<string, string>;
  rawText: string;
  warnings: string[];
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function modelToNai(value: unknown): NAIModel | undefined {
  if (typeof value !== "string") return undefined;
  if (NAI_MODELS.some((item) => item.value === value)) return value as NAIModel;
  const name = value.toLowerCase();
  if (name.includes("furry") && name.includes("v3")) return "nai-diffusion-furry-3";
  if (name.includes("v5")) {
    return name.includes("curated") ? "nai-diffusion-5-curated" : "nai-diffusion-5-full";
  }
  if (name.includes("v4.5") || name.includes("v4 5")) {
    return name.includes("curated") ? "nai-diffusion-4-5-curated" : "nai-diffusion-4-5-full";
  }
  if (name.includes("v4")) {
    return name.includes("curated") ? "nai-diffusion-4-curated" : "nai-diffusion-4-full";
  }
  if (name.includes("v3")) return "nai-diffusion-3";
  return undefined;
}

/** Extract NovelAI V4/V4.5/V5 structured positive and negative character prompts. */
export function parseNovelAICharCaptions(meta: Record<string, string>): CharCaptionItem[] {
  let comment: Record<string, unknown> = {};
  try {
    comment = objectValue(JSON.parse(meta.Comment ?? meta.comment ?? "{}")) ?? {};
  } catch {
    return [];
  }
  const prompt = objectValue(comment.v4_prompt);
  const promptCaption = objectValue(prompt?.caption);
  const negative = objectValue(comment.v4_negative_prompt);
  const negativeCaption = objectValue(negative?.caption);
  const positiveItems = Array.isArray(promptCaption?.char_captions)
    ? promptCaption.char_captions
    : [];
  const negativeItems = Array.isArray(negativeCaption?.char_captions)
    ? negativeCaption.char_captions
    : [];
  const useCoords = prompt?.use_coords === true;
  return positiveItems.flatMap((raw, index) => {
    const item = objectValue(raw);
    const value = nonEmpty(item?.char_caption);
    if (!value) return [];
    const negativeItem = objectValue(negativeItems[index]);
    const centers = Array.isArray(item?.centers) ? item.centers : [];
    const center = objectValue(centers[0]);
    return [{
      prompt: value,
      negativePrompt: nonEmpty(negativeItem?.char_caption) ?? "",
      useCoords,
      x: finiteNumber(center?.x) ?? 0.5,
      y: finiteNumber(center?.y) ?? 0.5,
    }];
  }).slice(0, 32);
}

function decodeUtf8(bytes: Uint8Array) {
  return new TextDecoder("utf-8").decode(bytes);
}

function decodeLatin1(bytes: Uint8Array) {
  return new TextDecoder("latin1").decode(bytes);
}

/** Read tEXt and uncompressed iTXt chunks from a PNG ArrayBuffer. */
export function parsePngMeta(buffer: ArrayBuffer): Record<string, string> {
  if (buffer.byteLength < 8) return {};
  const sig = new Uint8Array(buffer, 0, 8);
  if (PNG_SIG.some((b, i) => sig[i] !== b)) return {};

  const view = new DataView(buffer);
  const result: Record<string, string> = {};
  let offset = 8;
  while (offset + 12 <= buffer.byteLength) {
    const length = view.getUint32(offset, false);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.byteLength) break;
    const type = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7),
    );
    if (type === "IEND") break;
    const data = new Uint8Array(buffer, dataStart, length);
    if (type === "tEXt" && length > 0) {
      const nullIdx = data.indexOf(0);
      if (nullIdx >= 0) {
        const key = decodeLatin1(data.subarray(0, nullIdx));
        // A1111 and ComfyUI commonly write UTF-8 despite tEXt being Latin-1.
        result[key] = decodeUtf8(data.subarray(nullIdx + 1));
      }
    } else if (type === "iTXt" && length > 0) {
      const keywordEnd = data.indexOf(0);
      if (keywordEnd >= 0 && keywordEnd + 2 < data.length) {
        const key = decodeLatin1(data.subarray(0, keywordEnd));
        const compressionFlag = data[keywordEnd + 1];
        let cursor = keywordEnd + 3;
        const languageEnd = data.indexOf(0, cursor);
        if (languageEnd >= 0) {
          cursor = languageEnd + 1;
          const translatedEnd = data.indexOf(0, cursor);
          if (translatedEnd >= 0 && compressionFlag === 0) {
            result[key] = decodeUtf8(data.subarray(translatedEnd + 1));
          }
        }
      }
    }
    offset = dataEnd + 4;
  }
  return result;
}

function readTiffMetadata(bytes: Uint8Array, tiffStart: number): Record<string, string> {
  if (tiffStart + 8 > bytes.length) return {};
  const byteOrder = String.fromCharCode(bytes[tiffStart], bytes[tiffStart + 1]);
  const little = byteOrder === "II";
  if (!little && byteOrder !== "MM") return {};
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);
  if (u16(tiffStart + 2) !== 42) return {};

  const result: Record<string, string> = {};
  const visited = new Set<number>();

  function readValue(entry: number, type: number, count: number): Uint8Array | null {
    const unit = type === 1 || type === 2 || type === 7 ? 1 : type === 3 ? 2 : type === 4 ? 4 : 0;
    if (!unit || count <= 0 || count > 16_000_000) return null;
    const size = unit * count;
    const start = size <= 4 ? entry + 8 : tiffStart + u32(entry + 8);
    if (start < 0 || start + size > bytes.length) return null;
    return bytes.subarray(start, start + size);
  }

  function decodeAscii(value: Uint8Array) {
    const end = value.indexOf(0);
    return decodeUtf8(end >= 0 ? value.subarray(0, end) : value).trim();
  }

  function decodeUserComment(value: Uint8Array) {
    if (value.length <= 8) return "";
    const marker = decodeLatin1(value.subarray(0, 8));
    const payload = value.subarray(8);
    if (marker.startsWith("ASCII")) return decodeAscii(payload);
    if (marker.startsWith("UNICODE")) {
      if (payload.length >= 2 && payload[0] === 0xff && payload[1] === 0xfe) {
        return new TextDecoder("utf-16le").decode(payload.subarray(2)).replace(/\0+$/, "").trim();
      }
      if (payload.length >= 2 && payload[0] === 0xfe && payload[1] === 0xff) {
        return new TextDecoder("utf-16be").decode(payload.subarray(2)).replace(/\0+$/, "").trim();
      }
      return new TextDecoder("utf-16be").decode(payload).replace(/\0+$/, "").trim();
    }
    return decodeAscii(value);
  }

  function visitIfd(relativeOffset: number) {
    const ifd = tiffStart + relativeOffset;
    if (relativeOffset <= 0 || visited.has(ifd) || ifd + 2 > bytes.length) return;
    visited.add(ifd);
    const count = u16(ifd);
    if (count > 4096 || ifd + 2 + count * 12 > bytes.length) return;
    for (let index = 0; index < count; index += 1) {
      const entry = ifd + 2 + index * 12;
      const tag = u16(entry);
      const type = u16(entry + 2);
      const valueCount = u32(entry + 4);
      if (tag === 0x8769 || tag === 0x8825) {
        visitIfd(u32(entry + 8));
        continue;
      }
      const value = readValue(entry, type, valueCount);
      if (!value) continue;
      if (tag === 0x010e) result.ImageDescription = decodeAscii(value);
      if (tag === 0x0131) result.Software = decodeAscii(value);
      if (tag === 0x9286) result.UserComment = decodeUserComment(value);
      if (tag === 0x9c9c) {
        result.XPComment = new TextDecoder("utf-16le").decode(value).replace(/\0+$/, "").trim();
      }
    }
  }

  visitIfd(u32(tiffStart + 4));
  const parameters = [result.UserComment, result.XPComment, result.ImageDescription]
    .find((value) => value && /(?:^|\n)Steps:\s*\d+/m.test(value));
  if (parameters) result.parameters = parameters;
  return result;
}

function parseJpegMeta(buffer: ArrayBuffer): Record<string, string> {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return {};
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) break;
    if (
      marker === 0xe1 &&
      length >= 8 &&
      decodeLatin1(bytes.subarray(offset + 4, offset + 10)) === "Exif\u0000\u0000"
    ) {
      return readTiffMetadata(bytes, offset + 10);
    }
    offset += 2 + length;
  }
  return {};
}

function parseWebpMeta(buffer: ArrayBuffer): Record<string, string> {
  const bytes = new Uint8Array(buffer);
  if (
    bytes.length < 12 ||
    decodeLatin1(bytes.subarray(0, 4)) !== "RIFF" ||
    decodeLatin1(bytes.subarray(8, 12)) !== "WEBP"
  ) return {};
  const view = new DataView(buffer);
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = decodeLatin1(bytes.subarray(offset, offset + 4));
    const length = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + length > bytes.length) break;
    if (type === "EXIF") {
      const hasPrefix =
        length >= 6 && decodeLatin1(bytes.subarray(start, start + 6)) === "Exif\u0000\u0000";
      return readTiffMetadata(bytes, start + (hasPrefix ? 6 : 0));
    }
    offset = start + length + (length % 2);
  }
  return {};
}

/** Read supported embedded text metadata from PNG, JPEG, or WebP. */
export function parseImageMeta(buffer: ArrayBuffer): Record<string, string> {
  const png = parsePngMeta(buffer);
  if (Object.keys(png).length) return png;
  const jpeg = parseJpegMeta(buffer);
  if (Object.keys(jpeg).length) return jpeg;
  return parseWebpMeta(buffer);
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function finiteInteger(value: unknown): number | undefined {
  const number = finiteNumber(value);
  return number === undefined ? undefined : Math.round(number);
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function samplerToNai(value: unknown): NAISampler | undefined {
  if (typeof value !== "string") return undefined;
  const direct = NAI_SAMPLERS.find((item) => item.value === value)?.value;
  if (direct) return direct;
  const normalized = value.toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
  const aliases: Record<string, NAISampler> = {
    "euler a": "k_euler_ancestral",
    "euler ancestral": "k_euler_ancestral",
    euler: "k_euler",
    "dpm++ 2m": "k_dpmpp_2m",
    "dpmpp 2m": "k_dpmpp_2m",
    "dpm++ 2m sde": "k_dpmpp_2m_sde",
    "dpmpp 2m sde": "k_dpmpp_2m_sde",
    "dpm++ sde": "k_dpmpp_sde",
    "dpmpp sde": "k_dpmpp_sde",
    "dpm++ 2s a": "k_dpmpp_2s_ancestral",
    "dpm++ 2s ancestral": "k_dpmpp_2s_ancestral",
    ddim: "ddim_v3",
    "ddim v3": "ddim_v3",
  };
  return aliases[normalized];
}

function schedulerToNai(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.toLowerCase().trim();
  if (normalized.includes("karras")) return "karras";
  if (normalized.includes("exponential")) return "exponential";
  if (normalized === "normal" || normalized === "simple" || normalized === "native") return "native";
  return undefined;
}

function cleanImported(imported: ImportedParams): ImportedParams {
  const out = Object.fromEntries(
    Object.entries(imported).filter(([key, value]) =>
      value !== undefined && (value !== "" || key === "stylePrompt")),
  ) as ImportedParams;
  if (out.seed !== undefined) out.seedMode = out.seed > 0 ? "fixed" : "random";
  return out;
}

/** Map NovelAI metadata to the compatible GenerateParams subset. */
export function parseImportedParams(meta: Record<string, string>): ImportedParams {
  let comment: Record<string, unknown> = {};
  try {
    const decoded = JSON.parse(meta.Comment ?? "{}");
    if (decoded && typeof decoded === "object" && !Array.isArray(decoded)) {
      comment = decoded as Record<string, unknown>;
    }
  } catch {
    comment = {};
  }

  const samplerValues = NAI_SAMPLERS.map((item) => item.value) as string[];
  const v4Prompt = objectValue(comment.v4_prompt);
  const v4PromptCaption = objectValue(v4Prompt?.caption);
  const v4Negative = objectValue(comment.v4_negative_prompt);
  const v4NegativeCaption = objectValue(v4Negative?.caption);
  const prompt = nonEmpty(v4PromptCaption?.base_caption) ?? meta.Description ?? nonEmpty(comment.prompt);
  const negativePrompt = nonEmpty(v4NegativeCaption?.base_caption) ?? nonEmpty(comment.uc);
  const modelCandidate =
    (typeof comment.model === "string" ? comment.model : undefined) ?? meta.Source;
  const isNovelAi = /novelai/i.test(`${meta.Software ?? ""} ${meta.Source ?? ""}`) || Boolean(v4Prompt);

  return cleanImported({
    positivePrompt: nonEmpty(prompt),
    negativePrompt,
    // NovelAI embeds the already-expanded effective prompts. Restoring them
    // while retaining local style/quality/UC presets would append text twice.
    stylePrompt: isNovelAi ? "" : undefined,
    steps: finiteInteger(comment.steps),
    cfgScale: finiteNumber(comment.scale),
    cfgRescale: finiteNumber(comment.cfg_rescale),
    seed: finiteInteger(comment.seed),
    width: finiteInteger(comment.width),
    height: finiteInteger(comment.height),
    sampler:
      typeof comment.sampler === "string" && samplerValues.includes(comment.sampler)
        ? (comment.sampler as NAISampler)
        : samplerToNai(comment.sampler),
    noiseSchedule: nonEmpty(comment.noise_schedule),
    smea: typeof comment.sm === "boolean" ? comment.sm : undefined,
    smeaDyn: typeof comment.sm_dyn === "boolean" ? comment.sm_dyn : undefined,
    model: modelToNai(modelCandidate),
    ucPreset: isNovelAi ? 3 : undefined,
    qualityToggle: isNovelAi ? false : undefined,
    variety: isNovelAi ? comment.skip_cfg_above_sigma === 58 : undefined,
  });
}

export interface StableDiffusionInfo {
  prompt?: string;
  negativePrompt?: string;
  parameters: Record<string, string>;
}

export function parseStableDiffusionParameters(text: string): StableDiffusionInfo {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  const markerMatches = [...normalized.matchAll(/(?:^|\n)Steps:\s*/g)];
  if (!markerMatches.length) return { parameters: {} };
  const marker = markerMatches[markerMatches.length - 1];
  const markerStart = marker.index ?? 0;
  const parameterStart = markerStart + (marker[0].startsWith("\n") ? 1 : 0);
  const promptBlock = normalized.slice(0, markerStart).trim();
  const parameterText = normalized.slice(parameterStart).trim();

  const negativeMarker = "\nNegative prompt:";
  const negativeAt = promptBlock.lastIndexOf(negativeMarker);
  const prompt = (negativeAt >= 0 ? promptBlock.slice(0, negativeAt) : promptBlock).trim();
  const negativePrompt =
    negativeAt >= 0 ? promptBlock.slice(negativeAt + negativeMarker.length).trim() : undefined;

  const parameters: Record<string, string> = {};
  const keyPattern = /(?:^|,\s)([A-Za-z][A-Za-z0-9 +_./()%-]*?):\s/g;
  const matches = [...parameterText.matchAll(keyPattern)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const key = match[1].trim();
    const valueStart = (match.index ?? 0) + match[0].length;
    const valueEnd = index + 1 < matches.length ? (matches[index + 1].index ?? parameterText.length) : parameterText.length;
    parameters[key] = parameterText.slice(valueStart, valueEnd).replace(/,\s*$/, "").trim();
  }
  return {
    prompt: nonEmpty(prompt),
    negativePrompt: nonEmpty(negativePrompt),
    parameters,
  };
}

function importedFromStableDiffusion(info: StableDiffusionInfo): ImportedParams {
  const p = info.parameters;
  const size = p.Size?.match(/(\d+)\s*[x×]\s*(\d+)/i);
  const scheduler = p.Scheduler ?? p["Schedule type"];
  return cleanImported({
    positivePrompt: info.prompt,
    negativePrompt: info.negativePrompt,
    steps: finiteInteger(p.Steps),
    cfgScale: finiteNumber(p["CFG scale"] ?? p.CFG),
    seed: finiteInteger(p.Seed),
    width: size ? Number(size[1]) : finiteInteger(p.Width),
    height: size ? Number(size[2]) : finiteInteger(p.Height),
    sampler: samplerToNai(p.Sampler),
    noiseSchedule: schedulerToNai(scheduler),
  });
}

type ComfyNode = { class_type?: string; inputs?: Record<string, unknown>; _meta?: Record<string, unknown> };
type ComfyPrompt = Record<string, ComfyNode>;
type ComfyWorkflowNode = {
  id?: string | number;
  type?: string;
  mode?: number;
  inputs?: { name?: string; label?: string; link?: number | null; widget?: unknown }[];
  outputs?: { links?: number[] | null }[];
  widgets_values?: unknown[];
};

function parseJsonObject(value: string | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const decoded = JSON.parse(value);
    return decoded && typeof decoded === "object" && !Array.isArray(decoded)
      ? (decoded as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseJsonValue(value: string | undefined): unknown {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

const COMFY_WIDGET_KEYS: Record<string, string[]> = {
  KSampler: ["Seed", "Seed mode", "Steps", "CFG scale", "Sampler", "Scheduler", "Denoise"],
  KSamplerAdvanced: ["Add noise", "Noise seed", "Seed mode", "Steps", "CFG scale", "Sampler", "Scheduler", "Start step", "End step", "Return with leftover noise"],
  CheckpointLoaderSimple: ["Model"],
  CheckpointLoader: ["Model", "Config"],
  UNETLoader: ["Model", "Weight dtype"],
  VAELoader: ["VAE"],
  CLIPLoader: ["CLIP model", "CLIP type", "Device"],
  DualCLIPLoader: ["CLIP model 1", "CLIP model 2", "CLIP type", "Device"],
  CLIPTextEncode: ["Prompt"],
  EmptyLatentImage: ["Width", "Height", "Batch size"],
  EmptySD3LatentImage: ["Width", "Height", "Batch size"],
  LatentUpscaleBy: ["Upscale method", "Upscale scale"],
  LatentUpscale: ["Upscale method", "Width", "Height", "Crop"],
  LoraLoader: ["LoRA", "LoRA model strength", "LoRA CLIP strength"],
  LoraLoaderModelOnly: ["LoRA", "LoRA model strength"],
  ControlNetLoader: ["ControlNet model"],
  LoadImage: ["Input image", "Upload mode"],
  SaveImage: ["Filename prefix"],
  PreviewImage: [],
  FluxGuidance: ["Guidance"],
  CFGGuider: ["CFG scale"],
  BasicScheduler: ["Scheduler", "Steps", "Denoise"],
  RandomNoise: ["Seed", "Seed mode"],
};

function comfyWorkflowNodes(raw: unknown): ComfyWorkflowNode[] {
  const source = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).nodes)
      ? (raw as Record<string, unknown>).nodes as unknown[]
      : [];
  return source.filter((node): node is ComfyWorkflowNode => Boolean(node && typeof node === "object"));
}

function comfyWorkflowEntries(value: string | undefined): {
  entries: ImageMetadataEntry[];
  imported: ImportedParams;
} {
  const nodes = comfyWorkflowNodes(parseJsonValue(value));
  const entries: ImageMetadataEntry[] = [];
  let imported: ImportedParams = {};
  const add = (key: string, raw: unknown, type: string, id: unknown) => {
    if (raw === undefined || raw === null || raw === "") return;
    const valueText = typeof raw === "string" ? raw : stringifyValue(raw);
    const group = /model|vae|clip|lora|controlnet|dtype|config/i.test(key)
      ? "model" as const
      : /width|height|size|upscale|crop|image/i.test(key)
        ? "image" as const
        : "generation" as const;
    entries.push({ key, value: nodes.length > 1 ? `[${type} #${String(id ?? "?")}] ${valueText}` : valueText, group });
  };
  for (const node of nodes) {
    if (node.mode === 4) continue;
    const type = node.type ?? "ComfyUI node";
    const widgets = Array.isArray(node.widgets_values) ? node.widgets_values : [];
    const knownKeys = COMFY_WIDGET_KEYS[type];
    if (knownKeys) {
      knownKeys.forEach((key, index) => add(key, widgets[index], type, node.id));
    } else {
      let widgetIndex = 0;
      for (const input of node.inputs ?? []) {
        if (!input.widget || input.link !== null && input.link !== undefined) continue;
        add(`${type} · ${input.label || input.name || `Value ${widgetIndex + 1}`}`, widgets[widgetIndex], type, node.id);
        widgetIndex += 1;
      }
    }
    if (/^KSampler$/i.test(type)) {
      imported = cleanImported({
        ...imported,
        seed: finiteInteger(widgets[0]),
        steps: finiteInteger(widgets[2]),
        cfgScale: finiteNumber(widgets[3]),
        sampler: samplerToNai(nonEmpty(widgets[4])),
        noiseSchedule: schedulerToNai(nonEmpty(widgets[5])),
      });
    } else if (/Empty(?:SD3)?LatentImage/i.test(type)) {
      imported = cleanImported({ ...imported, width: finiteInteger(widgets[0]), height: finiteInteger(widgets[1]) });
    } else if (/CLIPTextEncode/i.test(type) && !imported.positivePrompt) {
      imported = cleanImported({ ...imported, positivePrompt: nonEmpty(widgets[0]) });
    }
  }
  const unique = new Map(entries.map((entry) => [`${entry.key}\0${entry.value}`, entry]));
  return { entries: [...unique.values()], imported };
}

function comfyReferenceId(value: unknown): string | undefined {
  return Array.isArray(value) && value.length > 0 && (typeof value[0] === "string" || typeof value[0] === "number")
    ? String(value[0])
    : undefined;
}

function findComfyUpstream(
  prompt: ComfyPrompt,
  start: unknown,
  predicate: (node: ComfyNode) => boolean,
): ComfyNode | undefined {
  const queue = [comfyReferenceId(start)].filter(Boolean) as string[];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = prompt[id];
    if (!node) continue;
    if (predicate(node)) return node;
    for (const value of Object.values(node.inputs ?? {})) {
      const next = comfyReferenceId(value);
      if (next) queue.push(next);
    }
  }
  return undefined;
}

function comfyText(prompt: ComfyPrompt, reference: unknown): string | undefined {
  const node = findComfyUpstream(
    prompt,
    reference,
    (candidate) =>
      /CLIPTextEncode/i.test(candidate.class_type ?? "") ||
      typeof candidate.inputs?.text === "string",
  );
  return nonEmpty(node?.inputs?.text);
}

function inspectComfy(meta: Record<string, string>): {
  imported: ImportedParams;
  entries: ImageMetadataEntry[];
  warnings: string[];
} {
  const workflow = comfyWorkflowEntries(meta.workflow);
  const promptObject = parseJsonObject(meta.prompt);
  if (!promptObject) {
    return {
      imported: workflow.imported,
      entries: workflow.entries,
      warnings: ["ComfyUI prompt JSON is missing or malformed; the raw workflow is still available."],
    };
  }
  const prompt = promptObject as ComfyPrompt;
  const outputNodes = Object.entries(prompt)
    .filter(([, node]) => /SaveImage|PreviewImage/i.test(node.class_type ?? ""))
    .map(([id]) => id);
  let sampler: ComfyNode | undefined;
  for (const id of outputNodes) {
    sampler = findComfyUpstream(
      prompt,
      [id, 0],
      (node) => /KSampler/i.test(node.class_type ?? ""),
    );
    if (sampler) break;
  }
  sampler ??= Object.values(prompt).find((node) => /KSampler/i.test(node.class_type ?? ""));
  if (!sampler) {
    return {
      imported: workflow.imported,
      entries: workflow.entries,
      warnings: ["No compatible ComfyUI KSampler node was found; view the raw workflow for all node data."],
    };
  }

  const inputs = sampler.inputs ?? {};
  const latent = findComfyUpstream(
    prompt,
    inputs.latent_image,
    (node) => finiteInteger(node.inputs?.width) !== undefined && finiteInteger(node.inputs?.height) !== undefined,
  );
  const checkpoint = findComfyUpstream(
    prompt,
    inputs.model,
    (node) => typeof node.inputs?.ckpt_name === "string" || /CheckpointLoader/i.test(node.class_type ?? ""),
  );
  const positive = comfyText(prompt, inputs.positive);
  const negative = comfyText(prompt, inputs.negative);
  const modelName = nonEmpty(checkpoint?.inputs?.ckpt_name);
  const scheduler = nonEmpty(inputs.scheduler);
  const samplerName = nonEmpty(inputs.sampler_name);
  const entries: ImageMetadataEntry[] = [
    positive ? { key: "Positive prompt", value: positive, group: "generation" } : null,
    negative ? { key: "Negative prompt", value: negative, group: "generation" } : null,
    finiteInteger(inputs.seed) !== undefined
      ? { key: "Seed", value: String(finiteInteger(inputs.seed)), group: "generation" }
      : null,
    finiteInteger(inputs.steps) !== undefined
      ? { key: "Steps", value: String(finiteInteger(inputs.steps)), group: "generation" }
      : null,
    finiteNumber(inputs.cfg) !== undefined
      ? { key: "CFG scale", value: String(finiteNumber(inputs.cfg)), group: "generation" }
      : null,
    samplerName ? { key: "Sampler", value: samplerName, group: "generation" } : null,
    scheduler ? { key: "Scheduler", value: scheduler, group: "generation" } : null,
    finiteNumber(inputs.denoise) !== undefined
      ? { key: "Denoise", value: String(finiteNumber(inputs.denoise)), group: "generation" }
      : null,
    finiteInteger(latent?.inputs?.width) !== undefined
      ? { key: "Width", value: String(finiteInteger(latent?.inputs?.width)), group: "image" }
      : null,
    finiteInteger(latent?.inputs?.height) !== undefined
      ? { key: "Height", value: String(finiteInteger(latent?.inputs?.height)), group: "image" }
      : null,
    modelName ? { key: "Model", value: modelName, group: "model" } : null,
  ].filter(Boolean) as ImageMetadataEntry[];

  const promptImported = cleanImported({
      positivePrompt: positive,
      negativePrompt: negative,
      steps: finiteInteger(inputs.steps),
      cfgScale: finiteNumber(inputs.cfg),
      seed: finiteInteger(inputs.seed),
      width: finiteInteger(latent?.inputs?.width),
      height: finiteInteger(latent?.inputs?.height),
      sampler: samplerToNai(samplerName),
      noiseSchedule: schedulerToNai(scheduler),
    });
  const allEntries = [...entries, ...workflow.entries];
  return {
    imported: cleanImported({ ...workflow.imported, ...promptImported }),
    entries: [...new Map(allEntries.map((entry) => [`${entry.key}\0${entry.value}`, entry])).values()],
    warnings: [],
  };
}

function stringifyValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null) return "null";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function rawTextFor(meta: Record<string, string>) {
  return Object.entries(meta)
    .map(([key, value]) => key + "\n" + value)
    .join("\n\n");
}

/** Detect the generator, list every available field, and build a safe NAI patch. */
export function inspectImageMetadata(meta: Record<string, string>): ImageMetadataReport {
  const lower = Object.fromEntries(Object.entries(meta).map(([key, value]) => [key.toLowerCase(), value]));
  const software = meta.Software ?? meta.software ?? "";
  const warnings: string[] = [];

  if (lower.parameters && /(?:^|\n)Steps:\s*\d+/m.test(lower.parameters)) {
    const sd = parseStableDiffusionParameters(lower.parameters);
    const entries: ImageMetadataEntry[] = [
      sd.prompt ? { key: "Positive prompt", value: sd.prompt, group: "generation" } : null,
      sd.negativePrompt ? { key: "Negative prompt", value: sd.negativePrompt, group: "generation" } : null,
      ...Object.entries(sd.parameters).map(([key, value]) => ({
        key,
        value,
        group: /model|vae|lora|checkpoint/i.test(key)
          ? ("model" as const)
          : /size|width|height/i.test(key)
            ? ("image" as const)
            : ("generation" as const),
      })),
    ].filter(Boolean) as ImageMetadataEntry[];
    const imported = importedFromStableDiffusion(sd);
    if (sd.parameters.Sampler && !imported.sampler) {
      warnings.push("Sampler “" + sd.parameters.Sampler + "” is not available in NovelAI and will remain view-only.");
    }
    if (sd.parameters.Model || sd.parameters["Model hash"]) {
      warnings.push("Stable Diffusion checkpoints cannot be selected in NovelAI; model fields are view-only.");
    }
    return {
      kind: "stable-diffusion",
      software: software || "Stable Diffusion WebUI",
      imported,
      characterCaptions: [],
      entries,
      rawMetadata: meta,
      rawText: lower.parameters,
      warnings,
    };
  }

  if (lower.prompt || lower.workflow) {
    const comfy = inspectComfy({
      ...meta,
      prompt: lower.prompt ?? "",
      workflow: lower.workflow ?? "",
    });
    return {
      kind: "comfyui",
      software: software || "ComfyUI",
      imported: comfy.imported,
      characterCaptions: [],
      entries: comfy.entries,
      rawMetadata: meta,
      rawText: rawTextFor(meta),
      warnings: comfy.warnings,
    };
  }

  let comment: Record<string, unknown> = {};
  try {
    const decoded = JSON.parse(meta.Comment ?? meta.comment ?? "{}");
    if (decoded && typeof decoded === "object" && !Array.isArray(decoded)) {
      comment = decoded as Record<string, unknown>;
    }
  } catch {
    if (meta.Comment || meta.comment) warnings.push("NovelAI Comment JSON is malformed.");
  }
  const looksNovelAi =
    /novelai/i.test(software) ||
    Boolean(meta.Description ?? meta.description) ||
    Boolean(meta.Comment ?? meta.comment) ||
    /stable diffusion (?:xl|nai)/i.test(meta.Source ?? meta.source ?? "");
  if (looksNovelAi) {
    const description = meta.Description ?? meta.description;
    const source = meta.Source ?? meta.source;
    const entries: ImageMetadataEntry[] = [
      description ? { key: "Description", value: description, group: "generation" } : null,
      source ? { key: "Source", value: source, group: "model" } : null,
      ...Object.entries(comment).map(([key, value]) => ({
        key,
        value: stringifyValue(value),
        group: /model|source|lora|reference/i.test(key)
          ? ("model" as const)
          : /width|height/i.test(key)
            ? ("image" as const)
            : ("generation" as const),
      })),
    ].filter(Boolean) as ImageMetadataEntry[];
    return {
      kind: "novelai",
      software: software || "NovelAI",
      imported: parseImportedParams({
        ...meta,
        Description: description ?? "",
        Comment: meta.Comment ?? meta.comment ?? "{}",
        Source: source ?? "",
      }),
      characterCaptions: parseNovelAICharCaptions({
        ...meta,
        Comment: meta.Comment ?? meta.comment ?? "{}",
      }),
      entries,
      rawMetadata: meta,
      rawText: rawTextFor(meta),
      warnings,
    };
  }

  return {
    kind: "unknown",
    software: software || "Unknown",
    imported: {},
    characterCaptions: [],
    entries: Object.entries(meta).map(([key, value]) => ({ key, value, group: "raw" })),
    rawMetadata: meta,
    rawText: rawTextFor(meta),
    warnings: Object.keys(meta).length
      ? ["Embedded metadata was found, but its generator format is not recognized."]
      : ["No supported embedded generation metadata was found."],
  };
}
