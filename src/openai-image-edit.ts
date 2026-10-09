// OpenAI Images "edits" (mask inpainting) — pure helpers shared by the main
// process and the renderer. No Node / DOM APIs so everything is unit-testable.

export const DEFAULT_OPENAI_EDIT_MODEL = "gpt-image-2.5-sunburst";
export const DEFAULT_OPENAI_EDIT_BASE_URL = "https://api.openai.com/v1";
export const OPENAI_EDIT_QUALITIES = ["auto", "low", "medium", "high"] as const;
export const OPENAI_EDIT_FIDELITIES = ["", "low", "high"] as const;
export type OpenAIEditQuality = (typeof OPENAI_EDIT_QUALITIES)[number];
export type OpenAIEditFidelity = (typeof OPENAI_EDIT_FIDELITIES)[number];

export interface OpenAIImageEditSettings {
  /** Official API or any OpenAI-compatible relay, e.g. https://api.openai.com/v1 */
  baseUrl: string;
  model: string;
  /** "auto" is not sent: the provider default applies. */
  quality: OpenAIEditQuality;
  /** "" is not sent (some models / relays reject the field). */
  inputFidelity: OpenAIEditFidelity;
  /**
   * "fit"  — pad the image to the closest standard size (1024², 1536×1024, 1024×1536);
   * "auto" — send the image as is and let the provider choose;
   * "WIDTHxHEIGHT" — pad to that aspect and request exactly that size.
   */
  size: string;
}

export const DEFAULT_OPENAI_IMAGE_EDIT: OpenAIImageEditSettings = {
  baseUrl: DEFAULT_OPENAI_EDIT_BASE_URL,
  model: DEFAULT_OPENAI_EDIT_MODEL,
  quality: "auto",
  inputFidelity: "",
  size: "fit",
};

const SIZE_PATTERN = /^([1-9]\d{1,4})x([1-9]\d{1,4})$/;

export function normalizeOpenAIImageEditSettings(value: unknown): OpenAIImageEditSettings {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const text = (input: unknown, fallback: string) => (typeof input === "string" && input.trim() ? input.trim() : fallback);
  const quality = OPENAI_EDIT_QUALITIES.includes(raw.quality as OpenAIEditQuality) ? (raw.quality as OpenAIEditQuality) : "auto";
  const inputFidelity = OPENAI_EDIT_FIDELITIES.includes(raw.inputFidelity as OpenAIEditFidelity) ? (raw.inputFidelity as OpenAIEditFidelity) : "";
  const size = text(raw.size, "fit");
  return {
    baseUrl: text(raw.baseUrl, DEFAULT_OPENAI_EDIT_BASE_URL),
    model: text(raw.model, DEFAULT_OPENAI_EDIT_MODEL).slice(0, 256),
    quality,
    inputFidelity,
    size: size === "fit" || size === "auto" || SIZE_PATTERN.test(size) ? size : "fit",
  };
}

/** `…/v1`, `…/v1/images/generations` or `…/v1/images/edits` → `…/v1/images/edits`. */
export function imageEditEndpoint(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw Error("图像编辑接口地址无效"); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || (url.protocol === "http:" && !local)) {
    throw Error("图像编辑接口须使用 HTTPS（本机地址除外），且地址不包含凭据、查询参数或片段");
  }
  url.pathname = url.pathname.replace(/\/+$/, "").replace(/\/images\/(generations|edits)$/, "") + "/images/edits";
  return url.href;
}

export const OPENAI_STANDARD_EDIT_SIZES: ReadonlyArray<readonly [number, number]> = [[1024, 1024], [1536, 1024], [1024, 1536]];

export interface EditCanvasPlan {
  /** Value of the multipart `size` field. */
  size: string;
  /** Source padded to the request aspect (in source pixels). */
  canvas: { width: number; height: number };
  /** Top-left of the source inside the canvas. */
  offset: { x: number; y: number };
  /** Upload dimensions of the canvas (and mask). */
  upload: { width: number; height: number };
}

const MAX_AUTO_UPLOAD_SIDE = 2048;

/** Pad (never crop) the source so the provider sees the exact geometry it renders. */
export function planEditCanvas(width: number, height: number, sizeSetting: string): EditCanvasPlan {
  if (![width, height].every((value) => Number.isSafeInteger(value) && value > 0)) throw Error("无法读取图片尺寸");
  if (sizeSetting === "auto") {
    const scale = Math.min(1, MAX_AUTO_UPLOAD_SIDE / Math.max(width, height));
    return {
      size: "auto",
      canvas: { width, height },
      offset: { x: 0, y: 0 },
      upload: { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) },
    };
  }
  let target: readonly [number, number];
  const explicit = SIZE_PATTERN.exec(sizeSetting);
  if (explicit) target = [Number(explicit[1]), Number(explicit[2])];
  else {
    const aspect = Math.log(width / height);
    target = OPENAI_STANDARD_EDIT_SIZES.reduce((best, item) =>
      Math.abs(Math.log(item[0] / item[1]) - aspect) < Math.abs(Math.log(best[0] / best[1]) - aspect) ? item : best);
  }
  const targetAspect = target[0] / target[1];
  let canvasWidth = width, canvasHeight = height;
  if (width / height > targetAspect) canvasHeight = Math.max(height, Math.round(width / targetAspect));
  else canvasWidth = Math.max(width, Math.round(height * targetAspect));
  return {
    size: `${target[0]}x${target[1]}`,
    canvas: { width: canvasWidth, height: canvasHeight },
    offset: { x: Math.floor((canvasWidth - width) / 2), y: Math.floor((canvasHeight - height) / 2) },
    upload: { width: target[0], height: target[1] },
  };
}

/** Non-file multipart fields, validated. `size` comes from planEditCanvas. */
export function editFormFields(settings: Pick<OpenAIImageEditSettings, "model" | "quality" | "inputFidelity">, prompt: string, size: string, n = 1): Array<[string, string]> {
  const model = typeof settings.model === "string" ? settings.model.trim() : "";
  if (!model || model.length > 256 || /[\r\n]/.test(model)) throw Error("请输入图像编辑模型名称");
  if (typeof prompt !== "string" || !prompt.trim()) throw Error("请输入重绘指令");
  if (prompt.length > 32000) throw Error("重绘指令过长");
  if (!(size === "auto" || SIZE_PATTERN.test(size))) throw Error("尺寸应为 WIDTHxHEIGHT 或 auto");
  if (!Number.isSafeInteger(n) || n < 1 || n > 10) throw Error("图片张数须为 1–10");
  const fields: Array<[string, string]> = [["model", model], ["prompt", prompt], ["n", String(n)], ["size", size]];
  if (settings.quality && settings.quality !== "auto") {
    if (!OPENAI_EDIT_QUALITIES.includes(settings.quality)) throw Error("质量参数无效");
    fields.push(["quality", settings.quality]);
  }
  if (settings.inputFidelity) {
    if (!OPENAI_EDIT_FIDELITIES.includes(settings.inputFidelity)) throw Error("输入保真度参数无效");
    fields.push(["input_fidelity", settings.inputFidelity]);
  }
  return fields;
}

/**
 * Selection (1 = repaint) of an editor mask, same rule as the NovelAI inpaint
 * path: alpha-encoded masks use alpha > 155; legacy fully opaque masks use
 * brightness > 155.
 */
export function maskSelection(rgba: ArrayLike<number>, width: number, height: number): Uint8Array {
  const count = width * height;
  if (rgba.length < count * 4) throw Error("蒙版数据不完整");
  let usesAlpha = false;
  for (let index = 3; index < count * 4; index += 4) if (rgba[index] !== 255) { usesAlpha = true; break; }
  const selected = new Uint8Array(count);
  for (let pixel = 0; pixel < count; pixel += 1) {
    const offset = pixel * 4;
    const alpha = rgba[offset + 3];
    selected[pixel] = usesAlpha
      ? (alpha > 155 ? 1 : 0)
      : (alpha > 0 && Math.max(rgba[offset], rgba[offset + 1], rgba[offset + 2]) > 155 ? 1 : 0);
  }
  return selected;
}

/** Nearest-neighbour resample of a selection grid. */
export function resizeSelection(selection: Uint8Array, width: number, height: number, targetWidth: number, targetHeight: number): Uint8Array {
  if (width === targetWidth && height === targetHeight) return selection;
  const out = new Uint8Array(targetWidth * targetHeight);
  for (let y = 0; y < targetHeight; y += 1) {
    const sy = Math.min(height - 1, Math.floor(((y + 0.5) * height) / targetHeight));
    for (let x = 0; x < targetWidth; x += 1) {
      const sx = Math.min(width - 1, Math.floor(((x + 0.5) * width) / targetWidth));
      out[y * targetWidth + x] = selection[sy * width + sx];
    }
  }
  return out;
}

function slidingMax(src: Uint8Array, width: number, height: number, radius: number, horizontal: boolean) {
  const out = new Uint8Array(src.length);
  const lines = horizontal ? height : width, length = horizontal ? width : height;
  for (let line = 0; line < lines; line += 1) {
    const at = (i: number) => (horizontal ? line * width + i : i * width + line);
    let lastOn = -Infinity;
    // forward pass: distance to the previous selected pixel
    const forward = new Float64Array(length);
    for (let i = 0; i < length; i += 1) { if (src[at(i)]) lastOn = i; forward[i] = i - lastOn; }
    let nextOn = Infinity;
    for (let i = length - 1; i >= 0; i -= 1) {
      if (src[at(i)]) nextOn = i;
      out[at(i)] = Math.min(forward[i], nextOn - i) <= radius ? 1 : 0;
    }
  }
  return out;
}

function boxBlur(src: Float32Array, width: number, height: number, radius: number, horizontal: boolean) {
  const out = new Float32Array(src.length);
  const lines = horizontal ? height : width, length = horizontal ? width : height;
  const size = radius * 2 + 1;
  for (let line = 0; line < lines; line += 1) {
    const at = (i: number) => (horizontal ? line * width + i : i * width + line);
    const value = (i: number) => src[at(Math.min(length - 1, Math.max(0, i)))];
    let sum = 0;
    for (let i = -radius; i <= radius; i += 1) sum += value(i);
    for (let i = 0; i < length; i += 1) {
      out[at(i)] = sum / size;
      sum += value(i + radius + 1) - value(i - radius);
    }
  }
  return out;
}

/** Grow the selection by `growPx`, then feather its edge over ~`featherPx` (alpha 0–255). */
export function featherSelection(selection: Uint8Array, width: number, height: number, growPx = 4, featherPx = 6): Uint8Array {
  let grown = selection;
  if (growPx > 0) {
    grown = slidingMax(grown, width, height, Math.round(growPx), true);
    grown = slidingMax(grown, width, height, Math.round(growPx), false);
  }
  let alpha = Float32Array.from(grown, (value) => value * 255);
  const radius = Math.max(0, Math.round(featherPx / 2));
  if (radius > 0) {
    for (let pass = 0; pass < 2; pass += 1) {
      alpha = boxBlur(alpha, width, height, radius, true);
      alpha = boxBlur(alpha, width, height, radius, false);
    }
  }
  // The painted area itself is always fully replaced; feathering only happens in the grown margin.
  return Uint8Array.from(alpha, (value, index) => (selection[index] ? 255 : Math.max(0, Math.min(255, Math.round(value)))));
}
