export const APP_VERSION = "0.9.8";
export const APP_NAME = "Langbai NovelAI Studio";
export const PROJECT_REPOSITORY = "https://github.com/2786886095/novelai-image-desktop";

export type ReversePromptMode = "tags" | "natural" | "mixed";
export type ReversePromptScope = "full" | "character" | "object" | "scene";
export type TagServerType = "rest" | "http" | "sse" | "stdio";
export type TranslateProvider = "google" | "baidu";

/** Independent system-prompt templates keyed by output mode. Empty = built-in. */
export interface ModePromptTemplates {
  tags: string;
  natural: string;
  mixed: string;
}

export const EMPTY_MODE_TEMPLATES: ModePromptTemplates = { tags: "", natural: "", mixed: "" };

export type ModelMode = "anime" | "furry";

export const NAI_MODELS = [
  { label: "NAI Diffusion 4.5 Full（完整模型）", value: "nai-diffusion-4-5-full", mode: "anime" },
  { label: "NAI Diffusion 4.5 Curated（精选模型）", value: "nai-diffusion-4-5-curated", mode: "anime" },
  { label: "NAI Diffusion 4 Full（完整模型）", value: "nai-diffusion-4-full", mode: "anime" },
  { label: "NAI Diffusion 4 Curated（精选模型）", value: "nai-diffusion-4-curated", mode: "anime" },
  { label: "NAI Diffusion 3（旧版通用）", value: "nai-diffusion-3", mode: "anime" },
  { label: "NAI Diffusion Furry 3（兽人模型）", value: "nai-diffusion-furry-3", mode: "furry" },
] as const;

export type NAIModel = (typeof NAI_MODELS)[number]["value"];

/** Default model selected when switching into each mode. */
export const DEFAULT_MODEL_FOR_MODE: Record<ModelMode, NAIModel> = {
  anime: "nai-diffusion-4-5-full",
  furry: "nai-diffusion-furry-3",
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
  qualityToggle: boolean;
  smea: boolean;
  smeaDyn: boolean;
  variety: boolean;
  /** Optional custom file-name prefix; empty = use the global naming template only. */
  fileNamePrefix: string;
}

export const DEFAULT_PARAMS: GenerateParams = {
  model: "nai-diffusion-4-5-full",
  stylePrompt: "",
  positivePrompt: "",
  negativePrompt: "",
  width: 832,
  height: 1216,
  steps: 28,
  cfgScale: 6,
  cfgRescale: 0,
  sampler: "k_euler_ancestral",
  noiseSchedule: "native",
  seed: 0,
  seedMode: "random",
  ucPreset: 0,
  qualityToggle: true,
  smea: false,
  smeaDyn: false,
  variety: false,
  fileNamePrefix: "",
};

export interface LastGenerationState {
  params: GenerateParams;
  batchCount: number;
  i2iParams: I2IParams;
  inpaintModel: NAIInpaintModel;
  inpaintStrength: number;
  inpaintNoise: number;
  brushSize: number;
  brushOpacity: number;
  upscaleScale: UpscaleScale;
  directorTool: DirectorTool;
  augmentOptions: AugmentOptions;
}

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

export const DEFAULT_I2I_PARAMS: I2IParams = {
  strength: 0.7,
  noise: 0,
  extraNoiseSeed: 0,
};

/** Vibe Transfer / Precise Reference — slim type sent over IPC */
export interface VibeTransferItem {
  base64: string;        // pure base64 without data-URL prefix
  infoExtracted: number; // 0.0 – 1.0  (0.7 vibe / 1.0 precise)
  strength: number;      // 0.0 – 1.0
}

/** Renderer store representation (adds id + preview for display) */
export interface VibeTransferImage extends VibeTransferItem {
  id: string;
  previewUrl: string; // data URL, never sent to main process
}

/** NovelAI V4.5 Precise (Director) Reference — distinct from Vibe Transfer.
 * Sent over IPC; the main process emits director_reference_* fields. */
export type PreciseReferenceType = "character" | "style" | "character&style";
export interface PreciseReferenceItem {
  base64: string;               // pure base64 (resized to an official reference resolution in main)
  type: PreciseReferenceType;   // -> director_reference_descriptions[].caption.base_caption
  strength: number;             // 0.0 – 1.0 -> director_reference_strength_values
  fidelity: number;             // 0.0 – 1.0 -> secondary = round(1 - fidelity, 2)
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
}

export interface PromptVariants {
  namePrompt: string;
  featurePrompt: string;
}

export type ComicReferenceKind = "vibe" | "precise" | "character" | "scene" | "object";
export type ComicPanelStatus = "draft" | "converted" | "generating" | "done" | "failed";
export type ComicDesiredPanelCount = "auto" | number;
export type GenerateFailureKind = "auth" | "reference" | "validation" | "api" | "cancelled";

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
  panels?: Array<Pick<ComicPanel, "cnPrompt" | "contextSummary">>;
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
  panels: Array<{ panelId: string; enPrompt: string; contextSummary?: string; error?: string }>;
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
  { label: "NAI Diffusion 4.5 Full（推荐）", value: "nai-diffusion-4-5-full-inpainting" },
  { label: "NAI Diffusion 4.5 Curated", value: "nai-diffusion-4-5-curated-inpainting" },
  { label: "NAI Diffusion 4 Full", value: "nai-diffusion-4-full-inpainting" },
  { label: "NAI Diffusion 4 Curated", value: "nai-diffusion-4-curated-inpainting" },
  { label: "NAI Diffusion 3", value: "nai-diffusion-3-inpainting" },
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
}

export interface AccountSummary {
  hasToken: boolean;
  tierName?: string;
  tierLevel?: number;
  anlasBalance?: number;
  expiresAt?: string;
  hasActiveSubscription?: boolean;
  // True when this summary is a cached copy returned because a live refresh
  // failed — the balance may be out of date and must be labelled as such.
  stale?: boolean;
}

export type AnlasQuoteFeature = "generate" | "i2i" | "inpaint" | "upscale" | "director";
// "official-api" = price returned by NovelAI's /request-price endpoint (authoritative).
// "estimate-formula"/"estimate-fixed" = our local web-frontend formula / fixed rules,
// which are close but NOT guaranteed to match the final charge — must be shown as estimates.
export type AnlasQuoteSource = "official-api" | "estimate-formula" | "estimate-fixed" | "unavailable";

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

export interface SingleImageResult {
  ok: boolean;
  message: string;
  item?: HistoryItem;
}

export interface LoadImageResult {
  ok: boolean;
  image?: WorkingImage;
  message?: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  prefix: string;
  suffix: string;
  negativePrompt: string;
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

export interface AppSettings {
  hasOnboarded: boolean;
  language: "zh-CN" | "en-US" | "ja-JP";
  outputDir: string;
  /** Folder for the app.log error log. Empty = default <userData>/logs. */
  logDir: string;
  apiBaseUrl: string;
  imageBaseUrl: string;
  // Opt-in to sending the NovelAI Bearer token to a non-official endpoint host.
  // Default false: a custom (non *.novelai.net) endpoint is refused to avoid
  // leaking the token to an untrusted server.
  allowCustomEndpoint: boolean;
  proxyMode: "http" | "direct" | "socks" | "custom";
  // Proxy for outbound requests. Empty = direct. Accepts http://host:port or
  // socks5://host:port (scheme defaults to http:// when omitted).
  proxyUrl: string;
  // Per-category proxy opt-out (all default true = everything goes through proxy).
  proxyForNai: boolean;
  proxyForMcp: boolean;
  proxyForAi: boolean;
  proxyForUpdate: boolean;
  proxyForTranslate: boolean;
  theme: "light" | "dark" | "system";
  autoComplete: boolean;
  weightHighlight: boolean;
  promptRandomizer: boolean;
  superDrop: boolean;
  showFloatingToolbar: boolean;
  historyJumpAfterGenerate: boolean;
  historyRetentionDays: number;
  /** Write app.log (errors + call info). Default on. */
  loggingEnabled: boolean;
  // Vision / Reverse-prompt
  visionApiUrl: string;
  visionApiKey: string;
  visionApiModel: string;
  visionSystemPrompt: string;
  reversePromptMode: ReversePromptMode;
  // Per-mode reverse-prompt system templates (empty string = use built-in default).
  reversePromptTemplates: ModePromptTemplates;
  // Legacy per-mode comic storyboard templates. Kept for migration only.
  comicAnalyzePromptTemplates: ModePromptTemplates;
  // Current single storyboard analysis template used by the comic generator.
  comicAnalyzePromptTemplate: string;
  // Text-only prompt conversion API, intentionally separated from vision reverse-prompt.
  convertApiUrl: string;
  convertApiKey: string;
  convertApiModel: string;
  convertSystemPrompt: string;
  // Convert output type + per-mode conversion system templates.
  convertMode: ReversePromptMode;
  convertPromptTemplates: ModePromptTemplates;
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
  lastGenerationState: LastGenerationState | null;
}

export type SettingKey = keyof AppSettings;

export interface UpdateInfo {
  /** true when a newer release is available on GitHub */
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  /** populated when the check itself failed (network / rate limit) */
  error?: string;
}

export interface AiModelListResult {
  ok: boolean;
  message: string;
  models: string[];
}

/** Parsed generation parameters extracted from a NovelAI PNG's metadata. */
export interface ImportedParams {
  positivePrompt?: string;
  negativePrompt?: string;
  model?: NAIModel;
  steps?: number;
  cfgScale?: number;
  cfgRescale?: number;
  sampler?: NAISampler;
  noiseSchedule?: string;
  seed?: number;
  width?: number;
  height?: number;
  smea?: boolean;
  smeaDyn?: boolean;
}

export interface NaiDesktopApi {
  hasToken: () => Promise<AccountSummary>;
  verifyToken: (token: string) => Promise<TokenStatus>;
  clearToken: () => Promise<{ ok: boolean }>;
  quoteAnlas: (request: AnlasQuoteRequest) => Promise<AnlasQuoteResult>;
  generate: (params: GenerateParams, extras: GenerateExtras) => Promise<GenerateResult>;
  generateI2I: (params: GenerateParams, i2i: I2IParams, extras: GenerateExtras) => Promise<GenerateResult>;
  inpaint: (
    params: GenerateParams,
    inpaintModel: NAIInpaintModel,
    maskBase64: string,
    strength: number,
    noise: number,
  ) => Promise<GenerateResult>;
  upscaleImage: (scale: UpscaleScale) => Promise<SingleImageResult>;
  augmentImage: (tool: DirectorTool, options: AugmentOptions) => Promise<GenerateResult>;
  cancel: () => Promise<{ ok: boolean }>;
  loadImage: () => Promise<LoadImageResult>;
  loadImageFromPath: (filePath: string) => Promise<LoadImageResult>;
  getPathForFile: (file: File) => string;
  clearWorkbenchImage: () => Promise<{ ok: boolean }>;
  getHistory: (date?: string, groupId?: string) => Promise<HistoryItem[]>;
  getHistoryDates: () => Promise<string[]>;
  getHistoryGroups: () => Promise<HistoryGroup[]>;
  createHistoryGroup: (name: string) => Promise<HistoryGroup[]>;
  renameHistoryGroup: (id: string, name: string) => Promise<HistoryGroup[]>;
  deleteHistoryGroup: (id: string) => Promise<HistoryGroup[]>;
  exportHistoryGroup: (groupId: string) => Promise<{ ok: boolean; message: string; path?: string }>;
  setHistoryGroup: (id: string, groupId?: string) => Promise<{ ok: boolean }>;
  deleteHistory: (id: string) => Promise<{ ok: boolean }>;
  renameHistoryItem: (id: string, name: string) => Promise<{ ok: boolean; message?: string; item?: HistoryItem }>;
  openInExplorer: (targetPath: string) => Promise<{ ok: boolean }>;
  selectOutputDir: () => Promise<string | null>;
  getSetting: <K extends SettingKey>(key: K) => Promise<AppSettings[K]>;
  setSetting: <K extends SettingKey>(key: K, value: AppSettings[K]) => Promise<AppSettings[K]>;
  getSettings: () => Promise<AppSettings>;
  isFirstRun: () => Promise<boolean>;
  completeSetup: () => Promise<{ ok: boolean }>;
  reversePrompt: (
    imageBase64: string,
    mode: ReversePromptMode,
    scope?: ReversePromptScope,
    hint?: string,
    knownCharacter?: boolean,
  ) => Promise<{ ok: boolean; prompt?: string; variants?: PromptVariants; message: string }>;
  convertPrompt: (
    text: string,
    mode: ReversePromptMode,
    knownCharacter?: boolean,
  ) => Promise<{ ok: boolean; result?: string; variants?: PromptVariants; message: string }>;
  comicAnalyzeScript: (request: ComicAnalyzeRequest) => Promise<ComicAnalyzeResult>;
  comicConvertPanels: (request: ComicConvertRequest) => Promise<ComicConvertResult>;
  comicCheckConsistency: (request: ComicConsistencyRequest) => Promise<ComicConsistencyResult>;
  comicReverseAsset: (
    imageBase64: string,
    mode: ReversePromptMode,
    scope?: ReversePromptScope,
    hint?: string,
    knownCharacter?: boolean,
  ) => Promise<{ ok: boolean; prompt?: string; variants?: PromptVariants; message: string }>;
  comicGeneratePanel: (request: ComicGeneratePanelRequest) => Promise<GenerateResult>;
  comicExportProjectZip: (project: ComicProject) => Promise<ComicExportZipResult>;
  getAiCallLog: () => Promise<AiCallLogEntry[]>;
  clearAiCallLog: () => Promise<{ ok: boolean }>;
  getReverseTemplateDefaults: () => Promise<ModePromptTemplates>;
  listAiModels: (kind: "reverse" | "convert") => Promise<AiModelListResult>;
  testTagServer: (query: string) => Promise<{ ok: boolean; message: string; tags: TagSuggestion[] }>;
  suggestTags: (model: string, prompt: string) => Promise<TagSuggestion[]>;
  searchTagServer: (query: string, limit?: number) => Promise<TagSuggestion[]>;
  danbooruStatus: () => Promise<{ downloaded: boolean; sizeBytes: number; count: number }>;
  downloadDanbooru: () => Promise<{ ok: boolean; message: string; count?: number }>;
  danbooruBrowse: (category: number, offset: number, limit: number) => Promise<TagSuggestion[]>;
  danbooruSearch: (query: string, limit: number) => Promise<TagSuggestion[]>;
  translate: (text: string, target?: string) => Promise<{ ok: boolean; text?: string; error?: string }>;
  checkUpdate: () => Promise<UpdateInfo>;
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  getLogInfo: () => Promise<{ path: string; dir: string; exists: boolean; sizeBytes: number }>;
  selectLogDir: () => Promise<string | null>;
  openLogFile: () => Promise<{ ok: boolean; message?: string }>;
  openLogDir: () => Promise<{ ok: boolean; message?: string }>;
  readLog: () => Promise<string>;
}
