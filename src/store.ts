import { create } from "zustand";
import type {
  AccountSummary,
  AnlasQuoteRequest,
  AnlasQuoteResult,
  AppSettings,
  AugmentOptions,
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
  UpdateInfo,
  UpscaleScale,
  VibeTransferImage,
  PreciseReferenceImage,
  WorkingImage,
} from "./types";
import { DEFAULT_AUGMENT_OPTIONS, DEFAULT_I2I_PARAMS, DEFAULT_PARAMS } from "./types";
import { expandWildcards } from "./wildcards";

type ActiveTab = "generate" | "inpaint" | "upscale" | "postprocess" | "inspect" | "convert" | "tools" | "records";
type PromptTab = "positive" | "negative";
type BrushMode = "paint" | "erase";

interface QueuedGenerationJob {
  params: GenerateParams;
  extras: GenerateExtras;
  quotedAnlas: number;
}

interface AppState {
  bootDone: boolean;
  showOnboarding: boolean;
  showSettings: boolean;
  activeTab: ActiveTab;
  promptTab: PromptTab;
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
  batchCount: number;
  inspectImageUrl: string;
  inspectMeta: Record<string, string> | null;
  inspectImageBase64: string;
  reversePromptText: string;
  reversePromptMode: ReversePromptMode;
  reversePromptScope: ReversePromptScope;
  reversePromptHint: string;
  reverseKnownCharacter: boolean;
  reversePromptVariants: PromptVariants | null;
  reversePrompting: boolean;
  convertInput: string;
  convertResult: string;
  convertMode: ReversePromptMode;
  convertKnownCharacter: boolean;
  convertResultVariants: PromptVariants | null;
  converting: boolean;
  isGenerating: boolean;
  isGenerateQueueRunning: boolean;
  activeGenerationRunId: string | null;
  queueAdding: boolean;
  generationQueue: QueuedGenerationJob[];
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
  updatePreciseReference: (id: string, patch: Partial<Pick<PreciseReferenceImage, "type" | "strength" | "fidelity">>) => void;
  clearPreciseReferences: () => void;
  // Character Prompt
  addCharCaption: () => void;
  removeCharCaption: (id: string) => void;
  updateCharCaption: (id: string, patch: Partial<Omit<CharCaption, "id">>) => void;
  clearCharCaptions: () => void;
  // Batch + Inspect + Convert
  setBatchCount: (count: number) => void;
  setInspectImage: (url: string, meta: Record<string, string>, base64?: string) => void;
  clearInspect: () => void;
  setReversePromptText: (text: string) => void;
  setReversePromptMode: (mode: ReversePromptMode) => void;
  setReversePromptScope: (scope: ReversePromptScope) => void;
  setReversePromptHint: (hint: string) => void;
  setReverseKnownCharacter: (known: boolean) => void;
  runReversePrompt: () => Promise<void>;
  setConvertInput: (text: string) => void;
  setConvertResult: (text: string) => void;
  setConvertMode: (mode: ReversePromptMode) => void;
  setConvertKnownCharacter: (known: boolean) => void;
  runConvertPrompt: () => Promise<void>;
  setToast: (message: string) => void;
  clearImageComparison: () => void;
  // Core actions
  generate: () => Promise<void>;
  enqueueGeneration: () => Promise<void>;
  generateI2I: () => Promise<void>;
  inpaint: () => Promise<void>;
  upscaleCurrentImage: () => Promise<void>;
  runDirectorTool: () => Promise<void>;
  cancel: () => Promise<void>;
  togglePause: () => void;
  selectImage: (item: HistoryItem) => void;
  variationFromImage: (item: HistoryItem) => void;
  deleteHistory: (id: string) => Promise<void>;
  renameHistoryItem: (id: string, name: string) => Promise<void>;
  clearToast: () => void;
}

function requireToken(set: (state: Partial<AppState>) => void, hasToken: boolean) {
  if (hasToken) return true;
  set({ showSettings: true, statusText: "请先设置 API Token", toast: "请先在设置中配置 API Token。" });
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

function imageGenerationFailureMessage(message?: string) {
  const detail = message?.trim() || "未知错误";
  return detail.includes("图片生成失败") ? detail : `图片生成失败：${detail}`;
}

function anlasSpent(before?: number, after?: number) {
  if (typeof before !== "number" || typeof after !== "number") return null;
  return Math.max(0, before - after);
}

function withAnlasSpent(message: string, spent: number | null) {
  if (spent == null) return `${message} 实扣读取失败，请刷新积分确认。`;
  return `${message} 实扣 ${spent} Anlas。`;
}

async function ensureAnlasBeforeRun(
  set: (state: Partial<AppState>) => void,
  request: AnlasQuoteRequest,
  actionLabel: string,
): Promise<AnlasQuoteResult | null> {
  const quote = await window.naiDesktop.quoteAnlas(request);
  if (!quote.ok || typeof quote.amount !== "number") {
    const message = quote.message || `${actionLabel}扣费读取失败，请稍后重试。`;
    set({ statusText: "无法读取生成前扣费", toast: message, lastError: message });
    return null;
  }
  if (quote.insufficient) {
    const balance = quote.balance ?? "未知";
    const message = `${actionLabel}需要 ${quote.amount} Anlas，当前余额 ${balance} Anlas，已阻止执行。`;
    set({ statusText: "Anlas 余额不足", toast: message, lastError: message });
    return null;
  }
  set({ statusText: `${actionLabel}将在执行前扣除 ${quote.amount} Anlas。`, lastError: "" });
  return quote;
}

function buildLastGenerationState(state: AppState): LastGenerationState {
  return {
    params: { ...state.params, positivePrompt: "" },
    batchCount: state.batchCount,
    i2iParams: state.i2iParams,
    inpaintModel: state.inpaintModel,
    inpaintStrength: state.inpaintStrength,
    inpaintNoise: state.inpaintNoise,
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
  batchCount: 1,
  inspectImageUrl: "",
  inspectMeta: null,
  inspectImageBase64: "",
  reversePromptText: "",
  reversePromptMode: "tags" as ReversePromptMode,
  reversePromptScope: "full" as ReversePromptScope,
  reversePromptHint: "",
  reverseKnownCharacter: false,
  reversePromptVariants: null,
  reversePrompting: false,
  convertInput: "",
  convertResult: "",
  convertMode: "tags" as ReversePromptMode,
  convertKnownCharacter: false,
  convertResultVariants: null,
  converting: false,
  isGenerating: false,
  isGenerateQueueRunning: false,
  activeGenerationRunId: null,
  queueAdding: false,
  generationQueue: [],
  queuePaused: false,
  queueProgress: null,
  currentAnlasSpent: null,
  lastAnlasSpent: null,
  statusText: "就绪",
  lastError: "",
  toast: "",
  updateInfo: null,

  async load() {
    const [settings, account, firstRun, dates, groups] = await Promise.all([
      window.naiDesktop.getSettings(),
      window.naiDesktop.hasToken(),
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
        params: { ...state.params, ...last.params, positivePrompt: "" },
        batchCount: Math.max(1, Math.min(16, last.batchCount ?? state.batchCount)),
        i2iParams: { ...state.i2iParams, ...(last.i2iParams ?? {}) },
        inpaintModel: last.inpaintModel ?? state.inpaintModel,
        inpaintStrength: last.inpaintStrength ?? state.inpaintStrength,
        inpaintNoise: last.inpaintNoise ?? state.inpaintNoise,
        brushSize: last.brushSize ?? state.brushSize,
        brushOpacity: last.brushOpacity ?? state.brushOpacity,
        upscaleScale: last.upscaleScale ?? state.upscaleScale,
        directorTool: last.directorTool ?? state.directorTool,
        augmentOptions: { ...state.augmentOptions, ...(last.augmentOptions ?? {}) },
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
      showOnboarding: firstRun,
      historyDates: dates,
      historyGroups: groups,
      selectedDate,
      selectedGroupId,
      history,
      currentImage: history[0] ?? null,
      statusText: account.hasToken ? "API 已配置" : "请先设置 API Token",
    });
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

  setParam(key, value) {
    set((state) => ({ params: { ...state.params, [key]: value } }));
    if (key !== "positivePrompt") persistGenerationState(get);
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
    set({ historyGroups: groups, toast: name.trim() ? `已创建分组：${name.trim()}` : "分组名称不能为空" });
  },

  async renameHistoryGroup(id, name) {
    if (!name.trim()) return;
    const groups = await window.naiDesktop.renameHistoryGroup(id, name);
    set({ historyGroups: groups, toast: `已重命名分组：${name.trim()}` });
  },

  async deleteHistoryGroup(id) {
    const groups = await window.naiDesktop.deleteHistoryGroup(id);
    const selectedGroupId = get().selectedGroupId === id ? "" : get().selectedGroupId;
    set({ historyGroups: groups, selectedGroupId });
    await get().refreshHistory();
    set({ toast: "已删除分组（图片已转为未分组）" });
  },

  async exportHistoryGroup(groupId) {
    set({ toast: "正在打包分组..." });
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
    set({ account, statusText: account.hasToken ? "API 已配置" : "请先设置 API Token" });
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
        statusText: `已加载图片：${result.image.width}×${result.image.height}`,
      });
    } else if (result.message) {
      set({ toast: result.message, statusText: "加载图片失败" });
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
        statusText: `已加载图片：${result.image.width}×${result.image.height}`,
        toast: `已加载：${result.image.width}×${result.image.height}`,
      });
    } else if (result.message) {
      set({ toast: result.message, statusText: "加载图片失败" });
    }
  },

  async clearWorkbenchImage() {
    await window.naiDesktop.clearWorkbenchImage();
    set({
      workbenchImage: null,
      comparisonBeforeImage: null,
      inpaintMask: null,
      maskRevision: get().maskRevision + 1,
      statusText: "已清除工作台图片",
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

  // ── Batch + Inspect ────────────────────────────────────────────────────────
  setBatchCount(count) {
    set({ batchCount: Math.max(1, Math.min(16, count)) });
    persistGenerationState(get);
  },

  setInspectImage(url, meta, base64 = "") {
    set({ inspectImageUrl: url, inspectMeta: meta, inspectImageBase64: base64, reversePromptText: "", reversePromptVariants: null });
  },

  clearInspect() {
    set({ inspectImageUrl: "", inspectMeta: null, inspectImageBase64: "", reversePromptText: "", reversePromptVariants: null });
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

  async runReversePrompt() {
    const { inspectImageBase64, reversePromptMode, reversePromptScope, reversePromptHint, reverseKnownCharacter } = get();
    if (!inspectImageBase64) {
      set({ toast: "请先选择图片。" });
      return;
    }
    set({ reversePrompting: true, reversePromptVariants: null });
    const result = await window.naiDesktop.reversePrompt(
      inspectImageBase64,
      reversePromptMode,
      reversePromptScope,
      reversePromptHint,
      reverseKnownCharacter,
    );
    set({ reversePrompting: false });
    if (result.ok && result.prompt) {
      set({ reversePromptText: result.prompt, reversePromptVariants: result.variants ?? null, toast: "反推完成！" });
    } else {
      set({ toast: result.message });
    }
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

  async runConvertPrompt() {
    const { convertInput, convertMode, convertKnownCharacter } = get();
    if (!convertInput.trim()) {
      set({ toast: "请先输入描述文字。" });
      return;
    }
    set({ converting: true, convertResultVariants: null });
    const result = await window.naiDesktop.convertPrompt(convertInput, convertMode, convertKnownCharacter);
    set({ converting: false });
    if (result.ok && result.result) {
      set({ convertResult: result.result, convertResultVariants: result.variants ?? null, toast: "转换完成！" });
    } else {
      set({ toast: result.message });
    }
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
      set({ toast: "当前没有正在执行的生图队列。" });
      return;
    }
    if (state.queueAdding) return;
    if (!state.params.positivePrompt.trim()) {
      set({ toast: "请输入正面提示词后再加入队列。", statusText: "缺少提示词" });
      return;
    }

    const params = { ...state.params };
    const extras = buildExtras(state);
    const runId = state.activeGenerationRunId;
    set({ queueAdding: true });
    try {
      const freshAccount = await get().refreshAccount();
      const quote = await window.naiDesktop.quoteAnlas({
        feature: "generate",
        params,
        extras,
        batchCount: 1,
        account: freshAccount,
      });
      if (!quote.ok || typeof quote.amount !== "number") {
        const message = quote.message || "无法读取这张队列图片的生成前扣费。";
        set({ toast: message, lastError: message });
        return;
      }
      if (quote.insufficient) {
        const message = `这张图片需要 ${quote.amount} Anlas，当前余额 ${quote.balance ?? "未知"} Anlas，未加入队列。`;
        set({ toast: message, lastError: message });
        return;
      }
      const pendingQuotedAnlas = get().generationQueue.reduce((sum, job) => sum + job.quotedAnlas, 0);
      const knownBalance = quote.balance ?? freshAccount.anlasBalance;
      if (typeof knownBalance === "number" && pendingQuotedAnlas + quote.amount > knownBalance) {
        const message = `队列中待生成图片预计还需 ${pendingQuotedAnlas} Anlas；加入本张后将超过当前余额 ${knownBalance} Anlas，未加入队列。`;
        set({ toast: message, lastError: message });
        return;
      }
      if (
        !get().isGenerating ||
        !get().isGenerateQueueRunning ||
        !runId ||
        get().activeGenerationRunId !== runId
      ) {
        set({ toast: "当前图片已经生成完毕，请重新点击生成。" });
        return;
      }

      const job: QueuedGenerationJob = {
        params,
        extras,
        quotedAnlas: quote.amount,
      };
      set((current) => ({
        generationQueue: [...current.generationQueue, job],
        queueProgress: current.queueProgress
          ? { ...current.queueProgress, total: current.queueProgress.total + 1 }
          : { done: 0, failed: 0, total: 1 },
        statusText: `已加入队列，等待 ${current.generationQueue.length + 1} 张。`,
        toast: `已加入队列，生成前报价 ${quote.amount} Anlas。`,
        lastError: "",
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ toast: `加入队列失败：${message}`, lastError: message });
    } finally {
      set({ queueAdding: false });
    }
  },

  async generate() {
    const state = get();
    if (!requireToken(set, state.account.hasToken)) return;
    if (!state.params.positivePrompt.trim()) {
      set({ toast: "请输入正面提示词。", statusText: "缺少提示词" });
      return;
    }
    const initialTotal = Math.max(1, state.batchCount);
    const initialParams = { ...state.params };
    const initialExtras = buildExtras(state);
    const initialSeed = initialParams.seed;
    const freshAccount = await get().refreshAccount();
    const quote = await ensureAnlasBeforeRun(
      set,
      {
        feature: "generate",
        params: initialParams,
        extras: initialExtras,
        batchCount: initialTotal,
        account: freshAccount,
      },
      initialTotal > 1 ? `批量生成 ${initialTotal} 张` : "生成图片",
    );
    if (!quote) return;
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const anlasBefore = freshAccount.anlasBalance;
    set({
      isGenerating: true,
      isGenerateQueueRunning: true,
      activeGenerationRunId: runId,
      queueAdding: false,
      generationQueue: [],
      queuePaused: false,
      queueProgress: { done: 0, failed: 0, total: initialTotal },
      comparisonBeforeImage: null,
      currentAnlasSpent: null,
      lastAnlasSpent: null,
      lastError: "",
      statusText:
        initialTotal > 1
          ? `批量生成 1/${initialTotal}，生成前报价 ${quote.amount} Anlas...`
          : `正在生成，生成前报价 ${quote.amount} Anlas...`,
    });

    let completed = 0;
    let failed = 0;
    let lastError = "";
    let initialIndex = 0;
    while (initialIndex < initialTotal || get().generationQueue.length > 0 || get().queueAdding) {
      if (!get().isGenerating || get().activeGenerationRunId !== runId) break; // cancelled or superseded
      // Honor pause: hold here until resumed or cancelled.
      while (get().queuePaused && get().isGenerating && get().activeGenerationRunId === runId) {
        const progressTotal = get().queueProgress?.total ?? initialTotal;
        set({ statusText: `已暂停（${completed + failed}/${progressTotal}），点击继续` });
        await new Promise((r) => setTimeout(r, 250));
      }
      if (!get().isGenerating || get().activeGenerationRunId !== runId) break;

      let base: GenerateParams;
      let extras: GenerateExtras;
      if (initialIndex < initialTotal) {
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
          set({ statusText: "当前图片已完成，正在等待队列任务报价..." });
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
        statusText: `正在生成 ${currentNumber}/${progressTotal}（成功 ${completed}，失败 ${failed}，等待 ${get().generationQueue.length}）...`,
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
    const spentText = spent != null ? `，实扣 ${spent} Anlas` : "，实扣读取失败";
    const finalMsg =
      cancelled
        ? `已取消生成，队列已清空${spentText}。`
        : failed > 0 && completed === 0
          ? imageGenerationFailureMessage(lastError)
          : failed > 0
            ? `完成：成功 ${completed} 张，失败 ${failed} 张${spentText}；最后一次错误：${lastError || "未知错误"}`
            : completed > 1
              ? `批量生成完成，共 ${completed} 张${spentText}。`
              : `生成完成，已保存 1 张图片${spentText}。`;
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
    if (!requireToken(set, state.account.hasToken)) return;
    if (!state.workbenchImage) {
      set({ toast: "请先加载参考图片。", statusText: "缺少参考图" });
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
      "图生图",
    );
    if (!quote) return;
    const anlasBefore = freshAccount.anlasBalance;
    set({
      isGenerating: true,
      currentAnlasSpent: null,
      lastAnlasSpent: null,
      lastError: "",
      statusText: `正在图生图，生成前报价 ${quote.amount} Anlas...`,
    });
    const result = await window.naiDesktop.generateI2I(state.params, state.i2iParams, buildExtras(state));
    if (result.ok && result.items.length > 0) {
      const current = result.items[0];
      await refreshAfterImage(set, get, current, { compareBefore: state.workbenchImage });
      const spent = anlasSpent(anlasBefore, get().account.anlasBalance);
      const message = withAnlasSpent(result.message, spent);
      set({ isGenerating: false, currentAnlasSpent: null, lastAnlasSpent: spent, statusText: message, toast: message });
    } else {
      const finalAccount = await get().refreshAccount();
      const spent = anlasSpent(anlasBefore, finalAccount.anlasBalance);
      const message = withAnlasSpent(result.message, spent);
      set({ isGenerating: false, currentAnlasSpent: null, lastAnlasSpent: spent, lastError: message, statusText: "图生图失败", toast: message });
    }
  },

  async inpaint() {
    const state = get();
    if (!requireToken(set, state.account.hasToken)) return;
    if (!state.workbenchImage) {
      set({ toast: "请先加载原图。", statusText: "缺少原图" });
      return;
    }
    if (!state.inpaintMask) {
      set({ toast: "请先用画笔标记要重绘的区域。", statusText: "缺少蒙版" });
      return;
    }
    const freshAccount = await get().refreshAccount();
    const quote = await ensureAnlasBeforeRun(
      set,
      {
        feature: "inpaint",
        params: state.params,
        inpaintModel: state.inpaintModel,
        inpaintStrength: state.inpaintStrength,
        inpaintNoise: state.inpaintNoise,
        maskBase64: state.inpaintMask,
        image: { width: state.workbenchImage.width, height: state.workbenchImage.height },
        account: freshAccount,
      },
      "局部重绘",
    );
    if (!quote) return;
    const anlasBefore = freshAccount.anlasBalance;
    set({
      isGenerating: true,
      currentAnlasSpent: null,
      lastAnlasSpent: null,
      lastError: "",
      statusText: `正在局部重绘，生成前报价 ${quote.amount} Anlas...`,
    });
    const result = await window.naiDesktop.inpaint(
      state.params,
      state.inpaintModel,
      state.inpaintMask,
      state.inpaintStrength,
      state.inpaintNoise,
    );
    if (result.ok && result.items.length > 0) {
      const current = result.items[0];
      await refreshAfterImage(set, get, current, { compareBefore: state.workbenchImage, loadWorkbench: true });
      const spent = anlasSpent(anlasBefore, get().account.anlasBalance);
      const message = withAnlasSpent(result.message, spent);
      set({ isGenerating: false, currentAnlasSpent: null, lastAnlasSpent: spent, statusText: message, toast: message });
    } else {
      const finalAccount = await get().refreshAccount();
      const spent = anlasSpent(anlasBefore, finalAccount.anlasBalance);
      const message = withAnlasSpent(result.message, spent);
      set({ isGenerating: false, currentAnlasSpent: null, lastAnlasSpent: spent, lastError: message, statusText: "重绘失败", toast: message });
    }
  },

  async upscaleCurrentImage() {
    const state = get();
    if (!requireToken(set, state.account.hasToken)) return;
    if (!state.workbenchImage) {
      set({ toast: "请先加载图片。", statusText: "缺少图片" });
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
      `云端超分 ${state.upscaleScale}x`,
    );
    if (!quote) return;
    const anlasBefore = freshAccount.anlasBalance;
    set({
      isGenerating: true,
      currentAnlasSpent: null,
      lastAnlasSpent: null,
      lastError: "",
      statusText: `正在超分 ${state.upscaleScale}x，生成前报价 ${quote.amount} Anlas...`,
    });
    const result = await window.naiDesktop.upscaleImage(state.upscaleScale);
    if (result.ok && result.item) {
      await refreshAfterImage(set, get, result.item, { compareBefore: state.workbenchImage });
      const spent = anlasSpent(anlasBefore, get().account.anlasBalance);
      const message = withAnlasSpent(result.message, spent);
      set({ isGenerating: false, currentAnlasSpent: null, lastAnlasSpent: spent, statusText: message, toast: message });
    } else {
      const finalAccount = await get().refreshAccount();
      const spent = anlasSpent(anlasBefore, finalAccount.anlasBalance);
      const message = withAnlasSpent(result.message, spent);
      set({ isGenerating: false, currentAnlasSpent: null, lastAnlasSpent: spent, lastError: message, statusText: "超分失败", toast: message });
    }
  },

  async runDirectorTool() {
    const state = get();
    if (!requireToken(set, state.account.hasToken)) return;
    if (!state.workbenchImage) {
      set({ toast: "请先加载图片。", statusText: "缺少图片" });
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
      "后期处理",
    );
    if (!quote) return;
    const anlasBefore = freshAccount.anlasBalance;
    set({
      isGenerating: true,
      currentAnlasSpent: null,
      lastAnlasSpent: null,
      lastError: "",
      statusText: `正在运行 ${state.directorTool}，生成前报价 ${quote.amount} Anlas...`,
    });
    const result = await window.naiDesktop.augmentImage(state.directorTool, state.augmentOptions);
    if (result.ok && result.items.length > 0) {
      const current = result.items[0];
      await refreshAfterImage(set, get, current, { compareBefore: state.workbenchImage });
      const spent = anlasSpent(anlasBefore, get().account.anlasBalance);
      const message = withAnlasSpent(result.message, spent);
      set({ isGenerating: false, currentAnlasSpent: null, lastAnlasSpent: spent, statusText: message, toast: message });
    } else {
      const finalAccount = await get().refreshAccount();
      const spent = anlasSpent(anlasBefore, finalAccount.anlasBalance);
      const message = withAnlasSpent(result.message, spent);
      set({ isGenerating: false, currentAnlasSpent: null, lastAnlasSpent: spent, lastError: message, statusText: "后期处理失败", toast: message });
    }
  },

  async cancel() {
    const wasGenerateQueue = get().isGenerateQueueRunning;
    set({
      isGenerating: false,
      isGenerateQueueRunning: false,
      activeGenerationRunId: null,
      queueAdding: false,
      generationQueue: [],
      queuePaused: false,
      queueProgress: null,
      currentAnlasSpent: null,
      statusText: wasGenerateQueue ? "正在取消生成并清空队列..." : "正在取消操作...",
    });
    await window.naiDesktop.cancel();
    if (!get().isGenerating) {
      set({ statusText: wasGenerateQueue ? "已取消生成，队列已清空。" : "已取消操作" });
    }
  },

  togglePause() {
    if (!get().isGenerating) return;
    set({ queuePaused: !get().queuePaused });
  },

  selectImage(item) {
    set({ currentImage: item, comparisonBeforeImage: null, statusText: `已选择历史图片：${item.date}` });
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
      toast: seed > 0 ? `已载入参数并锁定种子 ${seed}，改提示词后生成即为变体` : "已载入参数",
    }));
  },

  async deleteHistory(id) {
    await window.naiDesktop.deleteHistory(id);
    await get().refreshHistory();
    const current = get().currentImage;
    if (current?.id === id) set({ currentImage: get().history[0] ?? null, comparisonBeforeImage: null });
  },

  async renameHistoryItem(id, name) {
    const res = await window.naiDesktop.renameHistoryItem(id, name);
    if (!res.ok) {
      set({ toast: res.message ?? "重命名失败" });
      return;
    }
    await get().refreshHistory();
    const current = get().currentImage;
    if (current?.id === id && res.item) set({ currentImage: res.item });
    set({ toast: "已重命名图片" });
  },

  clearToast() {
    set({ toast: "" });
  },
}));
