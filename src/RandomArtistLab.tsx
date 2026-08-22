import { useEffect, useLayoutEffect, useMemo, useRef, useState, type InputHTMLAttributes } from "react";
import { AppPortal, Button, SelectMenu } from "./components/ui";
import { Icon } from "./components/icons";
import {
  expandArtistRecipeComparisons,
  formatArtistFullPrompt,
  formatArtistString,
  generatePopularArtistRecipes,
  randomizeArtistRecipeWeights,
  type ArtistRecipeComparison,
  type ArtistRecipeVariant,
  type GeneratedArtistRecipe,
  type StyleMutationCategory,
} from "./artist-recipe";
import { createArtistLabRandom, type ArtistTagRecord } from "./artist-lab";
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
  type GenerateParams,
  type HistoryItem,
} from "./types";

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
};

type RandomSession = {
  basePrompt: string;
  auxiliaryPrompt: string;
  count: number;
  artistCount: number;
  poolSize: number;
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

const STORAGE_KEY = "langbai.artist-lab.random.v4";
let sessionCache: RandomSession | null = null;

const RANDOM_SIZE_PRESETS = [
  { width: 832, height: 1216 },
  { width: 1024, height: 1024 },
  { width: 1216, height: 832 },
  { width: 1024, height: 1536 },
  { width: 1536, height: 1024 },
  { width: 1472, height: 1472 },
] as const;

const TEXT = {
  "zh-CN": { title: "随机画师串抽卡", subtitle: "每次抽卡重新组合画师、权重和可选风格词；内容、Seed 与生成参数保持不变。", back: "返回画风实验室", pool: "热门画师候选库", poolSize: "按热度载入前 N 名", load: "载入", ready: "已按热度载入前 {count} 名画师", loading: "正在读取热门画师…", refresh: "刷新排行", hint: "可选择 100～5000 名热门画师，并额外加入 33 个经 Claude、Codex、Grok 联合核验的有效画师标签。Danbooru 标签有效不代表 NovelAI V5 必然还原其画风。", base: "固定内容提示词", auxiliary: "固定附加词（每次都保留）", mutate: "抽卡时额外加入随机风格词", mutateHint: "开启后，每组使用同一画师串、提示词、Seed 和参数生成 A/B 两张：A 不加风格词，B 从画风、媒介/笔触、色彩、光影、氛围中抽取 2～6 个带 0.3～1.5 权重的词。", count: "本批画师串数量", range: "每串画师数量（最多 20 名）", min: "最少", max: "最多", seed: "固定 NovelAI Seed", draw: "重新抽卡", preview: "本批抽卡预览", previewHint: "开启随机风格词时，每组生成 A/B 两张对照图；重新抽卡会清除上一批未收藏的临时图片。", generate: "生成这一批", stop: "停止任务", refine: "根据喜欢项再抽卡", needPool: "画师池尚未载入。", needPrompt: "请填写固定内容提示词。", needLikes: "请先收藏至少一个喜欢项。", running: "正在生成 {done}/{total}", complete: "本批已完成；未收藏图片会在下一次抽卡时自动清理。", pending: "等待", generating: "生成中", done: "已完成", failed: "失败", like: "收藏到喜欢", saved: "已收藏", saving: "保存中…", retry: "重试", apply: "应用到生成", copy: "复制", copied: "已复制画师串。", applied: "已应用到生成页。", empty: "画师池加载后即可抽卡。", unlimited: "输入画师串组数；开启随机风格词时，实际图片数为两倍。", mutation: "本次风格/光影变异词", favorites: "喜欢的画风", favoritesHint: "A、B 可分别收藏；收藏 B 后，开启风格词的偏好抽卡也会参考其风格词与权重。", remove: "移除收藏", removed: "已移除收藏和本地图片。", categories: "艺术风格|媒介/笔触|色彩|光影|氛围", variantPlain: "A｜仅画师串", variantMutated: "B｜画师串＋随机风格词", copyArtists: "复制画师串", copyFull: "复制完整提示词", copiedArtists: "已复制画师串。", copiedFull: "已复制完整提示词。", pairSummary: "{pairs} 组 · {images} 张", validation: "Danbooru 验证：33/33 为当前有效、非废弃画师标签 · 2026-08-22", allModels: "全部模型", modelGroup: "生成模型", previewImage: "双击预览大图" },
  "zh-TW": { title: "隨機畫師串抽卡", subtitle: "每次抽卡重新組合畫師、權重與可選風格詞；內容、Seed 與生成參數保持不變。", back: "返回畫風實驗室", pool: "熱門畫師候選庫", poolSize: "依熱度載入前 N 名", load: "載入", ready: "已依熱度載入前 {count} 名畫師", loading: "正在讀取熱門畫師…", refresh: "更新排行", hint: "可選擇 100～5000 名熱門畫師，並額外加入 33 個經 Claude、Codex、Grok 聯合核驗的有效畫師標籤。Danbooru 標籤有效不代表 NovelAI V5 必然還原其畫風。", base: "固定內容提示詞", auxiliary: "固定附加詞（每次保留）", mutate: "抽卡時額外加入隨機風格詞", mutateHint: "開啟後，每組以相同畫師串、提示詞、Seed 與參數生成 A/B 兩張：A 不加風格詞，B 抽取 2～6 個帶 0.3～1.5 權重的畫風詞。", count: "本批畫師串組數", range: "每串畫師數量（最多 20 名）", min: "最少", max: "最多", seed: "固定 NovelAI Seed", draw: "重新抽卡", preview: "本批抽卡預覽", previewHint: "開啟隨機風格詞時每組生成 A/B 兩張；重新抽卡會清除未收藏暫存圖。", generate: "生成這一批", stop: "停止任務", refine: "依喜歡項再抽卡", needPool: "畫師池尚未載入。", needPrompt: "請填寫固定內容提示詞。", needLikes: "請先收藏至少一項。", running: "正在生成 {done}/{total}", complete: "本批已完成；未收藏圖片會於下次抽卡清理。", pending: "等待", generating: "生成中", done: "已完成", failed: "失敗", like: "收藏到喜歡", saved: "已收藏", saving: "儲存中…", retry: "重試", apply: "套用到生成", copy: "複製", copied: "已複製畫師串。", applied: "已套用到生成頁。", empty: "畫師池載入後即可抽卡。", unlimited: "輸入畫師串組數；開啟隨機風格詞時實際圖片數為兩倍。", mutation: "本次風格/光影變異詞", favorites: "喜歡的畫風", favoritesHint: "A、B 可分別收藏；收藏 B 後，偏好抽卡也會參考其風格詞與權重。", remove: "移除收藏", removed: "已移除收藏與本機圖片。", categories: "藝術風格|媒介/筆觸|色彩|光影|氛圍", variantPlain: "A｜僅畫師串", variantMutated: "B｜畫師串＋隨機風格詞", copyArtists: "複製畫師串", copyFull: "複製完整提示詞", copiedArtists: "已複製畫師串。", copiedFull: "已複製完整提示詞。", pairSummary: "{pairs} 組 · {images} 張", validation: "Danbooru 驗證：33/33 為目前有效、非棄用畫師標籤 · 2026-08-22", allModels: "全部模型", modelGroup: "生成模型", previewImage: "雙擊預覽大圖" },
  "en-US": { title: "Random Artist-string Gacha", subtitle: "Every draw rerolls artists, weights, and optional style terms while content, seed, and generation settings stay fixed.", back: "Back to Artist Lab", pool: "Popular artist pool", poolSize: "Load top N by popularity", load: "Load", ready: "Loaded the top {count} artists", loading: "Loading popular artists…", refresh: "Refresh ranking", hint: "Choose 100–5000 popular tags plus 33 valid artist tags jointly checked by Claude, Codex, and Grok. A valid Danbooru tag does not guarantee NovelAI V5 style fidelity.", base: "Fixed content prompt", auxiliary: "Fixed extra terms (always kept)", mutate: "Add random style terms during the draw", mutateHint: "When enabled, each group creates a fair A/B pair with the same artist string, prompt, seed, and settings: A has no random style terms; B adds 2–6 terms weighted 0.3–1.5.", count: "Artist-string groups in this batch", range: "Artists per string (maximum 20)", min: "Minimum", max: "Maximum", seed: "Fixed NovelAI seed", draw: "Draw again", preview: "Current draw", previewHint: "Style mode creates two A/B images per group. Starting a new draw clears unliked temporary images.", generate: "Generate this batch", stop: "Stop", refine: "Draw from favorites", needPool: "The artist pool is not ready.", needPrompt: "Enter a fixed content prompt.", needLikes: "Save at least one favorite first.", running: "Generating {done}/{total}", complete: "Batch complete. Unliked images will be cleared by the next draw.", pending: "Pending", generating: "Generating", done: "Complete", failed: "Failed", like: "Save favorite", saved: "Saved", saving: "Saving…", retry: "Retry", apply: "Apply to Generate", copy: "Copy", copied: "Artist string copied.", applied: "Applied to Generate.", empty: "Draws appear after the pool loads.", unlimited: "Enter the number of artist-string groups. Style mode generates twice as many images.", mutation: "Style / lighting terms in this draw", favorites: "Favorite styles", favoritesHint: "A and B can be saved independently. Favorite B terms and weights can guide later style-enabled draws.", remove: "Remove favorite", removed: "Favorite and local image removed.", categories: "Art style|Medium / brushwork|Color|Lighting|Atmosphere", variantPlain: "A | Artist string only", variantMutated: "B | Artist string + random styles", copyArtists: "Copy artist string", copyFull: "Copy full prompt", copiedArtists: "Artist string copied.", copiedFull: "Full prompt copied.", pairSummary: "{pairs} groups · {images} images", validation: "Danbooru check: 33/33 current, non-deprecated artist tags · 2026-08-22", allModels: "All models", modelGroup: "Generation model", previewImage: "Double-click to preview" },
  "ja-JP": { title: "ランダム画家タグ抽選", subtitle: "抽選ごとに画家・重み・任意の画風語を再構成し、内容・Seed・生成設定は固定します。", back: "画風ラボへ戻る", pool: "人気画家候補", poolSize: "人気順の上位 N 名", load: "読込", ready: "人気順上位 {count} 名を読込済み", loading: "人気画家を読込中…", refresh: "順位を更新", hint: "人気順 100～5000 名に加え、Claude・Codex・Grok が共同確認した有効な画家タグ 33 件を追加します。Danbooru で有効でも NovelAI V5 の画風再現を保証しません。", base: "固定内容プロンプト", auxiliary: "固定追加語（常に保持）", mutate: "抽選時に画風語を追加", mutateHint: "有効時は同じ画家列・プロンプト・Seed・設定で A/B を生成します。A は画風語なし、B は 0.3～1.5 重みの画風語を 2～6 個追加します。", count: "このバッチの画家列グループ数", range: "1組の画家数（最大20名）", min: "最小", max: "最大", seed: "固定 NovelAI Seed", draw: "再抽選", preview: "現在の抽選", previewHint: "画風語を有効にすると1組につき A/B の2枚を生成します。再抽選時に未保存画像を消去します。", generate: "このバッチを生成", stop: "停止", refine: "お気に入りから抽選", needPool: "画家候補が未準備です。", needPrompt: "固定内容を入力してください。", needLikes: "先に1件以上保存してください。", running: "生成中 {done}/{total}", complete: "完了。未保存画像は次回抽選時に消去されます。", pending: "待機", generating: "生成中", done: "完了", failed: "失敗", like: "お気に入り保存", saved: "保存済み", saving: "保存中…", retry: "再試行", apply: "生成へ適用", copy: "コピー", copied: "コピーしました。", applied: "生成へ適用しました。", empty: "候補読込後に抽選できます。", unlimited: "画家列の組数を入力します。画風語モードでは画像数が2倍になります。", mutation: "今回の画風・光変異語", favorites: "お気に入り画風", favoritesHint: "A/B は個別保存できます。B の画風語と重みは次の画風語抽選にも反映できます。", remove: "お気に入り削除", removed: "お気に入りと画像を削除しました。", categories: "画風|画材・筆致|色彩|光|雰囲気", variantPlain: "A｜画家列のみ", variantMutated: "B｜画家列＋ランダム画風語", copyArtists: "画家列をコピー", copyFull: "完全プロンプトをコピー", copiedArtists: "画家列をコピーしました。", copiedFull: "完全プロンプトをコピーしました。", pairSummary: "{pairs} 組 · {images} 枚", validation: "Danbooru 検証：33/33 が現行・非廃止の画家タグ · 2026-08-22", allModels: "すべてのモデル", modelGroup: "生成モデル", previewImage: "ダブルクリックで拡大" },
  "ko-KR": { title: "무작위 작가 조합 뽑기", subtitle: "매번 작가·가중치·선택적 화풍 용어를 다시 뽑고 내용·Seed·생성 설정은 고정합니다.", back: "화풍 실험실로", pool: "인기 작가 후보", poolSize: "인기순 상위 N명", load: "불러오기", ready: "인기순 상위 {count}명 로드됨", loading: "인기 작가 로딩 중…", refresh: "순위 새로고침", hint: "인기순 100～5000명에 Claude·Codex·Grok이 공동 검증한 유효 작가 태그 33개를 추가합니다. Danbooru 유효 태그라고 NovelAI V5 화풍 재현이 보장되지는 않습니다.", base: "고정 내용 프롬프트", auxiliary: "고정 추가 용어 (항상 유지)", mutate: "뽑을 때 무작위 화풍 용어 추가", mutateHint: "켜면 동일한 작가 문자열·프롬프트·Seed·설정으로 A/B를 생성합니다. A는 화풍 용어가 없고 B는 0.3～1.5 가중치의 용어 2～6개를 추가합니다.", count: "이번 배치 작가 문자열 그룹 수", range: "조합당 작가 수 (최대 20명)", min: "최소", max: "최대", seed: "고정 NovelAI Seed", draw: "다시 뽑기", preview: "현재 뽑기", previewHint: "화풍 용어를 켜면 그룹마다 A/B 두 장을 생성합니다. 다시 뽑으면 저장하지 않은 임시 이미지를 삭제합니다.", generate: "이 배치 생성", stop: "중지", refine: "즐겨찾기 기반 뽑기", needPool: "작가 풀이 준비되지 않았습니다.", needPrompt: "고정 프롬프트를 입력하세요.", needLikes: "먼저 하나 이상 저장하세요.", running: "생성 중 {done}/{total}", complete: "완료. 저장하지 않은 이미지는 다음 뽑기 때 삭제됩니다.", pending: "대기", generating: "생성 중", done: "완료", failed: "실패", like: "즐겨찾기 저장", saved: "저장됨", saving: "저장 중…", retry: "재시도", apply: "생성에 적용", copy: "복사", copied: "복사했습니다.", applied: "생성 화면에 적용했습니다.", empty: "풀 로드 후 뽑을 수 있습니다.", unlimited: "작가 문자열 그룹 수를 입력합니다. 화풍 용어 모드에서는 이미지 수가 두 배입니다.", mutation: "이번 화풍/조명 변이 용어", favorites: "좋아하는 화풍", favoritesHint: "A/B를 각각 저장할 수 있습니다. B의 화풍 용어와 가중치는 이후 화풍 추첨에도 반영됩니다.", remove: "즐겨찾기 제거", removed: "즐겨찾기와 로컬 이미지를 삭제했습니다.", categories: "화풍|매체/붓질|색상|조명|분위기", variantPlain: "A｜작가 문자열만", variantMutated: "B｜작가 문자열＋무작위 화풍", copyArtists: "작가 문자열 복사", copyFull: "전체 프롬프트 복사", copiedArtists: "작가 문자열을 복사했습니다.", copiedFull: "전체 프롬프트를 복사했습니다.", pairSummary: "{pairs} 그룹 · {images}장", validation: "Danbooru 검증: 33/33 현재 유효하고 폐기되지 않은 작가 태그 · 2026-08-22", allModels: "모든 모델", modelGroup: "생성 모델", previewImage: "더블 클릭하여 미리보기" },
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
  "zh-TW": {
    title: "NovelAI 生成參數",
    hint: "預設使用軟體初始參數；此處修改只用於抽卡，A/B 對照使用完全相同的參數。",
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
    quality: "品質詞",
    variety: "Variety+",
    smea: "SMEA",
    smeaDyn: "SMEA Dyn",
  },
  "en-US": {
    title: "NovelAI generation settings",
    hint: "Uses the app defaults initially. Changes affect only gacha and each A/B pair uses identical settings.",
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
    quality: "Quality tags",
    variety: "Variety+",
    smea: "SMEA",
    smeaDyn: "SMEA Dyn",
  },
  "ja-JP": {
    title: "NovelAI 生成設定",
    hint: "初期値はアプリ既定設定です。ここでの変更は抽選だけに使われ、A/B は同じ設定で比較されます。",
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
    quality: "品質タグ",
    variety: "Variety+",
    smea: "SMEA",
    smeaDyn: "SMEA Dyn",
  },
  "ko-KR": {
    title: "NovelAI 생성 설정",
    hint: "초기값은 앱 기본 설정입니다. 여기의 변경은 뽑기에만 적용되며 A/B는 동일한 설정을 사용합니다.",
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
    quality: "품질 태그",
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
  "zh-TW": {
    title: "既有畫師串權重微調",
    hint: "保持畫師名單與順序不變，只在原權重上下隨機浮動。無權重標籤按 1.0 處理。",
    input: "貼上畫師串",
    count: "候選組數",
    variation: "權重浮動（±%）",
    generate: "生成權重微調候選",
    noArtists: "未識別到 artist: 畫師標籤。",
    copied: "已複製 ✓",
  },
  "en-US": {
    title: "Fine-tune an existing artist string",
    hint: "Keep artist names and order fixed while varying only their weights around the originals. Unweighted tags use 1.0.",
    input: "Paste artist string",
    count: "Candidate groups",
    variation: "Weight variation (±%)",
    generate: "Generate weight-tuned candidates",
    noArtists: "No artist: tags were recognized.",
    copied: "Copied ✓",
  },
  "ja-JP": {
    title: "既存の画家列の重みを微調整",
    hint: "画家名と順序を固定し、元の重みだけを上下に変化させます。重みなしは 1.0 とします。",
    input: "画家列を貼り付け",
    count: "候補グループ数",
    variation: "重み変動（±%）",
    generate: "重み候補を生成",
    noArtists: "artist: 画家タグを認識できませんでした。",
    copied: "コピー済み ✓",
  },
  "ko-KR": {
    title: "기존 작가 문자열 가중치 미세 조정",
    hint: "작가 목록과 순서는 유지하고 원래 가중치만 위아래로 변경합니다. 가중치가 없으면 1.0입니다.",
    input: "작가 문자열 붙여넣기",
    count: "후보 그룹 수",
    variation: "가중치 변동 (±%)",
    generate: "가중치 후보 생성",
    noArtists: "artist: 작가 태그를 인식하지 못했습니다.",
    copied: "복사됨 ✓",
  },
} satisfies Record<AppLanguage, Record<string, string>>;

function freshSeed(): number {
  const values = new Uint32Array(1);
  globalThis.crypto?.getRandomValues?.(values);
  return values[0] || ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
}

function positiveInteger(value: unknown, fallback = 1): number {
  const number = Math.floor(Number(value));
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function clampPoolSize(value: unknown): number {
  return Math.max(100, Math.min(5000, positiveInteger(value, 1000)));
}

function snapDimension(value: unknown): number {
  return Math.max(64, Math.min(1600, Math.round(positiveInteger(value, 64) / 64) * 64));
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

function normalizeGenerationParams(
  value: Partial<GenerateParams> | undefined,
  inherited: GenerateParams,
): GenerateParams {
  return {
    ...DEFAULT_PARAMS,
    ...inherited,
    ...(value ?? {}),
    positivePrompt: "",
    stylePrompt: "",
    width: snapDimension(value?.width ?? inherited.width),
    height: snapDimension(value?.height ?? inherited.height),
    steps: Math.max(1, Math.min(50, positiveInteger(value?.steps ?? inherited.steps, 28))),
    cfgScale: Math.max(1, Math.min(10, Number(value?.cfgScale ?? inherited.cfgScale) || 6)),
    cfgRescale: Math.max(0, Math.min(1, Number(value?.cfgRescale ?? inherited.cfgRescale) || 0)),
  };
}

function restore(inherited: GenerateParams): RandomSession {
  if (sessionCache) return sessionCache;
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<RandomSession> | null;
    sessionCache = {
      basePrompt: typeof raw?.basePrompt === "string" ? raw.basePrompt : inherited.positivePrompt,
      auxiliaryPrompt: typeof raw?.auxiliaryPrompt === "string" ? raw.auxiliaryPrompt : "",
      count: positiveInteger(raw?.count, 8),
      artistCount: Math.max(1, Math.min(20, positiveInteger(raw?.artistCount, 8))),
      poolSize: clampPoolSize(raw?.poolSize),
    seed: Math.min(2_147_483_647, Math.max(0, Math.floor(Number(raw?.seed) || 246813579))),
      drawSeed: positiveInteger(raw?.drawSeed, freshSeed()),
      mutateAuxiliary: raw?.mutateAuxiliary === true,
      biasFavorites: raw?.biasFavorites === true,
      weightTuneInput: typeof raw?.weightTuneInput === "string" ? raw.weightTuneInput : "",
      weightTuneCount: positiveInteger(raw?.weightTuneCount, 8),
      weightVariation: Math.max(0, Math.min(100, Number(raw?.weightVariation) || 20)),
      generationParams: normalizeGenerationParams(raw?.generationParams, DEFAULT_PARAMS),
      results: Array.isArray(raw?.results) ? raw.results : [],
      favorites: Array.isArray(raw?.favorites) ? raw.favorites : [],
    };
  } catch {
    sessionCache = { basePrompt: inherited.positivePrompt, auxiliaryPrompt: "", count: 8, artistCount: 8, poolSize: 1000, seed: 246813579, drawSeed: freshSeed(), mutateAuxiliary: false, biasFavorites: false, weightTuneInput: "", weightTuneCount: 8, weightVariation: 20, generationParams: normalizeGenerationParams(undefined, DEFAULT_PARAMS), results: [], favorites: [] };
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
  const paramText = PARAM_TEXT[language];
  const tuneText = TUNE_TEXT[language];
  const ucLabels = paramText.ucValues.split("|");
  const sizeLabels = paramText.sizeValues.split("|");
  const favoriteFolderLabel = {
    "zh-CN": "收藏夹",
    "zh-TW": "收藏夾",
    "en-US": "Favorites",
    "ja-JP": "お気に入り",
    "ko-KR": "즐겨찾기",
  }[language];
  const [session, setSession] = useState(() => restore(params));
  const [pool, setPool] = useState<ArtistTagRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [copiedAction, setCopiedAction] = useState("");
  const [previewResult, setPreviewResult] = useState<RandomResult | null>(null);
  const [favoriteModelFilter, setFavoriteModelFilter] = useState("all");
  const copiedTimerRef = useRef<number | null>(null);
  const persistenceTimerRef = useRef<number | null>(null);
  const sessionRef = useRef(session);
  const [showFavorites, setShowFavorites] = useState(
    () => localStorage.getItem("langbai.artist-lab.random.view.v1") === "favorites",
  );
  const cancelRef = useRef(false);
  const scrollRef = useRef<HTMLElement>(null);
  const scrollTopToRestoreRef = useRef<number | null>(null);
  const patch = (next: Partial<RandomSession>) => setSession((current) => ({ ...current, ...next }));
  const patchGeneration = <K extends keyof GenerateParams>(
    key: K,
    value: GenerateParams[K],
  ) =>
    setSession((current) => ({
      ...current,
      generationParams: { ...current.generationParams, [key]: value },
    }));
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
    sessionCache = session;
    sessionRef.current = session;
    if (persistenceTimerRef.current !== null) window.clearTimeout(persistenceTimerRef.current);
    persistenceTimerRef.current = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionRef.current));
      persistenceTimerRef.current = null;
    }, 300);
  }, [session]);
  useEffect(() => {
    localStorage.setItem(
      "langbai.artist-lab.random.view.v1",
      showFavorites ? "favorites" : "results",
    );
  }, [showFavorites]);
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
    return Object.fromEntries((["artStyle", "medium", "color", "lighting", "atmosphere"] as StyleMutationCategory[]).map((key, index) => [key, values[index] ?? key])) as Record<StyleMutationCategory, string>;
  }, [text.categories]);

  const loadPool = async (force = false) => {
    setLoading(true);
    try {
      const targetSize = clampPoolSize(session.poolSize);
      setPool(await window.naiDesktop.artistLabPopularArtists(targetSize, force));
      setMessage("");
    } catch (error: any) { setMessage(error?.message ?? String(error)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadPool(false); }, []);

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
  const poolKey = useMemo(
    () => pool.map((artist) => `${artist.id}:${artist.postCount}`).join("|"),
    [pool],
  );
  const planned = useMemo(() => generatePopularArtistRecipes(pool, {
    count: session.count,
    minArtists: session.artistCount,
    maxArtists: session.artistCount,
    auxiliaryPrompt: session.auxiliaryPrompt,
    mutateAuxiliary: session.mutateAuxiliary,
    favoriteArtists: session.biasFavorites ? likedArtists : undefined,
    favoriteMutations: session.mutateAuxiliary && session.biasFavorites ? likedMutations : undefined,
    random: createArtistLabRandom(session.drawSeed),
  }), [poolKey, session.count, session.artistCount, session.auxiliaryPrompt, session.mutateAuxiliary, session.biasFavorites, likedArtists.join("|"), likedMutations.map((item) => `${item.category}:${item.value}:${item.weight}`).join("|"), session.drawSeed]);
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

  const fixedParams = () => ({
    ...session.generationParams,
    positivePrompt: session.basePrompt.trim(),
    stylePrompt: "",
    seedMode: "fixed" as const,
    seed: session.seed,
  });
  const extras = { vibeImages: [], charCaptions: [], preciseReferences: [] };

  const generateOne = async (recipe: RandomResult) => {
    const id = recipe.id;
    const requestParams = { ...fixedParams(), stylePrompt: recipe.prompt };
    setSession((current) => ({ ...current, results: current.results.map((item) => item.id === id ? { ...item, status: "generating", error: undefined, generationModel: requestParams.model } : item) }));
    try {
      const generated = await window.naiDesktop.generateArtistLab(requestParams, extras, "random");
      const image = generated.items[0];
      if (!generated.ok || !image) throw new Error(generated.message);
      setSession((current) => ({ ...current, results: current.results.map((item) => item.id === id ? { ...item, image, status: "done", error: undefined, generationModel: image.model || requestParams.model } : item) }));
    } catch (error: any) {
      setSession((current) => ({ ...current, results: current.results.map((item) => item.id === id ? { ...item, status: "failed", error: error?.message ?? String(error) } : item) }));
    }
  };

  const runRecipes = async (
    recipes: GeneratedArtistRecipe[],
    compareMutations: boolean,
  ) => {
    clearCurrent();
    const batchId = freshSeed().toString(36);
    const comparisons = expandArtistRecipeComparisons(recipes, compareMutations);
    const pending: RandomResult[] = comparisons.map((recipe, index) => ({
      ...recipe,
      id: `${batchId}-${recipe.id}`,
      pairId: `${batchId}-${recipe.pairId}`,
      sequence: compareMutations ? Math.floor(index / 2) + 1 : index + 1,
      status: "pending",
      generationModel: session.generationParams.model,
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
      minArtists: session.artistCount,
      maxArtists: session.artistCount,
      auxiliaryPrompt: session.auxiliaryPrompt,
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
      setSession((current) => {
        const saved = { ...result, image, liked: true, saving: false };
        return {
          ...current,
          results: current.results.map((item) => item.id === result.id ? saved : item),
          favorites: current.favorites.some((item) => item.id === result.id) ? current.favorites : [saved, ...current.favorites],
        };
      });
      await refreshHistory();
    } catch (error: any) {
      setSession((current) => ({ ...current, results: current.results.map((item) => item.id === result.id ? { ...item, saving: false } : item) }));
      setMessage(error?.message ?? String(error));
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
    const deleted = await deleteHistory(result.image.id);
    if (deleted) setMessage(text.removed);
    else {
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
  const artistString = (result: Pick<RandomResult, "artists">) => formatArtistString(result.artists);
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
  const renderCard = (result: RandomResult, favorite = false) => {
    const variant = variantOf(result);
    const artistCopyKey = `${result.id}:artists`;
    const fullCopyKey = `${result.id}:full`;
    return <article key={result.id} className={`artist-candidate ${result.status} artist-variant-${variant}`}><header className="artist-candidate-header"><div><b>#{String(result.sequence).padStart(2, "0")} · {variant === "mutated" ? text.variantMutated : text.variantPlain}</b><small>{modelLabel(resultModel(result))}</small></div><span>{favorite || result.liked ? text.saved : text[result.status]}</span></header><div className="artist-candidate-media">{result.image ? <img src={result.image.fileUrl} loading="lazy" decoding="async" title={text.previewImage} onDoubleClick={() => setPreviewResult(result)} alt={`${variant === "mutated" ? text.variantMutated : text.variantPlain}: ${result.prompt}`} /> : <div className="artist-candidate-placeholder">{text[result.status]}</div>}</div>{renderMutationTerms(result)}<div className="artist-string-block"><div className="artist-copy-actions"><button type="button" className={copiedAction === artistCopyKey ? "copied" : ""} onClick={() => { void copyResult(artistString(result), artistCopyKey, text.copiedArtists); }}>{copiedAction === artistCopyKey ? tuneText.copied : text.copyArtists}</button><button type="button" className={copiedAction === fullCopyKey ? "copied" : ""} onClick={() => { void copyResult(fullPrompt(result), fullCopyKey, text.copiedFull); }}>{copiedAction === fullCopyKey ? tuneText.copied : text.copyFull}</button></div><code>{result.prompt}</code></div><small className={`artist-error ${result.error ? "" : "empty"}`} title={result.error}>{result.error ?? "\u00a0"}</small><div className="artist-candidate-actions">{favorite ? <Button variant="ghost" onClick={() => void removeFavorite(result)}>{text.remove}</Button> : result.status === "failed" ? <Button variant="ghost" disabled={running} onClick={() => void retry(result)}>{text.retry}</Button> : <Button variant="ghost" disabled={result.status !== "done" || result.liked || result.saving} onClick={() => void saveFavorite(result)}>{result.saving ? text.saving : result.liked ? text.saved : text.like}</Button>}<Button variant="primary" disabled={result.status !== "done"} onClick={() => { applyParams({ ...session.generationParams, model: applicableResultModel(result), positivePrompt: session.basePrompt.trim(), stylePrompt: result.prompt, seed: session.seed, seedMode: "fixed" }); setMessage(text.applied); }}>{text.apply}</Button></div></article>;
  };

  return <>
  <main ref={scrollRef} className="artist-lab random-artist-lab">
    <header className="artist-lab-hero"><div><h2>{text.title}</h2><p>{text.subtitle}</p></div><Button onClick={onBack}>{text.back}</Button></header>
    <section className="artist-lab-panel random-pool-summary"><div><h3>{text.pool}</h3><strong>{loading ? text.loading : interpolate(text.ready, { count: pool.length })}</strong><small>{text.validation}</small><small>{text.hint}</small></div><div className="artist-pool-actions"><label><span>{text.poolSize}</span><NumericDraftInput min={100} max={5000} step={100} value={session.poolSize} normalize={clampPoolSize} onCommit={(poolSize) => patch({ poolSize })} /></label><Button onClick={() => void loadPool(false)} disabled={loading}>{text.load}</Button><Button onClick={() => void loadPool(true)} disabled={loading}>{text.refresh}</Button></div></section>
    <section className="artist-lab-panel random-artist-settings">
      <label className="wide"><span>{text.base}</span><textarea value={session.basePrompt} onChange={(event) => patch({ basePrompt: event.target.value })} /></label>
      <label className="wide"><span>{text.auxiliary}</span><textarea value={session.auxiliaryPrompt} onChange={(event) => patch({ auxiliaryPrompt: event.target.value })} /></label>
      <label className="random-check wide"><input type="checkbox" checked={session.mutateAuxiliary} onChange={(event) => patch({ mutateAuxiliary: event.target.checked })} /><span><b>{text.mutate}</b><small>{text.mutateHint}</small></span></label>
      <label><span>{text.count}</span><NumericDraftInput min={1} step={1} value={session.count} normalize={(value) => positiveInteger(value, 1)} onCommit={(count) => patch({ count })} /><small>{text.unlimited}</small></label>
      <label><span>{text.range}</span><NumericDraftInput min={1} max={20} step={1} value={session.artistCount} normalize={(value) => Math.min(20, positiveInteger(value, 1))} onCommit={(artistCount) => patch({ artistCount })} /><small aria-hidden="true">&nbsp;</small></label>
      <label><span>{text.seed}</span><NumericDraftInput min={0} max={2147483647} step={1} value={session.seed} normalize={(value) => Math.min(2_147_483_647, Math.max(0, Math.floor(value)))} onCommit={(seed) => patch({ seed })} /><small aria-hidden="true">&nbsp;</small></label>
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
            onClick={(event) => {
              event.preventDefault();
              patch({ generationParams: normalizeGenerationParams(undefined, DEFAULT_PARAMS) });
            }}
          >
            {paramText.reset}
          </Button>
        </span>
      </summary>
      <div className="random-generation-grid">
        <label className="wide"><span>{paramText.model}</span><select value={session.generationParams.model} onChange={(event) => patchGeneration("model", event.target.value as GenerateParams["model"])}>{NAI_MODELS.map((model) => <option key={model.value} value={model.value}>{model.value}</option>)}</select></label>
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
          <label><span>{paramText.width}</span><NumericDraftInput min={64} max={1600} step={64} value={session.generationParams.width} normalize={snapDimension} onCommit={(value) => patchGeneration("width", value)} /></label>
          <label><span>{paramText.height}</span><NumericDraftInput min={64} max={1600} step={64} value={session.generationParams.height} normalize={snapDimension} onCommit={(value) => patchGeneration("height", value)} /></label>
        </fieldset>
        <label><span>{paramText.steps}</span><NumericDraftInput min={1} max={50} step={1} value={session.generationParams.steps} normalize={(value) => Math.max(1, Math.min(50, Math.floor(value)))} onCommit={(value) => patchGeneration("steps", value)} /></label>
        <label><span>{paramText.cfg}</span><NumericDraftInput min={1} max={10} step={0.1} value={session.generationParams.cfgScale} onCommit={(value) => patchGeneration("cfgScale", value)} /></label>
        <label><span>{paramText.rescale}</span><NumericDraftInput min={0} max={1} step={0.01} value={session.generationParams.cfgRescale} onCommit={(value) => patchGeneration("cfgRescale", value)} /></label>
        <label><span>{paramText.sampler}</span><select value={session.generationParams.sampler} onChange={(event) => patchGeneration("sampler", event.target.value as GenerateParams["sampler"])}>{NAI_SAMPLERS.map((sampler) => <option key={sampler.value} value={sampler.value}>{sampler.value}</option>)}</select></label>
        {supportsNAINoiseScheduleControl(session.generationParams.model) ? <label><span>{paramText.noise}</span><select value={session.generationParams.noiseSchedule} onChange={(event) => patchGeneration("noiseSchedule", event.target.value)}><option value="native">native</option><option value="karras">karras</option><option value="exponential">exponential</option></select></label> : null}
        <label><span>{paramText.uc}</span><select value={session.generationParams.ucPreset} onChange={(event) => patchGeneration("ucPreset", Number(event.target.value) as GenerateParams["ucPreset"])}>{NAI_UC_PRESETS.map((preset, index) => <option key={preset.value} value={preset.value}>{preset.value} · {ucLabels[index]}</option>)}</select></label>
        <label className="wide"><span>{paramText.negative}</span><textarea value={session.generationParams.negativePrompt} onChange={(event) => patchGeneration("negativePrompt", event.target.value)} /></label>
        <div className="random-generation-toggles wide">
          <label><input type="checkbox" checked={session.generationParams.qualityToggle} onChange={(event) => patchGeneration("qualityToggle", event.target.checked)} /><span>{paramText.quality}</span></label>
          {supportsNAIVariety(session.generationParams.model) ? <label><input type="checkbox" checked={session.generationParams.variety} onChange={(event) => patchGeneration("variety", event.target.checked)} /><span>{paramText.variety}</span></label> : null}
          {!isNAIV4PlusModel(session.generationParams.model) ? <><label><input type="checkbox" checked={session.generationParams.smea} onChange={(event) => patchGeneration("smea", event.target.checked)} /><span>{paramText.smea}</span></label><label><input type="checkbox" checked={session.generationParams.smeaDyn} onChange={(event) => patchGeneration("smeaDyn", event.target.checked)} /><span>{paramText.smeaDyn}</span></label></> : null}
        </div>
      </div>
    </details>
    <details className="artist-lab-panel artist-weight-tuner">
      <summary><span><b>{tuneText.title}</b><small>{tuneText.hint}</small></span></summary>
      <div className="artist-weight-tuner-grid">
        <label className="wide"><span>{tuneText.input}</span><textarea value={session.weightTuneInput} placeholder="1::artist:foo ::, 0.8::artist:bar ::," onChange={(event) => patch({ weightTuneInput: event.target.value })} /></label>
        <label><span>{tuneText.count}</span><NumericDraftInput min={1} step={1} value={session.weightTuneCount} normalize={(value) => positiveInteger(value, 1)} onCommit={(weightTuneCount) => patch({ weightTuneCount })} /></label>
        <label><span>{tuneText.variation}</span><NumericDraftInput min={0} max={100} step={1} value={session.weightVariation} onCommit={(weightVariation) => patch({ weightVariation })} /></label>
        <Button className="artist-weight-tuner-submit" variant="primary" disabled={running || !session.weightTuneInput.trim()} onClick={() => void runWeightTuning()}>{tuneText.generate}</Button>
      </div>
    </details>
    <section className="artist-lab-panel artist-queue-panel"><div className="artist-section-heading"><div><h3>{text.preview}</h3><small>{text.previewHint}</small></div><div className="artist-preview-actions"><b>{interpolate(text.pairSummary, { pairs: planned.length, images: plannedComparisons.length })}</b><Button onClick={() => void draw(false)} disabled={running || pool.length === 0}>{text.draw}</Button></div></div>{planned.length === 0 ? <div className="artist-queue-empty">{text.empty}</div> : <ol className="artist-combination-queue">{planned.map((recipe, index) => <li key={recipe.id}><span>#{String(index + 1).padStart(2, "0")}</span><div><b className="artist-ab-label">{text.variantPlain}</b><code>{recipe.basePrompt}</code>{session.mutateAuxiliary && <><b className="artist-ab-label">{text.variantMutated}</b><code>{recipe.prompt}</code>{renderMutationTerms(recipe)}</>}</div></li>)}</ol>}</section>
    <section className="artist-lab-actions">{running ? <Button variant="danger" onClick={() => { cancelRef.current = true; void window.naiDesktop.cancel(); }}>{text.stop}</Button> : <Button variant="primary" onClick={() => void run(false)}>{text.generate}</Button>}<Button disabled={running || likedArtists.length === 0} onClick={() => void draw(true)}>{text.refine}</Button><span>{running ? interpolate(text.running, { done: batchDone, total: session.results.length }) : message}</span></section>
    <nav className="artist-result-tabs" aria-label={`${text.preview} / ${favoriteFolderLabel}`}>
      <button type="button" className={!showFavorites ? "active" : ""} onClick={() => switchGallery(false)}><span>{text.preview}</span><b>{session.results.length}</b></button>
      <button type="button" className={showFavorites ? "active" : ""} onClick={() => switchGallery(true)}><span>{favoriteFolderLabel}</span><b>{session.favorites.length}</b></button>
    </nav>
    {!showFavorites && session.results.length > 0 && <section className="artist-candidate-grid">{session.results.map((result) => renderCard(result))}</section>}
    {showFavorites && <section className="artist-lab-panel artist-favorites-panel">
      <div className="artist-section-heading">
        <div><h3>{favoriteFolderLabel}</h3><small>{text.favoritesHint}</small></div>
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
  {previewResult?.image && <AppPortal><div className="modal-backdrop artist-result-preview-backdrop" role="dialog" aria-modal="true" aria-label={text.previewImage} onMouseDown={() => setPreviewResult(null)}><div className="artist-result-preview" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="artist-result-preview-close" aria-label={text.back} onClick={() => setPreviewResult(null)}><Icon name="close" /></button><img src={previewResult.image.fileUrl} alt={previewResult.prompt} /><footer><b>{modelLabel(resultModel(previewResult))}</b><span>{variantOf(previewResult) === "mutated" ? text.variantMutated : text.variantPlain}</span></footer></div></div></AppPortal>}
  </>;
}
