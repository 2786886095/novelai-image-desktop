import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { AppPortal, Button, SelectMenuCompat } from "./components/ui";
import { Icon } from "./components/icons";
import { QualityPresetControl } from "./components/QualityPresetControl";
import { PositivePromptPresetControl } from "./PositivePromptPresets";
import { WeightDistributionControls } from "./components/WeightDistributionControls";
import { DEFAULT_WEIGHT_DISTRIBUTION, type WeightControlMode } from "./weight-distribution";
import { useAppStore } from "./store";
import {
  DEFAULT_PARAMS,
  NAI_MODELS,
  NAI_SAMPLERS,
  NAI_UC_PRESETS,
  isNAIV4PlusModel,
  supportsNAINoiseScheduleControl,
  supportsNAIVariety,
  type AppLanguage,
  type ArtistStyleCatalogScope,
  type ArtistStylePreviewResult,
  type GenerateParams,
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
  type ArtistFavoriteCollection,
  type SharedArtistFavorite,
} from "./artist-favorite-library";
import {
  ensureTrailingPromptComma,
  formatArtistCardTags,
  formatArtistFullPrompt,
  type GeneratedArtistRecipe,
} from "./artist-recipe";
import {
  DEFAULT_V5_ARTIST_DRAW_MAX,
  DEFAULT_V5_ARTIST_DRAW_MIN,
  drawAllV5ArtistWeights,
  normalizeV45ArtistSyntax,
  repairV45ArtistCandidatesForV5,
} from "./v5-artist-weight-repair";
import {
  RANDOM_CUSTOM_TAG_LIBRARY,
  customTagCategoryLabel,
  customTagMeaning,
  matchesCustomTagSearch,
} from "./random-custom-tag-library";

const DRAW_SIZE_PRESETS = [
  { width: 832, height: 1216 },
  { width: 1024, height: 1024 },
  { width: 1216, height: 832 },
  { width: 1024, height: 1536 },
  { width: 1536, height: 1024 },
  { width: 1472, height: 1472 },
] as const;

const DRAW_STYLE_CATALOG_PAGE_SIZE = 120;
const DRAW_STYLE_SCOPE_BY_CATEGORY: Record<string, ArtistStyleCatalogScope> = {
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

type DrawStylePreviewPopover = {
  tag: string;
  meaning: string;
  left: number;
  top: number;
  status: "loading" | "ready" | "empty";
  result?: ArtistStylePreviewResult;
};

const DRAW_PARAM_TEXT = {
  "zh-CN": {
    title: "NovelAI 生成参数",
    hint: "参数仅用于本工具批量生图，可自行修改；也可从生成页同步或恢复软件初始参数。",
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
    variety: "Variety+",
    smea: "SMEA",
    smeaDyn: "SMEA Dyn",
  },
  "zh-TW": {
    title: "NovelAI 生成參數",
    hint: "參數只用於本工具批次生圖，可自行修改，也可從生成頁同步或恢復初始參數。",
    sync: "從生成頁同步",
    reset: "恢復初始參數",
    model: "模型",
    size: "圖片尺寸",
    sizeValues: "直式|方形|橫式|高直式|寬橫式|大方形",
    width: "寬度",
    height: "高度",
    negative: "負面提示詞",
    steps: "步數",
    cfg: "CFG Scale",
    rescale: "CFG Rescale",
    sampler: "採樣器",
    noise: "噪聲計畫",
    uc: "負面預設",
    ucValues: "強負面|輕負面|人物優先|無",
    variety: "Variety+",
    smea: "SMEA",
    smeaDyn: "SMEA Dyn",
  },
  "en-US": {
    title: "NovelAI generation settings",
    hint: "These independent settings apply only to this batch. Sync from Generate or restore app defaults at any time.",
    sync: "Sync from Generate",
    reset: "Restore defaults",
    model: "Model",
    size: "Image size",
    sizeValues: "Portrait|Square|Landscape|Tall portrait|Wide landscape|Large square",
    width: "Width",
    height: "Height",
    negative: "Negative prompt",
    steps: "Steps",
    cfg: "CFG Scale",
    rescale: "CFG Rescale",
    sampler: "Sampler",
    noise: "Noise schedule",
    uc: "UC preset",
    ucValues: "Heavy|Light|Human Focus|None",
    variety: "Variety+",
    smea: "SMEA",
    smeaDyn: "SMEA Dyn",
  },
  "ja-JP": {
    title: "NovelAI 生成設定",
    hint: "このツールの一括生成だけに使う独立設定です。生成画面との同期または初期化ができます。",
    sync: "生成画面から同期",
    reset: "初期設定に戻す",
    model: "モデル",
    size: "画像サイズ",
    sizeValues: "縦長|正方形|横長|高い縦長|広い横長|大正方形",
    width: "幅",
    height: "高さ",
    negative: "ネガティブプロンプト",
    steps: "ステップ",
    cfg: "CFG Scale",
    rescale: "CFG Rescale",
    sampler: "サンプラー",
    noise: "ノイズスケジュール",
    uc: "UC プリセット",
    ucValues: "強|弱|人物優先|なし",
    variety: "Variety+",
    smea: "SMEA",
    smeaDyn: "SMEA Dyn",
  },
  "ko-KR": {
    title: "NovelAI 생성 설정",
    hint: "이 도구의 일괄 생성에만 적용되는 독립 설정입니다. 생성 화면 동기화 또는 초기화가 가능합니다.",
    sync: "생성 화면에서 동기화",
    reset: "초기값 복원",
    model: "모델",
    size: "이미지 크기",
    sizeValues: "세로|정사각|가로|긴 세로|넓은 가로|큰 정사각",
    width: "너비",
    height: "높이",
    negative: "네거티브 프롬프트",
    steps: "스텝",
    cfg: "CFG Scale",
    rescale: "CFG Rescale",
    sampler: "샘플러",
    noise: "노이즈 스케줄",
    uc: "UC 프리셋",
    ucValues: "강함|약함|인물 우선|없음",
    variety: "Variety+",
    smea: "SMEA",
    smeaDyn: "SMEA Dyn",
  },
} satisfies Record<AppLanguage, Record<string, string>>;

const TEXT = {
  "zh-CN": {
    title: "V4.5 画师串修复器", subtitle: "自动识别画师、质量词和其他 Tag；整串每个有效 Tag 都独立压到原权重的 1/3–1/2，并统一为规范 V5 数值格式。", back: "返回工具首页",
    strategy: "社区迁移策略", input: "V4.5 完整 Tag 串", inputHint: "支持 xiaoluo_xl、(artist:foo:1.2)、{artist:foo}、[artist:foo] 和 1.2::artist:foo ::", output: "首组规范 V5 Tag 串", run: "随机生成修复候选", copy: "复制首组结果", copied: "已复制", reset: "恢复默认", empty: "请先粘贴画师串。", none: "没有识别到有效 Tag；请检查输入和分隔符。", adjusted: "已生成 {candidates} 组候选；每组修复 {count} 个 Tag（画师 {artists}、质量词 {quality}、其他 {other}）。", noteTitle: "用户实测结论与限制", note: "NovelAI 官方只确认数值权重语法，没有公布 V4.5→V5 的换算公式。社区的 1/3–1/2 建议主要来自旧画师权重迁移；按本工具设定，质量词、风格词和其他有效 Tag 也会分别套用同一范围，以便整串统一迁移。结果仅是试验起点，不是官方标准。", safe: "显式 artist: 标签和已确认的无前缀画师名会识别为画师并规范化；质量词、风格词、年份、负面词和内容词不会被加上 artist:。重复逗号、中文分隔符和孤立 :: 会自动清理，未知裸 Tag 保留为普通 Tag。", repairBatchHint: "候选组数决定一次独立随机修复多少套完整 Tag 串；随后可固定同一 Seed 批量对照生图，并收藏喜欢的结果。", repairNoResults: "粘贴 V4.5 Tag 串后，可一次随机生成多组修复候选。",
    drawPageTitle: "输入画师串抽卡", drawPageSubtitle: "沿用修复器的识别与规范流程；保留全部有效 Tag，并让每个 Tag 的最终权重在自定义区间内独立随机。", drawTitle: "抽卡设置", drawHint: "每个有效 Tag 都会完整保留，并在最低/最高权重之间独立随机；旧权重只用于识别与规范，不限制最终抽卡范围。", drawInput: "完整 Tag 串", drawInputHint: "例如：xiaoluo_xl, 1.2::artist:pottsness ::, artist:nonco", drawEmpty: "请先粘贴画师串。", drawNone: "没有识别到有效 Tag；请检查输入和分隔符。", weightMin: "最低权重", weightMax: "最高权重", candidateCount: "候选组数", basePrompt: "正面提示词（固定内容）", seedMode: "对照 Seed", fixedSeed: "全批固定", randomSeed: "每张随机", seed: "Seed", randomizeSeed: "随机 Seed", draw: "重新抽权重", generate: "生成这一批", stop: "停止", needDraw: "请先抽取候选。", needPrompt: "请填写正面提示词。", generating: "正在生成 {done}/{total}", complete: "生成完成；可收藏喜欢的结果。", allTags: "已识别 {count} 个有效 Tag（画师 {artists}、质量词 {quality}、其他 {other}）；每组完整保留。",
    results: "本批候选", favorites: "收藏夹", sharedFavorites: "本工具收藏独立保存，不与另外两种画师工具共用", pending: "等待", generatingOne: "生成中", done: "完成", failed: "失败", favorite: "收藏", saved: "已收藏", saving: "保存中", remove: "移除收藏", apply: "应用到生成", retry: "重试", preview: "双击预览大图", noResults: "输入画师串后即可抽取权重候选。", noFavorites: "本工具收藏库暂无内容。", applied: "已应用到生成页。", removed: "已移除收藏和本地图片。",
  },
  "zh-TW": {
    title: "V4.5 畫師串修復器", subtitle: "自動識別畫師、品質詞與其他 Tag；整串每個有效 Tag 都獨立壓到原權重的 1/3–1/2，並統一為規範 V5 數值格式。", back: "返回工具首頁", strategy: "社群遷移策略", input: "V4.5 完整 Tag 串", inputHint: "支援無前綴畫師名、括號及數值權重", output: "首組規範 V5 Tag 串", run: "隨機產生修復候選", copy: "複製首組結果", copied: "已複製", reset: "恢復預設", empty: "請先貼上畫師串。", none: "未識別到有效 Tag；請檢查輸入與分隔符。", adjusted: "已產生 {candidates} 組候選；每組修復 {count} 個 Tag（畫師 {artists}、品質詞 {quality}、其他 {other}）。", noteTitle: "使用者實測與限制", note: "NovelAI 官方沒有公布 V4.5→V5 換算公式。社群的 1/3–1/2 建議主要來自舊畫師權重遷移；依本工具設定，品質詞、風格詞與其他有效 Tag 也會套用相同範圍。結果只是試驗起點，不是官方標準。", safe: "明確的 artist: 標籤與已確認的無前綴畫師名會辨識為畫師；品質、風格、年份、負面與內容 Tag 不會被加上 artist:。重複逗號、中文分隔符與孤立 :: 會自動清理。", repairBatchHint: "可一次獨立隨機修復多組完整 Tag 串，再固定 Seed 批次生圖與收藏。", repairNoResults: "貼上 V4.5 Tag 串後，可一次產生多組修復候選。", drawPageTitle: "輸入畫師串抽卡", drawPageSubtitle: "沿用修復器的辨識與規範流程；保留全部有效 Tag，並讓每個 Tag 的最終權重在自訂區間內獨立隨機。", drawTitle: "抽卡設定", drawHint: "每個有效 Tag 都會完整保留，並在最低／最高權重之間獨立隨機；舊權重不會限制最終抽卡範圍。", drawInput: "完整 Tag 串", drawInputHint: "例如：xiaoluo_xl, 1.2::artist:pottsness ::", drawEmpty: "請先貼上畫師串。", drawNone: "未識別到有效 Tag；請檢查輸入與分隔符。", weightMin: "最低權重", weightMax: "最高權重", candidateCount: "候選組數", basePrompt: "固定內容提示詞", currentParams: "沿用生成頁目前參數", currentParamsHint: "{model} · {width}×{height} · {steps} 步；非 V5 會改用 V5 Full。", seedMode: "對照 Seed", fixedSeed: "全批固定", randomSeed: "每張隨機", seed: "Seed", randomizeSeed: "隨機 Seed", draw: "重新抽權重", generate: "生成這一批", stop: "停止", needDraw: "請先抽取候選。", needPrompt: "請填寫固定內容提示詞。", generating: "生成中 {done}/{total}", complete: "生成完成，可收藏喜歡結果。", allTags: "已識別 {count} 個有效 Tag（畫師 {artists}、品質詞 {quality}、其他 {other}）；每組完整保留。", results: "本批候選", favorites: "收藏夾", sharedFavorites: "本工具收藏獨立保存，不與另外兩種畫師工具共用", pending: "等待", generatingOne: "生成中", done: "完成", failed: "失敗", favorite: "收藏", saved: "已收藏", saving: "儲存中", remove: "移除收藏", apply: "套用到生成", retry: "重試", preview: "雙擊預覽大圖", noResults: "輸入畫師串後即可抽取候選。", noFavorites: "本工具收藏庫暫無內容。", applied: "已套用到生成頁。", removed: "已移除收藏和本機圖片。",
  },
  "en-US": {
    title: "V4.5 Artist-string Repair", subtitle: "Auto-detect artist, quality, and other tags; independently scale every valid tag to one third–one half of its old weight and normalize V5 syntax.", back: "Back to Tools", strategy: "Community migration heuristic", input: "Complete V4.5 tag string", inputHint: "Supports known bare artist names, (), {}, [], and numeric scopes", output: "First normalized V5 string", run: "Create repair candidates", copy: "Copy first result", copied: "Copied", reset: "Restore defaults", empty: "Paste an artist string first.", none: "No valid tags were detected. Check the input and separators.", adjusted: "Created {candidates} candidates; each repairs {count} tags ({artists} artist, {quality} quality, {other} other).", noteTitle: "Community evidence and limits", note: "NovelAI publishes no V4.5→V5 conversion formula. The community one-third-to-one-half heuristic mainly concerns legacy artist weights; this tool deliberately applies the same range to quality, style, and other valid tags for whole-string migration. It is an experimental starting point, not an official standard.", safe: "Explicit artist: tags and reviewed bare artist names are classified as artists. Quality, style, year, negative, and content tags never gain artist:. Repeated separators and orphan :: markers are cleaned automatically.", repairBatchHint: "Create several independently repaired complete strings, batch-generate them with a comparison seed, and save favorites.", repairNoResults: "Paste a V4.5 string to create several repair candidates.", drawPageTitle: "Artist-string Weight Draw", drawPageSubtitle: "Uses the repair parser and normalization while independently drawing every retained tag across the custom final range.", drawTitle: "Draw settings", drawHint: "Every valid tag is retained and independently draws a final weight between the selected minimum and maximum; legacy weights do not narrow the range.", drawInput: "Complete tag string", drawInputHint: "Example: xiaoluo_xl, 1.2::artist:pottsness ::", drawEmpty: "Paste an artist string first.", drawNone: "No valid tags were detected. Check the input and separators.", weightMin: "Minimum weight", weightMax: "Maximum weight", candidateCount: "Candidate sets", basePrompt: "Fixed content prompt", currentParams: "Uses current Generate settings", currentParamsHint: "{model} · {width}×{height} · {steps} steps; non-V5 models switch to V5 Full.", seedMode: "Comparison seed", fixedSeed: "Fixed for batch", randomSeed: "Random per image", seed: "Seed", randomizeSeed: "Random seed", draw: "Reroll weights", generate: "Generate batch", stop: "Stop", needDraw: "Draw candidates first.", needPrompt: "Enter a fixed content prompt.", generating: "Generating {done}/{total}", complete: "Generation complete. Save the results you like.", allTags: "{count} valid tags detected ({artists} artist, {quality} quality, {other} other); every set retains all of them.", results: "Candidates", favorites: "Favorites", sharedFavorites: "This tool has its own favorites; the other two artist tools are separate", pending: "Pending", generatingOne: "Generating", done: "Done", failed: "Failed", favorite: "Favorite", saved: "Saved", saving: "Saving", remove: "Remove", apply: "Apply to Generate", retry: "Retry", preview: "Double-click to preview", noResults: "Paste an artist string, then draw weight candidates.", noFavorites: "No favorites in this tool yet.", applied: "Applied to Generate.", removed: "Favorite and local image removed.",
  },
  "ja-JP": {
    title: "V4.5 画家列修復", subtitle: "画家・品質・その他の Tag を自動判定し、すべての有効 Tag を旧値の 1/3～1/2 に個別調整して V5 数値形式へ統一します。", back: "ツールへ戻る", strategy: "コミュニティ移行ヒューリスティック", input: "V4.5 完全 Tag 列", inputHint: "既知の接頭辞なし画家名、括弧、数値形式に対応", output: "正規化 V5 Tag 列", run: "ランダム修復・正規化", copy: "コピー", copied: "コピー済み", reset: "初期値に戻す", empty: "画家列を貼り付けてください。", none: "有効な Tag を認識できませんでした。入力と区切りを確認してください。", adjusted: "{count} 個の Tag（画家 {artists}、品質 {quality}、その他 {other}）を個別に修復しました。", noteTitle: "ユーザー検証と制限", note: "NovelAI は V4.5→V5 の換算式を公開していません。コミュニティの 1/3～1/2 という目安は主に旧画家ウェイト向けです。本ツールでは文字列全体を移行するため、品質・スタイル・その他の有効 Tag にも同じ範囲を適用します。公式標準ではありません。", safe: "明示的な artist: と確認済みの画家名だけを画家として分類します。品質・スタイル・年・ネガティブ・内容 Tag に artist: は追加しません。重複区切りと孤立した :: は自動整理します。", repairBatchHint: "複数の完全な修復候補を作成し、同じ Seed で一括生成・保存できます。", repairNoResults: "V4.5 Tag 列から複数の修復候補を作成できます。", drawPageTitle: "画家列ウェイト抽選", drawPageSubtitle: "修復器と同じ判定・正規化を使い、すべての有効 Tag の最終ウェイトを指定範囲全体から個別に抽選します。", drawTitle: "抽選設定", drawHint: "すべての有効 Tag を保持し、最小／最大の範囲全体から個別に最終ウェイトを抽選します。旧ウェイトは抽選範囲を制限しません。", drawInput: "完全な Tag 列", drawInputHint: "例：xiaoluo_xl, 1.2::artist:pottsness ::", drawEmpty: "画家列を貼り付けてください。", drawNone: "有効な Tag を認識できませんでした。入力と区切りを確認してください。", weightMin: "最小", weightMax: "最大", candidateCount: "候補セット数", basePrompt: "固定内容", currentParams: "生成画面の現在設定を使用", currentParamsHint: "{model} · {width}×{height} · {steps} steps", seedMode: "比較 Seed", fixedSeed: "全候補固定", randomSeed: "画像ごとランダム", seed: "Seed", randomizeSeed: "Seed を抽選", draw: "ウェイト再抽選", generate: "一括生成", stop: "停止", needDraw: "先に候補を抽選してください。", needPrompt: "固定内容を入力してください。", generating: "生成中 {done}/{total}", complete: "生成完了。好きな結果を保存できます。", allTags: "{count} 個の有効 Tag（画家 {artists}、品質 {quality}、その他 {other}）を各組に保持します。", results: "候補", favorites: "お気に入り", sharedFavorites: "このツール専用のお気に入りです。他の2つとは共有しません", pending: "待機", generatingOne: "生成中", done: "完了", failed: "失敗", favorite: "保存", saved: "保存済み", saving: "保存中", remove: "削除", apply: "生成へ適用", retry: "再試行", preview: "ダブルクリックで拡大", noResults: "画家列を入力してウェイト候補を抽選できます。", noFavorites: "お気に入りはありません。", applied: "生成へ適用しました。", removed: "お気に入りと画像を削除しました。",
  },
  "ko-KR": {
    title: "V4.5 작가 문자열 복구", subtitle: "작가·품질·기타 Tag를 자동 구분하고 모든 유효 Tag를 기존 가중치의 1/3~1/2로 개별 조정해 V5 숫자 형식으로 통일합니다.", back: "도구로 돌아가기", strategy: "커뮤니티 마이그레이션 휴리스틱", input: "V4.5 전체 Tag 문자열", inputHint: "확인된 접두사 없는 작가명, 괄호, 숫자 형식 지원", output: "정규화 V5 Tag 문자열", run: "무작위 복구 및 정규화", copy: "복사", copied: "복사됨", reset: "기본값 복원", empty: "작가 문자열을 붙여넣으세요.", none: "유효한 Tag를 찾지 못했습니다. 입력과 구분자를 확인하세요.", adjusted: "Tag {count}개(작가 {artists}, 품질 {quality}, 기타 {other})를 개별 복구했습니다.", noteTitle: "사용자 검증과 한계", note: "NovelAI는 V4.5→V5 환산식을 공개하지 않았습니다. 커뮤니티의 1/3~1/2 기준은 주로 기존 작가 가중치에 관한 것이며, 이 도구는 전체 문자열 이전을 위해 품질·스타일·기타 유효 Tag에도 같은 범위를 적용합니다. 공식 표준은 아닙니다.", safe: "명시적 artist:와 검토된 작가명만 작가로 분류합니다. 품질·스타일·연도·네거티브·내용 Tag에는 artist:를 붙이지 않습니다. 중복 구분자와 고립된 ::는 자동 정리합니다.", repairBatchHint: "여러 완전한 복구 후보를 만들고 같은 Seed로 일괄 생성·저장할 수 있습니다.", repairNoResults: "V4.5 Tag 문자열에서 여러 복구 후보를 만들 수 있습니다.", drawPageTitle: "작가 문자열 가중치 뽑기", drawPageSubtitle: "복구 도구와 같은 판별·정규화를 사용하되 모든 유효 Tag의 최종 가중치를 지정 범위 전체에서 각각 추첨합니다.", drawTitle: "추첨 설정", drawHint: "모든 유효 Tag를 유지하고 최저/최고 범위 전체에서 각각 최종 가중치를 추첨합니다. 기존 가중치는 최종 추첨 범위를 제한하지 않습니다.", drawInput: "전체 Tag 문자열", drawInputHint: "예: xiaoluo_xl, 1.2::artist:pottsness ::", drawEmpty: "작가 문자열을 붙여넣으세요.", drawNone: "유효한 Tag를 찾지 못했습니다. 입력과 구분자를 확인하세요.", weightMin: "최저", weightMax: "최고", candidateCount: "후보 세트 수", basePrompt: "고정 내용 프롬프트", currentParams: "생성 화면 현재 설정 사용", currentParamsHint: "{model} · {width}×{height} · {steps} steps", seedMode: "비교 Seed", fixedSeed: "전체 고정", randomSeed: "이미지별 무작위", seed: "Seed", randomizeSeed: "Seed 무작위", draw: "가중치 다시 뽑기", generate: "일괄 생성", stop: "중지", needDraw: "먼저 후보를 뽑으세요.", needPrompt: "고정 내용을 입력하세요.", generating: "생성 중 {done}/{total}", complete: "생성 완료. 마음에 드는 결과를 저장하세요.", allTags: "유효 Tag {count}개(작가 {artists}, 품질 {quality}, 기타 {other})를 모든 세트에 유지합니다.", results: "후보", favorites: "즐겨찾기", sharedFavorites: "이 도구 전용 즐겨찾기이며 다른 두 도구와 공유하지 않습니다", pending: "대기", generatingOne: "생성 중", done: "완료", failed: "실패", favorite: "저장", saved: "저장됨", saving: "저장 중", remove: "삭제", apply: "생성에 적용", retry: "재시도", preview: "더블 클릭하여 확대", noResults: "작가 문자열을 입력한 뒤 후보를 뽑을 수 있습니다.", noFavorites: "즐겨찾기가 없습니다.", applied: "생성에 적용했습니다.", removed: "즐겨찾기와 이미지를 삭제했습니다.",
  },
} satisfies Record<AppLanguage, Record<string, string>>;

const COPY_TEXT = {
  "zh-CN": { artists: "复制画师串", full: "复制完整提示词", copied: "已复制" },
  "zh-TW": { artists: "複製畫師串", full: "複製完整提示詞", copied: "已複製" },
  "en-US": { artists: "Copy artist string", full: "Copy full prompt", copied: "Copied" },
  "ja-JP": { artists: "画家列をコピー", full: "完全プロンプトをコピー", copied: "コピー済み" },
  "ko-KR": { artists: "작가 문자열 복사", full: "전체 프롬프트 복사", copied: "복사됨" },
} satisfies Record<AppLanguage, { artists: string; full: string; copied: string }>;

const STYLE_REFERENCE_TEXT = {
  "zh-CN": { title: "画风参考", loading: "正在读取参考图…", empty: "暂无可用参考图" },
  "zh-TW": { title: "畫風參考", loading: "正在讀取參考圖…", empty: "沒有可用參考圖" },
  "en-US": { title: "Style reference", loading: "Loading reference image…", empty: "No reference image available" },
  "ja-JP": { title: "画風リファレンス", loading: "参照画像を読み込み中…", empty: "利用できる参照画像がありません" },
  "ko-KR": { title: "화풍 참조", loading: "참조 이미지 불러오는 중…", empty: "사용 가능한 참조 이미지 없음" },
} satisfies Record<AppLanguage, { title: string; loading: string; empty: string }>;

const DRAW_LIBRARY_TEXT = {
  "zh-CN": { title: "画风 Tag 库", selected: "已选 {count} 个；完整复用随机画师抽卡的本地 Danbooru 画风库，每个所选 Tag 都加入每一组并随机赋权。", search: "搜索 Tag、中文含义或作品名", local: "本地 Danbooru 数据库", offline: "内置离线库", all: "全部画风 / 动漫游戏", styles: "Danbooru 画风模仿", works: "动漫 / 游戏 / 漫画作品", loading: "正在读取本地 Tag 库…", empty: "没有匹配项；可在设置中安装完整 Danbooru 标签数据。", more: "载入更多" },
  "zh-TW": { title: "畫風 Tag 庫", selected: "已選 {count} 個；完整共用隨機畫師抽卡的本機 Danbooru 畫風庫，每個 Tag 都會加入各組並隨機加權。", search: "搜尋 Tag、中文含義或作品名", local: "本機 Danbooru 資料庫", offline: "內置離線庫", all: "全部畫風／動漫遊戲", styles: "Danbooru 畫風模仿", works: "動漫／遊戲／漫畫作品", loading: "正在讀取本機 Tag 庫…", empty: "沒有符合項目；可在設定中安裝完整 Danbooru 標籤資料。", more: "載入更多" },
  "en-US": { title: "Style Tag library", selected: "{count} selected; the full local Danbooru style catalog is shared with Random Artist Draw and every selected tag is weighted in each set.", search: "Search tags, meanings, anime, or games", local: "Local Danbooru database", offline: "Built-in offline library", all: "All styles / franchises", styles: "Danbooru style parodies", works: "Anime / game / manga", loading: "Loading local Tag catalog…", empty: "No matches; install the full Danbooru catalog in Settings.", more: "Load more" },
  "ja-JP": { title: "画風 Tag ライブラリ", selected: "{count} 件を選択。ローカル Danbooru 画風ライブラリを共有し、各 Tag を各候補へランダム加重します。", search: "Tag・意味・作品名を検索", local: "ローカル Danbooru DB", offline: "内蔵オフラインライブラリ", all: "すべての画風／作品", styles: "Danbooru 画風パロディ", works: "アニメ／ゲーム／漫画", loading: "ローカル Tag を読み込み中…", empty: "一致なし。設定から完全版 Danbooru データを導入できます。", more: "さらに読み込む" },
  "ko-KR": { title: "화풍 Tag 라이브러리", selected: "{count}개 선택. 로컬 Danbooru 화풍 라이브러리를 공유하며 각 Tag를 모든 후보에 무작위 가중합니다.", search: "Tag, 의미, 작품명 검색", local: "로컬 Danbooru DB", offline: "내장 오프라인 라이브러리", all: "모든 화풍 / 작품", styles: "Danbooru 화풍 패러디", works: "애니 / 게임 / 만화", loading: "로컬 Tag 불러오는 중…", empty: "일치 항목 없음. 설정에서 전체 Danbooru 데이터를 설치할 수 있습니다.", more: "더 불러오기" },
} satisfies Record<AppLanguage, Record<string, string>>;

function freshSeed() {
  return Math.max(1, Math.floor(Math.random() * 2_147_483_647));
}

function clampNumber(value: number, fallback: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function interpolate(value: string, values: Record<string, unknown>) {
  return Object.entries(values).reduce(
    (output, [key, replacement]) => output.replaceAll(`{${key}}`, String(replacement)),
    value,
  );
}

type NumericDraftInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
> & {
  value: number;
  onCommit: (value: number) => void;
  normalize?: (value: number) => number;
};

/** Keep partial numeric text intact until blur/Enter, then clamp once. */
function NumericDraftInput({
  value,
  onCommit,
  normalize,
  min,
  max,
  ...props
}: NumericDraftInputProps) {
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

  return (
    <input
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
    />
  );
}

function normalizeDrawGenerationParams(
  source: GenerateParams = DEFAULT_PARAMS,
): GenerateParams {
  const dimensions = fitNAIImageSize(source.width, source.height, DEFAULT_PARAMS);
  const model = source.model.startsWith("nai-diffusion-5")
    ? source.model
    : "nai-diffusion-5-full";
  const qualityPreset = !model.startsWith("nai-diffusion-5") && source.qualityPreset === "light"
    ? "standard"
    : source.qualityPreset;
  return {
    ...DEFAULT_PARAMS,
    ...source,
    model,
    positivePrompt: "",
    stylePrompt: "",
    width: dimensions.width,
    height: dimensions.height,
    steps: Math.max(1, Math.min(50, Math.floor(source.steps || DEFAULT_PARAMS.steps))),
    cfgScale: Math.max(1, Math.min(10, Number(source.cfgScale) || DEFAULT_PARAMS.cfgScale)),
    cfgRescale: Math.max(0, Math.min(1, Number(source.cfgRescale) || 0)),
    qualityPreset,
    qualityToggle: qualityPreset !== "none",
    transparentBackground: model.startsWith("nai-diffusion-5")
      ? source.transparentBackground
      : false,
  };
}

export type V5ArtistWeightRepairMode = "repair" | "draw";

export default function V5ArtistWeightRepair({
  onBack,
  mode = "repair",
}: {
  onBack: () => void;
  mode?: V5ArtistWeightRepairMode;
}) {
  const language = useAppStore((state) => state.settings?.language ?? "zh-CN");
  const params = useAppStore((state) => state.params);
  const applyParams = useAppStore((state) => state.applyParams);
  const refreshAccount = useAppStore((state) => state.refreshAccount);
  const refreshHistory = useAppStore((state) => state.refreshHistory);
  const deleteHistory = useAppStore((state) => state.deleteHistory);
  const drawMode = mode === "draw";
  const favoriteCollection: ArtistFavoriteCollection = drawMode
    ? "artist-string-draw"
    : "v5-repair";
  const text = TEXT[language];
  const styleReferenceText = STYLE_REFERENCE_TEXT[language];
  const drawLibraryText = DRAW_LIBRARY_TEXT[language];
  const copyText = COPY_TEXT[language];
  const paramText = DRAW_PARAM_TEXT[language];
  const sizeLabels = paramText.sizeValues.split("|");
  const ucLabels = paramText.ucValues.split("|");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [drawInput, setDrawInput] = useState("");
  const [drawStyleTags, setDrawStyleTags] = useState<Set<string>>(() => new Set());
  const [drawTagQuery, setDrawTagQuery] = useState("");
  const [drawTagCategory, setDrawTagCategory] = useState("all");
  const [drawTagLibraryOpen, setDrawTagLibraryOpen] = useState(false);
  const [drawCatalogItems, setDrawCatalogItems] = useState<TagSuggestion[]>([]);
  const [drawCatalogTotal, setDrawCatalogTotal] = useState(0);
  const [drawCatalogLoading, setDrawCatalogLoading] = useState(false);
  const [drawCatalogLoadingMore, setDrawCatalogLoadingMore] = useState(false);
  const [drawStylePreview, setDrawStylePreview] = useState<DrawStylePreviewPopover | null>(null);
  const drawCatalogRequestRef = useRef(0);
  const drawCatalogResultsRef = useRef<HTMLDivElement>(null);
  const drawStylePreviewTimerRef = useRef<number | null>(null);
  const drawStylePreviewCacheRef = useRef(new Map<string, ArtistStylePreviewResult | null>());
  const [minWeight, setMinWeight] = useState(DEFAULT_V5_ARTIST_DRAW_MIN);
  const [maxWeight, setMaxWeight] = useState(DEFAULT_V5_ARTIST_DRAW_MAX);
  const [weightControlMode, setWeightControlMode] = useState<WeightControlMode>("novice");
  const [weightMode, setWeightMode] = useState<number>(DEFAULT_WEIGHT_DISTRIBUTION.mode);
  const [leftDispersion, setLeftDispersion] = useState<number>(DEFAULT_WEIGHT_DISTRIBUTION.leftDispersion);
  const [rightDispersion, setRightDispersion] = useState<number>(DEFAULT_WEIGHT_DISTRIBUTION.rightDispersion);
  const [softBalance, setSoftBalance] = useState<number>(DEFAULT_WEIGHT_DISTRIBUTION.softBalance);
  const [candidateCount, setCandidateCount] = useState(10);
  const [basePrompt, setBasePrompt] = useState(params.positivePrompt);
  const [generationParams, setGenerationParams] = useState(() =>
    normalizeDrawGenerationParams(params),
  );
  const [seedMode, setSeedMode] = useState<"fixed" | "random">("fixed");
  const [seed, setSeed] = useState(params.seed > 0 ? params.seed : 246813579);
  const [results, setResults] = useState<SharedArtistFavorite[]>([]);
  const [favorites, setFavorites] = useState(() =>
    loadArtistFavorites(favoriteCollection),
  );
  const [showFavorites, setShowFavorites] = useState(false);
  const [running, setRunning] = useState(false);
  const cancelRef = useRef(false);
  const [message, setMessage] = useState("");
  const [copiedAction, setCopiedAction] = useState("");
  const copiedTimerRef = useRef<number | null>(null);
  const [previewCandidate, setPreviewCandidate] = useState<SharedArtistFavorite | null>(null);
  const drawSource = useMemo(
    () => [drawInput.trim(), ...drawStyleTags].filter(Boolean).join(", "),
    [drawInput, drawStyleTags],
  );
  const tagSummary = useMemo(
    () => normalizeV45ArtistSyntax(drawMode ? drawSource : input),
    [drawMode, drawSource, input],
  );
  const drawCatalogScope = DRAW_STYLE_SCOPE_BY_CATEGORY[drawTagCategory] ?? "all";
  const drawStaticSupplements = useMemo<TagSuggestion[]>(() => {
    const categories = drawTagCategory === "all"
      ? RANDOM_CUSTOM_TAG_LIBRARY
      : RANDOM_CUSTOM_TAG_LIBRARY.filter((category) => category.id === drawTagCategory);
    return categories.flatMap((category) => category.tags
      .filter((entry) => matchesCustomTagSearch(category, entry, language, drawTagQuery))
      .map((entry) => ({
        tag: entry.tag,
        category: 0,
        count: 0,
        description: customTagMeaning(entry, language),
      })));
  }, [drawTagCategory, drawTagQuery, language]);
  const drawLibraryItems = useMemo(() => {
    const seen = new Set<string>();
    return [...drawCatalogItems, ...drawStaticSupplements].filter((entry) => {
      const key = entry.tag.trim().toLocaleLowerCase().replaceAll(" ", "_");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [drawCatalogItems, drawStaticSupplements]);

  const toggleDrawStyleTag = (tag: string) => {
    setDrawStyleTags((current) => {
      const next = new Set(current);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
    setMessage("");
  };

  const drawCatalogMeaning = (entry: TagSuggestion) => entry.description?.trim() || entry.tag.replaceAll("_", " ");
  const loadMoreDrawCatalog = async () => {
    if (drawCatalogLoading || drawCatalogLoadingMore || drawCatalogItems.length >= drawCatalogTotal) return;
    const requestId = drawCatalogRequestRef.current;
    const previousScrollTop = drawCatalogResultsRef.current?.scrollTop ?? 0;
    setDrawCatalogLoadingMore(true);
    try {
      const result = await window.naiDesktop.artistStyleCatalog(
        drawCatalogScope,
        drawTagQuery,
        drawCatalogItems.length,
        DRAW_STYLE_CATALOG_PAGE_SIZE,
      );
      if (requestId !== drawCatalogRequestRef.current) return;
      setDrawCatalogItems((current) => {
        const seen = new Set(current.map((entry) => entry.tag.toLocaleLowerCase()));
        return [...current, ...result.items.filter((entry) => {
          const key = entry.tag.toLocaleLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })];
      });
      setDrawCatalogTotal(result.total);
      window.requestAnimationFrame(() => {
        if (requestId === drawCatalogRequestRef.current && drawCatalogResultsRef.current) {
          drawCatalogResultsRef.current.scrollTop = previousScrollTop;
        }
      });
    } finally {
      if (requestId === drawCatalogRequestRef.current) setDrawCatalogLoadingMore(false);
    }
  };
  const hideDrawStylePreview = () => {
    if (drawStylePreviewTimerRef.current !== null) {
      window.clearTimeout(drawStylePreviewTimerRef.current);
      drawStylePreviewTimerRef.current = null;
    }
    setDrawStylePreview(null);
  };
  const showDrawStylePreview = (
    entry: TagSuggestion,
    meaning: string,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (!/_\(style\)$/i.test(entry.tag)) return;
    if (drawStylePreviewTimerRef.current !== null) window.clearTimeout(drawStylePreviewTimerRef.current);
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 292;
    const height = 356;
    const gap = 12;
    let left = rect.right + gap;
    if (left + width > window.innerWidth - gap) left = rect.left - width - gap;
    left = Math.max(gap, Math.min(left, window.innerWidth - width - gap));
    const top = Math.max(gap, Math.min(rect.top, window.innerHeight - height - gap));
    drawStylePreviewTimerRef.current = window.setTimeout(() => {
      drawStylePreviewTimerRef.current = null;
      if (drawStylePreviewCacheRef.current.has(entry.tag)) {
        const result = drawStylePreviewCacheRef.current.get(entry.tag) ?? undefined;
        setDrawStylePreview({ tag: entry.tag, meaning, left, top, status: result ? "ready" : "empty", result });
        return;
      }
      setDrawStylePreview({ tag: entry.tag, meaning, left, top, status: "loading" });
      void window.naiDesktop.artistLabStylePreview(entry.tag).then((result) => {
        drawStylePreviewCacheRef.current.set(entry.tag, result);
        setDrawStylePreview((current) => current?.tag === entry.tag
          ? { ...current, status: result ? "ready" : "empty", result: result ?? undefined }
          : current);
      }).catch(() => {
        drawStylePreviewCacheRef.current.set(entry.tag, null);
        setDrawStylePreview((current) => current?.tag === entry.tag
          ? { ...current, status: "empty", result: undefined }
          : current);
      });
    }, 180);
  };

  useEffect(() => {
    if (!drawMode || !drawTagLibraryOpen) return;
    let cancelled = false;
    const requestId = ++drawCatalogRequestRef.current;
    setDrawCatalogItems([]);
    setDrawCatalogTotal(0);
    setDrawCatalogLoadingMore(false);
    setDrawCatalogLoading(true);
    if (drawCatalogResultsRef.current) drawCatalogResultsRef.current.scrollTop = 0;
    const timer = window.setTimeout(() => {
      void window.naiDesktop.artistStyleCatalog(
        drawCatalogScope,
        drawTagQuery,
        0,
        DRAW_STYLE_CATALOG_PAGE_SIZE,
      ).then((result) => {
        if (cancelled || requestId !== drawCatalogRequestRef.current) return;
        setDrawCatalogItems(result.items);
        setDrawCatalogTotal(result.total);
      }).catch(() => {
        if (cancelled || requestId !== drawCatalogRequestRef.current) return;
        setDrawCatalogItems([]);
        setDrawCatalogTotal(0);
      }).finally(() => {
        if (!cancelled && requestId === drawCatalogRequestRef.current) setDrawCatalogLoading(false);
      });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [drawCatalogScope, drawMode, drawTagLibraryOpen, drawTagQuery]);

  useEffect(() => () => {
    if (drawStylePreviewTimerRef.current !== null) window.clearTimeout(drawStylePreviewTimerRef.current);
  }, []);

  useEffect(() => {
    if (!previewCandidate) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewCandidate(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [previewCandidate]);

  useEffect(() => {
    const syncFavorites = (event: Event) => {
      const collection = (event as CustomEvent<{ collection?: string }>).detail?.collection;
      if (collection === favoriteCollection) {
        setFavorites(loadArtistFavorites(favoriteCollection));
      }
    };
    setFavorites(loadArtistFavorites(favoriteCollection));
    window.addEventListener(ARTIST_FAVORITES_CHANGED_EVENT, syncFavorites);
    return () => window.removeEventListener(ARTIST_FAVORITES_CHANGED_EVENT, syncFavorites);
  }, [favoriteCollection]);

  useEffect(() => () => {
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
  }, []);

  const patchGeneration = <K extends keyof GenerateParams>(
    key: K,
    value: GenerateParams[K],
  ) => setGenerationParams((current) => {
    const next = { ...current, [key]: value };
    if (key === "model" && !String(value).startsWith("nai-diffusion-5")) {
      if (next.qualityPreset === "light") next.qualityPreset = "standard";
      next.transparentBackground = false;
    }
    if (key === "smea" && value === false) next.smeaDyn = false;
    next.qualityToggle = next.qualityPreset !== "none";
    return next;
  });

  const clearTemporaryResults = () => {
    const temporaryPaths = results.filter((item) => !item.liked && item.image?.filePath).map((item) => item.image!.filePath);
    setResults([]);
    for (const filePath of temporaryPaths) void window.naiDesktop.artistLabDeleteTemporary(filePath).catch(() => undefined);
  };

  const installCandidates = (recipes: GeneratedArtistRecipe[]) => {
    clearTemporaryResults();
    const batch = Date.now().toString(36);
    const fixed = Math.max(1, Math.min(2_147_483_647, Math.floor(seed || freshSeed())));
    const pending: SharedArtistFavorite[] = recipes.map((recipe, index) => ({
      ...recipe,
      id: `${batch}-${recipe.id}`,
      pairId: `${batch}-${recipe.id}`,
      variant: "plain",
      sequence: index + 1,
      status: "pending",
      generationModel: generationParams.model,
      generationSeed: seedMode === "fixed" ? fixed : freshSeed(),
    }));
    setResults(pending);
    setShowFavorites(false);
    return pending;
  };

  const repair = () => {
    if (!input.trim()) {
      setOutput("");
      setMessage(text.empty);
      return null;
    }
    const normalized = normalizeV45ArtistSyntax(input);
    const recipes = repairV45ArtistCandidatesForV5(
      input,
      clampNumber(candidateCount, 10, 1, 100),
      Math.random,
      weightControlMode === "advanced" ? {
        min: minWeight,
        max: maxWeight,
        mode: weightMode,
        leftDispersion,
        rightDispersion,
        softBalance,
      } : undefined,
    );
    if (recipes.length === 0) {
      setOutput("");
      setMessage(text.none);
      return null;
    }
    installCandidates(recipes);
    setOutput(formatArtistCardTags(recipes[0]));
    setMessage(interpolate(text.adjusted, {
      candidates: recipes.length,
      count: normalized.totalAdjusted,
      artists: normalized.artistTagCount,
      quality: normalized.qualityTagCount,
      other: normalized.otherTagCount,
    }));
    setCopiedAction("");
    return recipes;
  };

  const draw = () => {
    if (!drawSource.trim()) return setMessage(text.drawEmpty);
    const normalized = normalizeV45ArtistSyntax(drawSource);
    const recipes = drawAllV5ArtistWeights(
      normalized.output,
      clampNumber(candidateCount, 10, 1, 100),
      clampNumber(minWeight, DEFAULT_V5_ARTIST_DRAW_MIN, 0.05, 10),
      clampNumber(maxWeight, DEFAULT_V5_ARTIST_DRAW_MAX, 0.05, 10),
      Math.random,
      weightControlMode === "advanced" ? {
        min: minWeight,
        max: maxWeight,
        mode: weightMode,
        leftDispersion,
        rightDispersion,
        softBalance,
      } : undefined,
    );
    if (recipes.length === 0) return setMessage(text.drawNone);
    installCandidates(recipes);
    setMessage(interpolate(text.allTags, {
      count: normalized.totalAdjusted,
      artists: normalized.artistTagCount,
      quality: normalized.qualityTagCount,
      other: normalized.otherTagCount,
    }));
  };

  const normalizeDrawInput = () => {
    if (!drawInput.trim()) return;
    const normalized = normalizeV45ArtistSyntax(drawInput);
    if (normalized.totalAdjusted > 0 && normalized.output !== drawInput) {
      setDrawInput(normalized.output);
    }
  };

  const generateOne = async (candidate: SharedArtistFavorite) => {
    const request: GenerateParams = {
      ...generationParams, positivePrompt: basePrompt.trim(), stylePrompt: candidate.prompt,
      seedMode: "fixed", seed: candidate.generationSeed ?? seed,
    };
    setResults((current) => current.map((item) => item.id === candidate.id ? { ...item, status: "generating", error: undefined } : item));
    try {
      const generated = await window.naiDesktop.generateArtistLab(request, { vibeImages: [], charCaptions: [], preciseReferences: [] }, "random");
      const image = generated.items[0];
      if (!generated.ok || !image) throw new Error(generated.message);
      setResults((current) => current.map((item) => item.id === candidate.id ? { ...item, image, status: "done", generationModel: image.model || generationParams.model } : item));
    } catch (error: any) {
      setResults((current) => current.map((item) => item.id === candidate.id ? { ...item, status: "failed", error: error?.message ?? String(error) } : item));
    }
  };

  const generateBatch = async () => {
    if (results.length === 0) return setMessage(text.needDraw);
    if (!basePrompt.trim()) return setMessage(text.needPrompt);
    setRunning(true);
    cancelRef.current = false;
    for (const candidate of results) {
      if (cancelRef.current) break;
      await generateOne(candidate);
    }
    setRunning(false);
    await refreshAccount().catch(() => undefined);
    if (!cancelRef.current) setMessage(text.complete);
  };

  const retry = async (candidate: SharedArtistFavorite) => {
    if (running) return;
    setRunning(true);
    await generateOne(candidate);
    setRunning(false);
    await refreshAccount().catch(() => undefined);
  };

  const saveFavorite = async (candidate: SharedArtistFavorite) => {
    if (!candidate.image || candidate.liked || candidate.saving) return;
    setResults((current) => current.map((item) => item.id === candidate.id ? { ...item, saving: true } : item));
    try {
      const image = await window.naiDesktop.artistLabPromoteFavorite(candidate.image);
      const saved: SharedArtistFavorite = { ...candidate, image, liked: true, saving: false, status: "done" };
      addArtistFavorite(favoriteCollection, saved);
      setFavorites(loadArtistFavorites(favoriteCollection));
      setResults((current) => current.map((item) => item.id === candidate.id ? saved : item));
      await refreshHistory();
    } catch (error: any) {
      setResults((current) => current.map((item) => item.id === candidate.id ? { ...item, saving: false } : item));
      setMessage(error?.message ?? String(error));
    }
  };

  const removeFavorite = async (candidate: SharedArtistFavorite) => {
    if (!candidate.image) return;
    const deleted = await deleteHistory(candidate.image.id);
    if (!deleted) return;
    removeArtistFavorite(favoriteCollection, candidate.id);
    setFavorites(loadArtistFavorites(favoriteCollection));
    setResults((current) => current.filter((item) => item.id !== candidate.id));
    setMessage(text.removed);
  };

  const applyCandidate = (candidate: SharedArtistFavorite) => {
    applyParams({
      ...generationParams,
      model: (candidate.generationModel || generationParams.model) as GenerateParams["model"],
      positivePrompt: basePrompt.trim(), stylePrompt: candidate.prompt, seedMode: "fixed", seed: candidate.generationSeed ?? seed,
    });
    setMessage(text.applied);
  };

  const restoreDefaults = () => {
    setMinWeight(DEFAULT_V5_ARTIST_DRAW_MIN);
    setMaxWeight(DEFAULT_V5_ARTIST_DRAW_MAX);
    setWeightControlMode("novice");
    setWeightMode(DEFAULT_WEIGHT_DISTRIBUTION.mode);
    setLeftDispersion(DEFAULT_WEIGHT_DISTRIBUTION.leftDispersion);
    setRightDispersion(DEFAULT_WEIGHT_DISTRIBUTION.rightDispersion);
    setCandidateCount(10);
    setSeedMode("fixed");
    setSeed(246813579);
    if (!drawMode) {
      setOutput("");
      clearTemporaryResults();
    }
    setMessage("");
  };

  const syncGenerationParams = () => {
    setGenerationParams(normalizeDrawGenerationParams(params));
  };

  const resetGenerationParams = () => {
    setGenerationParams(normalizeDrawGenerationParams(DEFAULT_PARAMS));
  };

  const modelLabel = (model: string) => NAI_MODELS.find((item) => item.value === model)?.label ?? model;
  const candidateDimensions = (candidate: SharedArtistFavorite) => ({
    width: candidate.image?.width || generationParams.width,
    height: candidate.image?.height || generationParams.height,
  });
  const copyCandidate = async (value: string, key: string) => {
    // Both artist-string tools share the same clipboard contract: result tags
    // and full prompts always end in exactly one ASCII comma.
    await navigator.clipboard.writeText(ensureTrailingPromptComma(value));
    setCopiedAction(key);
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => {
      setCopiedAction((current) => current === key ? "" : current);
    }, 1800);
  };
  const renderCandidate = (candidate: SharedArtistFavorite, favorite = false) => {
    const dimensions = candidateDimensions(candidate);
    const candidateModel = candidate.image?.model || candidate.generationModel || generationParams.model;
    const artistCopyKey = `${candidate.id}:artists`;
    const fullCopyKey = `${candidate.id}:full`;
    return (
    <article key={candidate.id} className={`artist-candidate v5-draw-card ${candidate.status}`}>
      <header className="artist-candidate-header"><div><b>#{String(candidate.sequence).padStart(2, "0")}</b><small>{modelLabel(candidateModel)} · {dimensions.width}×{dimensions.height}</small></div><span>{favorite || candidate.liked ? text.saved : text[candidate.status === "generating" ? "generatingOne" : candidate.status]}</span></header>
      <div className="artist-candidate-media v5-draw-image" style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}` }}>
        {candidate.image ? <><img src={candidate.image.fileUrl} alt={candidate.prompt} loading="lazy" decoding="async" title={text.preview} onDoubleClick={() => setPreviewCandidate(candidate)} /><button type="button" className="artist-candidate-preview-button" aria-label={text.preview} title={text.preview} onClick={() => setPreviewCandidate(candidate)}><Icon name="search" /></button></> : <div className="artist-candidate-placeholder"><Icon name={candidate.status === "generating" ? "loader" : "image"} /></div>}
      </div>
      <div className="artist-string-block">
        <div className="artist-copy-actions">
          <button type="button" className={copiedAction === artistCopyKey ? "copied" : ""} onClick={() => void copyCandidate(formatArtistCardTags(candidate), artistCopyKey)}>{copiedAction === artistCopyKey ? copyText.copied : copyText.artists}</button>
          <button type="button" className={copiedAction === fullCopyKey ? "copied" : ""} onClick={() => void copyCandidate(formatArtistFullPrompt(candidate, basePrompt), fullCopyKey)}>{copiedAction === fullCopyKey ? copyText.copied : copyText.full}</button>
        </div>
        <code>{formatArtistCardTags(candidate)}</code>
      </div>
      <small className={`artist-error ${candidate.error ? "" : "empty"}`} title={candidate.error}>{candidate.error ?? "\u00a0"}</small>
      <footer className="artist-candidate-actions">
        {favorite ? <Button variant="ghost" onClick={() => void removeFavorite(candidate)}><Icon name="trash" />{text.remove}</Button>
          : candidate.status === "failed" ? <Button variant="ghost" disabled={running} onClick={() => void retry(candidate)}><Icon name="refresh" />{text.retry}</Button>
            : <Button variant="ghost" disabled={candidate.status !== "done" || candidate.liked || candidate.saving} onClick={() => void saveFavorite(candidate)}><Icon name="star" />{candidate.saving ? text.saving : candidate.liked ? text.saved : text.favorite}</Button>}
        <Button variant="primary" disabled={candidate.status !== "done"} onClick={() => applyCandidate(candidate)}>{text.apply}</Button>
      </footer>
    </article>
    );
  };

  const completed = results.filter((item) => item.status === "done" || item.status === "failed").length;
  return <>
    <main className="artist-lab v5-artist-repair artist-string-tool">
      <header className="artist-lab-hero v5-artist-repair-hero">
        <div>
          <span>{drawMode ? "V5 ARTIST DRAW" : "V4.5 → V5"}</span>
          <h2>{drawMode ? text.drawPageTitle : text.title}</h2>
          <p>{drawMode ? text.drawPageSubtitle : text.subtitle}</p>
        </div>
        <Button onClick={onBack}>{text.back}</Button>
      </header>

      {!drawMode && (
        <>
          <section className="artist-lab-panel v5-artist-repair-card evidence">
            <div className="v5-artist-repair-note-icon"><Icon name="info" /></div>
            <div><b>{text.noteTitle}</b><p>{text.note}</p><small>{text.safe}</small></div>
          </section>
          <section className="artist-lab-panel v5-artist-repair-card editor">
            <div className="v5-artist-repair-section-head"><div><b>{text.strategy}</b><span>×0.333–0.5</span></div></div>
            <div className="v5-artist-repair-editors">
              <label className="source"><span>{text.input}</span><textarea value={input} placeholder={text.inputHint} onChange={(event) => { setInput(event.target.value); setOutput(""); }} /></label>
              <div className="v5-artist-repair-flow" aria-hidden="true"><span>→</span></div>
              <label className="result"><span>{text.output}</span><textarea value={output} readOnly placeholder="0.4::artist:xiaoluo_xl ::" /></label>
            </div>
            <p className="v5-repair-batch-hint">{text.repairBatchHint}</p>
            <div className="v5-weight-draw-controls v5-repair-batch-controls">
              {weightControlMode === "advanced" && <>
                <label><span>{text.weightMin}</span><NumericDraftInput min={0.05} max={10} step={0.05} value={minWeight} normalize={(value) => Math.round(value * 100) / 100} onCommit={setMinWeight} /></label>
                <label><span>{text.weightMax}</span><NumericDraftInput min={0.05} max={10} step={0.05} value={maxWeight} normalize={(value) => Math.round(value * 100) / 100} onCommit={setMaxWeight} /></label>
              </>}
              <WeightDistributionControls language={language} controlMode={weightControlMode} min={minWeight} max={maxWeight} mode={weightMode} leftDispersion={leftDispersion} rightDispersion={rightDispersion} softBalance={softBalance} onModeChange={setWeightControlMode} onChange={(value) => { if (value.mode != null) setWeightMode(value.mode); if (value.leftDispersion != null) setLeftDispersion(value.leftDispersion); if (value.rightDispersion != null) setRightDispersion(value.rightDispersion); if (value.softBalance != null) setSoftBalance(value.softBalance); }} />
              <label><span>{text.candidateCount}</span><NumericDraftInput min={1} max={100} step={1} value={candidateCount} normalize={(value) => Math.floor(value)} onCommit={setCandidateCount} /></label>
              <div className="positive-prompt-preset-field wide">
                <div><span>{text.basePrompt}</span><PositivePromptPresetControl value={basePrompt} onApply={setBasePrompt} variant="field" /></div>
                <textarea aria-label={text.basePrompt} value={basePrompt} onChange={(event) => setBasePrompt(event.target.value)} />
              </div>
              <fieldset className="v5-seed-control wide"><legend>{text.seedMode}</legend><label><input type="radio" checked={seedMode === "fixed"} onChange={() => setSeedMode("fixed")} />{text.fixedSeed}</label><label><input type="radio" checked={seedMode === "random"} onChange={() => setSeedMode("random")} />{text.randomSeed}</label>{seedMode === "fixed" && <div><NumericDraftInput aria-label={text.seed} min={1} max={2147483647} step={1} value={seed} normalize={(value) => Math.floor(value)} onCommit={setSeed} /><Button variant="ghost" onClick={() => setSeed(freshSeed())}>{text.randomizeSeed}</Button></div>}</fieldset>
            </div>
          </section>
        </>
      )}

      {drawMode && (
          <section className="artist-lab-panel v5-artist-repair-card v5-weight-draw-panel">
            <div className="v5-weight-draw-heading">
              <div><h3>{text.drawTitle}</h3><p>{text.drawHint}</p></div>
              <Button variant="ghost" onClick={restoreDefaults}><Icon name="refresh" /> {text.reset}</Button>
            </div>
            <label className="v5-weight-draw-input">
              <span>{text.drawInput}</span>
              <textarea value={drawInput} placeholder={text.drawInputHint} onBlur={normalizeDrawInput} onChange={(event) => { setDrawInput(event.target.value); setMessage(""); }} />
              {tagSummary.totalAdjusted > 0 && <small>{interpolate(text.allTags, {
                count: tagSummary.totalAdjusted,
                artists: tagSummary.artistTagCount,
                quality: tagSummary.qualityTagCount,
                other: tagSummary.otherTagCount,
              })}</small>}
            </label>
            <details className="random-custom-tag-workbench v5-draw-tag-library" onToggle={(event) => setDrawTagLibraryOpen(event.currentTarget.open)}>
              <summary>
                <span><b>{drawLibraryText.title}</b><small>{interpolate(drawLibraryText.selected, { count: drawStyleTags.size })}</small></span>
                <Icon name="chevronDown" />
              </summary>
              <div className="random-custom-tag-body">
                <div className="random-custom-tag-toolbar">
                  <label className="random-custom-tag-search">
                    <Icon name="search" />
                    <input type="search" value={drawTagQuery} placeholder={drawLibraryText.search} onChange={(event) => setDrawTagQuery(event.target.value)} />
                    {drawTagQuery && <button type="button" aria-label="clear" onClick={() => setDrawTagQuery("")}><Icon name="clear" /></button>}
                  </label>
                  <div className="random-custom-tag-toolbar-status" aria-live="polite"><span>{`${drawLibraryItems.length} / ${Math.max(drawCatalogTotal, drawLibraryItems.length)}`}</span><small>{drawCatalogTotal > 0 ? drawLibraryText.local : drawLibraryText.offline}</small></div>
                </div>
                <div className="random-custom-tag-categories" role="tablist">
                  <button type="button" role="tab" aria-selected={drawTagCategory === "all"} className={drawTagCategory === "all" ? "active" : ""} onClick={() => setDrawTagCategory("all")}><span>{drawLibraryText.all}</span><em>{drawTagCategory === "all" && !drawCatalogLoading ? drawCatalogTotal : "DB"}</em></button>
                  {RANDOM_CUSTOM_TAG_LIBRARY.map((category) => <button key={category.id} type="button" role="tab" aria-selected={drawTagCategory === category.id} className={drawTagCategory === category.id ? "active" : ""} onClick={() => setDrawTagCategory(category.id)}><span>{customTagCategoryLabel(category, language)}</span><em>{drawTagCategory === category.id && !drawCatalogLoading ? drawCatalogTotal : "DB"}</em></button>)}
                  <button type="button" role="tab" aria-selected={drawTagCategory === "danbooru-style"} className={drawTagCategory === "danbooru-style" ? "active" : ""} onClick={() => setDrawTagCategory("danbooru-style")}><span>{drawLibraryText.styles}</span><em>{drawTagCategory === "danbooru-style" && !drawCatalogLoading ? drawCatalogTotal : "DB"}</em></button>
                  <button type="button" role="tab" aria-selected={drawTagCategory === "copyright"} className={drawTagCategory === "copyright" ? "active" : ""} onClick={() => setDrawTagCategory("copyright")}><span>{drawLibraryText.works}</span><em>{drawTagCategory === "copyright" && !drawCatalogLoading ? drawCatalogTotal : "DB"}</em></button>
                </div>
                <div className="random-custom-tag-results" ref={drawCatalogResultsRef}>
                  {drawCatalogLoading
                    ? <div className="random-custom-tag-empty"><span className="spinner" /><span>{drawLibraryText.loading}</span></div>
                    : drawLibraryItems.length === 0
                      ? <div className="random-custom-tag-empty"><Icon name="search" /><span>{drawLibraryText.empty}</span></div>
                      : <section><div className="random-custom-tag-grid">
                        {drawLibraryItems.map((entry) => {
                          const selected = drawStyleTags.has(entry.tag);
                          const meaning = drawCatalogMeaning(entry);
                          const canPreview = /_\(style\)$/i.test(entry.tag);
                          return <article
                            key={entry.tag}
                            className={`${selected ? "selected" : ""}${canPreview ? " has-preview" : ""}`}
                            onPointerEnter={canPreview ? (event) => showDrawStylePreview(entry, meaning, event) : undefined}
                            onPointerLeave={canPreview ? hideDrawStylePreview : undefined}
                          ><button type="button" className="random-custom-tag-select" aria-pressed={selected} onClick={() => toggleDrawStyleTag(entry.tag)}><span className="random-custom-tag-check"><Icon name={selected ? "check" : "plus"} /></span><span><b>{entry.tag}</b><small>{meaning}</small></span><em>{canPreview ? <Icon name="image" /> : entry.count > 0 ? entry.count.toLocaleString() : ""}</em></button></article>;
                        })}
                      </div>{drawCatalogItems.length < drawCatalogTotal && <div className="random-custom-tag-load-more"><Button type="button" variant="ghost" disabled={drawCatalogLoadingMore} onClick={() => void loadMoreDrawCatalog()}>{drawCatalogLoadingMore && <span className="spinner" />}{drawLibraryText.more}</Button></div>}</section>}
                </div>
              </div>
            </details>
            <div className="v5-weight-draw-controls">
              <label><span>{text.weightMin}</span><NumericDraftInput min={0.05} max={10} step={0.05} value={minWeight} normalize={(value) => Math.round(value * 100) / 100} onCommit={setMinWeight} /></label>
              <label><span>{text.weightMax}</span><NumericDraftInput min={0.05} max={10} step={0.05} value={maxWeight} normalize={(value) => Math.round(value * 100) / 100} onCommit={setMaxWeight} /></label>
              <label><span>{text.candidateCount}</span><NumericDraftInput min={1} max={100} step={1} value={candidateCount} normalize={(value) => Math.floor(value)} onCommit={setCandidateCount} /></label>
              <WeightDistributionControls language={language} controlMode={weightControlMode} min={minWeight} max={maxWeight} mode={weightMode} leftDispersion={leftDispersion} rightDispersion={rightDispersion} softBalance={softBalance} onModeChange={setWeightControlMode} onChange={(value) => { if (value.mode != null) setWeightMode(value.mode); if (value.leftDispersion != null) setLeftDispersion(value.leftDispersion); if (value.rightDispersion != null) setRightDispersion(value.rightDispersion); if (value.softBalance != null) setSoftBalance(value.softBalance); }} />
              <div className="positive-prompt-preset-field wide">
                <div><span>{text.basePrompt}</span><PositivePromptPresetControl value={basePrompt} onApply={setBasePrompt} variant="field" /></div>
                <textarea aria-label={text.basePrompt} value={basePrompt} onChange={(event) => setBasePrompt(event.target.value)} />
              </div>
              <fieldset className="v5-seed-control wide"><legend>{text.seedMode}</legend><label><input type="radio" checked={seedMode === "fixed"} onChange={() => setSeedMode("fixed")} />{text.fixedSeed}</label><label><input type="radio" checked={seedMode === "random"} onChange={() => setSeedMode("random")} />{text.randomSeed}</label>{seedMode === "fixed" && <div><NumericDraftInput aria-label={text.seed} min={1} max={2147483647} step={1} value={seed} normalize={(value) => Math.floor(value)} onCommit={setSeed} /><Button variant="ghost" onClick={() => setSeed(freshSeed())}>{text.randomizeSeed}</Button></div>}</fieldset>
            </div>
          </section>
      )}

      <details className="artist-lab-panel v5-artist-repair-card random-generation-settings v5-draw-generation-settings" open>
            <summary>
              <span><b>{paramText.title}</b><small>{paramText.hint}</small></span>
              <span className="random-generation-header-actions">
                <Button type="button" variant="ghost" onClick={(event) => { event.preventDefault(); syncGenerationParams(); }}>{paramText.sync}</Button>
                <Button type="button" variant="ghost" onClick={(event) => { event.preventDefault(); resetGenerationParams(); }}>{paramText.reset}</Button>
              </span>
            </summary>
            <div className="random-generation-grid">
              <label className="wide"><span>{paramText.model}</span><SelectMenuCompat value={generationParams.model} onChange={(event) => patchGeneration("model", event.target.value as GenerateParams["model"])}>{NAI_MODELS.map((model) => <option key={model.value} value={model.value}>{model.value}</option>)}</SelectMenuCompat></label>
              <fieldset className="random-size-fields">
                <legend>{paramText.size}</legend>
                <div className="random-size-presets" role="group" aria-label={paramText.size}>
                  {DRAW_SIZE_PRESETS.map((preset, index) => {
                    const active = generationParams.width === preset.width && generationParams.height === preset.height;
                    return <button key={`${preset.width}x${preset.height}`} type="button" className={active ? "active" : ""} aria-pressed={active} onClick={() => setGenerationParams((current) => ({ ...current, width: preset.width, height: preset.height }))}><span>{sizeLabels[index]}</span><b>{preset.width}×{preset.height}</b></button>;
                  })}
                </div>
                <label><span>{paramText.width}</span><NumericDraftInput min={64} max={maxNAIDimensionFor(generationParams.height)} step={64} value={generationParams.width} normalize={(value) => snapNAIDimensionWithinArea(value, generationParams.height, generationParams.width)} onCommit={(value) => patchGeneration("width", value)} /></label>
                <label><span>{paramText.height}</span><NumericDraftInput min={64} max={maxNAIDimensionFor(generationParams.width)} step={64} value={generationParams.height} normalize={(value) => snapNAIDimensionWithinArea(value, generationParams.width, generationParams.height)} onCommit={(value) => patchGeneration("height", value)} /></label>
              </fieldset>
              <label><span>{paramText.steps}</span><NumericDraftInput min={1} max={50} step={1} value={generationParams.steps} normalize={(value) => Math.floor(value)} onCommit={(value) => patchGeneration("steps", value)} /></label>
              <label><span>{paramText.cfg}</span><NumericDraftInput min={1} max={10} step={0.1} value={generationParams.cfgScale} onCommit={(value) => patchGeneration("cfgScale", value)} /></label>
              <label><span>{paramText.rescale}</span><NumericDraftInput min={0} max={1} step={0.01} value={generationParams.cfgRescale} onCommit={(value) => patchGeneration("cfgRescale", value)} /></label>
              <label><span>{paramText.sampler}</span><SelectMenuCompat value={generationParams.sampler} onChange={(event) => patchGeneration("sampler", event.target.value as GenerateParams["sampler"])}>{NAI_SAMPLERS.map((sampler) => <option key={sampler.value} value={sampler.value}>{sampler.value}</option>)}</SelectMenuCompat></label>
              {supportsNAINoiseScheduleControl(generationParams.model) ? <label><span>{paramText.noise}</span><SelectMenuCompat value={generationParams.noiseSchedule} onChange={(event) => patchGeneration("noiseSchedule", event.target.value)}><option value="native">native</option><option value="karras">karras</option><option value="exponential">exponential</option></SelectMenuCompat></label> : null}
              <label><span>{paramText.uc}</span><SelectMenuCompat value={generationParams.ucPreset} onChange={(event) => patchGeneration("ucPreset", Number(event.target.value) as GenerateParams["ucPreset"])}>{NAI_UC_PRESETS.map((preset, index) => <option key={preset.value} value={preset.value}>{preset.value} · {ucLabels[index]}</option>)}</SelectMenuCompat></label>
              <label className="wide"><span>{paramText.negative}</span><textarea value={generationParams.negativePrompt} onChange={(event) => patchGeneration("negativePrompt", event.target.value)} /></label>
              <QualityPresetControl className="wide" language={language} model={generationParams.model} value={generationParams.qualityPreset} transparentBackground={generationParams.transparentBackground} onChange={(value) => patchGeneration("qualityPreset", value)} onTransparentChange={(value) => patchGeneration("transparentBackground", value)} />
              <div className="random-generation-toggles wide">
                {supportsNAIVariety(generationParams.model) ? <label><input type="checkbox" checked={generationParams.variety} onChange={(event) => patchGeneration("variety", event.target.checked)} /><span>{paramText.variety}</span></label> : null}
                {!isNAIV4PlusModel(generationParams.model) ? <><label><input type="checkbox" checked={generationParams.smea} onChange={(event) => patchGeneration("smea", event.target.checked)} /><span>{paramText.smea}</span></label><label><input type="checkbox" checked={generationParams.smeaDyn} disabled={!generationParams.smea} onChange={(event) => patchGeneration("smeaDyn", event.target.checked)} /><span>{paramText.smeaDyn}</span></label></> : null}
              </div>
            </div>
      </details>

      <section className="artist-result-toolbar artist-string-result-toolbar">
        <div className="artist-result-actions">
          {drawMode ? <Button onClick={draw} disabled={running}><Icon name="dice" />{text.draw}</Button> : <Button onClick={repair} disabled={running}><Icon name="dice" />{text.run}</Button>}
          {running ? <Button variant="danger" onClick={() => { cancelRef.current = true; void window.naiDesktop.cancel(); }}>{text.stop}</Button> : <Button variant="primary" onClick={() => void generateBatch()} disabled={results.length === 0}>{text.generate}</Button>}
          {!drawMode && <Button disabled={!output} onClick={() => void copyCandidate(output, "first-output")}>{copiedAction === "first-output" ? text.copied : text.copy}</Button>}
          <span className={message === text.drawNone || message === text.none ? "warning" : ""}>{running ? interpolate(text.generating, { done: completed, total: results.length }) : message}</span>
        </div>
        <nav className="artist-result-tabs artist-string-result-tabs" aria-label={`${text.results} / ${text.favorites}`}><button type="button" className={!showFavorites ? "active" : ""} onClick={() => setShowFavorites(false)}><span>{text.results}</span><b>{results.length}</b></button><button type="button" className={showFavorites ? "active" : ""} onClick={() => { setFavorites(loadArtistFavorites(favoriteCollection)); setShowFavorites(true); }}><span>{text.favorites}</span><b>{favorites.length}</b></button></nav>
        <small className="artist-result-library-note">{text.sharedFavorites}</small>
      </section>
      {!showFavorites && (results.length > 0 ? <section className="artist-candidate-grid v5-draw-grid">{results.map((item) => renderCandidate(item))}</section> : <div className="artist-queue-empty v5-draw-empty">{drawMode ? text.noResults : text.repairNoResults}</div>)}
      {showFavorites && (favorites.length > 0 ? <section className="artist-candidate-grid v5-draw-grid">{favorites.map((item) => renderCandidate(item, true))}</section> : <div className="artist-queue-empty v5-draw-empty">{text.noFavorites}</div>)}
    </main>
    {drawStylePreview && <AppPortal><aside
      className={`artist-style-reference-popover ${drawStylePreview.status}`}
      style={{ left: drawStylePreview.left, top: drawStylePreview.top }}
      role="status"
      aria-live="polite"
    >
      <header><span><Icon name="image" />{styleReferenceText.title}</span><b>{drawStylePreview.tag}</b></header>
      <div className="artist-style-reference-media">
        {drawStylePreview.status === "loading"
          ? <span className="artist-style-reference-message"><span className="spinner" />{styleReferenceText.loading}</span>
          : drawStylePreview.result
            ? <img src={drawStylePreview.result.imageUrl} alt={`${styleReferenceText.title}: ${drawStylePreview.tag}`} />
            : <span className="artist-style-reference-message"><Icon name="image" />{styleReferenceText.empty}</span>}
      </div>
      <footer><span>{drawStylePreview.meaning}</span>{drawStylePreview.result && <small>{drawStylePreview.result.width}×{drawStylePreview.result.height}</small>}</footer>
    </aside></AppPortal>}
    {previewCandidate?.image && <AppPortal><div className="modal-backdrop artist-result-preview-backdrop" role="dialog" aria-modal="true" aria-label={text.preview} onMouseDown={() => setPreviewCandidate(null)}><div className="artist-result-preview" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="artist-result-preview-close" aria-label={text.back} onClick={() => setPreviewCandidate(null)}><Icon name="close" /></button><img src={previewCandidate.image.fileUrl} alt={previewCandidate.prompt} /><footer><b>{modelLabel(previewCandidate.image.model || previewCandidate.generationModel || generationParams.model)}</b><span>{previewCandidate.image.width}×{previewCandidate.image.height}</span></footer></div></div></AppPortal>}
  </>;
}
