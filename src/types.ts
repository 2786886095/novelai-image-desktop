import { version as packageVersion } from "../package.json";
import { fitNAIImageSize } from "./nai-dimensions";

// package.json is the single desktop release-version source. Keeping this
// derived prevents the title bar/about page from showing an old hard-coded
// value after the installer and updater have already moved to a new version.
export const APP_VERSION = packageVersion;
export const APP_NAME = "Langbai NovelAI Studio";
export const PROJECT_REPOSITORY =
  "https://github.com/2786886095/novelai-image-desktop";

export type ReversePromptMode = "tags" | "natural" | "mixed";
export type ReversePromptTemplateVersion = "v4.5" | "v5";
export type ReversePromptScope = "full" | "character" | "object" | "scene";
export type TagServerType = "rest" | "http" | "sse" | "stdio";
export type TranslateProvider = "google" | "baidu";

/** Independent system-prompt templates keyed by output mode. Empty = built-in. */
export interface ModePromptTemplates {
  tags: string;
  natural: string;
  mixed: string;
}

export const EMPTY_MODE_TEMPLATES: ModePromptTemplates = {
  tags: "",
  natural: "",
  mixed: "",
};

export type ModelMode = "anime" | "furry";

export const NAI_MODELS = [
  {
    label: "NAI Diffusion V5 Full（最新完整模型）",
    value: "nai-diffusion-5-full",
    mode: "anime",
  },
  {
    label: "NAI Diffusion V5 Curated（最新精选模型）",
    value: "nai-diffusion-5-curated",
    mode: "anime",
  },
  {
    label: "NAI Diffusion 4.5 Full（完整模型）",
    value: "nai-diffusion-4-5-full",
    mode: "anime",
  },
  {
    label: "NAI Diffusion 4.5 Curated（精选模型）",
    value: "nai-diffusion-4-5-curated",
    mode: "anime",
  },
  {
    label: "NAI Diffusion 4 Full（完整模型）",
    value: "nai-diffusion-4-full",
    mode: "anime",
  },
  {
    label: "NAI Diffusion 4 Curated（精选模型）",
    value: "nai-diffusion-4-curated",
    mode: "anime",
  },
  {
    label: "NAI Diffusion 3（旧版通用）",
    value: "nai-diffusion-3",
    mode: "anime",
  },
  {
    label: "NAI Diffusion Furry 3（兽人模型）",
    value: "nai-diffusion-furry-3",
    mode: "furry",
  },
] as const;

export type NAIModel = (typeof NAI_MODELS)[number]["value"];

/** Model capability helpers mirrored from NovelAI's current Image frontend. */
export function isNAIV5Model(model: string): boolean {
  return normalizeNAIBaseModel(model).startsWith("nai-diffusion-5-");
}

export function isNAIV4PlusModel(model: string): boolean {
  const normalized = normalizeNAIBaseModel(model);
  return normalized.startsWith("nai-diffusion-4-") || normalized.startsWith("nai-diffusion-5-");
}

/**
 * NovelAI does not publish a separate V4/V4.5/V5 Furry checkpoint.  The
 * official UI exposes those checkpoints in Furry mode and prefixes the prompt
 * with `fur dataset,`; only Furry V3 remains a dedicated model.
 */
export function supportsNAIModelMode(model: string, mode: ModelMode): boolean {
  const normalized = normalizeNAIBaseModel(model);
  if (mode === "anime") return normalized !== "nai-diffusion-furry-3";
  return normalized === "nai-diffusion-furry-3" || isNAIV4PlusModel(normalized);
}

export function supportsNAIPreciseReference(model: string): boolean {
  const normalized = normalizeNAIBaseModel(model);
  // NovelAI's V5 launch does not include Precise Reference. Keep this
  // capability separate from the V4+/structured-prompt capability so adding a
  // new base model cannot accidentally send Director Reference fields to an
  // unsupported backend again.
  return normalized.startsWith("nai-diffusion-4-5-");
}

export function supportsNAICharacterPrompts(model: string): boolean {
  return isNAIV4PlusModel(model);
}

export function supportsNAIVibeTransfer(model: string): boolean {
  return !isNAIV5Model(model);
}

export function supportsNAINoiseScheduleControl(model: string): boolean {
  return !isNAIV5Model(model);
}

export function supportsNAIVariety(model: string): boolean {
  return !isNAIV5Model(model);
}

export function maxNAICharacterPrompts(model: string): number {
  return isNAIV5Model(model) ? 32 : isNAIV4PlusModel(model) ? 6 : 0;
}

function normalizeNAIBaseModel(model: string): string {
  return model.endsWith("-inpainting")
    ? model.slice(0, -"-inpainting".length)
    : model;
}

/** Default model selected when switching into each mode. */
export const DEFAULT_MODEL_FOR_MODE: Record<ModelMode, NAIModel> = {
  anime: "nai-diffusion-5-full",
  furry: "nai-diffusion-5-full",
};

export const NAI_SAMPLERS = [
  { label: "Euler Ancestral（欧拉祖先，推荐）", value: "k_euler_ancestral" },
  { label: "Euler（欧拉）", value: "k_euler" },
  { label: "DPM++ 2M（稳定采样）", value: "k_dpmpp_2m" },
  { label: "DPM++ 2M SDE（随机微分）", value: "k_dpmpp_2m_sde" },
  { label: "DPM++ SDE（高质量随机微分）", value: "k_dpmpp_sde" },
  { label: "DPM++ 2S Ancestral（祖先采样）", value: "k_dpmpp_2s_ancestral" },
  { label: "DDIM（快速采样）", value: "ddim_v3" },
] as const;

export type NAISampler = (typeof NAI_SAMPLERS)[number]["value"];

export const NAI_UC_PRESETS = [
  { label: "Heavy（强负面）", value: 0 },
  { label: "Light（轻负面）", value: 1 },
  { label: "Human Focus（人物优先）", value: 2 },
  { label: "None（不使用预设）", value: 3 },
] as const;

export type UcPreset = 0 | 1 | 2 | 3;

export type QualityPreset = "standard" | "light" | "none";
export type ImageToImageSizeMode = "adaptive" | "custom";

export interface GenerateParams {
  model: NAIModel;
  stylePrompt: string;
  positivePrompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  cfgRescale: number;
  sampler: NAISampler;
  noiseSchedule: string;
  seed: number;
  /** "fixed" uses the seed number every time; "random" rolls a new seed each run. */
  seedMode: "fixed" | "random";
  ucPreset: UcPreset;
  /** Official quality-tag preset. Light is currently available on V5 only. */
  qualityPreset: QualityPreset;
  /** Legacy compatibility alias written by releases before qualityPreset. */
  qualityToggle: boolean;
  /** V5-only transparent-background/alpha request. */
  transparentBackground: boolean;
  smea: boolean;
  smeaDyn: boolean;
  variety: boolean;
  /** Optional custom file-name prefix; empty = use the global naming template only. */
  fileNamePrefix: string;
}

export const DEFAULT_PARAMS: GenerateParams = {
  model: "nai-diffusion-5-full",
  stylePrompt: "",
  positivePrompt: "",
  negativePrompt: "",
  width: 832,
  height: 1216,
  steps: 28,
  cfgScale: 6,
  cfgRescale: 0,
  sampler: "k_euler_ancestral",
  noiseSchedule: "karras",
  seed: 0,
  seedMode: "random",
  ucPreset: 2,
  qualityPreset: "standard",
  qualityToggle: true,
  transparentBackground: false,
  smea: false,
  smeaDyn: false,
  variety: false,
  fileNamePrefix: "",
};

/** NovelAI seeds are unsigned 32-bit values in exported image metadata. */
export const MAX_NAI_SEED = 0xffff_ffff;

const SUPPORTED_MODEL_VALUES = new Set<string>(NAI_MODELS.map((item) => item.value));
const SUPPORTED_SAMPLER_VALUES = new Set<string>(NAI_SAMPLERS.map((item) => item.value));
const SUPPORTED_NOISE_SCHEDULES = new Set(["native", "karras", "exponential"]);

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Repair generation state restored from older releases or imported metadata. */
export function normalizeGenerateParams(value?: Partial<GenerateParams> | null): GenerateParams {
  const source = value ?? {};
  const model = String(source.model ?? DEFAULT_PARAMS.model);
  const normalizedModel = (SUPPORTED_MODEL_VALUES.has(model)
    ? model
    : DEFAULT_PARAMS.model) as NAIModel;
  const sampler = String(source.sampler ?? DEFAULT_PARAMS.sampler);
  const noiseSchedule = String(source.noiseSchedule ?? DEFAULT_PARAMS.noiseSchedule);
  const steps = Math.round(finiteNumber(source.steps, DEFAULT_PARAMS.steps));
  const cfgScale = finiteNumber(source.cfgScale, DEFAULT_PARAMS.cfgScale);
  const cfgRescale = finiteNumber(source.cfgRescale, DEFAULT_PARAMS.cfgRescale);
  const seed = Math.round(finiteNumber(source.seed, DEFAULT_PARAMS.seed));
  const ucPreset = Math.round(finiteNumber(source.ucPreset, DEFAULT_PARAMS.ucPreset));
  const smea = typeof source.smea === "boolean" ? source.smea : DEFAULT_PARAMS.smea;
  const requestedQualityPreset =
    source.qualityPreset === "standard" ||
    source.qualityPreset === "light" ||
    source.qualityPreset === "none"
      ? source.qualityPreset
      : source.qualityToggle === false
        ? "none"
        : DEFAULT_PARAMS.qualityPreset;
  const qualityPreset: QualityPreset =
    !isNAIV5Model(normalizedModel) && requestedQualityPreset === "light"
      ? "standard"
      : requestedQualityPreset;
  const dimensions = fitNAIImageSize(source.width, source.height, DEFAULT_PARAMS);
  return {
    model: normalizedModel,
    stylePrompt: typeof source.stylePrompt === "string" ? source.stylePrompt : "",
    positivePrompt: typeof source.positivePrompt === "string" ? source.positivePrompt : "",
    negativePrompt: typeof source.negativePrompt === "string" ? source.negativePrompt : "",
    width: dimensions.width,
    height: dimensions.height,
    steps: Math.min(50, Math.max(1, steps)),
    cfgScale: Math.min(10, Math.max(0, cfgScale)),
    cfgRescale: Math.min(1, Math.max(0, cfgRescale)),
    sampler: (SUPPORTED_SAMPLER_VALUES.has(sampler) ? sampler : DEFAULT_PARAMS.sampler) as NAISampler,
    noiseSchedule: SUPPORTED_NOISE_SCHEDULES.has(noiseSchedule) ? noiseSchedule : DEFAULT_PARAMS.noiseSchedule,
    seed: Math.min(MAX_NAI_SEED, Math.max(0, seed)),
    seedMode: source.seedMode === "fixed" ? "fixed" : "random",
    ucPreset: Math.min(3, Math.max(0, ucPreset)) as UcPreset,
    qualityPreset,
    qualityToggle: qualityPreset !== "none",
    transparentBackground:
      isNAIV5Model(normalizedModel) && source.transparentBackground === true,
    smea,
    smeaDyn: smea && (typeof source.smeaDyn === "boolean" ? source.smeaDyn : DEFAULT_PARAMS.smeaDyn),
    variety: typeof source.variety === "boolean" ? source.variety : DEFAULT_PARAMS.variety,
    fileNamePrefix: typeof source.fileNamePrefix === "string" ? source.fileNamePrefix : "",
  };
}

export interface LastGenerationState {
  params: GenerateParams;
  batchCount: number;
  batchIntervalSeconds?: number;
  i2iParams: I2IParams;
  inpaintModel: NAIInpaintModel;
  inpaintStrength: number;
  inpaintNoise: number;
  inpaintPositivePrompt: string;
  brushSize: number;
  brushOpacity: number;
  brushColor?: string;
  brushShape?: InpaintBrushShape;
  brushSizeUnit?: "grid8";
  upscaleScale: UpscaleScale;
  directorTool: DirectorTool;
  augmentOptions: AugmentOptions;
}

export type InpaintBrushShape = "round" | "square";

export interface WorkingImage {
  filePath: string;
  fileUrl: string;
  width: number;
  height: number;
}

export interface I2IParams {
  strength: number;
  noise: number;
  extraNoiseSeed: number;
}

/** One image's batch-redraw (img2img) request, sent per image to the main process. */
export interface BatchRedrawRequest {
  imageBase64: string; // source image (pure base64)
  params: GenerateParams; // model/size/sampler/steps/seed/cfg + merged positive/negative prompt
  strength: number; // img2img change strength (0–1, default 0.4)
  noise?: number;
  extras?: GenerateExtras; // precise references etc.
  groupName: string; // target history group (created if missing); images saved into it
  fileNamePrefix?: string;
}

export const DEFAULT_I2I_PARAMS: I2IParams = {
  strength: 0.7,
  noise: 0,
  extraNoiseSeed: 0,
};

/** Vibe Transfer / Precise Reference — slim type sent over IPC */
export interface VibeTransferItem {
  base64: string; // pure base64 without data-URL prefix
  infoExtracted: number; // 0.0 – 1.0, new Vibe Transfer default 1.0
  strength: number; // 0.0 – 1.0, new Vibe Transfer default 1.0
}

/** Renderer store representation (adds id + preview for display) */
export interface VibeTransferImage extends VibeTransferItem {
  id: string;
  previewUrl: string; // data URL, never sent to main process
}

/** NovelAI V4.5/V5 Precise (Director) Reference — distinct from Vibe Transfer.
 * Sent over IPC; the main process emits director_reference_* fields. */
export type PreciseReferenceType = "character" | "style" | "character&style";
export interface PreciseReferenceItem {
  base64: string; // pure base64 (resized to an official reference resolution in main)
  type: PreciseReferenceType; // -> director_reference_descriptions[].caption.base_caption
  strength: number; // 0.0 – 1.0 -> director_reference_strength_values
  fidelity: number; // 0.0 – 1.0 -> secondary = round(1 - fidelity, 2)
  /** Legacy persisted compatibility field. NovelAI's Precise Reference UI only
   * exposes Strength and Fidelity; the main process always sends 1.0. */
  informationExtracted?: number;
}

/** Renderer store representation of a precise reference (adds id + preview) */
export interface PreciseReferenceImage extends PreciseReferenceItem {
  id: string;
  previewUrl: string; // data URL, never sent to main process
  srcWidth?: number; // original pixel size (renderer-only, for the size hint)
  srcHeight?: number;
}

/** Character prompt item — slim type sent over IPC */
export interface CharCaptionItem {
  prompt: string;
  /** Per-character undesired content used by NovelAI V4/V4.5/V5. */
  negativePrompt?: string;
  useCoords: boolean;
  x: number; // 0.0 – 1.0
  y: number; // 0.0 – 1.0
}

/** Renderer store representation (adds id) */
export interface CharCaption extends CharCaptionItem {
  id: string;
}

/** Extras passed alongside GenerateParams to the main process */
export interface GenerateExtras {
  vibeImages: VibeTransferItem[];
  charCaptions: CharCaptionItem[];
  preciseReferences?: PreciseReferenceItem[];
  /** Snapshot of the ordinary generation destination; never sent to NovelAI. */
  historyGroupId?: string;
  /** Official Anime/Furry mode. V4+ Furry mode injects `fur dataset,`. */
  modelMode?: ModelMode;
}

// ── Batch img2img (批量图生图) project — persisted in the store so switching
// tools/tabs never loses work; serialised verbatim by 导出/导入项目. ───────────
export type BatchRedrawStep = "import" | "params" | "prompts" | "generate";
export type BatchRedrawSizeMode = ImageToImageSizeMode | "perImage";
export type BatchRedrawItemStatus =
  "pending" | "generating" | "done" | "failed";

export interface BatchRedrawCandidate {
  /** Stable UI identifier. Generated outputs use their history item ID. */
  id: string;
  historyItemId: string;
  resultUrl: string;
  resultPath: string;
  createdAt?: string;
  actualSeed?: number;
}

export interface BatchRedrawItem {
  id: string;
  name: string;
  base64: string; // pure source base64 (preview is derived from this)
  /** Source dimensions captured at import for adaptive img2img sizing. */
  width: number;
  height: number;
  /** Explicit output size used by the per-image line-matching mode. */
  outputWidth?: number;
  outputHeight?: number;
  prompt: string;
  /** null → use the global change strength */
  strength: number | null;
  /** Per-image advanced parameter overrides (model/size/sampler/steps/cfg…). */
  overrideParams: boolean;
  params: Partial<GenerateParams>;
  status: BatchRedrawItemStatus;
  /** Every successful output is retained; one candidate is chosen for ZIP export. */
  candidates: BatchRedrawCandidate[];
  selectedCandidateId?: string;
  /** Legacy selected-output aliases kept for older UI/project compatibility. */
  resultUrl?: string; // file:// url of the latest img2img output (for display)
  resultPath?: string;
  historyItemId?: string;
  error?: string;
}

export interface BatchRedrawProject {
  groupName: string;
  items: BatchRedrawItem[];
  globalStrength: number;
  /** Defaults to the main generate screen's positive prompt ("locked" style). */
  globalStyle: string;
  /** Defaults to the main generate screen's negative prompt. */
  globalNegative: string;
  /** Full editable params for ALL models — defaults to the main screen params. */
  globalParams: GenerateParams;
  /** One shared number of candidates generated for every source image. */
  candidateCount: number;
  /** Adaptive uses each source image's nearest 64-multiple size. */
  sizeMode: BatchRedrawSizeMode;
  /** Editable one-size-per-line source, persisted with project exports. */
  sizeBulk: string;
  preciseReferences: PreciseReferenceItem[];
  vibeImages: VibeTransferItem[];
  aiMode: ReversePromptMode;
  promptBulk: string;
  step: BatchRedrawStep;
  /** Whether globals were seeded from the main screen at least once. */
  seededFromMain: boolean;
}

export interface BatchExportFile {
  filePath: string;
  /** Optional zip entry base name; the main process sanitizes it and keeps the source extension. */
  name?: string;
}

export function createDefaultBatchRedraw(
  params: GenerateParams = DEFAULT_PARAMS,
): BatchRedrawProject {
  return {
    groupName: "批量图生图",
    items: [],
    globalStrength: 0.4,
    globalStyle: "",
    globalNegative: "",
    globalParams: { ...params, fileNamePrefix: "" },
    candidateCount: 1,
    sizeMode: "adaptive",
    sizeBulk: "",
    preciseReferences: [],
    vibeImages: [],
    aiMode: "tags",
    promptBulk: "",
    step: "import",
    seededFromMain: false,
  };
}

export interface PromptVariants {
  namePrompt: string;
  featurePrompt: string;
}

/** In-flight/just-finished convert or reverse requests. Concurrent, not a
 * serial queue: each job fires its API call immediately on creation and is
 * updated in place when that call resolves. Not persisted across restarts. */
export type TextToolJobStatus = "processing" | "done" | "failed";

export interface TextToolJob {
  id: string;
  label: string;
  mode: ReversePromptMode;
  knownCharacter: boolean;
  status: TextToolJobStatus;
  result?: string;
  variants?: PromptVariants;
  message?: string;
  addedAt: number;
}

/** Persisted record of a completed convert/reverse result. */
export interface TextToolHistoryItem {
  id: string;
  mode: ReversePromptMode;
  knownCharacter: boolean;
  input: string;
  /** Reverse only — used to drop the record once the source image is gone,
   * same lazy-cleanup precedent as HistoryItem/pruneMissingHistoryItem. */
  sourceImagePath?: string;
  result: string;
  variants?: PromptVariants;
  createdAt: string;
}

export type ComicReferenceKind =
  "vibe" | "precise" | "character" | "scene" | "object";
export type ComicPanelStatus =
  "draft" | "converted" | "generating" | "done" | "failed";
export type ComicDesiredPanelCount = "auto" | number;
export type GenerateFailureKind =
  "auth" | "reference" | "validation" | "api" | "cancelled";

export interface ComicReferenceAsset {
  id: string;
  name: string;
  kind: ComicReferenceKind;
  scope?: ReversePromptScope;
  subjectHint?: string;
  base64: string;
  previewUrl: string;
  reversePrompt: string;
  infoExtracted: number;
  strength: number;
  useForGeneration: boolean;
}

export interface ComicPanelParamsOverride {
  enabled: boolean;
  params: Partial<GenerateParams>;
}

export interface ComicPanel {
  id: string;
  index: number;
  cnPrompt: string;
  contextSummary: string;
  enPrompt: string;
  localNegativePrompt: string;
  negativeMode: "append" | "override";
  paramsOverride: ComicPanelParamsOverride;
  status: ComicPanelStatus;
  historyItemId?: string;
  outputPath?: string;
  outputUrl?: string;
  actualAnlas?: number;
  error?: string;
}

export interface ComicProject {
  id: string;
  title: string;
  historyGroupId?: string;
  rawScript: string;
  mode: ReversePromptMode;
  desiredPanelCount: ComicDesiredPanelCount;
  globalPrompt: string;
  globalCharacterSetting: string;
  continuityBible: string;
  globalStylePrompt: string;
  globalNegativePrompt: string;
  adultBranch: boolean;
  inheritPreviousFrame: boolean;
  autoExportZip: boolean;
  globalParams: GenerateParams;
  references: ComicReferenceAsset[];
  panels: ComicPanel[];
}

export interface ComicAnalyzeRequest {
  script: string;
  adultBranch: boolean;
  mode: ReversePromptMode;
  desiredPanelCount: ComicDesiredPanelCount;
  referencePrompts?: string[];
}

export interface ComicAnalyzeResult {
  ok: boolean;
  message: string;
  title?: string;
  globalPrompt?: string;
  globalCharacterSetting?: string;
  continuityBible?: string;
  panels?: Array<
    Pick<ComicPanel, "cnPrompt" | "contextSummary"> & { narration?: string }
  >;
}

export interface ComicConvertPanelInput {
  panelId: string;
  index: number;
  cnPrompt: string;
  previousCnPrompt?: string;
  nextCnPrompt?: string;
  previousPrompts: string[];
  previousSummaries: string[];
  nextSummaries: string[];
}

export interface ComicConvertRequest {
  mode: ReversePromptMode;
  globalPrompt: string;
  globalCharacterSetting: string;
  continuityBible: string;
  globalStylePrompt: string;
  referencePrompts: string[];
  adultBranch: boolean;
  panels: ComicConvertPanelInput[];
}

export interface ComicConvertResult {
  ok: boolean;
  message: string;
  panels: Array<{
    panelId: string;
    enPrompt: string;
    contextSummary?: string;
    error?: string;
  }>;
}

export interface ComicConsistencyRequest {
  mode: ReversePromptMode;
  globalPrompt: string;
  globalCharacterSetting: string;
  referencePrompts: string[];
  panels: Array<Pick<ComicPanel, "id" | "index" | "cnPrompt" | "enPrompt">>;
}

export interface ComicConsistencyResult {
  ok: boolean;
  message: string;
  panels: Array<{ panelId: string; enPrompt: string; note?: string }>;
}

export interface ComicGeneratePanelRequest {
  projectId: string;
  projectTitle: string;
  historyGroupId?: string;
  panelId: string;
  panelIndex: number;
  params: GenerateParams;
  globalStylePrompt: string;
  panelPrompt: string;
  globalNegativePrompt: string;
  localNegativePrompt: string;
  negativeMode: "append" | "override";
  references: ComicReferenceAsset[];
  previousImagePath?: string;
  inheritPreviousFrame: boolean;
}

export interface ComicExportZipResult {
  ok: boolean;
  message: string;
  path?: string;
}

/** Tag-only comic workflow (schema v2). It intentionally does not accept the
 * former story splitting, reference reverse, prompt conversion, or per-panel
 * negative-prompt fields. */
export type TagComicPanelStatus = "ready" | "generating" | "done" | "failed";
export type TagComicSizeMode = "uniform" | "perPanel";
export type TagComicReferenceScope = "all" | "include" | "exclude";

export interface TagComicImageSize {
  width: number;
  height: number;
}

export interface TagComicReferenceAsset {
  id: string;
  name: string;
  filePath: string;
  fileUrl: string;
  type: PreciseReferenceType;
  strength: number;
  fidelity: number;
  informationExtracted: number;
  scope: TagComicReferenceScope;
  scopePanelIds: string[];
}

export interface TagComicPanelReference {
  referenceId: string;
  enabled: boolean;
  type: PreciseReferenceType;
  strength: number;
  fidelity: number;
  informationExtracted: number;
}

export interface TagComicReferenceImportRequest {
  projectId: string;
  sourcePath: string;
}

export interface TagComicReferenceImportResult {
  ok: boolean;
  message: string;
  asset?: TagComicReferenceAsset;
}

export interface TagComicCandidate {
  id: string;
  historyItemId: string;
  outputPath: string;
  outputUrl: string;
  createdAt: string;
  actualAnlas?: number;
}

export interface TagComicPanel {
  id: string;
  index: number;
  title: string;
  prompt: string;
  imageSize?: TagComicImageSize;
  preciseReferences: TagComicPanelReference[];
  paramsOverride: ComicPanelParamsOverride;
  status: TagComicPanelStatus;
  candidates: TagComicCandidate[];
  selectedCandidateId?: string;
  error?: string;
}

export interface TagComicProject {
  schemaVersion: 2;
  id: string;
  title: string;
  historyGroupId?: string;
  globalStylePrompt: string;
  globalNegativePrompt: string;
  sizeMode: TagComicSizeMode;
  initialGenerationCount: number;
  globalParams: GenerateParams;
  preciseReferences: TagComicReferenceAsset[];
  panels: TagComicPanel[];
}

export interface TagComicGenerateRequest {
  projectId: string;
  projectTitle: string;
  historyGroupId?: string;
  panelId: string;
  panelIndex: number;
  params: GenerateParams;
  globalStylePrompt: string;
  panelPrompt: string;
  globalNegativePrompt: string;
  preciseReferences: Array<
    TagComicPanelReference & { filePath: string }
  >;
}

export interface TagComicExportZipRequest {
  project: TagComicProject;
}

export interface AiCallLogEntry {
  id: string;
  time: number;
  label: string;
  api: "vision" | "convert";
  model: string;
  systemPrompt: string;
  userText: string;
  ok: boolean;
  response: string;
}

export const NAI_INPAINT_MODELS = [
  {
    label: "NAI Diffusion V5 Full Inpaint（推荐）",
    value: "nai-diffusion-5-full-inpainting",
  },
  {
    label: "NAI Diffusion V5 Curated Inpaint",
    value: "nai-diffusion-5-curated-inpainting",
  },
  {
    label: "NAI Diffusion 4.5 Full Inpaint（推荐）",
    value: "nai-diffusion-4-5-full-inpainting",
  },
  {
    label: "NAI Diffusion 4.5 Curated Inpaint",
    value: "nai-diffusion-4-5-curated-inpainting",
  },
  { label: "NAI Diffusion 4 Full Inpaint", value: "nai-diffusion-4-full-inpainting" },
  {
    label: "NAI Diffusion 4 Curated Inpaint",
    value: "nai-diffusion-4-curated-inpainting",
  },
  { label: "NAI Diffusion 3 Inpaint", value: "nai-diffusion-3-inpainting" },
] as const;

export type NAIInpaintModel = (typeof NAI_INPAINT_MODELS)[number]["value"];
export type UpscaleScale = 2 | 4;
export const MAX_NAI_UPSCALE_INPUT_PIXELS = 1024 * 1024;
export const MAX_NAI_DIRECTOR_INPUT_PIXELS = 1024 * 1024;

export const DIRECTOR_TOOLS = [
  { label: "移除背景", value: "bg-removal", hasPrompt: false },
  { label: "线稿提取", value: "lineart", hasPrompt: false },
  { label: "草图化", value: "sketch", hasPrompt: false },
  { label: "上色", value: "colorize", hasPrompt: true },
  { label: "表情迁移", value: "emotion", hasPrompt: true },
  { label: "去除杂乱", value: "declutter", hasPrompt: false },
] as const;

export type DirectorTool = (typeof DIRECTOR_TOOLS)[number]["value"];

export const EMOTION_OPTIONS = [
  { label: "中性（Neutral）", value: "neutral" },
  { label: "开心（Happy）", value: "happy" },
  { label: "悲伤（Sad）", value: "sad" },
  { label: "愤怒（Angry）", value: "angry" },
  { label: "惊讶（Surprised）", value: "surprised" },
  { label: "害怕（Scared）", value: "scared" },
  { label: "厌恶（Disgusted）", value: "disgusted" },
  { label: "惊叹（Amazed）", value: "amazed" },
] as const;

export type EmotionValue = (typeof EMOTION_OPTIONS)[number]["value"];

export interface AugmentOptions {
  defry: number;
  colorizePrompt: string;
  emotion: EmotionValue;
  emotionLevel: number;
}

export const DEFAULT_AUGMENT_OPTIONS: AugmentOptions = {
  defry: 0,
  colorizePrompt: "",
  emotion: "happy",
  emotionLevel: 0,
};

export interface TokenStatus {
  valid: boolean;
  message: string;
  tierName?: string;
  tierLevel?: number;
  anlasBalance?: number;
  expiresAt?: string;
  hasActiveSubscription?: boolean;
  opusUsage?: OpusGenerationUsage;
  opusUsageUpdatedAt?: number;
}

export interface OpusGenerationUsage {
  /** Remaining V5 allowance percentage returned by NovelAI `/user/data`. */
  percent: number;
  /** Official flag indicating the free allowance has been exhausted. */
  isNegative: boolean;
  /** Seconds required to refill one percentage point. */
  timeUntilNextPercent: number;
}

export interface AccountSummary {
  hasToken: boolean;
  tierName?: string;
  tierLevel?: number;
  anlasBalance?: number;
  expiresAt?: string;
  hasActiveSubscription?: boolean;
  opusUsage?: OpusGenerationUsage;
  opusUsageUpdatedAt?: number;
  // True when this summary is a cached copy returned because a live refresh
  // failed — the balance may be out of date and must be labelled as such.
  stale?: boolean;
}

export type AnlasQuoteFeature =
  "generate" | "i2i" | "inpaint" | "upscale" | "director";
// "official-api" = price returned by NovelAI's /request-price endpoint (authoritative).
// "estimate-formula"/"estimate-fixed" = our local web-frontend formula / fixed rules,
// which are close but NOT guaranteed to match the final charge — must be shown as estimates.
export type AnlasQuoteSource =
  "official-api" | "estimate-formula" | "estimate-fixed" | "unavailable";
export type AnlasQuoteUnavailableReason =
  | "missing-token"
  | "missing-image"
  | "missing-params"
  | "image-too-large";

export interface AnlasQuoteRequest {
  feature: AnlasQuoteFeature;
  params?: GenerateParams;
  extras?: GenerateExtras;
  batchCount?: number;
  i2iParams?: I2IParams;
  inpaintModel?: NAIInpaintModel;
  inpaintStrength?: number;
  inpaintNoise?: number;
  maskBase64?: string | null;
  upscaleScale?: UpscaleScale;
  directorTool?: DirectorTool;
  image?: Pick<WorkingImage, "width" | "height"> | null;
  account?: AccountSummary;
  /** Vibe refs already covered by the active run / earlier queued jobs (encoded once). */
  alreadyQueuedVibes?: number;
}

export interface AnlasQuoteResult {
  ok: boolean;
  amount?: number;
  source?: AnlasQuoteSource;
  reason?: AnlasQuoteUnavailableReason;
  balance?: number;
  insufficient?: boolean;
  message: string;
  details?: string[];
}

export interface HistoryItem {
  id: string;
  filePath: string;
  fileUrl: string;
  date: string;
  createdAt: string;
  groupId?: string;
  params: GenerateParams;
  actualSeed: number;
  model: string;
  width: number;
  height: number;
  feature?: string;
  comicProjectId?: string;
  comicPanelNo?: number;
}

export interface HistoryGroup {
  id: string;
  name: string;
  createdAt: string;
}

export interface GenerateResult {
  ok: boolean;
  message: string;
  items: HistoryItem[];
  actualSeed?: number;
  failureKind?: GenerateFailureKind;
  statusCode?: number;
}

export interface GenerationPreviewEvent {
  requestId: string;
  progress: number;
  currentStep?: number;
  totalSteps?: number;
  sampleIndex: number;
  imageDataUrl: string;
}

export interface SingleImageResult {
  ok: boolean;
  message: string;
  item?: HistoryItem;
}

export interface LoadImageResult {
  ok: boolean;
  image?: WorkingImage;
  metadata?: {
    imported: ImportedParams;
    characterCaptions: CharCaptionItem[];
  };
  message?: string;
}

export interface MetadataSnapshotPayload {
  name: string;
  type: string;
  lastModified: number;
  base64: string;
}

export interface MetadataSnapshotResult {
  ok: boolean;
  snapshot?: MetadataSnapshotPayload;
  message?: string;
}

export type DataBackupCategory =
  | "configuration"
  | "apiCredentials"
  | "agentWorkspace"
  | "artistLibrary"
  | "textHistory"
  | "referencePresets"
  | "imageHistory"
  | "promptPresets"
  | "workspaceData";

export interface DataBackupExportRequest {
  categories: DataBackupCategory[];
  /** App-owned localStorage values. The main process cannot read Chromium's
   * storage directly, so the renderer supplies this portable workspace layer. */
  workspaceData?: Record<string, string>;
  destination?: "dialog" | "automatic" | "internal";
}

export interface DataBackupCategorySummary {
  category: DataBackupCategory;
  items: number;
  bytes: number;
}

export interface DataBackupInspectResult {
  ok: boolean;
  cancelled?: boolean;
  message?: string;
  path?: string;
  formatVersion?: number;
  createdAt?: string;
  sourcePlatform?: string;
  appVersion?: string;
  categories: DataBackupCategorySummary[];
  requiresConfigurationConfirmation?: boolean;
}

export interface DataBackupImportRequest {
  path: string;
  categories: DataBackupCategory[];
  /** Must be true whenever configuration or API credentials are selected.
   * The settings screen only sets it after the dedicated second confirmation. */
  confirmConfigurationOverwrite: boolean;
  currentWorkspaceData?: Record<string, string>;
}

export interface DataBackupImportResult {
  ok: boolean;
  message: string;
  imported: number;
  skipped: number;
  renamed: number;
  /** Non-destructive renderer storage additions. Existing conflicting keys are
   * intentionally returned but never silently overwritten by the main process. */
  workspaceData?: Record<string, string>;
  rescueBackupPath?: string;
}

export interface DataBackupOperationResult {
  ok: boolean;
  cancelled?: boolean;
  message: string;
  path?: string;
  categories?: DataBackupCategorySummary[];
}

export interface DataBackupStatus {
  directory: string;
  automaticEnabled: boolean;
  intervalHours: number;
  retentionCount: number;
  latestPath?: string;
  latestCreatedAt?: string;
  backupCount: number;
  totalBytes: number;
  due: boolean;
}

export type ResourceDatabaseId = "tagCatalog" | "cooccurrence";

export interface ResourceDatabaseStatus {
  id: ResourceDatabaseId;
  label: string;
  description: string;
  installed: boolean;
  valid: boolean;
  version: string;
  count: number;
  sizeBytes: number;
  downloadBytes: number;
  databaseBytes: number;
  downloading: boolean;
  resumableBytes: number;
  hasPrevious: boolean;
  replacementRequiresConfirmation: boolean;
  sourceName: string;
  sourceUrl: string;
  license: string;
  message?: string;
}

export interface ResourceCacheStats {
  memoryEntries: number;
  memoryHits: number;
  memoryMisses: number;
  memoryHitRate: number;
}

export interface ResourceDatabaseOverview {
  dataDirectory: string;
  resources: ResourceDatabaseStatus[];
  cache: ResourceCacheStats;
}

export type ResourceDatabaseProgressPhase =
  | "downloading"
  | "paused"
  | "verifying"
  | "extracting"
  | "installing"
  | "complete"
  | "error";

export interface ResourceDatabaseProgressEvent {
  id: ResourceDatabaseId;
  phase: ResourceDatabaseProgressPhase;
  receivedBytes: number;
  totalBytes: number;
  percent: number;
  speedBytesPerSecond: number;
  message: string;
}

export interface ResourceDatabaseDownloadResult {
  ok: boolean;
  paused?: boolean;
  requiresConfirmation?: boolean;
  message: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  prefix: string;
  suffix: string;
  negativePrompt: string;
}

export interface StylePromptPreset {
  id: string;
  name: string;
  prompt: string;
  /** Stable user-created folder name. Legacy presets are migrated to Default. */
  group: string;
  createdAt: string;
  previewImages?: StylePromptPreviewImage[];
}

/** A reusable positive-prompt preset. Reference images are visual notes only:
 * applying the preset replaces the positive prompt text and never injects an
 * image into generation, i2i, vibe transfer, or precise reference inputs. */
export interface PositivePromptPreset {
  id: string;
  name: string;
  prompt: string;
  createdAt: string;
  previewImages?: StylePromptPreviewImage[];
}

/** A reusable text fragment inserted into the prompt being edited. Unlike a
 * positive prompt preset it never replaces the complete positive prompt and
 * carries no preview images or generation state. */
export interface PromptChunk {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export type ReferencePresetKind = "vibe" | "precise";

/** Durable, named reference image stored under the app's userData directory.
 * The JSON shape intentionally matches the mobile .nairp manifest so archives
 * can move between desktop, Android and iOS without conversion. */
export interface ReferencePreset {
  id: string;
  name: string;
  group: string;
  kind: ReferencePresetKind;
  filePath: string;
  fileUrl: string;
  createdAt: string;
  infoExtracted: number;
  strength: number;
  preciseType: PreciseReferenceType;
  fidelity: number;
  informationExtracted: number;
  width: number;
  height: number;
  /** Stable remote catalog id, when downloaded from the online character library. */
  sourceId?: string;
  /** Localized catalog metadata keeps downloaded preset labels language-aware offline. */
  sourceNames?: Partial<Record<AppLanguage, string>>;
  sourceGameNames?: Partial<Record<AppLanguage, string>>;
  sourceGameId?: string;
  sourceCategory?: string;
}

export interface ReferencePresetLibrary {
  groups: string[];
  presets: ReferencePreset[];
}

export interface ReferencePresetSaveRequest {
  name: string;
  group?: string;
  kind: ReferencePresetKind;
  base64: string;
  extension?: string;
  infoExtracted?: number;
  strength?: number;
  preciseType?: PreciseReferenceType;
  fidelity?: number;
  informationExtracted?: number;
  width?: number;
  height?: number;
  sourceId?: string;
  sourceNames?: Partial<Record<AppLanguage, string>>;
  sourceGameNames?: Partial<Record<AppLanguage, string>>;
  sourceGameId?: string;
  sourceCategory?: string;
}

export interface ReferencePresetExportRequest {
  presetId?: string;
  group?: string;
}

export interface ReferencePresetOperationResult {
  ok: boolean;
  message?: string;
  library?: ReferencePresetLibrary;
  preset?: ReferencePreset;
  base64?: string;
  path?: string;
  count?: number;
}

export interface StylePromptPreviewImage {
  id: string;
  name: string;
  filePath: string;
  fileUrl: string;
  createdAt: string;
}

/** A single tag suggestion from the NAI suggest-tags endpoint */
export interface TagSuggestion {
  tag: string;
  count: number;
  /** 0=general, 1=artist, 3=copyright, 4=character, 5=meta */
  category: number;
  /** Optional Chinese note shown in the renderer autocomplete menu. */
  description?: string;
}

/** Lazy catalogs used by the random artist-string style picker. Danbooru has
 * no dedicated visual-style category, so the visual scopes are an explicit,
 * conservative taxonomy over general tags. `style` means canonical
 * `_(style)` tags and `copyright` means every category-3 source tag. */
export type ArtistStyleCatalogScope =
  | "all"
  | "quality"
  | "render3d"
  | "medium"
  | "lighting"
  | "color"
  | "texture"
  | "stylization"
  | "style"
  | "copyright";

export interface ArtistStyleCatalogResult {
  items: TagSuggestion[];
  total: number;
  source: "catalog" | "bilingual" | "none";
}

export interface ArtistStylePreviewResult {
  tag: string;
  imageUrl: string;
  sourceUrl: string;
  postUrl: string;
  width: number;
  height: number;
}

export type AppLanguage = "zh-CN" | "zh-TW" | "en-US" | "ja-JP" | "ko-KR";

export interface AppSettings {
  hasOnboarded: boolean;
  language: AppLanguage;
  outputDir: string;
  /** Folder for the app.log error log. Empty = default <userData>/logs. */
  logDir: string;
  apiBaseUrl: string;
  imageBaseUrl: string;
  // Opt-in to sending the NovelAI Bearer token to a non-official endpoint host.
  // Default false: a custom (non *.novelai.net) endpoint is refused to avoid
  // leaking the token to an untrusted server.
  allowCustomEndpoint: boolean;
  // Opt-in to retrying a failed (401/403) custom image endpoint against the
  // official one. Default false: without this, a custom-endpoint failure just
  // fails — it doesn't silently and invisibly also become a real, billed
  // request against the user's official account.
  allowCustomEndpointFallback: boolean;
  proxyMode: "auto" | "http" | "direct" | "socks" | "custom";
  // Manual proxy override. Empty in auto/direct modes. Accepts
  // http://host:port or socks5://host:port.
  proxyUrl: string;
  // Per-category proxy opt-out (all default true = everything goes through proxy).
  proxyForNai: boolean;
  proxyForMcp: boolean;
  proxyForAi: boolean;
  proxyForUpdate: boolean;
  proxyForTranslate: boolean;
  /** Preferred app update/download mirror. The other source remains fallback. */
  updateSource: "github" | "gitee";
  theme: "light" | "dark" | "system";
  autoComplete: boolean;
  weightHighlight: boolean;
  promptRandomizer: boolean;
  superDrop: boolean;
  /** Show intermediate NovelAI generation frames. Defaults on; unsupported
   * endpoints safely keep using the normal ZIP response. */
  streamPreviewEnabled: boolean;
  showFloatingToolbar: boolean;
  historyJumpAfterGenerate: boolean;
  historyRetentionDays: number;
  /** Write app.log (errors + call info). Default on. */
  loggingEnabled: boolean;
  /** Keep the generation metadata (prompt / seed / params, embedded in the saved
   * PNG) on disk. Default on. Turn off to save clean images with the embedded
   * info stripped — useful before sharing. */
  keepImageMetadata: boolean;
  /** Local portable archive schedule. Manual exports still select every
   * category by default. Automatic archives stay metadata-only unless the
   * user explicitly opts into copying the potentially very large image set. */
  autoBackupEnabled: boolean;
  autoBackupIntervalHours: number;
  autoBackupRetentionCount: number;
  autoBackupIncludeImages: boolean;
  /** Internal one-time migration marker for the lightweight auto-backup
   * policy. Optional so archives/settings from older clients remain valid. */
  autoBackupAssetPolicyVersion?: number;
  /** Empty = <userData>/backups. */
  backupDir: string;
  // Vision / Reverse-prompt
  visionApiUrl: string;
  visionApiKey: string;
  visionApiModel: string;
  visionSystemPrompt: string;
  reversePromptMode: ReversePromptMode;
  /** Built-in reverse template generation selected on the reverse page. */
  reversePromptTemplateVersion: ReversePromptTemplateVersion;
  // Per-version reverse-prompt system templates (empty = built-in default).
  reversePromptTemplates: ModePromptTemplates;
  reversePromptTemplatesV45: ModePromptTemplates;
  /** Built-in DSH Infinite Gen 3 adapter, scoped to Tavern image, reverse, and convert only. */
  reverseConvertDshEnabled: boolean;
  reverseConvertDshMode: "focused" | "strict";
  // Legacy per-mode comic storyboard templates. Kept for migration only.
  comicAnalyzePromptTemplates: ModePromptTemplates;
  // Current single storyboard analysis template used by the comic generator.
  comicAnalyzePromptTemplate: string;
  // Text-only prompt conversion API, intentionally separated from vision reverse-prompt.
  convertApiUrl: string;
  convertApiKey: string;
  convertApiModel: string;
  convertSystemPrompt: string;
  // Character Tavern model provider. Desktop and mobile both connect directly
  // to the selected provider using the protocol below.
  agentApiProtocol: import("./agent/types").AgentProviderProtocol;
  agentApiBaseUrl: string;
  agentApiKey: string;
  agentApiModel: string;
  agentProviderName: string;
  agentContextWindow: number;
  agentMaxOutputTokens: number;
  agentAutoCompact: boolean;
  agentAutoCompactThreshold: number;
  agentVisionEnabled: boolean;
  // Convert output type + per-mode conversion system templates.
  convertMode: ReversePromptMode;
  convertPromptTemplateVersion: ReversePromptTemplateVersion;
  convertPromptTemplates: ModePromptTemplates;
  convertPromptTemplatesV45: ModePromptTemplates;
  // Optional Danbooru / MCP-compatible tag search service.
  tagServerEnabled: boolean;
  tagServerUrl: string;
  tagServerApiKey: string;
  // Transport for the tag service. "rest" = plain HTTP endpoints; "http" =
  // Streamable HTTP MCP (DanbooruSearchOnline); "sse" = legacy HTTP+SSE MCP;
  // "stdio" = spawn a local MCP server process.
  tagServerType: TagServerType;
  // For stdio MCP: the command + args to launch the server.
  tagServerCommand: string;
  tagServerArgs: string;
  // MCP tool name to call for tag search (DanbooruSearchOnline: search_tags).
  tagServerTool: string;
  // Which features consume the tag/MCP service. The capsule defaults on once the
  // service is configured; reverse / convert are opt-in.
  mcpForCapsule: boolean;
  mcpForReverse: boolean;
  mcpForConvert: boolean;
  // Translation
  translateProvider: TranslateProvider;
  baiduAppId: string;
  baiduSecret: string;
  activeHistoryGroupId: string;
  // Persisted save destination for ordinary generation, independent from the
  // history panel's current filter (`activeHistoryGroupId`).
  generationGroupId: string;
  // Anime vs Furry model family (official site offers both; anime is default).
  modelMode: ModelMode;
  // Saved/locked style + negative prompts. When locked, they persist across
  // sessions and are protected from reset / template overwrites.
  lockStylePrompt: boolean;
  lockNegativePrompt: boolean;
  savedStylePrompt: string;
  savedNegativePrompt: string;
  // Filename template for saved images. Tokens: {date} {time} {seq} {seed} {model} {ext}
  imageNameTemplate: string;
  // Prompt templates
  promptTemplates: PromptTemplate[];
  // Named style-prompt presets available from the generation panel.
  stylePromptPresets: StylePromptPreset[];
  // Stored separately so empty user-created groups survive restarts.
  stylePromptPresetGroups: string[];
  // Positive-only reusable prompt presets shared by Generate and compatible
  // artist-string tools. Optional images are view-only notes (maximum three).
  positivePromptPresets: PositivePromptPreset[];
  // Small reusable phrases inserted into any positive/character prompt. These
  // are intentionally stored separately from whole-prompt presets.
  promptChunks: PromptChunk[];
  lastGenerationState: LastGenerationState | null;
  // Per-tool opt-out for restoring lastGenerationState across restarts.
  // All default true (today's behavior); turning one off means that tool
  // falls back to hardcoded defaults on next launch instead of restoring
  // what was last used there.
  persistGenerateParams: boolean;
  persistI2IParams: boolean;
  persistInpaintParams: boolean;
  persistUpscaleParams: boolean;
  persistDirectorParams: boolean;
}

export type SettingKey = keyof AppSettings;

export interface UpdateInfo {
  /** true when a newer release is available on Gitee or GitHub */
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  /** populated when the check itself failed (network / rate limit) */
  error?: string;
}

/**
 * Windows downloads a verified NSIS installer from the user's preferred source
 * and automatically retries the other mirror. Other desktop platforms use
 * UpdateInfo.releaseUrl manually.
 */
export type UpdateProgressEvent =
  | { kind: "checking" }
  | { kind: "available"; version: string }
  | { kind: "not-available" }
  | { kind: "progress"; percent: number }
  | { kind: "downloaded"; version: string }
  | { kind: "error"; message: string };

export interface AiModelListResult {
  ok: boolean;
  message: string;
  models: string[];
}

/** Compatible generation parameters extracted from embedded image metadata. */
export interface ImportedParams {
  positivePrompt?: string;
  negativePrompt?: string;
  stylePrompt?: string;
  model?: NAIModel;
  steps?: number;
  cfgScale?: number;
  cfgRescale?: number;
  sampler?: NAISampler;
  noiseSchedule?: string;
  seed?: number;
  seedMode?: "fixed" | "random";
  width?: number;
  height?: number;
  smea?: boolean;
  smeaDyn?: boolean;
  ucPreset?: UcPreset;
  qualityToggle?: boolean;
  qualityPreset?: QualityPreset;
  transparentBackground?: boolean;
  variety?: boolean;
}

export interface NaiDesktopApi {
  platform: NodeJS.Platform;
  getResourceDatabaseOverview: () => Promise<ResourceDatabaseOverview>;
  downloadResourceDatabase: (id: ResourceDatabaseId, confirmReplace?: boolean) => Promise<ResourceDatabaseDownloadResult>;
  pauseResourceDatabaseDownload: (id: ResourceDatabaseId) => Promise<{ ok: boolean; message: string }>;
  restorePreviousResourceDatabase: (id: ResourceDatabaseId, confirmed?: boolean) => Promise<ResourceDatabaseDownloadResult>;
  openResourceDatabaseDirectory: () => Promise<{ ok: boolean; message?: string }>;
  clearResourceQueryCache: () => Promise<{ ok: boolean }>;
  relatedResourceTags: (tags: string[], limit?: number) => Promise<TagSuggestion[]>;
  onResourceDatabaseProgress: (callback: (event: ResourceDatabaseProgressEvent) => void) => () => void;
  exportDataBackup: (request: DataBackupExportRequest) => Promise<DataBackupOperationResult>;
  inspectDataBackup: () => Promise<DataBackupInspectResult>;
  importDataBackup: (request: DataBackupImportRequest) => Promise<DataBackupImportResult>;
  getDataBackupStatus: () => Promise<DataBackupStatus>;
  runAutomaticBackup: (workspaceData?: Record<string, string>) => Promise<DataBackupOperationResult>;
  selectBackupDirectory: () => Promise<string | null>;
  openBackupDirectory: () => Promise<{ ok: boolean; message?: string }>;
  getAgentWorkspace: () => Promise<import("./agent/types").AgentWorkspaceData>;
  saveTavernWorkspace: (workspace: import("./agent/types").AgentWorkspaceData) => Promise<import("./agent/types").AgentWorkspaceMutationResult>;
  createAgentConversation: (title?: string) => Promise<import("./agent/types").AgentWorkspaceMutationResult>;
  selectAgentConversation: (conversationId: string) => Promise<import("./agent/types").AgentWorkspaceMutationResult>;
  renameAgentConversation: (conversationId: string, title: string) => Promise<import("./agent/types").AgentWorkspaceMutationResult>;
  deleteAgentConversation: (conversationId: string) => Promise<import("./agent/types").AgentWorkspaceMutationResult>;
  importAgentFiles: (conversationId: string, sourcePaths?: string[]) => Promise<import("./agent/types").AgentImportFilesResult>;
  deleteAgentAttachment: (conversationId: string, attachmentId: string) => Promise<import("./agent/types").AgentWorkspaceMutationResult>;
  exportAgentAttachment: (conversationId: string, messageId: string, attachmentId: string) => Promise<{ ok: boolean; cancelled?: boolean; message: string; filePath?: string }>;
  sendAgentMessage: (request: import("./agent/types").AgentSendRequest) => Promise<{ ok: boolean; message?: string }>;
  generateTavernImage: (request: import("./agent/types").TavernImageRequest) => Promise<{ ok: boolean; message?: string }>;
  importTavernCards: (sourcePaths?: string[]) => Promise<import("./agent/types").TavernCardImportResult>;
  exportTavernCard: (request: import("./agent/types").TavernCardExportRequest) => Promise<{ ok: boolean; cancelled?: boolean; message: string; filePath?: string }>;
  importTavernVisualAsset: (kind: "avatar" | "background") => Promise<{ ok: boolean; cancelled?: boolean; message?: string; dataUrl?: string; fileName?: string }>;
  abortAgentMessage: (conversationId: string) => Promise<{ ok: boolean; message?: string }>;
  compactAgentConversation: (conversationId: string) => Promise<{ ok: boolean; message?: string }>;
  respondAgentPermission: (
    permissionId: string,
    response: "once" | "always" | "reject",
  ) => Promise<{ ok: boolean; message?: string }>;
  upsertAgentSkill: (skill: Partial<import("./agent/types").AgentSkill> & Pick<import("./agent/types").AgentSkill, "name" | "instructions">) => Promise<import("./agent/types").AgentWorkspaceMutationResult>;
  deleteAgentSkill: (skillId: string) => Promise<import("./agent/types").AgentWorkspaceMutationResult>;
  upsertAgentMemory: (memory: Partial<import("./agent/types").AgentMemory> & Pick<import("./agent/types").AgentMemory, "title" | "content" | "scope">) => Promise<import("./agent/types").AgentWorkspaceMutationResult>;
  deleteAgentMemory: (memoryId: string) => Promise<import("./agent/types").AgentWorkspaceMutationResult>;
  getAgentRuntimeStatus: () => Promise<import("./agent/types").AgentRuntimeStatus>;
  getAgentPendingPermissions: () => Promise<import("./agent/types").AgentPermissionRequest[]>;
  restartAgentRuntime: () => Promise<import("./agent/types").AgentRuntimeStatus>;
  discoverAgentModels: (probe: import("./agent/types").AgentProviderProbe) => Promise<import("./agent/types").AgentModelDiscoveryResult>;
  getAgentWorkspaceLocation: () => Promise<import("./agent/types").AgentWorkspaceLocation>;
  openAgentWorkspaceDirectory: () => Promise<{ ok: boolean; message?: string }>;
  onAgentEvent: (callback: (event: import("./agent/types").AgentEvent) => void) => () => void;
  promptCodexCache: () => Promise<
    import("./prompt-codex").PromptCodexSnapshot | null
  >;
  promptCodexBundled: () => Promise<
    import("./prompt-codex").PromptCodexSnapshot
  >;
  promptCodexUpdate: () => Promise<
    import("./prompt-codex").PromptCodexSnapshot
  >;
  importStylePromptPresetImages: (
    presetId: string,
    availableSlots: number,
    dialogTitle?: string,
  ) => Promise<StylePromptPreviewImage[]>;
  importStylePromptPresetImagePaths: (
    sourcePaths: string[],
    presetId: string,
    availableSlots: number,
  ) => Promise<StylePromptPreviewImage[]>;
  reconcileStylePromptPresetImages: (
    presetId: string,
    knownImages: StylePromptPreviewImage[],
  ) => Promise<StylePromptPreviewImage[]>;
  deleteStylePromptPresetImage: (
    presetId: string,
    imageId: string,
  ) => Promise<{ ok: boolean }>;
  deleteStylePromptPresetImages: (
    presetId: string,
  ) => Promise<{ ok: boolean }>;
  listReferencePresets: () => Promise<ReferencePresetLibrary>;
  saveReferencePreset: (
    request: ReferencePresetSaveRequest,
  ) => Promise<ReferencePresetOperationResult>;
  readReferencePreset: (
    presetId: string,
  ) => Promise<ReferencePresetOperationResult>;
  deleteReferencePreset: (
    presetId: string,
  ) => Promise<ReferencePresetOperationResult>;
  createReferencePresetGroup: (
    name: string,
  ) => Promise<ReferencePresetOperationResult>;
  deleteReferencePresetGroup: (
    name: string,
  ) => Promise<ReferencePresetOperationResult>;
  moveReferencePresetToGroup: (
    presetId: string,
    group: string,
  ) => Promise<ReferencePresetOperationResult>;
  importReferencePresets: () => Promise<ReferencePresetOperationResult>;
  exportReferencePresets: (
    request?: ReferencePresetExportRequest,
  ) => Promise<ReferencePresetOperationResult>;
  downloadReferenceCatalogAsset: (request: {
    id: string;
    urls: string[];
  }) => Promise<{ ok: boolean; base64?: string; bytes?: number; message?: string }>;
  onReferenceCatalogDownloadProgress: (callback: (event: {
    id: string;
    loaded: number;
    total: number;
  }) => void) => () => void;
  artistLabPickTarget: () => Promise<{
    filePath: string;
    fileUrl: string;
    name: string;
    width: number;
    height: number;
  } | null>;
  artistLabSearchArtists: (
    query?: string,
    limit?: number,
  ) => Promise<import("./artist-lab").ArtistTagRecord[]>;
  artistLabPopularArtists: (
    limit?: number,
    force?: boolean,
  ) => Promise<import("./artist-lab").ArtistTagRecord[]>;
  artistLabArtistRanking: (
    limit?: number,
    force?: boolean,
  ) => Promise<import("./artist-lab").ArtistRankingSnapshot>;
  artistLabScoreImages: (
    mode: import("./artist-lab").ArtistLabModelMode,
    targetPath: string,
    candidatePath: string,
  ) => Promise<import("./artist-lab").ArtistLabImageScore>;
  artistLabModelStatus: (
    mode: import("./artist-lab").ArtistLabModelMode,
  ) => Promise<import("./artist-lab").ArtistLabModelStatus>;
  artistLabDiscoverSimilar: (
    mode: import("./artist-lab").ArtistLabModelMode,
    targetPath: string,
    offset?: number,
    scanCount?: number,
    shortlist?: number,
    force?: boolean,
  ) => Promise<import("./artist-lab").ArtistDiscoveryResult>;
  artistLabClearModels: () => Promise<
    import("./artist-lab").ArtistLabModelStatus
  >;
  artistLabStylePreview: (tag: string) => Promise<ArtistStylePreviewResult | null>;
  /** Native read-only access to AITag's public gallery data (renderer-safe IPC proxy). */
  aitagConfig: () => Promise<unknown>;
  aitagSearch: (
    request: import("./aitag").AitagSearchRequest,
  ) => Promise<unknown>;
  aitagSearchFresh: (
    request: import("./aitag").AitagSearchRequest,
  ) => Promise<unknown>;
  aitagSnapshot: () => Promise<{ config: unknown; search: unknown } | null>;
  aitagWork: (id: number) => Promise<unknown>;
  aitagPrewarm: (
    retentionDays?: number,
  ) => Promise<{ works: number; images: number }>;
  aitagClearDataCache: () => Promise<void>;
  aitagCacheImage: (url: string, retentionDays?: number, force?: boolean) => Promise<string>;
  aitagCacheStats: () => Promise<{ bytes: number; files: number }>;
  aitagClearCache: () => Promise<{ bytes: number; files: number }>;
  onlineGallerySearch: (
    request: import("./online-gallery").OnlineGallerySearchRequest,
  ) => Promise<import("./online-gallery").OnlineGalleryPage>;
  onlineGalleryDetail: (
    request: import("./online-gallery").OnlineGalleryDetailRequest,
  ) => Promise<import("./online-gallery").OnlineGalleryDetail>;
  onlineGalleryClearDataCache: () => Promise<void>;
  onlineGalleryCacheImage: (
    source: import("./online-gallery").OnlineGallerySourceId,
    url: string,
    retentionDays?: number,
    force?: boolean,
  ) => Promise<string>;
  hasToken: () => Promise<AccountSummary>;
  accountCached: () => Promise<AccountSummary>;
  verifyToken: (token: string) => Promise<TokenStatus>;
  clearToken: () => Promise<{ ok: boolean }>;
  quoteAnlas: (request: AnlasQuoteRequest) => Promise<AnlasQuoteResult>;
  generate: (
    params: GenerateParams,
    extras: GenerateExtras,
    previewRequestId?: string,
  ) => Promise<GenerateResult>;
  onGenerationPreview: (
    callback: (event: GenerationPreviewEvent) => void,
  ) => () => void;
  generateArtistLab: (
    params: GenerateParams,
    extras: GenerateExtras,
    mode: "target" | "random",
  ) => Promise<GenerateResult>;
  artistLabPromoteFavorite: (item: HistoryItem) => Promise<HistoryItem>;
  artistLabListPromotedFavorites: () => Promise<HistoryItem[]>;
  artistLabLoadFavoriteLibrary: () => Promise<{
    version: 1;
    updatedAt: string;
    collections: Record<
      "random" | "v5-repair" | "artist-string-draw",
      unknown[]
    >;
  }>;
  artistLabSaveFavoriteCollection: (
    collection: "random" | "v5-repair" | "artist-string-draw",
    favorites: unknown[],
  ) => Promise<{ ok: boolean }>;
  artistLabDeleteTemporary: (filePath: string) => Promise<{ ok: boolean }>;
  artistLabClearTemporary: () => Promise<{ ok: boolean }>;
  generateI2I: (
    params: GenerateParams,
    i2i: I2IParams,
    extras: GenerateExtras,
  ) => Promise<GenerateResult>;
  redrawImage: (request: BatchRedrawRequest) => Promise<GenerateResult>;
  inpaint: (
    params: GenerateParams,
    inpaintModel: NAIInpaintModel,
    maskBase64: string,
    strength: number,
    noise: number,
  ) => Promise<GenerateResult>;
  upscaleImage: (scale: UpscaleScale, model: string) => Promise<SingleImageResult>;
  augmentImage: (
    tool: DirectorTool,
    options: AugmentOptions,
  ) => Promise<GenerateResult>;
  cancel: () => Promise<{ ok: boolean }>;
  loadImage: () => Promise<LoadImageResult>;
  loadImageFromPath: (filePath: string) => Promise<LoadImageResult>;
  saveMetadataSnapshot: (payload: MetadataSnapshotPayload) => Promise<MetadataSnapshotResult>;
  saveMetadataSnapshotFromPath: (filePath: string) => Promise<MetadataSnapshotResult>;
  readMetadataSnapshotFromPath: (filePath: string) => Promise<MetadataSnapshotResult>;
  loadMetadataSnapshot: () => Promise<MetadataSnapshotResult>;
  getPathForFile: (file: File) => string;
  clearWorkbenchImage: () => Promise<{ ok: boolean }>;
  getHistory: (date?: string, groupId?: string) => Promise<HistoryItem[]>;
  getHistoryDates: () => Promise<string[]>;
  getHistoryGroups: () => Promise<HistoryGroup[]>;
  createHistoryGroup: (name: string) => Promise<HistoryGroup[]>;
  renameHistoryGroup: (id: string, name: string) => Promise<HistoryGroup[]>;
  deleteHistoryGroup: (id: string) => Promise<HistoryGroup[]>;
  exportHistoryGroup: (
    groupId: string,
  ) => Promise<{ ok: boolean; message: string; path?: string }>;
  exportFiles: (
    files: BatchExportFile[],
    defaultName?: string,
  ) => Promise<{ ok: boolean; message: string; path?: string }>;
  setHistoryGroup: (id: string, groupId?: string) => Promise<{ ok: boolean }>;
  deleteHistory: (id: string) => Promise<{ ok: boolean }>;
  pruneMissingHistoryItem: (id: string) => Promise<boolean>;
  renameHistoryItem: (
    id: string,
    name: string,
  ) => Promise<{ ok: boolean; message?: string; item?: HistoryItem }>;
  openInExplorer: (targetPath: string) => Promise<{ ok: boolean }>;
  /** Native OS drag-out of a saved image file (drag to desktop / Explorer / other apps). */
  startImageDrag: (filePath: string) => void;
  selectOutputDir: () => Promise<string | null>;
  getSetting: <K extends SettingKey>(key: K) => Promise<AppSettings[K]>;
  setSetting: <K extends SettingKey>(
    key: K,
    value: AppSettings[K],
  ) => Promise<AppSettings[K]>;
  getSettings: () => Promise<AppSettings>;
  isFirstRun: () => Promise<boolean>;
  completeSetup: () => Promise<{ ok: boolean }>;
  reversePrompt: (
    imageBase64: string,
    mode: ReversePromptMode,
    scope?: ReversePromptScope,
    hint?: string,
    knownCharacter?: boolean,
    templateVersion?: ReversePromptTemplateVersion,
  ) => Promise<{
    ok: boolean;
    prompt?: string;
    variants?: PromptVariants;
      message: string;
  }>;
  convertPrompt: (
    text: string,
    mode: ReversePromptMode,
    knownCharacter?: boolean,
    templateVersion?: ReversePromptTemplateVersion,
  ) => Promise<{
    ok: boolean;
    result?: string;
    variants?: PromptVariants;
      message: string;
  }>;
  getConvertHistory: () => Promise<TextToolHistoryItem[]>;
  addConvertHistoryItem: (
    item: TextToolHistoryItem,
  ) => Promise<{ ok: boolean }>;
  deleteConvertHistoryItem: (id: string) => Promise<{ ok: boolean }>;
  clearConvertHistory: () => Promise<{ ok: boolean }>;
  getReverseHistory: () => Promise<TextToolHistoryItem[]>;
  addReverseHistoryItem: (
    item: TextToolHistoryItem,
  ) => Promise<{ ok: boolean }>;
  deleteReverseHistoryItem: (id: string) => Promise<{ ok: boolean }>;
  clearReverseHistory: () => Promise<{ ok: boolean }>;
  pruneMissingReverseHistoryItem: (id: string) => Promise<boolean>;
  comicAnalyzeScript: (
    request: ComicAnalyzeRequest,
  ) => Promise<ComicAnalyzeResult>;
  comicConvertPanels: (
    request: ComicConvertRequest,
  ) => Promise<ComicConvertResult>;
  comicCheckConsistency: (
    request: ComicConsistencyRequest,
  ) => Promise<ComicConsistencyResult>;
  comicReverseAsset: (
    imageBase64: string,
    mode: ReversePromptMode,
    scope?: ReversePromptScope,
    hint?: string,
    knownCharacter?: boolean,
  ) => Promise<{
    ok: boolean;
    prompt?: string;
    variants?: PromptVariants;
    message: string;
  }>;
  comicGeneratePanel: (
    request: ComicGeneratePanelRequest,
  ) => Promise<GenerateResult>;
  tagComicGenerateCandidate: (
    request: TagComicGenerateRequest,
  ) => Promise<GenerateResult>;
  tagComicImportReference: (
    request: TagComicReferenceImportRequest,
  ) => Promise<TagComicReferenceImportResult>;
  tagComicDeleteReference: (
    projectId: string,
    referenceId: string,
  ) => Promise<{ ok: boolean }>;
  tagComicExportSelectedZip: (
    request: TagComicExportZipRequest,
  ) => Promise<ComicExportZipResult>;
  getAiCallLog: () => Promise<AiCallLogEntry[]>;
  clearAiCallLog: () => Promise<{ ok: boolean }>;
  getReverseTemplateDefaults: () => Promise<ModePromptTemplates>;
  listAiModels: (kind: "reverse" | "convert") => Promise<AiModelListResult>;
  testTagServer: (
    query: string,
  ) => Promise<{ ok: boolean; message: string; tags: TagSuggestion[] }>;
  suggestTags: (model: string, prompt: string) => Promise<TagSuggestion[]>;
  searchTagServer: (query: string, limit?: number) => Promise<TagSuggestion[]>;
  danbooruStatus: () => Promise<{
    downloaded: boolean;
    sizeBytes: number;
    count: number;
    catalogDownloaded: boolean;
    bilingualDownloaded: boolean;
    bilingualCount: number;
  }>;
  downloadDanbooru: () => Promise<{
    ok: boolean;
    message: string;
    count?: number;
  }>;
  danbooruBrowse: (
    category: number,
    offset: number,
    limit: number,
  ) => Promise<TagSuggestion[]>;
  danbooruSearch: (query: string, limit: number) => Promise<TagSuggestion[]>;
  artistStyleCatalog: (
    scope: ArtistStyleCatalogScope,
    query: string,
    offset: number,
    limit: number,
  ) => Promise<ArtistStyleCatalogResult>;
  translate: (
    text: string,
    target?: string,
  ) => Promise<{ ok: boolean; text?: string; error?: string }>;
  checkUpdate: () => Promise<UpdateInfo>;
  isPortable: () => Promise<boolean>;
  downloadUpdate: () => Promise<{ ok: boolean; message: string }>;
  installUpdate: () => Promise<void>;
  onUpdateEvent: (callback: (event: UpdateProgressEvent) => void) => () => void;
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  getLogInfo: () => Promise<{
    path: string;
    dir: string;
    exists: boolean;
    sizeBytes: number;
  }>;
  selectLogDir: () => Promise<string | null>;
  openLogFile: () => Promise<{ ok: boolean; message?: string }>;
  openLogDir: () => Promise<{ ok: boolean; message?: string }>;
  readLog: () => Promise<string>;
}
