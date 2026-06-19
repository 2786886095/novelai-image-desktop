import { dialog, nativeImage } from "electron";
import axios from "axios";
import JSZip from "jszip";
import { PNG } from "pngjs";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import {
  DEFAULT_PARAMS,
  MAX_NAI_DIRECTOR_INPUT_PIXELS,
  MAX_NAI_UPSCALE_INPUT_PIXELS,
  type AccountSummary,
  type AnlasQuoteRequest,
  type AnlasQuoteResult,
  type AiCallLogEntry,
  type AugmentOptions,
  type AiModelListResult,
  type ComicAnalyzeRequest,
  type ComicAnalyzeResult,
  type ComicConsistencyRequest,
  type ComicConsistencyResult,
  type ComicConvertRequest,
  type ComicConvertResult,
  type ComicDesiredPanelCount,
  type ComicGeneratePanelRequest,
  type ComicProject,
  type ComicReferenceAsset,
  type DirectorTool,
  type GenerateExtras,
  type GenerateParams,
  type GenerateResult,
  type HistoryItem,
  type I2IParams,
  type LoadImageResult,
  type NAIInpaintModel,
  type NAIModel,
  type ReversePromptScope,
  type SingleImageResult,
  type TagSuggestion,
  type TokenStatus,
  type UpscaleScale,
  type WorkingImage,
} from "../../src/types";
import { calculateFeatureAnlasQuote } from "../../src/anlas";
import {
  addHistory,
  getAccountSummary,
  getSettings,
  getToken,
  setAccountSummary,
  setToken,
  updateHistoryItem,
} from "./store";
import { TAG_DICTIONARY } from "../data/tag-dictionary";
import { mcpSearch } from "./mcp-client";
import { zhForTag } from "../../src/prompt-data";
import { proxyConfig } from "./proxy";
import {
  COMIC_ANALYZE_SYSTEM_PROMPT,
  CONVERT_SYSTEM_PROMPTS,
  SCOPED_REVERSE_SYSTEM_PROMPTS,
} from "../../src/data/prompt-templates";
import {
  buildConvertUserText,
  buildModeRepairUserText,
  cleanPromptOutput,
  knownCharacterRuntimeInstruction,
  modeNeedsRepair,
  modeUserInstruction,
  modeRepairSystemPrompt,
  parsePromptVariantResponse,
  resolveModePrompt,
} from "../../src/prompt-mode";

let currentAbort: AbortController | null = null;
let workbenchImagePath: string | null = null;

function normalizeBaseUrl(url: string, fallback: string) {
  const value = (url || fallback).trim().replace(/\/+$/, "");
  return value.length > 0 ? value : fallback;
}

function tierName(tier?: number) {
  return tier === 3 ? "Opus" : tier === 2 ? "Scroll" : tier === 1 ? "Tablet" : tier === 0 ? "Paper" : "未知";
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return undefined;
}

function parseAccount(data: any): Omit<AccountSummary, "hasToken"> {
  const sub = data?.subscription ?? data?.data?.subscription ?? {};
  const tierLevel = readNumber(sub?.tier);
  const active = typeof sub?.active === "boolean" ? sub.active : true;
  let anlasBalance: number | undefined;

  if (typeof sub?.trainingStepsLeft === "object" && sub.trainingStepsLeft) {
    anlasBalance =
      (readNumber(sub.trainingStepsLeft.fixedTrainingStepsLeft) ?? 0) +
      (readNumber(sub.trainingStepsLeft.purchasedTrainingSteps) ?? 0);
  } else {
    anlasBalance = readNumber(sub?.trainingStepsLeft);
  }

  let expiresAt: string | undefined;
  const rawExpires = readNumber(sub?.expiresAt);
  if (rawExpires) {
    const seconds = rawExpires > 10_000_000_000 ? Math.floor(rawExpires / 1000) : rawExpires;
    expiresAt = new Date(seconds * 1000).toISOString().slice(0, 10);
  }

  return {
    tierName: tierName(tierLevel),
    tierLevel,
    anlasBalance,
    expiresAt,
    hasActiveSubscription: Boolean(active && tierLevel && tierLevel > 0),
  };
}

async function fetchAccount(token: string): Promise<Omit<AccountSummary, "hasToken">> {
  const settings = getSettings();
  const apiBaseUrl = normalizeBaseUrl(settings.apiBaseUrl, "https://api.novelai.net");
  const res = await axios.get(`${apiBaseUrl}/user/data`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15_000,
    ...proxyConfig("nai"),
  });
  return parseAccount(res.data);
}

export async function verifyToken(token: string): Promise<TokenStatus> {
  const normalized = token.trim();
  if (!normalized) {
    return { valid: false, message: "请输入 NovelAI Persistent API Token。" };
  }

  try {
    const settings = getSettings();
    const apiBaseUrl = normalizeBaseUrl(settings.apiBaseUrl, "https://api.novelai.net");
    await axios.get(`${apiBaseUrl}/user/information`, {
      headers: { Authorization: `Bearer ${normalized}` },
      timeout: 15_000,
      ...proxyConfig("nai"),
    });

    let account: Omit<AccountSummary, "hasToken"> = {};
    try {
      account = await fetchAccount(normalized);
    } catch {
      account = { tierName: "已验证", hasActiveSubscription: true };
    }

    setToken(normalized);
    setAccountSummary(account);
    return { valid: true, message: "API Token 验证成功。", ...account };
  } catch (error: any) {
    const status = error?.response?.status;
    const text = responseErrorText(error);
    return {
      valid: false,
      message: status === 401 ? "Token 无效或已过期。" : `Token 验证失败：${text || "网络错误"}`,
    };
  }
}

export async function refreshStoredAccount(): Promise<AccountSummary> {
  const token = getToken();
  if (!token) return { hasToken: false };

  try {
    const account = await fetchAccount(token);
    setAccountSummary(account);
    return { hasToken: true, ...account };
  } catch {
    return getAccountSummary();
  }
}

function isV4Plus(model: string) {
  return model.includes("-4");
}

function isV45(model: string) {
  return model.includes("4-5");
}

function normalizeModel(model: string) {
  return model.endsWith("-inpainting") ? model.slice(0, -"-inpainting".length) : model;
}

function inpaintSizeHint(image: Pick<WorkingImage, "width" | "height">) {
  const width = image.width || 0;
  const height = image.height || 0;
  if (!width || !height) return "无法读取原图尺寸，请重新加载原图后再试。";
  if (width % 64 === 0 && height % 64 === 0) return "";
  return `当前原图尺寸为 ${width}×${height}，不是 64 的整数倍；NovelAI 重绘接口对非 64 倍数尺寸经常返回 HTTP 500。请先换用 64 倍数尺寸的原图，例如宽高都能被 64 整除。`;
}

function inpaintModelCandidates(model: NAIInpaintModel) {
  const candidates = [model];
  if (model === "nai-diffusion-4-5-curated-inpainting") {
    candidates.push("nai-diffusion-4-5-full-inpainting");
  } else if (model === "nai-diffusion-4-curated-inpainting") {
    candidates.push("nai-diffusion-4-full-inpainting");
  }
  return [...new Set(candidates)];
}

function qualityTags(model: string) {
  switch (normalizeModel(model)) {
    case "nai-diffusion-4-5-full":
      return "very aesthetic, masterpiece, no text";
    case "nai-diffusion-4-5-curated":
      return "masterpiece, no text, -0.8::feet::, rating:general";
    case "nai-diffusion-4-full":
      return "no text, best quality, very aesthetic, absurdres";
    case "nai-diffusion-4-curated":
      return "rating:general, amazing quality, very aesthetic, absurdres";
    case "nai-diffusion-3":
      return "best quality, amazing quality, very aesthetic, absurdres";
    default:
      return "";
  }
}

function ucPresetText(model: string, preset: number) {
  if (preset === 3) return "";
  const key = normalizeModel(model);
  if (preset === 2) return "";
  if (key === "nai-diffusion-4-5-full") {
    return preset === 0
      ? "lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page"
      : "lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, multiple views, very displeasing, too many watermarks, negative space, blank page";
  }
  if (key === "nai-diffusion-4-5-curated") {
    return preset === 0
      ? "blurry, lowres, upscaled, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, negative space, blank page"
      : "blurry, lowres, upscaled, artistic error, scan artifacts, jpeg artifacts, logo, too many watermarks, negative space, blank page";
  }
  if (key === "nai-diffusion-4-full") {
    return preset === 0
      ? "blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, multiple views, logo, too many watermarks"
      : "blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing";
  }
  if (key === "nai-diffusion-4-curated") {
    return preset === 0
      ? "blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, logo, dated, signature, multiple views, gigantic breasts"
      : "blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing, logo, dated, signature";
  }
  if (key === "nai-diffusion-3") {
    return preset === 0
      ? "lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract]"
      : "lowres, jpeg artifacts, worst quality, watermark, blurry, very displeasing";
  }
  return "";
}

function mergePrompt(...segments: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const segment of segments) {
    for (const part of segment.split(",").map((x) => x.trim()).filter(Boolean)) {
      const key = part.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(part);
      }
    }
  }
  return result.join(", ");
}

type CharCaptionMode = "structured" | "pipe";

function finiteClamped(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

function normalizedCharCaptions(extras?: GenerateExtras) {
  return (extras?.charCaptions ?? [])
    .map((c) => ({
      prompt: c.prompt.trim(),
      useCoords: Boolean(c.useCoords),
      x: finiteClamped(Number(c.x), 0.5),
      y: finiteClamped(Number(c.y), 0.5),
    }))
    .filter((c) => c.prompt.length > 0)
    .slice(0, 6);
}

function hasCharCaptions(extras?: GenerateExtras) {
  return normalizedCharCaptions(extras).length > 0;
}

function shouldRetryCharCaptionsAsPipe(error: any, params: GenerateParams, extras?: GenerateExtras) {
  const status = error?.response?.status;
  return isV4Plus(params.model) && hasCharCaptions(extras) && (status === 400 || status === 422);
}

function withPipeCharCaptions(basePrompt: string, captions: ReturnType<typeof normalizedCharCaptions>) {
  if (captions.length === 0) return basePrompt;
  return [basePrompt, ...captions.map((c) => c.prompt)].filter(Boolean).join(" | ");
}

type PayloadParams = Omit<GenerateParams, "model"> & { model: string };

function buildPayload(
  params: PayloadParams,
  actualSeed: number,
  extras?: GenerateExtras,
  charCaptionMode: CharCaptionMode = "structured",
) {
  const basePrompt = mergePrompt(params.stylePrompt, params.positivePrompt);
  const effectivePrompt = params.qualityToggle
    ? mergePrompt(basePrompt, qualityTags(params.model))
    : basePrompt;
  const effectiveNegative = mergePrompt(params.negativePrompt, ucPresetText(params.model, params.ucPreset));
  const v4Plus = isV4Plus(params.model);
  const cleanedCharCaptions = normalizedCharCaptions(extras);
  const inputPrompt = charCaptionMode === "pipe" ? withPipeCharCaptions(effectivePrompt, cleanedCharCaptions) : effectivePrompt;

  const parameters: Record<string, unknown> = {
    params_version: 3,
    width: params.width,
    height: params.height,
    scale: params.cfgScale,
    sampler: params.sampler,
    steps: params.steps,
    n_samples: 1,
    seed: actualSeed,
    noise_schedule: params.noiseSchedule || "native",
    uc: effectiveNegative,
    negative_prompt: effectiveNegative,
    ucPreset: params.ucPreset,
    uc_preset: params.ucPreset,
    cfg_rescale: params.cfgRescale,
    legacy: false,
    legacy_v3_extend: false,
    dynamic_thresholding: params.cfgRescale > 0,
    skip_cfg_above_sigma: null,
    qualityToggle: params.qualityToggle,
    quality_toggle: params.qualityToggle,
  };

  if (params.variety) parameters.variety = true;

  if (params.sampler === "k_euler_ancestral" && params.noiseSchedule !== "native") {
    parameters.deliberate_euler_ancestral_bug = false;
    parameters.prefer_brownian = true;
  }

  if (v4Plus) {
    const charCaptionsPayload = cleanedCharCaptions.map((c) => ({
      char_caption: c.prompt,
      centers: c.useCoords ? [{ x: c.x, y: c.y }] : [],
    }));
    const useStructuredChars = charCaptionMode === "structured";
    const useCoords = useStructuredChars && charCaptionsPayload.some((c) => c.centers.length > 0);

    parameters.use_coords = useCoords;
    parameters.v4_prompt = {
      caption: {
        base_caption: charCaptionMode === "pipe" ? inputPrompt : effectivePrompt,
        char_captions: useStructuredChars ? charCaptionsPayload : [],
      },
      use_coords: useCoords,
      use_order: true,
    };
    parameters.v4_negative_prompt = {
      caption: { base_caption: effectiveNegative, char_captions: [] },
      use_coords: false,
      use_order: false,
      legacy_uc: !isV45(params.model),
    };
  } else {
    parameters.sm = params.smea;
    parameters.sm_dyn = params.smea && params.smeaDyn;
  }

  // Vibe Transfer / Precise Reference
  if (extras?.vibeImages && extras.vibeImages.length > 0) {
    parameters.reference_image_multiple = extras.vibeImages.map((v) => v.base64);
    parameters.reference_information_extracted_multiple = extras.vibeImages.map((v) => v.infoExtracted);
    parameters.reference_strength_multiple = extras.vibeImages.map((v) => v.strength);
  }

  return {
    input: inputPrompt,
    model: params.model,
    action: "generate",
    parameters,
  };
}

/**
 * V4/V4.5 Vibe Transfer requires reference images to be pre-encoded through the
 * /ai/encode-vibe endpoint (legacy V3 accepted raw image bytes directly). For
 * V4+ models we encode each vibe; if the endpoint is unavailable we fall back to
 * the raw base64 so behavior never regresses versus the previous version.
 *
 * NOTE: needs verification against a live V4.5 token — the encode-vibe payload
 * shape is based on the NovelAI web client and may need adjustment.
 */
async function prepareExtras(params: GenerateParams, extras?: GenerateExtras): Promise<GenerateExtras | undefined> {
  if (!extras || !extras.vibeImages || extras.vibeImages.length === 0) return extras;
  if (!isV4Plus(params.model)) return extras; // V3 path unchanged

  const token = getToken();
  const settings = getSettings();
  const imageBaseUrl = normalizeBaseUrl(settings.imageBaseUrl, "https://image.novelai.net");

  const encoded = await Promise.all(
    extras.vibeImages.map(async (vibe) => {
      try {
        const res = await requestWithRetry(
          () =>
            axios.post(
              `${imageBaseUrl}/ai/encode-vibe`,
              {
                image: stripBase64Prefix(vibe.base64),
                information_extracted: vibe.infoExtracted,
                model: params.model,
              },
              {
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                responseType: "arraybuffer",
                timeout: 60_000,
                signal: currentAbort?.signal,
                ...proxyConfig("nai"),
              },
            ),
          { retries: 2, signal: currentAbort?.signal ?? undefined },
        );
        return { ...vibe, base64: Buffer.from(res.data).toString("base64") };
      } catch (error: any) {
        if (currentAbort?.signal.aborted) throw error;
        if (getSettings().debugLogs) {
          console.warn("[vibe] encode-vibe failed, falling back to raw image:", responseErrorText(error));
        }
        return vibe; // fallback: raw base64
      }
    }),
  );

  return { ...extras, vibeImages: encoded };
}

async function extractImages(zipBytes: ArrayBuffer | Buffer): Promise<Buffer[]> {
  const zip = await JSZip.loadAsync(zipBytes);
  const images: Buffer[] = [];
  const files = Object.values(zip.files).filter((file) => !file.dir);
  for (const file of files) {
    const bytes = await file.async("nodebuffer");
    if (bytes.length > 0) images.push(bytes);
  }
  return images;
}

function dateStamp(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function detectExt(buffer: Buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF") return "webp";
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "jpg";
  return "png";
}

function responseErrorText(error: any) {
  const data = error?.response?.data;
  if (!data) return error?.message ?? "";
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

function stripBase64Prefix(value: string) {
  const idx = value.indexOf(",");
  return idx >= 0 ? value.slice(idx + 1) : value;
}

const INPAINT_SIZE_MULTIPLE = 64;

interface PreparedInpaintAssets {
  imageBase64: string;
  maskBase64: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  padded: boolean;
}

interface PreparedLimitedImage {
  base64: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  resized: boolean;
}

function ceilToMultiple(value: number, multiple: number) {
  return Math.max(multiple, Math.ceil(value / multiple) * multiple);
}

function fitWithinPixels(width: number, height: number, maxPixels: number) {
  const pixels = width * height;
  if (!width || !height || pixels <= maxPixels) return { width, height, resized: false };
  const ratio = Math.sqrt(maxPixels / pixels);
  return {
    width: Math.max(1, Math.floor(width * ratio)),
    height: Math.max(1, Math.floor(height * ratio)),
    resized: true,
  };
}

function bufferToPng(buffer: Buffer) {
  const image = nativeImage.createFromBuffer(buffer);
  if (image.isEmpty()) throw new Error("无法解码原图，请换用 PNG/JPG/WebP 图片。");
  return image.toPNG();
}

function flattenPngAlpha(buffer: Buffer, background = { r: 255, g: 255, b: 255 }) {
  const png = PNG.sync.read(buffer);
  for (let idx = 0; idx < png.data.length; idx += 4) {
    const alpha = png.data[idx + 3] / 255;
    if (alpha >= 1) continue;
    png.data[idx] = Math.round(png.data[idx] * alpha + background.r * (1 - alpha));
    png.data[idx + 1] = Math.round(png.data[idx + 1] * alpha + background.g * (1 - alpha));
    png.data[idx + 2] = Math.round(png.data[idx + 2] * alpha + background.b * (1 - alpha));
    png.data[idx + 3] = 255;
  }
  return PNG.sync.write(png);
}

function prepareLimitedImage(
  buffer: Buffer,
  maxPixels: number,
  options: { flattenAlpha?: boolean; forcePng?: boolean } = {},
): PreparedLimitedImage {
  const source = nativeImage.createFromBuffer(buffer);
  if (source.isEmpty()) throw new Error("无法解码图片，请换用 PNG/JPG/WebP 图片。");
  const size = source.getSize();
  const fitted = fitWithinPixels(size.width, size.height, maxPixels);
  let output = buffer;
  if (fitted.resized) {
    output = source.resize({ width: fitted.width, height: fitted.height, quality: "best" }).toPNG();
  } else if (options.forcePng || options.flattenAlpha) {
    output = source.toPNG();
  }
  if (options.flattenAlpha) output = flattenPngAlpha(output);
  return {
    base64: output.toString("base64"),
    width: fitted.width,
    height: fitted.height,
    originalWidth: size.width,
    originalHeight: size.height,
    resized: fitted.resized,
  };
}

function resizeImageBufferToPng(buffer: Buffer, width: number, height: number) {
  const image = nativeImage.createFromBuffer(buffer);
  if (image.isEmpty()) return buffer;
  return image.resize({ width, height, quality: "best" }).toPNG();
}

function padPngWithEdge(source: PNG, targetWidth: number, targetHeight: number) {
  const target = new PNG({ width: targetWidth, height: targetHeight });
  for (let y = 0; y < targetHeight; y += 1) {
    const sy = Math.min(source.height - 1, y);
    for (let x = 0; x < targetWidth; x += 1) {
      const sx = Math.min(source.width - 1, x);
      const src = (sy * source.width + sx) * 4;
      const dst = (y * targetWidth + x) * 4;
      target.data[dst] = source.data[src];
      target.data[dst + 1] = source.data[src + 1];
      target.data[dst + 2] = source.data[src + 2];
      target.data[dst + 3] = source.data[src + 3];
    }
  }
  return PNG.sync.write(target);
}

function padMaskPng(mask: PNG, targetWidth: number, targetHeight: number) {
  const target = new PNG({ width: targetWidth, height: targetHeight });
  for (let i = 0; i < target.data.length; i += 4) {
    target.data[i] = 0;
    target.data[i + 1] = 0;
    target.data[i + 2] = 0;
    target.data[i + 3] = 255;
  }
  const copyWidth = Math.min(mask.width, targetWidth);
  const copyHeight = Math.min(mask.height, targetHeight);
  for (let y = 0; y < copyHeight; y += 1) {
    const srcStart = y * mask.width * 4;
    const dstStart = y * targetWidth * 4;
    mask.data.copy(target.data, dstStart, srcStart, srcStart + copyWidth * 4);
  }
  return PNG.sync.write(target);
}

function cropPngTopLeft(buffer: Buffer, width: number, height: number) {
  try {
    const source = PNG.sync.read(buffer);
    if (source.width === width && source.height === height) return buffer;
    if (source.width < width || source.height < height) return buffer;
    const target = new PNG({ width, height });
    for (let y = 0; y < height; y += 1) {
      const srcStart = y * source.width * 4;
      const dstStart = y * width * 4;
      source.data.copy(target.data, dstStart, srcStart, srcStart + width * 4);
    }
    return PNG.sync.write(target);
  } catch {
    return buffer;
  }
}

function extractOfficialAnlasPrice(data: unknown): number | undefined {
  if (typeof data === "number" && Number.isFinite(data)) return Math.max(0, Math.ceil(data));
  if (typeof data === "string" && Number.isFinite(Number(data))) return Math.max(0, Math.ceil(Number(data)));
  if (!data || typeof data !== "object") return undefined;
  const record = data as Record<string, unknown>;
  const directKeys = [
    "price",
    "cost",
    "amount",
    "anlas",
    "requestPrice",
    "trainingSteps",
    "trainingStepsCost",
  ];
  for (const key of directKeys) {
    const value = record[key];
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(parsed)) return Math.max(0, Math.ceil(parsed));
  }
  for (const key of ["data", "result", "subscription"]) {
    const nested = extractOfficialAnlasPrice(record[key]);
    if (nested != null) return nested;
  }
  return undefined;
}

async function requestOfficialGenerationPrice(params: GenerateParams) {
  const token = getToken();
  if (!token) return undefined;
  const settings = getSettings();
  const apiBaseUrl = normalizeBaseUrl(settings.apiBaseUrl, "https://api.novelai.net");
  const quoteParams: GenerateParams = {
    ...params,
    stylePrompt: params.stylePrompt || "",
    positivePrompt: params.positivePrompt.trim() || "quote",
    negativePrompt: params.negativePrompt || "",
  };
  const payload = buildPayload(quoteParams, 1, { vibeImages: [], charCaptions: [] });
  try {
    const response = await axios.post(`${apiBaseUrl}/ai/generate-image/request-price`, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: 12_000,
      ...proxyConfig("nai"),
    });
    return extractOfficialAnlasPrice(response.data);
  } catch {
    return undefined;
  }
}

export async function quoteAnlasCost(request: AnlasQuoteRequest): Promise<AnlasQuoteResult> {
  const token = getToken();
  if (!token) {
    return {
      ok: false,
      source: "unavailable",
      message: "请先配置 NovelAI Token，才能读取生成前扣费。",
    };
  }

  const account = request.account?.hasToken ? request.account : await refreshStoredAccount();
  let image: Pick<WorkingImage, "width" | "height"> | null = null;
  if (request.feature === "upscale" || request.feature === "inpaint") {
    try {
      image = (await readWorkbenchImage()).image;
    } catch {
      image = null;
    }
  }

  const calculated = calculateFeatureAnlasQuote({
    feature: request.feature,
    params: request.params,
    extras: request.extras,
    batchCount: request.batchCount,
    i2iParams: request.i2iParams,
    inpaintModel: request.inpaintModel,
    inpaintStrength: request.inpaintStrength,
    account,
    image,
    upscaleScale: request.upscaleScale,
    directorTool: request.directorTool,
  });
  if (!calculated.ok) return calculated;

  const hasVibes = (request.extras?.vibeImages?.length ?? 0) > 0;
  if (request.feature !== "generate" || !request.params || hasVibes) return calculated;

  const officialPerRequest = await requestOfficialGenerationPrice(request.params);
  if (officialPerRequest == null) return calculated;

  const amount = officialPerRequest * Math.max(1, Math.floor(request.batchCount ?? 1));
  const balance = account.anlasBalance;
  return {
    ok: true,
    amount,
    source: "official-api",
    balance,
    insufficient: typeof balance === "number" && amount > balance,
    message: `生成前官方报价：${amount} Anlas。`,
    details: [
      `NovelAI request-price returned ${officialPerRequest} Anlas per request.`,
      request.batchCount && request.batchCount > 1
        ? `The desktop app sends ${Math.floor(request.batchCount)} single-image requests: ${officialPerRequest} x ${Math.floor(request.batchCount)}.`
        : "The desktop app sends one single-image request.",
    ],
  };
}

function prepareInpaintAssets(imageBuffer: Buffer, maskBase64: string): PreparedInpaintAssets {
  const sourcePng = PNG.sync.read(bufferToPng(imageBuffer));
  const originalWidth = sourcePng.width;
  const originalHeight = sourcePng.height;
  const width = ceilToMultiple(originalWidth, INPAINT_SIZE_MULTIPLE);
  const height = ceilToMultiple(originalHeight, INPAINT_SIZE_MULTIPLE);
  const padded = width !== originalWidth || height !== originalHeight;
  if (!padded) {
    return {
      imageBase64: imageBuffer.toString("base64"),
      maskBase64: stripBase64Prefix(maskBase64),
      width,
      height,
      originalWidth,
      originalHeight,
      padded: false,
    };
  }

  const maskPng = PNG.sync.read(Buffer.from(stripBase64Prefix(maskBase64), "base64"));
  return {
    imageBase64: padPngWithEdge(sourcePng, width, height).toString("base64"),
    maskBase64: padMaskPng(maskPng, width, height).toString("base64"),
    width,
    height,
    originalWidth,
    originalHeight,
    padded: true,
  };
}

function cropInpaintBuffers(buffers: Buffer[], assets: PreparedInpaintAssets) {
  if (!assets.padded) return buffers;
  return buffers.map((buffer) => cropPngTopLeft(buffer, assets.originalWidth, assets.originalHeight));
}

function annotateInpaintError(error: any, assets: PreparedInpaintAssets, model: string) {
  if (!assets.padded || error?.response?.status !== 500) return;
  const message =
    `重绘失败（HTTP 500）：程序已自动将原图 ${assets.originalWidth}×${assets.originalHeight} ` +
    `补边到 ${assets.width}×${assets.height} 后发送，但 NovelAI 重绘接口仍返回内部错误。` +
    `请尝试重新加载原图、重画蒙版、缩小重绘区域，或稍后再试。模型：${model}。`;
  if (error.response) error.response.data = message;
  error.langbaiMessage = message;
}

function readImageDimensions(buf: Buffer): { width: number; height: number } {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset < buf.length - 9) {
      if (buf[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buf[offset + 1];
      const len = buf.readUInt16BE(offset + 2);
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || marker === 0xc3) {
        return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
      }
      offset += 2 + len;
    }
  }

  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    const chunk = buf.subarray(12, 16).toString("ascii");
    if (chunk === "VP8 " && buf.length > 29) {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (chunk === "VP8L" && buf.length > 25) {
      const bits = buf.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X" && buf.length > 29) {
      const width = 1 + buf.readUIntLE(24, 3);
      const height = 1 + buf.readUIntLE(27, 3);
      return { width, height };
    }
  }

  return { width: 0, height: 0 };
}

async function readWorkbenchBuffer() {
  if (!workbenchImagePath) throw new Error("请先加载图片。");
  return fs.readFile(workbenchImagePath);
}

async function readWorkbenchBase64() {
  const buf = await readWorkbenchBuffer();
  return buf.toString("base64");
}

async function readWorkbenchImage(): Promise<{ base64: string; buffer: Buffer; image: WorkingImage }> {
  if (!workbenchImagePath) throw new Error("请先加载图片。");
  const buffer = await fs.readFile(workbenchImagePath);
  const dims = readImageDimensions(buffer);
  return {
    base64: buffer.toString("base64"),
    buffer,
    image: {
      filePath: workbenchImagePath,
      fileUrl: pathToFileURL(workbenchImagePath).toString(),
      width: dims.width,
      height: dims.height,
    },
  };
}

/** Render a save filename (without extension) from the user template. */
function buildImageFileName(
  template: string,
  ctx: { date: string; now: Date; seq: number; seed: number; model: string; prefix: string; name?: string },
): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(ctx.now.getHours())}${pad(ctx.now.getMinutes())}${pad(ctx.now.getSeconds())}`;
  const custom = (ctx.name ?? "").trim();
  const tokens: Record<string, string> = {
    date: ctx.date,
    time,
    seq: pad(ctx.seq),
    seed: String(ctx.seed),
    model: ctx.model,
    type: ctx.prefix,
    name: custom,
    ts: String(ctx.now.getTime()),
  };
  let name = (template && template.trim()) || "{date}_{seq}_{model}";
  name = name.replace(/\{(\w+)\}/g, (_m, key: string) => tokens[key] ?? "");
  // If the user typed a custom name but the template has no {name} slot, prepend it
  // so the custom name always takes effect without forcing a template edit.
  if (custom && !/\{name\}/.test(template || "")) {
    const safeCustom = custom.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_");
    name = `${safeCustom}_${name}`;
  }
  name = name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_").slice(0, 100);
  return name || `${ctx.now.getTime()}-${ctx.seq}`;
}

/** Return a non-colliding path, appending -1, -2... if needed. */
async function uniqueFilePath(dir: string, base: string, ext: string): Promise<string> {
  let candidate = path.join(dir, `${base}.${ext}`);
  let n = 1;
  for (;;) {
    try {
      await fs.access(candidate);
      candidate = path.join(dir, `${base}-${n++}.${ext}`);
    } catch {
      return candidate; // does not exist
    }
  }
}

async function saveBuffers(
  buffers: Buffer[],
  params: GenerateParams,
  actualSeed: number,
  prefix: string,
  modelOverride?: string,
): Promise<HistoryItem[]> {
  const settings = getSettings();
  const now = new Date();
  const date = dateStamp(now);
  const dir = path.join(settings.outputDir, date);
  await fs.mkdir(dir, { recursive: true });

  const items: HistoryItem[] = [];
  for (let index = 0; index < buffers.length; index += 1) {
    const id = crypto.randomUUID();
    const ext = detectExt(buffers[index]);
    const safeModel = (modelOverride ?? params.model).replace(/[^\w.-]+/g, "-");
    const base = buildImageFileName(settings.imageNameTemplate, {
      date,
      now,
      seq: index + 1,
      seed: actualSeed,
      model: safeModel,
      prefix,
      name: params.fileNamePrefix,
    });
    const filePath = await uniqueFilePath(dir, base, ext);
    await fs.writeFile(filePath, buffers[index]);
    items.push({
      id,
      filePath,
      fileUrl: pathToFileURL(filePath).toString(),
      date,
      createdAt: now.toISOString(),
      params: { ...params, seed: actualSeed },
      actualSeed,
      model: modelOverride ?? params.model,
      width: params.width,
      height: params.height,
    });
  }
  addHistory(items);
  return items;
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("已取消"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("已取消"));
      },
      { once: true },
    );
  });
}

/**
 * Retry transient NovelAI failures (429 rate-limit, 5xx) with exponential
 * backoff. Honors a `Retry-After` header when present. Never retries on
 * user-cancel or auth/validation errors.
 */
async function requestWithRetry<T>(
  fn: () => Promise<T>,
  { retries = 3, baseDelay = 2_000, signal }: { retries?: number; baseDelay?: number; signal?: AbortSignal } = {},
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error: any) {
      if (signal?.aborted || axios.isCancel?.(error) || error?.code === "ERR_CANCELED") throw error;
      const status = error?.response?.status;
      const retryable = status === 429 || status === 500 || status === 502 || status === 503 || status === 524;
      if (!retryable || attempt >= retries) throw error;

      const retryAfter = Number(error?.response?.headers?.["retry-after"]);
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : baseDelay * 2 ** attempt;
      attempt += 1;
      await sleep(Math.min(wait, 30_000), signal);
    }
  }
}

async function postGenerateImage(payload: ReturnType<typeof buildPayload>) {
  const token = getToken();
  if (!token) throw new Error("请先配置 API Token。");
  const settings = getSettings();
  const imageBaseUrl = normalizeBaseUrl(settings.imageBaseUrl, "https://image.novelai.net");
  const postTo = (baseUrl: string) =>
    requestWithRetry(
      () =>
        axios.post(`${baseUrl}/ai/generate-image`, payload, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/zip, application/octet-stream",
          },
          responseType: "arraybuffer",
          timeout: 180_000,
          signal: currentAbort?.signal,
          ...proxyConfig("nai"),
        }),
      { signal: currentAbort?.signal ?? undefined },
    );
  let res;
  try {
    res = await postTo(imageBaseUrl);
  } catch (error: any) {
    const defaultImageBaseUrl = "https://image.novelai.net";
    if ((error?.response?.status === 401 || error?.response?.status === 403) && imageBaseUrl !== defaultImageBaseUrl) {
      res = await postTo(defaultImageBaseUrl);
    } else {
      if (error?.response?.status === 500 && payload.action === "infill") {
        const width = Number(payload.parameters?.width);
        const height = Number(payload.parameters?.height);
        const sizeHint = inpaintSizeHint({ width, height });
        error.langbaiMessage =
          `重绘失败（HTTP 500）：NovelAI 重绘接口返回内部错误。` +
          (sizeHint || "已自动重试；请尝试切换重绘模型、重新加载原图并重画蒙版，或稍后再试。") +
          ` 模型：${String(payload.model)}。`;
        if (error.response) error.response.data = error.langbaiMessage;
      }
      throw error;
    }
  }
  return extractImages(res.data);
}

export async function loadImageFile(): Promise<LoadImageResult> {
  const result = await dialog.showOpenDialog({
    title: "选择图片",
    filters: [{ name: "图片文件", extensions: ["png", "jpg", "jpeg", "webp"] }],
    properties: ["openFile"],
  });
  if (result.canceled || result.filePaths.length === 0) return { ok: false };

  try {
    const filePath = result.filePaths[0];
    const buffer = await fs.readFile(filePath);
    const dims = readImageDimensions(buffer);
    workbenchImagePath = filePath;
    return {
      ok: true,
      image: {
        filePath,
        fileUrl: pathToFileURL(filePath).toString(),
        width: dims.width,
        height: dims.height,
      },
    };
  } catch (error: any) {
    return { ok: false, message: `加载图片失败：${error?.message ?? "未知错误"}` };
  }
}

export function clearWorkbenchImage() {
  workbenchImagePath = null;
  return { ok: true };
}

// ── AI call log ───────────────────────────────────────────────────────────────
// Ring buffer of every text LLM request the app makes (反推 / 转换 / 拆分镜 /
// 一致性检测 …). Captures the exact system + user content we send and the raw
// response, so the user can inspect what was sent and what came back. Kept in
// the main process and surfaced to the renderer via the `ai:getLog` IPC.
const aiCallLog: AiCallLogEntry[] = [];
const AI_LOG_LIMIT = 200;

function summarizeUserContent(userContent: Array<{ type: string; [k: string]: any }>): string {
  return userContent
    .map((part) => (part.type === "text" ? String(part.text ?? "") : `[${part.type === "image_url" ? "图片" : part.type}]`))
    .join("\n");
}

function recordAiCall(entry: Omit<AiCallLogEntry, "id" | "time">): void {
  aiCallLog.push({ ...entry, id: crypto.randomUUID(), time: Date.now() });
  if (aiCallLog.length > AI_LOG_LIMIT) aiCallLog.shift();
}

export function getAiCallLog(): AiCallLogEntry[] {
  return [...aiCallLog].reverse();
}

export function clearAiCallLog(): { ok: boolean } {
  aiCallLog.length = 0;
  return { ok: true };
}

async function callVisionApi(
  systemPrompt: string,
  userContent: Array<{ type: string; [k: string]: any }>,
  maxTokens = 800,
  label = "AI 反推",
): Promise<{ ok: boolean; content?: string; message: string }> {
  const settings = getSettings();
  const { visionApiUrl, visionApiKey, visionApiModel } = settings;

  if (!visionApiKey.trim()) return { ok: false, message: "请先在 设置 › AI 反推 中填写视觉模型 API Key。" };
  if (!visionApiUrl.trim()) return { ok: false, message: "请先在 设置 › AI 反推 中填写 API 地址。" };

  const base = visionApiUrl.replace(/\/+$/, "");
  const model = visionApiModel || "gpt-4o";
  const body = {
    model,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  };

  try {
    const resp = await axios.post(`${base}/chat/completions`, body, {
      headers: { Authorization: `Bearer ${visionApiKey}`, "Content-Type": "application/json" },
      timeout: 60_000,
      ...proxyConfig("ai"),
    });
    const content: string = resp.data?.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) {
      const fin = resp.data?.choices?.[0]?.finish_reason;
      const message =
        fin === "length"
          ? "API 返回被长度截断（内容为空）：该模型可能把额度用在了推理上，请换非推理模型。"
          : "API 返回内容为空：请确认「模型」填的是该服务支持的模型名（例如 xAI 用 grok-4.3，而非默认 gpt-4o-mini），可点「检测模型」选择。";
      recordAiCall({ label, api: "vision", model, systemPrompt, userText: summarizeUserContent(userContent), ok: false, response: message });
      return { ok: false, message };
    }
    const cleaned = cleanPromptOutput(content);
    recordAiCall({ label, api: "vision", model, systemPrompt, userText: summarizeUserContent(userContent), ok: true, response: cleaned });
    return { ok: true, content: cleaned, message: "成功" };
  } catch (error: any) {
    const msg =
      error?.response?.data?.error?.message ??
      error?.response?.data?.message ??
      error?.message ??
      "未知错误";
    recordAiCall({ label, api: "vision", model, systemPrompt, userText: summarizeUserContent(userContent), ok: false, response: String(msg) });
    return { ok: false, message: msg };
  }
}

async function callConvertApi(
  systemPrompt: string,
  userText: string,
  maxTokens = 2000,
  label = "提示词转换",
): Promise<{ ok: boolean; content?: string; message: string }> {
  const settings = getSettings();
  const apiUrl = settings.convertApiUrl.trim();
  const apiKey = settings.convertApiKey.trim();
  const model = settings.convertApiModel.trim() || "gpt-4o-mini";

  if (!apiKey) return { ok: false, message: "请先在 设置 > 转换 API 中填写 API Key。" };
  if (!apiUrl) return { ok: false, message: "请先在 设置 > 转换 API 中填写 API 地址。" };

  const base = apiUrl.replace(/\/+$/, "");
  const body = {
    model,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText },
    ],
  };

  try {
    const resp = await axios.post(`${base}/chat/completions`, body, {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      timeout: 60_000,
      ...proxyConfig("ai"),
    });
    const content: string = resp.data?.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) {
      const fin = resp.data?.choices?.[0]?.finish_reason;
      const message =
        fin === "length"
          ? "API 返回被长度截断（内容为空）：该模型可能把额度用在了推理上，请换非推理模型。"
          : "API 返回内容为空：请确认「模型」填的是该服务支持的模型名（例如 xAI 用 grok-4.3，而非默认 gpt-4o-mini），可点「检测模型」选择。";
      recordAiCall({ label, api: "convert", model, systemPrompt, userText, ok: false, response: message });
      return { ok: false, message };
    }
    const cleaned = cleanPromptOutput(content);
    recordAiCall({ label, api: "convert", model, systemPrompt, userText, ok: true, response: cleaned });
    return { ok: true, content: cleaned, message: "成功" };
  } catch (error: any) {
    const msg =
      error?.response?.data?.error?.message ??
      error?.response?.data?.message ??
      error?.message ??
      "未知错误";
    recordAiCall({ label, api: "convert", model, systemPrompt, userText, ok: false, response: String(msg) });
    return { ok: false, message: msg };
  }
}

export async function listAiModels(kind: "reverse" | "convert"): Promise<AiModelListResult> {
  const settings = getSettings();
  const apiUrl = (kind === "reverse" ? settings.visionApiUrl : settings.convertApiUrl).trim();
  const apiKey = (kind === "reverse" ? settings.visionApiKey : settings.convertApiKey).trim();
  if (!apiUrl) return { ok: false, message: "请先填写 API 地址。", models: [] };
  if (!apiKey) return { ok: false, message: "请先填写 API Key。", models: [] };

  try {
    const base = apiUrl.replace(/\/+$/, "");
    const resp = await axios.get(`${base}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 20_000,
      ...proxyConfig("ai"),
    });
    const raw = Array.isArray(resp.data?.data) ? resp.data.data : Array.isArray(resp.data) ? resp.data : [];
    const models = raw
      .map((item: any) => (typeof item === "string" ? item : item?.id))
      .filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
      .sort();
    return {
      ok: true,
      message: models.length ? `检测到 ${models.length} 个模型。` : "接口可用，但未返回模型列表。",
      models,
    };
  } catch (error: any) {
    const msg =
      error?.response?.data?.error?.message ??
      error?.response?.data?.message ??
      error?.message ??
      "未知错误";
    return { ok: false, message: `模型检测失败：${msg}`, models: [] };
  }
}

function normalizeTagServerItem(item: unknown): TagSuggestion | null {
  if (typeof item === "string") {
    const tag = item.trim();
    return tag ? { tag, count: 0, category: 0 } : null;
  }
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  const rawTag = row.tag ?? row.name ?? row.value ?? row.label ?? row.text;
  if (typeof rawTag !== "string" || !rawTag.trim()) return null;
  const rawCount = row.count ?? row.post_count ?? row.posts ?? row.total;
  const count =
    typeof rawCount === "number"
      ? rawCount
      : typeof rawCount === "string" && Number.isFinite(Number(rawCount))
        ? Number(rawCount)
        : 0;
  const rawCategory = row.category ?? row.type;
  const category =
    typeof rawCategory === "number"
      ? rawCategory
      : rawCategory === "artist"
        ? 1
        : rawCategory === "copyright"
          ? 3
          : rawCategory === "character"
            ? 4
            : rawCategory === "meta"
              ? 5
              : 0;
  const description =
    typeof row.description === "string"
      ? row.description
      : typeof row.translation === "string"
        ? row.translation
        : typeof row.zh === "string"
          ? row.zh
          : undefined;
  return { tag: rawTag.trim(), count: Math.round(count), category, description };
}

function parseTagServerPayload(payload: unknown): TagSuggestion[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload.map(normalizeTagServerItem).filter((x): x is TagSuggestion => Boolean(x));
  if (typeof payload === "string") {
    try {
      return parseTagServerPayload(JSON.parse(payload));
    } catch {
      return payload
        .split(/[\n,]/)
        .map((tag) => normalizeTagServerItem(tag))
        .filter((x): x is TagSuggestion => Boolean(x));
    }
  }
  if (typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  const content = obj.content;
  if (Array.isArray(content)) {
    const parts = content
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object") {
          const text = (entry as Record<string, unknown>).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
    const parsed = parseTagServerPayload(parts);
    if (parsed.length > 0) return parsed;
  }
  for (const key of ["tags", "results", "data", "items", "result"]) {
    const parsed = parseTagServerPayload(obj[key]);
    if (parsed.length > 0) return parsed;
  }
  return [];
}

async function queryTagServer(query: string, limit = 12): Promise<TagSuggestion[]> {
  const settings = getSettings();
  if (!settings.tagServerEnabled || !query.trim()) return [];
  const type = settings.tagServerType ?? "rest";
  // MCP transports (Streamable HTTP / SSE / stdio) go through the MCP client.
  if (type === "http" || type === "sse" || type === "stdio") {
    if (type !== "stdio" && !settings.tagServerUrl.trim()) return [];
    try {
      const text = await mcpSearch(
        {
          type,
          url: settings.tagServerUrl,
          apiKey: settings.tagServerApiKey,
          tool: settings.tagServerTool,
          command: settings.tagServerCommand,
          args: settings.tagServerArgs,
        },
        query,
        limit,
      );
      return parseTagServerPayload(text).slice(0, limit);
    } catch {
      return [];
    }
  }
  if (!settings.tagServerUrl.trim()) return [];
  const base = settings.tagServerUrl.trim().replace(/\/+$/, "");
  const headers: Record<string, string> = {};
  if (settings.tagServerApiKey.trim()) headers.Authorization = `Bearer ${settings.tagServerApiKey.trim()}`;

  const px = proxyConfig("mcp");
  const attempts = [
    () => axios.get(`${base}/search`, { params: { q: query, query, limit }, headers, timeout: 8_000, ...px }),
    () => axios.get(`${base}/tags`, { params: { q: query, query, limit }, headers, timeout: 8_000, ...px }),
    () => axios.post(`${base}/search`, { query, limit }, { headers, timeout: 8_000, ...px }),
    () =>
      axios.post(
        base,
        {
          jsonrpc: "2.0",
          id: `tag-${Date.now()}`,
          method: "tools/call",
          params: { name: "search_tags", arguments: { query, limit } },
        },
        { headers: { ...headers, "Content-Type": "application/json" }, timeout: 8_000, ...px },
      ),
  ];

  for (const attempt of attempts) {
    try {
      const response = await attempt();
      const tags = parseTagServerPayload(response.data).slice(0, limit);
      if (tags.length > 0) return tags;
    } catch {
      // Try the next common tag-server shape.
    }
  }
  return [];
}

function mergeTagHints(prompt: string, hints: TagSuggestion[]) {
  const hintTags = hints.map((hint) => hint.tag).filter(Boolean).join(", ");
  return hintTags ? mergePrompt(prompt, hintTags) : prompt;
}

export async function testTagServer(query: string): Promise<{ ok: boolean; message: string; tags: TagSuggestion[] }> {
  const settings = getSettings();
  const type = settings.tagServerType ?? "rest";
  const q = query || "蓝眼白发的少女";
  // For MCP transports, call directly so we can surface the real error message.
  if (type === "http" || type === "sse" || type === "stdio") {
    try {
      const text = await mcpSearch(
        {
          type,
          url: settings.tagServerUrl,
          apiKey: settings.tagServerApiKey,
          tool: settings.tagServerTool,
          command: settings.tagServerCommand,
          args: settings.tagServerArgs,
        },
        q,
        12,
      );
      const tags = parseTagServerPayload(text).slice(0, 12);
      const label = type === "stdio" ? "stdio MCP" : type === "sse" ? "SSE MCP" : "Streamable HTTP MCP";
      return tags.length > 0
        ? { ok: true, message: `${label} 可用，工具「${settings.tagServerTool || "search_tags"}」返回 ${tags.length} 个标签。`, tags }
        : { ok: false, message: `${label} 已连接，但工具未返回可解析的标签（原始返回：${text.slice(0, 120) || "空"}）。`, tags: [] };
    } catch (error: any) {
      return { ok: false, message: `MCP 连接失败：${error?.message ?? "未知错误"}`, tags: [] };
    }
  }
  const tags = await queryTagServer(q, 12);
  return tags.length > 0
    ? { ok: true, message: `Tag 服务可用，返回 ${tags.length} 个结果。`, tags }
    : { ok: false, message: "Tag 服务没有返回结果，请检查地址、鉴权或接口路径。", tags: [] };
}

function hasCompletePromptVariants(parsed: ReturnType<typeof parsePromptVariantResponse>) {
  return Boolean(parsed.variants?.namePrompt.trim() && parsed.variants?.featurePrompt.trim());
}

function variantRepairSystemPrompt(mode: "tags" | "natural" | "mixed", source: "reverse" | "convert") {
  return [
    "Rewrite the previous output into strict JSON only.",
    "Return exactly this shape: {\"namePrompt\":\"...\",\"featurePrompt\":\"...\"}.",
    "namePrompt must use the known character name/tag concisely.",
    "featurePrompt must not use the character name; replace it with short visible features and outfit cues.",
    "Do not add explanations, Markdown, or extra keys.",
    knownCharacterRuntimeInstruction(mode, source, true),
  ].join("\n\n");
}

export async function reversePromptImage(
  imageBase64: string,
  mode: "tags" | "natural" | "mixed" = "tags",
  scope: string = "full",
  hint: string = "",
  knownCharacter = false,
): Promise<{ ok: boolean; prompt?: string; variants?: { namePrompt: string; featurePrompt: string }; message: string }> {
  const settings = getSettings();
  const safeScope = (["full", "character", "object", "scene"].includes(scope) ? scope : "full") as ReversePromptScope;
  const scopeLabel =
    safeScope === "character" ? "角色" :
    safeScope === "object" ? "物品" :
    safeScope === "scene" ? "场景" :
    "整张图片";
  const userScopeText = [
    `反推范围：${scopeLabel}`,
    hint.trim() ? `目标/角色提示：${hint.trim()}` : "",
    `请严格只围绕“${scopeLabel}”输出结果。`,
  ].filter(Boolean).join("\n");
  const systemPrompt = [
    resolveModePrompt(
      mode,
      settings.reversePromptTemplates,
      settings.visionSystemPrompt,
      SCOPED_REVERSE_SYSTEM_PROMPTS,
    )
      .replace(/\{\{input\}\}/g, userScopeText)
      .replace(/\{\{image\}\}/g, "<uploaded image>"),
    knownCharacterRuntimeInstruction(mode, "reverse", knownCharacter),
  ].join("\n\n");

  const result = await callVisionApi(
    systemPrompt,
    [
      { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}`, detail: "high" } },
      {
        type: "text",
        text: [
          userScopeText,
          "",
          "Generate the prompt for this image.",
          "",
          modeUserInstruction(mode, "reverse"),
          knownCharacterRuntimeInstruction(mode, "reverse", knownCharacter),
        ].join("\n"),
      },
    ],
    2000,
    `AI 反推 · ${mode} · ${scopeLabel}`,
  );

  if (result.ok) {
    let parsed = parsePromptVariantResponse(result.content ?? "", knownCharacter);
    if (knownCharacter && !hasCompletePromptVariants(parsed)) {
      const repaired = await callVisionApi(
        variantRepairSystemPrompt(mode, "reverse"),
        [
          { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}`, detail: "high" } },
          {
            type: "text",
            text: [
              userScopeText,
              "",
              "Previous output that must be rewritten into two variants:",
              result.content ?? "",
            ].join("\n"),
          },
        ],
        1400,
        `AI 反推双版本修复 · ${mode}`,
      );
      if (repaired.ok && repaired.content) {
        const fixed = parsePromptVariantResponse(repaired.content, true);
        if (hasCompletePromptVariants(fixed)) parsed = fixed;
      }
    }
    let content = parsed.primary;
    if (modeNeedsRepair(mode, content)) {
      const repaired = await callVisionApi(
        modeRepairSystemPrompt(mode),
        [
          { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}`, detail: "high" } },
          { type: "text", text: buildModeRepairUserText(mode, userScopeText || "Image reverse-prompt request", content) },
        ],
        900,
        `AI 反推修复 · ${mode}`,
      );
      // Best-effort: adopt the repaired output when available, but never hard-fail
      // on a heuristic mismatch — modeNeedsRepair can false-positive and we must
      // not discard an otherwise-usable result.
      if (repaired.ok && repaired.content) content = cleanPromptOutput(repaired.content);
    }

    const hints = knownCharacter || mode === "natural" || !settings.mcpForReverse ? [] : await queryTagServer(content, 16);
    return {
      ok: true,
      prompt: mode === "natural" || knownCharacter ? content : mergeTagHints(content, hints),
      variants: parsed.variants,
      message: "反推成功",
    };
  }
  return { ok: false, message: `反推失败：${result.message}` };
}

const CJK_RE = /[一-鿿぀-ゟ゠-ヿ]/;
// English-tag -> Chinese gloss cache, so we only translate a given tag once.
const tagZhCache = new Map<string, string>();

/**
 * Make sure every tag carries a Chinese gloss in `description`. Resolution
 * order: existing CJK description → offline dictionary → translation cache →
 * batch online translation (EN→中文) for whatever is still missing. Results are
 * cached so repeat searches stay instant.
 */
async function enrichTagsWithChinese(tags: TagSuggestion[]): Promise<TagSuggestion[]> {
  if (tags.length === 0) return tags;
  const misses: string[] = [];
  for (const t of tags) {
    const existing = (t.description ?? "").trim();
    if (existing && CJK_RE.test(existing)) continue;
    const local = zhForTag(t.tag);
    if (local) {
      t.description = local;
      continue;
    }
    const cached = tagZhCache.get(t.tag.toLowerCase());
    if (cached) {
      t.description = cached;
      continue;
    }
    misses.push(t.tag);
  }
  // Translate the leftovers in ONE batched request (newline-delimited) so we
  // stay fast and avoid rate-limiting the translation endpoint.
  const todo = [...new Set(misses)].slice(0, 24);
  if (todo.length > 0) {
    try {
      const res = await translateText(todo.map((t) => t.replace(/_/g, " ")).join("\n"), "zh");
      if (res.ok && res.text) {
        const lines = res.text.split("\n").map((l) => l.trim());
        // Only trust a clean 1:1 mapping; otherwise leave the English tags.
        if (lines.length === todo.length) {
          todo.forEach((tag, i) => {
            const zh = lines[i];
            if (zh && CJK_RE.test(zh)) tagZhCache.set(tag.toLowerCase(), zh);
          });
        }
      }
    } catch {
      // leave untranslated; the English tag still shows.
    }
    for (const t of tags) {
      if ((t.description ?? "").trim() && CJK_RE.test(t.description ?? "")) continue;
      const zh = tagZhCache.get(t.tag.toLowerCase());
      if (zh) t.description = zh;
    }
  }
  return tags;
}

/**
 * Tag/MCP search used by the inspiration capsule. Returns server suggestions
 * only when the service is enabled AND the capsule is allowed to use it. Every
 * returned tag is annotated with a Chinese gloss.
 */
export async function searchTagServer(query: string, limit = 16): Promise<TagSuggestion[]> {
  const settings = getSettings();
  if (!settings.mcpForCapsule) return [];
  const tags = await queryTagServer(query, limit);
  return enrichTagsWithChinese(tags);
}

function extractJsonObject(text: string): any | null {
  const cleaned = (text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeComicTarget(value: ComicDesiredPanelCount): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.min(500, Math.round(value));
  return null;
}

function inferPanelCountFromRanges(script: string): number | null {
  const ends = [...script.matchAll(/(\d+)\s*[-~]\s*(\d+)/g)]
    .map((match) => Number(match[2]))
    .filter(Number.isFinite);
  if (!ends.length) return null;
  return Math.min(500, Math.max(...ends));
}

function fallbackComicPanelsV2(script: string, desiredPanelCount: ComicDesiredPanelCount = "auto") {
  const panels: Array<{ cnPrompt: string; contextSummary: string }> = [];
  const lines = script.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const range = line.match(/^(\d+)\s*[-~]\s*(\d+)\s*[.。:：、]?\s*(.+)$/);
    if (!range) continue;
    const start = Number(range[1]);
    const end = Number(range[2]);
    const desc = range[3].trim();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 1000) continue;
    for (let i = start; i <= end; i += 1) {
      panels.push({
        cnPrompt: `第 ${i} 格：${desc}。补足镜头动作、场景、人物状态、构图、情绪和连续性。`,
        contextSummary: desc.slice(0, 180),
      });
    }
  }
  if (panels.length > 0) return panels;

  const target = normalizeComicTarget(desiredPanelCount);
  const chunks = script.split(/(?<=[。！？!?])\s*/).map((x) => x.trim()).filter(Boolean);
  const source = chunks.length ? chunks : [script.trim()];
  const count = target ?? source.length;
  for (let i = 0; i < count; i += 1) {
    const chunk = source[Math.min(source.length - 1, Math.floor((i / Math.max(1, count)) * source.length))] ?? script.trim();
    panels.push({
      cnPrompt: `第 ${i + 1} 格：${chunk}。设计成独立漫画分镜，包含镜头景别、人物动作、场景细节、构图和情绪递进。`,
      contextSummary: chunk.slice(0, 180),
    });
  }
  return panels;
}

async function analyzeComicScriptV2(request: ComicAnalyzeRequest): Promise<ComicAnalyzeResult> {
  const text = request.script.trim();
  if (!text) return { ok: false, message: "请先输入漫画故事或分镜文本。" };
  const settings = getSettings();
  const targetCount = normalizeComicTarget(request.desiredPanelCount) ?? inferPanelCountFromRanges(text);
  const localPanels = fallbackComicPanelsV2(text, targetCount ?? request.desiredPanelCount);
  if (!settings.convertApiKey.trim() || !settings.convertApiUrl.trim()) {
    const referenceText = request.referencePrompts?.filter(Boolean).join("\n") || "";
    return {
      ok: true,
      message: "未配置转换 API，已使用本地规则解析分镜。",
      title: "未命名漫画项目",
      globalPrompt: text,
      globalCharacterSetting: referenceText,
      continuityBible: "",
      panels: localPanels,
    };
  }

  const referenceText = request.referencePrompts?.filter(Boolean).join("\n") || "(none)";
  const systemPrompt = [
    settings.comicAnalyzePromptTemplate?.trim() || COMIC_ANALYZE_SYSTEM_PROMPT,
    targetCount ? `Target panel count: ${targetCount}. Keep the final panels as close to this count as possible.` : "Panel count: auto.",
    `Later prompt mode: ${request.mode}. Make each panel detailed enough for that mode.`,
    "Use the reference-image notes below to build the global character / scene / object setting.",
    "Safety: keep all panels non-explicit, non-gory, and suitable for general image generation.",
  ].join("\n\n");
  const result = await callConvertApi(
    systemPrompt,
    [
      "用户故事：",
      text,
      "",
      "参考图反推 / 用户说明：",
      referenceText,
      "",
      "请只返回 JSON。字段：title, globalPrompt, globalCharacterSetting, panels。panels 每项包含 cnPrompt 和 contextSummary。",
    ].join("\n"),
    4000,
    "漫画拆分镜",
  );
  if (!result.ok) {
    return {
      ok: true,
      message: `AI 拆分失败，已回退本地解析：${result.message}`,
      title: "未命名漫画项目",
      globalPrompt: text,
      globalCharacterSetting: request.referencePrompts?.filter(Boolean).join("\n") || "",
      continuityBible: "",
      panels: localPanels,
    };
  }

  const parsed = extractJsonObject(result.content ?? "");
  const panels = (Array.isArray(parsed?.panels) ? parsed.panels : [])
    .map((p: any) => ({
      cnPrompt: String(p?.cnPrompt ?? p?.prompt ?? "").trim(),
      contextSummary: String(p?.contextSummary ?? p?.summary ?? "").trim(),
    }))
    .filter((p: any) => p.cnPrompt);
  const finalPanels = panels.length > 0 && (!targetCount || panels.length >= Math.max(1, Math.floor(targetCount * 0.6)))
    ? panels
    : localPanels;
  return {
    ok: true,
    message: `已拆分 ${finalPanels.length} 个分镜。`,
    title: String(parsed?.title ?? "未命名漫画项目").trim(),
    globalPrompt: String(parsed?.globalPrompt ?? text).trim(),
    globalCharacterSetting:
      String(parsed?.globalCharacterSetting ?? "").trim() || request.referencePrompts?.filter(Boolean).join("\n") || "",
    continuityBible: "",
    panels: finalPanels,
  };
}

export async function analyzeComicScript(request: ComicAnalyzeRequest): Promise<ComicAnalyzeResult> {
  return analyzeComicScriptV2(request);
}

export async function convertComicPanels(request: ComicConvertRequest): Promise<ComicConvertResult> {
  if (!request.panels.length) return { ok: false, message: "没有需要转换的分镜。", panels: [] };
  const settings = getSettings();
  if (!settings.convertApiKey.trim() || !settings.convertApiUrl.trim()) {
    return { ok: false, message: "请先在设置 > 转换 API 中填写 API 地址、模型和 Key。", panels: [] };
  }
  const mode = request.mode;
  const systemPrompt = [
    resolveModePrompt(mode, settings.convertPromptTemplates, settings.convertSystemPrompt, CONVERT_SYSTEM_PROMPTS),
    "",
    "你正在为连续漫画生成 NovelAI 生图提示词。必须保持角色、服装、地点、时间线和关键道具前后一致。",
    "每次只输出当前分镜的最终英文提示词，不要解释，不要 Markdown。",
    "必须参考全局设定、参考图反推描述、上一个/当前/下一个中文分镜描述，保持同一角色、场景、物品的英文表达一致。",
    "避免色情、裸露、夸张身体特写。",
  ].join("\n");

  const out: ComicConvertResult["panels"] = [];
  for (const panel of request.panels) {
    const tagHints = mode === "natural" || !settings.mcpForConvert ? [] : await queryTagServer(panel.cnPrompt, 16);
    const userText = [
      `Output mode: ${mode}`,
      "Global story prompt:",
      request.globalPrompt || "(empty)",
      "Global character setting:",
      request.globalCharacterSetting || "(empty)",
      "Global style prompt:",
      request.globalStylePrompt || "(empty)",
      "Reference image reverse prompts:",
      request.referencePrompts.length ? request.referencePrompts.join("\n") : "(none)",
      "Previous Chinese panel:",
      panel.previousCnPrompt || "(none)",
      "Current panel Chinese description:",
      panel.cnPrompt,
      "Next Chinese panel:",
      panel.nextCnPrompt || "(none)",
      "Previous panel summaries:",
      panel.previousSummaries.length ? panel.previousSummaries.join("\n") : "(none)",
      "Next panel summaries:",
      panel.nextSummaries.length ? panel.nextSummaries.join("\n") : "(none)",
      "Previous final prompts:",
      panel.previousPrompts.length ? panel.previousPrompts.join("\n") : "(none)",
      modeUserInstruction(mode, "convert"),
      tagHints.length ? `Candidate tags: ${tagHints.map((x) => x.tag).join(", ")}` : "",
    ].join("\n\n");
    const result = await callConvertApi(systemPrompt, userText, 1800, `漫画分镜转换 #${panel.index}`);
    if (!result.ok) {
      out.push({ panelId: panel.panelId, enPrompt: "", error: result.message });
      continue;
    }
    let content = cleanPromptOutput(result.content ?? "");
    if (modeNeedsRepair(mode, content)) {
      const repaired = await callConvertApi(modeRepairSystemPrompt(mode), buildModeRepairUserText(mode, panel.cnPrompt, content), 900, `漫画分镜转换修复 #${panel.index}`);
      if (repaired.ok && repaired.content) content = cleanPromptOutput(repaired.content);
    }
    out.push({ panelId: panel.panelId, enPrompt: mode === "natural" ? content : mergeTagHints(content, tagHints) });
  }
  const failed = out.filter((p) => p.error).length;
  return { ok: failed < out.length, message: `转换完成：成功 ${out.length - failed}，失败 ${failed}。`, panels: out };
}

const COMIC_CONSISTENCY_CHUNK_SIZE = 6;
type ConsistencyPanelInput = ComicConsistencyRequest["panels"][number];
type ConsistencyChunkResult = {
  ok: boolean;
  message: string;
  panels: ComicConsistencyResult["panels"];
};

function chunkPanels<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function checkComicConsistencyChunk(
  request: ComicConsistencyRequest,
  chunk: ConsistencyPanelInput[],
  allPanels: ConsistencyPanelInput[],
  labelSuffix: string,
): Promise<ConsistencyChunkResult> {
  const systemPrompt = [
    "你是连续漫画提示词的一致性审校。下面会给出全部分镜的简要上下文，以及本次需要修正的一小组英文提示词。",
    "检查同一角色、场景、物品、发色、服装、配饰、时间线和关键道具是否前后一致。",
    "只修正不一致之处：补齐缺失的角色/服装特征、统一命名与风格，但不要改变每个分镜本身的镜头、动作与剧情。",
    `保持原有提示词模式（${request.mode}），不要新增解释，不要 Markdown。`,
    '严格只返回 JSON：{"panels":[{"panelId":"...","enPrompt":"修正后的完整英文提示词","note":"中文说明本次改动，没改动则留空"}]}。',
    "panelId 必须与输入完全一致；未改动的分镜也要原样返回完整 enPrompt。",
  ].join("\n");

  const userText = [
    `Output mode: ${request.mode}`,
    "Global story prompt:",
    request.globalPrompt || "(empty)",
    "Global character setting:",
    request.globalCharacterSetting || "(empty)",
    "Reference image reverse prompts:",
    request.referencePrompts.length ? request.referencePrompts.join("\n") : "(none)",
    "All panel outline:",
    JSON.stringify(allPanels.map((panel) => ({ panelId: panel.id, index: panel.index, cnPrompt: panel.cnPrompt })), null, 2),
    "Target panels to review in this call:",
    JSON.stringify(
      chunk.map((panel) => ({ panelId: panel.id, index: panel.index, cnPrompt: panel.cnPrompt, enPrompt: panel.enPrompt })),
      null,
      2,
    ),
    "请只返回 JSON。",
  ].join("\n\n");

  const maxTokens = Math.min(3200, Math.max(1400, 700 + chunk.length * 420));
  const result = await callConvertApi(systemPrompt, userText, maxTokens, `漫画一致性检测 ${labelSuffix}`);
  if (!result.ok) return { ok: false, message: result.message, panels: [] };

  const parsed = extractJsonObject(result.content ?? "");
  const items = Array.isArray(parsed?.panels) ? parsed.panels : [];
  const byId = new Map<string, string>();
  const notes = new Map<string, string>();
  for (const item of items) {
    const panelId = String(item?.panelId ?? "").trim();
    if (!panelId) continue;
    const enPrompt = cleanPromptOutput(String(item?.enPrompt ?? "").trim());
    if (!enPrompt) continue;
    byId.set(panelId, enPrompt);
    const note = String(item?.note ?? "").trim();
    if (note) notes.set(panelId, note);
  }
  if (!byId.size) return { ok: false, message: "模型未返回可解析的 panels JSON。", panels: [] };

  return {
    ok: true,
    message: "ok",
    panels: chunk.map((panel) => ({
      panelId: panel.id,
      enPrompt: byId.get(panel.id) ?? panel.enPrompt,
      note: notes.get(panel.id),
    })),
  };
}

async function checkComicConsistencyWithFallback(
  request: ComicConsistencyRequest,
  chunk: ConsistencyPanelInput[],
  allPanels: ConsistencyPanelInput[],
  labelSuffix: string,
): Promise<ConsistencyChunkResult> {
  const direct = await checkComicConsistencyChunk(request, chunk, allPanels, labelSuffix);
  if (direct.ok || chunk.length === 1) return direct;
  const mid = Math.ceil(chunk.length / 2);
  const left = await checkComicConsistencyWithFallback(request, chunk.slice(0, mid), allPanels, `${labelSuffix}-a`);
  if (!left.ok) return left;
  const right = await checkComicConsistencyWithFallback(request, chunk.slice(mid), allPanels, `${labelSuffix}-b`);
  if (!right.ok) return right;
  return { ok: true, message: "ok", panels: [...left.panels, ...right.panels] };
}

export async function checkComicConsistency(request: ComicConsistencyRequest): Promise<ComicConsistencyResult> {
  const reviewable = request.panels.filter((panel) => panel.enPrompt.trim());
  if (!reviewable.length) {
    return { ok: false, message: "没有可检测的分镜英文提示词，请先转换。", panels: [] };
  }
  const settings = getSettings();
  if (!settings.convertApiKey.trim() || !settings.convertApiUrl.trim()) {
    return { ok: false, message: "请先在设置 > 转换 API 中填写 API 地址、模型和 Key。", panels: [] };
  }

  const panels: ComicConsistencyResult["panels"] = [];
  for (const [chunkIndex, chunk] of chunkPanels(reviewable, COMIC_CONSISTENCY_CHUNK_SIZE).entries()) {
    const checked = await checkComicConsistencyWithFallback(request, chunk, reviewable, `#${chunkIndex + 1}`);
    if (!checked.ok) {
      return {
        ok: false,
        message: `一致性检测失败：${checked.message}。已保留原英文提示词，未覆盖任何分镜。`,
        panels: [],
      };
    }
    panels.push(...checked.panels);
  }
  const originalById = new Map(reviewable.map((panel) => [panel.id, panel.enPrompt.trim()]));
  const changed = panels.filter((panel) => panel.enPrompt.trim() !== (originalById.get(panel.panelId) ?? "")).length;
  return {
    ok: true,
    message: `一致性检测完成：复核 ${panels.length} 个分镜，调整 ${changed} 个。`,
    panels,
  };
}

function comicReferencesToExtras(request: ComicGeneratePanelRequest): GenerateExtras {
  return {
    vibeImages: request.references
      .filter((ref) => ref.base64 && ref.useForGeneration !== false)
      .map((ref) => ({
        base64: stripBase64Prefix(ref.base64),
        infoExtracted: Math.min(1, Math.max(0, Number(ref.infoExtracted) || (ref.kind === "precise" ? 1 : 0.7))),
        strength: Math.min(1, Math.max(0, Number(ref.strength) || (ref.kind === "precise" ? 0.65 : 0.45))),
      })),
    charCaptions: [],
  };
}

export async function generateComicPanel(request: ComicGeneratePanelRequest): Promise<GenerateResult> {
  const params: GenerateParams = {
    ...request.params,
    fileNamePrefix: request.params.fileNamePrefix || `comic-${request.panelIndex}`,
    positivePrompt: mergePrompt(request.globalStylePrompt, request.panelPrompt),
    negativePrompt:
      request.negativeMode === "override"
        ? request.localNegativePrompt
        : mergePrompt(request.globalNegativePrompt, request.localNegativePrompt),
  };
  const extras = comicReferencesToExtras(request);
  const hasGenerationReferences = (extras.vibeImages?.length ?? 0) > 0;
  let result = await generateImage(params, extras);
  if (!result.ok && hasGenerationReferences && result.failureKind === "reference") {
    const fallback = await generateImage(params, { vibeImages: [], charCaptions: [] });
    result = fallback.ok
      ? {
          ...fallback,
          message: `${fallback.message}（参考图生成失败，已自动无参考图重试成功。）`,
        }
      : {
          ...fallback,
          message: `带参考图生成失败：${result.message}\n无参考图重试仍失败：${fallback.message}`,
        };
  }
  if (result.ok && result.items.length > 0) {
    result.items = result.items.map((item) => {
      const updated = updateHistoryItem(item.id, {
        feature: "comic",
        comicProjectId: request.projectId,
        comicPanelNo: request.panelIndex,
      });
      return updated ?? { ...item, feature: "comic", comicProjectId: request.projectId, comicPanelNo: request.panelIndex };
    });
  }
  return result;
}

function safeZipName(name: string) {
  return (name || "comic-project").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_").slice(0, 80) || "comic-project";
}

function referenceSummary(ref: ComicReferenceAsset) {
  return `- ${ref.name} / ${ref.kind} / generation=${ref.useForGeneration !== false ? "on" : "off"} / strength=${ref.strength} / info=${ref.infoExtracted}\n${ref.reversePrompt || "(no reverse prompt)"}`;
}

// Strict image-magic check (detectExt() defaults to "png" and is NOT a validator).
function isImageBuffer(buffer: Buffer): boolean {
  if (buffer.length < 6) return false;
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true; // png
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return true; // jpeg
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF") return true; // webp
  const gif = buffer.subarray(0, 6).toString("ascii");
  if (gif === "GIF87a" || gif === "GIF89a") return true;
  return false;
}

// True only when `child` resolves to a path inside `parent` (blocks `..`
// traversal and absolute paths pointing elsewhere).
function isInsideDir(child: string, parent: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel.length > 0 && !rel.startsWith("..") && !path.isAbsolute(rel);
}

export async function exportComicProjectZip(project: ComicProject): Promise<{ ok: boolean; message: string; path?: string }> {
  const generated = [...project.panels].sort((a, b) => a.index - b.index).filter((panel) => panel.outputPath);
  if (!generated.length) return { ok: false, message: "暂无可打包图片。" };
  const settings = getSettings();
  const outputRoot = path.resolve(settings.outputDir);
  const zip = new JSZip();
  const imageFolder = zip.folder("images");
  const zipNameByPanelId = new Map<string, string>();
  let imageCount = 0;
  for (const panel of generated) {
    const outputPath = panel.outputPath;
    if (!outputPath) continue;
    // SECURITY: only read files that live inside the app's own output directory.
    // An imported project JSON is untrusted and could point outputPath at an
    // arbitrary local file (e.g. C:\Users\...\secret.txt) to smuggle it into the ZIP.
    if (!isInsideDir(outputPath, outputRoot)) continue;
    try {
      const buffer = await fs.readFile(outputPath);
      if (!isImageBuffer(buffer)) continue;
      const zipName = `${String(panel.index).padStart(3, "0")}.${detectExt(buffer)}`;
      imageFolder?.file(zipName, buffer);
      zipNameByPanelId.set(panel.id, `images/${zipName}`);
      imageCount += 1;
    } catch {
      // Missing/unreadable files are skipped, but prompt metadata still records them.
    }
  }
  if (imageCount === 0) return { ok: false, message: "未找到位于输出目录内的有效图片，无法打包。" };

  // Strip machine-local absolute paths and history ids from the exported project;
  // point each panel at its relative in-zip image name instead.
  const exportProject = {
    ...project,
    panels: [...project.panels]
      .sort((a, b) => a.index - b.index)
      .map((panel) => ({
        ...panel,
        outputPath: zipNameByPanelId.get(panel.id) ?? "",
        outputUrl: undefined,
        historyItemId: undefined,
      })),
  };
  zip.file("project.json", JSON.stringify(exportProject, null, 2));
  zip.file(
    "prompts.md",
    [
      `# ${project.title || "Comic Project"}`,
      "",
      "## Global",
      "",
      `Mode: ${project.mode}`,
      `Desired panels: ${project.desiredPanelCount}`,
      "",
      "### Global prompt",
      project.globalPrompt || "(empty)",
      "",
      "### Character / scene setting",
      project.globalCharacterSetting || "(empty)",
      "",
      "### References",
      project.references.length ? project.references.map(referenceSummary).join("\n\n") : "(none)",
      "",
      "## Panels",
      "",
      ...[...project.panels]
        .sort((a, b) => a.index - b.index)
        .map((panel) => [
          `### ${String(panel.index).padStart(3, "0")}`,
          "",
          `Status: ${panel.status}`,
          `Output: ${zipNameByPanelId.get(panel.id) || "(not generated)"}`,
          "",
          "**Chinese description**",
          panel.cnPrompt || "(empty)",
          "",
          "**English prompt**",
          panel.enPrompt || "(empty)",
          "",
          "**Negative prompt**",
          panel.negativeMode === "override"
            ? panel.localNegativePrompt || "(empty)"
            : mergePrompt(project.globalNegativePrompt, panel.localNegativePrompt) || "(empty)",
          "",
        ].join("\n")),
    ].join("\n"),
  );

  const dir = path.join(settings.outputDir, "Comic Exports");
  await fs.mkdir(dir, { recursive: true });
  const filePath = await uniqueFilePath(dir, `${safeZipName(project.title)}_${dateStamp(new Date())}`, "zip");
  await fs.writeFile(filePath, await zip.generateAsync({ type: "nodebuffer" }));
  return { ok: true, message: `已导出 ${imageCount} 张分镜图片。`, path: filePath };
}

export async function convertPromptText(
  chineseText: string,
  mode: "tags" | "natural" | "mixed" = "tags",
  knownCharacter = false,
): Promise<{ ok: boolean; result?: string; variants?: { namePrompt: string; featurePrompt: string }; message: string }> {
  const settings = getSettings();
  const systemPrompt = [
    resolveModePrompt(
      mode,
      settings.convertPromptTemplates,
      settings.convertSystemPrompt,
      CONVERT_SYSTEM_PROMPTS,
    ),
    knownCharacterRuntimeInstruction(mode, "convert", knownCharacter),
  ].join("\n\n");

  // Tag-server hints only make sense for tag-style output, and only when the
  // user opted convert into using the MCP/tag service.
  const tagHints = knownCharacter || mode === "natural" || !settings.mcpForConvert ? [] : await queryTagServer(chineseText, 24);
  const hintText = tagHints.length
    ? `\n\nCandidate Danbooru tags from the configured tag server:\n${tagHints.map((tag) => tag.tag).join(", ")}`
    : "";
  const userText = [
    buildConvertUserText(chineseText, mode, knownCharacter ? "" : hintText),
    knownCharacterRuntimeInstruction(mode, "convert", knownCharacter),
  ].join("\n\n");
  const result = await callConvertApi(systemPrompt, userText, knownCharacter ? 2400 : 2000, `提示词转换 · ${mode}`);

  if (result.ok) {
    let parsed = parsePromptVariantResponse(result.content ?? "", knownCharacter);
    if (knownCharacter && !hasCompletePromptVariants(parsed)) {
      const repaired = await callConvertApi(
        variantRepairSystemPrompt(mode, "convert"),
        [
          "Original user description:",
          chineseText,
          "",
          "Previous output that must be rewritten into two variants:",
          result.content ?? "",
        ].join("\n"),
        1600,
        `提示词转换双版本修复 · ${mode}`,
      );
      if (repaired.ok && repaired.content) {
        const fixed = parsePromptVariantResponse(repaired.content, true);
        if (hasCompletePromptVariants(fixed)) parsed = fixed;
      }
    }
    let content = parsed.primary;
    if (modeNeedsRepair(mode, content)) {
      const repaired = await callConvertApi(
        modeRepairSystemPrompt(mode),
        buildModeRepairUserText(mode, chineseText, content),
        900,
        `提示词转换修复 · ${mode}`,
      );
      // Best-effort: adopt the repaired output when available, but never hard-fail
      // on a heuristic mismatch — modeNeedsRepair can false-positive and we must
      // not discard an otherwise-usable result.
      if (repaired.ok && repaired.content) content = cleanPromptOutput(repaired.content);
    }
    return {
      ok: true,
      result: mode === "natural" || knownCharacter ? content : mergeTagHints(content, tagHints),
      variants: parsed.variants,
      message: "转换成功",
    };
  }
  return { ok: false, message: `转换失败：${result.message}` };
}

export async function loadImageFromPath(filePath: string): Promise<LoadImageResult> {
  try {
    const buffer = await fs.readFile(filePath);
    const dims = readImageDimensions(buffer);
    workbenchImagePath = filePath;
    return {
      ok: true,
      image: {
        filePath,
        fileUrl: pathToFileURL(filePath).toString(),
        width: dims.width,
        height: dims.height,
      },
    };
  } catch (error: any) {
    return { ok: false, message: `加载图片失败：${error?.message ?? "未知错误"}` };
  }
}

export async function generateImage(params: GenerateParams, extras?: GenerateExtras): Promise<GenerateResult> {
  const token = getToken();
  if (!token) return { ok: false, message: "请先在 设置 > 网络/API 中配置 NovelAI API Token。", items: [] };
  if (!params.positivePrompt.trim()) return { ok: false, message: "请输入正面提示词。", items: [] };

  currentAbort?.abort();
  currentAbort = new AbortController();

  // "fixed" mode honors the chosen seed; "random" (or seed<=0) rolls a new one.
  const useFixedSeed = params.seedMode !== "random" && params.seed > 0;
  const actualSeed = useFixedSeed ? params.seed : crypto.randomInt(1, 2_147_483_647);

  try {
    const preparedExtras = await prepareExtras(params, extras);
    const payload = buildPayload(params, actualSeed, preparedExtras);
    let buffers: Buffer[];
    try {
      buffers = await postGenerateImage(payload);
    } catch (error: any) {
      if (!shouldRetryCharCaptionsAsPipe(error, params, preparedExtras)) throw error;
      const pipePayload = buildPayload(params, actualSeed, preparedExtras, "pipe");
      buffers = await postGenerateImage(pipePayload);
    }
    if (buffers.length === 0) return { ok: false, message: "API 返回成功，但压缩包中没有图片。", items: [] };
    const items = await saveBuffers(buffers, params, actualSeed, "t2i");
    void refreshStoredAccount();
    return { ok: true, message: `生成完成，已保存 ${items.length} 张图片。`, items, actualSeed };
  } catch (error: any) {
    return handleGenerateError(error, "图片生成失败");
  } finally {
    currentAbort = null;
  }
}

export async function generateI2I(params: GenerateParams, i2i: I2IParams, extras?: GenerateExtras): Promise<GenerateResult> {
  const token = getToken();
  if (!token) return { ok: false, message: "请先配置 API Token。", items: [] };
  if (!params.positivePrompt.trim()) return { ok: false, message: "请输入正面提示词。", items: [] };
  if (!workbenchImagePath) return { ok: false, message: "请先加载参考图片。", items: [] };

  currentAbort?.abort();
  currentAbort = new AbortController();

  const actualSeed =
    params.seedMode !== "random" && params.seed > 0 ? params.seed : crypto.randomInt(1, 2_147_483_647);
  try {
    const preparedExtras = await prepareExtras(params, extras);
    const base64Image = await readWorkbenchBase64();
    const applyI2I = (payload: ReturnType<typeof buildPayload>) => {
      payload.action = "img2img";
      payload.parameters.image = base64Image;
      payload.parameters.strength = Math.min(1, Math.max(0, i2i.strength));
      payload.parameters.noise = Math.min(0.99, Math.max(0, i2i.noise));
      payload.parameters.extra_noise_seed =
        i2i.extraNoiseSeed > 0 ? i2i.extraNoiseSeed : crypto.randomInt(1, 2_147_483_647);
      return payload;
    };

    let buffers: Buffer[];
    try {
      buffers = await postGenerateImage(applyI2I(buildPayload(params, actualSeed, preparedExtras)));
    } catch (error: any) {
      if (!shouldRetryCharCaptionsAsPipe(error, params, preparedExtras)) throw error;
      buffers = await postGenerateImage(applyI2I(buildPayload(params, actualSeed, preparedExtras, "pipe")));
    }
    if (buffers.length === 0) return { ok: false, message: "图生图成功但无图片返回。", items: [] };
    const items = await saveBuffers(buffers, params, actualSeed, "i2i");
    void refreshStoredAccount();
    return { ok: true, message: `图生图完成，已保存 ${items.length} 张图片。`, items, actualSeed };
  } catch (error: any) {
    return handleGenerateError(error, "图生图失败");
  } finally {
    currentAbort = null;
  }
}

export async function inpaintImage(
  params: GenerateParams,
  inpaintModel: NAIInpaintModel,
  maskBase64: string,
  strength = 0.55,
  noise = 0,
): Promise<GenerateResult> {
  const token = getToken();
  if (!token) return { ok: false, message: "请先配置 API Token。", items: [] };
  if (!params.positivePrompt.trim()) return { ok: false, message: "请输入正面提示词。", items: [] };
  if (!workbenchImagePath) return { ok: false, message: "请先加载原图。", items: [] };
  if (!maskBase64) return { ok: false, message: "请先绘制需要重绘的蒙版区域。", items: [] };

  currentAbort?.abort();
  currentAbort = new AbortController();

  const { buffer } = await readWorkbenchImage();
  const preparedAssets = prepareInpaintAssets(buffer, maskBase64);
  const actualSeed =
    params.seedMode !== "random" && params.seed > 0 ? params.seed : crypto.randomInt(1, 2_147_483_647);
  const normalizedStrength = Math.max(0, Math.min(1, Number.isFinite(strength) ? strength : 0.55));
  const normalizedNoise = Math.max(0, Math.min(0.99, Number.isFinite(noise) ? noise : 0));
  const buildInpaintPayload = (model: NAIInpaintModel) => {
    const inpaintParams: PayloadParams = {
      ...params,
      model,
      width: preparedAssets.width,
      height: preparedAssets.height,
    };
    const historyParams: GenerateParams = {
      ...params,
      width: preparedAssets.originalWidth,
      height: preparedAssets.originalHeight,
    };
    const payload = buildPayload(inpaintParams, actualSeed);
    payload.action = "infill";
    payload.parameters.image = preparedAssets.imageBase64;
    payload.parameters.mask = preparedAssets.maskBase64;
    payload.parameters.add_original_image = true;
    payload.parameters.strength = normalizedStrength;
    payload.parameters.noise = normalizedNoise;
    payload.parameters.extra_noise_seed = crypto.randomInt(1, 2_147_483_647);
    return { payload, historyParams, model };
  };

  try {
    let chosen: ReturnType<typeof buildInpaintPayload> | null = null;
    let buffers: Buffer[] | null = null;
    let lastError: any = null;
    const candidates = inpaintModelCandidates(inpaintModel);
    for (let index = 0; index < candidates.length; index += 1) {
      chosen = buildInpaintPayload(candidates[index]);
      try {
        buffers = await postGenerateImage(chosen.payload);
        break;
      } catch (error: any) {
        lastError = error;
        const status = error?.response?.status;
        const retryable = status === 400 || status === 422 || status === 500 || status === 502 || status === 503 || status === 524;
        if (!retryable || index >= candidates.length - 1) {
          annotateInpaintError(error, preparedAssets, candidates[index]);
          throw error;
        }
      }
    }
    if (!chosen || !buffers) throw lastError ?? new Error("重绘请求未返回结果。");
    if (buffers.length === 0) return { ok: false, message: "重绘成功但无图片返回。", items: [] };
    const outputBuffers = cropInpaintBuffers(buffers, preparedAssets);
    const items = await saveBuffers(outputBuffers, chosen.historyParams, actualSeed, "inpaint", chosen.model);
    void refreshStoredAccount();
    const paddedNote = preparedAssets.padded
      ? `已自动补边 ${preparedAssets.originalWidth}×${preparedAssets.originalHeight} → ${preparedAssets.width}×${preparedAssets.height}，并裁回原尺寸。`
      : "";
    return { ok: true, message: `重绘完成，已保存 ${items.length} 张图片。${paddedNote}`, items, actualSeed };
  } catch (error: any) {
    return handleGenerateError(error, "重绘失败");
  } finally {
    currentAbort = null;
  }
}

export async function upscaleImg(scale: UpscaleScale): Promise<SingleImageResult> {
  const token = getToken();
  if (!token) return { ok: false, message: "请先配置 API Token。" };
  if (!workbenchImagePath) return { ok: false, message: "请先加载图片。" };

  currentAbort?.abort();
  const abort = new AbortController();
  currentAbort = abort;

  try {
    const { buffer, image } = await readWorkbenchImage();
    if (!image.width || !image.height) {
      return { ok: false, message: "无法读取图片尺寸，请重新加载图片。" };
    }
    const preparedImage = prepareLimitedImage(buffer, MAX_NAI_UPSCALE_INPUT_PIXELS);
    const settings = getSettings();
    // Upscale lives on the API host (api.novelai.net), NOT the image host, and
    // returns a ZIP archive (same as generate-image), not a raw PNG.
    const apiBaseUrl = normalizeBaseUrl(settings.apiBaseUrl, "https://api.novelai.net");
    const res = await requestWithRetry(
      () =>
        axios.post(
          `${apiBaseUrl}/ai/upscale`,
          {
            image: preparedImage.base64,
            width: preparedImage.width,
            height: preparedImage.height,
            scale,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              Accept: "application/zip, application/octet-stream, image/png",
            },
            responseType: "arraybuffer",
            timeout: 180_000,
            signal: abort.signal,
            ...proxyConfig("nai"),
          },
        ),
      { signal: abort.signal },
    );

    // Response is usually a ZIP containing the upscaled PNG; fall back to raw bytes.
    let outBuffer: Buffer;
    try {
      const images = await extractImages(res.data);
      outBuffer = images.length > 0 ? images[0] : Buffer.from(res.data);
    } catch {
      outBuffer = Buffer.from(res.data); // not a zip — treat as raw image bytes
    }
    if (outBuffer.length === 0) {
      return { ok: false, message: "超分返回了空数据。" };
    }

    const now = new Date();
    const date = dateStamp(now);
    const dir = path.join(settings.outputDir, date);
    await fs.mkdir(dir, { recursive: true });
    const baseName = path.basename(workbenchImagePath, path.extname(workbenchImagePath)).replace(/[^\w.-]+/g, "-");
    const filePath = path.join(dir, `${now.getTime()}-upscale${scale}x-${baseName}.png`);
    await fs.writeFile(filePath, outBuffer);
    const outDims = readImageDimensions(outBuffer);
    const outWidth = outDims.width || preparedImage.width * scale;
    const outHeight = outDims.height || preparedImage.height * scale;
    const item: HistoryItem = {
      id: crypto.randomUUID(),
      filePath,
      fileUrl: pathToFileURL(filePath).toString(),
      date,
      createdAt: now.toISOString(),
      params: { ...DEFAULT_PARAMS, width: outWidth, height: outHeight, positivePrompt: "upscale" },
      actualSeed: 0,
      model: "upscale",
      width: outWidth,
      height: outHeight,
    };
    addHistory([item]);
    void refreshStoredAccount();
    const resizeNote = preparedImage.resized
      ? `原图 ${preparedImage.originalWidth}×${preparedImage.originalHeight} 超过 NovelAI 超分输入上限，已先缩至 ${preparedImage.width}×${preparedImage.height} 后执行。`
      : "";
    return { ok: true, message: `超分 ${scale}x 完成。${resizeNote}`, item };
  } catch (error: any) {
    if (axios.isCancel(error) || error?.code === "ERR_CANCELED") return { ok: false, message: "超分已取消。" };
    const status = error?.response?.status;
    const detail = responseErrorText(error) || "未知错误";
    const hint = /resolution too high/i.test(detail)
      ? "NovelAI 超分只接受约 1024×1024 等效面积以内的输入；程序会自动缩小后重试，如仍失败请换更小的图片。"
      : "";
    return { ok: false, message: `超分失败${status ? `（HTTP ${status}）` : ""}：${detail}${hint ? ` ${hint}` : ""}` };
  } finally {
    currentAbort = null;
  }
}

export async function augmentImg(tool: DirectorTool, options: AugmentOptions): Promise<GenerateResult> {
  const token = getToken();
  if (!token) return { ok: false, message: "请先配置 API Token。", items: [] };
  if (!workbenchImagePath) return { ok: false, message: "请先加载图片。", items: [] };

  currentAbort?.abort();
  currentAbort = new AbortController();

  try {
    const { buffer, image } = await readWorkbenchImage();
    if (!image.width || !image.height) {
      return { ok: false, message: "无法读取图片尺寸，请重新加载图片。", items: [] };
    }
    const preparedImage = prepareLimitedImage(buffer, MAX_NAI_DIRECTOR_INPUT_PIXELS, {
      flattenAlpha: true,
      forcePng: true,
    });
    const settings = getSettings();
    const imageBaseUrl = normalizeBaseUrl(settings.imageBaseUrl, "https://image.novelai.net");
    const payload: Record<string, unknown> = {
      image: preparedImage.base64,
      width: preparedImage.width,
      height: preparedImage.height,
      req_type: tool,
      defry: Math.min(5, Math.max(0, options.defry)),
    };

    if (tool === "colorize") {
      payload.prompt = options.colorizePrompt;
    }
    if (tool === "emotion") {
      payload.prompt = `${options.emotion};;${Math.min(5, Math.max(0, options.emotionLevel))}`;
    }

    const res = await axios.post(`${imageBaseUrl}/ai/augment-image`, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/zip, application/octet-stream",
      },
      responseType: "arraybuffer",
      timeout: 180_000,
      signal: currentAbort.signal,
      ...proxyConfig("nai"),
    });

    const buffers = await extractImages(res.data);
    if (buffers.length === 0) return { ok: false, message: "后期处理成功但无图片返回。", items: [] };
    const outputBuffers = preparedImage.resized
      ? buffers.map((buffer) => resizeImageBufferToPng(buffer, preparedImage.originalWidth, preparedImage.originalHeight))
      : buffers;
    const historyParams: GenerateParams = {
      ...DEFAULT_PARAMS,
      positivePrompt: `director:${tool}`,
      width: preparedImage.originalWidth,
      height: preparedImage.originalHeight,
    };
    const items = await saveBuffers(outputBuffers, historyParams, 0, `director-${tool}`, `director-${tool}`);
    void refreshStoredAccount();
    const resizeNote = preparedImage.resized
      ? `原图 ${preparedImage.originalWidth}×${preparedImage.originalHeight} 超过后期接口稳态尺寸，已先缩至 ${preparedImage.width}×${preparedImage.height} 处理，并恢复到原尺寸。`
      : "";
    return { ok: true, message: `后期处理完成，已保存 ${items.length} 张图片。${resizeNote}`, items };
  } catch (error: any) {
    return handleGenerateError(error, "后期处理失败");
  } finally {
    currentAbort = null;
  }
}

function handleGenerateError(error: any, prefix: string): GenerateResult {
  if (axios.isCancel(error) || error?.code === "ERR_CANCELED") {
    return { ok: false, message: "操作已取消。", items: [], failureKind: "cancelled" };
  }
  const status = error?.response?.status;
  const failureKind =
    status === 401 || status === 403
      ? "auth"
      : status === 400 || status === 422
        ? "reference"
        : status
          ? "api"
          : "validation";
  const authHint =
    failureKind === "auth"
      ? `NovelAI 鉴权失败${status ? `（HTTP ${status}）` : ""}：请在设置页重新粘贴并验证 Persistent API Token，并确认 Image Endpoint 为 https://image.novelai.net。`
      : "";
  const detail = responseErrorText(error) || "未知错误";
  return {
    ok: false,
    message: authHint || `${prefix}${status ? `（HTTP ${status}）` : ""}：${detail}`,
    items: [],
    failureKind,
    statusCode: status,
  };
}

export function cancelGeneration() {
  currentAbort?.abort();
  currentAbort = null;
  return { ok: true };
}

function localSuggestTags(prompt: string): TagSuggestion[] {
  const query = prompt.trim().toLowerCase().replace(/_/g, " ");
  if (!query) return [];
  const isCjk = /[㐀-鿿]/.test(query);

  return TAG_DICTIONARY.map((item) => {
    // Chinese input matches Chinese keywords; latin input matches tag/aliases.
    const terms = isCjk
      ? [item.zh, ...(item.keywords ?? [])]
      : [item.tag, ...(item.aliases ?? [])].map((x) => x.toLowerCase().replace(/_/g, " "));
    let score = 0;
    for (const term of terms) {
      const t = term.toLowerCase();
      if (t === query) score = Math.max(score, 3);
      else if (t.startsWith(query)) score = Math.max(score, 2);
      else if (t.includes(query)) score = Math.max(score, 1);
    }
    return { item, score };
  })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.item.count - a.item.count)
    .slice(0, 12)
    .map(({ item }) => ({
      tag: item.tag,
      count: item.count,
      category: item.category,
      description: item.zh,
    }));
}

/** Tag autocomplete — calls NAI suggest-tags endpoint, with local fallback when API is unavailable. */
export async function suggestTags(model: string, prompt: string): Promise<TagSuggestion[]> {
  const token = getToken();
  if (!prompt.trim()) return [];
  const fallback = localSuggestTags(prompt);
  const serverTags = await queryTagServer(prompt, 12);
  if (serverTags.length > 0) return serverTags;
  if (!token) return fallback;
  const settings = getSettings();
  const apiBaseUrl = normalizeBaseUrl(settings.apiBaseUrl, "https://api.novelai.net");
  try {
    const res = await axios.get(`${apiBaseUrl}/ai/generate-image/suggest-tags`, {
      params: { model, prompt },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 5000,
      ...proxyConfig("nai"),
    });
    const tags = (res.data?.tags ?? []) as TagSuggestion[];
    return tags.length > 0 ? tags : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Translate text (e.g. Chinese -> English). Provider is chosen in settings:
 * "google" uses the public gtx endpoint (no key); "baidu" uses the Baidu
 * translate open API (needs appid + secret). Runs in the main process to avoid
 * CORS. Returns the translated string, or an error message on failure.
 */
export async function translateText(
  text: string,
  target = "en",
): Promise<{ ok: boolean; text?: string; error?: string }> {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return { ok: false, error: "没有可翻译的内容。" };
  const settings = getSettings();
  if (settings.translateProvider === "baidu") {
    return baiduTranslate(trimmed, target, settings.baiduAppId.trim(), settings.baiduSecret.trim());
  }
  return googleTranslate(trimmed, target);
}

async function googleTranslate(
  text: string,
  target: string,
): Promise<{ ok: boolean; text?: string; error?: string }> {
  try {
    const res = await axios.get("https://translate.googleapis.com/translate_a/single", {
      params: { client: "gtx", sl: "auto", tl: target, dt: "t", q: text },
      timeout: 8_000,
      ...proxyConfig("translate"),
    });
    // Response shape: [[[ "translated", "source", ... ], ...], ...]
    const segments = (res.data?.[0] ?? []) as Array<[string, string, ...unknown[]]>;
    const out = segments.map((s) => s?.[0] ?? "").join("").trim();
    if (!out) return { ok: false, error: "谷歌翻译结果为空。" };
    return { ok: true, text: out };
  } catch (error: any) {
    return { ok: false, error: error?.message ? `谷歌翻译失败：${error.message}` : "谷歌翻译失败，请检查网络（可能需要代理）。" };
  }
}

async function baiduTranslate(
  text: string,
  target: string,
  appid: string,
  secret: string,
): Promise<{ ok: boolean; text?: string; error?: string }> {
  if (!appid || !secret) {
    return { ok: false, error: "请先在设置中填写百度翻译 APP ID 与密钥。" };
  }
  // Baidu expects "zh"/"en" language codes and a salt+sign signature.
  const to = target === "en" ? "en" : target === "zh" || target === "zh-CN" ? "zh" : target;
  const salt = String(Date.now());
  const sign = crypto.createHash("md5").update(appid + text + salt + secret).digest("hex");
  try {
    const res = await axios.get("https://fanyi-api.baidu.com/api/trans/vip/translate", {
      params: { q: text, from: "auto", to, appid, salt, sign },
      timeout: 8_000,
      ...proxyConfig("translate"),
    });
    if (res.data?.error_code) {
      return { ok: false, error: `百度翻译失败：${res.data.error_code} ${res.data.error_msg ?? ""}` };
    }
    const out = (res.data?.trans_result ?? [])
      .map((r: { dst?: string }) => r?.dst ?? "")
      .join("\n")
      .trim();
    if (!out) return { ok: false, error: "百度翻译结果为空。" };
    return { ok: true, text: out };
  } catch (error: any) {
    return { ok: false, error: error?.message ? `百度翻译失败：${error.message}` : "百度翻译失败，请检查网络。" };
  }
}
