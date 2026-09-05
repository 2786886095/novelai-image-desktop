import { app, dialog, nativeImage } from "electron";
import axios from "axios";
import FormData from "form-data";
import JSZip from "jszip";
import { PNG } from "pngjs";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { toLocalMediaUrl } from "./local-media-protocol";
import {
  DEFAULT_PARAMS,
  isNAIV4PlusModel,
  isNAIV5Model,
  maxNAICharacterPrompts,
  MAX_NAI_SEED,
  normalizeGenerateParams,
  NAI_INPAINT_MODELS,
  supportsNAIPreciseReference,
  supportsNAIVibeTransfer,
  supportsNAIVariety,
  MAX_NAI_DIRECTOR_INPUT_PIXELS,
  MAX_NAI_UPSCALE_INPUT_PIXELS,
  MAX_NAI_UPSCALE_OUTPUT_DIMENSION,
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
  type ComicReferenceKind,
  type TagComicExportZipRequest,
  type TagComicGenerateRequest,
  type TagComicReferenceImportRequest,
  type TagComicReferenceImportResult,
  type BatchRedrawRequest,
  type DirectorTool,
  type GenerateExtras,
  type GenerateParams,
  type GenerateResult,
  type GenerationPreviewEvent,
  type HistoryItem,
  type I2IParams,
  type LoadImageResult,
  type NAIInpaintModel,
  type PreciseReferenceItem,
  type PreciseReferenceType,
  type ReversePromptScope,
  type VibeTransferItem,
  type SingleImageResult,
  type TagSuggestion,
  type TokenStatus,
  type UpscaleScale,
  type WorkingImage,
} from "../../src/types";
import { inspectImageMetadata, parseImageMeta } from "../../src/png-meta";
import { calculateFeatureAnlasQuote } from "../../src/anlas";
import { compactRemoteErrorText } from "../../src/error-message";
import { buildComicLocalPrompt, isComicPromptRefusal } from "../../src/comic/prompt-fallback";
import {
  addHistory,
  ensureHistoryGroup,
  getAccountSummary,
  getHistoryGroups,
  getSettings,
  getToken,
  setAccountSummary,
  setToken,
  updateHistoryItem,
} from "./store";
import { TAG_DICTIONARY } from "../data/tag-dictionary";
import { mcpSearch } from "./mcp-client";
import { searchDanbooru } from "./danbooru-tags";
import { logError, logInfo, appendLog } from "./logger";
import { zhForTag } from "../../src/prompt-data";
import { proxyConfig } from "./proxy";
import { injectDshImageAiSystemPrompt } from "./dsh-reverse-convert";
import {
  COMIC_ANALYZE_SYSTEM_PROMPT,
  CONVERT_SYSTEM_PROMPTS,
  REVERSE_SYSTEM_PROMPTS,
  SCOPED_REVERSE_SYSTEM_PROMPTS,
} from "../../src/data/prompt-templates";
import {
  V45_CONVERT_SYSTEM_PROMPTS,
  V45_REVERSE_SYSTEM_PROMPTS,
  V45_SCOPED_REVERSE_SYSTEM_PROMPTS,
} from "../../src/data/prompt-templates-v45";
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
import { beginJob, cancelAllJobs } from "./job-registry";
import { NaiSseFrameDecoder, NaiStreamFrameDecoder, type NaiStreamFrame } from "./nai-stream";

let workbenchImagePath: string | null = null;

function normalizeBaseUrl(url: string, fallback: string) {
  const value = (url || fallback).trim().replace(/\/+$/, "");
  return value.length > 0 ? value : fallback;
}

// Only official NovelAI hosts (and localhost, for local proxies/mirrors a user
// runs themselves) may receive the Bearer token unless the user explicitly opts
// into a custom endpoint. Prevents a mistyped/hostile endpoint from exfiltrating
// the token.
export function isOfficialNaiHost(baseUrl: string): boolean {
  try {
    const { hostname, protocol } = new URL(baseUrl);
    const host = hostname.toLowerCase();
    const isNovelAi = host === "novelai.net" || host.endsWith(".novelai.net");
    // The real API only ever runs on HTTPS — matching the hostname alone would
    // let a plain http:// URL (e.g. a misconfigured or malicious proxy) still
    // count as "official" and carry the Bearer token in the clear.
    if (isNovelAi) return protocol === "https:";
    // Loopback stays allowed over plain HTTP: it's for local dev/reverse-proxy
    // setups where the traffic never leaves the machine.
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

// Returns a token-safe base URL: the configured endpoint when it is trusted (or
// the user opted into custom endpoints), otherwise the official fallback.
function tokenSafeBaseUrl(rawUrl: string, fallback: string): string {
  const resolved = normalizeBaseUrl(rawUrl, fallback);
  if (isOfficialNaiHost(resolved)) {
    try {
      const resolvedHost = new URL(resolved).hostname.toLowerCase();
      const fallbackHost = new URL(fallback).hostname.toLowerCase();
      const loopback = resolvedHost === "localhost" || resolvedHost === "127.0.0.1" || resolvedHost === "::1";
      if (loopback || resolvedHost === fallbackHost) return resolved;
      // A custom-endpoint opt-in must not turn an accidentally swapped official
      // NovelAI subdomain into a valid target. api.novelai.net and
      // image.novelai.net are not interchangeable and stale settings here can
      // surface as opaque generation HTTP 500 responses.
      const isNovelAi = resolvedHost === "novelai.net" || resolvedHost.endsWith(".novelai.net");
      if (isNovelAi) return fallback;
    } catch {
      /* fall through to the configured custom-endpoint policy */
    }
  }
  if (getSettings().allowCustomEndpoint) return resolved;
  appendLog(
    "WARN",
    `[security] refusing to send token to non-official endpoint ${resolved}; using ${fallback}.`,
  );
  return fallback;
}

/** Resolve the dedicated upscaler endpoint.
 *
 * NovelAI currently serves POST /ai/upscale from image.novelai.net.  Keeping
 * this separate from the account API endpoint prevents the deterministic
 * `Cannot POST /ai/upscale` response returned by api.novelai.net.
 */
export function resolveUpscaleBaseUrl(rawImageBaseUrl: string): string {
  return tokenSafeBaseUrl(rawImageBaseUrl, "https://image.novelai.net");
}

const UPSCALE_MODELS = new Set([
  "nai-diffusion-5-full",
  "nai-diffusion-5-curated",
  "nai-diffusion-4-5-curated",
  "nai-diffusion-4-full",
  "nai-diffusion-4-curated",
  "nai-diffusion-3",
  "nai-diffusion-3-furry",
]);

const UPSCALE_MODEL_ALIASES = new Map<string, string>([
  // The standalone upscaler rejects V4.5 Full. The paired Curated model uses
  // the same upscaler while keeping the request in the V4.5 model family.
  ["nai-diffusion-4-5-full", "nai-diffusion-4-5-curated"],
]);

/** Normalize the current generation model for the dedicated upscale API.
 *
 * The current contract requires exactly `image` + `model`; width, height and
 * scale are no longer request fields. Inpainting suffixes and the legacy furry
 * spelling are renderer-side aliases and must not reach the API.
 */
export function resolveUpscaleModel(rawModel: string): string {
  const normalized = normalizeModel(String(rawModel || "").trim());
  const candidate = normalized === "nai-diffusion-furry-3"
    ? "nai-diffusion-3-furry"
    : normalized;
  const compatibleModel = UPSCALE_MODEL_ALIASES.get(candidate) ?? candidate;
  return UPSCALE_MODELS.has(compatibleModel)
    ? compatibleModel
    : "nai-diffusion-5-curated";
}

export function resolveUpscaleOutputSize(
  width: number,
  height: number,
  scale: UpscaleScale,
) {
  const outputWidth = width * scale;
  const outputHeight = height * scale;
  return {
    width: outputWidth,
    height: outputHeight,
    exceedsLimit:
      outputWidth > MAX_NAI_UPSCALE_OUTPUT_DIMENSION ||
      outputHeight > MAX_NAI_UPSCALE_OUTPUT_DIMENSION,
  };
}

function tierName(tier?: number) {
  return tier === 3
    ? "Opus"
    : tier === 2
      ? "Scroll"
      : tier === 1
        ? "Tablet"
        : tier === 0
          ? "Paper"
          : "未知";
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value))
    return Math.round(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return undefined;
}

function readFinite(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseAccount(data: any): Omit<AccountSummary, "hasToken"> {
  // The website payload has changed wrappers before. Read the same
  // subscription object whether /user/data returns it at the top level or
  // inside `information`/`data`, without inventing allowance values.
  const sub =
    data?.subscription ??
    data?.information?.subscription ??
    data?.data?.subscription ??
    data?.data?.information?.subscription ??
    {};
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
    const seconds =
      rawExpires > 10_000_000_000 ? Math.floor(rawExpires / 1000) : rawExpires;
    expiresAt = new Date(seconds * 1000).toISOString().slice(0, 10);
  }

  const rawUsage = sub?.usage;
  const usagePercent = readFinite(rawUsage?.percent);
  const usageSeconds = readFinite(rawUsage?.timeUntilNextPercent);
  const opusUsage = rawUsage && usagePercent !== undefined && usageSeconds !== undefined
    ? {
        percent: usagePercent,
        isNegative: rawUsage.isNegative === true,
        timeUntilNextPercent: Math.max(0, usageSeconds),
      }
    : undefined;

  return {
    tierName: tierName(tierLevel),
    tierLevel,
    anlasBalance,
    expiresAt,
    hasActiveSubscription: Boolean(active && tierLevel && tierLevel > 0),
    opusUsage,
    opusUsageUpdatedAt: opusUsage ? Date.now() : undefined,
  };
}

async function fetchAccount(
  token: string,
): Promise<Omit<AccountSummary, "hasToken">> {
  const settings = getSettings();
  // NovelAI now rejects /user/data on api.novelai.net for at least some accounts
  // with a 400 telling third-party tools to "update to the image URL" — confirmed
  // live that image.novelai.net serves the identical payload successfully.
  const imageBaseUrl = tokenSafeBaseUrl(
    settings.imageBaseUrl,
    "https://image.novelai.net",
  );
  const res = await axios.get(`${imageBaseUrl}/user/data`, {
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
    // This is the account route used by the official image web client. It may
    // wrap the subscription payload differently across deployments, which is
    // why parseAccount accepts all observed wrappers above.
    const account = await fetchAccount(normalized);

    setToken(normalized);
    setAccountSummary(account);
    return { valid: true, message: "API Token 验证成功。", ...account };
  } catch (error: any) {
    const status = error?.response?.status;
    const text = responseErrorText(error);
    return {
      valid: false,
      message:
        status === 401
          ? "Token 无效或已过期。"
          : `Token 验证失败：${text || "网络错误"}`,
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
    // Live refresh failed — return the last known summary but flag it as stale so
    // the UI can show "缓存余额" instead of presenting an outdated number as current.
    return { ...getAccountSummary(), stale: true };
  }
}

function isV4Plus(model: string) {
  return isNAIV4PlusModel(model);
}

function usesModernStructuredPrompt(model: string) {
  return isNAIV4PlusModel(model);
}

function normalizeModel(model: string) {
  return model.endsWith("-inpainting")
    ? model.slice(0, -"-inpainting".length)
    : model;
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
  if (model === "nai-diffusion-5-curated-inpainting") {
    candidates.push("nai-diffusion-5-full-inpainting");
  } else if (model === "nai-diffusion-4-5-curated-inpainting") {
    candidates.push("nai-diffusion-4-5-full-inpainting");
  } else if (model === "nai-diffusion-4-curated-inpainting") {
    candidates.push("nai-diffusion-4-full-inpainting");
  }
  return [...new Set(candidates)];
}

function isInpaintModelCompatibilityError(error: any): boolean {
  const status = error?.response?.status;
  if (status !== 400 && status !== 422) return false;
  const detail = responseErrorText(error) || error?.message || "";
  return /(?:doesn'?t|does not|not)\s+support|unsupported|invalid\s+model|action\s+infill/i.test(
    detail,
  );
}

function qualityTags(
  model: string,
  preset: GenerateParams["qualityPreset"] = "standard",
  positivePrompt = "",
) {
  if (preset === "none") return "";
  let tags = "";
  if (preset === "light" && isNAIV5Model(model)) {
    tags = "very aesthetic, amazing quality, no text";
  } else {
    tags = switchQualityTags(model);
  }

  // NovelAI's official quality presets contain `no text`. Keeping it beside
  // V5's explicit `Text:` directive makes the request contradict itself and
  // measurably suppresses requested lettering.
  if (/(?:^|[\s,;|])Text\s*:\s*\S/i.test(positivePrompt)) {
    tags = tags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => !/^no text$/i.test(tag))
      .join(", ");
  }
  return tags;
}

function switchQualityTags(model: string) {
  switch (normalizeModel(model)) {
    case "nai-diffusion-5-full":
    case "nai-diffusion-5-curated":
      return "very aesthetic, masterpiece, no text";
    case "nai-diffusion-4-5-full":
      return "very aesthetic, masterpiece, no text";
    case "nai-diffusion-4-5-curated":
      return "very aesthetic, masterpiece, no text, -0.8::feet::, rating:general";
    case "nai-diffusion-4-full":
      return "no text, best quality, very aesthetic, absurdres";
    case "nai-diffusion-4-curated":
      return "rating:general, best quality, very aesthetic, absurdres";
    case "nai-diffusion-3":
      return "best quality, amazing quality, very aesthetic, absurdres";
    default:
      return "";
  }
}

function ucPresetText(model: string, preset: number) {
  if (preset === 3) return "";
  const normalized = normalizeModel(model);
  // NovelAI's V5 frontend intentionally reuses the corresponding V4.5 Full /
  // Curated undesired-content presets.
  const key = normalized === "nai-diffusion-5-full"
    ? "nai-diffusion-4-5-full"
    : normalized === "nai-diffusion-5-curated"
      ? "nai-diffusion-4-5-curated"
      : normalized;
  if (preset === 2) {
    if (key === "nai-diffusion-4-5-full") {
      return "lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page, @_@, mismatched pupils, glowing eyes, bad anatomy";
    }
    if (key === "nai-diffusion-4-5-curated") {
      return "blurry, lowres, upscaled, artistic error, film grain, scan artifacts, bad anatomy, bad hands, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, @_@, mismatched pupils, glowing eyes, negative space, blank page";
    }
    if (key === "nai-diffusion-3") {
      return "lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract], bad anatomy, bad hands, @_@, mismatched pupils, heart-shaped pupils, glowing eyes";
    }
    return "";
  }
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
    for (const part of segment
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)) {
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

function normalizedCharCaptions(extras: GenerateExtras | undefined, model: string) {
  return (extras?.charCaptions ?? [])
    .map((c) => ({
      prompt: c.prompt.trim(),
      negativePrompt: c.negativePrompt?.trim() ?? "",
      useCoords: Boolean(c.useCoords),
      x: finiteClamped(Number(c.x), 0.5),
      y: finiteClamped(Number(c.y), 0.5),
    }))
    .filter((c) => c.prompt.length > 0)
    .slice(0, maxNAICharacterPrompts(model));
}

function hasCharCaptions(extras: GenerateExtras | undefined, model: string) {
  return normalizedCharCaptions(extras, model).length > 0;
}

function shouldRetryCharCaptionsAsPipe(
  error: any,
  params: GenerateParams,
  extras?: GenerateExtras,
) {
  const status = error?.response?.status;
  return (
    isV4Plus(params.model) &&
    hasCharCaptions(extras, params.model) &&
    (status === 400 || status === 422)
  );
}

function withPipeCharCaptions(
  basePrompt: string,
  captions: ReturnType<typeof normalizedCharCaptions>,
) {
  if (captions.length === 0) return basePrompt;
  return [basePrompt, ...captions.map((c) => c.prompt)]
    .filter(Boolean)
    .join(" | ");
}

type PayloadParams = Omit<GenerateParams, "model"> & { model: string };

export function buildPayload(
  params: PayloadParams,
  actualSeed: number,
  extras?: GenerateExtras,
  charCaptionMode: CharCaptionMode = "structured",
) {
  // Persisted/imported JSON is untrusted at the process boundary. Keep the one
  // intentional inpaint model override while normalizing every other field.
  const inpaintModel = NAI_INPAINT_MODELS.some((item) => item.value === params.model)
    ? params.model
    : null;
  params = {
    ...normalizeGenerateParams(params as GenerateParams),
    ...(inpaintModel ? { model: inpaintModel } : {}),
  } as PayloadParams;
  actualSeed = Math.min(MAX_NAI_SEED, Math.max(1, Math.round(Number(actualSeed) || 1)));
  const basePrompt = mergePrompt(params.stylePrompt, params.positivePrompt);
  // In the official client, Furry is a mode for every V4+ checkpoint rather
  // than a separate V4/V5 model. It is represented by placing `fur dataset,`
  // at the very start of the prompt. Keep the dedicated Furry V3 unchanged.
  const modePrompt =
    extras?.modelMode === "furry" && isV4Plus(params.model) &&
    !/(?:^|,\s*)fur dataset(?:\s*,|$)/i.test(basePrompt)
      ? mergePrompt("fur dataset", basePrompt)
      : basePrompt;
  const qualityPreset = params.qualityPreset ?? (params.qualityToggle ? "standard" : "none");
  const transparentBackground = isNAIV5Model(params.model) && params.transparentBackground;
  const qualityPrompt = mergePrompt(
    modePrompt,
    qualityTags(params.model, qualityPreset, modePrompt),
  );
  const effectivePrompt = transparentBackground
    ? mergePrompt(qualityPrompt, "transparent background")
    : qualityPrompt;
  const effectiveNegative = mergePrompt(
    params.negativePrompt,
    ucPresetText(params.model, params.ucPreset),
  );
  const v4Plus = isV4Plus(params.model);
  const cleanedCharCaptions = normalizedCharCaptions(extras, params.model);
  const inputPrompt =
    charCaptionMode === "pipe"
      ? withPipeCharCaptions(effectivePrompt, cleanedCharCaptions)
      : effectivePrompt;

  // Defensive clamp: NovelAI rejects CFG above its supported range. Dimensions
  // are snapped in the UI (img2img/inpaint override them with image-matched
  // sizes, so we must not re-snap here).
  const safeScale = Math.min(10, Math.max(0, Number(params.cfgScale) || 0));

  const v5 = isNAIV5Model(params.model);
  // The official V5 frontend does not expose a noise-schedule control and
  // normalizes every V5 request to Karras.  Do not derive it from the sampler:
  // doing so made DPM++ requests silently use Exponential and diverge from the
  // website even when every visible parameter matched.
  const effectiveNoiseSchedule = v5
    ? "karras"
    : params.noiseSchedule || "native";
  const parameters: Record<string, unknown> = {
    params_version: 4,
    width: params.width,
    height: params.height,
    scale: safeScale,
    sampler: params.sampler,
    steps: params.steps,
    n_samples: 1,
    seed: actualSeed,
    noise_schedule: effectiveNoiseSchedule,
    uc: effectiveNegative,
    negative_prompt: effectiveNegative,
    ucPreset: params.ucPreset,
    uc_preset: params.ucPreset,
    cfg_rescale: params.cfgRescale,
    legacy: false,
    legacy_v3_extend: false,
    dynamic_thresholding: v5 ? false : params.cfgRescale > 0,
    skip_cfg_above_sigma: null,
    qualityPresetId: qualityPreset,
    qualityToggle: qualityPreset !== "none",
    quality_toggle: qualityPreset !== "none",
    tag_hint_qt: qualityPreset === "standard" ? 1 : qualityPreset === "light" ? 3 : 0,
  };

  if (v5) {
    parameters.tag_hint_transparent_background = transparentBackground;
    parameters.straight_alpha = transparentBackground;
  }

  // "Variety+" is implemented by skipping CFG above a sigma threshold — NovelAI
  // has no boolean `variety` field, so the previous `variety: true` was a no-op.
  if (params.variety && supportsNAIVariety(params.model)) {
    parameters.skip_cfg_above_sigma = 58;
  }

  if (
    params.sampler === "k_euler_ancestral" &&
    effectiveNoiseSchedule !== "native"
  ) {
    parameters.deliberate_euler_ancestral_bug = false;
    parameters.prefer_brownian = true;
  }

  if (v4Plus) {
    const charCaptionsPayload = cleanedCharCaptions.map((c) => ({
      char_caption: c.prompt,
      // NovelAI still requires one center for AI-choice placement. An empty
      // centers array causes the V4/V4.5 endpoint to return HTTP 500 even when
      // use_coords is false. (0.5, 0.5) is the protocol's AI-choice sentinel.
      centers: [{ x: c.useCoords ? c.x : 0.5, y: c.useCoords ? c.y : 0.5 }],
    }));
    const negativeCharCaptionsPayload = cleanedCharCaptions.some((c) => c.negativePrompt)
      ? cleanedCharCaptions.map((c) => ({
          char_caption: c.negativePrompt,
          centers: [{ x: c.useCoords ? c.x : 0.5, y: c.useCoords ? c.y : 0.5 }],
        }))
      : [];
    const useStructuredChars = charCaptionMode === "structured";
    const useCoords =
      useStructuredChars && cleanedCharCaptions.some((c) => c.useCoords);

    parameters.use_coords = useCoords;
    parameters.v4_prompt = {
      caption: {
        base_caption:
          charCaptionMode === "pipe" ? inputPrompt : effectivePrompt,
        char_captions: useStructuredChars ? charCaptionsPayload : [],
      },
      use_coords: useCoords,
      use_order: true,
    };
    parameters.v4_negative_prompt = {
      caption: {
        base_caption: effectiveNegative,
        char_captions: useStructuredChars ? negativeCharCaptionsPayload : [],
      },
      use_coords: useCoords && negativeCharCaptionsPayload.length > 0,
      use_order: false,
      legacy_uc: !usesModernStructuredPrompt(params.model),
    };
  } else {
    parameters.sm = params.smea;
    parameters.sm_dyn = params.smea && params.smeaDyn;
  }

  // Vibe Transfer (reference_image_multiple) — legacy reference conditioning.
  if (supportsNAIVibeTransfer(params.model) && extras?.vibeImages && extras.vibeImages.length > 0) {
    parameters.reference_image_multiple = extras.vibeImages.map(
      (v) => v.base64,
    );
    parameters.reference_information_extracted_multiple = extras.vibeImages.map(
      (v) => v.infoExtracted,
    );
    parameters.reference_strength_multiple = extras.vibeImages.map(
      (v) => v.strength,
    );
  }

  // Precise / Director Reference — V4.5 only. Distinct from Vibe Transfer: uses
  // the director_reference_* fields with a type (character/style/character&style),
  // strength, and secondary strength derived from fidelity (1 - fidelity).
  const preciseRefs = extras?.preciseReferences ?? [];
  if (v4Plus && supportsNAIPreciseReference(params.model) && preciseRefs.length > 0) {
    // Confirmed against the official client's real request (F12 HAR): V4.5 precise
    // references are uploaded as multipart BINARY parts named director_ref_N (done
    // in postGenerateImage); the JSON references them via
    // director_reference_images_cached = [{cache_secret_key: sha256(bytes), data}],
    // and base_caption carries the TYPE. Our old director_reference_images:[base64]
    // in a JSON POST is silently ignored by the API — which is exactly why precise
    // reference had no effect regardless of base_caption. We keep the (preprocessed)
    // base64 here only as the byte source for the multipart parts.
    parameters.director_reference_images = preciseRefs.map((r) =>
      stripBase64Prefix(r.base64),
    );
    parameters.director_reference_images_cached = preciseRefs.map(
      (r, index) => ({
        cache_secret_key: crypto
          .createHash("sha256")
          .update(Buffer.from(stripBase64Prefix(r.base64), "base64"))
          .digest("hex"),
        data: `director_ref_${index}`,
      }),
    );
    parameters.normalize_reference_strength_multiple = true;
    parameters.director_reference_descriptions = preciseRefs.map((r) => ({
      caption: { base_caption: r.type || "character&style", char_captions: [] },
      legacy_uc: false,
    }));
    parameters.director_reference_strength_values = preciseRefs.map((r) =>
      round2(clamp01(r.strength, 1)),
    );
    parameters.director_reference_secondary_strength_values = preciseRefs.map(
      (r) => round2(clamp01(1 - r.fidelity, 0)),
    );
    // NovelAI's Precise Reference UI exposes only Strength and Fidelity.
    // Keep this compatibility transport field fixed instead of presenting a
    // third user-facing control or replaying stale values from older presets.
    parameters.director_reference_information_extracted = preciseRefs.map(() => 1);
    // Log the EXACT precise-reference fields we send (sans base64) so it can be
    // diffed against the official client's F12 "Copy request payload". This is an
    // unverified reverse-engineered shape — the log is how we confirm/correct it.
    logInfo(
      "precise-ref payload → " +
        JSON.stringify({
          model: params.model,
          director_reference_descriptions:
            parameters.director_reference_descriptions,
          director_reference_strength_values:
            parameters.director_reference_strength_values,
          director_reference_secondary_strength_values:
            parameters.director_reference_secondary_strength_values,
          director_reference_information_extracted:
            parameters.director_reference_information_extracted,
          director_reference_images: preciseRefs.map(
            (r) => `<base64 ${r.base64.length} chars>`,
          ),
        }),
    );
  }

  return {
    input: inputPrompt,
    model: params.model,
    action: "generate",
    parameters,
  };
}

/**
 * Cache of encode-vibe results. encode-vibe is a paid, deterministic endpoint:
 * the same raw image + model + information_extracted always yields the same vibe
 * encoding, so we cache by their hash to avoid re-encoding (and re-charging) the
 * same reference for every panel in a comic batch.
 */
const vibeEncodeCache = new Map<string, string>();

function clamp01(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Precise/Director reference: accept ANY size and replicate the OFFICIAL client
// preprocessing (per https://docs.novelai.net/en/image/precisereference): the
// feature "always uses one of those three image sizes" — 1024×1536 / 1472×1472 /
// 1536×1024 — and a smaller/bigger image is "upscaled/downscaled AND padded" to
// reach one of them. We pick the size whose ASPECT RATIO is closest to the
// source (so padding is minimal — the earlier grid artifacts came from forcing
// every image into 1024×1536, which over-padded landscapes), scale to fit, then
// black-pad the remainder. No cropping.
const DIRECTOR_REFERENCE_SIZES: Array<{ width: number; height: number }> = [
  { width: 1024, height: 1536 },
  { width: 1472, height: 1472 },
  { width: 1536, height: 1024 },
];

function prepareDirectorReferenceImage(
  rawBase64: string,
  index: number,
): string {
  const image = nativeImage.createFromBuffer(Buffer.from(rawBase64, "base64"));
  if (image.isEmpty()) {
    throw new Error(
      `精准参考图 #${index + 1} 无法解码，请换用有效的 PNG、JPG 或 WebP 图片。`,
    );
  }
  const { width, height } = image.getSize();
  if (!width || !height) {
    throw new Error(
      `精准参考图 #${index + 1} 尺寸无效，请换用有效的 PNG、JPG 或 WebP 图片。`,
    );
  }

  // Pick the official target whose aspect ratio best matches the source.
  const sourceAspect = width / height;
  const target = DIRECTOR_REFERENCE_SIZES.reduce((best, candidate) => {
    const bestDiff = Math.abs(best.width / best.height - sourceAspect);
    const candidateDiff = Math.abs(
      candidate.width / candidate.height - sourceAspect,
    );
    return candidateDiff < bestDiff ? candidate : best;
  }, DIRECTOR_REFERENCE_SIZES[0]);

  // Scale to FIT inside the target (preserve aspect), then center on a black canvas.
  const scale = Math.min(target.width / width, target.height / height);
  const fitW = Math.max(1, Math.round(width * scale));
  const fitH = Math.max(1, Math.round(height * scale));
  const fg = PNG.sync.read(
    image.resize({ width: fitW, height: fitH, quality: "best" }).toPNG(),
  );
  // Flatten any alpha onto WHITE and pad with WHITE. The reference encoder is fed
  // RGB only; transparent pixels in an RGBA PNG otherwise carry undefined/black
  // RGB that bleeds in as dark blotches, and a BLACK letterbox reads as image
  // content (the source of the earlier grid/line artifacts). White is the neutral
  // choice. (Hypothesis for the halftone/cross-hatch overlay — verify against the
  // official F12 payload before treating as settled.)
  let alphaPresent = false;
  const canvas = new PNG({ width: target.width, height: target.height });
  canvas.data.fill(255); // white, fully opaque
  const offsetX = Math.floor((target.width - fg.width) / 2);
  const offsetY = Math.floor((target.height - fg.height) / 2);
  for (let y = 0; y < fg.height; y += 1) {
    for (let x = 0; x < fg.width; x += 1) {
      const src = (y * fg.width + x) * 4;
      const dst = ((y + offsetY) * target.width + (x + offsetX)) * 4;
      const a = fg.data[src + 3] / 255;
      if (a < 1) alphaPresent = true;
      canvas.data[dst] = Math.round(fg.data[src] * a + 255 * (1 - a));
      canvas.data[dst + 1] = Math.round(fg.data[src + 1] * a + 255 * (1 - a));
      canvas.data[dst + 2] = Math.round(fg.data[src + 2] * a + 255 * (1 - a));
      canvas.data[dst + 3] = 255;
    }
  }
  logInfo(
    `precise-ref image #${index + 1}: src ${width}x${height}` +
      `${alphaPresent ? " RGBA→RGB(white-flattened)" : " RGB"} → ${target.width}x${target.height}` +
      ` (fit ${fitW}x${fitH}, white pad)`,
  );
  return PNG.sync.write(canvas).toString("base64");
}

function vibeCacheKey(
  rawBase64: string,
  model: string,
  infoExtracted: number,
): string {
  const hash = crypto.createHash("sha256").update(rawBase64).digest("hex");
  return `${model}|${infoExtracted}|${hash}`;
}

// How many of the request's vibe references are already encoded+cached this
// session (so they incur NO further encode charge). Used to make the pre-run
// quote accurate — re-generating with the same references won't re-encode.
function countCachedVibes(
  extras: GenerateExtras | undefined,
  params: GenerateParams | undefined,
): number {
  if (!extras?.vibeImages?.length || !params) return 0;
  let cached = 0;
  for (const vibe of extras.vibeImages) {
    const key = vibeCacheKey(
      stripBase64Prefix(vibe.base64),
      params.model,
      vibe.infoExtracted,
    );
    if (vibeEncodeCache.has(key)) cached += 1;
  }
  return cached;
}

/**
 * V4/V4.5 Vibe Transfer requires reference images to be pre-encoded through the
 * /ai/encode-vibe endpoint (legacy V3 accepted raw image bytes directly). For
 * V4+ models we encode each vibe and cache the result. If the endpoint fails we
 * now abort with a clear error instead of silently sending the raw image bytes —
 * the raw fallback produced a second downstream failure (or a silently wrong /
 * reference-less result) rather than a usable image.
 *
 * NOTE: needs verification against a live V4.5 token — the encode-vibe payload
 * shape is based on the NovelAI web client and may need adjustment.
 */
export async function prepareExtras(
  params: GenerateParams,
  extras?: GenerateExtras,
  signal?: AbortSignal,
): Promise<GenerateExtras | undefined> {
  if (!extras) return extras;

  // Precise/director references: any size accepted, preprocessed to the nearest
  // of NovelAI's three official sizes (scale-to-fit + black pad), matching the
  // official client.
  let preciseReferences = extras.preciseReferences;
  if (preciseReferences && preciseReferences.length > 0) {
    if (!supportsNAIPreciseReference(params.model)) {
      throw new Error(
        "精准参考当前仅支持 NovelAI V4.5；V5 首发尚未开放该功能。请切换到 V4.5 Full/Curated，或移除精准参考图。",
      );
    }
    preciseReferences = preciseReferences.map((ref, index) => ({
      ...ref,
      base64: prepareDirectorReferenceImage(
        stripBase64Prefix(ref.base64),
        index,
      ),
    }));
  }

  if (!extras.vibeImages || extras.vibeImages.length === 0) {
    return { ...extras, preciseReferences };
  }
  if (!supportsNAIVibeTransfer(params.model)) {
    throw new Error(
      "NovelAI V5 当前不支持氛围迁移（Vibe Transfer）；请切换到 V4.5，或移除氛围图。",
    );
  }
  if (!isV4Plus(params.model)) return { ...extras, preciseReferences }; // V3 path unchanged

  const token = getToken();
  const settings = getSettings();
  const imageBaseUrl = tokenSafeBaseUrl(
    settings.imageBaseUrl,
    "https://image.novelai.net",
  );

  const encoded = await Promise.all(
    extras.vibeImages.map(async (vibe) => {
      const rawBase64 = stripBase64Prefix(vibe.base64);
      const cacheKey = vibeCacheKey(
        rawBase64,
        params.model,
        vibe.infoExtracted,
      );
      const cached = vibeEncodeCache.get(cacheKey);
      if (cached) return { ...vibe, base64: cached };
      try {
        const res = await requestWithRetry(
          () =>
            axios.post(
              `${imageBaseUrl}/ai/encode-vibe`,
              {
                image: rawBase64,
                information_extracted: vibe.infoExtracted,
                model: params.model,
              },
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                responseType: "arraybuffer",
                timeout: 60_000,
                signal,
                ...proxyConfig("nai"),
              },
            ),
          // encode-vibe is a paid endpoint; only retry pre-charge 429s.
          { retries: 2, signal, retryStatuses: [429] },
        );
        const encodedBase64 = Buffer.from(res.data).toString("base64");
        vibeEncodeCache.set(cacheKey, encodedBase64);
        return { ...vibe, base64: encodedBase64 };
      } catch (error: any) {
        if (signal?.aborted) throw error;
        const detail = responseErrorText(error) || "未知错误";
        logError("[vibe] encode-vibe failed", detail);
        // Abort rather than send raw bytes — a failed encode cannot produce a
        // correct vibe-transfer result, so surface it instead of charging for
        // a wrong (or reference-less) image.
        throw new Error(`参考图编码失败（encode-vibe）：${detail}`);
      }
    }),
  );

  return { ...extras, vibeImages: encoded, preciseReferences };
}

async function extractImages(
  zipBytes: ArrayBuffer | Buffer,
): Promise<Buffer[]> {
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
  if (
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "png";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF") return "webp";
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
    return "jpg";
  return "png";
}

function responseErrorText(error: any) {
  const data = error?.response?.data;
  const status = Number(error?.response?.status);
  const source = Buffer.isBuffer(data)
    ? data.toString("utf8")
    : data instanceof ArrayBuffer
      ? Buffer.from(data).toString("utf8")
      : data ?? error?.message ?? "";
  return compactRemoteErrorText(source, {
    status: Number.isInteger(status) ? status : undefined,
    fallback: "网络错误",
    serviceLabel: "NovelAI API 源",
  });
}

function stripBase64Prefix(value: string) {
  const idx = value.indexOf(",");
  return idx >= 0 ? value.slice(idx + 1) : value;
}

const INPAINT_SIZE_MULTIPLE = 64;
const INPAINT_MASK_GRID_SIZE = 8;
const INPAINT_BLEND_DILATE_CELLS = 4;
const INPAINT_BLEND_BLUR_RADIUS = 20;
const INPAINT_BLEND_BLUR_PASSES = 2;

export interface PreparedInpaintAssets {
  imageBase64: string;
  maskBase64: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  resized: boolean;
  /** Normalized source resized to the request dimensions, as in NovelAI's editor. */
  sourcePng: Buffer;
  /** Official-client-style feathered mask, one alpha byte per request pixel. */
  blendAlpha: Uint8Array;
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
  if (!width || !height || pixels <= maxPixels)
    return { width, height, resized: false };
  const ratio = Math.sqrt(maxPixels / pixels);
  return {
    width: Math.max(1, Math.floor(width * ratio)),
    height: Math.max(1, Math.floor(height * ratio)),
    resized: true,
  };
}

function bufferToPng(buffer: Buffer) {
  if (
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return buffer;
  }
  const image = nativeImage.createFromBuffer(buffer);
  if (image.isEmpty())
    throw new Error("无法解码原图，请换用 PNG/JPG/WebP 图片。");
  return image.toPNG();
}

function flattenPngAlpha(
  buffer: Buffer,
  background = { r: 255, g: 255, b: 255 },
) {
  const png = PNG.sync.read(buffer);
  for (let idx = 0; idx < png.data.length; idx += 4) {
    const alpha = png.data[idx + 3] / 255;
    if (alpha >= 1) continue;
    png.data[idx] = Math.round(
      png.data[idx] * alpha + background.r * (1 - alpha),
    );
    png.data[idx + 1] = Math.round(
      png.data[idx + 1] * alpha + background.g * (1 - alpha),
    );
    png.data[idx + 2] = Math.round(
      png.data[idx + 2] * alpha + background.b * (1 - alpha),
    );
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
  if (source.isEmpty())
    throw new Error("无法解码图片，请换用 PNG/JPG/WebP 图片。");
  const size = source.getSize();
  const fitted = fitWithinPixels(size.width, size.height, maxPixels);
  let output = buffer;
  if (fitted.resized) {
    output = source
      .resize({ width: fitted.width, height: fitted.height, quality: "best" })
      .toPNG();
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
  if (nativeImage?.createFromBuffer) {
    const image = nativeImage.createFromBuffer(buffer);
    if (!image.isEmpty()) {
      return image.resize({ width, height, quality: "best" }).toPNG();
    }
  }
  // Vitest and a few headless Electron contexts do not expose nativeImage.
  // Keep the official resize behavior available instead of falling back to
  // edge padding; the 64-alignment resize is normally only a few percent.
  const source = PNG.sync.read(bufferToPng(buffer));
  if (source.width === width && source.height === height) return PNG.sync.write(source);
  const target = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.max(
      0,
      Math.min(source.height - 1, ((y + 0.5) * source.height) / height - 0.5),
    );
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(source.height - 1, y0 + 1);
    const fy = sourceY - y0;
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.max(
        0,
        Math.min(source.width - 1, ((x + 0.5) * source.width) / width - 0.5),
      );
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(source.width - 1, x0 + 1);
      const fx = sourceX - x0;
      const dst = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const top =
          source.data[(y0 * source.width + x0) * 4 + channel] * (1 - fx) +
          source.data[(y0 * source.width + x1) * 4 + channel] * fx;
        const bottom =
          source.data[(y1 * source.width + x0) * 4 + channel] * (1 - fx) +
          source.data[(y1 * source.width + x1) * 4 + channel] * fx;
        target.data[dst + channel] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return PNG.sync.write(target);
}

function prepareLatentInpaintMask(
  mask: PNG,
  targetWidth: number,
  targetHeight: number,
) {
  const width = targetWidth / INPAINT_MASK_GRID_SIZE;
  const height = targetHeight / INPAINT_MASK_GRID_SIZE;
  const selected = new Uint8Array(width * height);
  let any = false;
  // New editor masks encode selection in alpha. Keep a brightness fallback for
  // masks exported by older Langbai builds, where every pixel was opaque.
  let usesAlpha = false;
  for (let index = 3; index < mask.data.length; index += 4) {
    if (mask.data[index] !== 255) {
      usesAlpha = true;
      break;
    }
  }

  for (let cellY = 0; cellY < height; cellY += 1) {
    for (let cellX = 0; cellX < width; cellX += 1) {
      // The official client first resizes to the 1/8 latent grid with nearest
      // sampling, then thresholds alpha at 155. Sampling one source pixel per
      // destination cell avoids the over-wide "any painted pixel in 8x8" mask.
      const sourceX = Math.min(
        mask.width - 1,
        Math.floor(((cellX + 0.5) * mask.width) / width),
      );
      const sourceY = Math.min(
        mask.height - 1,
        Math.floor(((cellY + 0.5) * mask.height) / height),
      );
      const sourceIndex = (sourceY * mask.width + sourceX) * 4;
      const alpha = mask.data[sourceIndex + 3];
      const brightest = Math.max(
        mask.data[sourceIndex],
        mask.data[sourceIndex + 1],
        mask.data[sourceIndex + 2],
      );
      const active = usesAlpha ? alpha > 155 : alpha > 0 && brightest > 155;

      const latentIndex = cellY * width + cellX;
      selected[latentIndex] = active ? 1 : 0;
      any ||= active;
    }
  }

  if (!any) throw new Error("蒙版为空，请先涂抹需要重绘的区域。");
  // The official editor quantizes on a 1/8-resolution canvas, but its request
  // pipeline expands that binary grid back to the requested image dimensions
  // with nearest-neighbour sampling before upload. Sending the tiny latent PNG
  // itself makes the API reinterpret/resize the mask and can severely degrade
  // the inpainted region (large flat blobs, text, or unrelated content).
  const requestMask = new PNG({ width: targetWidth, height: targetHeight });
  for (let y = 0; y < targetHeight; y += 1) {
    const cellY = Math.min(height - 1, Math.floor(y / INPAINT_MASK_GRID_SIZE));
    for (let x = 0; x < targetWidth; x += 1) {
      const cellX = Math.min(width - 1, Math.floor(x / INPAINT_MASK_GRID_SIZE));
      const value = selected[cellY * width + cellX] ? 255 : 0;
      const rgbaIndex = (y * targetWidth + x) * 4;
      requestMask.data[rgbaIndex] = value;
      requestMask.data[rgbaIndex + 1] = value;
      requestMask.data[rgbaIndex + 2] = value;
      requestMask.data[rgbaIndex + 3] = 255;
    }
  }
  return { png: PNG.sync.write(requestMask), selected, width, height };
}

function dilateLatentMask(
  source: Uint8Array,
  width: number,
  height: number,
  radius: number,
) {
  const output = new Uint8Array(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let active = false;
      for (let dy = -radius; dy <= radius && !active; dy += 1) {
        const sy = y + dy;
        if (sy < 0 || sy >= height) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const sx = x + dx;
          if (sx >= 0 && sx < width && source[sy * width + sx] !== 0) {
            active = true;
            break;
          }
        }
      }
      output[y * width + x] = active ? 1 : 0;
    }
  }
  return output;
}

function officialBoxBlurAlpha(
  source: Uint8Array,
  width: number,
  height: number,
  radius: number,
) {
  const horizontal = new Int32Array(source.length);
  const output = new Uint8Array(source.length);

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let sum = source[row] * radius;
    for (let x = 0; x <= radius && x < width; x += 1) sum += source[row + x];
    for (let x = 0; x < width; x += 1) {
      horizontal[row + x] = sum;
      const removeX = Math.max(0, x - radius);
      const addX = Math.min(width - 1, x + radius + 1);
      sum -= source[row + removeX];
      sum += source[row + addX];
    }
  }

  for (let x = 0; x < width; x += 1) {
    let sum = horizontal[x] * radius;
    for (let y = 0; y <= radius && y < height; y += 1) {
      sum += horizontal[y * width + x];
    }
    for (let y = 0; y < height; y += 1) {
      // NovelAI's worker uses the integer approximation 39 / 65536 for the
      // 41x41 (radius 20) box average. Preserve that result byte-for-byte.
      output[y * width + x] = Math.max(
        0,
        Math.min(255, (sum * 39) >> 16),
      );
      const removeY = Math.max(0, y - radius);
      const addY = Math.min(height - 1, y + radius + 1);
      sum -= horizontal[removeY * width + x];
      sum += horizontal[addY * width + x];
    }
  }
  return output;
}

function buildInpaintBlendAlpha(
  latentMask: Uint8Array,
  latentWidth: number,
  latentHeight: number,
  width: number,
  height: number,
) {
  const dilated = dilateLatentMask(
    latentMask,
    latentWidth,
    latentHeight,
    INPAINT_BLEND_DILATE_CELLS,
  );
  let alpha = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const cellY = Math.min(latentHeight - 1, Math.floor(y / INPAINT_MASK_GRID_SIZE));
    for (let x = 0; x < width; x += 1) {
      const cellX = Math.min(latentWidth - 1, Math.floor(x / INPAINT_MASK_GRID_SIZE));
      alpha[y * width + x] = dilated[cellY * latentWidth + cellX] ? 255 : 0;
    }
  }
  for (let pass = 0; pass < INPAINT_BLEND_BLUR_PASSES; pass += 1) {
    alpha = officialBoxBlurAlpha(
      alpha,
      width,
      height,
      INPAINT_BLEND_BLUR_RADIUS,
    );
  }
  return alpha;
}

function extractOfficialAnlasPrice(data: unknown): number | undefined {
  if (typeof data === "number" && Number.isFinite(data))
    return Math.max(0, Math.ceil(data));
  if (typeof data === "string" && Number.isFinite(Number(data)))
    return Math.max(0, Math.ceil(Number(data)));
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
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number(value)
          : NaN;
    if (Number.isFinite(parsed)) return Math.max(0, Math.ceil(parsed));
  }
  for (const key of ["data", "result", "subscription"]) {
    const nested = extractOfficialAnlasPrice(record[key]);
    if (nested != null) return nested;
  }
  return undefined;
}

async function requestOfficialGenerationPrice(
  params: GenerateParams,
  extras?: GenerateExtras,
) {
  const token = getToken();
  if (!token) return undefined;
  const settings = getSettings();
  const imageBaseUrl = tokenSafeBaseUrl(
    settings.imageBaseUrl,
    "https://image.novelai.net",
  );
  const quoteParams: GenerateParams = {
    ...params,
    stylePrompt: params.stylePrompt || "",
    positivePrompt: params.positivePrompt.trim() || "quote",
    negativePrompt: params.negativePrompt || "",
  };
  const payload = buildPayload(quoteParams, 1, {
    vibeImages: [],
    charCaptions: [],
    modelMode: extras?.modelMode,
  });
  try {
    const response = await axios.post(
      `${imageBaseUrl}/ai/generate-image/request-price`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 12_000,
        ...proxyConfig("nai"),
      },
    );
    return extractOfficialAnlasPrice(response.data);
  } catch {
    return undefined;
  }
}

export async function quoteAnlasCost(
  request: AnlasQuoteRequest,
): Promise<AnlasQuoteResult> {
  const token = getToken();
  if (!token) {
    return {
      ok: false,
      source: "unavailable",
      reason: "missing-token",
      message: "请先配置 NovelAI Token，才能读取生成前扣费。",
    };
  }

  const account = request.account?.hasToken
    ? request.account
    : await refreshStoredAccount();
  let image: Pick<WorkingImage, "width" | "height"> | null =
    request.image ?? null;
  if (request.feature === "upscale" || request.feature === "inpaint") {
    if (!image) {
      try {
        image = (await readWorkbenchImage()).image;
      } catch {
        image = null;
      }
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
    // Encoded = already in the session cache, OR already covered by an earlier
    // queued job / the active run (the renderer's hint). Take the larger of the
    // two (they refer to the same references) and cap at the vibe count.
    alreadyEncodedVibes: Math.min(
      request.extras?.vibeImages?.length ?? 0,
      Math.max(
        countCachedVibes(request.extras, request.params),
        request.alreadyQueuedVibes ?? 0,
      ),
    ),
  });
  if (!calculated.ok) return calculated;

  const hasVibes = (request.extras?.vibeImages?.length ?? 0) > 0;
  if (request.feature !== "generate" || !request.params || hasVibes)
    return calculated;

  const officialPerRequest = await requestOfficialGenerationPrice(
    request.params,
    request.extras,
  );
  if (officialPerRequest == null) return calculated;

  const amount =
    officialPerRequest * Math.max(1, Math.floor(request.batchCount ?? 1));
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

export function prepareInpaintAssets(
  imageBuffer: Buffer,
  maskBase64: string,
): PreparedInpaintAssets {
  const sourcePng = PNG.sync.read(bufferToPng(imageBuffer));
  const originalWidth = sourcePng.width;
  const originalHeight = sourcePng.height;
  const width = ceilToMultiple(originalWidth, INPAINT_SIZE_MULTIPLE);
  const height = ceilToMultiple(originalHeight, INPAINT_SIZE_MULTIPLE);
  if (width > 1600 || height > 1600) {
    throw new Error(
      `重绘原图尺寸 ${originalWidth}×${originalHeight} 超出 NovelAI 允许范围；请先缩小到补齐后不超过 1600×1600。`,
    );
  }
  const maskPng = PNG.sync.read(
    Buffer.from(stripBase64Prefix(maskBase64), "base64"),
  );
  const resized = width !== originalWidth || height !== originalHeight;
  const normalizedSource = resized
    ? resizeImageBufferToPng(PNG.sync.write(sourcePng), width, height)
    : PNG.sync.write(sourcePng);
  // Match the official two-stage mask path: quantize to the model's 1/8 grid,
  // then upload a full-size nearest-neighbour expansion of that binary grid.
  // A separately grown and feathered copy is used for local compositing.
  const latentMask = prepareLatentInpaintMask(maskPng, width, height);
  return {
    imageBase64: normalizedSource.toString("base64"),
    maskBase64: latentMask.png.toString("base64"),
    width,
    height,
    originalWidth,
    originalHeight,
    resized,
    sourcePng: normalizedSource,
    blendAlpha: buildInpaintBlendAlpha(
      latentMask.selected,
      latentMask.width,
      latentMask.height,
      width,
      height,
    ),
  };
}

export function compositeInpaintBuffers(
  buffers: Buffer[],
  assets: PreparedInpaintAssets,
) {
  const source = PNG.sync.read(assets.sourcePng);
  return buffers.map((buffer) => {
    let generatedBuffer = buffer;
    let generated = PNG.sync.read(bufferToPng(generatedBuffer));
    if (generated.width !== assets.width || generated.height !== assets.height) {
      generatedBuffer = resizeImageBufferToPng(
        generatedBuffer,
        assets.width,
        assets.height,
      );
      generated = PNG.sync.read(generatedBuffer);
    }

    const composited = new PNG({ width: assets.width, height: assets.height });
    for (let pixel = 0; pixel < assets.width * assets.height; pixel += 1) {
      const alpha = assets.blendAlpha[pixel] / 255;
      const rgba = pixel * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        composited.data[rgba + channel] = Math.round(
          generated.data[rgba + channel] * alpha +
            source.data[rgba + channel] * (1 - alpha),
        );
      }
    }

    // The official editor keeps the 64-aligned request dimensions instead of
    // cropping back to the imported file. Restore NovelAI's prompt/seed chunks
    // after local compositing re-encodes the pixels.
    return copyPngMetadataChunks(buffer, PNG.sync.write(composited));
  });
}

/** Apply the current official frontend's infill transport fields. */
export function applyOfficialInpaintParameters(
  parameters: Record<string, unknown>,
  assets: PreparedInpaintAssets,
  strength: number,
  noise: number,
  seed: number,
) {
  const normalizedStrength = Math.max(
    0,
    Math.min(1, Number.isFinite(strength) ? strength : 1),
  );
  // Keep the argument and transport field for compatibility after removing
  // the ineffective control, but never forward a stale persisted value.
  void noise;
  const normalizedNoise = 0;
  parameters.image = assets.imageBase64;
  parameters.mask = assets.maskBase64;
  parameters.add_original_image = false;
  parameters.inpaintImg2ImgStrength = normalizedStrength;
  // The official payload retains the generic img2img default even for infill;
  // inpaintImg2ImgStrength/nested img2img control the editor's strength UI.
  parameters.strength = 0.7;
  if (normalizedStrength !== 1) {
    parameters.img2img = {
      strength: normalizedStrength,
      color_correct: true,
    };
  } else {
    delete parameters.img2img;
  }
  parameters.noise = normalizedNoise;
  parameters.extra_noise_seed = Math.max(0, Math.round(seed) - 1);
  return parameters;
}

function annotateInpaintError(
  error: any,
  assets: PreparedInpaintAssets,
  model: string,
) {
  if (!assets.resized || error?.response?.status !== 500) return;
  const message =
    `重绘失败（HTTP 500）：程序已按官网规则将原图 ${assets.originalWidth}×${assets.originalHeight} ` +
    `自适应到 ${assets.width}×${assets.height} 后发送，但 NovelAI 重绘接口仍返回内部错误。` +
    `请尝试重新加载原图、重画蒙版、缩小重绘区域，或稍后再试。模型：${model}。`;
  if (error.response) error.response.data = message;
  error.langbaiMessage = message;
}

function readImageDimensions(buf: Buffer): { width: number; height: number } {
  if (
    buf
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
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
      if (
        marker === 0xc0 ||
        marker === 0xc1 ||
        marker === 0xc2 ||
        marker === 0xc3
      ) {
        return {
          height: buf.readUInt16BE(offset + 5),
          width: buf.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + len;
    }
  }

  if (
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    const chunk = buf.subarray(12, 16).toString("ascii");
    if (chunk === "VP8 " && buf.length > 29) {
      return {
        width: buf.readUInt16LE(26) & 0x3fff,
        height: buf.readUInt16LE(28) & 0x3fff,
      };
    }
    if (chunk === "VP8L" && buf.length > 25) {
      const bits = buf.readUInt32LE(21);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
    if (chunk === "VP8X" && buf.length > 29) {
      const width = 1 + buf.readUIntLE(24, 3);
      const height = 1 + buf.readUIntLE(27, 3);
      return { width, height };
    }
  }

  return { width: 0, height: 0 };
}

async function readWorkbenchImage(): Promise<{
  base64: string;
  buffer: Buffer;
  image: WorkingImage;
}> {
  if (!workbenchImagePath) throw new Error("请先加载图片。");
  const buffer = await fs.readFile(workbenchImagePath);
  const dims = readImageDimensions(buffer);
  return {
    base64: buffer.toString("base64"),
    buffer,
    image: {
      filePath: workbenchImagePath,
      fileUrl: toLocalMediaUrl(workbenchImagePath),
      width: dims.width,
      height: dims.height,
    },
  };
}

/** Render a save filename (without extension) from the user template. */
function buildImageFileName(
  template: string,
  ctx: {
    date: string;
    now: Date;
    seq: number;
    seed: number;
    model: string;
    prefix: string;
    name?: string;
  },
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
    const safeCustom = custom
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "_");
    name = `${safeCustom}_${name}`;
  }
  name = name
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 100);
  return name || `${ctx.now.getTime()}-${ctx.seq}`;
}

/** Return a non-colliding path, appending -1, -2... if needed. */
async function uniqueFilePath(
  dir: string,
  base: string,
  ext: string,
): Promise<string> {
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

// Sanitize a user group name into a safe folder segment (strip path-illegal
// characters, collapse whitespace, drop leading dots so we never produce a
// hidden/`..`-like folder, cap length).
function sanitizeGroupFolderName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 80);
  return cleaned || "group";
}

// The generation destination is independent from the history panel's filter.
// A request may carry a snapshot so changing the selector while a queued image
// is running cannot redirect that image midway through the request.
function resolveGenerationSaveGroup(requestedId?: string):
  { groupId: string; folderName: string } | undefined {
  const activeId = requestedId === undefined
    ? getSettings().generationGroupId
    : requestedId;
  if (!activeId || activeId === "__ungrouped") return undefined;
  const group = getHistoryGroups().find((g) => g.id === activeId);
  if (!group) return undefined;
  return { groupId: group.id, folderName: sanitizeGroupFolderName(group.name) };
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
// PNG chunk types that carry human-readable / embedded generation metadata.
const PNG_METADATA_CHUNKS = new Set(["tEXt", "iTXt", "zTXt", "eXIf"]);

/**
 * Copy already checksummed metadata chunks from one PNG into another without
 * touching either image's pixel stream. This is used after local inpaint
 * compositing, which necessarily re-encodes pixels through pngjs.
 */
export function copyPngMetadataChunks(source: Buffer, target: Buffer): Buffer {
  if (
    source.length < 8 ||
    target.length < 8 ||
    !source.subarray(0, 8).equals(PNG_SIGNATURE) ||
    !target.subarray(0, 8).equals(PNG_SIGNATURE)
  ) {
    return target;
  }

  const metadata: Buffer[] = [];
  let sourceOffset = 8;
  while (sourceOffset + 12 <= source.length) {
    const length = source.readUInt32BE(sourceOffset);
    const type = source.toString("ascii", sourceOffset + 4, sourceOffset + 8);
    const end = sourceOffset + 12 + length;
    if (end > source.length) break;
    if (PNG_METADATA_CHUNKS.has(type)) metadata.push(source.subarray(sourceOffset, end));
    sourceOffset = end;
    if (type === "IEND") break;
  }
  if (metadata.length === 0) return target;

  const cleanTarget = stripPngMetadata(target);
  let insertAt = 8;
  while (insertAt + 12 <= cleanTarget.length) {
    const length = cleanTarget.readUInt32BE(insertAt);
    const type = cleanTarget.toString("ascii", insertAt + 4, insertAt + 8);
    if (type === "IDAT" || type === "IEND") break;
    const end = insertAt + 12 + length;
    if (end > cleanTarget.length) return target;
    insertAt = end;
  }
  return Buffer.concat([
    cleanTarget.subarray(0, insertAt),
    ...metadata,
    cleanTarget.subarray(insertAt),
  ]);
}

/**
 * Remove embedded metadata (tEXt/iTXt/zTXt/eXIf — where NovelAI stores the
 * prompt / seed / parameters JSON) from a PNG WITHOUT re-encoding the pixels, so
 * it stays lossless. Non-PNG buffers are returned untouched.
 */
export function stripPngMetadata(buffer: Buffer): Buffer {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE))
    return buffer;
  const out: Buffer[] = [buffer.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const chunkEnd = offset + 12 + length; // length(4) + type(4) + data + crc(4)
    if (chunkEnd > buffer.length) break; // malformed — keep the rest as-is
    if (!PNG_METADATA_CHUNKS.has(type))
      out.push(buffer.subarray(offset, chunkEnd));
    offset = chunkEnd;
    if (type === "IEND") break;
  }
  return Buffer.concat(out);
}

/** Apply the user's metadata preference at every image save boundary. */
export function prepareImageBufferForSave(
  buffer: Buffer,
  keepImageMetadata: boolean,
): Buffer {
  return keepImageMetadata ? buffer : stripPngMetadata(buffer);
}

async function saveBuffers(
  buffers: Buffer[],
  params: GenerateParams,
  actualSeed: number,
  prefix: string,
  modelOverride?: string,
  saveOptions?: {
    ignoreActiveGroup?: boolean;
    groupOverride?: { groupId: string; folderName: string };
    temporary?: boolean;
  },
): Promise<HistoryItem[]> {
  const settings = getSettings();
  const now = new Date();
  const date = dateStamp(now);
  // An explicit groupOverride (batch redraw / comic / snapshotted ordinary
  // generation) wins; otherwise use the persisted generation destination.
  const activeGroup = saveOptions?.temporary
    ? undefined
    : saveOptions?.groupOverride ??
      (saveOptions?.ignoreActiveGroup ? undefined : resolveGenerationSaveGroup());
  const dir = saveOptions?.temporary
    ? artistLabTemporaryRoot()
    : activeGroup
      ? path.join(settings.outputDir, date, activeGroup.folderName)
      : path.join(settings.outputDir, date);
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
    // Optionally strip embedded generation metadata before writing to disk.
    const outBuffer = prepareImageBufferForSave(
      buffers[index],
      settings.keepImageMetadata !== false,
    );
    await fs.writeFile(filePath, outBuffer);
    items.push({
      id,
      filePath,
      fileUrl: toLocalMediaUrl(filePath),
      date,
      createdAt: now.toISOString(),
      params: { ...params, seed: actualSeed },
      actualSeed,
      model: modelOverride ?? params.model,
      width: params.width,
      height: params.height,
      groupId: activeGroup?.groupId,
    });
  }
  if (!saveOptions?.temporary) addHistory(items);
  return items;
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("已取消"));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("已取消"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function isPreflightNetworkFailure(error: any): boolean {
  if (error?.response) return false;
  const message = String(error?.message ?? "").toLowerCase();
  return (
    message.includes("before secure tls connection was established") ||
    message.includes("tls handshake") ||
    error?.code === "ERR_SSL_HANDSHAKE_FAILURE"
  );
}

/** Retry only the explicitly permitted statuses/errors with exponential backoff. */
async function requestWithRetry<T>(
  fn: () => Promise<T>,
  {
    retries = 3,
    baseDelay = 2_000,
    signal,
    retryStatuses = [429],
    retryPreflightNetworkFailures = false,
  }: {
    retries?: number;
    baseDelay?: number;
    signal?: AbortSignal;
    retryStatuses?: number[];
    retryPreflightNetworkFailures?: boolean;
  } = {},
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error: any) {
      if (
        signal?.aborted ||
        axios.isCancel?.(error) ||
        error?.code === "ERR_CANCELED"
      )
        throw error;
      const status = error?.response?.status;
      const retryable =
        (typeof status === "number" && retryStatuses.includes(status)) ||
        (retryPreflightNetworkFailures && isPreflightNetworkFailure(error));
      if (!retryable || attempt >= retries) throw error;

      const retryAfter = Number(error?.response?.headers?.["retry-after"]);
      const wait =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : baseDelay * 2 ** attempt;
      attempt += 1;
      await sleep(Math.min(wait, 30_000), signal);
    }
  }
}

export function buildGenerateImageHttpBody(
  payload: ReturnType<typeof buildPayload>,
) {
  const params = payload.parameters as Record<string, unknown>;
  const cached = params?.director_reference_images_cached;
  const useMultipart = Array.isArray(cached) && cached.length > 0;
  let body: unknown = payload;
  let bodyHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (useMultipart) {
    const images = Array.isArray(params.director_reference_images)
      ? (params.director_reference_images as string[])
      : [];
    // In multipart mode NovelAI treats image-bearing JSON fields as the NAME of a
    // binary form part, not as base64. Director references ride as director_ref_N
    // (referenced via director_reference_images_cached). The img2img / inpaint
    // source image + mask must ALSO be uploaded as parts and referenced by name —
    // otherwise the API rejects with "image field references unknown form part".
    const requestJson = { ...payload, parameters: { ...params } };
    const rp = requestJson.parameters as Record<string, unknown>;
    delete rp.director_reference_images;
    const form = new FormData();
    const attachImagePart = (field: "image" | "mask") => {
      const b64 = rp[field];
      if (typeof b64 === "string" && b64) {
        form.append(field, Buffer.from(stripBase64Prefix(b64), "base64"), {
          filename: field,
          contentType: "image/png",
        });
        rp[field] = field; // reference the binary part by name
      }
    };
    attachImagePart("image");
    attachImagePart("mask");
    form.append("request", JSON.stringify(requestJson), {
      contentType: "application/json",
    });
    images.forEach((b64, index) => {
      form.append(
        `director_ref_${index}`,
        Buffer.from(stripBase64Prefix(b64), "base64"),
        {
          filename: "blob",
          contentType: "image/png",
        },
      );
    });
    body = form;
    bodyHeaders = form.getHeaders();
  }

  return { body, bodyHeaders, useMultipart };
}

async function postGenerateImage(
  payload: ReturnType<typeof buildPayload>,
  signal?: AbortSignal,
) {
  const token = getToken();
  if (!token) throw new Error("请先配置 API Token。");
  const settings = getSettings();
  const imageBaseUrl = tokenSafeBaseUrl(
    settings.imageBaseUrl,
    "https://image.novelai.net",
  );

  const postTo = (baseUrl: string) =>
    requestWithRetry(
      () => {
        // FormData is a one-shot stream. Rebuild it for every 429 attempt or
        // custom-endpoint fallback; reusing the consumed stream produces an
        // empty/partial multipart request and misleading server errors.
        const { body, bodyHeaders } = buildGenerateImageHttpBody(payload);
        return axios.post(`${baseUrl}/ai/generate-image`, body, {
          headers: {
            Authorization: `Bearer ${token}`,
            ...bodyHeaders,
            Accept: "application/zip, application/octet-stream",
          },
          responseType: "arraybuffer",
          timeout: 180_000,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          signal,
          ...proxyConfig("nai"),
        });
      },
      // A paid generate POST may have already produced (and charged for) an image
      // even when the gateway reports a 5xx, so we never auto-retry server errors
      // here — only 429 rate-limits, which are rejected before any work is done.
      {
        signal,
        retryStatuses: [429],
        retryPreflightNetworkFailures: true,
      },
    );
  let res;
  try {
    res = await postTo(imageBaseUrl);
  } catch (error: any) {
    const defaultImageBaseUrl = "https://image.novelai.net";
    const status = error?.response?.status;
    if (
      (status === 401 || status === 403) &&
      imageBaseUrl !== defaultImageBaseUrl &&
      settings.allowCustomEndpointFallback
    ) {
      res = await postTo(defaultImageBaseUrl);
    } else {
      if (error?.response?.status === 500 && payload.action === "infill") {
        const width = Number(payload.parameters?.width);
        const height = Number(payload.parameters?.height);
        const sizeHint = inpaintSizeHint({ width, height });
        error.langbaiMessage =
          `重绘失败（HTTP 500）：NovelAI 重绘接口返回内部错误。` +
          (sizeHint ||
            "未自动重试，以避免重复生成或重复扣费；请尝试切换重绘模型、重新加载原图并重画蒙版，或稍后再试。") +
          ` 模型：${String(payload.model)}。`;
        if (error.response) error.response.data = error.langbaiMessage;
      }
      throw error;
    }
  }
  return extractImages(res.data);
}

type GenerationPreviewCallback = (
  event: Omit<GenerationPreviewEvent, "requestId">,
) => void;

function buildGenerateImageStreamHttpBody(
  payload: ReturnType<typeof buildPayload>,
) {
  // The streaming endpoint follows the official multipart shape even for a
  // plain text-to-image request: one JSON file part named `request`. Reference
  // images use a more involved cached-part protocol, so those requests stay on
  // the proven ZIP path below instead of risking a silently ignored reference.
  const form = new FormData();
  form.append("request", JSON.stringify(payload), {
    filename: "blob",
    contentType: "application/json",
  });
  return form;
}

function supportsSafeStreamTransport(
  payload: ReturnType<typeof buildPayload>,
) {
  const parameters = payload.parameters as Record<string, unknown>;
  return (
    payload.action === "generate" &&
    !parameters.image &&
    !parameters.mask &&
    !parameters.reference_image &&
    !(Array.isArray(parameters.reference_image_multiple) && parameters.reference_image_multiple.length > 0) &&
    !(Array.isArray(parameters.director_reference_images) && parameters.director_reference_images.length > 0) &&
    !(Array.isArray(parameters.director_reference_images_cached) && parameters.director_reference_images_cached.length > 0)
  );
}

function isStreamingNotAllowedMessage(value: unknown) {
  const text = String(value ?? "").toLowerCase();
  return (
    text.includes("streaming is not allowed") ||
    text.includes("streaming not allowed") ||
    text.includes("stream is not allowed") ||
    text.includes("stream not allowed")
  );
}

function imageDataUrl(buffer: Buffer) {
  const mime =
    buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      ? "image/png"
      : buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
        ? "image/jpeg"
        : buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP"
          ? "image/webp"
          : "image/png";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function readStreamErrorText(error: any): Promise<string> {
  const data = error?.response?.data;
  if (typeof data === "string") return data.slice(0, 65_536);
  if (Buffer.isBuffer(data) || data instanceof Uint8Array) {
    return Buffer.from(data).subarray(0, 65_536).toString("utf8");
  }
  if (!data || typeof data[Symbol.asyncIterator] !== "function") {
    return String(error?.message ?? "");
  }
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    for await (const chunk of data as AsyncIterable<Uint8Array>) {
      if (length >= 65_536) break;
      const bytes = Buffer.from(chunk);
      const kept = bytes.subarray(0, 65_536 - length);
      chunks.push(kept);
      length += kept.length;
    }
  } catch {
    return String(error?.message ?? "");
  }
  return Buffer.concat(chunks).toString("utf8");
}

function orderedFinalImages(finals: Map<number, Buffer>): Buffer[] {
  return Array.from(finals.entries())
    .sort(([left], [right]) => left - right)
    .map(([, image]) => image);
}

function isRecoverableCompletedStreamClose(error: any): boolean {
  if (
    error?.naiStreamFrameError ||
    axios.isCancel(error) ||
    error?.code === "ERR_CANCELED" ||
    error?.code === "ABORT_ERR" ||
    error?.name === "AbortError"
  ) {
    return false;
  }
  const code = String(error?.code ?? "").toUpperCase();
  if (code === "ECONNRESET" || code === "ERR_STREAM_PREMATURE_CLOSE") return true;
  const message = String(error?.message ?? error ?? "").trim().toLowerCase();
  return (
    message === "aborted" ||
    message.includes("premature close") ||
    message.includes("socket hang up") ||
    message.includes("connection reset") ||
    message.includes("stream closed") ||
    message === "terminated"
  );
}

export async function consumeGenerateImageStream(
  responseStream: AsyncIterable<Uint8Array>,
  totalSteps: number,
  onPreview: GenerationPreviewCallback,
  contentType = "",
): Promise<Buffer[]> {
  const msgpackDecoder = new NaiStreamFrameDecoder();
  const sseDecoder = new NaiSseFrameDecoder();
  const finals = new Map<number, Buffer>();
  let mode: "unknown" | "msgpack" | "sse" | "zip" = contentType.toLowerCase().includes("text/event-stream")
    ? "sse"
    : "unknown";
  let prefix = Buffer.alloc(0);
  const zipChunks: Buffer[] = [];
  let previewStarted = false;
  let lastPreviewAt = 0;

  const consumeFrames = (frames: NaiStreamFrame[]) => {
    for (const frame of frames) {
      if (frame.error) {
        const frameError: Error & { naiStreamFrameError?: boolean } = new Error(frame.error);
        frameError.naiStreamFrameError = true;
        throw frameError;
      }
      if (!frame.image?.length) continue;
      previewStarted = true;
      const currentStep = (frame.stepIndex ?? 0) + 1;
      if (frame.eventType === "final") {
        finals.set(frame.sampleIndex, frame.image);
        onPreview({
          progress: 1,
          currentStep: totalSteps,
          totalSteps,
          sampleIndex: frame.sampleIndex,
          imageDataUrl: imageDataUrl(frame.image),
        });
      } else {
        const now = Date.now();
        if (now - lastPreviewAt >= 110 || currentStep >= totalSteps) {
          lastPreviewAt = now;
          onPreview({
            progress: Math.min(0.99, Math.max(0, currentStep / Math.max(1, totalSteps))),
            currentStep,
            totalSteps,
            sampleIndex: frame.sampleIndex,
            imageDataUrl: imageDataUrl(frame.image),
          });
        }
      }
    }
  };

  try {
    for await (const rawChunk of responseStream) {
      const chunk = Buffer.from(rawChunk);
      if (mode === "unknown") {
        prefix = prefix.length ? Buffer.concat([prefix, chunk]) : chunk;
        if (prefix.length < 4) continue;
        const textualPrefix = prefix.subarray(0, Math.min(prefix.length, 32)).toString("utf8").replace(/^\uFEFF/, "").trimStart();
        const framedLength = prefix.readUInt32BE(0);
        mode = prefix[0] === 0x50 && prefix[1] === 0x4b
          ? "zip"
          : /^(?:event|data|id|retry)\s*:|^:/.test(textualPrefix)
            ? "sse"
            : framedLength > 0 && framedLength <= 128 * 1024 * 1024
              ? "msgpack"
              : "sse";
        if (mode === "zip") zipChunks.push(prefix);
        else if (mode === "sse") consumeFrames(sseDecoder.push(prefix));
        else consumeFrames(msgpackDecoder.push(prefix));
        prefix = Buffer.alloc(0);
        continue;
      }

      if (mode === "zip") {
        zipChunks.push(chunk);
        continue;
      }
      if (mode === "sse") consumeFrames(sseDecoder.push(chunk));
      else consumeFrames(msgpackDecoder.push(chunk));
    }

    if (mode === "zip") return extractImages(Buffer.concat(zipChunks));
    if (mode === "sse") consumeFrames(sseDecoder.finish());
    if (finals.size === 0) {
      throw new Error("流式生成结束，但没有收到最终图片。为避免重复扣费，未自动重发请求。");
    }
    return orderedFinalImages(finals);
  } catch (error: any) {
    if (isRecoverableCompletedStreamClose(error)) {
      // Some Node/Axios transports emit `aborted`/ECONNRESET after the server's
      // complete final frame has already been decoded. The generation is paid
      // and valid at this point: preserve it instead of turning 100% into a
      // failure and discarding the image.
      if (mode === "sse") {
        try {
          consumeFrames(sseDecoder.finish());
        } catch (frameError: any) {
          if (previewStarted) frameError.streamPreviewStarted = true;
          throw frameError;
        }
      }
      if (mode === "zip" && zipChunks.length > 0) {
        try {
          const images = await extractImages(Buffer.concat(zipChunks));
          if (images.length > 0) {
            logInfo(`stream transport closed after complete ZIP; recovered ${images.length} image(s)`);
            return images;
          }
        } catch {
          // An incomplete archive is not recoverable; keep the original error.
        }
      }
      if (finals.size > 0) {
        logInfo(`stream transport closed after final frame; recovered ${finals.size} image(s)`);
        return orderedFinalImages(finals);
      }
    }
    if (previewStarted) error.streamPreviewStarted = true;
    throw error;
  }
}

/** Returns null only when the server explicitly rejects/doesn't implement
 * streaming before generation starts, allowing a safe one-time ZIP fallback. */
async function postGenerateImageStream(
  payload: ReturnType<typeof buildPayload>,
  signal: AbortSignal | undefined,
  onPreview: GenerationPreviewCallback,
): Promise<Buffer[] | null> {
  const token = getToken();
  if (!token) throw new Error("请先配置 API Token。");
  const settings = getSettings();
  const configuredBaseUrl = tokenSafeBaseUrl(
    settings.imageBaseUrl,
    "https://image.novelai.net",
  );
  const postTo = async (baseUrl: string): Promise<Buffer[] | null> => {
    let response;
    try {
      response = await requestWithRetry(
        () => {
          const form = buildGenerateImageStreamHttpBody(payload);
          return axios.post(`${baseUrl}/ai/generate-image-stream`, form, {
            headers: {
              Authorization: `Bearer ${token}`,
              ...form.getHeaders(),
              Accept: "application/x-msgpack, text/event-stream, application/zip",
              "x-correlation-id": crypto.randomBytes(8).toString("base64url").slice(0, 6),
              "x-initiated-at": new Date().toISOString(),
            },
            responseType: "stream",
            timeout: 180_000,
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            signal,
            ...proxyConfig("nai"),
          });
        },
        {
          signal,
          retryStatuses: [429],
          retryPreflightNetworkFailures: true,
        },
      );
    } catch (error: any) {
      const status = Number(error?.response?.status);
      const body = await readStreamErrorText(error);
      if (
        [404, 405, 415, 501].includes(status) ||
        isStreamingNotAllowedMessage(body) ||
        isStreamingNotAllowedMessage(error?.message)
      ) {
        logInfo(`stream preview unavailable; using ZIP response (HTTP ${status || "n/a"})`);
        return null;
      }
      if (body) {
        error.langbaiMessage = compactRemoteErrorText(body, {
          serviceLabel: "NovelAI 流式生成",
          maxLength: 420,
        });
        if (error.response) error.response.data = error.langbaiMessage;
      }
      throw error;
    }
    return consumeGenerateImageStream(
      response.data as AsyncIterable<Uint8Array>,
      Math.max(1, Number(payload.parameters?.steps) || 1),
      onPreview,
      String(response.headers?.["content-type"] ?? ""),
    ).catch((error: any) => {
      if (!error?.streamPreviewStarted && isStreamingNotAllowedMessage(error?.message)) return null;
      throw error;
    });
  };

  try {
    return await postTo(configuredBaseUrl);
  } catch (error: any) {
    const officialBaseUrl = "https://image.novelai.net";
    const status = error?.response?.status;
    if (
      (status === 401 || status === 403) &&
      configuredBaseUrl !== officialBaseUrl &&
      settings.allowCustomEndpointFallback
    ) {
      return postTo(officialBaseUrl);
    }
    throw error;
  }
}

async function postGenerateImageWithOptionalPreview(
  payload: ReturnType<typeof buildPayload>,
  signal: AbortSignal | undefined,
  onPreview?: GenerationPreviewCallback,
) {
  const settings = getSettings();
  if (
    onPreview &&
    settings.streamPreviewEnabled !== false &&
    supportsSafeStreamTransport(payload)
  ) {
    const streamed = await postGenerateImageStream(payload, signal, onPreview);
    if (streamed) return streamed;
  }
  return postGenerateImage(payload, signal);
}

export function extractEmbeddedGenerationMetadata(buffer: Buffer): LoadImageResult["metadata"] | undefined {
  try {
    const bytes = Uint8Array.from(buffer);
    const report = inspectImageMetadata(parseImageMeta(bytes.buffer));
    if (!Object.keys(report.imported).length && !report.characterCaptions.length) return undefined;
    return {
      imported: report.imported,
      characterCaptions: report.characterCaptions,
    };
  } catch {
    // Metadata is optional. A malformed metadata block must not prevent the
    // image itself from loading into the workbench.
    return undefined;
  }
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
        fileUrl: toLocalMediaUrl(filePath),
        width: dims.width,
        height: dims.height,
      },
      metadata: extractEmbeddedGenerationMetadata(buffer),
    };
  } catch (error: any) {
    return {
      ok: false,
      message: `加载图片失败：${error?.message ?? "未知错误"}`,
    };
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

function summarizeUserContent(
  userContent: Array<{ type: string; [k: string]: any }>,
): string {
  return userContent
    .map((part) =>
      part.type === "text"
        ? String(part.text ?? "")
        : `[${part.type === "image_url" ? "图片" : part.type}]`,
    )
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
  record = true,
): Promise<{ ok: boolean; content?: string; message: string }> {
  const settings = getSettings();
  const { visionApiUrl, visionApiKey, visionApiModel } = settings;

  if (!visionApiKey.trim())
    return {
      ok: false,
      message: "请先在 设置 › AI 反推 中填写视觉模型 API Key。",
    };
  if (!visionApiUrl.trim())
    return { ok: false, message: "请先在 设置 › AI 反推 中填写 API 地址。" };

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

  const post = (tokens: number) =>
    axios.post(
      `${base}/chat/completions`,
      { ...body, max_tokens: tokens },
      {
        headers: {
          Authorization: `Bearer ${visionApiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 180_000,
        ...proxyConfig("ai"),
      },
    );

  try {
    let resp = await post(maxTokens);
    let content: string = resp.data?.choices?.[0]?.message?.content ?? "";
    let fin = resp.data?.choices?.[0]?.finish_reason;
    // Reasoning models burn the whole budget on hidden reasoning → empty content
    // with finish_reason "length". Retry once with a much larger budget.
    if (!content.trim() && fin === "length") {
      resp = await post(Math.max(maxTokens * 8, 32000));
      content = resp.data?.choices?.[0]?.message?.content ?? "";
      fin = resp.data?.choices?.[0]?.finish_reason;
    }
    if (!content.trim()) {
      const message =
        fin === "length"
          ? "API 返回被长度截断（内容为空）：该模型把配额全用在了推理上，请改用非推理模型，或在该服务调高最大输出长度。"
          : "API 返回内容为空：请确认「模型」填的是该服务支持的模型名（例如 xAI 用 grok-4.3，而非默认 gpt-4o-mini），可点「检测模型」选择。";
      if (record) {
        recordAiCall({
          label,
          api: "vision",
          model,
          systemPrompt,
          userText: summarizeUserContent(userContent),
          ok: false,
          response: message,
        });
      }
      return { ok: false, message };
    }
    const cleaned = cleanPromptOutput(content);
    if (record) {
      recordAiCall({
        label,
        api: "vision",
        model,
        systemPrompt,
        userText: summarizeUserContent(userContent),
        ok: true,
        response: cleaned,
      });
    }
    return { ok: true, content: cleaned, message: "成功" };
  } catch (error: any) {
    const msg =
      error?.response?.data?.error?.message ??
      error?.response?.data?.message ??
      error?.message ??
      "未知错误";
    if (record) {
      recordAiCall({
        label,
        api: "vision",
        model,
        systemPrompt,
        userText: summarizeUserContent(userContent),
        ok: false,
        response: String(msg),
      });
    }
    return { ok: false, message: msg };
  }
}

/** Keep vision requests responsive without throwing away pose/composition.
 * Large phone/ComfyUI PNGs otherwise become multi-megabyte JSON payloads and
 * make compatible vision endpoints spend most of their time uploading and
 * preprocessing pixels the tagger cannot use. */
async function prepareVisionImage(imageBase64: string): Promise<{ mime: string; base64: string }> {
  try {
    const input = Buffer.from(imageBase64.replace(/^data:image\/[^;]+;base64,/, ""), "base64");
    const metadata = await sharp(input).metadata();
    const longest = Math.max(metadata.width ?? 0, metadata.height ?? 0);
    if (longest <= 1280 && input.length <= 1_500_000) {
      return { mime: metadata.format === "jpeg" ? "image/jpeg" : "image/png", base64: input.toString("base64") };
    }
    const output = await sharp(input)
      .rotate()
      .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 86, chromaSubsampling: "4:2:0" })
      .toBuffer();
    return { mime: "image/jpeg", base64: output.toString("base64") };
  } catch {
    return { mime: "image/png", base64: imageBase64.replace(/^data:image\/[^;]+;base64,/, "") };
  }
}

async function callConvertApi(
  systemPrompt: string,
  userText: string,
  maxTokens = 2000,
  label = "提示词转换",
  record = true,
): Promise<{ ok: boolean; content?: string; message: string }> {
  const settings = getSettings();
  const apiUrl = settings.convertApiUrl.trim();
  const apiKey = settings.convertApiKey.trim();
  const model = settings.convertApiModel.trim() || "gpt-4o-mini";

  if (!apiKey)
    return { ok: false, message: "请先在 设置 > 转换 API 中填写 API Key。" };
  if (!apiUrl)
    return { ok: false, message: "请先在 设置 > 转换 API 中填写 API 地址。" };

  const base = apiUrl.replace(/\/+$/, "");
  const body = {
    model,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText },
    ],
  };

  const post = (tokens: number) =>
    axios.post(
      `${base}/chat/completions`,
      { ...body, max_tokens: tokens },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 180_000,
        ...proxyConfig("ai"),
      },
    );

  try {
    let resp = await post(maxTokens);
    let content: string = resp.data?.choices?.[0]?.message?.content ?? "";
    let fin = resp.data?.choices?.[0]?.finish_reason;
    // Reasoning models spend the whole token budget on hidden reasoning tokens
    // and return empty content with finish_reason "length". Retry once with a
    // much larger budget so the actual answer has room (billed per real token,
    // so this only costs more on the genuinely-reasoning case).
    if (!content.trim() && fin === "length") {
      resp = await post(Math.max(maxTokens * 8, 32000));
      content = resp.data?.choices?.[0]?.message?.content ?? "";
      fin = resp.data?.choices?.[0]?.finish_reason;
    }
    if (!content.trim()) {
      const message =
        fin === "length"
          ? "API 返回被长度截断（内容为空）：该模型把配额全用在了推理上，请改用非推理模型，或在该服务调高最大输出长度。"
          : "API 返回内容为空：请确认「模型」填的是该服务支持的模型名（例如 xAI 用 grok-4.3，而非默认 gpt-4o-mini），可点「检测模型」选择。";
      if (record) {
        recordAiCall({
          label,
          api: "convert",
          model,
          systemPrompt,
          userText,
          ok: false,
          response: message,
        });
      }
      return { ok: false, message };
    }
    const cleaned = cleanPromptOutput(content);
    if (record) {
      recordAiCall({
        label,
        api: "convert",
        model,
        systemPrompt,
        userText,
        ok: true,
        response: cleaned,
      });
    }
    return { ok: true, content: cleaned, message: "成功" };
  } catch (error: any) {
    const msg =
      error?.response?.data?.error?.message ??
      error?.response?.data?.message ??
      error?.message ??
      "未知错误";
    if (record) {
      recordAiCall({
        label,
        api: "convert",
        model,
        systemPrompt,
        userText,
        ok: false,
        response: String(msg),
      });
    }
    return { ok: false, message: msg };
  }
}

export async function listAiModels(
  kind: "reverse" | "convert",
): Promise<AiModelListResult> {
  const settings = getSettings();
  const apiUrl = (
    kind === "reverse" ? settings.visionApiUrl : settings.convertApiUrl
  ).trim();
  const apiKey = (
    kind === "reverse" ? settings.visionApiKey : settings.convertApiKey
  ).trim();
  if (!apiUrl) return { ok: false, message: "请先填写 API 地址。", models: [] };
  if (!apiKey) return { ok: false, message: "请先填写 API Key。", models: [] };

  try {
    const base = apiUrl.replace(/\/+$/, "");
    const resp = await axios.get(`${base}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 20_000,
      ...proxyConfig("ai"),
    });
    const raw = Array.isArray(resp.data?.data)
      ? resp.data.data
      : Array.isArray(resp.data)
        ? resp.data
        : [];
    const models = raw
      .map((item: any) => (typeof item === "string" ? item : item?.id))
      .filter(
        (id: unknown): id is string => typeof id === "string" && id.length > 0,
      )
      .sort();
    return {
      ok: true,
      message: models.length
        ? `检测到 ${models.length} 个模型。`
        : "接口可用，但未返回模型列表。",
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
  return {
    tag: rawTag.trim(),
    count: Math.round(count),
    category,
    description,
  };
}

function parseTagServerPayload(payload: unknown): TagSuggestion[] {
  if (!payload) return [];
  if (Array.isArray(payload))
    return payload
      .map(normalizeTagServerItem)
      .filter((x): x is TagSuggestion => Boolean(x));
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

async function queryTagServer(
  query: string,
  limit = 12,
): Promise<TagSuggestion[]> {
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
  if (settings.tagServerApiKey.trim())
    headers.Authorization = `Bearer ${settings.tagServerApiKey.trim()}`;

  const px = proxyConfig("mcp");
  const attempts = [
    () =>
      axios.get(`${base}/search`, {
        params: { q: query, query, limit },
        headers,
        timeout: 8_000,
        ...px,
      }),
    () =>
      axios.get(`${base}/tags`, {
        params: { q: query, query, limit },
        headers,
        timeout: 8_000,
        ...px,
      }),
    () =>
      axios.post(
        `${base}/search`,
        { query, limit },
        { headers, timeout: 8_000, ...px },
      ),
    () =>
      axios.post(
        base,
        {
          jsonrpc: "2.0",
          id: `tag-${Date.now()}`,
          method: "tools/call",
          params: { name: "search_tags", arguments: { query, limit } },
        },
        {
          headers: { ...headers, "Content-Type": "application/json" },
          timeout: 8_000,
          ...px,
        },
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
  const hintTags = hints
    .map((hint) => hint.tag)
    .filter(Boolean)
    .join(", ");
  return hintTags ? mergePrompt(prompt, hintTags) : prompt;
}


export async function testTagServer(
  query: string,
): Promise<{ ok: boolean; message: string; tags: TagSuggestion[] }> {
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
      const label =
        type === "stdio"
          ? "stdio MCP"
          : type === "sse"
            ? "SSE MCP"
            : "Streamable HTTP MCP";
      return tags.length > 0
        ? {
            ok: true,
            message: `${label} 可用，工具「${settings.tagServerTool || "search_tags"}」返回 ${tags.length} 个标签。`,
            tags,
          }
        : {
            ok: false,
            message: `${label} 已连接，但工具未返回可解析的标签（原始返回：${text.slice(0, 120) || "空"}）。`,
            tags: [],
          };
    } catch (error: any) {
      return {
        ok: false,
        message: `MCP 连接失败：${error?.message ?? "未知错误"}`,
        tags: [],
      };
    }
  }
  const tags = await queryTagServer(q, 12);
  return tags.length > 0
    ? { ok: true, message: `Tag 服务可用，返回 ${tags.length} 个结果。`, tags }
    : {
        ok: false,
        message: "Tag 服务没有返回结果，请检查地址、鉴权或接口路径。",
        tags: [],
      };
}

function stripIdentityTagsForFeaturePrompt(prompt: string): string {
  return prompt
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const core = part.replace(/^[-+]?\d+(?:\.\d+)?::/, "").replace(/::$/, "").trim();
      return !/^(?:character|copyright)\s*:/i.test(core) && !/^[a-z0-9_.'-]+_\([^)]+\)$/i.test(core);
    })
    .join(", ");
}

export async function reversePromptImage(
  imageBase64: string,
  mode: "tags" | "natural" | "mixed" = "tags",
  scope: string = "full",
  hint: string = "",
  knownCharacter = false,
  templateVersion: "v4.5" | "v5" = "v5",
): Promise<{
  ok: boolean;
  prompt?: string;
  variants?: { namePrompt: string; featurePrompt: string };
  message: string;
}> {
  const settings = getSettings();
  const safeScope = (
    ["full", "character", "object", "scene"].includes(scope) ? scope : "full"
  ) as ReversePromptScope;
  const scopeLabel =
    safeScope === "character"
      ? "角色"
      : safeScope === "object"
        ? "物品"
        : safeScope === "scene"
          ? "场景"
          : "整张图片";
  const userScopeText = [
    `反推范围：${scopeLabel}`,
    hint.trim() ? `目标/角色提示：${hint.trim()}` : "",
    `请严格只围绕“${scopeLabel}”输出结果。`,
  ]
    .filter(Boolean)
    .join("\n");
  const safeTemplateVersion = templateVersion === "v4.5" ? "v4.5" : "v5";
  const builtInTemplates =
    safeTemplateVersion === "v4.5"
      ? safeScope === "full"
        ? V45_REVERSE_SYSTEM_PROMPTS
        : V45_SCOPED_REVERSE_SYSTEM_PROMPTS
      : safeScope === "full"
        ? REVERSE_SYSTEM_PROMPTS
        : SCOPED_REVERSE_SYSTEM_PROMPTS;
  const reconstructionInstruction = `\n反推必须以“可复现画面”为目标，而不是只做粗略识别。输出前逐项核对：主体数量与身份、背景颜色/复杂度、全身或半身取景、视角、人物在画面中的大小与位置、双腿姿势、左右手臂各自的方向/弯曲/指向、手势、头部朝向、注视和表情。\nTag 模式按“人数与构图 → 身份 → 外貌服装 → 姿势动作 → 背景”排序。优先输出图中能直接观察到、能稳定复现构图的成熟 Danbooru Tag，不要用“电影感”“精美光影”等主观修饰替代白色背景、全身、站立、分腿、伸臂、指向等事实。单人全身图不得只写 pointing：若可见，必须同时保留 1girl、solo、white background/simple background、full body、standing、spread legs/legs apart、outstretched arm、pointing、looking at viewer、smile 等互不冲突的成熟 Tag；已知角色必须保留准确的 Danbooru 身份 Tag。左右关系没有可靠 Tag 时可用最短英文短语补足。不要把 standing wide stance 误写成坐姿语义，也不要臆造图中不存在的背景、动作或光照。`;
  const systemPrompt = injectDshImageAiSystemPrompt({
    task: "reverse",
    enabled: settings.reverseConvertDshEnabled,
    mode: settings.reverseConvertDshMode,
    systemPrompt: [
    resolveModePrompt(
      mode,
      safeTemplateVersion === "v5"
        ? settings.reversePromptTemplates
        : settings.reversePromptTemplatesV45,
      settings.visionSystemPrompt,
      builtInTemplates,
    )
      .replace(/\{\{input\}\}/g, userScopeText)
      .replace(/\{\{image\}\}/g, "<uploaded image>"),
    knownCharacterRuntimeInstruction(
      mode,
      "reverse",
      knownCharacter,
      safeTemplateVersion,
    ),
    reconstructionInstruction,
    ].join("\n\n"),
  });

  const preparedVisionImage = await prepareVisionImage(imageBase64);
  const firstUserContent = [
    {
      type: "image_url",
      image_url: {
        url: `data:${preparedVisionImage.mime};base64,${preparedVisionImage.base64}`,
        detail: "high",
      },
    },
    {
      type: "text",
      text: [
        userScopeText,
        "",
        "Generate the prompt for this image.",
        "",
        modeUserInstruction(
          mode,
          "reverse",
          knownCharacter,
          safeTemplateVersion,
        ),
      ].join("\n"),
    },
  ];

  const result = await callVisionApi(
    systemPrompt,
    firstUserContent,
    knownCharacter ? 1100 : 760,
    `AI 反推 · ${safeTemplateVersion} · ${mode} · ${scopeLabel}`,
    true,
  );
  if (!result.ok) return { ok: false, message: `反推失败：${result.message}` };

  const parsed = parsePromptVariantResponse(result.content ?? "", knownCharacter);
  let content = parsed.primary;
  let variants = parsed.variants;
  if (
    knownCharacter &&
    (!variants?.namePrompt.trim() || !variants.featurePrompt.trim())
  ) {
    const fallback = content.trim();
    const namePrompt =
      variants?.namePrompt.trim() || fallback || variants?.featurePrompt.trim() || "";
    const featurePrompt =
      variants?.featurePrompt.trim() ||
      stripIdentityTagsForFeaturePrompt(fallback) ||
      fallback ||
      namePrompt;
    variants = { namePrompt, featurePrompt };
    content = namePrompt;
  }
  return { ok: true, prompt: content, variants, message: "反推成功" };
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
async function enrichTagsWithChinese(
  tags: TagSuggestion[],
): Promise<TagSuggestion[]> {
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
      const res = await translateText(
        todo.map((t) => t.replace(/_/g, " ")).join("\n"),
        "zh",
      );
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
      if ((t.description ?? "").trim() && CJK_RE.test(t.description ?? ""))
        continue;
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
export async function searchTagServer(
  query: string,
  limit = 16,
): Promise<TagSuggestion[]> {
  const settings = getSettings();
  if (!settings.mcpForCapsule) return [];
  const tags = await queryTagServer(query, limit);
  return enrichTagsWithChinese(tags);
}

function extractJsonObject(text: string): any | null {
  const cleaned = (text ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
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
  if (typeof value === "number" && Number.isFinite(value) && value > 0)
    return Math.min(500, Math.round(value));
  return null;
}

function inferPanelCountFromRanges(script: string): number | null {
  const ends = [...script.matchAll(/(\d+)\s*[-~]\s*(\d+)/g)]
    .map((match) => Number(match[2]))
    .filter(Number.isFinite);
  if (!ends.length) return null;
  return Math.min(500, Math.max(...ends));
}

function fallbackComicPanelsV2(
  script: string,
  desiredPanelCount: ComicDesiredPanelCount = "auto",
) {
  const panels: Array<{
    narration: string;
    cnPrompt: string;
    contextSummary: string;
  }> = [];
  const lines = script
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    const range = line.match(/^(\d+)\s*[-~]\s*(\d+)\s*[.。:：、]?\s*(.+)$/);
    if (!range) continue;
    const start = Number(range[1]);
    const end = Number(range[2]);
    const desc = range[3].trim();
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end < start ||
      end - start > 1000
    )
      continue;
    for (let i = start; i <= end; i += 1) {
      panels.push({
        narration: desc,
        cnPrompt: `第 ${i} 格：${desc}。补足镜头动作、场景、人物状态、构图、情绪和连续性。`,
        contextSummary: desc.slice(0, 180),
      });
    }
  }
  if (panels.length > 0) return panels;

  const target = normalizeComicTarget(desiredPanelCount);
  const chunks = script
    .split(/(?<=[。！？!?])\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
  const source = chunks.length ? chunks : [script.trim()];
  const count = target ?? source.length;
  for (let i = 0; i < count; i += 1) {
    const chunk =
      source[
        Math.min(
          source.length - 1,
          Math.floor((i / Math.max(1, count)) * source.length),
        )
      ] ?? script.trim();
    panels.push({
      narration: chunk,
      cnPrompt: `第 ${i + 1} 格：${chunk}。设计成独立漫画分镜，包含镜头景别、人物动作、场景细节、构图和情绪递进。`,
      contextSummary: chunk.slice(0, 180),
    });
  }
  return panels;
}

async function analyzeComicScriptV2(
  request: ComicAnalyzeRequest,
): Promise<ComicAnalyzeResult> {
  const text = request.script.trim();
  if (!text) return { ok: false, message: "请先输入漫画故事或分镜文本。" };
  const settings = getSettings();
  const targetCount =
    normalizeComicTarget(request.desiredPanelCount) ??
    inferPanelCountFromRanges(text);
  const localPanels = fallbackComicPanelsV2(
    text,
    targetCount ?? request.desiredPanelCount,
  );
  if (!settings.convertApiKey.trim() || !settings.convertApiUrl.trim()) {
    const referenceText =
      request.referencePrompts?.filter(Boolean).join("\n") || "";
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

  const referenceText =
    request.referencePrompts?.filter(Boolean).join("\n") || "(none)";
  const systemPrompt = [
    settings.comicAnalyzePromptTemplate?.trim() || COMIC_ANALYZE_SYSTEM_PROMPT,
    targetCount
      ? `Target panel count: ${targetCount}. Keep the final panels as close to this count as possible.`
      : "Panel count: auto.",
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
      "请只返回 JSON。字段：title, globalPrompt, globalCharacterSetting, continuityBible, panels。panels 每项必须包含 narration, cnPrompt, contextSummary；narration 是该镜对应的小说/字幕原文片段，cnPrompt 是可用于生图的画面描述。",
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
      globalCharacterSetting:
        request.referencePrompts?.filter(Boolean).join("\n") || "",
      continuityBible: "",
      panels: localPanels,
    };
  }

  const parsed = extractJsonObject(result.content ?? "");
  const panels = (Array.isArray(parsed?.panels) ? parsed.panels : [])
    .map((p: any) => ({
      narration: String(
        p?.narration ?? p?.originalText ?? p?.sourceText ?? p?.text ?? "",
      ).trim(),
      cnPrompt: String(p?.cnPrompt ?? p?.prompt ?? "").trim(),
      contextSummary: String(p?.contextSummary ?? p?.summary ?? "").trim(),
    }))
    .filter((p: any) => p.cnPrompt);
  const finalPanels =
    panels.length > 0 &&
    (!targetCount ||
      panels.length >= Math.max(1, Math.floor(targetCount * 0.6)))
      ? panels
      : localPanels;
  return {
    ok: true,
    message: `已拆分 ${finalPanels.length} 个分镜。`,
    title: String(parsed?.title ?? "未命名漫画项目").trim(),
    globalPrompt: String(parsed?.globalPrompt ?? text).trim(),
    globalCharacterSetting:
      String(parsed?.globalCharacterSetting ?? "").trim() ||
      request.referencePrompts?.filter(Boolean).join("\n") ||
      "",
    continuityBible: String(parsed?.continuityBible ?? "").trim(),
    panels: finalPanels,
  };
}

export async function analyzeComicScript(
  request: ComicAnalyzeRequest,
): Promise<ComicAnalyzeResult> {
  return analyzeComicScriptV2(request);
}

export async function convertComicPanels(
  request: ComicConvertRequest,
): Promise<ComicConvertResult> {
  if (!request.panels.length)
    return { ok: false, message: "没有需要转换的分镜。", panels: [] };
  const settings = getSettings();
  if (!settings.convertApiKey.trim() || !settings.convertApiUrl.trim()) {
    return {
      ok: true,
      message: `未配置转换 API，已使用本地模板兜底生成 ${request.panels.length} 镜英文提示词；建议配置宽松的转换模型以获得更精确的剧情画面。`,
      panels: request.panels.map((panel) => ({
        panelId: panel.panelId,
        enPrompt: buildComicLocalPrompt(request, panel),
      })),
    };
  }
  const mode = request.mode;
  const systemPrompt = [
    resolveModePrompt(
      mode,
      settings.convertPromptTemplates,
      settings.convertSystemPrompt,
      CONVERT_SYSTEM_PROMPTS,
    ),
    "",
    "你正在为连续漫画生成 NovelAI 生图提示词。必须保持角色、服装、地点、时间线和关键道具前后一致。",
    "每次只输出当前分镜的最终英文提示词，不要解释，不要 Markdown。",
    "必须参考全局设定、参考图反推描述、上一个/当前/下一个中文分镜描述，保持同一角色、场景、物品的英文表达一致。",
    "避免色情、裸露、夸张身体特写。",
  ].join("\n");

  const out: ComicConvertResult["panels"] = [];
  let fallbackCount = 0;
  for (const panel of request.panels) {
    const tagHints =
      mode === "natural" || !settings.mcpForConvert
        ? []
        : await queryTagServer(panel.cnPrompt, 16);
    const userText = [
      `Output mode: ${mode}`,
      "Global story prompt:",
      request.globalPrompt || "(empty)",
      "Global character setting:",
      request.globalCharacterSetting || "(empty)",
      "Global style prompt:",
      request.globalStylePrompt || "(empty)",
      "Reference image reverse prompts:",
      request.referencePrompts.length
        ? request.referencePrompts.join("\n")
        : "(none)",
      "Previous Chinese panel:",
      panel.previousCnPrompt || "(none)",
      "Current panel Chinese description:",
      panel.cnPrompt,
      "Next Chinese panel:",
      panel.nextCnPrompt || "(none)",
      "Previous panel summaries:",
      panel.previousSummaries.length
        ? panel.previousSummaries.join("\n")
        : "(none)",
      "Next panel summaries:",
      panel.nextSummaries.length ? panel.nextSummaries.join("\n") : "(none)",
      "Previous final prompts:",
      panel.previousPrompts.length
        ? panel.previousPrompts.join("\n")
        : "(none)",
      modeUserInstruction(mode, "convert"),
      tagHints.length
        ? `Candidate tags: ${tagHints.map((x) => x.tag).join(", ")}`
        : "",
    ].join("\n\n");
    const result = await callConvertApi(
      systemPrompt,
      userText,
      4096,
      `漫画分镜转换 #${panel.index}`,
    );
    if (!result.ok) {
      fallbackCount += 1;
      out.push({
        panelId: panel.panelId,
        enPrompt: buildComicLocalPrompt(request, panel),
        error: undefined,
      });
      continue;
    }
    let content = cleanPromptOutput(result.content ?? "");
    if (modeNeedsRepair(mode, content)) {
      const repaired = await callConvertApi(
        modeRepairSystemPrompt(mode),
        buildModeRepairUserText(mode, panel.cnPrompt, content),
        900,
        `漫画分镜转换修复 #${panel.index}`,
      );
      if (repaired.ok && repaired.content)
        content = cleanPromptOutput(repaired.content);
    }
    if (!content.trim() || isComicPromptRefusal(content)) {
      fallbackCount += 1;
      content = buildComicLocalPrompt(request, panel);
    }
    out.push({
      panelId: panel.panelId,
      enPrompt: mode === "natural" ? content : mergeTagHints(content, tagHints),
    });
  }
  const failed = out.filter((p) => p.error).length;
  return {
    ok: failed < out.length,
    message: `转换完成：成功 ${out.length - failed}，失败 ${failed}${fallbackCount ? `；其中 ${fallbackCount} 镜使用本地模板兜底` : ""}。`,
    panels: out,
  };
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
  for (let i = 0; i < items.length; i += size)
    chunks.push(items.slice(i, i + size));
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
    request.referencePrompts.length
      ? request.referencePrompts.join("\n")
      : "(none)",
    "All panel outline:",
    JSON.stringify(
      allPanels.map((panel) => ({
        panelId: panel.id,
        index: panel.index,
        cnPrompt: panel.cnPrompt,
      })),
      null,
      2,
    ),
    "Target panels to review in this call:",
    JSON.stringify(
      chunk.map((panel) => ({
        panelId: panel.id,
        index: panel.index,
        cnPrompt: panel.cnPrompt,
        enPrompt: panel.enPrompt,
      })),
      null,
      2,
    ),
    "请只返回 JSON。",
  ].join("\n\n");

  const maxTokens = Math.min(3200, Math.max(1400, 700 + chunk.length * 420));
  const result = await callConvertApi(
    systemPrompt,
    userText,
    maxTokens,
    `漫画一致性检测 ${labelSuffix}`,
  );
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
  if (!byId.size)
    return {
      ok: false,
      message: "模型未返回可解析的 panels JSON。",
      panels: [],
    };

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
  const direct = await checkComicConsistencyChunk(
    request,
    chunk,
    allPanels,
    labelSuffix,
  );
  if (direct.ok || chunk.length === 1) return direct;
  const mid = Math.ceil(chunk.length / 2);
  const left = await checkComicConsistencyWithFallback(
    request,
    chunk.slice(0, mid),
    allPanels,
    `${labelSuffix}-a`,
  );
  if (!left.ok) return left;
  const right = await checkComicConsistencyWithFallback(
    request,
    chunk.slice(mid),
    allPanels,
    `${labelSuffix}-b`,
  );
  if (!right.ok) return right;
  return { ok: true, message: "ok", panels: [...left.panels, ...right.panels] };
}

export async function checkComicConsistency(
  request: ComicConsistencyRequest,
): Promise<ComicConsistencyResult> {
  const reviewable = request.panels.filter((panel) => panel.enPrompt.trim());
  if (!reviewable.length) {
    return {
      ok: false,
      message: "没有可检测的分镜英文提示词，请先转换。",
      panels: [],
    };
  }
  const settings = getSettings();
  if (!settings.convertApiKey.trim() || !settings.convertApiUrl.trim()) {
    return {
      ok: false,
      message: "请先在设置 > 转换 API 中填写 API 地址、模型和 Key。",
      panels: [],
    };
  }

  const panels: ComicConsistencyResult["panels"] = [];
  for (const [chunkIndex, chunk] of chunkPanels(
    reviewable,
    COMIC_CONSISTENCY_CHUNK_SIZE,
  ).entries()) {
    const checked = await checkComicConsistencyWithFallback(
      request,
      chunk,
      reviewable,
      `#${chunkIndex + 1}`,
    );
    if (!checked.ok) {
      return {
        ok: false,
        message: `一致性检测失败：${checked.message}。已保留原英文提示词，未覆盖任何分镜。`,
        panels: [],
      };
    }
    panels.push(...checked.panels);
  }
  const originalById = new Map(
    reviewable.map((panel) => [panel.id, panel.enPrompt.trim()]),
  );
  const changed = panels.filter(
    (panel) =>
      panel.enPrompt.trim() !== (originalById.get(panel.panelId) ?? ""),
  ).length;
  return {
    ok: true,
    message: `一致性检测完成：复核 ${panels.length} 个分镜，调整 ${changed} 个。`,
    panels,
  };
}

// Map a comic reference kind to a NovelAI V4.5 Precise (Director) Reference type.
// "vibe" stays Vibe Transfer; the others are precise references on V4.5.
function preciseTypeForKind(
  kind: ComicReferenceKind,
): PreciseReferenceType | null {
  switch (kind) {
    case "character":
      return "character";
    case "scene":
    case "object":
      return "style";
    case "precise":
      return "character&style";
    default:
      return null; // "vibe" -> Vibe Transfer
  }
}

function comicReferencesToExtras(
  request: ComicGeneratePanelRequest,
): GenerateExtras {
  const usable = request.references.filter(
    (ref) => ref.base64 && ref.useForGeneration !== false,
  );
  // Precise/Director references are only available on V4.5 models. V5 also
  // lacks Vibe Transfer at launch, so never convert a V5 precise reference into
  // another unsupported transport.
  const supportsPrecise = supportsNAIPreciseReference(request.params.model);
  if (
    usable.length > 0 &&
    isNAIV5Model(request.params.model)
  ) {
    throw new Error(
      "精准参考当前仅支持 NovelAI V4.5；V5 首发尚未开放该功能。请切换漫画项目模型到 V4.5，或移除参考图。",
    );
  }

  const vibeImages: VibeTransferItem[] = [];
  const preciseReferences: PreciseReferenceItem[] = [];

  for (const ref of usable) {
    const base64 = stripBase64Prefix(ref.base64);
    const preciseType = supportsPrecise ? preciseTypeForKind(ref.kind) : null;
    if (preciseType) {
      preciseReferences.push({
        base64,
        type: preciseType,
        strength: clamp01(Number(ref.strength) || 1, 1),
        fidelity: clamp01(Number(ref.infoExtracted) || 1, 1),
      });
    } else {
      vibeImages.push({
        base64,
        infoExtracted: clamp01(
          Number(ref.infoExtracted) || (ref.kind === "precise" ? 1 : 0.7),
          0.7,
        ),
        strength: clamp01(
          Number(ref.strength) || (ref.kind === "precise" ? 0.65 : 0.45),
          0.45,
        ),
      });
    }
  }

  return { vibeImages, charCaptions: [], preciseReferences };
}

export async function generateComicPanel(
  request: ComicGeneratePanelRequest,
): Promise<GenerateResult> {
  const params: GenerateParams = {
    ...request.params,
    fileNamePrefix:
      request.params.fileNamePrefix || `comic-${request.panelIndex}`,
    positivePrompt: mergePrompt(request.globalStylePrompt, request.panelPrompt),
    stylePrompt: "",
    negativePrompt:
      request.negativeMode === "override"
        ? request.localNegativePrompt
        : mergePrompt(
            request.globalNegativePrompt,
            request.localNegativePrompt,
          ),
  };
  const extras = comicReferencesToExtras(request);
  // Ensure the comic's history group UP FRONT so panels are saved INTO its disk
  // subfolder (outputDir/<date>/<group>/) and tagged with its groupId at save
  // time — previously they landed in the flat date folder and only got the
  // groupId reassigned afterwards (disk folder didn't match the group).
  const historyGroup = ensureHistoryGroup(
    request.projectTitle,
    request.historyGroupId,
  );
  const groupOverride = {
    groupId: historyGroup.id,
    folderName: sanitizeGroupFolderName(historyGroup.name),
  };
  const result = await generateImage(params, extras, { groupOverride });
  if (result.ok && result.items.length > 0) {
    result.items = result.items.map((item) => {
      const updated = updateHistoryItem(item.id, {
        feature: "comic",
        groupId: historyGroup.id,
        comicProjectId: request.projectId,
        comicPanelNo: request.panelIndex,
      });
      return (
        updated ?? {
          ...item,
          feature: "comic",
          groupId: historyGroup.id,
          comicProjectId: request.projectId,
          comicPanelNo: request.panelIndex,
        }
      );
    });
  }
  return result;
}

export async function generateTagComicCandidate(
  request: TagComicGenerateRequest,
): Promise<GenerateResult> {
  const params: GenerateParams = {
    ...request.params,
    fileNamePrefix:
      request.params.fileNamePrefix || `comic-${request.panelIndex}`,
    positivePrompt: mergePrompt(request.globalStylePrompt, request.panelPrompt),
    stylePrompt: "",
    negativePrompt: request.globalNegativePrompt,
  };
  const historyGroup = ensureHistoryGroup(
    request.projectTitle,
    request.historyGroupId,
  );
  const groupOverride = {
    groupId: historyGroup.id,
    folderName: sanitizeGroupFolderName(historyGroup.name),
  };
  const preciseReferences: PreciseReferenceItem[] = [];
  for (const reference of request.preciseReferences ?? []) {
    try {
      const filePath = path.resolve(reference.filePath);
      const root = tagComicReferenceRoot(request.projectId);
      if (!isInsideDir(filePath, root)) continue;
      const buffer = await fs.readFile(filePath);
      if (!isImageBuffer(buffer)) continue;
      preciseReferences.push({
        base64: buffer.toString("base64"),
        type: reference.type,
        strength: reference.strength,
        fidelity: reference.fidelity,
        informationExtracted: reference.informationExtracted,
      });
    } catch {
      // A moved/deleted project resource is ignored; the renderer keeps the
      // selection visible so the user can replace it deliberately.
    }
  }
  const result = await generateImage(
    params,
    { vibeImages: [], charCaptions: [], preciseReferences },
    { groupOverride },
  );
  if (result.ok && result.items.length > 0) {
    result.items = result.items.map((item) => {
      const updated = updateHistoryItem(item.id, {
        feature: "comic",
        groupId: historyGroup.id,
        comicProjectId: request.projectId,
        comicPanelNo: request.panelIndex,
      });
      return (
        updated ?? {
          ...item,
          feature: "comic",
          groupId: historyGroup.id,
          comicProjectId: request.projectId,
          comicPanelNo: request.panelIndex,
        }
      );
    });
  }
  return result;
}

function safeComicProjectId(projectId: unknown): string {
  const value = String(projectId ?? "").trim();
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value)) {
    throw new Error("Invalid comic project id");
  }
  return value;
}

function tagComicReferenceRoot(projectId: unknown): string {
  return path.join(
    app.getPath("userData"),
    "comic-projects",
    safeComicProjectId(projectId),
    "references",
  );
}

export async function importTagComicReference(
  request: TagComicReferenceImportRequest,
): Promise<TagComicReferenceImportResult> {
  try {
    const sourcePath = path.resolve(String(request?.sourcePath ?? ""));
    const buffer = await fs.readFile(sourcePath);
    if (!isImageBuffer(buffer)) {
      return { ok: false, message: "Unsupported image file." };
    }
    const root = tagComicReferenceRoot(request.projectId);
    await fs.mkdir(root, { recursive: true });
    const id = crypto.randomUUID();
    const ext = detectExt(buffer);
    const filePath = path.join(root, `${id}.${ext}`);
    await fs.writeFile(filePath, buffer);
    return {
      ok: true,
      message: "Reference imported.",
      asset: {
        id,
        name: path.basename(sourcePath),
        filePath,
        fileUrl: toLocalMediaUrl(filePath),
        type: "character",
        strength: 1,
        fidelity: 1,
        informationExtracted: 1,
        scope: "all",
        scopePanelIds: [],
      },
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function deleteTagComicReference(
  projectId: string,
  referenceId: string,
): Promise<{ ok: boolean }> {
  try {
    if (!/^[a-f0-9-]{20,}$/i.test(referenceId)) return { ok: false };
    const root = tagComicReferenceRoot(projectId);
    const names = await fs.readdir(root).catch(() => []);
    await Promise.all(
      names
        .filter((name) => name.startsWith(`${referenceId}.`))
        .map((name) => fs.unlink(path.join(root, name)).catch(() => undefined)),
    );
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function generateArtistLabImage(
  params: GenerateParams,
  extras: GenerateExtras,
  rawMode: unknown,
): Promise<GenerateResult> {
  const mode = rawMode === "target" ? "target" : "random";
  const group = mode === "target" ? ensureHistoryGroup("画风实验室-目标迭代") : null;
  const result = await generateImage(
    {
      ...params,
      fileNamePrefix: params.fileNamePrefix || `artist-lab-${mode}`,
    },
    extras,
    mode === "random"
      ? { temporary: true }
      : {
          groupOverride: {
            groupId: group!.id,
            folderName: sanitizeGroupFolderName(group!.name),
          },
        },
  );
  if (result.ok && mode === "target") {
    result.items = result.items.map((item) =>
      updateHistoryItem(item.id, {
        feature: "artist-lab",
        groupId: group!.id,
      }) ?? { ...item, feature: "artist-lab", groupId: group!.id },
    );
  }
  return result;
}

function artistLabTemporaryRoot(): string {
  return path.join(app.getPath("temp"), "langbai-novelai-studio", "artist-lab-random");
}

export async function promoteArtistLabFavorite(rawItem: HistoryItem): Promise<HistoryItem> {
  if (!rawItem?.filePath || !isInsideDir(rawItem.filePath, artistLabTemporaryRoot())) {
    throw new Error("无效的画风实验室临时图片。");
  }
  const source = path.resolve(rawItem.filePath);
  await fs.access(source);
  const settings = getSettings();
  const group = ensureHistoryGroup("画风实验室-随机抽卡");
  const date = rawItem.date || dateStamp(new Date());
  const dir = path.join(settings.outputDir, date, sanitizeGroupFolderName(group.name));
  await fs.mkdir(dir, { recursive: true });
  const parsed = path.parse(source);
  const destination = await uniqueFilePath(dir, parsed.name, parsed.ext.replace(/^\./, "") || "png");
  try {
    await fs.rename(source, destination);
  } catch {
    await fs.copyFile(source, destination);
    await fs.unlink(source).catch(() => undefined);
  }
  const promoted: HistoryItem = {
    ...rawItem,
    filePath: destination,
    fileUrl: toLocalMediaUrl(destination),
    feature: "artist-lab",
    groupId: group.id,
  };
  addHistory([promoted]);
  return promoted;
}

export async function deleteArtistLabTemporary(filePath: unknown): Promise<{ ok: boolean }> {
  if (typeof filePath !== "string" || !isInsideDir(filePath, artistLabTemporaryRoot())) {
    return { ok: false };
  }
  await fs.unlink(filePath).catch(() => undefined);
  return { ok: true };
}

export async function clearArtistLabTemporary(): Promise<{ ok: boolean }> {
  await fs.rm(artistLabTemporaryRoot(), { recursive: true, force: true });
  return { ok: true };
}

export async function exportTagComicSelectedZip(
  request: TagComicExportZipRequest,
): Promise<{ ok: boolean; message: string; path?: string }> {
  const project = request?.project;
  if (
    !project ||
    project.schemaVersion !== 2 ||
    !Array.isArray(project.panels)
  ) {
    return { ok: false, message: "漫画项目格式无效。" };
  }
  const selected = [...project.panels]
    .sort((a, b) => a.index - b.index)
    .map((panel) => ({
      panel,
      candidate: panel.candidates.find(
        (item) => item.id === panel.selectedCandidateId,
      ),
    }))
    .filter((item) => Boolean(item.candidate?.outputPath));
  if (!selected.length)
    return { ok: false, message: "请先为至少一个分镜选择主图。" };

  const outputRoot = path.resolve(getSettings().outputDir);
  const result = await dialog.showSaveDialog({
    title: "导出漫画主图 ZIP",
    defaultPath: `${safeZipName(project.title)}.zip`,
    filters: [{ name: "ZIP 压缩包", extensions: ["zip"] }],
  });
  if (result.canceled || !result.filePath)
    return { ok: false, message: "已取消导出。" };

  const zip = new JSZip();
  const images = zip.folder("images");
  const manifest: Array<Record<string, unknown>> = [];
  let imageCount = 0;
  for (const { panel, candidate } of selected) {
    if (!candidate || !isInsideDir(candidate.outputPath, outputRoot)) continue;
    try {
      const buffer = await fs.readFile(candidate.outputPath);
      if (!isImageBuffer(buffer)) continue;
      const fileName = `${String(panel.index).padStart(3, "0")}.${detectExt(buffer)}`;
      images?.file(fileName, buffer);
      manifest.push({
        index: panel.index,
        title: panel.title,
        prompt: panel.prompt,
        selectedCandidateId: candidate.id,
        file: `images/${fileName}`,
      });
      imageCount += 1;
    } catch {
      // Missing or moved outputs are skipped; only valid selected main images ship.
    }
  }
  if (!imageCount)
    return { ok: false, message: "选中的主图已被移动或删除，无法导出。" };

  zip.file(
    "project.json",
    JSON.stringify(
      {
        schemaVersion: 2,
        title: project.title,
        globalStylePrompt: project.globalStylePrompt,
        globalNegativePrompt: project.globalNegativePrompt,
        panels: manifest,
      },
      null,
      2,
    ),
  );
  zip.file(
    "prompts.md",
    [
      `# ${project.title || "Comic Project"}`,
      "",
      ...manifest.flatMap((item) => [
        `## ${String(item.index).padStart(3, "0")} · ${item.title || "Panel"}`,
        "",
        String(item.prompt || ""),
        "",
      ]),
    ].join("\n"),
  );
  await fs.writeFile(
    result.filePath,
    await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
  );
  return {
    ok: true,
    message: `已导出 ${imageCount} 张当前主图。`,
    path: result.filePath,
  };
}

function safeZipName(name: string) {
  return (
    (name || "comic-project")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "_")
      .slice(0, 80) || "comic-project"
  );
}

// Strict image-magic check (detectExt() defaults to "png" and is NOT a validator).
function isImageBuffer(buffer: Buffer): boolean {
  if (buffer.length < 6) return false;
  if (
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return true; // png
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
    return true; // jpeg
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

export async function convertPromptText(
  chineseText: string,
  mode: "tags" | "natural" | "mixed" = "tags",
  knownCharacter = false,
  templateVersion: "v4.5" | "v5" = "v5",
): Promise<{
  ok: boolean;
  result?: string;
  variants?: { namePrompt: string; featurePrompt: string };
  message: string;
}> {
  const settings = getSettings();
  const safeTemplateVersion = templateVersion === "v4.5" ? "v4.5" : "v5";
  const baseSystemPrompt = resolveModePrompt(
    mode,
    safeTemplateVersion === "v5"
      ? settings.convertPromptTemplates
      : settings.convertPromptTemplatesV45,
    settings.convertSystemPrompt,
    safeTemplateVersion === "v5"
      ? CONVERT_SYSTEM_PROMPTS
      : V45_CONVERT_SYSTEM_PROMPTS,
  ).replace(/\{\{input\}\}/g, "<provided in the user message>");
  const systemPrompt = injectDshImageAiSystemPrompt({
    task: "convert",
    enabled: settings.reverseConvertDshEnabled,
    mode: settings.reverseConvertDshMode,
    systemPrompt: [
      baseSystemPrompt,
      knownCharacterRuntimeInstruction(
        mode,
        "convert",
        knownCharacter,
        safeTemplateVersion,
      ),
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
  const userText = buildConvertUserText(
    chineseText,
    mode,
    "",
    knownCharacter,
    safeTemplateVersion,
  );
  const result = await callConvertApi(
    systemPrompt,
    userText,
    knownCharacter ? 1100 : 700,
    `提示词转换 · ${mode}`,
    true,
  );
  if (!result.ok) return { ok: false, message: `转换失败：${result.message}` };

  const parsed = parsePromptVariantResponse(result.content ?? "", knownCharacter);
  let content = parsed.primary;
  let variants = parsed.variants;
  if (
    knownCharacter &&
    (!variants?.namePrompt.trim() || !variants.featurePrompt.trim())
  ) {
    const fallback = content.trim();
    const namePrompt =
      variants?.namePrompt.trim() || fallback || variants?.featurePrompt.trim() || "";
    const featurePrompt =
      variants?.featurePrompt.trim() ||
      stripIdentityTagsForFeaturePrompt(fallback) ||
      fallback ||
      namePrompt;
    variants = { namePrompt, featurePrompt };
    content = namePrompt;
  }
  return { ok: true, result: content, variants, message: "转换成功" };
}

export async function loadImageFromPath(
  filePath: string,
): Promise<LoadImageResult> {
  try {
    const buffer = await fs.readFile(filePath);
    const dims = readImageDimensions(buffer);
    workbenchImagePath = filePath;
    return {
      ok: true,
      image: {
        filePath,
        fileUrl: toLocalMediaUrl(filePath),
        width: dims.width,
        height: dims.height,
      },
      metadata: extractEmbeddedGenerationMetadata(buffer),
    };
  } catch (error: any) {
    return {
      ok: false,
      message: `加载图片失败：${error?.message ?? "未知错误"}`,
    };
  }
}

export async function generateImage(
  params: GenerateParams,
  extras?: GenerateExtras,
  saveOptions?: {
    ignoreActiveGroup?: boolean;
    groupOverride?: { groupId: string; folderName: string };
    temporary?: boolean;
    onPreview?: GenerationPreviewCallback;
  },
): Promise<GenerateResult> {
  params = normalizeGenerateParams(params);
  const token = getToken();
  if (!token)
    return {
      ok: false,
      message: "请先在 设置 > 网络/API 中配置 NovelAI API Token。",
      items: [],
    };
  if (!params.positivePrompt.trim())
    return { ok: false, message: "请输入正面提示词。", items: [] };

  logInfo(
    `generate: model=${params.model} size=${params.width}x${params.height} steps=${params.steps} ` +
      `cfg=${params.cfgScale} vibe=${extras?.vibeImages?.length ?? 0} precise=${extras?.preciseReferences?.length ?? 0}`,
  );
  const job = beginJob();

  // "fixed" mode honors the chosen seed; "random" (or seed<=0) rolls a new one.
  const useFixedSeed = params.seedMode !== "random" && params.seed > 0;
  const actualSeed = useFixedSeed
    ? params.seed
    : crypto.randomInt(1, 2_147_483_647);

  try {
    const preparedExtras = await prepareExtras(
      params,
      extras,
      job.controller.signal,
    );
    const payload = buildPayload(params, actualSeed, preparedExtras);
    let buffers: Buffer[];
    try {
      buffers = await postGenerateImageWithOptionalPreview(
        payload,
        job.controller.signal,
        saveOptions?.onPreview,
      );
    } catch (error: any) {
      if (
        error?.streamPreviewStarted ||
        !shouldRetryCharCaptionsAsPipe(error, params, preparedExtras)
      )
        throw error;
      const pipePayload = buildPayload(
        params,
        actualSeed,
        preparedExtras,
        "pipe",
      );
      buffers = await postGenerateImageWithOptionalPreview(
        pipePayload,
        job.controller.signal,
        saveOptions?.onPreview,
      );
    }
    if (buffers.length === 0)
      return {
        ok: false,
        message: "API 返回成功，但压缩包中没有图片。",
        items: [],
      };
    const requestedGroup = resolveGenerationSaveGroup(extras?.historyGroupId);
    const ordinarySaveOptions = saveOptions?.groupOverride || saveOptions?.temporary
      ? saveOptions
      : {
          ...saveOptions,
          ignoreActiveGroup: !requestedGroup,
          groupOverride: requestedGroup,
        };
    const items = await saveBuffers(
      buffers,
      params,
      actualSeed,
      "t2i",
      undefined,
      ordinarySaveOptions,
    );
    void refreshStoredAccount();
    return {
      ok: true,
      message: `生成完成，已保存 ${items.length} 张图片。`,
      items,
      actualSeed,
    };
  } catch (error: any) {
    return handleGenerateError(error, "图片生成失败");
  } finally {
    job.end();
  }
}

export async function generateI2I(
  params: GenerateParams,
  i2i: I2IParams,
  extras?: GenerateExtras,
): Promise<GenerateResult> {
  params = normalizeGenerateParams(params);
  const token = getToken();
  if (!token) return { ok: false, message: "请先配置 API Token。", items: [] };
  if (!params.positivePrompt.trim())
    return { ok: false, message: "请输入正面提示词。", items: [] };
  if (!workbenchImagePath)
    return { ok: false, message: "请先加载参考图片。", items: [] };
  logInfo(
    `img2img: model=${params.model} size=${params.width}x${params.height} strength=${i2i?.strength}`,
  );

  const job = beginJob();

  const actualSeed =
    params.seedMode !== "random" && params.seed > 0
      ? params.seed
      : crypto.randomInt(1, 2_147_483_647);
  try {
    const preparedExtras = await prepareExtras(
      params,
      extras,
      job.controller.signal,
    );
    // Resize the source to the requested output dimensions — NovelAI's img2img
    // expects the input image to match width×height; sending an arbitrary size
    // risks a 400/500 or a misaligned composition.
    const { buffer: workbenchBuffer } = await readWorkbenchImage();
    const base64Image = resizeImageBufferToPng(
      workbenchBuffer,
      params.width,
      params.height,
    ).toString("base64");
    const strength = clamp01(i2i.strength, 0.7);
    const applyI2I = (payload: ReturnType<typeof buildPayload>) => {
      payload.action = "img2img";
      payload.parameters.image = base64Image;
      payload.parameters.strength = strength;
      // The UI no longer exposes this ineffective control. Keep the field for
      // API compatibility, but always send the official/default value.
      payload.parameters.noise = 0;
      // NOTE: the unofficial SDK's nested `img2img` descriptor was dropped — it
      // is unverified and the same change regressed inpaint. We keep the standard
      // flat strength/noise img2img payload plus the source-resize fix above.
      payload.parameters.extra_noise_seed =
        i2i.extraNoiseSeed > 0
          ? i2i.extraNoiseSeed
          : crypto.randomInt(1, 2_147_483_647);
      return payload;
    };

    let buffers: Buffer[];
    try {
      buffers = await postGenerateImage(
        applyI2I(buildPayload(params, actualSeed, preparedExtras)),
        job.controller.signal,
      );
    } catch (error: any) {
      if (!shouldRetryCharCaptionsAsPipe(error, params, preparedExtras))
        throw error;
      buffers = await postGenerateImage(
        applyI2I(buildPayload(params, actualSeed, preparedExtras, "pipe")),
        job.controller.signal,
      );
    }
    if (buffers.length === 0)
      return { ok: false, message: "图生图成功但无图片返回。", items: [] };
    const items = await saveBuffers(buffers, params, actualSeed, "i2i");
    void refreshStoredAccount();
    return {
      ok: true,
      message: `图生图完成，已保存 ${items.length} 张图片。`,
      items,
      actualSeed,
    };
  } catch (error: any) {
    return handleGenerateError(error, "图生图失败");
  } finally {
    job.end();
  }
}

// Batch redraw = img2img on an EXPLICIT source image (not the workbench image),
// saved into a named history group (created if missing) on disk + in history.
// Driven serially by the 图片批量重绘 tool, one call per image.
export async function redrawImage(
  request: BatchRedrawRequest,
): Promise<GenerateResult> {
  const params = normalizeGenerateParams({
    ...request.params,
    fileNamePrefix:
      request.fileNamePrefix || request.params.fileNamePrefix || "redraw",
  });
  const token = getToken();
  if (!token) return { ok: false, message: "请先配置 API Token。", items: [] };
  if (!request.imageBase64)
    return { ok: false, message: "缺少待重绘的图片。", items: [] };
  if (!params.positivePrompt.trim())
    return { ok: false, message: "该图片缺少提示词。", items: [] };

  const job = beginJob();
  const actualSeed =
    params.seedMode !== "random" && params.seed > 0
      ? params.seed
      : crypto.randomInt(1, 2_147_483_647);
  try {
    const preparedExtras = await prepareExtras(
      params,
      request.extras,
      job.controller.signal,
    );
    const srcBuffer = Buffer.from(
      stripBase64Prefix(request.imageBase64),
      "base64",
    );
    const base64Image = resizeImageBufferToPng(
      srcBuffer,
      params.width,
      params.height,
    ).toString("base64");
    const strength = clamp01(request.strength, 0.4);
    const group = ensureHistoryGroup(request.groupName);
    const groupOverride = {
      groupId: group.id,
      folderName: sanitizeGroupFolderName(group.name),
    };

    const applyI2I = (payload: ReturnType<typeof buildPayload>) => {
      payload.action = "img2img";
      payload.parameters.image = base64Image;
      payload.parameters.strength = strength;
      payload.parameters.noise = 0;
      payload.parameters.extra_noise_seed = crypto.randomInt(1, 2_147_483_647);
      return payload;
    };

    let buffers: Buffer[];
    try {
      buffers = await postGenerateImage(
        applyI2I(buildPayload(params, actualSeed, preparedExtras)),
        job.controller.signal,
      );
    } catch (error: any) {
      if (!shouldRetryCharCaptionsAsPipe(error, params, preparedExtras))
        throw error;
      buffers = await postGenerateImage(
        applyI2I(buildPayload(params, actualSeed, preparedExtras, "pipe")),
        job.controller.signal,
      );
    }
    if (buffers.length === 0)
      return { ok: false, message: "重绘成功但无图片返回。", items: [] };
    const items = await saveBuffers(
      buffers,
      params,
      actualSeed,
      "redraw",
      undefined,
      { groupOverride },
    );
    void refreshStoredAccount();
    logInfo(
      `batch-redraw: model=${params.model} ${params.width}x${params.height} strength=${strength} group=${request.groupName}`,
    );
    return {
      ok: true,
      message: `重绘完成，已保存到分组「${group.name}」。`,
      items,
      actualSeed,
    };
  } catch (error: any) {
    return handleGenerateError(error, "批量重绘失败");
  } finally {
    job.end();
  }
}

export async function inpaintImage(
  params: GenerateParams,
  inpaintModel: NAIInpaintModel,
  maskBase64: string,
  strength = 1,
  noise = 0,
): Promise<GenerateResult> {
  params = normalizeGenerateParams(params);
  const token = getToken();
  if (!token) return { ok: false, message: "请先配置 API Token。", items: [] };
  if (!params.positivePrompt.trim())
    return { ok: false, message: "请输入正面提示词。", items: [] };
  if (!workbenchImagePath)
    return { ok: false, message: "请先加载原图。", items: [] };
  if (!maskBase64)
    return { ok: false, message: "请先绘制需要重绘的蒙版区域。", items: [] };

  const job = beginJob();

  try {
    const { buffer } = await readWorkbenchImage();
    const preparedAssets = prepareInpaintAssets(buffer, maskBase64);
    const actualSeed =
      params.seedMode !== "random" && params.seed > 0
        ? params.seed
        : crypto.randomInt(1, 2_147_483_647);
    const normalizedStrength = Math.max(
      0,
      Math.min(1, Number.isFinite(strength) ? strength : 1),
    );
    // Retain the argument and transport field for backward compatibility while
    // intentionally pinning the removed UI control to zero.
    void noise;
    const normalizedNoise = 0;
    const buildInpaintPayload = (model: NAIInpaintModel) => {
      const inpaintParams: PayloadParams = {
        ...params,
        model,
        width: preparedAssets.width,
        height: preparedAssets.height,
      };
      const historyParams: GenerateParams = {
        ...params,
        width: preparedAssets.width,
        height: preparedAssets.height,
      };
      const payload = buildPayload(inpaintParams, actualSeed);
      payload.action = "infill";
      applyOfficialInpaintParameters(
        payload.parameters,
        preparedAssets,
        normalizedStrength,
        normalizedNoise,
        actualSeed,
      );
      return { payload, historyParams, model };
    };

    let chosen: ReturnType<typeof buildInpaintPayload> | null = null;
    let buffers: Buffer[] | null = null;
    let lastError: any = null;
    const candidates = inpaintModelCandidates(inpaintModel);
    for (let index = 0; index < candidates.length; index += 1) {
      chosen = buildInpaintPayload(candidates[index]);
      try {
        buffers = await postGenerateImage(
          chosen.payload,
          job.controller.signal,
        );
        break;
      } catch (error: any) {
        lastError = error;
        // Only retry when the server explicitly rejects the selected inpaint
        // model. A paid request that reaches a 5xx may already have run, so a
        // broad server-error retry can duplicate both generation and charge.
        const retryable = isInpaintModelCompatibilityError(error);
        if (!retryable || index >= candidates.length - 1) {
          annotateInpaintError(error, preparedAssets, candidates[index]);
          throw error;
        }
      }
    }
    if (!chosen || !buffers)
      throw lastError ?? new Error("重绘请求未返回结果。");
    if (buffers.length === 0)
      return { ok: false, message: "重绘成功但无图片返回。", items: [] };
    const outputBuffers = compositeInpaintBuffers(buffers, preparedAssets);
    const items = await saveBuffers(
      outputBuffers,
      chosen.historyParams,
      actualSeed,
      "inpaint",
      chosen.model,
    );
    void refreshStoredAccount();
    const resizedNote = preparedAssets.resized
      ? `已按官网规则自适应尺寸 ${preparedAssets.originalWidth}×${preparedAssets.originalHeight} → ${preparedAssets.width}×${preparedAssets.height}。`
      : "";
    return {
      ok: true,
      message: `重绘完成，已保存 ${items.length} 张图片。${resizedNote}`,
      items,
      actualSeed,
    };
  } catch (error: any) {
    return handleGenerateError(error, "重绘失败");
  } finally {
    job.end();
  }
}

export async function upscaleImg(
  scale: UpscaleScale,
  model: string,
): Promise<SingleImageResult> {
  const token = getToken();
  if (!token) return { ok: false, message: "请先配置 API Token。" };
  if (!workbenchImagePath) return { ok: false, message: "请先加载图片。" };
  logInfo(`upscale: scale=${scale}x`);

  const job = beginJob();
  const abort = job.controller;

  try {
    const { buffer, image } = await readWorkbenchImage();
    if (!image.width || !image.height) {
      return { ok: false, message: "无法读取图片尺寸，请重新加载图片。" };
    }
    const preparedImage = prepareLimitedImage(
      buffer,
      MAX_NAI_UPSCALE_INPUT_PIXELS,
    );
    const outputSize = resolveUpscaleOutputSize(
      preparedImage.width,
      preparedImage.height,
      scale,
    );
    if (outputSize.exceedsLimit) {
      return {
        ok: false,
        message: `超分后尺寸将达到 ${outputSize.width}×${outputSize.height}，超过允许的最大尺寸 ${MAX_NAI_UPSCALE_OUTPUT_DIMENSION}×${MAX_NAI_UPSCALE_OUTPUT_DIMENSION}，已取消请求。请改用 2× 或换用更小的原图。`,
      };
    }
    const settings = getSettings();
    // The dedicated upscaler is served by image.novelai.net and returns a ZIP
    // archive (same as generate-image), not a raw PNG.
    const imageBaseUrl = resolveUpscaleBaseUrl(settings.imageBaseUrl);
    const upscaleModel = resolveUpscaleModel(model);
    const passes = scale === 4 ? 2 : 1;
    let passInput = Buffer.from(preparedImage.base64, "base64");
    let outBuffer = passInput;
    for (let pass = 0; pass < passes; pass += 1) {
      const res = await requestWithRetry(
        () =>
          axios.post(
            `${imageBaseUrl}/ai/upscale`,
            {
              image: passInput.toString("base64"),
              model: upscaleModel,
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
        // Paid upscale POST — only retry pre-charge 429s, never 5xx.
        { signal: abort.signal, retryStatuses: [429] },
      );

      // Response is usually a ZIP containing the upscaled PNG; fall back to raw bytes.
      try {
        const images = await extractImages(res.data);
        outBuffer = images.length > 0 ? images[0] : Buffer.from(res.data);
      } catch {
        outBuffer = Buffer.from(res.data); // not a zip — treat as raw image bytes
      }
      if (outBuffer.length === 0) break;
      passInput = outBuffer;
    }
    if (outBuffer.length === 0) {
      return { ok: false, message: "超分返回了空数据。" };
    }

    const now = new Date();
    const date = dateStamp(now);
    const activeGroup = resolveGenerationSaveGroup();
    const dir = activeGroup
      ? path.join(settings.outputDir, date, activeGroup.folderName)
      : path.join(settings.outputDir, date);
    await fs.mkdir(dir, { recursive: true });
    const baseName = path
      .basename(workbenchImagePath, path.extname(workbenchImagePath))
      .replace(/[^\w.-]+/g, "-");
    const filePath = path.join(
      dir,
      `${now.getTime()}-upscale${scale}x-${baseName}.png`,
    );
    // Upscale has its own save path, so apply the same metadata preference used
    // by generation, img2img, inpaint, batch redraw, and Director tools.
    await fs.writeFile(
      filePath,
      prepareImageBufferForSave(
        outBuffer,
        settings.keepImageMetadata !== false,
      ),
    );
    const outDims = readImageDimensions(outBuffer);
    const outWidth = outDims.width || preparedImage.width * scale;
    const outHeight = outDims.height || preparedImage.height * scale;
    const item: HistoryItem = {
      id: crypto.randomUUID(),
      filePath,
      fileUrl: toLocalMediaUrl(filePath),
      date,
      createdAt: now.toISOString(),
      params: {
        ...DEFAULT_PARAMS,
        width: outWidth,
        height: outHeight,
        positivePrompt: "upscale",
      },
      actualSeed: 0,
      model: "upscale",
      width: outWidth,
      height: outHeight,
      groupId: activeGroup?.groupId,
    };
    addHistory([item]);
    void refreshStoredAccount();
    const resizeNote = preparedImage.resized
      ? `原图 ${preparedImage.originalWidth}×${preparedImage.originalHeight} 超过 NovelAI 超分输入上限，已先缩至 ${preparedImage.width}×${preparedImage.height} 后执行。`
      : "";
    return { ok: true, message: `超分 ${scale}x 完成。${resizeNote}`, item };
  } catch (error: any) {
    if (axios.isCancel(error) || error?.code === "ERR_CANCELED")
      return { ok: false, message: "超分已取消。" };
    const status = error?.response?.status;
    const detail = responseErrorText(error) || "未知错误";
    const hint = /resolution too high/i.test(detail)
      ? "NovelAI 超分只接受约 1024×1024 等效面积以内的输入；程序会自动缩小后重试，如仍失败请换更小的图片。"
      : "";
    return {
      ok: false,
      message: `超分失败${status ? `（HTTP ${status}）` : ""}：${detail}${hint ? ` ${hint}` : ""}`,
    };
  } finally {
    job.end();
  }
}

export async function augmentImg(
  tool: DirectorTool,
  options: AugmentOptions,
): Promise<GenerateResult> {
  const token = getToken();
  if (!token) return { ok: false, message: "请先配置 API Token。", items: [] };
  if (!workbenchImagePath)
    return { ok: false, message: "请先加载图片。", items: [] };
  logInfo(`director: tool=${tool}`);

  const job = beginJob();

  try {
    const { buffer, image } = await readWorkbenchImage();
    if (!image.width || !image.height) {
      return {
        ok: false,
        message: "无法读取图片尺寸，请重新加载图片。",
        items: [],
      };
    }
    const preparedImage = prepareLimitedImage(
      buffer,
      MAX_NAI_DIRECTOR_INPUT_PIXELS,
      {
        flattenAlpha: true,
        forcePng: true,
      },
    );
    const settings = getSettings();
    const imageBaseUrl = tokenSafeBaseUrl(
      settings.imageBaseUrl,
      "https://image.novelai.net",
    );
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
      signal: job.controller.signal,
      ...proxyConfig("nai"),
    });

    const buffers = await extractImages(res.data);
    if (buffers.length === 0)
      return { ok: false, message: "后期处理成功但无图片返回。", items: [] };
    const outputBuffers = preparedImage.resized
      ? buffers.map((buffer) =>
          resizeImageBufferToPng(
            buffer,
            preparedImage.originalWidth,
            preparedImage.originalHeight,
          ),
        )
      : buffers;
    const historyParams: GenerateParams = {
      ...DEFAULT_PARAMS,
      positivePrompt: `director:${tool}`,
      width: preparedImage.originalWidth,
      height: preparedImage.originalHeight,
    };
    const items = await saveBuffers(
      outputBuffers,
      historyParams,
      0,
      `director-${tool}`,
      `director-${tool}`,
    );
    void refreshStoredAccount();
    const resizeNote = preparedImage.resized
      ? `原图 ${preparedImage.originalWidth}×${preparedImage.originalHeight} 超过后期接口稳态尺寸，已先缩至 ${preparedImage.width}×${preparedImage.height} 处理，并恢复到原尺寸。`
      : "";
    return {
      ok: true,
      message: `后期处理完成，已保存 ${items.length} 张图片。${resizeNote}`,
      items,
    };
  } catch (error: any) {
    return handleGenerateError(error, "后期处理失败");
  } finally {
    job.end();
  }
}

// Only treat a 400/422 as a reference problem when the server error actually
// names a reference field. A generic 400 (bad size, model, prompt, etc.) must
// NOT be classified as "reference", otherwise callers (e.g. the comic queue)
// fire a second *paid* reference-less retry that both wastes Anlas and hides the
// real cause.
function looksLikeReferenceError(detail: string): boolean {
  return /reference|vibe|director_reference|encode|information_extracted|controlnet/i.test(
    detail,
  );
}

function handleGenerateError(error: any, prefix: string): GenerateResult {
  if (axios.isCancel(error) || error?.code === "ERR_CANCELED") {
    return {
      ok: false,
      message: "操作已取消。",
      items: [],
      failureKind: "cancelled",
    };
  }
  const status = error?.response?.status;
  const detail = responseErrorText(error) || error?.message || "未知错误";
  logError(`${prefix}${status ? `（HTTP ${status}）` : ""}`, detail);
  const failureKind =
    status === 401 || status === 403
      ? "auth"
      : status === 400 || status === 422
        ? looksLikeReferenceError(detail)
          ? "reference"
          : "validation"
        : status
          ? "api"
          : "validation";
  const authHint =
    failureKind === "auth"
      ? `NovelAI 鉴权失败${status ? `（HTTP ${status}）` : ""}：请在设置页重新粘贴并验证 Persistent API Token，并确认 Image Endpoint 为 https://image.novelai.net。`
      : "";
  return {
    ok: false,
    message:
      authHint || `${prefix}${status ? `（HTTP ${status}）` : ""}：${detail}`,
    items: [],
    failureKind,
    statusCode: status,
  };
}

export function cancelGeneration() {
  cancelAllJobs();
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
      : [item.tag, ...(item.aliases ?? [])].map((x) =>
          x.toLowerCase().replace(/_/g, " "),
        );
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
export async function suggestTags(
  model: string,
  prompt: string,
): Promise<TagSuggestion[]> {
  const token = getToken();
  if (!prompt.trim()) return [];
  // Prefer the local Danbooru index when the user has downloaded it: it is
  // offline, Chinese-aware, has full tag coverage and real post counts.
  const danbooru = await searchDanbooru(prompt, 12);
  if (danbooru.length > 0) return danbooru;
  const fallback = localSuggestTags(prompt);
  const serverTags = await queryTagServer(prompt, 12);
  if (serverTags.length > 0) return serverTags;
  if (!token) return fallback;
  const settings = getSettings();
  const apiBaseUrl = tokenSafeBaseUrl(
    settings.apiBaseUrl,
    "https://api.novelai.net",
  );
  try {
    const res = await axios.get(
      `${apiBaseUrl}/ai/generate-image/suggest-tags`,
      {
        params: { model, prompt },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000,
        ...proxyConfig("nai"),
      },
    );
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
    return baiduTranslate(
      trimmed,
      target,
      settings.baiduAppId.trim(),
      settings.baiduSecret.trim(),
    );
  }
  return googleTranslate(trimmed, target);
}

async function googleTranslate(
  text: string,
  target: string,
): Promise<{ ok: boolean; text?: string; error?: string }> {
  try {
    const res = await axios.get(
      "https://translate.googleapis.com/translate_a/single",
      {
        params: { client: "gtx", sl: "auto", tl: target, dt: "t", q: text },
        timeout: 8_000,
        ...proxyConfig("translate"),
      },
    );
    // Response shape: [[[ "translated", "source", ... ], ...], ...]
    const segments = (res.data?.[0] ?? []) as Array<
      [string, string, ...unknown[]]
    >;
    const out = segments
      .map((s) => s?.[0] ?? "")
      .join("")
      .trim();
    if (!out) return { ok: false, error: "谷歌翻译结果为空。" };
    return { ok: true, text: out };
  } catch (error: any) {
    return {
      ok: false,
      error: error?.message
        ? `谷歌翻译失败：${error.message}`
        : "谷歌翻译失败，请检查网络（可能需要代理）。",
    };
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
  const to =
    target === "en"
      ? "en"
      : target === "zh" || target === "zh-CN"
        ? "zh"
        : target;
  const salt = String(Date.now());
  const sign = crypto
    .createHash("md5")
    .update(appid + text + salt + secret)
    .digest("hex");
  try {
    const res = await axios.get(
      "https://fanyi-api.baidu.com/api/trans/vip/translate",
      {
        params: { q: text, from: "auto", to, appid, salt, sign },
        timeout: 8_000,
        ...proxyConfig("translate"),
      },
    );
    if (res.data?.error_code) {
      return {
        ok: false,
        error: `百度翻译失败：${res.data.error_code} ${res.data.error_msg ?? ""}`,
      };
    }
    const out = (res.data?.trans_result ?? [])
      .map((r: { dst?: string }) => r?.dst ?? "")
      .join("\n")
      .trim();
    if (!out) return { ok: false, error: "百度翻译结果为空。" };
    return { ok: true, text: out };
  } catch (error: any) {
    return {
      ok: false,
      error: error?.message
        ? `百度翻译失败：${error.message}`
        : "百度翻译失败，请检查网络。",
    };
  }
}
