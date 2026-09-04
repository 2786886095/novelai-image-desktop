import {
  DEFAULT_PARAMS,
  NAI_MODELS,
  NAI_SAMPLERS,
  maxNAICharacterPrompts,
  normalizeGenerateParams,
  supportsNAICharacterPrompts,
  supportsNAIPreciseReference,
  supportsNAIVibeTransfer,
  type GenerateExtras,
  type GenerateParams,
  type ModelMode,
  type NAIInpaintModel,
} from "../types";

type UnknownRecord = Record<string, unknown>;

export interface AgentGenerationDefaults {
  params?: GenerateParams;
  extras?: GenerateExtras;
  modelMode?: ModelMode;
  historyGroupId?: string;
}

export interface AgentGenerationInput {
  params: GenerateParams;
  extras: GenerateExtras;
}

export interface AgentPromptLocks {
  stylePrompt?: string;
  negativePrompt?: string;
}

/** Keep the Studio's explicit prompt locks authoritative over model arguments. */
export function applyAgentPromptLocks(
  params: GenerateParams,
  locks: AgentPromptLocks,
): GenerateParams {
  return {
    ...params,
    ...(locks.stylePrompt !== undefined ? { stylePrompt: locks.stylePrompt } : {}),
    ...(locks.negativePrompt !== undefined ? { negativePrompt: locks.negativePrompt } : {}),
  };
}

/** Match a generation model to its compatible NovelAI inpaint endpoint. */
export function defaultAgentInpaintModel(model: GenerateParams["model"]): NAIInpaintModel {
  if (model.includes("4-5")) return "nai-diffusion-4-5-full-inpainting";
  if (model.includes("5")) return "nai-diffusion-5-full-inpainting";
  if (model.includes("4")) return "nai-diffusion-4-full-inpainting";
  return "nai-diffusion-3-inpainting";
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function text(value: unknown, max = 100_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function finite(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function boolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function list(value: unknown, max: number) {
  return Array.isArray(value) ? value.slice(0, max).map(record) : [];
}

function copyExtras(extras?: GenerateExtras): GenerateExtras {
  return {
    vibeImages: (extras?.vibeImages ?? []).map((item) => ({ ...item })),
    charCaptions: (extras?.charCaptions ?? []).map((item) => ({ ...item })),
    preciseReferences: (extras?.preciseReferences ?? []).map((item) => ({ ...item })),
    ...(extras?.historyGroupId ? { historyGroupId: extras.historyGroupId } : {}),
    ...(extras?.modelMode ? { modelMode: extras.modelMode } : {}),
  };
}

/**
 * Normalize the parameters and optional attachment-backed reference inputs
 * accepted by the Agent generation tools. Keeping this parser outside Electron
 * makes the paid-operation boundary deterministic and unit-testable.
 */
export function buildAgentGenerationInput(
  rawArgs: unknown,
  defaults: AgentGenerationDefaults = {},
  resolveAttachmentBase64?: (attachmentId: string) => string,
): AgentGenerationInput {
  const args = record(rawArgs);
  const saved = defaults.params ?? DEFAULT_PARAMS;
  const requestedModel = text(args.model, 100);
  const requestedSampler = text(args.sampler, 100);
  const requestedNoiseSchedule = text(args.noiseSchedule, 100);
  const candidate: Partial<GenerateParams> = {
    ...saved,
    ...(requestedModel && NAI_MODELS.some((item) => item.value === requestedModel)
      ? { model: requestedModel as GenerateParams["model"] }
      : {}),
    ...(text(args.positivePrompt) ? { positivePrompt: text(args.positivePrompt) } : {}),
    ...(typeof args.negativePrompt === "string" ? { negativePrompt: args.negativePrompt.slice(0, 100_000) } : {}),
    ...(typeof args.stylePrompt === "string" ? { stylePrompt: args.stylePrompt.slice(0, 100_000) } : {}),
    ...(args.width !== undefined ? { width: finite(args.width, saved.width, 64, 2048) } : {}),
    ...(args.height !== undefined ? { height: finite(args.height, saved.height, 64, 2048) } : {}),
    ...(args.steps !== undefined ? { steps: finite(args.steps, saved.steps, 1, 50) } : {}),
    ...(args.cfgScale !== undefined ? { cfgScale: finite(args.cfgScale, saved.cfgScale, 0, 10) } : {}),
    ...(args.cfgRescale !== undefined ? { cfgRescale: finite(args.cfgRescale, saved.cfgRescale, 0, 1) } : {}),
    ...(requestedSampler && NAI_SAMPLERS.some((item) => item.value === requestedSampler)
      ? { sampler: requestedSampler as GenerateParams["sampler"] }
      : {}),
    ...(requestedNoiseSchedule && ["native", "karras", "exponential"].includes(requestedNoiseSchedule)
      ? { noiseSchedule: requestedNoiseSchedule }
      : {}),
    ...(args.seed !== undefined ? { seed: finite(args.seed, saved.seed, 0, 0xffff_ffff) } : {}),
    ...(args.seedMode === "fixed" || args.seedMode === "random" ? { seedMode: args.seedMode } : {}),
    ...(args.ucPreset !== undefined ? { ucPreset: finite(args.ucPreset, saved.ucPreset, 0, 3) as GenerateParams["ucPreset"] } : {}),
    ...(args.qualityPreset === "standard" || args.qualityPreset === "light" || args.qualityPreset === "none"
      ? { qualityPreset: args.qualityPreset }
      : {}),
    ...(args.transparentBackground !== undefined
      ? { transparentBackground: boolean(args.transparentBackground, saved.transparentBackground) }
      : {}),
    ...(args.smea !== undefined ? { smea: boolean(args.smea, saved.smea) } : {}),
    ...(args.smeaDyn !== undefined ? { smeaDyn: boolean(args.smeaDyn, saved.smeaDyn) } : {}),
    ...(args.variety !== undefined ? { variety: boolean(args.variety, saved.variety) } : {}),
    ...(typeof args.fileNamePrefix === "string" ? { fileNamePrefix: args.fileNamePrefix.trim().slice(0, 80) } : {}),
  };
  const params = normalizeGenerateParams(candidate);
  const extras = copyExtras(defaults.extras);

  if (Array.isArray(args.vibeReferences)) {
    if (!supportsNAIVibeTransfer(params.model)) {
      throw new Error(`${params.model} 不支持 Vibe Transfer。`);
    }
    extras.vibeImages = list(args.vibeReferences, 16).map((item) => {
      const attachmentId = text(item.attachmentId, 200);
      if (!attachmentId) throw new Error("Vibe Transfer 缺少 attachmentId。");
      if (!resolveAttachmentBase64) throw new Error("当前运行时无法读取参考图附件。");
      return {
        base64: resolveAttachmentBase64(attachmentId),
        infoExtracted: finite(item.infoExtracted, 1, 0, 1),
        strength: finite(item.strength, 1, 0, 1),
      };
    });
  }

  if (Array.isArray(args.preciseReferences)) {
    if (!supportsNAIPreciseReference(params.model)) {
      throw new Error(`${params.model} 不支持精准参考图。`);
    }
    extras.preciseReferences = list(args.preciseReferences, 16).map((item) => {
      const attachmentId = text(item.attachmentId, 200);
      if (!attachmentId) throw new Error("精准参考图缺少 attachmentId。");
      if (!resolveAttachmentBase64) throw new Error("当前运行时无法读取参考图附件。");
      const type = item.type === "style" || item.type === "character&style"
        ? item.type
        : "character";
      return {
        base64: resolveAttachmentBase64(attachmentId),
        type,
        strength: finite(item.strength, 1, 0, 1),
        fidelity: finite(item.fidelity, 1, 0, 1),
        informationExtracted: 1,
      };
    });
  }

  if (Array.isArray(args.characterPrompts)) {
    if (!supportsNAICharacterPrompts(params.model)) {
      throw new Error(`${params.model} 不支持角色提示词。`);
    }
    extras.charCaptions = list(args.characterPrompts, maxNAICharacterPrompts(params.model)).map((item) => {
      const prompt = text(item.prompt);
      if (!prompt) throw new Error("角色提示词不能为空。");
      return {
        prompt,
        negativePrompt: text(item.negativePrompt),
        useCoords: boolean(item.useCoords, false),
        x: finite(item.x, 0.5, 0, 1),
        y: finite(item.y, 0.5, 0, 1),
      };
    });
  }

  const modelMode = args.modelMode === "furry" || args.modelMode === "anime"
    ? args.modelMode
    : defaults.modelMode ?? extras.modelMode;
  const historyGroupId = text(args.historyGroupId, 100) || defaults.historyGroupId || extras.historyGroupId;
  extras.modelMode = modelMode;
  extras.historyGroupId = historyGroupId || undefined;

  return { params, extras };
}
