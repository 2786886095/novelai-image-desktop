// PNG tEXt metadata parsing + mapping to GenerateParams. Pure functions, kept
// out of the React tree so they can be unit-tested directly.
import { NAI_MODELS, NAI_SAMPLERS } from "./types";
import type { ImportedParams, NAIModel, NAISampler } from "./types";

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Read all tEXt key/value chunks from a PNG ArrayBuffer. */
export function parsePngMeta(buffer: ArrayBuffer): Record<string, string> {
  if (buffer.byteLength < 8) return {};
  const sig = new Uint8Array(buffer, 0, 8);
  if (PNG_SIG.some((b, i) => sig[i] !== b)) return {};

  const view = new DataView(buffer);
  const result: Record<string, string> = {};
  let offset = 8;
  while (offset + 12 <= buffer.byteLength) {
    const length = view.getUint32(offset, false);
    const type = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7),
    );
    if (type === "IEND") break;
    if (type === "tEXt" && length > 0 && offset + 8 + length <= buffer.byteLength) {
      const data = new Uint8Array(buffer, offset + 8, length);
      const nullIdx = data.indexOf(0);
      if (nullIdx >= 0) {
        const key = new TextDecoder("latin1").decode(data.subarray(0, nullIdx));
        const value = new TextDecoder("utf-8").decode(data.subarray(nullIdx + 1));
        result[key] = value;
      }
    }
    offset += 12 + length;
  }
  return result;
}

/**
 * Map NovelAI PNG metadata (tEXt chunks: Description + Comment JSON) to our
 * GenerateParams shape. Only fields present and valid are returned, so applying
 * the result never clobbers a setting the image didn't specify.
 */
export function parseImportedParams(meta: Record<string, string>): ImportedParams {
  const out: ImportedParams = {};
  let comment: Record<string, unknown> = {};
  try {
    comment = JSON.parse(meta.Comment ?? "{}");
  } catch {
    comment = {};
  }

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const samplerValues = NAI_SAMPLERS.map((s) => s.value) as string[];
  const modelValues = NAI_MODELS.map((m) => m.value) as string[];

  const prompt = meta.Description ?? (typeof comment.prompt === "string" ? comment.prompt : undefined);
  if (prompt) out.positivePrompt = prompt.trim();
  if (typeof comment.uc === "string") out.negativePrompt = comment.uc.trim();

  out.steps = num(comment.steps);
  out.cfgScale = num(comment.scale);
  out.cfgRescale = num(comment.cfg_rescale);
  out.seed = num(comment.seed);
  out.width = num(comment.width);
  out.height = num(comment.height);
  if (typeof comment.sampler === "string" && samplerValues.includes(comment.sampler)) {
    out.sampler = comment.sampler as NAISampler;
  }
  if (typeof comment.noise_schedule === "string") out.noiseSchedule = comment.noise_schedule;
  if (typeof comment.sm === "boolean") out.smea = comment.sm;
  if (typeof comment.sm_dyn === "boolean") out.smeaDyn = comment.sm_dyn;

  const modelCandidate = typeof comment.model === "string" ? comment.model : meta.Source;
  if (modelCandidate && modelValues.includes(modelCandidate)) {
    out.model = modelCandidate as NAIModel;
  }

  // Drop undefined keys so the caller's spread doesn't overwrite with undefined.
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as ImportedParams;
}
