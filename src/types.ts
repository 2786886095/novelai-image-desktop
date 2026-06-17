export const APP_VERSION = "0.7.2";
export const APP_NAME = "Langbai NovelAI Studio";
export const PROJECT_REPOSITORY = "https://github.com/2786886095/novelai-image-desktop";

export type ReversePromptMode = "tags" | "natural" | "mixed";
export type TagServerType = "rest" | "http" | "sse" | "stdio";
export type TranslateProvider = "google" | "baidu";

/** Independent system-prompt templates keyed by output mode. Empty = built-in. */
export interface ModePromptTemplates {
  tags: string;
  natural: string;
  mixed: string;
}

export const EMPTY_MODE_TEMPLATES: ModePromptTemplates = { tags: "", natural: "", mixed: "" };

export const NAI_MODELS = [
  { label: "NAI Diffusion 4.5 Full（完整模型）", value: "nai-diffusion-4-5-full" },
  { label: "NAI Diffusion 4.5 Curated（精选模型）", value: "nai-diffusion-4-5-curated" },
  { label: "NAI Diffusion 4 Full（完整模型）", value: "nai-diffusion-4-full" },
  { label: "NAI Diffusion 4 Curated（精选模型）", value: "nai-diffusion-4-curated" },
  { label: "NAI Diffusion 3（旧版通用）", value: "nai-diffusion-3" },
  { label: "NAI Diffusion Furry 3（兽人模型）", value: "nai-diffusion-furry-3" },
] as const;

export type NAIModel = (typeof NAI_MODELS)[number]["value"];

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
  ucPreset: 0,
  qualityToggle: true,
  smea: false,
  smeaDyn: false,
  variety: false,
  fileNamePrefix: "",
};

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
}

export const NAI_INPAINT_MODELS = [
  { label: "NAI Diffusion 4.5 Curated（推荐）", value: "nai-diffusion-4-5-curated-inpainting" },
  { label: "NAI Diffusion 4 Curated", value: "nai-diffusion-4-curated-inpainting" },
  { label: "NAI Diffusion 4 Full", value: "nai-diffusion-4-full-inpainting" },
  { label: "NAI Diffusion 3", value: "nai-diffusion-3-inpainting" },
] as const;

export type NAIInpaintModel = (typeof NAI_INPAINT_MODELS)[number]["value"];
export type UpscaleScale = 2 | 4;

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
  apiBaseUrl: string;
  imageBaseUrl: string;
  proxyUrl: string;
  theme: "light" | "dark" | "system";
  autoComplete: boolean;
  weightHighlight: boolean;
  promptRandomizer: boolean;
  superDrop: boolean;
  showFloatingToolbar: boolean;
  historyJumpAfterGenerate: boolean;
  deleteProtectionSeconds: number;
  historyRetentionDays: number;
  debugLogs: boolean;
  // Vision / Reverse-prompt
  visionApiUrl: string;
  visionApiKey: string;
  visionApiModel: string;
  visionSystemPrompt: string;
  reversePromptMode: ReversePromptMode;
  // Per-mode reverse-prompt system templates (empty string = use built-in default).
  reversePromptTemplates: ModePromptTemplates;
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
  // Filename template for saved images. Tokens: {date} {time} {seq} {seed} {model} {ext}
  imageNameTemplate: string;
  // Prompt templates
  promptTemplates: PromptTemplate[];
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
  generate: (params: GenerateParams, extras: GenerateExtras) => Promise<GenerateResult>;
  generateI2I: (params: GenerateParams, i2i: I2IParams, extras: GenerateExtras) => Promise<GenerateResult>;
  inpaint: (params: GenerateParams, inpaintModel: NAIInpaintModel, maskBase64: string) => Promise<GenerateResult>;
  upscaleImage: (scale: UpscaleScale) => Promise<SingleImageResult>;
  augmentImage: (tool: DirectorTool, options: AugmentOptions) => Promise<GenerateResult>;
  cancel: () => Promise<{ ok: boolean }>;
  loadImage: () => Promise<LoadImageResult>;
  loadImageFromPath: (filePath: string) => Promise<LoadImageResult>;
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
  reversePrompt: (imageBase64: string, mode: ReversePromptMode) => Promise<{ ok: boolean; prompt?: string; message: string }>;
  convertPrompt: (text: string, mode: ReversePromptMode) => Promise<{ ok: boolean; result?: string; message: string }>;
  listAiModels: (kind: "reverse" | "convert") => Promise<AiModelListResult>;
  testTagServer: (query: string) => Promise<{ ok: boolean; message: string; tags: TagSuggestion[] }>;
  suggestTags: (model: string, prompt: string) => Promise<TagSuggestion[]>;
  searchTagServer: (query: string, limit?: number) => Promise<TagSuggestion[]>;
  translate: (text: string, target?: string) => Promise<{ ok: boolean; text?: string; error?: string }>;
  checkUpdate: () => Promise<UpdateInfo>;
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
}
