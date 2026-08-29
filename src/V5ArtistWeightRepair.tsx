import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
} from "react";
import { AppPortal, Button } from "./components/ui";
import { Icon } from "./components/icons";
import { QualityPresetControl } from "./components/QualityPresetControl";
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
} from "./types";
import {
  fitNAIImageSize,
  maxNAIDimensionFor,
  snapNAIDimensionWithinArea,
} from "./nai-dimensions";
import {
  addArtistFavorite,
  loadArtistFavorites,
  removeArtistFavorite,
  type ArtistFavoriteCollection,
  type SharedArtistFavorite,
} from "./artist-favorite-library";
import type { GeneratedArtistRecipe } from "./artist-recipe";
import {
  DEFAULT_V5_ARTIST_DRAW_MAX,
  DEFAULT_V5_ARTIST_DRAW_MIN,
  drawAllV5ArtistWeights,
  normalizeV45ArtistSyntax,
  repairV45ArtistCandidatesForV5,
} from "./v5-artist-weight-repair";

const DRAW_SIZE_PRESETS = [
  { width: 832, height: 1216 },
  { width: 1024, height: 1024 },
  { width: 1216, height: 832 },
  { width: 1024, height: 1536 },
  { width: 1536, height: 1024 },
  { width: 1472, height: 1472 },
] as const;

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
    drawPageTitle: "输入画师串抽卡", drawPageSubtitle: "沿用修复器的识别与规范流程：每个 Tag 先按旧权重的 1/3～1/2 独立迁移，再限制在自定义权重区间内。", drawTitle: "抽卡设置", drawHint: "每个有效 Tag 都按修复器规则参与权重抽卡，不会随机删除或替换；最低/最高权重作为最终安全范围。每组保留输入中的全部有效 Tag。", drawInput: "完整 Tag 串", drawInputHint: "例如：xiaoluo_xl, 1.2::artist:pottsness ::, artist:nonco", drawEmpty: "请先粘贴画师串。", drawNone: "没有识别到有效 Tag；请检查输入和分隔符。", weightMin: "最低权重", weightMax: "最高权重", candidateCount: "候选组数", basePrompt: "正面提示词（固定内容）", seedMode: "对照 Seed", fixedSeed: "全批固定", randomSeed: "每张随机", seed: "Seed", randomizeSeed: "随机 Seed", draw: "重新抽权重", generate: "生成这一批", stop: "停止", needDraw: "请先抽取候选。", needPrompt: "请填写正面提示词。", generating: "正在生成 {done}/{total}", complete: "生成完成；可收藏喜欢的结果。", allTags: "已识别 {count} 个有效 Tag（画师 {artists}、质量词 {quality}、其他 {other}）；每组完整保留。",
    results: "本批候选", favorites: "收藏夹", sharedFavorites: "本工具收藏独立保存，不与另外两种画师工具共用", pending: "等待", generatingOne: "生成中", done: "完成", failed: "失败", favorite: "收藏", saved: "已收藏", saving: "保存中", remove: "移除收藏", apply: "应用到生成", retry: "重试", preview: "双击预览大图", noResults: "输入画师串后即可抽取权重候选。", noFavorites: "本工具收藏库暂无内容。", applied: "已应用到生成页。", removed: "已移除收藏和本地图片。",
  },
  "zh-TW": {
    title: "V4.5 畫師串修復器", subtitle: "自動識別畫師、品質詞與其他 Tag；整串每個有效 Tag 都獨立壓到原權重的 1/3–1/2，並統一為規範 V5 數值格式。", back: "返回工具首頁", strategy: "社群遷移策略", input: "V4.5 完整 Tag 串", inputHint: "支援無前綴畫師名、括號及數值權重", output: "首組規範 V5 Tag 串", run: "隨機產生修復候選", copy: "複製首組結果", copied: "已複製", reset: "恢復預設", empty: "請先貼上畫師串。", none: "未識別到有效 Tag；請檢查輸入與分隔符。", adjusted: "已產生 {candidates} 組候選；每組修復 {count} 個 Tag（畫師 {artists}、品質詞 {quality}、其他 {other}）。", noteTitle: "使用者實測與限制", note: "NovelAI 官方沒有公布 V4.5→V5 換算公式。社群的 1/3–1/2 建議主要來自舊畫師權重遷移；依本工具設定，品質詞、風格詞與其他有效 Tag 也會套用相同範圍。結果只是試驗起點，不是官方標準。", safe: "明確的 artist: 標籤與已確認的無前綴畫師名會辨識為畫師；品質、風格、年份、負面與內容 Tag 不會被加上 artist:。重複逗號、中文分隔符與孤立 :: 會自動清理。", repairBatchHint: "可一次獨立隨機修復多組完整 Tag 串，再固定 Seed 批次生圖與收藏。", repairNoResults: "貼上 V4.5 Tag 串後，可一次產生多組修復候選。", drawPageTitle: "輸入畫師串抽卡", drawPageSubtitle: "沿用修復器的辨識與規範流程，先按舊權重的 1/3～1/2 遷移，再限制於自訂範圍。", drawTitle: "抽卡設定", drawHint: "每個有效 Tag 都依修復器規則參與抽卡且不會被刪除；最低／最高權重是最終安全範圍。", drawInput: "完整 Tag 串", drawInputHint: "例如：xiaoluo_xl, 1.2::artist:pottsness ::", drawEmpty: "請先貼上畫師串。", drawNone: "未識別到有效 Tag；請檢查輸入與分隔符。", weightMin: "最低權重", weightMax: "最高權重", candidateCount: "候選組數", basePrompt: "固定內容提示詞", currentParams: "沿用生成頁目前參數", currentParamsHint: "{model} · {width}×{height} · {steps} 步；非 V5 會改用 V5 Full。", seedMode: "對照 Seed", fixedSeed: "全批固定", randomSeed: "每張隨機", seed: "Seed", randomizeSeed: "隨機 Seed", draw: "重新抽權重", generate: "生成這一批", stop: "停止", needDraw: "請先抽取候選。", needPrompt: "請填寫固定內容提示詞。", generating: "生成中 {done}/{total}", complete: "生成完成，可收藏喜歡結果。", allTags: "已識別 {count} 個有效 Tag（畫師 {artists}、品質詞 {quality}、其他 {other}）；每組完整保留。", results: "本批候選", favorites: "收藏夾", sharedFavorites: "本工具收藏獨立保存，不與另外兩種畫師工具共用", pending: "等待", generatingOne: "生成中", done: "完成", failed: "失敗", favorite: "收藏", saved: "已收藏", saving: "儲存中", remove: "移除收藏", apply: "套用到生成", retry: "重試", preview: "雙擊預覽大圖", noResults: "輸入畫師串後即可抽取候選。", noFavorites: "本工具收藏庫暫無內容。", applied: "已套用到生成頁。", removed: "已移除收藏和本機圖片。",
  },
  "en-US": {
    title: "V4.5 Artist-string Repair", subtitle: "Auto-detect artist, quality, and other tags; independently scale every valid tag to one third–one half of its old weight and normalize V5 syntax.", back: "Back to Tools", strategy: "Community migration heuristic", input: "Complete V4.5 tag string", inputHint: "Supports known bare artist names, (), {}, [], and numeric scopes", output: "First normalized V5 string", run: "Create repair candidates", copy: "Copy first result", copied: "Copied", reset: "Restore defaults", empty: "Paste an artist string first.", none: "No valid tags were detected. Check the input and separators.", adjusted: "Created {candidates} candidates; each repairs {count} tags ({artists} artist, {quality} quality, {other} other).", noteTitle: "Community evidence and limits", note: "NovelAI publishes no V4.5→V5 conversion formula. The community one-third-to-one-half heuristic mainly concerns legacy artist weights; this tool deliberately applies the same range to quality, style, and other valid tags for whole-string migration. It is an experimental starting point, not an official standard.", safe: "Explicit artist: tags and reviewed bare artist names are classified as artists. Quality, style, year, negative, and content tags never gain artist:. Repeated separators and orphan :: markers are cleaned automatically.", repairBatchHint: "Create several independently repaired complete strings, batch-generate them with a comparison seed, and save favorites.", repairNoResults: "Paste a V4.5 string to create several repair candidates.", drawPageTitle: "Artist-string Weight Draw", drawPageSubtitle: "Uses the repair parser and one-third-to-one-half migration before applying the custom final bounds.", drawTitle: "Draw settings", drawHint: "Every valid tag uses the repair rule and none are removed; minimum and maximum are the final safety bounds.", drawInput: "Complete tag string", drawInputHint: "Example: xiaoluo_xl, 1.2::artist:pottsness ::", drawEmpty: "Paste an artist string first.", drawNone: "No valid tags were detected. Check the input and separators.", weightMin: "Minimum weight", weightMax: "Maximum weight", candidateCount: "Candidate sets", basePrompt: "Fixed content prompt", currentParams: "Uses current Generate settings", currentParamsHint: "{model} · {width}×{height} · {steps} steps; non-V5 models switch to V5 Full.", seedMode: "Comparison seed", fixedSeed: "Fixed for batch", randomSeed: "Random per image", seed: "Seed", randomizeSeed: "Random seed", draw: "Reroll weights", generate: "Generate batch", stop: "Stop", needDraw: "Draw candidates first.", needPrompt: "Enter a fixed content prompt.", generating: "Generating {done}/{total}", complete: "Generation complete. Save the results you like.", allTags: "{count} valid tags detected ({artists} artist, {quality} quality, {other} other); every set retains all of them.", results: "Candidates", favorites: "Favorites", sharedFavorites: "This tool has its own favorites; the other two artist tools are separate", pending: "Pending", generatingOne: "Generating", done: "Done", failed: "Failed", favorite: "Favorite", saved: "Saved", saving: "Saving", remove: "Remove", apply: "Apply to Generate", retry: "Retry", preview: "Double-click to preview", noResults: "Paste an artist string, then draw weight candidates.", noFavorites: "No favorites in this tool yet.", applied: "Applied to Generate.", removed: "Favorite and local image removed.",
  },
  "ja-JP": {
    title: "V4.5 画家列修復", subtitle: "画家・品質・その他の Tag を自動判定し、すべての有効 Tag を旧値の 1/3～1/2 に個別調整して V5 数値形式へ統一します。", back: "ツールへ戻る", strategy: "コミュニティ移行ヒューリスティック", input: "V4.5 完全 Tag 列", inputHint: "既知の接頭辞なし画家名、括弧、数値形式に対応", output: "正規化 V5 Tag 列", run: "ランダム修復・正規化", copy: "コピー", copied: "コピー済み", reset: "初期値に戻す", empty: "画家列を貼り付けてください。", none: "有効な Tag を認識できませんでした。入力と区切りを確認してください。", adjusted: "{count} 個の Tag（画家 {artists}、品質 {quality}、その他 {other}）を個別に修復しました。", noteTitle: "ユーザー検証と制限", note: "NovelAI は V4.5→V5 の換算式を公開していません。コミュニティの 1/3～1/2 という目安は主に旧画家ウェイト向けです。本ツールでは文字列全体を移行するため、品質・スタイル・その他の有効 Tag にも同じ範囲を適用します。公式標準ではありません。", safe: "明示的な artist: と確認済みの画家名だけを画家として分類します。品質・スタイル・年・ネガティブ・内容 Tag に artist: は追加しません。重複区切りと孤立した :: は自動整理します。", repairBatchHint: "複数の完全な修復候補を作成し、同じ Seed で一括生成・保存できます。", repairNoResults: "V4.5 Tag 列から複数の修復候補を作成できます。", drawPageTitle: "画家列ウェイト抽選", drawPageSubtitle: "修復器と同じ判定・正規化を使い、旧ウェイトを 1/3～1/2 に移行してから指定範囲内に収めます。", drawTitle: "抽選設定", drawHint: "すべての有効 Tag が抽選に参加し、削除されません。候補セット数は完全な Tag 組合せ／画像を何組作るかを表し、各組に全 Tag を保持します。", drawInput: "完全な Tag 列", drawInputHint: "例：xiaoluo_xl, 1.2::artist:pottsness ::", drawEmpty: "画家列を貼り付けてください。", drawNone: "有効な Tag を認識できませんでした。入力と区切りを確認してください。", weightMin: "最小", weightMax: "最大", candidateCount: "候補セット数", basePrompt: "固定内容", currentParams: "生成画面の現在設定を使用", currentParamsHint: "{model} · {width}×{height} · {steps} steps", seedMode: "比較 Seed", fixedSeed: "全候補固定", randomSeed: "画像ごとランダム", seed: "Seed", randomizeSeed: "Seed を抽選", draw: "ウェイト再抽選", generate: "一括生成", stop: "停止", needDraw: "先に候補を抽選してください。", needPrompt: "固定内容を入力してください。", generating: "生成中 {done}/{total}", complete: "生成完了。好きな結果を保存できます。", allTags: "{count} 個の有効 Tag（画家 {artists}、品質 {quality}、その他 {other}）を各組に保持します。", results: "候補", favorites: "お気に入り", sharedFavorites: "このツール専用のお気に入りです。他の2つとは共有しません", pending: "待機", generatingOne: "生成中", done: "完了", failed: "失敗", favorite: "保存", saved: "保存済み", saving: "保存中", remove: "削除", apply: "生成へ適用", retry: "再試行", preview: "ダブルクリックで拡大", noResults: "画家列を入力してウェイト候補を抽選できます。", noFavorites: "お気に入りはありません。", applied: "生成へ適用しました。", removed: "お気に入りと画像を削除しました。",
  },
  "ko-KR": {
    title: "V4.5 작가 문자열 복구", subtitle: "작가·품질·기타 Tag를 자동 구분하고 모든 유효 Tag를 기존 가중치의 1/3~1/2로 개별 조정해 V5 숫자 형식으로 통일합니다.", back: "도구로 돌아가기", strategy: "커뮤니티 마이그레이션 휴리스틱", input: "V4.5 전체 Tag 문자열", inputHint: "확인된 접두사 없는 작가명, 괄호, 숫자 형식 지원", output: "정규화 V5 Tag 문자열", run: "무작위 복구 및 정규화", copy: "복사", copied: "복사됨", reset: "기본값 복원", empty: "작가 문자열을 붙여넣으세요.", none: "유효한 Tag를 찾지 못했습니다. 입력과 구분자를 확인하세요.", adjusted: "Tag {count}개(작가 {artists}, 품질 {quality}, 기타 {other})를 개별 복구했습니다.", noteTitle: "사용자 검증과 한계", note: "NovelAI는 V4.5→V5 환산식을 공개하지 않았습니다. 커뮤니티의 1/3~1/2 기준은 주로 기존 작가 가중치에 관한 것이며, 이 도구는 전체 문자열 이전을 위해 품질·스타일·기타 유효 Tag에도 같은 범위를 적용합니다. 공식 표준은 아닙니다.", safe: "명시적 artist:와 검토된 작가명만 작가로 분류합니다. 품질·스타일·연도·네거티브·내용 Tag에는 artist:를 붙이지 않습니다. 중복 구분자와 고립된 ::는 자동 정리합니다.", repairBatchHint: "여러 완전한 복구 후보를 만들고 같은 Seed로 일괄 생성·저장할 수 있습니다.", repairNoResults: "V4.5 Tag 문자열에서 여러 복구 후보를 만들 수 있습니다.", drawPageTitle: "작가 문자열 가중치 뽑기", drawPageSubtitle: "복구 도구와 같은 판별·정규화 후 기존 가중치를 1/3~1/2로 이전하고 지정 범위로 제한합니다.", drawTitle: "추첨 설정", drawHint: "모든 유효 Tag가 추첨에 참여하며 삭제되지 않습니다. 후보 세트 수는 완전한 Tag 조합/이미지를 몇 개 만들지 뜻하며 각 세트에 모든 Tag를 유지합니다.", drawInput: "전체 Tag 문자열", drawInputHint: "예: xiaoluo_xl, 1.2::artist:pottsness ::", drawEmpty: "작가 문자열을 붙여넣으세요.", drawNone: "유효한 Tag를 찾지 못했습니다. 입력과 구분자를 확인하세요.", weightMin: "최저", weightMax: "최고", candidateCount: "후보 세트 수", basePrompt: "고정 내용 프롬프트", currentParams: "생성 화면 현재 설정 사용", currentParamsHint: "{model} · {width}×{height} · {steps} steps", seedMode: "비교 Seed", fixedSeed: "전체 고정", randomSeed: "이미지별 무작위", seed: "Seed", randomizeSeed: "Seed 무작위", draw: "가중치 다시 뽑기", generate: "일괄 생성", stop: "중지", needDraw: "먼저 후보를 뽑으세요.", needPrompt: "고정 내용을 입력하세요.", generating: "생성 중 {done}/{total}", complete: "생성 완료. 마음에 드는 결과를 저장하세요.", allTags: "유효 Tag {count}개(작가 {artists}, 품질 {quality}, 기타 {other})를 모든 세트에 유지합니다.", results: "후보", favorites: "즐겨찾기", sharedFavorites: "이 도구 전용 즐겨찾기이며 다른 두 도구와 공유하지 않습니다", pending: "대기", generatingOne: "생성 중", done: "완료", failed: "실패", favorite: "저장", saved: "저장됨", saving: "저장 중", remove: "삭제", apply: "생성에 적용", retry: "재시도", preview: "더블 클릭하여 확대", noResults: "작가 문자열을 입력한 뒤 후보를 뽑을 수 있습니다.", noFavorites: "즐겨찾기가 없습니다.", applied: "생성에 적용했습니다.", removed: "즐겨찾기와 이미지를 삭제했습니다.",
  },
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
  const paramText = DRAW_PARAM_TEXT[language];
  const sizeLabels = paramText.sizeValues.split("|");
  const ucLabels = paramText.ucValues.split("|");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [drawInput, setDrawInput] = useState("");
  const [minWeight, setMinWeight] = useState(DEFAULT_V5_ARTIST_DRAW_MIN);
  const [maxWeight, setMaxWeight] = useState(DEFAULT_V5_ARTIST_DRAW_MAX);
  const [candidateCount, setCandidateCount] = useState(8);
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
  const [copied, setCopied] = useState(false);
  const [previewCandidate, setPreviewCandidate] = useState<SharedArtistFavorite | null>(null);
  const tagSummary = useMemo(
    () => normalizeV45ArtistSyntax(drawMode ? drawInput : input),
    [drawInput, drawMode, input],
  );

  useEffect(() => {
    if (!previewCandidate) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewCandidate(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [previewCandidate]);

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
      clampNumber(candidateCount, 8, 1, 100),
    );
    if (recipes.length === 0) {
      setOutput("");
      setMessage(text.none);
      return null;
    }
    installCandidates(recipes);
    setOutput(recipes[0].prompt);
    setMessage(interpolate(text.adjusted, {
      candidates: recipes.length,
      count: normalized.totalAdjusted,
      artists: normalized.artistTagCount,
      quality: normalized.qualityTagCount,
      other: normalized.otherTagCount,
    }));
    setCopied(false);
    return recipes;
  };

  const draw = () => {
    if (!drawInput.trim()) return setMessage(text.drawEmpty);
    const normalized = normalizeV45ArtistSyntax(drawInput);
    const recipes = drawAllV5ArtistWeights(
      normalized.output,
      clampNumber(candidateCount, 8, 1, 100),
      clampNumber(minWeight, DEFAULT_V5_ARTIST_DRAW_MIN, 0.05, 10),
      clampNumber(maxWeight, DEFAULT_V5_ARTIST_DRAW_MAX, 0.05, 10),
    );
    if (recipes.length === 0) return setMessage(text.drawNone);
    setDrawInput(normalized.output);
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
    setCandidateCount(8);
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
  const renderCandidate = (candidate: SharedArtistFavorite, favorite = false) => {
    const dimensions = candidateDimensions(candidate);
    const candidateModel = candidate.image?.model || candidate.generationModel || generationParams.model;
    return (
    <article key={candidate.id} className={`artist-candidate v5-draw-card ${candidate.status}`}>
      <header className="artist-candidate-header"><div><b>#{String(candidate.sequence).padStart(2, "0")}</b><small>{modelLabel(candidateModel)} · {dimensions.width}×{dimensions.height}</small></div><span>{favorite || candidate.liked ? text.saved : text[candidate.status === "generating" ? "generatingOne" : candidate.status]}</span></header>
      <div className="artist-candidate-media v5-draw-image" style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}` }}>
        {candidate.image ? <><img src={candidate.image.fileUrl} alt={candidate.prompt} loading="lazy" decoding="async" title={text.preview} onDoubleClick={() => setPreviewCandidate(candidate)} /><button type="button" className="artist-candidate-preview-button" aria-label={text.preview} title={text.preview} onClick={() => setPreviewCandidate(candidate)}><Icon name="search" /></button></> : <div className="artist-candidate-placeholder"><Icon name={candidate.status === "generating" ? "loader" : "image"} /></div>}
      </div>
      <div className="artist-string-block"><code>{candidate.prompt}</code></div>
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
    <main className="v5-artist-repair">
      <header className="v5-artist-repair-hero">
        <div>
          <span>{drawMode ? "V5 ARTIST DRAW" : "V4.5 → V5"}</span>
          <h2>{drawMode ? text.drawPageTitle : text.title}</h2>
          <p>{drawMode ? text.drawPageSubtitle : text.subtitle}</p>
        </div>
        <Button onClick={onBack}>{text.back}</Button>
      </header>

      {!drawMode && (
        <>
          <section className="v5-artist-repair-card evidence">
            <div className="v5-artist-repair-note-icon"><Icon name="info" /></div>
            <div><b>{text.noteTitle}</b><p>{text.note}</p><small>{text.safe}</small></div>
          </section>
          <section className="v5-artist-repair-card editor">
            <div className="v5-artist-repair-section-head"><div><b>{text.strategy}</b><span>×0.333–0.5</span></div></div>
            <div className="v5-artist-repair-editors">
              <label className="source"><span>{text.input}</span><textarea value={input} placeholder={text.inputHint} onChange={(event) => { setInput(event.target.value); setOutput(""); }} /></label>
              <div className="v5-artist-repair-flow" aria-hidden="true"><span>→</span></div>
              <label className="result"><span>{text.output}</span><textarea value={output} readOnly placeholder="0.4::artist:xiaoluo_xl ::" /></label>
            </div>
            <p className="v5-repair-batch-hint">{text.repairBatchHint}</p>
            <div className="v5-weight-draw-controls v5-repair-batch-controls">
              <label><span>{text.candidateCount}</span><NumericDraftInput min={1} max={100} step={1} value={candidateCount} normalize={(value) => Math.floor(value)} onCommit={setCandidateCount} /></label>
              <label className="wide"><span>{text.basePrompt}</span><textarea value={basePrompt} onChange={(event) => setBasePrompt(event.target.value)} /></label>
              <fieldset className="v5-seed-control wide"><legend>{text.seedMode}</legend><label><input type="radio" checked={seedMode === "fixed"} onChange={() => setSeedMode("fixed")} />{text.fixedSeed}</label><label><input type="radio" checked={seedMode === "random"} onChange={() => setSeedMode("random")} />{text.randomSeed}</label>{seedMode === "fixed" && <div><NumericDraftInput aria-label={text.seed} min={1} max={2147483647} step={1} value={seed} normalize={(value) => Math.floor(value)} onCommit={setSeed} /><Button variant="ghost" onClick={() => setSeed(freshSeed())}>{text.randomizeSeed}</Button></div>}</fieldset>
            </div>
            <div className="v5-artist-repair-actions"><Button variant="primary" onClick={repair}>{text.run}</Button><Button disabled={!output} onClick={() => void navigator.clipboard.writeText(output).then(() => setCopied(true))}>{copied ? text.copied : text.copy}</Button><span className={message === text.none ? "warning" : ""}>{message}</span></div>
          </section>
        </>
      )}

      {drawMode && (
          <section className="v5-artist-repair-card v5-weight-draw-panel">
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
            <div className="v5-weight-draw-controls">
              <label><span>{text.weightMin}</span><NumericDraftInput min={0.05} max={10} step={0.05} value={minWeight} normalize={(value) => Math.round(value * 100) / 100} onCommit={setMinWeight} /></label>
              <label><span>{text.weightMax}</span><NumericDraftInput min={0.05} max={10} step={0.05} value={maxWeight} normalize={(value) => Math.round(value * 100) / 100} onCommit={setMaxWeight} /></label>
              <label><span>{text.candidateCount}</span><NumericDraftInput min={1} max={100} step={1} value={candidateCount} normalize={(value) => Math.floor(value)} onCommit={setCandidateCount} /></label>
              <label className="wide"><span>{text.basePrompt}</span><textarea value={basePrompt} onChange={(event) => setBasePrompt(event.target.value)} /></label>
              <fieldset className="v5-seed-control wide"><legend>{text.seedMode}</legend><label><input type="radio" checked={seedMode === "fixed"} onChange={() => setSeedMode("fixed")} />{text.fixedSeed}</label><label><input type="radio" checked={seedMode === "random"} onChange={() => setSeedMode("random")} />{text.randomSeed}</label>{seedMode === "fixed" && <div><NumericDraftInput aria-label={text.seed} min={1} max={2147483647} step={1} value={seed} normalize={(value) => Math.floor(value)} onCommit={setSeed} /><Button variant="ghost" onClick={() => setSeed(freshSeed())}>{text.randomizeSeed}</Button></div>}</fieldset>
            </div>
          </section>
      )}

      <details className="v5-artist-repair-card random-generation-settings v5-draw-generation-settings" open>
            <summary>
              <span><b>{paramText.title}</b><small>{paramText.hint}</small></span>
              <span className="random-generation-header-actions">
                <Button type="button" variant="ghost" onClick={(event) => { event.preventDefault(); syncGenerationParams(); }}>{paramText.sync}</Button>
                <Button type="button" variant="ghost" onClick={(event) => { event.preventDefault(); resetGenerationParams(); }}>{paramText.reset}</Button>
              </span>
            </summary>
            <div className="random-generation-grid">
              <label className="wide"><span>{paramText.model}</span><select value={generationParams.model} onChange={(event) => patchGeneration("model", event.target.value as GenerateParams["model"])}>{NAI_MODELS.map((model) => <option key={model.value} value={model.value}>{model.value}</option>)}</select></label>
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
              <label><span>{paramText.sampler}</span><select value={generationParams.sampler} onChange={(event) => patchGeneration("sampler", event.target.value as GenerateParams["sampler"])}>{NAI_SAMPLERS.map((sampler) => <option key={sampler.value} value={sampler.value}>{sampler.value}</option>)}</select></label>
              {supportsNAINoiseScheduleControl(generationParams.model) ? <label><span>{paramText.noise}</span><select value={generationParams.noiseSchedule} onChange={(event) => patchGeneration("noiseSchedule", event.target.value)}><option value="native">native</option><option value="karras">karras</option><option value="exponential">exponential</option></select></label> : null}
              <label><span>{paramText.uc}</span><select value={generationParams.ucPreset} onChange={(event) => patchGeneration("ucPreset", Number(event.target.value) as GenerateParams["ucPreset"])}>{NAI_UC_PRESETS.map((preset, index) => <option key={preset.value} value={preset.value}>{preset.value} · {ucLabels[index]}</option>)}</select></label>
              <label className="wide"><span>{paramText.negative}</span><textarea value={generationParams.negativePrompt} onChange={(event) => patchGeneration("negativePrompt", event.target.value)} /></label>
              <QualityPresetControl className="wide" language={language} model={generationParams.model} value={generationParams.qualityPreset} transparentBackground={generationParams.transparentBackground} onChange={(value) => patchGeneration("qualityPreset", value)} onTransparentChange={(value) => patchGeneration("transparentBackground", value)} />
              <div className="random-generation-toggles wide">
                {supportsNAIVariety(generationParams.model) ? <label><input type="checkbox" checked={generationParams.variety} onChange={(event) => patchGeneration("variety", event.target.checked)} /><span>{paramText.variety}</span></label> : null}
                {!isNAIV4PlusModel(generationParams.model) ? <><label><input type="checkbox" checked={generationParams.smea} onChange={(event) => patchGeneration("smea", event.target.checked)} /><span>{paramText.smea}</span></label><label><input type="checkbox" checked={generationParams.smeaDyn} disabled={!generationParams.smea} onChange={(event) => patchGeneration("smeaDyn", event.target.checked)} /><span>{paramText.smeaDyn}</span></label></> : null}
              </div>
            </div>
      </details>

      <section className="v5-artist-repair-card v5-draw-run-card">
        <div className="v5-weight-draw-actions">{drawMode && <Button onClick={draw} disabled={running}><Icon name="dice" />{text.draw}</Button>}{running ? <Button variant="danger" onClick={() => { cancelRef.current = true; void window.naiDesktop.cancel(); }}>{text.stop}</Button> : <Button variant="primary" onClick={() => void generateBatch()} disabled={results.length === 0}>{text.generate}</Button>}<span className={message === text.drawNone || message === text.none ? "warning" : ""}>{running ? interpolate(text.generating, { done: completed, total: results.length }) : message}</span></div>
      </section>

      <nav className="v5-draw-tabs"><button className={!showFavorites ? "active" : ""} onClick={() => setShowFavorites(false)}>{text.results}<b>{results.length}</b></button><button className={showFavorites ? "active" : ""} onClick={() => { setFavorites(loadArtistFavorites(favoriteCollection)); setShowFavorites(true); }}>{text.favorites}<b>{favorites.length}</b></button><small>{text.sharedFavorites}</small></nav>
      {!showFavorites && (results.length > 0 ? <section className="v5-draw-grid">{results.map((item) => renderCandidate(item))}</section> : <div className="v5-draw-empty">{drawMode ? text.noResults : text.repairNoResults}</div>)}
      {showFavorites && (favorites.length > 0 ? <section className="v5-draw-grid">{favorites.map((item) => renderCandidate(item, true))}</section> : <div className="v5-draw-empty">{text.noFavorites}</div>)}
    </main>
    {previewCandidate?.image && <AppPortal><div className="modal-backdrop artist-result-preview-backdrop" role="dialog" aria-modal="true" aria-label={text.preview} onMouseDown={() => setPreviewCandidate(null)}><div className="artist-result-preview" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="artist-result-preview-close" aria-label={text.back} onClick={() => setPreviewCandidate(null)}><Icon name="close" /></button><img src={previewCandidate.image.fileUrl} alt={previewCandidate.prompt} /><footer><b>{modelLabel(previewCandidate.image.model || previewCandidate.generationModel || generationParams.model)}</b><span>{previewCandidate.image.width}×{previewCandidate.image.height}</span></footer></div></div></AppPortal>}
  </>;
}
