import { create } from "zustand";
import type {
  AccountSummary,
  AnlasQuoteRequest,
  AnlasQuoteResult,
  AppLanguage,
  AppSettings,
  AugmentOptions,
  BatchRedrawProject,
  CharCaption,
  DirectorTool,
  GenerateExtras,
  GenerateParams,
  HistoryGroup,
  HistoryItem,
  I2IParams,
  LastGenerationState,
  NAIInpaintModel,
  PromptVariants,
  ReversePromptMode,
  ReversePromptScope,
  TextToolHistoryItem,
  TextToolJob,
  UpdateInfo,
  UpscaleScale,
  VibeTransferImage,
  PreciseReferenceImage,
  WorkingImage,
} from "./types";
import { createDefaultBatchRedraw, DEFAULT_AUGMENT_OPTIONS, DEFAULT_I2I_PARAMS, DEFAULT_PARAMS } from "./types";
import { normalizeAppLanguage } from "./i18n";
import { expandWildcards } from "./wildcards";

type ActiveTab = "generate" | "inpaint" | "upscale" | "postprocess" | "inspect" | "convert" | "tools" | "records";
type PromptTab = "positive" | "negative";
type BrushMode = "paint" | "erase";

// Workspace column widths (left operations rail / right history rail) — persisted
// in localStorage so the layout is identical on next launch. Center fills the rest.
// A finished convert/reverse job is already reflected in the result box and
// history — leaving it in the tracker list just forces a manual ✕ click.
const TEXTTOOL_DONE_AUTO_DISMISS_MS = 1500;
const WS_LEFT_DEFAULT = 380;
const WS_RIGHT_DEFAULT = 340;
const WS_LEFT_MIN = 260;
const WS_LEFT_MAX = 560;
const WS_RIGHT_MIN = 220;
const WS_RIGHT_MAX = 480;
function readWsWidth(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

const STORE_TEXT: Record<AppLanguage, Record<string, string>> = {
  "zh-CN": {
    "status.ready": "就绪",
    "status.apiConfigured": "API 已配置",
    "status.needApiToken": "请先设置 API Token",
    "status.quoteFailed": "无法读取生成前扣费",
    "status.insufficient": "Anlas 余额不足",
    "status.imageLoaded": "已加载图片：{width}×{height}",
    "status.imageLoadFailed": "加载图片失败",
    "status.workbenchCleared": "已清除工作台图片",
    "status.missingPrompt": "缺少提示词",
    "status.preparing": "正在准备生成（读取余额与报价）…",
    "status.paused": "已暂停（{done}/{total}），点击继续",
    "status.waitingQueueQuote": "当前图片已完成，正在等待队列任务报价...",
    "status.generatingProgress": "正在生成 {current}/{total}（成功 {done}，失败 {failed}，等待 {waiting}）...",
    "status.i2iFailed": "图生图失败",
    "status.inpaintFailed": "重绘失败",
    "status.upscaleFailed": "超分失败",
    "status.postFailed": "后期处理失败",
    "status.cancelGenerate": "正在取消生成并清空队列...",
    "status.cancelOperation": "正在取消操作...",
    "status.cancelGenerateDone": "已取消生成，队列已清空。",
    "status.cancelOperationDone": "已取消操作",
    "status.historySelected": "已选择历史图片：{date}",
    "status.needImage": "缺少图片",
    "status.needOriginal": "缺少原图",
    "status.needMask": "缺少蒙版",
    "toast.needApiToken": "请先在设置中配置 API Token。",
    "toast.imageLoaded": "已加载：{width}×{height}",
    "toast.needImage": "请先选择图片。",
    "toast.inspectDone": "反推完成！",
    "toast.needConvertInput": "请先输入描述文字。",
    "toast.convertDone": "转换完成！",
    "toast.noQueue": "当前没有正在执行的生图队列。",
    "toast.queueNeedPrompt": "请输入正面提示词后再加入队列。",
    "toast.queueChanged": "队列已变化，本次加入已取消。",
    "toast.queueAdded": "已加入队列，生成前报价 {amount} Anlas。",
    "toast.queueAddFailed": "加入队列失败：{message}",
    "toast.queueRemoved": "已移出队列。",
    "toast.queueClearedStop": "已清空排队（当前图生成完成后停止）。",
    "toast.queueCleared": "已清空排队。",
    "toast.needPrompt": "请输入正面提示词。",
    "toast.needReference": "请先加载参考图片。",
    "toast.needOriginal": "请先加载原图。",
    "toast.needMask": "请先用画笔标记要重绘的区域。",
    "toast.needLoadedImage": "请先加载图片。",
    "toast.paramsLoadedSeed": "已载入参数并锁定种子 {seed}，改提示词后生成即为变体",
    "toast.paramsLoaded": "已载入参数",
    "toast.renameFailed": "重命名失败",
    "toast.renamed": "已重命名图片",
    "group.created": "已创建分组：{name}",
    "group.nameRequired": "分组名称不能为空",
    "group.renamed": "已重命名分组：{name}",
    "group.deleted": "已删除分组（图片已转为未分组）",
    "group.packing": "正在打包分组...",
    "error.unknown": "未知错误",
    "error.generationFailed": "图片生成失败：{detail}",
    "anlas.spent": "{message} 实扣 {spent} Anlas。",
    "anlas.spentFailed": "{message} 实扣读取失败，请刷新积分确认。",
    "quote.readFailed": "{action}扣费读取失败，请稍后重试。",
    "quote.readFailedTry": "{action}扣费读取失败，将继续尝试；若官方拒绝会返回错误。",
    "quote.insufficient": "{action}预计需要 {amount} Anlas，当前余额 {balance} Anlas，将继续尝试；若余额确实不足会返回积分不足。",
    "quote.deduct": "{action}将在执行前扣除 {amount} Anlas。",
    "queue.itemQuoteFailed": "无法读取这张队列图片的生成前扣费，仍会加入队列并尝试。",
    "queue.itemInsufficient": "这张图片预计需要 {amount} Anlas，当前余额 {balance} Anlas，仍会加入队列并尝试。",
    "queue.totalInsufficient": "队列中待生成图片预计还需 {pending} Anlas；加入本张后可能超过当前余额 {balance} Anlas，仍会加入队列并尝试。",
    "queue.noPromptLabel": "(无提示词)",
    "queue.addedStatus": "已加入队列，等待 {count} 张。",
    "action.batchGenerate": "批量生成 {count} 张",
    "action.generateImage": "生成图片",
    "action.i2i": "图生图",
    "action.inpaint": "局部重绘",
    "action.upscale": "云端超分 {scale}x",
    "action.postprocess": "后期处理",
    "generate.batchQuoteStatus": "批量生成 1/{total}，生成前报价 {amount} Anlas...",
    "generate.quoteStatus": "正在生成，生成前报价 {amount} Anlas...",
    "generate.cancelled": "已取消生成，队列已清空{spent}。",
    "generate.doneFailed": "完成：成功 {done} 张，失败 {failed} 张{spent}；最后一次错误：{error}",
    "generate.batchDone": "批量生成完成，共 {done} 张{spent}。",
    "generate.singleDone": "生成完成，已保存 1 张图片{spent}。",
    "generate.spent": "，实扣 {spent} Anlas",
    "generate.spentFailed": "，实扣读取失败",
    "i2i.status": "正在图生图，生成前报价 {amount} Anlas...",
    "inpaint.status": "正在局部重绘，生成前报价 {amount} Anlas...",
    "upscale.status": "正在超分 {scale}x，生成前报价 {amount} Anlas...",
    "post.status": "正在运行 {tool}，生成前报价 {amount} Anlas...",
  },
  "zh-TW": {},
  "en-US": {
    "status.ready": "Ready",
    "status.apiConfigured": "API configured",
    "status.needApiToken": "Set API Token first",
    "status.quoteFailed": "Unable to read pre-generation cost",
    "status.insufficient": "Insufficient Anlas balance",
    "status.imageLoaded": "Loaded image: {width}×{height}",
    "status.imageLoadFailed": "Failed to load image",
    "status.workbenchCleared": "Workbench image cleared",
    "status.missingPrompt": "Missing prompt",
    "status.preparing": "Preparing generation (checking balance and quote)…",
    "status.paused": "Paused ({done}/{total}); click Continue",
    "status.waitingQueueQuote": "Current image finished; waiting for queued job quote...",
    "status.generatingProgress": "Generating {current}/{total} (success {done}, failed {failed}, waiting {waiting})...",
    "status.i2iFailed": "Img2img failed",
    "status.inpaintFailed": "Inpaint failed",
    "status.upscaleFailed": "Upscale failed",
    "status.postFailed": "Post-process failed",
    "status.cancelGenerate": "Cancelling generation and clearing queue...",
    "status.cancelOperation": "Cancelling operation...",
    "status.cancelGenerateDone": "Generation cancelled and queue cleared.",
    "status.cancelOperationDone": "Operation cancelled",
    "status.historySelected": "Selected history image: {date}",
    "status.needImage": "Missing image",
    "status.needOriginal": "Missing source image",
    "status.needMask": "Missing mask",
    "toast.needApiToken": "Configure API Token in Settings first.",
    "toast.imageLoaded": "Loaded: {width}×{height}",
    "toast.needImage": "Select an image first.",
    "toast.inspectDone": "Reverse prompt complete!",
    "toast.needConvertInput": "Enter description text first.",
    "toast.convertDone": "Conversion complete!",
    "toast.noQueue": "No generation queue is currently running.",
    "toast.queueNeedPrompt": "Enter a positive prompt before adding to queue.",
    "toast.queueChanged": "Queue changed; this add was cancelled.",
    "toast.queueAdded": "Added to queue; quoted {amount} Anlas.",
    "toast.queueAddFailed": "Failed to add to queue: {message}",
    "toast.queueRemoved": "Removed from queue.",
    "toast.queueClearedStop": "Queue cleared; current image will finish then stop.",
    "toast.queueCleared": "Queue cleared.",
    "toast.needPrompt": "Enter a positive prompt.",
    "toast.needReference": "Load a reference image first.",
    "toast.needOriginal": "Load the source image first.",
    "toast.needMask": "Mark the repaint area with the brush first.",
    "toast.needLoadedImage": "Load an image first.",
    "toast.paramsLoadedSeed": "Parameters loaded and seed locked to {seed}; edit the prompt to generate a variant",
    "toast.paramsLoaded": "Parameters loaded",
    "toast.renameFailed": "Rename failed",
    "toast.renamed": "Image renamed",
    "group.created": "Created group: {name}",
    "group.nameRequired": "Group name cannot be empty",
    "group.renamed": "Renamed group: {name}",
    "group.deleted": "Group deleted; images moved to Ungrouped",
    "group.packing": "Packaging group...",
    "error.unknown": "Unknown error",
    "error.generationFailed": "Image generation failed: {detail}",
    "anlas.spent": "{message} Spent {spent} Anlas.",
    "anlas.spentFailed": "{message} Could not read actual cost; refresh balance to confirm.",
    "quote.readFailed": "{action} cost quote failed; try again later.",
    "quote.readFailedTry": "{action} cost quote failed; the app will try anyway. If the official service rejects it, the error will be shown.",
    "quote.insufficient": "{action} is estimated at {amount} Anlas; current balance is {balance} Anlas. The app will try anyway and return insufficient balance if the service rejects it.",
    "quote.deduct": "{action} will deduct {amount} Anlas before execution.",
    "queue.itemQuoteFailed": "Unable to quote this queued image before generation; it will still be queued and tried.",
    "queue.itemInsufficient": "This image is estimated at {amount} Anlas; current balance is {balance} Anlas. It will still be queued and tried.",
    "queue.totalInsufficient": "Queued pending images need about {pending} Anlas; adding this one may exceed current balance {balance} Anlas. It will still be queued and tried.",
    "queue.noPromptLabel": "(no prompt)",
    "queue.addedStatus": "Added to queue; {count} waiting.",
    "action.batchGenerate": "Batch generate {count} images",
    "action.generateImage": "Generate image",
    "action.i2i": "Img2img",
    "action.inpaint": "Inpaint",
    "action.upscale": "Cloud upscale {scale}x",
    "action.postprocess": "Post-process",
    "generate.batchQuoteStatus": "Batch generation 1/{total}, quoted {amount} Anlas...",
    "generate.quoteStatus": "Generating, quoted {amount} Anlas...",
    "generate.cancelled": "Generation cancelled and queue cleared{spent}.",
    "generate.doneFailed": "Done: {done} success, {failed} failed{spent}; last error: {error}",
    "generate.batchDone": "Batch generation complete: {done} images{spent}.",
    "generate.singleDone": "Generation complete; saved 1 image{spent}.",
    "generate.spent": ", spent {spent} Anlas",
    "generate.spentFailed": ", actual cost unavailable",
    "i2i.status": "Running img2img, quoted {amount} Anlas...",
    "inpaint.status": "Running inpaint, quoted {amount} Anlas...",
    "upscale.status": "Upscaling {scale}x, quoted {amount} Anlas...",
    "post.status": "Running {tool}, quoted {amount} Anlas...",
  },
  "ja-JP": {},
  "ko-KR": {},
};

STORE_TEXT["zh-TW"] = STORE_TEXT["en-US"];
STORE_TEXT["ja-JP"] = STORE_TEXT["en-US"];
STORE_TEXT["ko-KR"] = STORE_TEXT["en-US"];

function storeText(settings: AppSettings | null | undefined, key: string) {
  const language = normalizeAppLanguage(settings?.language);
  return STORE_TEXT[language][key] ?? STORE_TEXT["en-US"][key] ?? STORE_TEXT["zh-CN"][key] ?? key;
}

function storeFormat(settings: AppSettings | null | undefined, key: string, values: Record<string, unknown>) {
  return storeText(settings, key).replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ""));
}

export interface QueuedGenerationJob {
  id: string;
  params: GenerateParams;
  extras: GenerateExtras;
  quotedAnlas: number;
  addedAt: number;
  /** Short prompt preview for the queue panel. */
  label: string;
}

interface AppState {
  bootDone: boolean;
  showOnboarding: boolean;
  showSettings: boolean;
  activeTab: ActiveTab;
  promptTab: PromptTab;
  /** Workspace rail widths (px); center fills the rest. Persisted to localStorage. */
  wsLeftWidth: number;
  wsRightWidth: number;
  params: GenerateParams;
  settings: AppSettings | null;
  account: AccountSummary;
  history: HistoryItem[];
  historyDates: string[];
  historyGroups: HistoryGroup[];
  selectedDate: string;
  selectedGroupId: string;
  currentImage: HistoryItem | null;
  workbenchImage: WorkingImage | null;
  comparisonBeforeImage: WorkingImage | null;
  i2iParams: I2IParams;
  inpaintModel: NAIInpaintModel;
  inpaintStrength: number;
  inpaintNoise: number;
  /** Independent from params.positivePrompt — inpaint must not inherit the
   * main generate/i2i prompt automatically. */
  inpaintPositivePrompt: string;
  brushSize: number;
  brushOpacity: number;
  brushMode: BrushMode;
  inpaintMask: string | null;
  maskRevision: number;
  upscaleScale: UpscaleScale;
  directorTool: DirectorTool;
  augmentOptions: AugmentOptions;
  vibeImages: VibeTransferImage[];
  preciseReferences: PreciseReferenceImage[];
  charCaptions: CharCaption[];
  /** 批量图生图 project — lives in the store so switching tools/tabs never loses it. */
  batchRedraw: BatchRedrawProject;
  /** Transient run state (not exported with the project). */
  batchRunning: boolean;
  batchProgress: { done: number; total: number } | null;
  batchCount: number;
  inspectImageUrl: string;
  inspectMeta: Record<string, string> | null;
  inspectImageBase64: string;
  /** Real filesystem path of the loaded reverse-source image, when known
   * (drag/drop and the file picker both resolve one). Used only to drop a
   * reverse history record once its source image is gone. */
  inspectImagePath: string;
  reversePromptText: string;
  reversePromptMode: ReversePromptMode;
  reversePromptScope: ReversePromptScope;
  reversePromptHint: string;
  reverseKnownCharacter: boolean;
  reversePromptVariants: PromptVariants | null;
  /** Concurrent job tracker for reverse requests — every submission fires
   * immediately and updates its own entry in place; not a serial queue.
   * Whether ANY reverse job is still processing is derived from this list
   * (`reverseJobs.some(j => j.status === "processing")`) rather than kept
   * as a separate flag. */
  reverseJobs: TextToolJob[];
  reverseQueueCollapsed: boolean;
  reverseHistory: TextToolHistoryItem[];
  convertInput: string;
  convertResult: string;
  convertMode: ReversePromptMode;
  convertKnownCharacter: boolean;
  convertJobs: TextToolJob[];
  convertQueueCollapsed: boolean;
  convertHistory: TextToolHistoryItem[];
  convertResultVariants: PromptVariants | null;
  isGenerating: boolean;
  isGenerateQueueRunning: boolean;
  activeGenerationRunId: string | null;
  queueAdding: boolean;
  generationQueue: QueuedGenerationJob[];
  queueCollapsed: boolean;
  /** Set by 清空排队 to also stop the remaining initial-batch images. */
  clearQueueRequested: boolean;
  /** Bumped whenever the queue is cleared/cancelled — invalidates in-flight enqueue quotes. */
  queueVersion: number;
  /** Vibe identity keys used by the active run, so duplicate queued refs aren't re-quoted for encoding. */
  activeVibeKeys: string[];
  queuePaused: boolean;
  queueProgress: { done: number; failed: number; total: number } | null;
  currentAnlasSpent: number | null;
  lastAnlasSpent: number | null;
  statusText: string;
  lastError: string;
  toast: string;
  updateInfo: UpdateInfo | null;

  load: () => Promise<void>;
  setShowOnboarding: (value: boolean) => void;
  setShowSettings: (value: boolean) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setPromptTab: (tab: PromptTab) => void;
  setWsWidth: (edge: "left" | "right", px: number) => void;
  saveWsWidths: () => void;
  resetWsWidths: () => void;
  setParam: <K extends keyof GenerateParams>(key: K, value: GenerateParams[K]) => void;
  applyParams: (patch: Partial<GenerateParams>) => void;
  checkUpdate: () => Promise<void>;
  dismissUpdate: () => void;
  setSelectedDate: (date: string) => Promise<void>;
  setSelectedGroupId: (groupId: string) => Promise<void>;
  createHistoryGroup: (name: string) => Promise<void>;
  renameHistoryGroup: (id: string, name: string) => Promise<void>;
  deleteHistoryGroup: (id: string) => Promise<void>;
  exportHistoryGroup: (groupId: string) => Promise<void>;
  setHistoryItemGroup: (id: string, groupId?: string) => Promise<void>;
  refreshHistory: (date?: string) => Promise<void>;
  refreshSettings: () => Promise<void>;
  refreshAccount: () => Promise<AccountSummary>;
  loadWorkbenchImage: () => Promise<void>;
  loadWorkbenchFromPath: (filePath: string, options?: { silent?: boolean }) => Promise<void>;
  clearWorkbenchImage: () => Promise<void>;
  setI2IParam: <K extends keyof I2IParams>(key: K, value: I2IParams[K]) => void;
  setInpaintModel: (model: NAIInpaintModel) => void;
  setInpaintStrength: (value: number) => void;
  setInpaintNoise: (value: number) => void;
  setInpaintPositivePrompt: (value: string) => void;
  setBrushSize: (size: number) => void;
  setBrushOpacity: (opacity: number) => void;
  setBrushMode: (mode: BrushMode) => void;
  setInpaintMask: (mask: string | null) => void;
  clearInpaintMask: () => void;
  setUpscaleScale: (scale: UpscaleScale) => void;
  setDirectorTool: (tool: DirectorTool) => void;
  setAugmentOption: <K extends keyof AugmentOptions>(key: K, value: AugmentOptions[K]) => void;
  // Vibe Transfer / Precise Reference
  addVibeImage: (image: VibeTransferImage) => void;
  removeVibeImage: (id: string) => void;
  updateVibeImage: (id: string, patch: Partial<Pick<VibeTransferImage, "infoExtracted" | "strength">>) => void;
  clearVibeImages: () => void;
  addPreciseReference: (image: PreciseReferenceImage) => void;
  removePreciseReference: (id: string) => void;
  updatePreciseReference: (id: string, patch: Partial<Pick<PreciseReferenceImage, "type" | "strength" | "fidelity" | "informationExtracted">>) => void;
  clearPreciseReferences: () => void;
  // Character Prompt
  addCharCaption: () => void;
  removeCharCaption: (id: string) => void;
  updateCharCaption: (id: string, patch: Partial<Omit<CharCaption, "id">>) => void;
  clearCharCaptions: () => void;
  // Batch img2img project
  setBatchRedraw: (updater: (prev: BatchRedrawProject) => BatchRedrawProject) => void;
  resetBatchRedraw: () => void;
  setBatchRunning: (running: boolean, progress?: { done: number; total: number } | null) => void;
  // Batch + Inspect + Convert
  setBatchCount: (count: number) => void;
  setInspectImage: (url: string, meta: Record<string, string>, base64?: string, path?: string) => void;
  clearInspect: () => void;
  setReversePromptText: (text: string) => void;
  setReversePromptMode: (mode: ReversePromptMode) => void;
  setReversePromptScope: (scope: ReversePromptScope) => void;
  setReversePromptHint: (hint: string) => void;
  setReverseKnownCharacter: (known: boolean) => void;
  runReversePrompt: () => Promise<void>;
  toggleReverseQueueCollapsed: () => void;
  removeReverseJob: (id: string) => void;
  loadReverseHistory: () => Promise<void>;
  deleteReverseHistoryItem: (id: string) => Promise<void>;
  clearReverseHistory: () => Promise<void>;
  setConvertInput: (text: string) => void;
  setConvertResult: (text: string) => void;
  setConvertMode: (mode: ReversePromptMode) => void;
  setConvertKnownCharacter: (known: boolean) => void;
  runConvertPrompt: () => Promise<void>;
  toggleConvertQueueCollapsed: () => void;
  removeConvertJob: (id: string) => void;
  loadConvertHistory: () => Promise<void>;
  deleteConvertHistoryItem: (id: string) => Promise<void>;
  clearConvertHistory: () => Promise<void>;
  setToast: (message: string) => void;
  clearImageComparison: () => void;
  // Core actions
  generate: () => Promise<void>;
  enqueueGeneration: () => Promise<void>;
  removeQueueJob: (id: string) => void;
  clearQueue: () => void;
  toggleQueueCollapsed: () => void;
  generateI2I: () => Promise<void>;
  inpaint: () => Promise<void>;
  upscaleCurrentImage: () => Promise<void>;
  runDirectorTool: () => Promise<void>;
  cancel: () => Promise<void>;
  togglePause: () => void;
  selectImage: (item: HistoryItem) => void;
  variationFromImage: (item: HistoryItem) => void;
  deleteHistory: (id: string) => Promise<void>;
  dropMissingImage: (id: string) => Promise<void>;
  renameHistoryItem: (id: string, name: string) => Promise<void>;
  clearToast: () => void;
}

function requireToken(set: (state: Partial<AppState>) => void, hasToken: boolean, settings?: AppSettings | null) {
  if (hasToken) return true;
  set({ showSettings: true, statusText: storeText(settings, "status.needApiToken"), toast: storeText(settings, "toast.needApiToken") });
  return false;
}

async function refreshAfterImage(
  set: (state: Partial<AppState>) => void,
  get: () => AppState,
  item: HistoryItem,
  options: { compareBefore?: WorkingImage | null; loadWorkbench?: boolean } = {},
) {
  set({ currentImage: item, comparisonBeforeImage: options.compareBefore ?? null });
  await get().refreshHistory(item.date);
  await get().refreshAccount();
  if (options.loadWorkbench) await get().loadWorkbenchFromPath(item.filePath, { silent: true });
}

function buildExtras(state: AppState): GenerateExtras {
  return {
    vibeImages: state.vibeImages.map(({ base64, infoExtracted, strength }) => ({
      base64,
      infoExtracted,
      strength,
    })),
    preciseReferences: state.preciseReferences.map(({ base64, type, strength, fidelity }) => ({
      base64,
      type,
      strength,
      fidelity,
    })),
    charCaptions: state.charCaptions.map(({ prompt, useCoords, x, y }) => ({
      prompt,
      useCoords,
      x,
      y,
    })),
  };
}

// Identity of a vibe reference for encode-dedup, mirroring the main process cache
// key (model + information_extracted + image bytes). Used so several queued jobs
// sharing the same reference are only quoted for ONE encode.
function vibeKeyOf(model: string, vibe: { base64: string; infoExtracted: number }): string {
  return `${model}|${vibe.infoExtracted}|${vibe.base64}`;
}

function extrasVibeKeys(model: string, extras: GenerateExtras): string[] {
  return (extras.vibeImages ?? []).map((v) => vibeKeyOf(model, v));
}

function imageGenerationFailureMessage(settings: AppSettings | null | undefined, message?: string) {
  const detail = message?.trim() || storeText(settings, "error.unknown");
  return detail.includes("图片生成失败") || detail.includes("Image generation failed")
    ? detail
    : storeFormat(settings, "error.generationFailed", { detail });
}

function anlasSpent(before?: number, after?: number) {
  if (typeof before !== "number" || typeof after !== "number") return null;
  return Math.max(0, before - after);
}

function withAnlasSpent(settings: AppSettings | null | undefined, message: string, spent: number | null) {
  if (spent == null) return storeFormat(settings, "anlas.spentFailed", { message });
  return storeFormat(settings, "anlas.spent", { message, spent });
}

async function ensureAnlasBeforeRun(
  set: (state: Partial<AppState>) => void,
  request: AnlasQuoteRequest,
  actionLabel: string,
  settings?: AppSettings | null,
): Promise<AnlasQuoteResult | null> {
  const quote = await window.naiDesktop.quoteAnlas(request);
  if (!quote.ok || typeof quote.amount !== "number") {
    const message = quote.message || storeFormat(settings, "quote.readFailedTry", { action: actionLabel });
    const fallbackMessage = storeFormat(settings, "quote.readFailedTry", { action: actionLabel });
    set({ statusText: fallbackMessage, toast: message || fallbackMessage, lastError: "" });
    return {
      ok: true,
      amount: 0,
      source: "unavailable",
      balance: request.account?.anlasBalance,
      insufficient: false,
      message: message || fallbackMessage,
      details: quote.details,
    };
  }
  if (quote.insufficient) {
    const balance = quote.balance ?? storeText(settings, "error.unknown");
    const message = storeFormat(settings, "quote.insufficient", { action: actionLabel, amount: quote.amount, balance });
    set({ statusText: message, toast: message, lastError: "" });
    return quote;
  }
  set({ statusText: storeFormat(settings, "quote.deduct", { action: actionLabel, amount: quote.amount }), lastError: "" });
  return quote;
}

function buildLastGenerationState(state: AppState): LastGenerationState {
  return {
    // positivePrompt is included so it survives a restart/crash, matching the
    // mobile client (which already persists the full params unconditionally).
    params: { ...state.params },
    batchCount: state.batchCount,
    i2iParams: state.i2iParams,
    inpaintModel: state.inpaintModel,
    inpaintStrength: state.inpaintStrength,
    inpaintNoise: state.inpaintNoise,
    inpaintPositivePrompt: state.inpaintPositivePrompt,
    brushSize: state.brushSize,
    brushOpacity: state.brushOpacity,
    upscaleScale: state.upscaleScale,
    directorTool: state.directorTool,
    augmentOptions: state.augmentOptions,
  };
}

function persistGenerationState(get: () => AppState) {
  const state = get();
  if (!state.settings) return;
  void window.naiDesktop.setSetting("lastGenerationState", buildLastGenerationState(state));
}

export const useAppStore = create<AppState>((set, get) => ({
  bootDone: false,
  showOnboarding: false,
  showSettings: false,
  activeTab: "generate",
  promptTab: "positive",
  wsLeftWidth: readWsWidth("langbai.ws.left", WS_LEFT_DEFAULT),
  wsRightWidth: readWsWidth("langbai.ws.right", WS_RIGHT_DEFAULT),
  params: { ...DEFAULT_PARAMS },
  settings: null,
  account: { hasToken: false },
  history: [],
  historyDates: [],
  historyGroups: [],
  selectedDate: "",
  selectedGroupId: "",
  currentImage: null,
  workbenchImage: null,
  comparisonBeforeImage: null,
  i2iParams: { ...DEFAULT_I2I_PARAMS },
  inpaintModel: "nai-diffusion-4-5-full-inpainting",
  inpaintStrength: 1,
  inpaintNoise: 0,
  inpaintPositivePrompt: "",
  brushSize: 64,
  brushOpacity: 0.55,
  brushMode: "paint",
  inpaintMask: null,
  maskRevision: 0,
  upscaleScale: 4,
  directorTool: "bg-removal",
  augmentOptions: { ...DEFAULT_AUGMENT_OPTIONS },
  vibeImages: [],
  preciseReferences: [],
  charCaptions: [],
  batchRedraw: createDefaultBatchRedraw(),
  batchRunning: false,
  batchProgress: null,
  batchCount: 1,
  inspectImageUrl: "",
  inspectMeta: null,
  inspectImageBase64: "",
  inspectImagePath: "",
  reversePromptText: "",
  reversePromptMode: "tags" as ReversePromptMode,
  reversePromptScope: "full" as ReversePromptScope,
  reversePromptHint: "",
  reverseKnownCharacter: false,
  reversePromptVariants: null,
  reverseJobs: [],
  reverseQueueCollapsed: true,
  reverseHistory: [],
  convertInput: "",
  convertResult: "",
  convertMode: "tags" as ReversePromptMode,
  convertKnownCharacter: false,
  convertResultVariants: null,
  convertJobs: [],
  convertQueueCollapsed: true,
  convertHistory: [],
  isGenerating: false,
  isGenerateQueueRunning: false,
  activeGenerationRunId: null,
  queueAdding: false,
  generationQueue: [],
  queueCollapsed: false,
  clearQueueRequested: false,
  queueVersion: 0,
  activeVibeKeys: [],
  queuePaused: false,
  queueProgress: null,
  currentAnlasSpent: null,
  lastAnlasSpent: null,
  statusText: storeText(null, "status.ready"),
  lastError: "",
  toast: "",
  updateInfo: null,

  async load() {
    const [settings, account, firstRun, dates, groups] = await Promise.all([
      window.naiDesktop.getSettings(),
      // Cached, local-only summary — never a network call, so boot stays fast
      // even with no proxy. Live balance is refreshed after bootDone below.
      window.naiDesktop.accountCached(),
      window.naiDesktop.isFirstRun(),
      window.naiDesktop.getHistoryDates(),
      window.naiDesktop.getHistoryGroups(),
    ]);
    const selectedDate = dates[0] ?? "";
    const selectedGroupId = settings.activeHistoryGroupId ?? "";
    const history = await window.naiDesktop.getHistory(selectedDate || undefined, selectedGroupId || undefined);
    const last = settings.lastGenerationState;
    if (last) {
      set((state) => ({
        params: settings.persistGenerateParams ? { ...state.params, ...last.params } : state.params,
        batchCount: settings.persistGenerateParams
          ? Math.max(1, Math.min(16, last.batchCount ?? state.batchCount))
          : state.batchCount,
        i2iParams: settings.persistI2IParams ? { ...state.i2iParams, ...(last.i2iParams ?? {}) } : state.i2iParams,
        inpaintModel: settings.persistInpaintParams ? last.inpaintModel ?? state.inpaintModel : state.inpaintModel,
        inpaintStrength: settings.persistInpaintParams
          ? last.inpaintStrength ?? state.inpaintStrength
          : state.inpaintStrength,
        inpaintNoise: settings.persistInpaintParams ? last.inpaintNoise ?? state.inpaintNoise : state.inpaintNoise,
        inpaintPositivePrompt: settings.persistInpaintParams
          ? last.inpaintPositivePrompt ?? state.inpaintPositivePrompt
          : state.inpaintPositivePrompt,
        brushSize: settings.persistInpaintParams ? last.brushSize ?? state.brushSize : state.brushSize,
        brushOpacity: settings.persistInpaintParams ? last.brushOpacity ?? state.brushOpacity : state.brushOpacity,
        upscaleScale: settings.persistUpscaleParams ? last.upscaleScale ?? state.upscaleScale : state.upscaleScale,
        directorTool: settings.persistDirectorParams ? last.directorTool ?? state.directorTool : state.directorTool,
        augmentOptions: settings.persistDirectorParams
          ? { ...state.augmentOptions, ...(last.augmentOptions ?? {}) }
          : state.augmentOptions,
      }));
    }
    // Locks only protect fields from template/reset overwrites; persistence uses lastGenerationState.
    const restored: Partial<GenerateParams> = {};
    if (settings.lockStylePrompt) restored.stylePrompt = settings.savedStylePrompt ?? "";
    if (settings.lockNegativePrompt) restored.negativePrompt = settings.savedNegativePrompt ?? "";
    set((state) => ({ params: { ...state.params, ...restored } }));
    set({
      bootDone: true,
      settings,
      account,
      // Never let a refresh-triggered load() (e.g. the onboarding output-dir
      // step toggling a setting) close an onboarding wizard that's open: keep
      // it visible if it already is, otherwise drive it from firstRun.
      showOnboarding: firstRun || get().showOnboarding,
      historyDates: dates,
      historyGroups: groups,
      selectedDate,
      selectedGroupId,
      history,
      currentImage: history[0] ?? null,
      statusText: account.hasToken ? storeText(settings, "status.apiConfigured") : storeText(settings, "status.needApiToken"),
    });
    // Refresh the live balance off the boot path so a slow network never delays
    // the first frame (refreshAccount swallows network errors → cached/stale).
    if (account.hasToken) void get().refreshAccount();
  },

  setShowOnboarding(value) {
    set({ showOnboarding: value });
  },

  setShowSettings(value) {
    set({ showSettings: value });
  },

  setActiveTab(tab) {
    set({ activeTab: tab });
    const state = get();
    if (
      (tab === "inpaint" || tab === "upscale" || tab === "postprocess") &&
      !state.workbenchImage &&
      state.currentImage?.filePath
    ) {
      void get().loadWorkbenchFromPath(state.currentImage.filePath, { silent: true });
    }
  },

  setPromptTab(tab) {
    set({ promptTab: tab });
  },

  setWsWidth(edge, px) {
    const clamped =
      edge === "left"
        ? Math.round(Math.max(WS_LEFT_MIN, Math.min(WS_LEFT_MAX, px)))
        : Math.round(Math.max(WS_RIGHT_MIN, Math.min(WS_RIGHT_MAX, px)));
    set(edge === "left" ? { wsLeftWidth: clamped } : { wsRightWidth: clamped });
  },
  saveWsWidths() {
    const { wsLeftWidth, wsRightWidth } = get();
    try {
      localStorage.setItem("langbai.ws.left", String(wsLeftWidth));
      localStorage.setItem("langbai.ws.right", String(wsRightWidth));
    } catch {
      /* ignore persistence failure */
    }
  },
  resetWsWidths() {
    set({ wsLeftWidth: WS_LEFT_DEFAULT, wsRightWidth: WS_RIGHT_DEFAULT });
    try {
      localStorage.setItem("langbai.ws.left", String(WS_LEFT_DEFAULT));
      localStorage.setItem("langbai.ws.right", String(WS_RIGHT_DEFAULT));
    } catch {
      /* ignore persistence failure */
    }
  },

  setParam(key, value) {
    set((state) => ({ params: { ...state.params, [key]: value } }));
    persistGenerationState(get);
  },

  applyParams(patch) {
    set((state) => ({ params: { ...state.params, ...patch } }));
    persistGenerationState(get);
  },

  async checkUpdate() {
    try {
      const info = await window.naiDesktop.checkUpdate();
      set({ updateInfo: info });
    } catch {
      // silent — update check is best-effort
    }
  },

  dismissUpdate() {
    set({ updateInfo: null });
  },

  async setSelectedDate(date) {
    const history = await window.naiDesktop.getHistory(date || undefined, get().selectedGroupId || undefined);
    set({ selectedDate: date, history, currentImage: history[0] ?? get().currentImage });
  },

  async setSelectedGroupId(groupId) {
    const selectedDate = get().selectedDate;
    await window.naiDesktop.setSetting("activeHistoryGroupId", groupId);
    const history = await window.naiDesktop.getHistory(selectedDate || undefined, groupId || undefined);
    set({ selectedGroupId: groupId, history, currentImage: history[0] ?? get().currentImage });
  },

  async createHistoryGroup(name) {
    const groups = await window.naiDesktop.createHistoryGroup(name);
    const settings = get().settings;
    set({
      historyGroups: groups,
      toast: name.trim()
        ? storeFormat(settings, "group.created", { name: name.trim() })
        : storeText(settings, "group.nameRequired"),
    });
  },

  async renameHistoryGroup(id, name) {
    if (!name.trim()) return;
    const groups = await window.naiDesktop.renameHistoryGroup(id, name);
    set({ historyGroups: groups, toast: storeFormat(get().settings, "group.renamed", { name: name.trim() }) });
  },

  async deleteHistoryGroup(id) {
    const groups = await window.naiDesktop.deleteHistoryGroup(id);
    const selectedGroupId = get().selectedGroupId === id ? "" : get().selectedGroupId;
    set({ historyGroups: groups, selectedGroupId });
    await get().refreshHistory();
    set({ toast: storeText(get().settings, "group.deleted") });
  },

  async exportHistoryGroup(groupId) {
    set({ toast: storeText(get().settings, "group.packing") });
    const result = await window.naiDesktop.exportHistoryGroup(groupId);
    set({ toast: result.message });
  },

  async setHistoryItemGroup(id, groupId) {
    await window.naiDesktop.setHistoryGroup(id, groupId || undefined);
    await get().refreshHistory();
  },

  async refreshHistory(date) {
    const [dates, groups] = await Promise.all([
      window.naiDesktop.getHistoryDates(),
      window.naiDesktop.getHistoryGroups(),
    ]);
    const selectedDate = date ?? get().selectedDate ?? dates[0] ?? "";
    const selectedGroupId = get().selectedGroupId;
    const history = await window.naiDesktop.getHistory(selectedDate || undefined, selectedGroupId || undefined);
    set({ historyDates: dates, historyGroups: groups, selectedDate, history });
  },

  async refreshSettings() {
    const settings = await window.naiDesktop.getSettings();
    set({ settings });
  },

  async refreshAccount() {
    const account = await window.naiDesktop.hasToken();
    const settings = get().settings;
    set({ account, statusText: account.hasToken ? storeText(settings, "status.apiConfigured") : storeText(settings, "status.needApiToken") });
    return account;
  },

  async loadWorkbenchImage() {
    const result = await window.naiDesktop.loadImage();
    if (result.ok && result.image) {
      set({
        workbenchImage: result.image,
        comparisonBeforeImage: null,
        inpaintMask: null,
        maskRevision: get().maskRevision + 1,
        statusText: storeFormat(get().settings, "status.imageLoaded", { width: result.image.width, height: result.image.height }),
      });
    } else if (result.message) {
      set({ toast: result.message, statusText: storeText(get().settings, "status.imageLoadFailed") });
    }
  },

  async loadWorkbenchFromPath(filePath, options) {
    const result = await window.naiDesktop.loadImageFromPath(filePath);
    if (result.ok && result.image) {
      if (options?.silent) {
        set({
          workbenchImage: result.image,
          inpaintMask: null,
          maskRevision: get().maskRevision + 1,
        });
        return;
      }
      set({
        workbenchImage: result.image,
        comparisonBeforeImage: null,
        inpaintMask: null,
        maskRevision: get().maskRevision + 1,
        statusText: storeFormat(get().settings, "status.imageLoaded", { width: result.image.width, height: result.image.height }),
        toast: storeFormat(get().settings, "toast.imageLoaded", { width: result.image.width, height: result.image.height }),
      });
    } else if (result.message) {
      set({ toast: result.message, statusText: storeText(get().settings, "status.imageLoadFailed") });
    }
  },

  async clearWorkbenchImage() {
    await window.naiDesktop.clearWorkbenchImage();
    set({
      workbenchImage: null,
      comparisonBeforeImage: null,
      inpaintMask: null,
      maskRevision: get().maskRevision + 1,
      statusText: storeText(get().settings, "status.workbenchCleared"),
    });
  },

  setI2IParam(key, value) {
    set((state) => ({ i2iParams: { ...state.i2iParams, [key]: value } }));
    persistGenerationState(get);
  },

  setInpaintModel(model) {
    set({ inpaintModel: model });
    persistGenerationState(get);
  },

  setInpaintStrength(value) {
    set({ inpaintStrength: Math.max(0, Math.min(1, value)) });
    persistGenerationState(get);
  },

  setInpaintNoise(value) {
    set({ inpaintNoise: Math.max(0, Math.min(0.99, value)) });
    persistGenerationState(get);
  },

  setInpaintPositivePrompt(value) {
    set({ inpaintPositivePrompt: value });
    persistGenerationState(get);
  },

  setBrushSize(size) {
    set({ brushSize: Math.max(1, Math.min(128, size)) });
    persistGenerationState(get);
  },

  setBrushOpacity(opacity) {
    set({ brushOpacity: Math.max(0.05, Math.min(1, opacity)) });
    persistGenerationState(get);
  },

  setBrushMode(mode) {
    set({ brushMode: mode });
  },

  setInpaintMask(mask) {
    set({ inpaintMask: mask });
  },

  clearInpaintMask() {
    set({ inpaintMask: null, maskRevision: get().maskRevision + 1 });
  },

  setUpscaleScale(scale) {
    set({ upscaleScale: scale });
    persistGenerationState(get);
  },

  setDirectorTool(tool) {
    set({ directorTool: tool });
    persistGenerationState(get);
  },

  setAugmentOption(key, value) {
    set((state) => ({ augmentOptions: { ...state.augmentOptions, [key]: value } }));
    persistGenerationState(get);
  },

  // ── Vibe Transfer / Precise Reference ──────────────────────────────────────
  addVibeImage(image) {
    set((state) => ({ vibeImages: [...state.vibeImages, image] }));
  },

  removeVibeImage(id) {
    set((state) => ({ vibeImages: state.vibeImages.filter((v) => v.id !== id) }));
  },

  updateVibeImage(id, patch) {
    set((state) => ({
      vibeImages: state.vibeImages.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    }));
  },

  clearVibeImages() {
    set({ vibeImages: [] });
  },

  addPreciseReference(image) {
    set((state) => ({ preciseReferences: [...state.preciseReferences, image] }));
  },

  removePreciseReference(id) {
    set((state) => ({ preciseReferences: state.preciseReferences.filter((v) => v.id !== id) }));
  },

  updatePreciseReference(id, patch) {
    set((state) => ({
      preciseReferences: state.preciseReferences.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    }));
  },

  clearPreciseReferences() {
    set({ preciseReferences: [] });
  },

  // ── Character Prompt ───────────────────────────────────────────────────────
  addCharCaption() {
    const id = crypto.randomUUID();
    set((state) => ({
      charCaptions: [
        ...state.charCaptions,
        { id, prompt: "", useCoords: false, x: 0.5, y: 0.5 },
      ],
    }));
  },

  removeCharCaption(id) {
    set((state) => ({ charCaptions: state.charCaptions.filter((c) => c.id !== id) }));
  },

  updateCharCaption(id, patch) {
    set((state) => ({
      charCaptions: state.charCaptions.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  },

  clearCharCaptions() {
    set({ charCaptions: [] });
  },

  // ── Batch img2img project ──────────────────────────────────────────────────
  setBatchRedraw(updater) {
    set({ batchRedraw: updater(get().batchRedraw) });
  },
  resetBatchRedraw() {
    set({ batchRedraw: createDefaultBatchRedraw(get().params), batchRunning: false, batchProgress: null });
  },
  setBatchRunning(running, progress) {
    set({ batchRunning: running, batchProgress: progress === undefined ? get().batchProgress : progress });
  },

  // ── Batch + Inspect ────────────────────────────────────────────────────────
  setBatchCount(count) {
    set({ batchCount: Math.max(1, Math.min(16, count)) });
    persistGenerationState(get);
  },

  setInspectImage(url, meta, base64 = "", path = "") {
    set({
      inspectImageUrl: url,
      inspectMeta: meta,
      inspectImageBase64: base64,
      inspectImagePath: path,
      reversePromptText: "",
      reversePromptVariants: null,
    });
  },

  clearInspect() {
    set({
      inspectImageUrl: "",
      inspectMeta: null,
      inspectImageBase64: "",
      inspectImagePath: "",
      reversePromptText: "",
      reversePromptVariants: null,
    });
  },

  setReversePromptText(text) {
    set({ reversePromptText: text });
  },

  setReversePromptMode(mode) {
    set({ reversePromptMode: mode });
  },

  setReversePromptScope(scope) {
    set({ reversePromptScope: scope });
  },

  setReversePromptHint(hint) {
    set({ reversePromptHint: hint });
  },

  setReverseKnownCharacter(known) {
    set({ reverseKnownCharacter: known, reversePromptVariants: known ? get().reversePromptVariants : null });
  },

  // Concurrent — every call fires its API request immediately and updates
  // only its own job entry when it resolves, so multiple reverse requests
  // can be in flight (and the button never disables while one runs).
  async runReversePrompt() {
    const { inspectImageBase64, inspectImagePath, reversePromptMode, reversePromptScope, reversePromptHint, reverseKnownCharacter } = get();
    if (!inspectImageBase64) {
      set({ toast: storeText(get().settings, "toast.needImage") });
      return;
    }
    const job: TextToolJob = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: reversePromptHint.trim() || storeText(get().settings, "inspect.run"),
      mode: reversePromptMode,
      knownCharacter: reverseKnownCharacter,
      status: "processing",
      addedAt: Date.now(),
    };
    set({ reverseJobs: [job, ...get().reverseJobs], reversePromptVariants: null });
    const result = await window.naiDesktop.reversePrompt(
      inspectImageBase64,
      reversePromptMode,
      reversePromptScope,
      reversePromptHint,
      reverseKnownCharacter,
    );
    // "Cancel" just removes the job from the tracker (the in-flight HTTP
    // request itself isn't aborted) — but once it resolves, treat a removed
    // job as truly cancelled: no result overwrite, no toast, no history entry.
    if (!get().reverseJobs.some((j) => j.id === job.id)) return;
    if (result.ok && result.prompt) {
      set({
        reverseJobs: get().reverseJobs.map((j) =>
          j.id === job.id ? { ...j, status: "done", result: result.prompt, variants: result.variants } : j,
        ),
        reversePromptText: result.prompt,
        reversePromptVariants: result.variants ?? null,
        toast: storeText(get().settings, "toast.inspectDone"),
      });
      const historyItem: TextToolHistoryItem = {
        id: job.id,
        mode: reversePromptMode,
        knownCharacter: reverseKnownCharacter,
        input: reversePromptHint,
        sourceImagePath: inspectImagePath || undefined,
        result: result.prompt,
        variants: result.variants,
        createdAt: new Date().toISOString(),
      };
      set({ reverseHistory: [historyItem, ...get().reverseHistory] });
      void window.naiDesktop.addReverseHistoryItem(historyItem);
      setTimeout(() => get().removeReverseJob(job.id), TEXTTOOL_DONE_AUTO_DISMISS_MS);
    } else {
      set({
        reverseJobs: get().reverseJobs.map((j) => (j.id === job.id ? { ...j, status: "failed", message: result.message } : j)),
        toast: result.message,
      });
    }
  },

  toggleReverseQueueCollapsed() {
    set({ reverseQueueCollapsed: !get().reverseQueueCollapsed });
  },

  removeReverseJob(id) {
    set({ reverseJobs: get().reverseJobs.filter((j) => j.id !== id) });
  },

  async loadReverseHistory() {
    const history = await window.naiDesktop.getReverseHistory();
    set({ reverseHistory: history });
  },

  async deleteReverseHistoryItem(id) {
    set({ reverseHistory: get().reverseHistory.filter((item) => item.id !== id) });
    await window.naiDesktop.deleteReverseHistoryItem(id);
  },

  async clearReverseHistory() {
    set({ reverseHistory: [] });
    await window.naiDesktop.clearReverseHistory();
  },

  setConvertInput(text) {
    set({ convertInput: text });
  },

  setConvertResult(text) {
    set({ convertResult: text });
  },

  setConvertMode(mode) {
    set({ convertMode: mode });
  },

  setConvertKnownCharacter(known) {
    set({ convertKnownCharacter: known, convertResultVariants: known ? get().convertResultVariants : null });
  },

  // Concurrent, same reasoning as runReversePrompt.
  async runConvertPrompt() {
    const { convertInput, convertMode, convertKnownCharacter } = get();
    if (!convertInput.trim()) {
      set({ toast: storeText(get().settings, "toast.needConvertInput") });
      return;
    }
    const job: TextToolJob = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: convertInput.trim().slice(0, 60),
      mode: convertMode,
      knownCharacter: convertKnownCharacter,
      status: "processing",
      addedAt: Date.now(),
    };
    set({ convertJobs: [job, ...get().convertJobs], convertResultVariants: null });
    const result = await window.naiDesktop.convertPrompt(convertInput, convertMode, convertKnownCharacter);
    // See runReversePrompt: a removed job is treated as cancelled.
    if (!get().convertJobs.some((j) => j.id === job.id)) return;
    if (result.ok && result.result) {
      set({
        convertJobs: get().convertJobs.map((j) =>
          j.id === job.id ? { ...j, status: "done", result: result.result, variants: result.variants } : j,
        ),
        convertResult: result.result,
        convertResultVariants: result.variants ?? null,
        toast: storeText(get().settings, "toast.convertDone"),
      });
      const historyItem: TextToolHistoryItem = {
        id: job.id,
        mode: convertMode,
        knownCharacter: convertKnownCharacter,
        input: convertInput,
        result: result.result,
        variants: result.variants,
        createdAt: new Date().toISOString(),
      };
      set({ convertHistory: [historyItem, ...get().convertHistory] });
      void window.naiDesktop.addConvertHistoryItem(historyItem);
      setTimeout(() => get().removeConvertJob(job.id), TEXTTOOL_DONE_AUTO_DISMISS_MS);
    } else {
      set({
        convertJobs: get().convertJobs.map((j) => (j.id === job.id ? { ...j, status: "failed", message: result.message } : j)),
        toast: result.message,
      });
    }
  },

  toggleConvertQueueCollapsed() {
    set({ convertQueueCollapsed: !get().convertQueueCollapsed });
  },

  removeConvertJob(id) {
    set({ convertJobs: get().convertJobs.filter((j) => j.id !== id) });
  },

  async loadConvertHistory() {
    const history = await window.naiDesktop.getConvertHistory();
    set({ convertHistory: history });
  },

  async deleteConvertHistoryItem(id) {
    set({ convertHistory: get().convertHistory.filter((item) => item.id !== id) });
    await window.naiDesktop.deleteConvertHistoryItem(id);
  },

  async clearConvertHistory() {
    set({ convertHistory: [] });
    await window.naiDesktop.clearConvertHistory();
  },

  setToast(message) {
    set({ toast: message });
  },

  clearImageComparison() {
    set({ comparisonBeforeImage: null });
  },

  // ── Generation ─────────────────────────────────────────────────────────────
  async enqueueGeneration() {
    const state = get();
    if (!state.isGenerating || !state.isGenerateQueueRunning) {
      set({ toast: storeText(state.settings, "toast.noQueue") });
      return;
    }
    if (state.queueAdding) return;
    if (!state.params.positivePrompt.trim()) {
      set({ toast: storeText(state.settings, "toast.queueNeedPrompt"), statusText: storeText(state.settings, "status.missingPrompt") });
      return;
    }

    const params = { ...state.params };
    const extras = buildExtras(state);
    const runId = state.activeGenerationRunId;
    const queueVersion = state.queueVersion;
    // Vibes already covered by the active run or earlier queued jobs will only be
    // encoded once, so don't quote their 2-Anlas encode fee again.
    const coveredVibes = new Set<string>(state.activeVibeKeys);
    for (const job of state.generationQueue) {
      for (const key of extrasVibeKeys(job.params.model, job.extras)) coveredVibes.add(key);
    }
    let alreadyQueuedVibes = 0;
    const newJobSeen = new Set<string>();
    for (const key of extrasVibeKeys(params.model, extras)) {
      if (coveredVibes.has(key) || newJobSeen.has(key)) alreadyQueuedVibes += 1;
      newJobSeen.add(key);
    }
    set({ queueAdding: true });
    try {
      const freshAccount = await get().refreshAccount();
      const quote = await window.naiDesktop.quoteAnlas({
        feature: "generate",
        params,
        extras,
        batchCount: 1,
        account: freshAccount,
        alreadyQueuedVibes,
      });
      let quotedAnlas = 0;
      let quoteWarning = "";
      if (!quote.ok || typeof quote.amount !== "number") {
        quoteWarning = quote.message || storeText(get().settings, "queue.itemQuoteFailed");
      } else {
        quotedAnlas = quote.amount;
        if (quote.insufficient) {
          quoteWarning = storeFormat(get().settings, "queue.itemInsufficient", { amount: quote.amount, balance: quote.balance ?? storeText(get().settings, "error.unknown") });
        }
        const pendingQuotedAnlas = get().generationQueue.reduce((sum, job) => sum + job.quotedAnlas, 0);
        const knownBalance = quote.balance ?? freshAccount.anlasBalance;
        if (typeof knownBalance === "number" && pendingQuotedAnlas + quote.amount > knownBalance) {
          quoteWarning = storeFormat(get().settings, "queue.totalInsufficient", { pending: pendingQuotedAnlas, balance: knownBalance });
        }
      }
      if (
        !get().isGenerating ||
        !get().isGenerateQueueRunning ||
        !runId ||
        get().activeGenerationRunId !== runId ||
        get().queueVersion !== queueVersion
      ) {
        // Cancelled, superseded, or the queue was cleared while we were quoting.
        set({ toast: storeText(get().settings, "toast.queueChanged") });
        return;
      }

      const job: QueuedGenerationJob = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        params,
        extras,
        quotedAnlas,
        addedAt: Date.now(),
        label: params.positivePrompt.trim().slice(0, 60) || storeText(get().settings, "queue.noPromptLabel"),
      };
      set((current) => ({
        generationQueue: [...current.generationQueue, job],
        queueProgress: current.queueProgress
          ? { ...current.queueProgress, total: current.queueProgress.total + 1 }
          : { done: 0, failed: 0, total: 1 },
        statusText: storeFormat(current.settings, "queue.addedStatus", { count: current.generationQueue.length + 1 }),
        toast: quoteWarning || storeFormat(current.settings, "toast.queueAdded", { amount: quotedAnlas }),
        lastError: "",
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ toast: storeFormat(get().settings, "toast.queueAddFailed", { message }), lastError: message });
    } finally {
      set({ queueAdding: false });
    }
  },

  removeQueueJob(id) {
    set((current) => {
      if (!current.generationQueue.some((job) => job.id === id)) return {};
      const generationQueue = current.generationQueue.filter((job) => job.id !== id);
      // Shrink the total so progress stays accurate, but never below what's done.
      const queueProgress = current.queueProgress
        ? {
            ...current.queueProgress,
            total: Math.max(
              current.queueProgress.done + current.queueProgress.failed,
              current.queueProgress.total - 1,
            ),
          }
        : current.queueProgress;
      return { generationQueue, queueProgress, toast: storeText(current.settings, "toast.queueRemoved") };
    });
  },

  clearQueue() {
    set((current) => {
      // Drop all manually-queued jobs, and signal the run loop to skip the rest
      // of the initial batch. Shrink total to "everything done + the running one"
      // so the panel shows 0 排队.
      const running = current.isGenerating ? 1 : 0;
      const queueProgress = current.queueProgress
        ? {
            ...current.queueProgress,
            total: current.queueProgress.done + current.queueProgress.failed + running,
          }
        : current.queueProgress;
      return {
        generationQueue: [],
        clearQueueRequested: current.isGenerating,
        queueVersion: current.queueVersion + 1, // invalidate any in-flight enqueue quote
        queueProgress,
        toast: current.isGenerating ? storeText(current.settings, "toast.queueClearedStop") : storeText(current.settings, "toast.queueCleared"),
      };
    });
  },

  toggleQueueCollapsed() {
    set((current) => ({ queueCollapsed: !current.queueCollapsed }));
  },

  async generate() {
    const state = get();
    if (!requireToken(set, state.account.hasToken, state.settings)) return;
    if (!state.params.positivePrompt.trim()) {
      set({ toast: storeText(state.settings, "toast.needPrompt"), statusText: storeText(state.settings, "status.missingPrompt") });
      return;
    }
    const initialTotal = Math.max(1, state.batchCount);
    const initialParams = { ...state.params };
    const initialExtras = buildExtras(state);
    const initialSeed = initialParams.seed;
    // Instant feedback: enter the generating state BEFORE the balance refresh and
    // price quote (two network round-trips). Without this the button looks frozen
    // for a second or two after a click. A cancel during prep clears the run id,
    // which we honor below so the click can still be aborted.
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set({
      isGenerating: true,
      isGenerateQueueRunning: true,
      activeGenerationRunId: runId,
      statusText: storeText(state.settings, "status.preparing"),
    });
    const freshAccount = await get().refreshAccount();
    if (get().activeGenerationRunId !== runId) return; // cancelled during prep
    const quote = await ensureAnlasBeforeRun(
      set,
      {
        feature: "generate",
        params: initialParams,
        extras: initialExtras,
        batchCount: initialTotal,
        account: freshAccount,
      },
      initialTotal > 1
        ? storeFormat(state.settings, "action.batchGenerate", { count: initialTotal })
        : storeText(state.settings, "action.generateImage"),
      state.settings,
    );
    if (!quote || get().activeGenerationRunId !== runId) {
      if (get().activeGenerationRunId === runId) {
        set({ isGenerating: false, isGenerateQueueRunning: false, activeGenerationRunId: null });
      }
      return;
    }
    const anlasBefore = freshAccount.anlasBalance;
    set({
      isGenerating: true,
      isGenerateQueueRunning: true,
      activeGenerationRunId: runId,
      queueAdding: false,
      generationQueue: [],
      clearQueueRequested: false,
      activeVibeKeys: extrasVibeKeys(initialParams.model, initialExtras),
      queuePaused: false,
      queueProgress: { done: 0, failed: 0, total: initialTotal },
      comparisonBeforeImage: null,
      currentAnlasSpent: null,
      lastAnlasSpent: null,
      lastError: "",
      statusText:
        initialTotal > 1
          ? storeFormat(state.settings, "generate.batchQuoteStatus", { total: initialTotal, amount: quote.amount })
          : storeFormat(state.settings, "generate.quoteStatus", { amount: quote.amount }),
    });

    let completed = 0;
    let failed = 0;
    let lastError = "";
    let initialIndex = 0;
    let skipInitial = false;
    while ((!skipInitial && initialIndex < initialTotal) || get().generationQueue.length > 0 || get().queueAdding) {
      if (!get().isGenerating || get().activeGenerationRunId !== runId) break; // cancelled or superseded
      // 清空排队: stop pulling remaining initial-batch images (queue already cleared).
      if (get().clearQueueRequested) {
        skipInitial = true;
        set({ clearQueueRequested: false });
      }
      // Honor pause: hold here until resumed or cancelled.
      while (get().queuePaused && get().isGenerating && get().activeGenerationRunId === runId) {
        const progressTotal = get().queueProgress?.total ?? initialTotal;
        set({ statusText: storeFormat(get().settings, "status.paused", { done: completed + failed, total: progressTotal }) });
        await new Promise((r) => setTimeout(r, 250));
      }
      if (!get().isGenerating || get().activeGenerationRunId !== runId) break;

      let base: GenerateParams;
      let extras: GenerateExtras;
      if (!skipInitial && initialIndex < initialTotal) {
        base = initialParams;
        extras = initialExtras;
        base = {
          ...base,
          seed: initialSeed > 0 ? initialSeed + initialIndex : 0,
        };
        initialIndex++;
      } else {
        const queued = get().generationQueue[0];
        if (!queued && get().queueAdding) {
          set({ statusText: storeText(get().settings, "status.waitingQueueQuote") });
          await new Promise((resolve) => setTimeout(resolve, 100));
          continue;
        }
        if (!queued) break;
        base = queued.params;
        extras = queued.extras;
        set((current) => ({ generationQueue: current.generationQueue.slice(1) }));
      }

      const progressTotal = get().queueProgress?.total ?? initialTotal;
      const currentNumber = completed + failed + 1;
      set({
        statusText: storeFormat(get().settings, "status.generatingProgress", {
          current: currentNumber,
          total: progressTotal,
          done: completed,
          failed,
          waiting: get().generationQueue.length,
        }),
      });
      const currentParams = {
        ...base,
        // Expand {a|b|c} wildcards independently per image so batches vary.
        positivePrompt: expandWildcards(base.positivePrompt),
        negativePrompt: expandWildcards(base.negativePrompt),
      };

      // No renderer-side resend: a failed generate POST may already have produced
      // and charged for an image on NovelAI's side, so resending here risked
      // double-charging (up to 8 paid POSTs per image when stacked on the old
      // main-process retry). The main process now retries only pre-charge 429s.
      const result = await window.naiDesktop.generate(currentParams, extras);
      if (get().activeGenerationRunId !== runId) return;

      if (result.ok && result.items.length > 0) {
        completed++;
        const current = result.items[0];
        set({ params: { ...get().params, seed: result.actualSeed ?? current.actualSeed } });
        await refreshAfterImage(set, get, current);
        const currentSpent = anlasSpent(anlasBefore, get().account.anlasBalance);
        set({ currentAnlasSpent: currentSpent });
      } else {
        // Skip the failed image and continue the batch instead of aborting.
        failed++;
        lastError = result.message;
      }
      set((current) => ({
        queueProgress: {
          done: completed,
          failed,
          total: current.queueProgress?.total ?? initialTotal,
        },
      }));
    }

    const cancelled = !get().isGenerating;
    const finalAccount = await get().refreshAccount();
    if (get().activeGenerationRunId !== runId) return;
    const spent = anlasSpent(anlasBefore, finalAccount.anlasBalance);
    const settings = get().settings;
    const spentText = spent != null
      ? storeFormat(settings, "generate.spent", { spent })
      : storeText(settings, "generate.spentFailed");
    const finalMsg =
      cancelled
        ? storeFormat(settings, "generate.cancelled", { spent: spentText })
        : failed > 0 && completed === 0
          ? imageGenerationFailureMessage(settings, lastError)
          : failed > 0
            ? storeFormat(settings, "generate.doneFailed", { done: completed, failed, spent: spentText, error: lastError || storeText(settings, "error.unknown") })
            : completed > 1
              ? storeFormat(settings, "generate.batchDone", { done: completed, spent: spentText })
              : storeFormat(settings, "generate.singleDone", { spent: spentText });
    set({
      isGenerating: false,
      isGenerateQueueRunning: false,
      activeGenerationRunId: null,
      queueAdding: false,
      generationQueue: [],
      queuePaused: false,
      currentAnlasSpent: null,
      lastAnlasSpent: spent,
      lastError: cancelled ? "" : failed > 0 ? lastError : "",
      statusText: finalMsg,
      toast: finalMsg,
    });
  },

  async generateI2I() {
    const state = get();
    if (!requireToken(set, state.account.hasToken, state.settings)) return;
    if (!state.workbenchImage) {
      set({ toast: storeText(state.settings, "toast.needReference"), statusText: storeText(state.settings, "status.needImage") });
      return;
    }
    const freshAccount = await get().refreshAccount();
    const quote = await ensureAnlasBeforeRun(
      set,
      {
        feature: "i2i",
        params: state.params,
        extras: buildExtras(state),
        i2iParams: state.i2iParams,
        account: freshAccount,
      },
      storeText(state.settings, "action.i2i"),
      state.settings,
    );
    if (!quote) return;
    const anlasBefore = freshAccount.anlasBalance;
    set({
      isGenerating: true,
      currentAnlasSpent: null,
      lastAnlasSpent: null,
      lastError: "",
      statusText: storeFormat(state.settings, "i2i.status", { amount: quote.amount }),
    });
    const result = await window.naiDesktop.generateI2I(state.params, state.i2iParams, buildExtras(state));
    if (result.ok && result.items.length > 0) {
      const current = result.items[0];
      await refreshAfterImage(set, get, current, { compareBefore: state.workbenchImage });
      const spent = anlasSpent(anlasBefore, get().account.anlasBalance);
      const message = withAnlasSpent(get().settings, result.message, spent);
      set({ isGenerating: false, currentAnlasSpent: null, lastAnlasSpent: spent, statusText: message, toast: message });
    } else {
      const finalAccount = await get().refreshAccount();
      const spent = anlasSpent(anlasBefore, finalAccount.anlasBalance);
      const message = withAnlasSpent(get().settings, result.message, spent);
      set({ isGenerating: false, currentAnlasSpent: null, lastAnlasSpent: spent, lastError: message, statusText: storeText(get().settings, "status.i2iFailed"), toast: message });
    }
  },

  async inpaint() {
    const state = get();
    if (!requireToken(set, state.account.hasToken, state.settings)) return;
    if (!state.workbenchImage) {
      set({ toast: storeText(state.settings, "toast.needOriginal"), statusText: storeText(state.settings, "status.needOriginal") });
      return;
    }
    if (!state.inpaintMask) {
      set({ toast: storeText(state.settings, "toast.needMask"), statusText: storeText(state.settings, "status.needMask") });
      return;
    }
    // Inpaint keeps its own independent positive prompt (state.inpaintPositivePrompt)
    // instead of reusing params.positivePrompt — the rest of params (size, sampler,
    // negative prompt, etc.) is still shared with the main generate/i2i params.
    const inpaintParams: GenerateParams = { ...state.params, positivePrompt: state.inpaintPositivePrompt };
    const freshAccount = await get().refreshAccount();
    const quote = await ensureAnlasBeforeRun(
      set,
      {
        feature: "inpaint",
        params: inpaintParams,
        inpaintModel: state.inpaintModel,
        inpaintStrength: state.inpaintStrength,
        inpaintNoise: state.inpaintNoise,
        maskBase64: state.inpaintMask,
        image: { width: state.workbenchImage.width, height: state.workbenchImage.height },
        account: freshAccount,
      },
      storeText(state.settings, "action.inpaint"),
      state.settings,
    );
    if (!quote) return;
    const anlasBefore = freshAccount.anlasBalance;
    set({
      isGenerating: true,
      currentAnlasSpent: null,
      lastAnlasSpent: null,
      lastError: "",
      statusText: storeFormat(state.settings, "inpaint.status", { amount: quote.amount }),
    });
    const result = await window.naiDesktop.inpaint(
      inpaintParams,
      state.inpaintModel,
      state.inpaintMask,
      state.inpaintStrength,
      state.inpaintNoise,
    );
    if (result.ok && result.items.length > 0) {
      const current = result.items[0];
      await refreshAfterImage(set, get, current, { compareBefore: state.workbenchImage, loadWorkbench: true });
      const spent = anlasSpent(anlasBefore, get().account.anlasBalance);
      const message = withAnlasSpent(get().settings, result.message, spent);
      set({ isGenerating: false, currentAnlasSpent: null, lastAnlasSpent: spent, statusText: message, toast: message });
    } else {
      const finalAccount = await get().refreshAccount();
      const spent = anlasSpent(anlasBefore, finalAccount.anlasBalance);
      const message = withAnlasSpent(get().settings, result.message, spent);
      set({ isGenerating: false, currentAnlasSpent: null, lastAnlasSpent: spent, lastError: message, statusText: storeText(get().settings, "status.inpaintFailed"), toast: message });
    }
  },

  async upscaleCurrentImage() {
    const state = get();
    if (!requireToken(set, state.account.hasToken, state.settings)) return;
    if (!state.workbenchImage) {
      set({ toast: storeText(state.settings, "toast.needLoadedImage"), statusText: storeText(state.settings, "status.needImage") });
      return;
    }
    const freshAccount = await get().refreshAccount();
    const quote = await ensureAnlasBeforeRun(
      set,
      {
        feature: "upscale",
        upscaleScale: state.upscaleScale,
        image: { width: state.workbenchImage.width, height: state.workbenchImage.height },
        account: freshAccount,
      },
      storeFormat(state.settings, "action.upscale", { scale: state.upscaleScale }),
      state.settings,
    );
    if (!quote) return;
    const anlasBefore = freshAccount.anlasBalance;
    set({
      isGenerating: true,
      currentAnlasSpent: null,
      lastAnlasSpent: null,
      lastError: "",
      statusText: storeFormat(state.settings, "upscale.status", { scale: state.upscaleScale, amount: quote.amount }),
    });
    const result = await window.naiDesktop.upscaleImage(state.upscaleScale);
    if (result.ok && result.item) {
      await refreshAfterImage(set, get, result.item, { compareBefore: state.workbenchImage });
      const spent = anlasSpent(anlasBefore, get().account.anlasBalance);
      const message = withAnlasSpent(get().settings, result.message, spent);
      set({ isGenerating: false, currentAnlasSpent: null, lastAnlasSpent: spent, statusText: message, toast: message });
    } else {
      const finalAccount = await get().refreshAccount();
      const spent = anlasSpent(anlasBefore, finalAccount.anlasBalance);
      const message = withAnlasSpent(get().settings, result.message, spent);
      set({ isGenerating: false, currentAnlasSpent: null, lastAnlasSpent: spent, lastError: message, statusText: storeText(get().settings, "status.upscaleFailed"), toast: message });
    }
  },

  async runDirectorTool() {
    const state = get();
    if (!requireToken(set, state.account.hasToken, state.settings)) return;
    if (!state.workbenchImage) {
      set({ toast: storeText(state.settings, "toast.needLoadedImage"), statusText: storeText(state.settings, "status.needImage") });
      return;
    }
    const freshAccount = await get().refreshAccount();
    const quote = await ensureAnlasBeforeRun(
      set,
      {
        feature: "director",
        directorTool: state.directorTool,
        image: { width: state.workbenchImage.width, height: state.workbenchImage.height },
        account: freshAccount,
      },
      storeText(state.settings, "action.postprocess"),
      state.settings,
    );
    if (!quote) return;
    const anlasBefore = freshAccount.anlasBalance;
    set({
      isGenerating: true,
      currentAnlasSpent: null,
      lastAnlasSpent: null,
      lastError: "",
      statusText: storeFormat(state.settings, "post.status", { tool: state.directorTool, amount: quote.amount }),
    });
    const result = await window.naiDesktop.augmentImage(state.directorTool, state.augmentOptions);
    if (result.ok && result.items.length > 0) {
      const current = result.items[0];
      await refreshAfterImage(set, get, current, { compareBefore: state.workbenchImage });
      const spent = anlasSpent(anlasBefore, get().account.anlasBalance);
      const message = withAnlasSpent(get().settings, result.message, spent);
      set({ isGenerating: false, currentAnlasSpent: null, lastAnlasSpent: spent, statusText: message, toast: message });
    } else {
      const finalAccount = await get().refreshAccount();
      const spent = anlasSpent(anlasBefore, finalAccount.anlasBalance);
      const message = withAnlasSpent(get().settings, result.message, spent);
      set({ isGenerating: false, currentAnlasSpent: null, lastAnlasSpent: spent, lastError: message, statusText: storeText(get().settings, "status.postFailed"), toast: message });
    }
  },

  async cancel() {
    const wasGenerateQueue = get().isGenerateQueueRunning;
    set((current) => ({
      isGenerating: false,
      isGenerateQueueRunning: false,
      activeGenerationRunId: null,
      queueAdding: false,
      generationQueue: [],
      queueVersion: current.queueVersion + 1, // invalidate any in-flight enqueue quote
      queuePaused: false,
      queueProgress: null,
      currentAnlasSpent: null,
      statusText: wasGenerateQueue ? storeText(current.settings, "status.cancelGenerate") : storeText(current.settings, "status.cancelOperation"),
    }));
    await window.naiDesktop.cancel();
    if (!get().isGenerating) {
      set({ statusText: wasGenerateQueue ? storeText(get().settings, "status.cancelGenerateDone") : storeText(get().settings, "status.cancelOperationDone") });
    }
  },

  togglePause() {
    if (!get().isGenerating) return;
    set({ queuePaused: !get().queuePaused });
  },

  selectImage(item) {
    set({ currentImage: item, comparisonBeforeImage: null, statusText: storeFormat(get().settings, "status.historySelected", { date: item.date }) });
    void get().loadWorkbenchFromPath(item.filePath);
  },

  variationFromImage(item) {
    // Load this image's exact params and LOCK its seed, then jump to generate so
    // the user can tweak one tag and reroll a variation on the same seed.
    const seed = item.actualSeed || item.params?.seed || 0;
    set((state) => ({
      params: { ...state.params, ...item.params, seed },
      activeTab: "generate",
      currentImage: item,
      comparisonBeforeImage: null,
      toast: seed > 0
        ? storeFormat(state.settings, "toast.paramsLoadedSeed", { seed })
        : storeText(state.settings, "toast.paramsLoaded"),
    }));
  },

  async deleteHistory(id) {
    await window.naiDesktop.deleteHistory(id);
    await get().refreshHistory();
    const current = get().currentImage;
    if (current?.id === id) set({ currentImage: get().history[0] ?? null, comparisonBeforeImage: null });
  },

  // Called when a thumbnail/preview fails to load because its file was deleted
  // or moved on disk. The main process re-checks existence before dropping the
  // record (never deletes a present file), so this is safe to fire on any load
  // error — the image simply disappears from the library instead of showing
  // a broken placeholder.
  async dropMissingImage(id) {
    const removed = await window.naiDesktop.pruneMissingHistoryItem(id);
    if (!removed) return;
    await get().refreshHistory();
    const current = get().currentImage;
    if (current?.id === id) set({ currentImage: get().history[0] ?? null, comparisonBeforeImage: null });
  },

  async renameHistoryItem(id, name) {
    const res = await window.naiDesktop.renameHistoryItem(id, name);
    if (!res.ok) {
      set({ toast: res.message ?? storeText(get().settings, "toast.renameFailed") });
      return;
    }
    await get().refreshHistory();
    const current = get().currentImage;
    if (current?.id === id && res.item) set({ currentImage: res.item });
    set({ toast: storeText(get().settings, "toast.renamed") });
  },

  clearToast() {
    set({ toast: "" });
  },
}));
