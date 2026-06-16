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
    const filePath = path.join(dir, `${now.getTime()}-${prefix}-${index + 1}-${safeModel}.${ext}`);
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

export async function reversePromptImage(
  imageBase64: string,
  mode: "tags" | "natural" | "mixed" = "tags",
): Promise<{ ok: boolean; prompt?: string; message: string }> {
  const settings = getSettings();
  // Use custom system prompt if set, otherwise use built-in for the mode
  const systemPrompt = settings.visionSystemPrompt.trim() || REVERSE_SYSTEM_PROMPTS[mode];

  const result = await callVisionApi(
    systemPrompt,
    [
      { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}`, detail: "high" } },
      { type: "text", text: "Generate the prompt for this image." },
    ],
    900,
  );

  if (result.ok) return { ok: true, prompt: result.content, message: "反推成功" };
  return { ok: false, message: `反推失败：${result.message}` };
}

export async function convertPromptText(
  chineseText: string,
): Promise<{ ok: boolean; result?: string; message: string }> {
  const systemPrompt = `You are a Danbooru tag translator for NovelAI image generation.
Convert the user's description (may be Chinese or other language) into Danbooru-style English tags.
Rules:
1. Output ONLY comma-separated Danbooru tags in English. No explanation, no translation notes.
2. Use Danbooru format: lowercase, underscores for spaces (e.g. long_hair, blue_eyes, 1girl)
3. Start with quality tags: masterpiece, best quality, ultra-detailed
4. Break the description into specific individual Danbooru tags
5. Add relevant style, medium, and atmosphere tags inferred from context
6. If no clear subject is specified, add appropriate general tags`;

  const result = await callVisionApi(
    systemPrompt,
    [{ type: "text", text: chineseText }],
    600,
  );

  if (result.ok) return { ok: true, result: result.content, message: "转换成功" };
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

  const actualSeed = params.seed > 0 ? params.seed : crypto.randomInt(1, 2_147_483_647);

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

  const actualSeed = params.seed > 0 ? params.seed : crypto.randomInt(1, 2_147_483_647);
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
  const actualSeed = params.seed > 0 ? params.seed : crypto.randomInt(1, 2_147_483_647);
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
  currentAbort = new AbortController();

  try {
    const { base64, image } = await readWorkbenchImage();
    const settings = getSettings();
    const imageBaseUrl = normalizeBaseUrl(settings.imageBaseUrl, "https://image.novelai.net");
    const res = await axios.post(
      `${imageBaseUrl}/ai/upscale`,
      {
        image: base64,
        width: image.width,
        height: image.height,
        scale,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "image/png, application/octet-stream",
        },
        responseType: "arraybuffer",
        timeout: 180_000,
        signal: currentAbort.signal,
      },
    );

    const now = new Date();
    const date = dateStamp(now);
    const dir = path.join(settings.outputDir, date);
    await fs.mkdir(dir, { recursive: true });
    const baseName = path.basename(workbenchImagePath, path.extname(workbenchImagePath)).replace(/[^\w.-]+/g, "-");
    const filePath = path.join(dir, `${now.getTime()}-upscale${scale}x-${baseName}.png`);
    await fs.writeFile(filePath, Buffer.from(res.data));
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

const LOCAL_TAG_SUGGESTIONS: Array<TagSuggestion & { aliases?: string[] }> = [
  { tag: "1girl", count: 19_000_000, category: 0, description: "一个女孩 / 单女性角色", aliases: ["girl", "g"] },
  { tag: "1boy", count: 8_000_000, category: 0, description: "一个男孩 / 单男性角色", aliases: ["boy"] },
  { tag: "solo", count: 13_000_000, category: 0, description: "单人画面" },
  { tag: "long hair", count: 6_800_000, category: 0, description: "长发", aliases: ["long_hair", "lh"] },
  { tag: "short hair", count: 5_400_000, category: 0, description: "短发", aliases: ["short_hair", "sh"] },
  { tag: "blonde hair", count: 1_100_000, category: 0, description: "金发", aliases: ["blonde_hair", "gold hair", "golden hair"] },
  { tag: "black hair", count: 3_600_000, category: 0, description: "黑发", aliases: ["black_hair"] },
  { tag: "white hair", count: 2_100_000, category: 0, description: "白发", aliases: ["white_hair"] },
  { tag: "blue hair", count: 1_800_000, category: 0, description: "蓝发", aliases: ["blue_hair"] },
  { tag: "red hair", count: 1_200_000, category: 0, description: "红发", aliases: ["red_hair"] },
  { tag: "pink hair", count: 1_200_000, category: 0, description: "粉发", aliases: ["pink_hair"] },
  { tag: "green hair", count: 820_000, category: 0, description: "绿发", aliases: ["green_hair"] },
  { tag: "blue eyes", count: 3_900_000, category: 0, description: "蓝眼睛", aliases: ["blue_eyes"] },
  { tag: "green eyes", count: 622_800, category: 0, description: "绿眼睛", aliases: ["green_eyes"] },
  { tag: "red eyes", count: 1_700_000, category: 0, description: "红眼睛", aliases: ["red_eyes"] },
  { tag: "yellow eyes", count: 496_800, category: 0, description: "黄眼睛 / 金色眼睛", aliases: ["yellow_eyes", "golden eyes"] },
  { tag: "gloves", count: 959_100, category: 0, description: "手套", aliases: ["glove"] },
  { tag: "black gloves", count: 246_000, category: 0, description: "黑色手套", aliases: ["black_gloves"] },
  { tag: "white gloves", count: 210_000, category: 0, description: "白色手套", aliases: ["white_gloves"] },
  { tag: "dress", count: 2_600_000, category: 0, description: "连衣裙" },
  { tag: "white dress", count: 410_000, category: 0, description: "白色连衣裙", aliases: ["white_dress"] },
  { tag: "school uniform", count: 1_500_000, category: 0, description: "校服", aliases: ["school_uniform"] },
  { tag: "skirt", count: 2_300_000, category: 0, description: "裙子" },
  { tag: "smile", count: 3_200_000, category: 0, description: "微笑" },
  { tag: "looking at viewer", count: 4_400_000, category: 0, description: "看向观众 / 正视镜头", aliases: ["looking_at_viewer"] },
  { tag: "open mouth", count: 2_200_000, category: 0, description: "张嘴", aliases: ["open_mouth"] },
  { tag: "hair ornament", count: 1_200_000, category: 0, description: "发饰", aliases: ["hair_ornament"] },
  { tag: "earrings", count: 378_700, category: 0, description: "耳环" },
  { tag: "male focus", count: 557_500, category: 0, description: "男性为主体", aliases: ["male_focus"] },
  { tag: "grey eyes", count: 220_000, category: 0, description: "灰色眼睛", aliases: ["gray eyes", "grey_eyes"] },
  { tag: "simple background", count: 1_100_000, category: 0, description: "简单背景", aliases: ["simple_background"] },
  { tag: "outdoors", count: 1_600_000, category: 0, description: "户外" },
  { tag: "night", count: 780_000, category: 0, description: "夜晚" },
  { tag: "city", count: 710_000, category: 0, description: "城市" },
  { tag: "masterpiece", count: 5_000_000, category: 5, description: "杰作 / 高质量修饰词" },
  { tag: "best quality", count: 4_800_000, category: 5, description: "最佳质量修饰词", aliases: ["best_quality"] },
  { tag: "very aesthetic", count: 900_000, category: 5, description: "高审美质量修饰词", aliases: ["very_aesthetic"] },
  { tag: "artist name", count: 120_000, category: 1, description: "画师名占位标签", aliases: ["artist"] },
];

function localSuggestTags(prompt: string): TagSuggestion[] {
  const query = prompt.trim().toLowerCase().replace(/_/g, " ");
  if (!query) return [];
  return LOCAL_TAG_SUGGESTIONS
    .map((item) => {
      const terms = [item.tag, ...(item.aliases ?? [])].map((x) => x.toLowerCase().replace(/_/g, " "));
      const starts = terms.some((term) => term.startsWith(query));
      const contains = terms.some((term) => term.includes(query));
      return { item, score: starts ? 2 : contains ? 1 : 0 };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.item.count - a.item.count)
    .slice(0, 12)
    .map(({ item }) => ({
      tag: item.tag,
      count: item.count,
      category: item.category,
      description: item.description,
    }));
}

/** Tag autocomplete — calls NAI suggest-tags endpoint, with local fallback when API is unavailable. */
export async function suggestTags(model: string, prompt: string): Promise<TagSuggestion[]> {
  const token = getToken();
  if (!prompt.trim()) return [];
  const fallback = localSuggestTags(prompt);
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
