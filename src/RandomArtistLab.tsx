import { confirmAction } from "./components/confirm";
import { errorText } from "./error-message";
import {PreviewImageViewer} from './components/PreviewImageViewer';
import {FavoriteStyleExport} from './components/FavoriteStyleExport';
import {parseCustomArtistPool, customArtistPoolText} from './custom-artist-pool';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { AppPortal, Button, SelectMenu, SelectMenuCompat } from "./components/ui";
import { Icon } from "./components/icons";
import { normalizeArtistPoolCount, MAX_ARTIST_POOL_COUNT } from "./artist-pool-options";
import { ArtistCatalogStatus, artistCatalogText, formatCatalogUpdateError } from "./components/ArtistCatalogStatus";
import type { ArtistCatalogMode, ArtistCatalogSelection } from "./artist-lab";
import { QualityPresetControl } from "./components/QualityPresetControl";
import { PositivePromptPresetControl } from "./PositivePromptPresets";
import { WeightDistributionControls } from "./components/WeightDistributionControls";
import { DEFAULT_WEIGHT_DISTRIBUTION, type WeightControlMode } from "./weight-distribution";
import {
  expandArtistRecipeComparisons,
  formatArtistCardTags,
  formatArtistFullPrompt,
  generatePopularArtistRecipes,
  parseCustomTagPoolValues,
  randomizeArtistRecipeWeights,
  type ArtistRecipeComparison,
  type ArtistRecipeVariant,
  type CustomTagMode,
  type GeneratedArtistRecipe,
  type StyleMutationCategory,
} from "./artist-recipe";
import {
  customTagCategoryLabel,
  customTagMeaning,
  matchesCustomTagSearch,
  RANDOM_CUSTOM_TAG_LIBRARY,
} from "./random-custom-tag-library";
import { createArtistLabRandom, type ArtistTagRecord, type ArtistPoolSyncProgress } from "./artist-lab";
import { artistPoolSyncCopy } from "./components/ArtistPoolStatus";
import { useAppStore } from "./store";
import {
  DEFAULT_PARAMS,
  NAI_MODELS,
  NAI_SAMPLERS,
  NAI_UC_PRESETS,
  normalizeGenerateParams,
  isNAIV4PlusModel,
  supportsNAINoiseScheduleControl,
  supportsNAIVariety,
  type AppLanguage,
  type ArtistStyleCatalogScope,
  type ArtistStylePreviewResult,
  type GenerateParams,
  type HistoryItem,
  type TagSuggestion,
} from "./types";
import {
  fitNAIImageSize,
  maxNAIDimensionFor,
  snapNAIDimensionWithinArea,
} from "./nai-dimensions";
import {
  addArtistFavorite,
  ARTIST_FAVORITES_CHANGED_EVENT,
  loadArtistFavorites,
  removeArtistFavorite,
  RANDOM_ARTIST_SESSION_STORAGE_KEY,
} from "./artist-favorite-library";

type RandomResult = ArtistRecipeComparison & {
  sequence: number;
  status: "pending" | "generating" | "done" | "failed";
  image?: HistoryItem;
  error?: string;
  liked?: boolean;
  saving?: boolean;
  /** Model actually used for this card. Kept with favorites so mixed-model
   * collections never lose provenance when the session model changes later. */
  generationModel?: string;
  /** Concrete seed used by this card. Random mode still shares it within an
   * A/B pair so the comparison changes only the optional style terms. */
  generationSeed?: number;
};

type RandomSession = {
  customArtists?: string;
  useCustomArtists?: boolean;
  poolSize: number;
  poolMode: ArtistCatalogMode;
  poolSeed: number;
  basePrompt: string;
  auxiliaryPrompt: string;
  count: number;
  artistMinCount: number;
  artistMaxCount: number;
  artistWeightMin: number;
  artistWeightMax: number;
  weightControlMode: WeightControlMode;
  artistWeightMode: number;
  artistWeightLeftDispersion: number;
  artistWeightRightDispersion: number;
  artistWeightSoftBalance: number;
  customTagPool: string;
  customTagModes: Record<string, CustomTagMode>;
  randomCustomTagMinCount: number;
  randomCustomTagMaxCount: number;
  customTagWeightMin: number;
  customTagWeightMax: number;
  includeFranchiseStyles: boolean;
  franchiseMinCount: number;
  franchiseMaxCount: number;
  franchiseWeightMin: number;
  franchiseWeightMax: number;
  seedMode: "random" | "fixed";
  seed: number;
  drawSeed: number;
  mutateAuxiliary: boolean;
  biasFavorites: boolean;
  weightTuneInput: string;
  weightTuneCount: number;
  weightVariation: number;
  generationParams: GenerateParams;
  results: RandomResult[];
  favorites: RandomResult[];
};

const STORAGE_KEY = RANDOM_ARTIST_SESSION_STORAGE_KEY;
const CATALOG_SELECTION_KEY = "langbai.artist-catalog.selection.v1";
const LEGACY_STORAGE_KEYS = [
  "langbai.artist-lab.random.v5",
  "langbai.artist-lab.random.v4",
] as const;
const RANDOM_V5_DEFAULTS = {
  artistMinCount: 3,
  artistMaxCount: 7,
  artistWeightMin: 0.2,
  artistWeightMax: 1.2,
  weightControlMode: "novice" as WeightControlMode,
  artistWeightMode: DEFAULT_WEIGHT_DISTRIBUTION.mode,
  artistWeightLeftDispersion: DEFAULT_WEIGHT_DISTRIBUTION.leftDispersion,
  artistWeightRightDispersion: DEFAULT_WEIGHT_DISTRIBUTION.rightDispersion,
  artistWeightSoftBalance: DEFAULT_WEIGHT_DISTRIBUTION.softBalance,
  customTagWeightMin: 0.2,
  customTagWeightMax: 1.2,
  randomCustomTagMinCount: 1,
  randomCustomTagMaxCount: 3,
  franchiseMinCount: 0,
  franchiseMaxCount: 2,
  franchiseWeightMin: 0.15,
  franchiseWeightMax: 0.8,
} as const;
const ARTIST_STYLE_CATALOG_PAGE_SIZE = 120;
const ARTIST_STYLE_SCOPE_BY_CATEGORY: Record<string, ArtistStyleCatalogScope> = {
  all: "all",
  quality: "quality",
  render3d: "render3d",
  medium: "medium",
  lighting: "lighting",
  color: "color",
  texture: "texture",
  stylization: "stylization",
  "danbooru-style": "style",
  copyright: "copyright",
};

type ArtistStylePreviewPopover = {
  tag: string;
  meaning: string;
  left: number;
  top: number;
  status: "loading" | "ready" | "empty";
  result?: ArtistStylePreviewResult;
};
let sessionCache: RandomSession | null = null;

const CUSTOM_TAG_TEXT = {
  "zh-CN": {
    title: "手动 Tag",
    hint: "逗号或换行分隔。下方可为每个 Tag 单独选择“每串必加”或“随机抽取”，权重都会重新随机。",
    placeholder: "例如：anime coloring, watercolor (medium), official style",
    range: "Tag 权重区间", library: "画风 Tag 库", libraryHint: "仅保留画风、媒介、渲染、光色与画质；动作、背景、特效、情绪不混入画师串。面板默认折叠。",
    selected: "已选 {count} 个", available: "本地按需载入", search: "搜索 Tag、中文含义或作品名", all: "全部画风 / 动漫游戏", clear: "清空全部",
    noResults: "没有匹配项；完整库需要先在设置中安装 Danbooru 标签数据。", styleTags: "Danbooru 画风模仿", copyright: "动漫 / 游戏 / 漫画作品", always: "每串必加", random: "随机加入", selectedTitle: "已选 Tag 与加入方式", randomRange: "每串随机抽取数量", loadMore: "载入更多", loading: "正在读取本地 Tag 库…", sourceCatalog: "完整本地数据库", sourceBilingual: "中英离线库", sourceNone: "未安装本地数据库", collapse: "折叠画风 Tag 库",
  },
} satisfies Record<AppLanguage, Record<string, string>>;

const STYLE_PREVIEW_TEXT = {
  "zh-CN": { title: "Danbooru 参考图", loading: "正在载入参考图…", empty: "这个画风 Tag 暂无可用参考图" },
} satisfies Record<AppLanguage, { title: string; loading: string; empty: string }>;

const RANDOM_RESET_TEXT = {
  "zh-CN": { label: "恢复抽卡默认", hint: "V5 默认：画师与画风 Tag 权重 0.2～1.2；随机 Tag 每串 1～3 个。", done: "已恢复 V5 抽卡默认；提示词、收藏与生成参数未清除。" },
} satisfies Record<AppLanguage, { label: string; hint: string; done: string }>;

const RANDOM_SIZE_PRESETS = [
  { width: 832, height: 1216 },
  { width: 1024, height: 1024 },
  { width: 1216, height: 832 },
  { width: 1024, height: 1536 },
  { width: 1536, height: 1024 },
  { width: 1472, height: 1472 },
] as const;

const TEXT = {
  "zh-CN": { title: "随机画师串抽卡", subtitle: "每次抽卡重新组合画师、权重和可选风格词；内容与生成参数保持不变，Seed 可按组随机或全批固定。", back: "返回画风实验室", pool: "热门画师候选库", poolSize: "按热度载入前 N 名", load: "载入", ready: "当前候选库共 {count} 名画师", loading: "正在读取热门画师…", refresh: "刷新排行", hint: "画师 Tag 来源：Danbooru", base: "固定内容提示词", auxiliary: "固定附加词（每次都保留）", mutate: "抽卡时额外加入随机风格词", mutateHint: "开启后，每组使用同一画师串、提示词、Seed 和参数生成 A/B 两张：A 不加风格词，B 从画风、媒介/笔触、色彩与光影中抽取 2～6 个带 0.3～1.5 权重的词。", count: "本批画师串数量", range: "每串画师数量（最多 20 名）", min: "最少", max: "最多", seed: "固定 NovelAI Seed", draw: "重新抽卡", preview: "本批抽卡预览", previewHint: "开启随机风格词时，每组生成 A/B 两张对照图；重新抽卡会清除上一批未收藏的临时图片。", generate: "生成这一批", stop: "停止任务", refine: "根据喜欢项再抽卡", needPool: "画师池尚未载入。", needPrompt: "请填写固定内容提示词。", needLikes: "请先收藏至少一个喜欢项。", running: "正在生成 {done}/{total}", complete: "本批已完成；未收藏图片会在下一次抽卡时自动清理。", pending: "等待", generating: "生成中", done: "已完成", failed: "失败", like: "收藏到喜欢", saved: "已收藏", saving: "保存中…", retry: "重试", apply: "应用到生成", copy: "复制", copied: "已复制画师串。", applied: "已应用到生成页。", empty: "画师池加载后即可抽卡。", unlimited: "输入画师串组数；开启随机风格词时，实际图片数为两倍。", mutation: "本次风格/光影变异词", favorites: "喜欢的画风", favoritesHint: "A、B 可分别收藏；收藏 B 后，开启风格词的偏好抽卡也会参考其风格词与权重。", remove: "移除收藏", removed: "已移除收藏和本地图片。", categories: "艺术风格|媒介/笔触|色彩|光影", variantPlain: "A｜仅画师串", variantMutated: "B｜画师串＋随机风格词", copyArtists: "复制画师串", copyFull: "复制完整提示词", copiedArtists: "已复制画师串。", copiedFull: "已复制完整提示词。", pairSummary: "{pairs} 组 · {images} 张", artistWeight: "画师权重区间", franchise: "加入游戏 / 动漫系列风格 Tag", franchiseHint: "从当前热门的 Danbooru 作品系列标签中随机抽取；它可能影响角色或题材，不只是画风。", franchiseRange: "系列风格 Tag 数量", franchiseWeight: "系列风格 Tag 权重", seedMode: "NovelAI Seed 模式", seedRandom: "每组随机", seedFixed: "固定 Seed", randomFixedSeed: "随机一个固定 Seed", franchiseTerms: "本次游戏 / 动漫系列 Tag", allModels: "全部模型", modelGroup: "生成模型", previewImage: "双击预览大图" },
} satisfies Record<AppLanguage, Record<string, string>>;

const PARAM_TEXT = {
  "zh-CN": {
    title: "NovelAI 生成参数",
    hint: "默认使用软件初始参数；此处修改只用于抽卡，A/B 对照使用完全相同的参数。可随时同步生成页或恢复初始值。",
    sync: "从生成页同步",
    reset: "恢复初始参数",
    model: "模型",
    size: "图片尺寸",
    sizeValues: "竖图|方图|横图|高竖图|宽横图|大方图",
    width: "宽度",
    height: "高度",
    negative: "负面提示词",
    steps: "步数",
    cfg: "CFG Scale",
    rescale: "CFG Rescale",
    sampler: "采样器",
    noise: "噪声计划",
    uc: "负面预设",
    ucValues: "强负面|轻负面|人物优先|无",
    quality: "质量词",
    variety: "Variety+",
    smea: "SMEA",
    smeaDyn: "SMEA Dyn",
  },
} satisfies Record<AppLanguage, Record<string, string>>;

const TUNE_TEXT = {
  "zh-CN": {
    title: "已有画师串权重微调",
    hint: "保持画师名单和顺序不变，只在原权重上下随机浮动。无权重标签按 1.0 处理。",
    input: "粘贴画师串",
    count: "候选组数",
    variation: "权重浮动（±%）",
    generate: "生成权重微调候选",
    noArtists: "没有识别到 artist: 画师标签。",
    copied: "已复制 ✓",
  },
} satisfies Record<AppLanguage, Record<string, string>>;

function freshSeed(): number {
  const values = new Uint32Array(1);
  globalThis.crypto?.getRandomValues?.(values);
  return values[0] || ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
}

function freshNaiSeed(): number {
  return freshSeed() % 2_147_483_647 || 1;
}

function positiveInteger(value: unknown, fallback = 1): number {
  const number = Math.floor(Number(value));
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function clampRecipeWeight(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Math.round(Math.max(0.1, Math.min(10, Number.isFinite(numeric) ? numeric : fallback)) * 100) / 100;
}

function clampDispersion(value: unknown, fallback = 0.4): number {
  const numeric = Number(value);
  return Math.round(Math.max(0, Math.min(1, Number.isFinite(numeric) ? numeric : fallback)) * 100) / 100;
}

function clampRecipeCount(value: unknown, fallback: number, minimum = 0): number {
  const numeric = Number(value);
  return Math.max(minimum, Math.min(20, Math.floor(Number.isFinite(numeric) ? numeric : fallback)));
}


type NumericDraftInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: number;
  onCommit: (value: number) => void;
  normalize?: (value: number) => number;
};

/** Preserve temporary empty/partial numeric text and validate on blur/Enter. */
function NumericDraftInput({ value, onCommit, normalize, min, max, ...props }: NumericDraftInputProps) {
  const [draft, setDraft] = useState(String(value));
  const cancelBlurRef = useRef(false);

  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    if (cancelBlurRef.current) {
      cancelBlurRef.current = false;
      setDraft(String(value));
      return;
    }
    const parsed = Number(draft);
    let next = Number.isFinite(parsed) ? parsed : value;
    if (typeof min === "number") next = Math.max(min, next);
    if (typeof max === "number") next = Math.min(max, next);
    next = normalize ? normalize(next) : next;
    onCommit(next);
    setDraft(String(next));
  };

  return <input
    {...props}
    type="number"
    value={draft}
    min={min}
    max={max}
    onChange={(event) => setDraft(event.target.value)}
    onBlur={commit}
    onKeyDown={(event) => {
      if (event.key === "Enter") event.currentTarget.blur();
      else if (event.key === "Escape") {
        cancelBlurRef.current = true;
        setDraft(String(value));
        event.currentTarget.blur();
      }
      props.onKeyDown?.(event);
    }}
  />;
}

export function normalizeGenerationParams(
  value: Partial<GenerateParams> | undefined,
  inherited: GenerateParams,
): GenerateParams {
  const dimensions = fitNAIImageSize(
    value?.width ?? inherited.width,
    value?.height ?? inherited.height,
    inherited,
  );
  return {
    // Random gacha is not the 4.5-only target-iteration workflow. Preserve
    // saved/synced model choices and normalize model-specific quality flags.
    ...normalizeGenerateParams({ ...inherited, ...(value ?? {}) }),
    positivePrompt: "",
    stylePrompt: "",
    width: dimensions.width,
    height: dimensions.height,
    steps: Math.max(1, Math.min(50, positiveInteger(value?.steps ?? inherited.steps, 28))),
    cfgScale: Math.max(1, Math.min(10, Number(value?.cfgScale ?? inherited.cfgScale) || 6)),
    cfgRescale: Math.max(0, Math.min(1, Number(value?.cfgRescale ?? inherited.cfgRescale) || 0)),
  };
}

function restore(inherited: GenerateParams): RandomSession {
  if (sessionCache) return sessionCache;
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    const legacy = LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean) ?? null;
    const migratingToV5Weights = current == null && legacy != null;
    const raw = JSON.parse(current ?? legacy ?? "null") as (Partial<RandomSession> & { artistCount?: number }) | null;
    let fixed: {count?:number;mode?:string;seed?:number}|null=null;
    try {fixed=JSON.parse(localStorage.getItem(CATALOG_SELECTION_KEY)??"null");} catch { /* Preserve the existing session if the small preference record is damaged. */ }
    const savedPoolSeed=fixed?.seed??raw?.poolSeed;
    const legacyArtistCount = clampRecipeCount(raw?.artistCount, 5, 1);
    sessionCache = {
      customArtists: typeof raw?.customArtists === "string" ? raw.customArtists : "",
      useCustomArtists: raw?.useCustomArtists === true,
      poolSize: normalizeArtistPoolCount(fixed?.count??raw?.poolSize),
      poolMode: (fixed?.mode??raw?.poolMode) === "ranked" ? "ranked" : "random",
      poolSeed: Number.isSafeInteger(savedPoolSeed) ? Number(savedPoolSeed) >>> 0 : freshSeed(),
      basePrompt: typeof raw?.basePrompt === "string" ? raw.basePrompt : inherited.positivePrompt,
      auxiliaryPrompt: typeof raw?.auxiliaryPrompt === "string" ? raw.auxiliaryPrompt : "",
      count: positiveInteger(raw?.count, 8),
      artistMinCount: clampRecipeCount(raw?.artistMinCount, raw?.artistCount == null ? 3 : legacyArtistCount, 1),
      artistMaxCount: clampRecipeCount(raw?.artistMaxCount, raw?.artistCount == null ? 7 : legacyArtistCount, 1),
      artistWeightMin: clampRecipeWeight(migratingToV5Weights ? undefined : raw?.artistWeightMin, RANDOM_V5_DEFAULTS.artistWeightMin),
      artistWeightMax: clampRecipeWeight(migratingToV5Weights ? undefined : raw?.artistWeightMax, RANDOM_V5_DEFAULTS.artistWeightMax),
      weightControlMode: raw?.weightControlMode === "advanced" ? "advanced" : "novice",
      artistWeightMode: clampRecipeWeight(raw?.artistWeightMode, DEFAULT_WEIGHT_DISTRIBUTION.mode),
      artistWeightLeftDispersion: clampDispersion(raw?.artistWeightLeftDispersion, DEFAULT_WEIGHT_DISTRIBUTION.leftDispersion),
      artistWeightRightDispersion: clampDispersion(raw?.artistWeightRightDispersion, DEFAULT_WEIGHT_DISTRIBUTION.rightDispersion),
      artistWeightSoftBalance: clampDispersion(raw?.artistWeightSoftBalance, DEFAULT_WEIGHT_DISTRIBUTION.softBalance),
      customTagPool: typeof raw?.customTagPool === "string" ? raw.customTagPool : "",
      customTagModes: raw?.customTagModes && typeof raw.customTagModes === "object"
        ? Object.fromEntries(Object.entries(raw.customTagModes).filter((entry): entry is [string, CustomTagMode] => entry[1] === "always" || entry[1] === "random"))
        : {},
      randomCustomTagMinCount: clampRecipeCount(raw?.randomCustomTagMinCount, 1, 0),
      randomCustomTagMaxCount: clampRecipeCount(raw?.randomCustomTagMaxCount, 3, 0),
      customTagWeightMin: clampRecipeWeight(raw?.customTagWeightMin, RANDOM_V5_DEFAULTS.customTagWeightMin),
      customTagWeightMax: clampRecipeWeight(raw?.customTagWeightMax, RANDOM_V5_DEFAULTS.customTagWeightMax),
      includeFranchiseStyles: raw?.includeFranchiseStyles === true,
      franchiseMinCount: clampRecipeCount(raw?.franchiseMinCount, 0),
      franchiseMaxCount: clampRecipeCount(raw?.franchiseMaxCount, 2),
      franchiseWeightMin: clampRecipeWeight(migratingToV5Weights ? undefined : raw?.franchiseWeightMin, RANDOM_V5_DEFAULTS.franchiseWeightMin),
      franchiseWeightMax: clampRecipeWeight(migratingToV5Weights ? undefined : raw?.franchiseWeightMax, RANDOM_V5_DEFAULTS.franchiseWeightMax),
      seedMode: raw?.seedMode === "random" ? "random" : "fixed",
      seed: Math.min(2_147_483_647, Math.max(1, Math.floor(Number(raw?.seed) || 246813579))),
      drawSeed: positiveInteger(raw?.drawSeed, freshSeed()),
      mutateAuxiliary: raw?.mutateAuxiliary === true,
      biasFavorites: raw?.biasFavorites === true,
      weightTuneInput: typeof raw?.weightTuneInput === "string" ? raw.weightTuneInput : "",
      weightTuneCount: positiveInteger(raw?.weightTuneCount, 8),
      weightVariation: Math.max(0, Math.min(100, Number(raw?.weightVariation) || 20)),
      generationParams: normalizeGenerationParams(raw?.generationParams, DEFAULT_PARAMS),
      results: Array.isArray(raw?.results) ? raw.results : [],
      // Dedicated storage restores favorites from any historical v2-v6
      // session once, then remains authoritative for future removals.
      favorites: loadArtistFavorites("random"),
    };
  } catch {
    sessionCache = { poolSize: 1000, poolMode: "random", poolSeed: freshSeed(), basePrompt: inherited.positivePrompt, auxiliaryPrompt: "", customTagPool: "", customTagModes: {}, count: 8, ...RANDOM_V5_DEFAULTS, includeFranchiseStyles: false, seedMode: "fixed", seed: 246813579, drawSeed: freshSeed(), mutateAuxiliary: false, biasFavorites: false, weightTuneInput: "", weightTuneCount: 8, weightVariation: 20, generationParams: normalizeGenerationParams(undefined, DEFAULT_PARAMS), results: [], favorites: loadArtistFavorites("random") };
  }
  return sessionCache;
}

export default function RandomArtistLab({ onBack }: { onBack: () => void }) {
  const language = useAppStore((state) => state.settings?.language ?? "zh-CN");
  const params = useAppStore((state) => state.params);
  const applyParams = useAppStore((state) => state.applyParams);
  const refreshAccount = useAppStore((state) => state.refreshAccount);
  const refreshHistory = useAppStore((state) => state.refreshHistory);
  const deleteHistory = useAppStore((state) => state.deleteHistory);
  const text = TEXT[language];
  const customTagText = CUSTOM_TAG_TEXT[language];
  const paramText = PARAM_TEXT[language];
  const tuneText = TUNE_TEXT[language];
  const resetText = RANDOM_RESET_TEXT[language];
  const ucLabels = paramText.ucValues.split("|");
  const sizeLabels = paramText.sizeValues.split("|");
  const favoriteFolderLabel = "收藏夹";
  const [session, setSession] = useState(() => restore(params));
  const [customTagQuery, setCustomTagQuery] = useState("");
  const [customTagCategory, setCustomTagCategory] = useState("all");
  const [weightTuneTagQuery, setWeightTuneTagQuery] = useState("");
  const [weightTuneTagCategory, setWeightTuneTagCategory] = useState("quality");
  const [customTagLibraryOpen, setCustomTagLibraryOpen] = useState(false);
  const [catalogItems, setCatalogItems] = useState<TagSuggestion[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogSource, setCatalogSource] = useState<"catalog" | "bilingual" | "none">("none");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogLoadingMore, setCatalogLoadingMore] = useState(false);
  const [stylePreview, setStylePreview] = useState<ArtistStylePreviewPopover | null>(null);
  const stylePreviewText = STYLE_PREVIEW_TEXT[language];
  const selectedCustomTagValues = useMemo(
    () => parseCustomTagPoolValues(session.customTagPool),
    [session.customTagPool],
  );
  const selectedCustomTags = useMemo(
    () => new Set(selectedCustomTagValues.map((tag) => tag.toLocaleLowerCase())),
    [selectedCustomTagValues],
  );
  const dynamicCatalogScope = ARTIST_STYLE_SCOPE_BY_CATEGORY[customTagCategory] ?? "all";
  const staticCatalogSupplements = useMemo<TagSuggestion[]>(() => {
    const categories = customTagCategory === "all"
      ? RANDOM_CUSTOM_TAG_LIBRARY
      : RANDOM_CUSTOM_TAG_LIBRARY.filter((category) => category.id === customTagCategory);
    return categories
      .flatMap((category) => category.tags
        .filter((entry) => matchesCustomTagSearch(category, entry, language, customTagQuery))
        .map((entry) => ({
          tag: entry.tag,
          category: 0,
          count: 0,
          description: customTagMeaning(entry, language),
        })));
  }, [customTagCategory, customTagQuery, language]);
  const visibleCatalogItems = useMemo(() => {
    const seen = new Set<string>();
    return [...catalogItems, ...staticCatalogSupplements].filter((entry) => {
      const key = entry.tag.trim().toLocaleLowerCase().replaceAll(" ", "_");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [catalogItems, staticCatalogSupplements]);
  const visibleCustomTagCount = visibleCatalogItems.length;
  const weightTuneLibraryItems = useMemo(() => {
    const category = RANDOM_CUSTOM_TAG_LIBRARY.find((item) => item.id === weightTuneTagCategory)
      ?? RANDOM_CUSTOM_TAG_LIBRARY[0];
    return category.tags.filter((entry) => matchesCustomTagSearch(
      category,
      entry,
      language,
      weightTuneTagQuery,
    ));
  }, [language, weightTuneTagCategory, weightTuneTagQuery]);
  const selectedRandomTagCount = selectedCustomTagValues.filter(
    (tag) => session.customTagModes[tag.toLocaleLowerCase()] === "random",
  ).length;
  const [onlinePool, setPool] = useState<ArtistTagRecord[]>([]);
  const customPool = useMemo(()=>parseCustomArtistPool(session.customArtists??""),[session.customArtists]);
  const pool = session.useCustomArtists ? customPool : onlinePool;
  const customPoolText = customArtistPoolText(language);
  const [poolSnapshot, setPoolSnapshot] = useState<ArtistCatalogSelection | null>(null);
  const [latestCatalog, setLatestCatalog] = useState<ArtistCatalogSelection["catalog"] | null>(null);
  const [poolFailed, setPoolFailed] = useState(false);
  const [poolProgress, setPoolProgress] = useState<ArtistPoolSyncProgress | null>(null);
  const poolSyncIdRef = useRef("");
  const poolText = artistPoolSyncCopy(language);
  const selectionText = artistCatalogText(language);
  const [updatingCatalog, setUpdatingCatalog] = useState(false);
  const [confirmCatalogUpdate, setConfirmCatalogUpdate] = useState(false);
  const [catalogMessage, setCatalogMessage] = useState("");
  const poolRequestRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [copiedAction, setCopiedAction] = useState("");
  const [previewResult, setPreviewResult] = useState<RandomResult | null>(null);
  const [favoriteModelFilter, setFavoriteModelFilter] = useState("all");
  const copiedTimerRef = useRef<number | null>(null);
  const persistenceTimerRef = useRef<number | null>(null);
  const catalogRequestRef = useRef(0);
  const catalogResultsRef = useRef<HTMLDivElement>(null);
  const stylePreviewTimerRef = useRef<number | null>(null);
  const stylePreviewCacheRef = useRef(new Map<string, ArtistStylePreviewResult | null>());
  const sessionRef = useRef(session);
  const [showFavorites, setShowFavorites] = useState(
    () => localStorage.getItem("langbai.artist-lab.random.view.v1") === "favorites",
  );
  const cancelRef = useRef(false);
  const scrollRef = useRef<HTMLElement>(null);
  const scrollTopToRestoreRef = useRef<number | null>(null);
  const patch = (next: Partial<RandomSession>) => setSession((current) => ({ ...current, ...next }));
  const customTagMode = (tag: string): CustomTagMode =>
    session.customTagModes[tag.trim().toLocaleLowerCase()] ?? "always";
  const setCustomTagMode = (tag: string, mode: CustomTagMode) => {
    const key = tag.trim().toLocaleLowerCase();
    setSession((current) => ({
      ...current,
      customTagModes: { ...current.customTagModes, [key]: mode },
      drawSeed: freshSeed(),
    }));
  };
  const toggleLibraryTag = (tag: string) => {
    const key = tag.trim().toLocaleLowerCase();
    setSession((current) => {
      const values = parseCustomTagPoolValues(current.customTagPool);
      const selected = values.some((value) => value.toLocaleLowerCase() === key);
      const nextValues = selected
        ? values.filter((value) => value.toLocaleLowerCase() !== key)
        : [...values, tag.trim()];
      const customTagModes = { ...current.customTagModes };
      if (selected) delete customTagModes[key];
      else customTagModes[key] = customTagModes[key] ?? "always";
      return {
        ...current,
        customTagPool: nextValues.join(", "),
        customTagModes,
        drawSeed: freshSeed(),
      };
    });
  };
  const loadMoreCatalog = async () => {
    if (catalogLoading || catalogLoadingMore || catalogItems.length >= catalogTotal) return;
    const requestId = catalogRequestRef.current;
    const previousScrollTop = catalogResultsRef.current?.scrollTop ?? 0;
    setCatalogLoadingMore(true);
    try {
      const result = await window.naiDesktop.artistStyleCatalog(
        dynamicCatalogScope,
        customTagQuery,
        catalogItems.length,
        ARTIST_STYLE_CATALOG_PAGE_SIZE,
      );
      if (requestId !== catalogRequestRef.current) return;
      setCatalogItems((current) => {
        const seen = new Set(current.map((entry) => entry.tag.toLocaleLowerCase()));
        return [...current, ...result.items.filter((entry) => {
          const key = entry.tag.toLocaleLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })];
      });
      setCatalogTotal(result.total);
      setCatalogSource(result.source);
      window.requestAnimationFrame(() => {
        if (requestId === catalogRequestRef.current && catalogResultsRef.current) {
          catalogResultsRef.current.scrollTop = previousScrollTop;
        }
      });
    } catch {
      // Keep the already visible page intact when an additional page fails.
    } finally {
      if (requestId === catalogRequestRef.current) setCatalogLoadingMore(false);
    }
  };
  const hideStylePreview = () => {
    if (stylePreviewTimerRef.current !== null) {
      window.clearTimeout(stylePreviewTimerRef.current);
      stylePreviewTimerRef.current = null;
    }
    setStylePreview(null);
  };
  const showStylePreview = (
    entry: TagSuggestion,
    meaning: string,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (!/_\(style\)$/i.test(entry.tag)) return;
    if (stylePreviewTimerRef.current !== null) window.clearTimeout(stylePreviewTimerRef.current);
    const rect = event.currentTarget.getBoundingClientRect();
    const popoverWidth = 292;
    const popoverHeight = 356;
    const gap = 12;
    let left = rect.right + gap;
    if (left + popoverWidth > window.innerWidth - gap) left = rect.left - popoverWidth - gap;
    left = Math.max(gap, Math.min(left, window.innerWidth - popoverWidth - gap));
    const top = Math.max(gap, Math.min(rect.top, window.innerHeight - popoverHeight - gap));
    stylePreviewTimerRef.current = window.setTimeout(() => {
      stylePreviewTimerRef.current = null;
      if (stylePreviewCacheRef.current.has(entry.tag)) {
        const result = stylePreviewCacheRef.current.get(entry.tag) ?? undefined;
        setStylePreview({ tag: entry.tag, meaning, left, top, status: result ? "ready" : "empty", result });
        return;
      }
      setStylePreview({ tag: entry.tag, meaning, left, top, status: "loading" });
      void window.naiDesktop.artistLabStylePreview(entry.tag)
        .then((result) => {
          stylePreviewCacheRef.current.set(entry.tag, result);
          setStylePreview((current) => current?.tag === entry.tag
            ? { ...current, status: result ? "ready" : "empty", result: result ?? undefined }
            : current);
        })
        .catch(() => {
          stylePreviewCacheRef.current.set(entry.tag, null);
          setStylePreview((current) => current?.tag === entry.tag
            ? { ...current, status: "empty", result: undefined }
            : current);
        });
    }, 180);
  };
  const restoreDrawDefaults = () => {
    setSession((current) => ({
      ...current,
      ...RANDOM_V5_DEFAULTS,
      count: 8,
      includeFranchiseStyles: false,
      mutateAuxiliary: false,
      seedMode: "fixed",
      seed: 246813579,
      drawSeed: freshSeed(),
    }));
    setMessage(resetText.done);
  };
  const patchGeneration = <K extends keyof GenerateParams>(
    key: K,
    value: GenerateParams[K],
  ) =>
    setSession((current) => {
      const generationParams = { ...current.generationParams, [key]: value };
      if (key === "qualityToggle") {
        generationParams.qualityPreset = value ? "standard" : "none";
      }
      if (key === "model" && !String(value).startsWith("nai-diffusion-5")) {
        if (generationParams.qualityPreset === "light") {
          generationParams.qualityPreset = "standard";
        }
        generationParams.transparentBackground = false;
      }
      generationParams.qualityToggle = generationParams.qualityPreset !== "none";
      return { ...current, generationParams };
    });
  const switchGallery = (favorites: boolean) => {
    setShowFavorites(favorites);
  };
  const rememberScrollTop = () => {
    scrollTopToRestoreRef.current = scrollRef.current?.scrollTop ?? null;
  };
  useLayoutEffect(() => {
    const scrollTop = scrollTopToRestoreRef.current;
    const scroller = scrollRef.current;
    if (scrollTop === null || !scroller) return;
    scrollTopToRestoreRef.current = null;
    scroller.scrollTop = Math.min(scrollTop, Math.max(0, scroller.scrollHeight - scroller.clientHeight));
  });

  useEffect(() => {
    // Persist only the tiny selection record immediately; do not serialize image history on each draw.
    try {localStorage.setItem(CATALOG_SELECTION_KEY,JSON.stringify({count:session.poolSize,mode:session.poolMode,seed:session.poolSeed}));}
    catch {setCatalogMessage(selectionText.settingsFailed);}
  }, [session.poolSize,session.poolMode,session.poolSeed,selectionText.settingsFailed]);
  useEffect(() => {
    sessionCache = session;
    sessionRef.current = session;
    if (persistenceTimerRef.current !== null) window.clearTimeout(persistenceTimerRef.current);
    persistenceTimerRef.current = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionRef.current));
      persistenceTimerRef.current = null;
    }, 300);
  }, [session]);
  useEffect(() => {
    if (!customTagLibraryOpen) return;
    let cancelled = false;
    const requestId = ++catalogRequestRef.current;
    setCatalogItems([]);
    setCatalogTotal(0);
    setCatalogLoadingMore(false);
    setCatalogLoading(true);
    if (catalogResultsRef.current) catalogResultsRef.current.scrollTop = 0;
    const timer = window.setTimeout(() => {
      void window.naiDesktop
        .artistStyleCatalog(
          dynamicCatalogScope,
          customTagQuery,
          0,
          ARTIST_STYLE_CATALOG_PAGE_SIZE,
        )
        .then((result) => {
          if (cancelled || requestId !== catalogRequestRef.current) return;
          setCatalogItems(result.items);
          setCatalogTotal(result.total);
          setCatalogSource(result.source);
        })
        .catch(() => {
          if (cancelled || requestId !== catalogRequestRef.current) return;
          setCatalogItems([]);
          setCatalogTotal(0);
          setCatalogSource("none");
        })
        .finally(() => {
          if (!cancelled && requestId === catalogRequestRef.current) setCatalogLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [customTagLibraryOpen, customTagQuery, dynamicCatalogScope]);
  useEffect(() => () => {
    if (stylePreviewTimerRef.current !== null) window.clearTimeout(stylePreviewTimerRef.current);
  }, []);
  useEffect(() => {
    localStorage.setItem(
      "langbai.artist-lab.random.view.v1",
      showFavorites ? "favorites" : "results",
    );
  }, [showFavorites]);
  useEffect(() => {
    const syncFavorites = (event: Event) => {
      const collection = (event as CustomEvent<{ collection?: string }>).detail?.collection;
      if (collection !== "random") return;
      setSession((current) => ({
        ...current,
        favorites: loadArtistFavorites("random"),
      }));
    };
    window.addEventListener(ARTIST_FAVORITES_CHANGED_EVENT, syncFavorites);
    return () => window.removeEventListener(ARTIST_FAVORITES_CHANGED_EVENT, syncFavorites);
  }, []);
  useEffect(() => {
    if (!previewResult) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewResult(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [previewResult]);
  useEffect(() => () => {
    if (copiedTimerRef.current !== null) {
      window.clearTimeout(copiedTimerRef.current);
    }
    if (persistenceTimerRef.current !== null) window.clearTimeout(persistenceTimerRef.current);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionRef.current));
  }, []);

  const interpolate = (value: string, values: Record<string, unknown>) => Object.entries(values).reduce((out, [key, replacement]) => out.replaceAll(`{${key}}`, String(replacement)), value);
  const categoryLabels = useMemo(() => {
    const values = text.categories.split("|");
    return Object.fromEntries((["artStyle", "medium", "color", "lighting"] as StyleMutationCategory[]).map((key, index) => [key, values[index] ?? key])) as Record<StyleMutationCategory, string>;
  }, [text.categories]);

  const loadPool = async (seed = sessionRef.current.poolSeed) => {
    const request = ++poolRequestRef.current;
    setLoading(true); setPoolFailed(false);
    try {
      const current=sessionRef.current;
      const result=await window.naiDesktop.artistLabCatalogSelect(current.poolSize,current.poolMode,seed);
      if(request!==poolRequestRef.current)return;
      setPool(result.items);setPoolSnapshot(result);
      setLatestCatalog(previous=>previous && previous.savedAt>result.catalog.savedAt?previous:result.catalog);
    } catch {if(request===poolRequestRef.current)setPoolFailed(true);}
    finally {if(request===poolRequestRef.current)setLoading(false);}
  };
  const drawPool = () => {
    const seed=freshSeed();patch({poolSeed:seed});void loadPool(seed);
  };
  const updateCatalog = async () => {
    setConfirmCatalogUpdate(false);setUpdatingCatalog(true);setCatalogMessage("");setPoolProgress(null);
    const id=crypto.randomUUID();poolSyncIdRef.current=id;
    try {
      const catalog=await window.naiDesktop.artistLabCatalogUpdate(id);
      if(poolSyncIdRef.current===id) {setLatestCatalog(catalog);setCatalogMessage(selectionText.updated);}
    }
    catch (error) {if(poolSyncIdRef.current===id)setCatalogMessage(formatCatalogUpdateError(error,language));}
    finally {if(poolSyncIdRef.current===id){setUpdatingCatalog(false);poolSyncIdRef.current="";}}
  };
  useEffect(() => {
    const unsubscribe = window.naiDesktop.onArtistPoolSyncProgress(progress => {
      if (progress.requestId === poolSyncIdRef.current) setPoolProgress(progress);
    });
    void loadPool();
    return () => {
      poolRequestRef.current++; unsubscribe();
      const updateId=poolSyncIdRef.current;poolSyncIdRef.current="";
      if (updateId) void window.naiDesktop.artistLabCatalogCancel(updateId).catch(() => undefined);
    };
  }, []);

  const likedArtists = useMemo(
    () => session.favorites.flatMap((item) => item.artists.map((artist) => artist.name)),
    [session.favorites],
  );
  const likedMutations = useMemo(
    () => session.mutateAuxiliary
      ? session.favorites.flatMap((item) => (item.variant ?? (item.mutations.length > 0 ? "mutated" : "plain")) === "mutated" ? item.mutations : [])
      : [],
    [session.favorites, session.mutateAuxiliary],
  );
  const planned = useMemo(() => generatePopularArtistRecipes(pool, {
    count: session.count,
    minArtists: session.artistMinCount,
    maxArtists: session.artistMaxCount,
    artistWeightMin: session.artistWeightMin,
    artistWeightMax: session.artistWeightMax,
    artistWeightDistribution: session.weightControlMode === "advanced" ? {
      min: session.artistWeightMin,
      max: session.artistWeightMax,
      mode: session.artistWeightMode,
      leftDispersion: session.artistWeightLeftDispersion,
      rightDispersion: session.artistWeightRightDispersion,
      softBalance: session.artistWeightSoftBalance,
    } : undefined,
    auxiliaryPrompt: session.auxiliaryPrompt,
    customTagPool: session.customTagPool,
    customTagModes: session.customTagModes,
    minRandomCustomTags: session.randomCustomTagMinCount,
    maxRandomCustomTags: session.randomCustomTagMaxCount,
    customTagWeightMin: session.customTagWeightMin,
    customTagWeightMax: session.customTagWeightMax,
    mutateAuxiliary: session.mutateAuxiliary,
    favoriteArtists: session.biasFavorites ? likedArtists : undefined,
    favoriteMutations: session.mutateAuxiliary && session.biasFavorites ? likedMutations : undefined,
    random: createArtistLabRandom(session.drawSeed),
  }), [pool, session.count, session.artistMinCount, session.artistMaxCount, session.artistWeightMin, session.artistWeightMax, session.weightControlMode, session.artistWeightMode, session.artistWeightLeftDispersion, session.artistWeightRightDispersion, session.artistWeightSoftBalance, session.auxiliaryPrompt, session.customTagPool, JSON.stringify(session.customTagModes), session.randomCustomTagMinCount, session.randomCustomTagMaxCount, session.customTagWeightMin, session.customTagWeightMax, session.mutateAuxiliary, session.biasFavorites, likedArtists.join("|"), likedMutations.map((item) => `${item.category}:${item.value}:${item.weight}`).join("|"), session.drawSeed]);
  const plannedComparisons = useMemo(
    () => expandArtistRecipeComparisons(planned, session.mutateAuxiliary),
    [planned, session.mutateAuxiliary],
  );

  const deleteTemporaryFiles = async (paths: string[]) => {
    const workers = Array.from({ length: Math.min(6, paths.length) }, async (_, worker) => {
      for (let index = worker; index < paths.length; index += 6) {
        await window.naiDesktop.artistLabDeleteTemporary(paths[index]).catch(() => undefined);
      }
    });
    await Promise.allSettled(workers);
  };

  const clearCurrent = () => {
    const temporary = session.results.filter((item) => !item.liked && item.image?.filePath).map((item) => item.image!.filePath);
    // Detach immediately so clearing a large draw never waits on hundreds of
    // filesystem IPC calls. Cleanup remains bounded in the background.
    patch({ results: [] });
    void deleteTemporaryFiles(temporary);
  };

  const draw = async (fromLikes = false) => {
    if (fromLikes && likedArtists.length === 0) return setMessage(text.needLikes);
    clearCurrent();
    patch({ drawSeed: freshSeed() + (fromLikes ? likedArtists.length : 0), biasFavorites: fromLikes });
  };

  const fixedParams = (seed: number) => ({
    ...session.generationParams,
    positivePrompt: session.basePrompt.trim(),
    stylePrompt: "",
    seedMode: "fixed" as const,
    seed,
  });
  const extras = { vibeImages: [], charCaptions: [], preciseReferences: [] };

  const generateOne = async (recipe: RandomResult) => {
    const id = recipe.id;
    const requestParams = { ...fixedParams(recipe.generationSeed ?? session.seed), stylePrompt: recipe.prompt };
    setSession((current) => ({ ...current, results: current.results.map((item) => item.id === id ? { ...item, status: "generating", error: undefined, generationModel: requestParams.model } : item) }));
    try {
      const generated = await window.naiDesktop.generateArtistLab(requestParams, extras, "random");
      const image = generated.items[0];
      if (!generated.ok || !image) throw new Error(generated.message);
      setSession((current) => ({ ...current, results: current.results.map((item) => item.id === id ? { ...item, image, status: "done", error: undefined, generationModel: image.model || requestParams.model } : item) }));
    } catch (error: any) {
      setSession((current) => ({ ...current, results: current.results.map((item) => item.id === id ? { ...item, status: "failed", error: errorText(error) } : item) }));
    }
  };

  const runRecipes = async (
    recipes: GeneratedArtistRecipe[],
    compareMutations: boolean,
  ) => {
    clearCurrent();
    const batchId = freshSeed().toString(36);
    const comparisons = expandArtistRecipeComparisons(recipes, compareMutations);
    const pairSeeds = new Map<string, number>();
    const pending: RandomResult[] = comparisons.map((recipe, index) => ({
      ...recipe,
      id: `${batchId}-${recipe.id}`,
      pairId: `${batchId}-${recipe.pairId}`,
      sequence: compareMutations ? Math.floor(index / 2) + 1 : index + 1,
      status: "pending",
      generationModel: session.generationParams.model,
      generationSeed: (() => {
        const existing = pairSeeds.get(recipe.pairId);
        if (existing != null) return existing;
        const seed = session.seedMode === "fixed" ? session.seed : freshNaiSeed();
        pairSeeds.set(recipe.pairId, seed);
        return seed;
      })(),
    }));
    rememberScrollTop();
    patch({ results: pending });
    setRunning(true);
    cancelRef.current = false;
    for (const result of pending) {
      if (cancelRef.current) break;
      await generateOne(result);
    }
    rememberScrollTop();
    setRunning(false);
    await Promise.allSettled([refreshAccount()]);
    if (!cancelRef.current) setMessage(text.complete);
  };

  const run = async (fromLikes = false) => {
    if (pool.length === 0) return setMessage(text.needPool);
    if (!session.basePrompt.trim()) return setMessage(text.needPrompt);
    if (fromLikes && likedArtists.length === 0) return setMessage(text.needLikes);
    const recipes = fromLikes ? generatePopularArtistRecipes(pool, {
      count: session.count,
      minArtists: session.artistMinCount,
      maxArtists: session.artistMaxCount,
      artistWeightMin: session.artistWeightMin,
      artistWeightMax: session.artistWeightMax,
      artistWeightDistribution: session.weightControlMode === "advanced" ? {
        min: session.artistWeightMin,
        max: session.artistWeightMax,
        mode: session.artistWeightMode,
        leftDispersion: session.artistWeightLeftDispersion,
        rightDispersion: session.artistWeightRightDispersion,
        softBalance: session.artistWeightSoftBalance,
      } : undefined,
      auxiliaryPrompt: session.auxiliaryPrompt,
      customTagPool: session.customTagPool,
      customTagModes: session.customTagModes,
      minRandomCustomTags: session.randomCustomTagMinCount,
      maxRandomCustomTags: session.randomCustomTagMaxCount,
      customTagWeightMin: session.customTagWeightMin,
      customTagWeightMax: session.customTagWeightMax,
      mutateAuxiliary: session.mutateAuxiliary,
      favoriteArtists: likedArtists,
      favoriteMutations: session.mutateAuxiliary ? likedMutations : undefined,
      random: createArtistLabRandom(freshSeed()),
    }) : planned;
    await runRecipes(recipes, session.mutateAuxiliary);
  };

  const runWeightTuning = async () => {
    if (!session.basePrompt.trim()) return setMessage(text.needPrompt);
    const recipes = randomizeArtistRecipeWeights(
      session.weightTuneInput,
      session.weightTuneCount,
      session.weightVariation,
      createArtistLabRandom(freshSeed()),
      {
        customTagPool: session.customTagPool,
        customTagModes: session.customTagModes,
        minRandomCustomTags: session.randomCustomTagMinCount,
        maxRandomCustomTags: session.randomCustomTagMaxCount,
        customTagWeightMin: session.customTagWeightMin,
        customTagWeightMax: session.customTagWeightMax,
      },
    );
    if (!recipes.length) return setMessage(tuneText.noArtists);
    await runRecipes(recipes, false);
  };

  const retry = async (result: RandomResult) => {
    if (running || result.status !== "failed") return;
    rememberScrollTop();
    setRunning(true);
    cancelRef.current = false;
    await generateOne(result);
    rememberScrollTop();
    setRunning(false);
    await Promise.allSettled([refreshAccount()]);
  };

  const saveFavorite = async (result: RandomResult) => {
    if (!result.image || result.liked || result.saving) return;
    setSession((current) => ({ ...current, results: current.results.map((item) => item.id === result.id ? { ...item, saving: true } : item) }));
    try {
      const image = await window.naiDesktop.artistLabPromoteFavorite(result.image);
      const saved = { ...result, image, liked: true, saving: false };
      addArtistFavorite("random", saved);
      setSession((current) => {
        return {
          ...current,
          results: current.results.map((item) => item.id === result.id ? saved : item),
          favorites: current.favorites.some((item) => item.id === result.id) ? current.favorites : [saved, ...current.favorites],
        };
      });
      await refreshHistory();
    } catch (error: any) {
      setSession((current) => ({ ...current, results: current.results.map((item) => item.id === result.id ? { ...item, saving: false } : item) }));
      setMessage(errorText(error));
    }
  };

  const removeFavorite = async (result: RandomResult) => {
    if (!result.image) return;
    const previousFavorites = session.favorites;
    const previousResults = session.results;
    setSession((current) => ({
      ...current,
      favorites: current.favorites.filter((item) => item.id !== result.id),
      results: current.results.filter((item) => item.id !== result.id),
    }));
    removeArtistFavorite("random", result.id);
    const deleted = await deleteHistory(result.image.id);
    if (deleted) setMessage(text.removed);
    else {
      const previous = previousFavorites.find((item) => item.id === result.id);
      if (previous) addArtistFavorite("random", previous);
      setSession((current) => ({ ...current, favorites: previousFavorites, results: previousResults }));
    }
  };

  const batchDone = session.results.filter((item) => item.status === "done" || item.status === "failed").length;
  const resultModel = (result: RandomResult) => result.generationModel || result.image?.model || "unknown";
  const applicableResultModel = (result: RandomResult): GenerateParams["model"] => {
    const value = resultModel(result);
    return NAI_MODELS.some((item) => item.value === value)
      ? value as GenerateParams["model"]
      : session.generationParams.model;
  };
  const modelLabel = (model: string) => NAI_MODELS.find((item) => item.value === model)?.label ?? model;
  const previewItems=(showFavorites?session.favorites:session.results).filter(item=>item.image);
  const favoriteModels = [...new Set(session.favorites.map(resultModel))];
  const effectiveFavoriteModelFilter = favoriteModelFilter === "all" || favoriteModels.includes(favoriteModelFilter)
    ? favoriteModelFilter
    : "all";
  const visibleFavorites = effectiveFavoriteModelFilter === "all"
    ? session.favorites
    : session.favorites.filter((item) => resultModel(item) === effectiveFavoriteModelFilter);
  const favoriteGroups = favoriteModels
    .filter((model) => effectiveFavoriteModelFilter === "all" || effectiveFavoriteModelFilter === model)
    .map((model) => ({ model, items: visibleFavorites.filter((item) => resultModel(item) === model) }));
  const variantOf = (result: Pick<RandomResult, "variant" | "mutations">): ArtistRecipeVariant => result.variant ?? (result.mutations.length > 0 ? "mutated" : "plain");
  const artistString = (result: Pick<RandomResult, "prompt">) => formatArtistCardTags(result);
  const fullPrompt = (result: RandomResult) => formatArtistFullPrompt(result, session.basePrompt);
  const copyResult = async (value: string, action: string, feedback: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedAction(action);
    setMessage(feedback);
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => {
      setCopiedAction((current) => current === action ? "" : current);
    }, 1800);
  };
  const renderMutationTerms = (result: GeneratedArtistRecipe) => result.mutations.length > 0 && <div className="artist-mutation-block"><b>{text.mutation}</b><div>{result.mutations.map((token, index) => <span key={`${token.value}-${index}`}><small>{categoryLabels[token.category]}</small>{token.weight}::{token.value}</span>)}</div></div>;
  const renderFranchiseTerms = (result: GeneratedArtistRecipe) => (result.franchiseStyles?.length ?? 0) > 0 && <div className="artist-mutation-block artist-franchise-block"><b>{text.franchiseTerms}</b><div>{result.franchiseStyles.map((token, index) => <span key={`${token.value}-${index}`}><small>Danbooru</small>{token.weight}::{token.value}</span>)}</div></div>;
  const catalogMeaning = (entry: TagSuggestion) => {
    if (entry.description?.trim()) {
      return entry.description.trim();
    }
    const readable = entry.tag
      .replace(/_\(style\)$/i, "")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
    return `${readable} · ${entry.category === 3 ? customTagText.copyright : customTagText.styleTags}`;
  };
  const catalogSourceLabel = catalogSource === "catalog"
    ? customTagText.sourceCatalog
    : catalogSource === "bilingual"
      ? customTagText.sourceBilingual
      : customTagText.sourceNone;
  const renderCard = (result: RandomResult, favorite = false) => {
    const variant = variantOf(result);
    const artistCopyKey = `${result.id}:artists`;
    const fullCopyKey = `${result.id}:full`;
    const dimensions = {
      width: result.image?.width || session.generationParams.width,
      height: result.image?.height || session.generationParams.height,
    };
    return <article key={result.id} className={`artist-candidate ${result.status} artist-variant-${variant}`}><header className="artist-candidate-header"><div><b>#{String(result.sequence).padStart(2, "0")} · {variant === "mutated" ? text.variantMutated : text.variantPlain}</b><small>{modelLabel(resultModel(result))} · {dimensions.width}×{dimensions.height}</small></div><span>{favorite || result.liked ? text.saved : text[result.status]}</span></header><div className="artist-candidate-media" style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}` }}>{result.image ? <><img src={result.image.fileUrl} loading="lazy" decoding="async" title={text.previewImage} onDoubleClick={() => setPreviewResult(result)} alt={`${variant === "mutated" ? text.variantMutated : text.variantPlain}: ${result.prompt}`} /><button type="button" className="artist-candidate-preview-button" aria-label={text.previewImage} title={text.previewImage} onClick={() => setPreviewResult(result)}><Icon name="search" /></button></> : <div className="artist-candidate-placeholder">{text[result.status]}</div>}</div>{renderFranchiseTerms(result)}{renderMutationTerms(result)}<div className="artist-string-block"><div className="artist-copy-actions"><button type="button" className={copiedAction === artistCopyKey ? "copied" : ""} onClick={() => { void copyResult(artistString(result), artistCopyKey, text.copiedArtists); }}>{copiedAction === artistCopyKey ? tuneText.copied : text.copyArtists}</button><button type="button" className={copiedAction === fullCopyKey ? "copied" : ""} onClick={() => { void copyResult(fullPrompt(result), fullCopyKey, text.copiedFull); }}>{copiedAction === fullCopyKey ? tuneText.copied : text.copyFull}</button></div><code>{artistString(result)}</code></div><small className={`artist-error ${result.error ? "" : "empty"}`} title={result.error}>{result.error ?? "\u00a0"}</small><div className="artist-candidate-actions">{favorite ? <Button variant="ghost" onClick={() => void removeFavorite(result)}>{text.remove}</Button> : result.status === "failed" ? <Button variant="ghost" disabled={running} onClick={() => void retry(result)}>{text.retry}</Button> : <Button variant="ghost" disabled={result.status !== "done" || result.liked || result.saving} onClick={() => void saveFavorite(result)}>{result.saving ? text.saving : result.liked ? text.saved : text.like}</Button>}<Button variant="primary" disabled={result.status !== "done"} onClick={() => { applyParams({ ...session.generationParams, model: applicableResultModel(result), positivePrompt: session.basePrompt.trim(), stylePrompt: result.prompt, seed: result.generationSeed ?? session.seed, seedMode: "fixed" }); setMessage(text.applied); }}>{text.apply}</Button></div></article>;
  };

  return <>
  <main ref={scrollRef} className="artist-lab random-artist-lab">
    <header className="artist-lab-hero"><div><h2>{text.title}</h2><p>{text.subtitle}</p></div><Button onClick={onBack}>{text.back}</Button></header>
    <section className="artist-lab-panel random-pool-summary">
      <div>
        <h3>{selectionText.title}</h3>
        <strong>{loading ? selectionText.load : interpolate(text.ready, { count: onlinePool.length })}</strong>
        <p>{selectionText.description}</p>
        <ArtistCatalogStatus snapshot={poolSnapshot} latestCatalog={latestCatalog} language={language} />
        <small className={`artist-pool-warning ${session.poolSize >= 50000 ? "is-large" : ""}`}>{selectionText.warning}</small>
        {poolFailed && <small role="alert">{selectionText.failed}</small>}
        {poolSnapshot && (poolSnapshot.requested !== session.poolSize || poolSnapshot.mode !== session.poolMode) && <small>{selectionText.pending}</small>}
        {updatingCatalog && <small role="status">{poolText.progress.replace("{count}",(poolProgress?.loaded??0).toLocaleString(language)).replace("{pages}",String(poolProgress?.pages??0))}</small>}
        {catalogMessage && <small role="status">{catalogMessage}</small>}
      </div>
      <div className="artist-pool-actions artist-catalog-actions">
        <label>{selectionText.mode}<SelectMenuCompat value={session.poolMode} disabled={loading||running} onChange={event=>patch({poolMode:event.target.value as ArtistCatalogMode})}><option value="random">{selectionText.random}</option><option value="ranked">{selectionText.ranked}</option></SelectMenuCompat></label>
        <label>{selectionText.count}<NumericDraftInput type="number" aria-label={selectionText.count} value={session.poolSize} min={1} max={MAX_ARTIST_POOL_COUNT} step={100} disabled={loading||running} normalize={normalizeArtistPoolCount} onCommit={poolSize=>patch({poolSize})}/></label>
        <Button variant="primary" data-testid="artist-pool-refresh" onClick={drawPool} disabled={loading||running}>{selectionText.draw}</Button>
        {updatingCatalog ? <Button onClick={()=>void window.naiDesktop.artistLabCatalogCancel(poolSyncIdRef.current).catch(error=>setCatalogMessage(formatCatalogUpdateError(error,language)))}>{poolText.cancel}</Button> : <Button data-testid="artist-catalog-update" onClick={()=>setConfirmCatalogUpdate(true)} disabled={running}>{selectionText.update}</Button>}
        {confirmCatalogUpdate && <div className="artist-catalog-confirm"><small>{selectionText.confirm}</small><Button data-testid="artist-catalog-confirm" onClick={()=>void updateCatalog()}>{selectionText.start}</Button><Button onClick={()=>setConfirmCatalogUpdate(false)}>{selectionText.cancel}</Button></div>}
      </div>
    </section>
    <section className="artist-lab-panel">
      <label className="check-field"><input type="checkbox" checked={session.useCustomArtists??false} disabled={running} onChange={e=>patch({useCustomArtists:e.target.checked})}/>{customPoolText.enable}</label>
      {session.useCustomArtists&&<label className="field"><span>{customPoolText.list} · {customPool.length}</span><textarea aria-label={customPoolText.list} value={session.customArtists??""} disabled={running} placeholder="{artist:artist_one}, {artist:artist_two}" onChange={e=>patch({customArtists:e.target.value})}/><small>{customPoolText.hint}</small></label>}
    </section>
    <section className="artist-lab-panel random-artist-settings">
      <div className="random-settings-reset wide"><small>{resetText.hint}</small><Button type="button" variant="ghost" onClick={restoreDrawDefaults}><Icon name="refresh" />{resetText.label}</Button></div>
      <div className="random-fixed-prompt-grid wide">
        <div className="random-fixed-prompt-card">
          <div className="random-fixed-prompt-card-header"><span>{text.base}</span><PositivePromptPresetControl value={session.basePrompt} onApply={(basePrompt) => patch({ basePrompt })} variant="field" /></div>
          <textarea aria-label={text.base} value={session.basePrompt} onChange={(event) => patch({ basePrompt: event.target.value })} />
        </div>
        <div className="random-fixed-prompt-card">
          <div className="random-fixed-prompt-card-header"><span>{text.auxiliary}</span></div>
          <textarea aria-label={text.auxiliary} value={session.auxiliaryPrompt} onChange={(event) => patch({ auxiliaryPrompt: event.target.value })} />
        </div>
      </div>
      <details
        className="random-custom-tag-workbench wide"
        open={customTagLibraryOpen}
        onToggle={(event) => {
          setCustomTagLibraryOpen(event.currentTarget.open);
          if (!event.currentTarget.open) hideStylePreview();
        }}
      >
        <summary className="random-custom-tag-header" title={customTagText.collapse}>
          <span className="random-custom-tag-icon" aria-hidden="true"><Icon name="template" /></span>
          <div>
            <h3 id="random-custom-tag-title">{customTagText.library}</h3>
            <p>{customTagText.libraryHint}</p>
          </div>
          <div className="random-custom-tag-stats">
            <b>{interpolate(customTagText.selected, { count: selectedCustomTagValues.length })}</b>
            <small>{customTagText.available}</small>
          </div>
          <span className="random-custom-tag-disclosure" aria-hidden="true"><Icon name="chevronDown" /></span>
        </summary>
        <div className="random-custom-tag-body">
          <div className="random-custom-tag-editor">
            <label>
              <span>{customTagText.title}</span>
              <textarea
                value={session.customTagPool}
                placeholder={customTagText.placeholder}
                onChange={(event) => patch({ customTagPool: event.target.value, drawSeed: freshSeed() })}
              />
              <small>{customTagText.hint}</small>
            </label>
            <fieldset className="random-custom-tag-weight-range">
              <legend>{customTagText.range}</legend>
              <label><span>{text.min}</span><NumericDraftInput min={0.1} max={10} step={0.05} value={session.customTagWeightMin} normalize={(value) => clampRecipeWeight(value, RANDOM_V5_DEFAULTS.customTagWeightMin)} onCommit={(customTagWeightMin) => patch({ customTagWeightMin, drawSeed: freshSeed() })} /></label>
              <label><span>{text.max}</span><NumericDraftInput min={0.1} max={10} step={0.05} value={session.customTagWeightMax} normalize={(value) => clampRecipeWeight(value, RANDOM_V5_DEFAULTS.customTagWeightMax)} onCommit={(customTagWeightMax) => patch({ customTagWeightMax, drawSeed: freshSeed() })} /></label>
            </fieldset>
          </div>

          {selectedCustomTagValues.length > 0 && <section className="random-custom-tag-selected" aria-label={customTagText.selectedTitle}>
            <header>
              <b>{customTagText.selectedTitle}</b>
              <button type="button" onClick={() => patch({ customTagPool: "", customTagModes: {}, drawSeed: freshSeed() })}>{customTagText.clear}</button>
            </header>
            <div>
              {selectedCustomTagValues.map((tag) => {
                const mode = customTagMode(tag);
                return <article key={tag.toLocaleLowerCase()}>
                  <b title={tag}>{tag}</b>
                  <span role="group" aria-label={`${tag}: ${customTagText.selectedTitle}`}>
                    <button type="button" className={mode === "always" ? "active" : ""} onClick={() => setCustomTagMode(tag, "always")}>{customTagText.always}</button>
                    <button type="button" className={mode === "random" ? "active" : ""} onClick={() => setCustomTagMode(tag, "random")}>{customTagText.random}</button>
                  </span>
                  <button type="button" className="remove" aria-label={`${customTagText.clear}: ${tag}`} onClick={() => toggleLibraryTag(tag)}><Icon name="close" /></button>
                </article>;
              })}
            </div>
          </section>}

          {selectedRandomTagCount > 0 && <fieldset className="random-custom-tag-random-range">
            <legend>{customTagText.randomRange}</legend>
            <label><span>{text.min}</span><NumericDraftInput min={0} max={selectedRandomTagCount} step={1} value={session.randomCustomTagMinCount} normalize={(value) => clampRecipeCount(value, 1, 0)} onCommit={(randomCustomTagMinCount) => patch({ randomCustomTagMinCount, drawSeed: freshSeed() })} /></label>
            <label><span>{text.max}</span><NumericDraftInput min={0} max={selectedRandomTagCount} step={1} value={session.randomCustomTagMaxCount} normalize={(value) => clampRecipeCount(value, 3, 0)} onCommit={(randomCustomTagMaxCount) => patch({ randomCustomTagMaxCount, drawSeed: freshSeed() })} /></label>
          </fieldset>}

          <div className="random-custom-tag-toolbar">
            <label className="random-custom-tag-search">
              <Icon name="search" />
              <input
                type="search"
                value={customTagQuery}
                placeholder={customTagText.search}
                onChange={(event) => setCustomTagQuery(event.target.value)}
              />
              {customTagQuery && <button type="button" aria-label={customTagText.clear} onClick={() => setCustomTagQuery("")}><Icon name="clear" /></button>}
            </label>
            <div className="random-custom-tag-toolbar-status" aria-live="polite">
              <span>{`${visibleCustomTagCount} / ${Math.max(catalogTotal, visibleCustomTagCount)}`}</span>
              <small>{catalogSourceLabel}</small>
            </div>
          </div>
          <div className="random-custom-tag-categories" role="tablist" aria-label={customTagText.library}>
            <button type="button" role="tab" aria-selected={customTagCategory === "all"} className={customTagCategory === "all" ? "active" : ""} onClick={() => setCustomTagCategory("all")}><span>{customTagText.all}</span><em>{customTagCategory === "all" && !catalogLoading ? catalogTotal : "DB"}</em></button>
            {RANDOM_CUSTOM_TAG_LIBRARY.map((category) => <button key={category.id} type="button" role="tab" aria-selected={customTagCategory === category.id} className={customTagCategory === category.id ? "active" : ""} onClick={() => setCustomTagCategory(category.id)}><span>{customTagCategoryLabel(category, language)}</span><em>{customTagCategory === category.id && !catalogLoading ? catalogTotal : "DB"}</em></button>)}
            <button type="button" role="tab" aria-selected={customTagCategory === "danbooru-style"} className={customTagCategory === "danbooru-style" ? "active" : ""} onClick={() => setCustomTagCategory("danbooru-style")}><span>{customTagText.styleTags}</span><em>{customTagCategory === "danbooru-style" && !catalogLoading ? catalogTotal : "DB"}</em></button>
            <button type="button" role="tab" aria-selected={customTagCategory === "copyright"} className={customTagCategory === "copyright" ? "active" : ""} onClick={() => setCustomTagCategory("copyright")}><span>{customTagText.copyright}</span><em>{customTagCategory === "copyright" && !catalogLoading ? catalogTotal : "DB"}</em></button>
          </div>
          <div className="random-custom-tag-results" ref={catalogResultsRef}>
            {catalogLoading
              ? <div className="random-custom-tag-empty"><span className="spinner" /><span>{customTagText.loading}</span></div>
              : visibleCatalogItems.length === 0
                ? <div className="random-custom-tag-empty"><Icon name="search" /><span>{customTagText.noResults}</span></div>
                : <section aria-label={dynamicCatalogScope === "copyright" ? customTagText.copyright : customTagText.library}>
                  <div className="random-custom-tag-grid">{visibleCatalogItems.map((entry) => {
                    const selected = selectedCustomTags.has(entry.tag.toLocaleLowerCase());
                    const mode = customTagMode(entry.tag);
                    const meaning = catalogMeaning(entry);
                    const canPreview = /_\(style\)$/i.test(entry.tag);
                    return <article
                      key={entry.tag}
                      className={`${selected ? "selected" : ""}${canPreview ? " has-preview" : ""}`}
                      onPointerEnter={canPreview ? (event) => showStylePreview(entry, meaning, event) : undefined}
                      onPointerLeave={canPreview ? hideStylePreview : undefined}
                    >
                      <button type="button" className="random-custom-tag-select" aria-pressed={selected} aria-label={`${entry.tag}: ${meaning}`} onClick={() => toggleLibraryTag(entry.tag)}>
                        <span className="random-custom-tag-check"><Icon name={selected ? "check" : "plus"} /></span>
                        <span><b>{entry.tag}</b><small>{meaning}</small></span>
                        <em>{canPreview ? <Icon name="image" /> : entry.count > 0 ? entry.count.toLocaleString("zh-CN") : ""}</em>
                      </button>
                      {selected && <span className="random-custom-tag-card-modes">
                        <button type="button" className={mode === "always" ? "active" : ""} onClick={() => setCustomTagMode(entry.tag, "always")}>{customTagText.always}</button>
                        <button type="button" className={mode === "random" ? "active" : ""} onClick={() => setCustomTagMode(entry.tag, "random")}>{customTagText.random}</button>
                      </span>}
                    </article>;
                  })}</div>
                  {catalogItems.length < catalogTotal && <div className="random-custom-tag-load-more">
                    <Button type="button" variant="ghost" disabled={catalogLoadingMore} onClick={() => void loadMoreCatalog()}>
                      {catalogLoadingMore && <span className="spinner" />}{customTagText.loadMore}
                    </Button>
                  </div>}
                </section>}
          </div>
        </div>
      </details>
      <label className="random-check wide"><input type="checkbox" checked={session.mutateAuxiliary} onChange={(event) => patch({ mutateAuxiliary: event.target.checked })} /><span><b>{text.mutate}</b><small>{text.mutateHint}</small></span></label>
      <label><span>{text.count}</span><NumericDraftInput min={1} step={1} value={session.count} normalize={(value) => positiveInteger(value, 1)} onCommit={(count) => patch({ count })} /><small>{text.unlimited}</small></label>
      <fieldset className="random-range-fields"><legend>{text.range}</legend><label><span>{text.min}</span><NumericDraftInput min={1} max={20} step={1} value={session.artistMinCount} normalize={(value) => clampRecipeCount(value, 3, 1)} onCommit={(artistMinCount) => patch({ artistMinCount, drawSeed: freshSeed() })} /></label><label><span>{text.max}</span><NumericDraftInput min={1} max={20} step={1} value={session.artistMaxCount} normalize={(value) => clampRecipeCount(value, 7, 1)} onCommit={(artistMaxCount) => patch({ artistMaxCount, drawSeed: freshSeed() })} /></label></fieldset>
      <fieldset className="random-range-fields"><legend>{text.artistWeight}</legend><label><span>{text.min}</span><NumericDraftInput min={0.1} max={10} step={0.05} value={session.artistWeightMin} normalize={(value) => clampRecipeWeight(value, RANDOM_V5_DEFAULTS.artistWeightMin)} onCommit={(artistWeightMin) => patch({ artistWeightMin, drawSeed: freshSeed() })} /></label><label><span>{text.max}</span><NumericDraftInput min={0.1} max={10} step={0.05} value={session.artistWeightMax} normalize={(value) => clampRecipeWeight(value, RANDOM_V5_DEFAULTS.artistWeightMax)} onCommit={(artistWeightMax) => patch({ artistWeightMax, drawSeed: freshSeed() })} /></label></fieldset>
      <WeightDistributionControls
        language={language}
        controlMode={session.weightControlMode}
        min={session.artistWeightMin}
        max={session.artistWeightMax}
        mode={session.artistWeightMode}
        leftDispersion={session.artistWeightLeftDispersion}
        rightDispersion={session.artistWeightRightDispersion}
        softBalance={session.artistWeightSoftBalance}
        onModeChange={(weightControlMode) => patch({ weightControlMode, drawSeed: freshSeed() })}
        onChange={(value) => patch({
          ...(value.mode == null ? {} : { artistWeightMode: value.mode }),
          ...(value.leftDispersion == null ? {} : { artistWeightLeftDispersion: value.leftDispersion }),
          ...(value.rightDispersion == null ? {} : { artistWeightRightDispersion: value.rightDispersion }),
          ...(value.softBalance == null ? {} : { artistWeightSoftBalance: value.softBalance }),
          drawSeed: freshSeed(),
        })}
      />
      <fieldset className="random-seed-fields wide"><legend>{text.seedMode}</legend><div className="random-seed-modes"><label><input type="radio" name="artist-seed-mode" checked={session.seedMode === "random"} onChange={() => patch({ seedMode: "random" })} /><span>{text.seedRandom}</span></label><label><input type="radio" name="artist-seed-mode" checked={session.seedMode === "fixed"} onChange={() => patch({ seedMode: "fixed" })} /><span>{text.seedFixed}</span></label></div>{session.seedMode === "fixed" && <div className="random-fixed-seed"><NumericDraftInput aria-label={text.seed} min={1} max={2147483647} step={1} value={session.seed} normalize={(value) => Math.min(2_147_483_647, Math.max(1, Math.floor(value)))} onCommit={(seed) => patch({ seed })} /><Button type="button" variant="ghost" onClick={() => patch({ seedMode: "fixed", seed: freshNaiSeed() })}>{text.randomFixedSeed}</Button></div>}</fieldset>
    </section>
    <details className="artist-lab-panel random-generation-settings" open>
      <summary>
        <span>
          <b>{paramText.title}</b>
          <small>{paramText.hint}</small>
        </span>
        <span className="random-generation-header-actions">
          <Button
            type="button"
            variant="ghost"
            onClick={(event) => {
              event.preventDefault();
              patch({ generationParams: normalizeGenerationParams(params, params) });
            }}
          >
            {paramText.sync}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={async (event) => {
              event.preventDefault();
              if (await confirmAction("仅恢复本页生图参数，保留提示词、图片、收藏、模型与路径。", "恢复默认配置？")) patch({ generationParams: normalizeGenerationParams(undefined, DEFAULT_PARAMS) });
            }}
          >
            {paramText.reset}
          </Button>
        </span>
      </summary>
      <div className="random-generation-grid">
        <label className="wide"><span>{paramText.model}</span><SelectMenuCompat value={session.generationParams.model} onChange={(event) => patchGeneration("model", event.target.value as GenerateParams["model"])}>{NAI_MODELS.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}</SelectMenuCompat></label>
        <fieldset className="random-size-fields">
          <legend>{paramText.size}</legend>
          <div className="random-size-presets" role="group" aria-label={paramText.size}>
            {RANDOM_SIZE_PRESETS.map((preset, index) => {
              const active = session.generationParams.width === preset.width
                && session.generationParams.height === preset.height;
              return <button
                key={`${preset.width}x${preset.height}`}
                type="button"
                className={active ? "active" : ""}
                aria-pressed={active}
                onClick={() => setSession((current) => ({
                  ...current,
                  generationParams: {
                    ...current.generationParams,
                    width: preset.width,
                    height: preset.height,
                  },
                }))}
              >
                <span>{sizeLabels[index]}</span>
                <b>{preset.width}×{preset.height}</b>
              </button>;
            })}
          </div>
          <label><span>{paramText.width}</span><NumericDraftInput min={64} max={maxNAIDimensionFor(session.generationParams.height)} step={64} value={session.generationParams.width} normalize={(value) => snapNAIDimensionWithinArea(value, session.generationParams.height, session.generationParams.width)} onCommit={(value) => patchGeneration("width", value)} /></label>
          <label><span>{paramText.height}</span><NumericDraftInput min={64} max={maxNAIDimensionFor(session.generationParams.width)} step={64} value={session.generationParams.height} normalize={(value) => snapNAIDimensionWithinArea(value, session.generationParams.width, session.generationParams.height)} onCommit={(value) => patchGeneration("height", value)} /></label>
        </fieldset>
        <label><span>{paramText.steps}</span><NumericDraftInput min={1} max={50} step={1} value={session.generationParams.steps} normalize={(value) => Math.max(1, Math.min(50, Math.floor(value)))} onCommit={(value) => patchGeneration("steps", value)} /></label>
        <label><span>{paramText.cfg}</span><NumericDraftInput min={1} max={10} step={0.1} value={session.generationParams.cfgScale} onCommit={(value) => patchGeneration("cfgScale", value)} /></label>
        <label><span>{paramText.rescale}</span><NumericDraftInput min={0} max={1} step={0.01} value={session.generationParams.cfgRescale} onCommit={(value) => patchGeneration("cfgRescale", value)} /></label>
        <label><span>{paramText.sampler}</span><SelectMenuCompat value={session.generationParams.sampler} onChange={(event) => patchGeneration("sampler", event.target.value as GenerateParams["sampler"])}>{NAI_SAMPLERS.map((sampler) => <option key={sampler.value} value={sampler.value}>{sampler.value}</option>)}</SelectMenuCompat></label>
        {supportsNAINoiseScheduleControl(session.generationParams.model) ? <label><span>{paramText.noise}</span><SelectMenuCompat value={session.generationParams.noiseSchedule} onChange={(event) => patchGeneration("noiseSchedule", event.target.value)}><option value="native">native</option><option value="karras">karras</option><option value="exponential">exponential</option></SelectMenuCompat></label> : null}
        <label><span>{paramText.uc}</span><SelectMenuCompat value={session.generationParams.ucPreset} onChange={(event) => patchGeneration("ucPreset", Number(event.target.value) as GenerateParams["ucPreset"])}>{NAI_UC_PRESETS.map((preset, index) => <option key={preset.value} value={preset.value}>{preset.value} · {ucLabels[index]}</option>)}</SelectMenuCompat></label>
        <label className="wide"><span>{paramText.negative}</span><textarea value={session.generationParams.negativePrompt} onChange={(event) => patchGeneration("negativePrompt", event.target.value)} /></label>
        <QualityPresetControl className="wide" language={language} model={session.generationParams.model} value={session.generationParams.qualityPreset} transparentBackground={session.generationParams.transparentBackground} onChange={(value) => patchGeneration("qualityPreset", value)} onTransparentChange={(value) => patchGeneration("transparentBackground", value)} />
        <div className="random-generation-toggles wide">
          {supportsNAIVariety(session.generationParams.model) ? <label><input type="checkbox" checked={session.generationParams.variety} onChange={(event) => patchGeneration("variety", event.target.checked)} /><span>{paramText.variety}</span></label> : null}
          {!isNAIV4PlusModel(session.generationParams.model) ? <><label><input type="checkbox" checked={session.generationParams.smea} onChange={(event) => patchGeneration("smea", event.target.checked)} /><span>{paramText.smea}</span></label><label><input type="checkbox" checked={session.generationParams.smeaDyn} onChange={(event) => patchGeneration("smeaDyn", event.target.checked)} /><span>{paramText.smeaDyn}</span></label></> : null}
        </div>
      </div>
    </details>
    <details className="artist-lab-panel artist-weight-tuner">
      <summary><span><b>{tuneText.title}</b><small>{tuneText.hint}</small></span></summary>
      <div className="artist-weight-tuner-grid">
        <label className="wide"><span>{tuneText.input}</span><textarea value={session.weightTuneInput} placeholder="1::artist:foo ::, 0.8::artist:bar ::," onChange={(event) => patch({ weightTuneInput: event.target.value })} /></label>
        <details className="random-custom-tag-workbench artist-weight-tuner-inline-library wide">
          <summary>
            <span><b>{customTagText.library}</b><small>{interpolate(customTagText.selected, { count: selectedCustomTagValues.length })} · {customTagText.hint}</small></span>
            <Icon name="chevronDown" />
          </summary>
          <div className="random-custom-tag-body">
            <label className="random-custom-tag-search">
              <Icon name="search" />
              <input type="search" value={weightTuneTagQuery} placeholder={customTagText.search} onChange={(event) => setWeightTuneTagQuery(event.target.value)} />
              {weightTuneTagQuery && <button type="button" aria-label={customTagText.clear} onClick={() => setWeightTuneTagQuery("")}><Icon name="clear" /></button>}
            </label>
            <div className="random-custom-tag-categories" role="tablist" aria-label={customTagText.library}>
              {RANDOM_CUSTOM_TAG_LIBRARY.map((category) => <button key={category.id} type="button" role="tab" aria-selected={weightTuneTagCategory === category.id} className={weightTuneTagCategory === category.id ? "active" : ""} onClick={() => setWeightTuneTagCategory(category.id)}><span>{customTagCategoryLabel(category, language)}</span><em>{category.tags.length}</em></button>)}
            </div>
            <div className="random-custom-tag-results">
              <div className="random-custom-tag-grid">{weightTuneLibraryItems.map((entry) => {
                const selected = selectedCustomTags.has(entry.tag.toLocaleLowerCase());
                const mode = customTagMode(entry.tag);
                return <article key={entry.tag} className={selected ? "selected" : ""}>
                  <button type="button" className="random-custom-tag-select" aria-pressed={selected} onClick={() => toggleLibraryTag(entry.tag)}>
                    <span className="random-custom-tag-check"><Icon name={selected ? "check" : "plus"} /></span>
                    <span><b>{entry.tag}</b><small>{customTagMeaning(entry, language)}</small></span>
                  </button>
                  {selected && <span className="random-custom-tag-card-modes">
                    <button type="button" className={mode === "always" ? "active" : ""} onClick={() => setCustomTagMode(entry.tag, "always")}>{customTagText.always}</button>
                    <button type="button" className={mode === "random" ? "active" : ""} onClick={() => setCustomTagMode(entry.tag, "random")}>{customTagText.random}</button>
                  </span>}
                </article>;
              })}</div>
            </div>
          </div>
        </details>
        <label><span>{tuneText.count}</span><NumericDraftInput min={1} step={1} value={session.weightTuneCount} normalize={(value) => positiveInteger(value, 1)} onCommit={(weightTuneCount) => patch({ weightTuneCount })} /></label>
        <label><span>{tuneText.variation}</span><NumericDraftInput min={0} max={100} step={1} value={session.weightVariation} onCommit={(weightVariation) => patch({ weightVariation })} /></label>
        <Button className="artist-weight-tuner-submit" variant="primary" disabled={running || !session.weightTuneInput.trim()} onClick={() => void runWeightTuning()}>{tuneText.generate}</Button>
      </div>
    </details>
    <section className="artist-lab-panel artist-queue-panel"><div className="artist-section-heading"><div><h3>{text.preview}</h3><small>{text.previewHint}</small></div><div className="artist-preview-actions"><b>{interpolate(text.pairSummary, { pairs: planned.length, images: plannedComparisons.length })}</b></div></div>{planned.length === 0 ? <div className="artist-queue-empty">{text.empty}</div> : <ol className="artist-combination-queue">{planned.map((recipe, index) => <li key={recipe.id}><span>#{String(index + 1).padStart(2, "0")}</span><div><b className="artist-ab-label">{text.variantPlain}</b><code>{formatArtistCardTags({ prompt: recipe.basePrompt })}</code>{renderFranchiseTerms(recipe)}{session.mutateAuxiliary && <><b className="artist-ab-label">{text.variantMutated}</b><code>{formatArtistCardTags(recipe)}</code>{renderMutationTerms(recipe)}</>}</div></li>)}</ol>}</section>
    <section className="artist-result-toolbar">
      <div className="artist-result-actions"><Button onClick={() => void draw(false)} disabled={running || pool.length === 0}><Icon name="dice" />{text.draw}</Button>{running ? <Button variant="danger" onClick={() => { cancelRef.current = true; void window.naiDesktop.cancel(); }}>{text.stop}</Button> : <Button variant="primary" disabled={loading || pool.length === 0} onClick={() => void run(false)}>{text.generate}</Button>}<Button disabled={running || likedArtists.length === 0} onClick={() => void draw(true)}>{text.refine}</Button><span>{running ? interpolate(text.running, { done: batchDone, total: session.results.length }) : message}</span></div>
      <nav className="artist-result-tabs" aria-label={`${text.preview} / ${favoriteFolderLabel}`}>
        <button type="button" className={!showFavorites ? "active" : ""} onClick={() => switchGallery(false)}><span>{text.preview}</span><b>{session.results.length}</b></button>
        <button type="button" className={showFavorites ? "active" : ""} onClick={() => switchGallery(true)}><span>{favoriteFolderLabel}</span><b>{session.favorites.length}</b></button>
      </nav>
    </section>
    {!showFavorites && session.results.length > 0 && <section className="artist-candidate-grid">{session.results.map((result) => renderCard(result))}</section>}
    {showFavorites && <section className="artist-lab-panel artist-favorites-panel">
      <div className="artist-section-heading">
        <div><h3>{favoriteFolderLabel}</h3><small>{text.favoritesHint}</small></div>
        <FavoriteStyleExport items={session.favorites}/>
        <div className="artist-favorite-model-filter">
          <span>{text.modelGroup}</span>
          <SelectMenu
            value={effectiveFavoriteModelFilter}
            ariaLabel={text.modelGroup}
            options={[{ value: "all", label: `${text.allModels} (${session.favorites.length})` }, ...favoriteModels.map((model) => ({ value: model, label: `${modelLabel(model)} (${session.favorites.filter((item) => resultModel(item) === model).length})` }))]}
            onChange={setFavoriteModelFilter}
          />
        </div>
      </div>
      {session.favorites.length === 0 ? <div className="artist-queue-empty">{text.needLikes}</div> : favoriteGroups.map((group) => <section className="artist-favorite-model-group" key={group.model}>
        <header><span>{text.modelGroup}</span><b>{modelLabel(group.model)}</b><em>{group.items.length}</em></header>
        <div className="artist-candidate-grid">{group.items.map((result) => renderCard(result, true))}</div>
      </section>)}
    </section>}
  </main>
  {stylePreview && <AppPortal><aside
    className={`artist-style-reference-popover ${stylePreview.status}`}
    style={{ left: stylePreview.left, top: stylePreview.top }}
    role="status"
    aria-live="polite"
  >
    <header><span><Icon name="image" />{stylePreviewText.title}</span><b>{stylePreview.tag}</b></header>
    <div className="artist-style-reference-media">
      {stylePreview.status === "loading"
        ? <span className="artist-style-reference-message"><span className="spinner" />{stylePreviewText.loading}</span>
        : stylePreview.result
          ? <img src={stylePreview.result.imageUrl} alt={`${stylePreviewText.title}: ${stylePreview.tag}`} />
          : <span className="artist-style-reference-message"><Icon name="image" />{stylePreviewText.empty}</span>}
    </div>
    <footer><span>{stylePreview.meaning}</span>{stylePreview.result && <small>{stylePreview.result.width}×{stylePreview.result.height}</small>}</footer>
  </aside></AppPortal>}
  {previewResult?.image && <AppPortal><div className="modal-backdrop artist-result-preview-backdrop" role="dialog" aria-modal="true" aria-label={text.previewImage} onMouseDown={() => setPreviewResult(null)}><div className="artist-result-preview" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="artist-result-preview-close" aria-label={text.back} onClick={() => setPreviewResult(null)}><Icon name="close" /></button><PreviewImageViewer onBackgroundClick={()=>setPreviewResult(null)} images={previewItems.map(item=>({src:item.image!.fileUrl,alt:item.prompt}))} index={Math.max(0,previewItems.findIndex(item=>item.id===previewResult.id))} onIndex={index=>setPreviewResult(previewItems[index])}/><footer><b>{modelLabel(resultModel(previewResult))}</b><span>{variantOf(previewResult) === "mutated" ? text.variantMutated : text.variantPlain} · {previewResult.image.width}×{previewResult.image.height}</span></footer></div></div></AppPortal>}
  </>;
}
