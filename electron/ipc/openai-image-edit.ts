// OpenAI Images edits (mask inpainting) for the official API or any compatible relay.
// Billing is the provider's, not Anlas: exactly one POST per run, never retried.
import crypto from "node:crypto";
import sharp from "sharp";
import {
  editFormFields,
  featherSelection,
  imageEditEndpoint,
  maskSelection,
  matchSeamColors,
  normalizeOpenAIImageEditSettings,
  planEditCanvas,
  resizeSelection,
  type OpenAIImageEditSettings,
} from "../../src/openai-image-edit";
import { submitCompatibleImageRequest, type CompatibleImageBatch, type CompatibleImageRequestOptions } from "./openai-images";

const MAX_INPUT_PIXELS = 64 * 1024 * 1024;
const MAX_REFERENCES = 15;

export interface MultipartFile { name: string; filename: string; contentType: string; data: Buffer }

/** RFC 7578 multipart/form-data body. */
export function buildMultipartBody(fields: Array<[string, string]>, files: MultipartFile[], boundary = `----langbai${crypto.randomBytes(12).toString("hex")}`) {
  const safe = (value: string) => value.replace(/[\r\n"]/g, "_");
  const parts: Buffer[] = [];
  for (const [name, value] of fields) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${safe(name)}"\r\n\r\n${value}\r\n`, "utf8"));
  }
  for (const file of files) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${safe(file.name)}"; filename="${safe(file.filename)}"\r\nContent-Type: ${safe(file.contentType)}\r\n\r\n`, "utf8"));
    parts.push(file.data, Buffer.from("\r\n", "utf8"));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

export async function rgba(buffer: Buffer) {
  const { data, info } = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export interface OpenAIImageEditInput {
  source: Buffer;
  /** Editor mask (alpha- or brightness-encoded); omit for a whole-image edit. */
  mask?: Buffer | null;
  prompt: string;
  /** Extra images sent after the source (e.g. character sheets). */
  references?: Buffer[];
  settings: OpenAIImageEditSettings;
  apiKey: string;
  /** Composite only the (grown, feathered) mask back onto the source. Default: true when a mask is given. */
  pasteBack?: boolean;
  growPx?: number;
  featherPx?: number;
  /** Match the generated tone to the source around the mask edge before pasting back (default true). */
  matchColors?: boolean;
}

export interface OpenAIImageEditOutput {
  batch: CompatibleImageBatch;
  /** Final images at the source resolution. */
  images: Buffer[];
  /** Provider output mapped to the source geometry, before colour matching / paste-back. */
  raw: Buffer[];
  /** Non-secret request summary for history. */
  request: Record<string, unknown>;
}

/** One provider call; the result is mapped back to the exact source geometry. */
export async function runOpenAIImageEdit(input: OpenAIImageEditInput, options: CompatibleImageRequestOptions = {}): Promise<OpenAIImageEditOutput> {
  const settings = normalizeOpenAIImageEditSettings(input.settings);
  const source = await rgba(input.source);
  const plan = planEditCanvas(source.width, source.height, settings.size);
  let selection: Uint8Array | null = null;
  if (input.mask) {
    const mask = await rgba(input.mask);
    selection = resizeSelection(maskSelection(mask.data, mask.width, mask.height), mask.width, mask.height, source.width, source.height);
    if (!selection.some(Boolean)) throw Error("蒙版为空，请先涂抹需要重绘的区域。");
  }
  const pad = {
    left: plan.offset.x,
    top: plan.offset.y,
    right: plan.canvas.width - source.width - plan.offset.x,
    bottom: plan.canvas.height - source.height - plan.offset.y,
  };
  const rawSource = { raw: { width: source.width, height: source.height, channels: 4 as const } };
  const canvas = sharp(source.data, rawSource).extend({ ...pad, extendWith: "copy" });
  const uploadImage = await sharp(await canvas.png().toBuffer())
    .resize(plan.upload.width, plan.upload.height, { fit: "fill" })
    .png()
    .toBuffer();
  const files: MultipartFile[] = [];
  const references = (input.references ?? []).slice(0, MAX_REFERENCES);
  const imageField = references.length ? "image[]" : "image";
  files.push({ name: imageField, filename: "image.png", contentType: "image/png", data: uploadImage });
  for (const [index, reference] of references.entries()) {
    const png = await sharp(reference, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
      .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    files.push({ name: imageField, filename: `reference-${index + 1}.png`, contentType: "image/png", data: png });
  }
  if (selection) {
    // OpenAI convention: fully transparent pixels are the area to edit.
    const canvasSelection = new Uint8Array(plan.canvas.width * plan.canvas.height);
    for (let y = 0; y < source.height; y += 1) {
      canvasSelection.set(selection.subarray(y * source.width, (y + 1) * source.width), (y + plan.offset.y) * plan.canvas.width + plan.offset.x);
    }
    const uploadSelection = resizeSelection(canvasSelection, plan.canvas.width, plan.canvas.height, plan.upload.width, plan.upload.height);
    const maskPixels = Buffer.alloc(plan.upload.width * plan.upload.height * 4);
    for (let pixel = 0; pixel < uploadSelection.length; pixel += 1) maskPixels[pixel * 4 + 3] = uploadSelection[pixel] ? 0 : 255;
    files.push({
      name: "mask",
      filename: "mask.png",
      contentType: "image/png",
      data: await sharp(maskPixels, { raw: { width: plan.upload.width, height: plan.upload.height, channels: 4 } }).png().toBuffer(),
    });
  }
  const fields = editFormFields(settings, input.prompt, plan.size);
  const request = {
    endpoint: "images/edits",
    model: settings.model,
    prompt: input.prompt,
    size: plan.size,
    ...(settings.quality !== "auto" ? { quality: settings.quality } : {}),
    ...(settings.inputFidelity ? { input_fidelity: settings.inputFidelity } : {}),
    mask: Boolean(selection),
    references: references.length,
  };
  const batch = await submitCompatibleImageRequest({ apiKey: input.apiKey }, () => {
    const endpoint = imageEditEndpoint(settings.baseUrl);
    const { body, contentType } = buildMultipartBody(fields, files);
    return { endpoint, body, contentType, expectedCount: 1 };
  }, options);

  const pasteBack = input.pasteBack ?? Boolean(selection);
  const alpha = selection && pasteBack ? featherSelection(selection, source.width, source.height, input.growPx ?? 4, input.featherPx ?? 6) : null;
  const images: Buffer[] = [];
  const raw: Buffer[] = [];
  for (const generated of batch.images) {
    const mapped = await sharp(generated)
      .resize(plan.canvas.width, plan.canvas.height, { fit: "fill" })
      .extract({ left: plan.offset.x, top: plan.offset.y, width: source.width, height: source.height })
      .ensureAlpha()
      .raw()
      .toBuffer();
    raw.push(await sharp(Buffer.from(mapped), rawSource).png().toBuffer());
    if (alpha && selection && input.matchColors !== false) matchSeamColors(source.data, mapped, selection, source.width, source.height);
    if (alpha) {
      for (let pixel = 0; pixel < alpha.length; pixel += 1) {
        const weight = alpha[pixel] / 255;
        if (weight >= 1) continue;
        const offset = pixel * 4;
        for (let channel = 0; channel < 4; channel += 1) {
          mapped[offset + channel] = Math.round(mapped[offset + channel] * weight + source.data[offset + channel] * (1 - weight));
        }
      }
    }
    images.push(await sharp(mapped, rawSource).png().toBuffer());
  }
  return { batch, images, raw, request };
}
