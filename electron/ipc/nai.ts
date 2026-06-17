import { dialog } from "electron";
import axios from "axios";
import JSZip from "jszip";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import {
  DEFAULT_PARAMS,
  type AccountSummary,
  type AugmentOptions,
  type AiModelListResult,
  type DirectorTool,
  type GenerateExtras,
  type GenerateParams,
  type GenerateResult,
  type HistoryItem,
  type I2IParams,
  type LoadImageResult,
  type NAIInpaintModel,
  type NAIModel,
  type SingleImageResult,
  type TagSuggestion,
  type TokenStatus,
  type UpscaleScale,
  type WorkingImage,
} from "../../src/types";
import {
  addHistory,
  getAccountSummary,
  getSettings,
  getToken,
  setAccountSummary,
  setToken,
} from "./store";
import { TAG_DICTIONARY } from "../data/tag-dictionary";
import { mcpSearch } from "./mcp-client";
import { zhForTag } from "../../src/prompt-data";

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

function buildPayload(params: GenerateParams, actualSeed: number, extras?: GenerateExtras) {
  const basePrompt = mergePrompt(params.stylePrompt, params.positivePrompt);
  const effectivePrompt = params.qualityToggle
    ? mergePrompt(basePrompt, qualityTags(params.model))
    : basePrompt;
  const effectiveNegative = mergePrompt(params.negativePrompt, ucPresetText(params.model, params.ucPreset));
  const v4Plus = isV4Plus(params.model);

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
    // Build char_captions for V4+ (only non-empty prompts)
    const charCaptionsPayload = (extras?.charCaptions ?? [])
      .filter((c) => c.prompt.trim().length > 0)
      .map((c) => ({
        char_caption: c.prompt,
        centers: c.useCoords ? [{ x: c.x, y: c.y }] : [],
      }));
    const useCoords = charCaptionsPayload.some((c) => c.centers.length > 0);

    parameters.use_coords = useCoords;
    parameters.v4_prompt = {
      caption: { base_caption: effectivePrompt, char_captions: charCaptionsPayload },
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
    input: effectivePrompt,
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
  const res = await requestWithRetry(
    () =>
      axios.post(`${imageBaseUrl}/ai/generate-image`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/zip, application/octet-stream",
        },
        responseType: "arraybuffer",
        timeout: 180_000,
        signal: currentAbort?.signal,
      }),
    { signal: currentAbort?.signal ?? undefined },
  );
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

const REVERSE_SYSTEM_PROMPTS = {
  tags: `You are a Danbooru tag expert for NovelAI. Analyze the image and output a comma-separated list of Danbooru-style tags.
Rules:
- Use standard Danbooru format: lowercase, underscores for multi-word tags (e.g. long_hair, blue_eyes, 1girl)
- Order: quality tags → character count → character features → clothing → setting/background → mood/atmosphere → style
- Include: character features (hair, eyes, expression), clothing, pose, background, art style
- Add quality tags: masterpiece, best quality, ultra-detailed
- Output ONLY the tags separated by commas. No explanation, no extra text.`,

  natural: `You are an AI art prompt writer. Analyze the image and write a detailed natural language description for AI image generation.
Rules:
- Write in flowing descriptive sentences
- Cover: subject, clothing, expression, pose, setting, lighting, colors, art style, mood
- Be specific and vivid with descriptive adjectives
- Output ONLY the description. No explanation, no meta-commentary.`,

  mixed: `You are a NovelAI prompt specialist. Analyze the image and create a hybrid prompt combining Danbooru tags with natural language.
Rules:
- Begin with Danbooru quality/style tags (masterpiece, best quality, anime style...)
- Follow with key Danbooru character/scene tags (1girl, long_hair, blue_eyes...)
- Use natural language phrases for complex elements (e.g. "bathed in golden afternoon light", "intricate floral embroidery")
- Separate all elements with commas
- Output ONLY the prompt. No explanation.`,
};

// Text-only conversion (description -> prompt) system prompts, one per output mode.
const CONVERT_SYSTEM_PROMPTS = {
  tags: `You are a Danbooru tag translator for NovelAI image generation.
Convert the user's description (may be Chinese or other language) into Danbooru-style English tags.
Rules:
1. Output ONLY comma-separated Danbooru tags in English. No explanation, no translation notes.
2. Use Danbooru format: lowercase, underscores for spaces (e.g. long_hair, blue_eyes, 1girl)
3. Start with quality tags: masterpiece, best quality, ultra-detailed
4. Break the description into specific individual Danbooru tags
5. Add relevant style, medium, and atmosphere tags inferred from context
6. If no clear subject is specified, add appropriate general tags`,

  natural: `You are an AI art prompt writer for NovelAI.
Rewrite the user's description (may be Chinese or other language) into a vivid English natural-language prompt.
Rules:
- Output flowing descriptive English sentences, faithfully expanding the user's intent.
- Cover subject, appearance, clothing, pose, setting, lighting, colors, mood and art style when implied.
- Output ONLY the description. No explanation, no translation notes.`,

  mixed: `You are a NovelAI prompt specialist.
Convert the user's description (may be Chinese or other language) into a hybrid English prompt mixing Danbooru tags and natural language.
Rules:
- Begin with Danbooru quality/style tags (masterpiece, best quality, ...).
- Follow with key Danbooru character/scene tags (1girl, long_hair, blue_eyes...).
- Use natural-language phrases for complex elements, comma-separated.
- Output ONLY the prompt. No explanation, no translation notes.`,
};

async function callVisionApi(
  systemPrompt: string,
  userContent: Array<{ type: string; [k: string]: any }>,
  maxTokens = 800,
): Promise<{ ok: boolean; content?: string; message: string }> {
  const settings = getSettings();
  const { visionApiUrl, visionApiKey, visionApiModel } = settings;

  if (!visionApiKey.trim()) return { ok: false, message: "请先在 设置 › AI 反推 中填写视觉模型 API Key。" };
  if (!visionApiUrl.trim()) return { ok: false, message: "请先在 设置 › AI 反推 中填写 API 地址。" };

  const base = visionApiUrl.replace(/\/+$/, "");
  const body = {
    model: visionApiModel || "gpt-4o",
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
    });
    const content: string = resp.data?.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) return { ok: false, message: "API 返回内容为空，请检查模型设置。" };
    return { ok: true, content: content.trim(), message: "成功" };
  } catch (error: any) {
    const msg =
      error?.response?.data?.error?.message ??
      error?.response?.data?.message ??
      error?.message ??
      "未知错误";
    return { ok: false, message: msg };
  }
}

async function callConvertApi(
  systemPrompt: string,
  userText: string,
  maxTokens = 600,
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
    });
    const content: string = resp.data?.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) return { ok: false, message: "API 返回内容为空，请检查模型设置。" };
    return { ok: true, content: content.trim(), message: "成功" };
  } catch (error: any) {
    const msg =
      error?.response?.data?.error?.message ??
      error?.response?.data?.message ??
      error?.message ??
      "未知错误";
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

  const attempts = [
    () => axios.get(`${base}/search`, { params: { q: query, query, limit }, headers, timeout: 8_000 }),
    () => axios.get(`${base}/tags`, { params: { q: query, query, limit }, headers, timeout: 8_000 }),
    () => axios.post(`${base}/search`, { query, limit }, { headers, timeout: 8_000 }),
    () =>
      axios.post(
        base,
        {
          jsonrpc: "2.0",
          id: `tag-${Date.now()}`,
          method: "tools/call",
          params: { name: "search_tags", arguments: { query, limit } },
        },
        { headers: { ...headers, "Content-Type": "application/json" }, timeout: 8_000 },
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

export async function reversePromptImage(
  imageBase64: string,
  mode: "tags" | "natural" | "mixed" = "tags",
): Promise<{ ok: boolean; prompt?: string; message: string }> {
  const settings = getSettings();
  // Per-mode template overrides built-in; legacy single visionSystemPrompt is a
  // final fallback for older configs.
  const systemPrompt =
    settings.reversePromptTemplates?.[mode]?.trim() ||
    settings.visionSystemPrompt.trim() ||
    REVERSE_SYSTEM_PROMPTS[mode];

  const result = await callVisionApi(
    systemPrompt,
    [
      { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}`, detail: "high" } },
      { type: "text", text: "Generate the prompt for this image." },
    ],
    900,
  );

  if (result.ok) {
    const hints = settings.mcpForReverse ? await queryTagServer(result.content ?? "", 16) : [];
    return { ok: true, prompt: mergeTagHints(result.content ?? "", hints), message: "反推成功" };
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

export async function convertPromptText(
  chineseText: string,
  mode: "tags" | "natural" | "mixed" = "tags",
): Promise<{ ok: boolean; result?: string; message: string }> {
  const settings = getSettings();
  const systemPrompt =
    settings.convertPromptTemplates?.[mode]?.trim() ||
    settings.convertSystemPrompt.trim() ||
    CONVERT_SYSTEM_PROMPTS[mode];

  // Tag-server hints only make sense for tag-style output, and only when the
  // user opted convert into using the MCP/tag service.
  const tagHints = mode === "natural" || !settings.mcpForConvert ? [] : await queryTagServer(chineseText, 24);
  const hintText = tagHints.length
    ? `\n\nCandidate Danbooru tags from the configured tag server:\n${tagHints.map((tag) => tag.tag).join(", ")}`
    : "";
  const result = await callConvertApi(systemPrompt, `${chineseText}${hintText}`, 600);

  if (result.ok) {
    const content = result.content ?? "";
    return {
      ok: true,
      result: mode === "natural" ? content : mergeTagHints(content, tagHints),
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
    const buffers = await postGenerateImage(payload);
    if (buffers.length === 0) return { ok: false, message: "API 返回成功，但压缩包中没有图片。", items: [] };
    const items = await saveBuffers(buffers, params, actualSeed, "t2i");
    void refreshStoredAccount();
    return { ok: true, message: `生成完成，已保存 ${items.length} 张图片。`, items, actualSeed };
  } catch (error: any) {
    return handleGenerateError(error, "生成失败");
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
  const preparedExtras = await prepareExtras(params, extras);
  const payload = buildPayload(params, actualSeed, preparedExtras);
  payload.action = "img2img";
  payload.parameters.image = await readWorkbenchBase64();
  payload.parameters.strength = Math.min(1, Math.max(0, i2i.strength));
  payload.parameters.noise = Math.min(0.99, Math.max(0, i2i.noise));
  payload.parameters.extra_noise_seed =
    i2i.extraNoiseSeed > 0 ? i2i.extraNoiseSeed : crypto.randomInt(1, 2_147_483_647);

  try {
    const buffers = await postGenerateImage(payload);
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
): Promise<GenerateResult> {
  const token = getToken();
  if (!token) return { ok: false, message: "请先配置 API Token。", items: [] };
  if (!params.positivePrompt.trim()) return { ok: false, message: "请输入正面提示词。", items: [] };
  if (!workbenchImagePath) return { ok: false, message: "请先加载原图。", items: [] };
  if (!maskBase64) return { ok: false, message: "请先绘制需要重绘的蒙版区域。", items: [] };

  currentAbort?.abort();
  currentAbort = new AbortController();

  const { base64, image } = await readWorkbenchImage();
  const actualSeed =
    params.seedMode !== "random" && params.seed > 0 ? params.seed : crypto.randomInt(1, 2_147_483_647);
  const inpaintParams: GenerateParams = {
    ...params,
    model: inpaintModel as unknown as NAIModel,
    width: image.width || params.width,
    height: image.height || params.height,
  };
  const payload = buildPayload(inpaintParams, actualSeed);
  payload.action = "infill";
  payload.parameters.image = base64;
  payload.parameters.mask = stripBase64Prefix(maskBase64);
  payload.parameters.add_original_image = true;
  payload.parameters.strength = 1;
  payload.parameters.noise = 0;

  try {
    const buffers = await postGenerateImage(payload);
    if (buffers.length === 0) return { ok: false, message: "重绘成功但无图片返回。", items: [] };
    const items = await saveBuffers(buffers, inpaintParams, actualSeed, "inpaint", inpaintModel);
    void refreshStoredAccount();
    return { ok: true, message: `重绘完成，已保存 ${items.length} 张图片。`, items, actualSeed };
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
    const { base64, image } = await readWorkbenchImage();
    if (!image.width || !image.height) {
      return { ok: false, message: "无法读取图片尺寸，请重新加载图片。" };
    }
    const settings = getSettings();
    // Upscale lives on the API host (api.novelai.net), NOT the image host, and
    // returns a ZIP archive (same as generate-image), not a raw PNG.
    const apiBaseUrl = normalizeBaseUrl(settings.apiBaseUrl, "https://api.novelai.net");
    const res = await requestWithRetry(
      () =>
        axios.post(
          `${apiBaseUrl}/ai/upscale`,
          {
            image: stripBase64Prefix(base64),
            width: image.width,
            height: image.height,
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
    const item: HistoryItem = {
      id: crypto.randomUUID(),
      filePath,
      fileUrl: pathToFileURL(filePath).toString(),
      date,
      createdAt: now.toISOString(),
      params: { ...DEFAULT_PARAMS, width: image.width * scale, height: image.height * scale, positivePrompt: "upscale" },
      actualSeed: 0,
      model: "upscale",
      width: image.width * scale,
      height: image.height * scale,
    };
    addHistory([item]);
    void refreshStoredAccount();
    return { ok: true, message: `超分 ${scale}x 完成。`, item };
  } catch (error: any) {
    if (axios.isCancel(error) || error?.code === "ERR_CANCELED") return { ok: false, message: "超分已取消。" };
    const status = error?.response?.status;
    return { ok: false, message: `超分失败${status ? `（HTTP ${status}）` : ""}：${responseErrorText(error) || "未知错误"}` };
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
    const { base64, image } = await readWorkbenchImage();
    const settings = getSettings();
    const imageBaseUrl = normalizeBaseUrl(settings.imageBaseUrl, "https://image.novelai.net");
    const payload: Record<string, unknown> = {
      image: base64,
      width: image.width,
      height: image.height,
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
    });

    const buffers = await extractImages(res.data);
    if (buffers.length === 0) return { ok: false, message: "后期处理成功但无图片返回。", items: [] };
    const historyParams: GenerateParams = {
      ...DEFAULT_PARAMS,
      positivePrompt: `director:${tool}`,
      width: image.width,
      height: image.height,
    };
    const items = await saveBuffers(buffers, historyParams, 0, `director-${tool}`, `director-${tool}`);
    void refreshStoredAccount();
    return { ok: true, message: `后期处理完成，已保存 ${items.length} 张图片。`, items };
  } catch (error: any) {
    return handleGenerateError(error, "后期处理失败");
  } finally {
    currentAbort = null;
  }
}

function handleGenerateError(error: any, prefix: string): GenerateResult {
  if (axios.isCancel(error) || error?.code === "ERR_CANCELED") {
    return { ok: false, message: "操作已取消。", items: [] };
  }
  const status = error?.response?.status;
  return {
    ok: false,
    message: `${prefix}${status ? `（HTTP ${status}）` : ""}：${responseErrorText(error) || "未知错误"}`,
    items: [],
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
