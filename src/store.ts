import { create } from "zustand";
import type {
  AccountSummary,
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
  WorkingImage,
} from "./types";
import { DEFAULT_AUGMENT_OPTIONS, DEFAULT_I2I_PARAMS, DEFAULT_PARAMS } from "./types";
import { expandWildcards } from "./wildcards";

type ActiveTab = "generate" | "inpaint" | "upscale" | "postprocess" | "inspect" | "convert" | "tools" | "records";
type PromptTab = "positive" | "negative";
type BrushMode = "paint" | "erase";

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
  queuePaused: boolean;
  queueProgress: { done: number; failed: number; total: number } | null;
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
  refreshAccount: () => Promise<void>;
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
  inpaintModel: "nai-diffusion-4-5-curated-inpainting",
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
  queuePaused: false,
  queueProgress: null,
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
  async generate() {
    const state = get();
    if (!requireToken(set, state.account.hasToken)) return;
    if (!state.params.positivePrompt.trim()) {
      set({ toast: "请输入正面提示词。", statusText: "缺少提示词" });
      return;
    }
    const total = Math.max(1, state.batchCount);
    const extras = buildExtras(state);
    const initialSeed = state.params.seed;
    const anlasBefore = state.account.anlasBalance;
    set({
      isGenerating: true,
      queuePaused: false,
      queueProgress: { done: 0, failed: 0, total },
      comparisonBeforeImage: null,
      lastAnlasSpent: null,
      lastError: "",
      statusText: total > 1 ? `批量生成 1/${total}...` : "正在调用 NovelAI API 生成图片...",
    });

    let completed = 0;
    let failed = 0;
    let lastError = "";
    for (let i = 0; i < total; i++) {
      if (!get().isGenerating) break; // cancelled
      // Honor pause: hold here until resumed or cancelled.
      while (get().queuePaused && get().isGenerating) {
        set({ statusText: `已暂停（${completed}/${total}），点击继续` });
        await new Promise((r) => setTimeout(r, 250));
      }
      if (!get().isGenerating) break;
      if (total > 1) set({ statusText: `批量生成 ${i + 1}/${total}（成功 ${completed}，失败 ${failed}）...` });

      const base = get().params;
      const currentParams = {
        ...base,
        // Expand {a|b|c} wildcards independently per image so batches vary.
        positivePrompt: expandWildcards(base.positivePrompt),
        negativePrompt: expandWildcards(base.negativePrompt),
        seed: initialSeed > 0 ? initialSeed + i : 0,
      };

      // One in-loop retry on top of the main process's HTTP-level 429/5xx retry.
      let result = await window.naiDesktop.generate(currentParams, extras);
      if ((!result.ok || result.items.length === 0) && get().isGenerating) {
        await new Promise((r) => setTimeout(r, 1200));
        result = await window.naiDesktop.generate(currentParams, extras);
      }

      if (result.ok && result.items.length > 0) {
        completed++;
        const current = result.items[0];
        set({ params: { ...get().params, seed: result.actualSeed ?? current.actualSeed } });
        await refreshAfterImage(set, get, current);
      } else {
        // Skip the failed image and continue the batch instead of aborting.
        failed++;
        lastError = result.message;
      }
      set({ queueProgress: { done: completed, failed, total } });
    }

    const anlasAfter = get().account.anlasBalance;
    const spent =
      typeof anlasBefore === "number" && typeof anlasAfter === "number"
        ? Math.max(0, anlasBefore - anlasAfter)
        : null;
    const spentText = spent && spent > 0 ? `，实扣 ${spent} Anlas` : "";
    // A user cancellation surfaces as a failed result; don't mislabel it as an error.
    const cancelled = completed === 0 && failed > 0 && /取消|cancel/i.test(lastError);
    const finalMsg =
      cancelled
        ? "已取消生成。"
        : failed > 0 && completed === 0
          ? imageGenerationFailureMessage(lastError)
          : failed > 0
            ? `完成：成功 ${completed} 张，失败 ${failed} 张${spentText}；最后一次错误：${lastError || "未知错误"}`
            : completed > 1
              ? `批量生成完成，共 ${completed} 张${spentText}。`
              : `生成完成，已保存 1 张图片${spentText}。`;
    set({
      isGenerating: false,
      queuePaused: false,
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
    set({ isGenerating: true, lastError: "", statusText: "正在图生图..." });
    const result = await window.naiDesktop.generateI2I(state.params, state.i2iParams, buildExtras(state));
    if (result.ok && result.items.length > 0) {
      const current = result.items[0];
      set({ isGenerating: false, statusText: result.message, toast: result.message });
      await refreshAfterImage(set, get, current, { compareBefore: state.workbenchImage });
    } else {
      set({ isGenerating: false, lastError: result.message, statusText: "图生图失败", toast: result.message });
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
    set({ isGenerating: true, lastError: "", statusText: "正在局部重绘..." });
    const result = await window.naiDesktop.inpaint(
      state.params,
      state.inpaintModel,
      state.inpaintMask,
      state.inpaintStrength,
      state.inpaintNoise,
    );
    if (result.ok && result.items.length > 0) {
      const current = result.items[0];
      set({ isGenerating: false, statusText: result.message, toast: result.message });
      await refreshAfterImage(set, get, current, { compareBefore: state.workbenchImage, loadWorkbench: true });
    } else {
      set({ isGenerating: false, lastError: result.message, statusText: "重绘失败", toast: result.message });
    }
  },

  async upscaleCurrentImage() {
    const state = get();
    if (!requireToken(set, state.account.hasToken)) return;
    if (!state.workbenchImage) {
      set({ toast: "请先加载图片。", statusText: "缺少图片" });
      return;
    }
    set({ isGenerating: true, lastError: "", statusText: `正在超分 ${state.upscaleScale}x...` });
    const result = await window.naiDesktop.upscaleImage(state.upscaleScale);
    if (result.ok && result.item) {
      set({ isGenerating: false, statusText: result.message, toast: result.message });
      await refreshAfterImage(set, get, result.item, { compareBefore: state.workbenchImage });
    } else {
      set({ isGenerating: false, lastError: result.message, statusText: "超分失败", toast: result.message });
    }
  },

  async runDirectorTool() {
    const state = get();
    if (!requireToken(set, state.account.hasToken)) return;
    if (!state.workbenchImage) {
      set({ toast: "请先加载图片。", statusText: "缺少图片" });
      return;
    }
    set({ isGenerating: true, lastError: "", statusText: `正在运行 ${state.directorTool}...` });
    const result = await window.naiDesktop.augmentImage(state.directorTool, state.augmentOptions);
    if (result.ok && result.items.length > 0) {
      const current = result.items[0];
      set({ isGenerating: false, statusText: result.message, toast: result.message });
      await refreshAfterImage(set, get, current, { compareBefore: state.workbenchImage });
    } else {
      set({ isGenerating: false, lastError: result.message, statusText: "后期处理失败", toast: result.message });
    }
  },

  async cancel() {
    await window.naiDesktop.cancel();
    set({ isGenerating: false, queuePaused: false, statusText: "已取消操作" });
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
