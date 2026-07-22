import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "./store";
import { Button } from "./components/ui";
import {
  buildArtistCombinations,
  createArtistLabRandom,
  type ArtistCombination,
  type ArtistLabDiscoveryMode,
  type ArtistLabModelMode,
  type ArtistLabModelStatus,
  type ArtistTagRecord,
} from "./artist-lab";
import type { AppLanguage, HistoryItem } from "./types";
import RandomArtistLab from "./RandomArtistLab";

type TargetImage = { filePath: string; fileUrl: string; name: string };
type LabResult = ArtistCombination & {
  sequence: number;
  round: number;
  status: "pending" | "generating" | "scoring" | "done" | "failed";
  image?: HistoryItem;
  score?: number;
  delta?: number;
  error?: string;
  liked?: boolean;
};
type Session = {
  mode: ArtistLabDiscoveryMode;
  modelMode: ArtistLabModelMode;
  target: TargetImage | null;
  basePrompt: string;
  sharedStylePrompt: string;
  search: string;
  selectedArtists: string[];
  count: number;
  seed: number;
  autoRounds: number;
  sortMode: "sequence" | "score";
  baseline?: { image?: HistoryItem; score?: number; error?: string };
  results: LabResult[];
};

const STORAGE_KEY = "langbai.artist-lab.session.v2";
let sessionCache: Session | null = null;

const TEXT = {
  "zh-CN": {
    eyebrow: "WINDOWS · NOVELAI ARTIST TAGS",
    title: "画风实验室",
    subtitle: "固定提示词与 Seed，自动测试带权画师串，并按目标图片的整体画风排序。",
    back: "返回工具",
    target: "目标画风",
    choose: "选择目标图片",
    change: "更换图片",
    targetHint: "匹配模式需要目标图片；图片只在本机评分，不会上传到第三方评分服务。",
    mode: "探索模式",
    match: "接近目标图",
    random: "随机发现画风",
    model: "评分模型",
    high: "高精度（默认）",
    light: "轻量",
    modelHint: "首次评分会下载模型并缓存在本机。高精度使用 DINOv2 Base，轻量使用量化 DINOv2 Small。",
    cache: "模型缓存",
    clearCache: "清除模型缓存",
    prompt: "固定内容提示词",
    promptHint: "所有候选使用完全相同的内容提示词。画师串单独写入风格提示词。",
    search: "搜索 Danbooru 画师标签",
    searchPlaceholder: "输入画师名；留空载入热门画师",
    searchButton: "搜索",
    selected: "已选画师",
    selectedHint: "至少选择一名；建议先选 12～40 名候选，程序再逐轮淘汰。",
    noArtists: "还没有选择画师",
    count: "本轮生成数量",
    seed: "固定 Seed",
    rounds: "自动迭代轮数",
    roundsHint: "仅目标匹配模式可用；1 表示只生成初始轮，最多 5 轮。",
    start: "生成并评分",
    iterate: "用本轮优胜项继续迭代",
    stop: "停止任务",
    apply: "应用到生成",
    like: "喜欢",
    unlike: "取消喜欢",
    pending: "等待",
    generating: "生成中",
    scoring: "AI评分中",
    failed: "失败",
    done: "已完成",
    score: "相似度",
    quote: "本轮官方报价：{amount} Anlas",
    quoteFail: "报价暂不可用：{message}。仍可尝试生成，以 NovelAI 返回结果为准。",
    needTarget: "请先选择目标图片。",
    needArtist: "请至少选择一名画师。",
    needPrompt: "请填写用于公平对比的固定内容提示词。",
    searching: "正在读取画师标签…",
    empty: "没有找到可用画师标签。",
    running: "本轮进行中：{done}/{total}",
    complete: "本轮已完成。可直接应用，也可让优胜画师继续组合迭代。",
    applied: "画师串已写入生成页的风格提示词。",
    queue: "本轮画师串队列",
    queueHint: "一条画师串对应一张 NovelAI 图片；预览顺序就是实际生成顺序。",
    emptyQueue: "选择画师后，这里会预览本轮所有带权组合。",
    gallery: "画师串对照画廊",
    galleryHint: "图片和画师串始终一一对应。生成过程中默认保持原顺序，便于逐项对照。",
    sequenceOrder: "按生成顺序",
    scoreOrder: "按评分排序",
    artistString: "画师串",
    copy: "复制",
    copied: "已复制画师串。",
    round: "轮次",
  },
  "zh-TW": {
    eyebrow: "WINDOWS · NOVELAI ARTIST TAGS", title: "畫風實驗室", subtitle: "固定提示詞與 Seed，自動測試帶權畫師串，並按目標圖片的整體畫風排序。", back: "返回工具", target: "目標畫風", choose: "選擇目標圖片", change: "更換圖片", targetHint: "匹配模式需要目標圖片；圖片只在本機評分，不會上傳到第三方評分服務。", mode: "探索模式", match: "接近目標圖", random: "隨機發現畫風", model: "評分模型", high: "高精度（預設）", light: "輕量", modelHint: "首次評分會下載模型並快取於本機。高精度使用 DINOv2 Base，輕量使用量化 DINOv2 Small。", cache: "模型快取", clearCache: "清除模型快取", prompt: "固定內容提示詞", promptHint: "所有候選使用完全相同的內容提示詞。畫師串另外寫入風格提示詞。", search: "搜尋 Danbooru 畫師標籤", searchPlaceholder: "輸入畫師名；留空載入熱門畫師", searchButton: "搜尋", selected: "已選畫師", selectedHint: "至少選擇一名；建議先選 12～40 名候選，再逐輪淘汰。", noArtists: "尚未選擇畫師", count: "本輪生成數量", seed: "固定 Seed", rounds: "自動迭代輪數", roundsHint: "僅目標匹配模式可用；1 代表只生成初始輪，最多 5 輪。", start: "生成並評分", iterate: "以本輪優勝項繼續迭代", stop: "停止任務", apply: "套用到生成", like: "喜歡", unlike: "取消喜歡", pending: "等待", generating: "生成中", scoring: "AI 評分中", failed: "失敗", done: "已完成", score: "相似度", quote: "本輪官方報價：{amount} Anlas", quoteFail: "報價暫不可用：{message}。仍可嘗試生成，以 NovelAI 回傳結果為準。", needTarget: "請先選擇目標圖片。", needArtist: "請至少選擇一名畫師。", needPrompt: "請填寫固定內容提示詞。", searching: "正在讀取畫師標籤…", empty: "找不到可用畫師標籤。", running: "本輪進行中：{done}/{total}", complete: "本輪已完成。可直接套用，或讓優勝畫師繼續組合迭代。", applied: "畫師串已寫入生成頁的風格提示詞。", queue: "本輪畫師串佇列", queueHint: "一條畫師串對應一張 NovelAI 圖片；預覽順序就是實際生成順序。", emptyQueue: "選擇畫師後，這裡會預覽本輪所有帶權組合。", gallery: "畫師串對照畫廊", galleryHint: "圖片與畫師串始終一一對應；生成時預設保持原順序。", sequenceOrder: "依生成順序", scoreOrder: "依評分排序", artistString: "畫師串", copy: "複製", copied: "已複製畫師串。", round: "輪次",
  },
  "en-US": {
    eyebrow: "WINDOWS · NOVELAI ARTIST TAGS", title: "Artist Style Lab", subtitle: "Keep prompt and seed fixed, test weighted artist strings, and rank overall style against a target image.", back: "Back to Tools", target: "Target style", choose: "Choose target image", change: "Change image", targetHint: "Target matching requires an image. Scoring stays on this device and is not sent to a third-party scoring service.", mode: "Discovery mode", match: "Match target", random: "Discover random styles", model: "Scoring model", high: "High accuracy (default)", light: "Lightweight", modelHint: "The model is downloaded and cached on first scoring. High uses DINOv2 Base; Light uses quantized DINOv2 Small.", cache: "Model cache", clearCache: "Clear model cache", prompt: "Fixed content prompt", promptHint: "Every candidate uses the same content prompt. Artist strings are added separately as style prompt.", search: "Search Danbooru artist tags", searchPlaceholder: "Artist name; leave empty for popular artists", searchButton: "Search", selected: "Selected artists", selectedHint: "Select at least one. Start with 12–40 artists, then eliminate candidates by rounds.", noArtists: "No artists selected", count: "Images this round", seed: "Fixed seed", rounds: "Automatic rounds", roundsHint: "Target-match mode only. 1 runs the initial round; maximum 5.", start: "Generate and score", iterate: "Iterate with round winners", stop: "Stop task", apply: "Apply to Generate", like: "Like", unlike: "Unlike", pending: "Pending", generating: "Generating", scoring: "AI scoring", failed: "Failed", done: "Complete", score: "Similarity", quote: "Official quote for this round: {amount} Anlas", quoteFail: "Quote unavailable: {message}. Generation can still be attempted; NovelAI's response is authoritative.", needTarget: "Choose a target image first.", needArtist: "Select at least one artist.", needPrompt: "Enter a fixed content prompt for fair comparison.", searching: "Loading artist tags…", empty: "No usable artist tags found.", running: "Round in progress: {done}/{total}", complete: "Round complete. Apply a result or continue combining the winners.", applied: "Artist string was written to the Generate style prompt.", queue: "Artist-string queue", queueHint: "One artist string creates one NovelAI image. Preview order is generation order.", emptyQueue: "Select artists to preview every weighted combination in this round.", gallery: "Artist-string comparison gallery", galleryHint: "Every image stays paired with its artist string. Generation order is stable by default.", sequenceOrder: "Generation order", scoreOrder: "Score order", artistString: "Artist string", copy: "Copy", copied: "Artist string copied.", round: "Round",
  },
  "ja-JP": {
    eyebrow: "WINDOWS · NOVELAI ARTIST TAGS", title: "画風ラボ", subtitle: "プロンプトと Seed を固定し、重み付き画家タグを自動テストして目標画像との画風類似度で並べます。", back: "ツールへ戻る", target: "目標画風", choose: "目標画像を選択", change: "画像を変更", targetHint: "目標一致モードには画像が必要です。採点は端末内だけで行い、第三者サービスへ送りません。", mode: "探索モード", match: "目標に近づける", random: "ランダム画風探索", model: "採点モデル", high: "高精度（既定）", light: "軽量", modelHint: "初回採点時にモデルをダウンロードして端末へキャッシュします。高精度は DINOv2 Base、軽量は量子化 DINOv2 Small です。", cache: "モデルキャッシュ", clearCache: "モデルキャッシュを削除", prompt: "固定内容プロンプト", promptHint: "全候補で同じ内容プロンプトを使い、画家タグだけをスタイル欄へ追加します。", search: "Danbooru 画家タグを検索", searchPlaceholder: "画家名。空欄なら人気順", searchButton: "検索", selected: "選択した画家", selectedHint: "最低1名。最初は12～40名から始め、ラウンドごとに絞り込みます。", noArtists: "画家が未選択です", count: "このラウンドの枚数", seed: "固定 Seed", rounds: "自動反復回数", roundsHint: "目標一致モードのみ。1 は初回のみ、最大 5 回です。", start: "生成して採点", iterate: "上位候補で次を反復", stop: "タスクを停止", apply: "生成へ適用", like: "お気に入り", unlike: "解除", pending: "待機", generating: "生成中", scoring: "AI 採点中", failed: "失敗", done: "完了", score: "類似度", quote: "このラウンドの公式見積り：{amount} Anlas", quoteFail: "見積りを取得できません：{message}。生成は試行でき、NovelAI の応答を優先します。", needTarget: "先に目標画像を選択してください。", needArtist: "画家を1名以上選択してください。", needPrompt: "比較用の固定内容プロンプトを入力してください。", searching: "画家タグを読み込み中…", empty: "利用可能な画家タグが見つかりません。", running: "ラウンド進行中：{done}/{total}", complete: "ラウンド完了。適用するか、上位画家を組み合わせて続行できます。", applied: "画家タグを生成画面のスタイルプロンプトへ反映しました。", queue: "画家タグ列", queueHint: "1つの画家タグ列につき1枚をNovelAIで生成します。表示順が生成順です。", emptyQueue: "画家を選ぶと重み付き組み合わせを一覧できます。", gallery: "画家タグ比較ギャラリー", galleryHint: "画像と画家タグ列は常に1対1で対応し、既定では生成順を保ちます。", sequenceOrder: "生成順", scoreOrder: "採点順", artistString: "画家タグ列", copy: "コピー", copied: "画家タグ列をコピーしました。", round: "ラウンド",
  },
  "ko-KR": {
    eyebrow: "WINDOWS · NOVELAI ARTIST TAGS", title: "화풍 실험실", subtitle: "프롬프트와 Seed를 고정하고 가중치 작가 태그를 자동 테스트해 목표 이미지와의 화풍 유사도로 정렬합니다.", back: "도구로 돌아가기", target: "목표 화풍", choose: "목표 이미지 선택", change: "이미지 변경", targetHint: "목표 매칭에는 이미지가 필요합니다. 평가는 이 기기에서만 실행되며 제3자 평가 서비스로 전송되지 않습니다.", mode: "탐색 모드", match: "목표와 가깝게", random: "무작위 화풍 발견", model: "평가 모델", high: "고정밀(기본)", light: "경량", modelHint: "첫 평가 때 모델을 내려받아 로컬에 캐시합니다. 고정밀은 DINOv2 Base, 경량은 양자화 DINOv2 Small을 사용합니다.", cache: "모델 캐시", clearCache: "모델 캐시 지우기", prompt: "고정 내용 프롬프트", promptHint: "모든 후보가 같은 내용 프롬프트를 사용하고 작가 문자열만 스타일 프롬프트에 추가됩니다.", search: "Danbooru 작가 태그 검색", searchPlaceholder: "작가 이름, 비우면 인기 작가", searchButton: "검색", selected: "선택한 작가", selectedHint: "최소 한 명을 선택하세요. 12~40명으로 시작해 라운드별로 줄이는 것을 권장합니다.", noArtists: "선택한 작가가 없습니다", count: "이번 라운드 생성 수", seed: "고정 Seed", rounds: "자동 반복 횟수", roundsHint: "목표 매칭 모드에서만 사용합니다. 1은 첫 라운드만, 최대 5입니다.", start: "생성 및 평가", iterate: "상위 결과로 계속 반복", stop: "작업 중지", apply: "생성에 적용", like: "좋아요", unlike: "좋아요 취소", pending: "대기", generating: "생성 중", scoring: "AI 평가 중", failed: "실패", done: "완료", score: "유사도", quote: "이번 라운드 공식 견적: {amount} Anlas", quoteFail: "견적을 사용할 수 없음: {message}. 생성은 시도할 수 있으며 NovelAI 응답이 우선입니다.", needTarget: "먼저 목표 이미지를 선택하세요.", needArtist: "작가를 한 명 이상 선택하세요.", needPrompt: "공정한 비교를 위한 고정 프롬프트를 입력하세요.", searching: "작가 태그를 불러오는 중…", empty: "사용 가능한 작가 태그가 없습니다.", running: "라운드 진행: {done}/{total}", complete: "라운드가 완료되었습니다. 적용하거나 상위 작가 조합으로 계속할 수 있습니다.", applied: "작가 문자열을 생성 화면 스타일 프롬프트에 적용했습니다.", queue: "이번 작가 문자열 대기열", queueHint: "작가 문자열 하나가 NovelAI 이미지 한 장과 대응하며 표시 순서대로 생성합니다.", emptyQueue: "작가를 선택하면 가중 조합을 미리 볼 수 있습니다.", gallery: "작가 문자열 비교 갤러리", galleryHint: "이미지와 작가 문자열은 항상 1:1로 유지되며 기본값은 생성 순서입니다.", sequenceOrder: "생성 순서", scoreOrder: "평가 순서", artistString: "작가 문자열", copy: "복사", copied: "작가 문자열을 복사했습니다.", round: "라운드",
  },
} satisfies Record<AppLanguage, Record<string, string>>;

const HOME_TEXT = {
  "zh-CN": { eyebrow: "WINDOWS · ARTIST STYLE LAB", title: "画风实验室", subtitle: "选择一种工作流；两个项目分别保存，不会互相覆盖。", back: "返回工具", reverse: "目标画风反推", reverseDesc: "上传目标图，固定内容与 Seed，通过单画师测试、权重扫描和组合评分逐轮接近目标画风。", random: "随机画师组合", randomDesc: "从高人气画师池生成多层级权重配方，NovelAI 逐串出图，再根据你喜欢的结果继续变异。", enter: "进入" },
  "zh-TW": { eyebrow: "WINDOWS · ARTIST STYLE LAB", title: "畫風實驗室", subtitle: "選擇工作流程；兩個專案分開保存。", back: "返回工具", reverse: "目標畫風反推", reverseDesc: "上傳目標圖，以單畫師、權重掃描和組合評分逐輪接近目標畫風。", random: "隨機畫師組合", randomDesc: "從高人氣畫師池建立多層級權重配方，再依喜歡結果繼續變異。", enter: "進入" },
  "en-US": { eyebrow: "WINDOWS · ARTIST STYLE LAB", title: "Artist Style Lab", subtitle: "Choose a workflow. Both projects persist independently.", back: "Back to Tools", reverse: "Target Style Reverse Search", reverseDesc: "Use a target image, controlled single-artist tests, weight sweeps, and scored combinations to approach its style.", random: "Random Artist Combinations", randomDesc: "Build layered recipes from a popularity-weighted artist pool, generate one image per recipe, and evolve from your likes.", enter: "Open" },
  "ja-JP": { eyebrow: "WINDOWS · ARTIST STYLE LAB", title: "画風ラボ", subtitle: "ワークフローを選択してください。各プロジェクトは別々に保存されます。", back: "ツールへ戻る", reverse: "目標画風の逆探索", reverseDesc: "目標画像、単独画家テスト、重み走査、組合せ採点で画風へ近づけます。", random: "ランダム画家組合せ", randomDesc: "人気画家プールから重み付き配方を作り、お気に入りから変体を続けます。", enter: "開く" },
  "ko-KR": { eyebrow: "WINDOWS · ARTIST STYLE LAB", title: "화풍 실험실", subtitle: "워크플로를 선택하세요. 두 프로젝트는 별도로 저장됩니다.", back: "도구로 돌아가기", reverse: "목표 화풍 역탐색", reverseDesc: "목표 이미지, 단일 작가 테스트, 가중치 탐색과 조합 평가로 화풍에 접근합니다.", random: "무작위 작가 조합", randomDesc: "인기 작가 풀에서 다단계 가중 조합을 만들고 좋아요 결과로 계속 변이합니다.", enter: "열기" },
} satisfies Record<AppLanguage, Record<string, string>>;

const CONTRIBUTION_TEXT = {
  "zh-CN": { baseline: "无候选画师基准", baselineHint: "使用相同内容、Seed 和参数，只保留生成页公共风格词。", contribution: "单画师贡献", contributionHint: "变化值＝加入该画师后的目标相似度－基准相似度，只对当前模型、提示词和 Seed 有效。", improved: "提升", reduced: "降低", baselineFailed: "基准图生成失败，仍会继续生成候选，但无法计算相对贡献。" },
  "zh-TW": { baseline: "無候選畫師基準", baselineHint: "使用相同內容、Seed 與參數，只保留生成頁共用風格詞。", contribution: "單畫師貢獻", contributionHint: "變化值＝加入畫師後的目標相似度－基準相似度，只對目前模型、提示詞與 Seed 有效。", improved: "提升", reduced: "降低", baselineFailed: "基準圖生成失敗，仍會繼續候選，但無法計算相對貢獻。" },
  "en-US": { baseline: "No-candidate baseline", baselineHint: "Same content, seed, and settings; only the shared Generate style prompt remains.", contribution: "Single-artist contribution", contributionHint: "Delta = target similarity with the artist minus baseline similarity. It is contextual to this model, prompt, and seed.", improved: "improved", reduced: "reduced", baselineFailed: "Baseline generation failed. Candidates continue, but relative contribution is unavailable." },
  "ja-JP": { baseline: "候補画家なし基準", baselineHint: "内容、Seed、設定を固定し、生成画面の共通スタイル語だけを残します。", contribution: "単独画家の寄与", contributionHint: "変化値＝画家追加後の類似度－基準類似度。現在のモデル、プロンプト、Seed にのみ有効です。", improved: "向上", reduced: "低下", baselineFailed: "基準画像の生成に失敗しました。候補生成は続行しますが相対寄与は計算できません。" },
  "ko-KR": { baseline: "후보 작가 없는 기준", baselineHint: "같은 내용, Seed와 설정에서 생성 화면의 공통 화풍어만 유지합니다.", contribution: "단일 작가 기여도", contributionHint: "변화값 = 작가 추가 후 목표 유사도 - 기준 유사도이며 현재 모델, 프롬프트와 Seed에만 유효합니다.", improved: "향상", reduced: "감소", baselineFailed: "기준 이미지 생성에 실패했습니다. 후보 생성은 계속하지만 상대 기여도를 계산할 수 없습니다." },
} satisfies Record<AppLanguage, Record<string, string>>;

const SHARED_STYLE_TEXT = {
  "zh-CN": { label: "公共非候选风格词", hint: "可放质量、媒介、光照等固定词。为保证基准有效，请不要在这里混入本轮候选画师。" },
  "zh-TW": { label: "共用非候選風格詞", hint: "可放品質、媒材、光線等固定詞；請勿混入本輪候選畫師。" },
  "en-US": { label: "Shared non-candidate style terms", hint: "Keep fixed quality, medium, or lighting terms here. Do not mix in artists being tested this round." },
  "ja-JP": { label: "共通の非候補スタイル語", hint: "品質、媒体、照明などの固定語を置き、今回試す画家は混ぜないでください。" },
  "ko-KR": { label: "공통 비후보 화풍 용어", hint: "품질, 매체, 조명 같은 고정 용어만 두고 이번 후보 작가는 섞지 마세요." },
} satisfies Record<AppLanguage, { label: string; hint: string }>;

function restoreSession(basePrompt: string, sharedStylePrompt: string): Session {
  if (sessionCache) return sessionCache;
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Session> | null;
    sessionCache = {
      mode: raw?.mode === "random" ? "random" : "match",
      modelMode: raw?.modelMode === "light" ? "light" : "high",
      target: raw?.target?.filePath ? raw.target as TargetImage : null,
      basePrompt: typeof raw?.basePrompt === "string" ? raw.basePrompt : basePrompt,
      sharedStylePrompt: typeof raw?.sharedStylePrompt === "string" ? raw.sharedStylePrompt : sharedStylePrompt,
      search: "",
      selectedArtists: Array.isArray(raw?.selectedArtists) ? raw.selectedArtists.filter((v): v is string => typeof v === "string") : [],
      count: Math.max(1, Math.min(40, Number(raw?.count) || 8)),
      seed: Number.isSafeInteger(raw?.seed) ? Number(raw?.seed) : 123456789,
      autoRounds: Math.max(1, Math.min(5, Number(raw?.autoRounds) || 1)),
      sortMode: raw?.sortMode === "score" ? "score" : "sequence",
      baseline: raw?.baseline,
      results: Array.isArray(raw?.results) ? raw.results.map((item, index) => ({ ...item, sequence: item.sequence || index + 1, round: item.round || 1 })) as LabResult[] : [],
    };
  } catch {
    sessionCache = { mode: "match", modelMode: "high", target: null, basePrompt, sharedStylePrompt, search: "", selectedArtists: [], count: 8, seed: 123456789, autoRounds: 1, sortMode: "sequence", baseline: undefined, results: [] };
  }
  return sessionCache;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function TargetArtistLab({ onBack }: { onBack: () => void }) {
  const language = useAppStore((state) => state.settings?.language ?? "zh-CN");
  const params = useAppStore((state) => state.params);
  const applyParams = useAppStore((state) => state.applyParams);
  const refreshAccount = useAppStore((state) => state.refreshAccount);
  const refreshHistory = useAppStore((state) => state.refreshHistory);
  const text = TEXT[language];
  const contributionText = CONTRIBUTION_TEXT[language];
  const sharedStyleText = SHARED_STYLE_TEXT[language];
  const initial = useMemo(() => ({ ...restoreSession(params.positivePrompt, ""), mode: "match" as const }), []);
  const [session, setSession] = useState<Session>(initial);
  const [artists, setArtists] = useState<ArtistTagRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [modelStatus, setModelStatus] = useState<ArtistLabModelStatus | null>(null);
  const cancelRef = useRef(false);
  const artistKey = session.selectedArtists.join("\u0000");
  const plannedCombinations = useMemo(
    () => buildArtistCombinations(session.selectedArtists, session.count, session.mode, createArtistLabRandom(session.seed)),
    [artistKey, session.count, session.mode, session.seed],
  );

  const patch = (next: Partial<Session>) => setSession((current) => ({ ...current, ...next }));
  const patchExperiment = (next: Partial<Session>) => setSession((current) => ({
    ...current,
    ...next,
    baseline: undefined,
    results: [],
  }));
  useEffect(() => {
    sessionCache = session;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }, [session]);
  useEffect(() => {
    void window.naiDesktop.artistLabModelStatus(session.modelMode).then(setModelStatus).catch(() => undefined);
  }, [session.modelMode]);

  const interpolate = (value: string, values: Record<string, unknown>) =>
    Object.entries(values).reduce((out, [key, replacement]) => out.replaceAll(`{${key}}`, String(replacement)), value);

  const searchArtists = async () => {
    setSearching(true);
    setMessage("");
    try {
      const items = await window.naiDesktop.artistLabSearchArtists(session.search, 60);
      setArtists(items);
      if (items.length === 0) setMessage(text.empty);
    } catch (error: any) {
      setMessage(error?.message ?? String(error));
    } finally {
      setSearching(false);
    }
  };

  const chooseTarget = async () => {
    const target = await window.naiDesktop.artistLabPickTarget();
    if (target) patchExperiment({ target });
  };

  const toggleArtist = (name: string) => {
    setSession((current) => ({
      ...current,
      selectedArtists: current.selectedArtists.includes(name)
        ? current.selectedArtists.filter((item) => item !== name)
        : [...current.selectedArtists, name],
      baseline: undefined,
      results: [],
    }));
  };

  const runRound = async (iterate = false) => {
    if (session.mode === "match" && !session.target) return setMessage(text.needTarget);
    if (session.selectedArtists.length === 0) return setMessage(text.needArtist);
    if (!session.basePrompt.trim()) return setMessage(text.needPrompt);
    const winnerNames = (items: LabResult[]) => Array.from(new Set(
      [...items]
        .filter((item) => item.status === "done")
        .sort((left, right) => Number(right.liked) - Number(left.liked) || (right.score ?? 0) - (left.score ?? 0))
        .slice(0, 6)
        .flatMap((item) => item.tags.map((tag) => tag.name)),
    ));
    const previousRound = session.results.reduce((max, item) => Math.max(max, item.round || 1), 0);
    const startRound = iterate ? previousRound + 1 : 1;
    const automaticRounds = !iterate && session.mode === "match" ? session.autoRounds : 1;
    let accumulated: LabResult[] = iterate ? [...session.results] : [];
    let baseline = iterate ? session.baseline : undefined;
    let sourceNames = iterate ? winnerNames(session.results) : session.selectedArtists;
    if (sourceNames.length === 0) sourceNames = session.selectedArtists;
    let combinations = iterate
      ? buildArtistCombinations(sourceNames, session.count, "random", createArtistLabRandom(session.seed + startRound))
      : plannedCombinations;
    const seenPrompts = new Set(accumulated.map((item) => item.prompt));
    setRunning(true);
    setMessage("");
    cancelRef.current = false;
    if (!iterate) setSession((state) => ({ ...state, baseline: undefined, results: [] }));

    const fixedParams = {
      ...params,
      positivePrompt: session.basePrompt.trim(),
      stylePrompt: session.sharedStylePrompt.trim(),
      width: 512,
      height: 512,
      seedMode: "fixed" as const,
      seed: session.seed,
      qualityToggle: false,
    };
    const extras = { vibeImages: [], charCaptions: [], preciseReferences: [] };
    for (let roundOffset = 0; roundOffset < automaticRounds; roundOffset += 1) {
      if (cancelRef.current) break;
      const round = startRound + roundOffset;
      if (roundOffset > 0) {
        sourceNames = winnerNames(accumulated.filter((item) => item.round === round - 1));
        if (sourceNames.length === 0) break;
        combinations = buildArtistCombinations(
          sourceNames,
          session.count,
          "random",
          createArtistLabRandom(session.seed + round),
        );
      }
      combinations = combinations.filter((item) => !seenPrompts.has(item.prompt));
      if (combinations.length === 0) break;
      combinations.forEach((item) => seenPrompts.add(item.prompt));
      try {
        const quote = await window.naiDesktop.quoteAnlas({
          feature: "generate",
          params: fixedParams,
          extras,
          batchCount: combinations.length + (!iterate && roundOffset === 0 ? 1 : 0),
        });
        setMessage(quote.ok && quote.amount !== undefined
          ? interpolate(text.quote, { amount: quote.amount })
          : interpolate(text.quoteFail, { message: quote.message }));
      } catch (error: any) {
        setMessage(interpolate(text.quoteFail, { message: error?.message ?? String(error) }));
      }
      if (!iterate && roundOffset === 0 && !cancelRef.current) {
        try {
          const generated = await window.naiDesktop.generate(
            fixedParams,
            extras,
          );
          const image = generated.items[0];
          if (!generated.ok || !image) throw new Error(generated.message);
          const scored = await window.naiDesktop.artistLabScoreImages(
            session.modelMode,
            session.target!.filePath,
            image.filePath,
          );
          baseline = { image, score: scored.similarity };
        } catch (error: any) {
          baseline = { error: error?.message ?? String(error) };
        }
        setSession((state) => ({ ...state, baseline }));
      }
      let roundResults: LabResult[] = combinations.map((item, index) => ({
        ...item,
        id: `round-${round}:${item.id}`,
        sequence: accumulated.length + index + 1,
        round,
        status: "pending",
      }));
      accumulated = [...accumulated, ...roundResults];
      setSession((state) => ({ ...state, results: accumulated }));

      const updateResult = (id: string, update: Partial<LabResult>) => {
        roundResults = roundResults.map((item) => item.id === id ? { ...item, ...update } : item);
        accumulated = accumulated.map((item) => item.id === id ? { ...item, ...update } : item);
        setSession((state) => ({ ...state, results: accumulated }));
      };

      for (const current of roundResults) {
        if (cancelRef.current) break;
        updateResult(current.id, { status: "generating" });
        try {
          const generated = await window.naiDesktop.generate(
            { ...fixedParams, stylePrompt: [session.sharedStylePrompt.trim(), current.prompt].filter(Boolean).join(", ") },
            extras,
          );
          const image = generated.items[0];
          if (!generated.ok || !image) throw new Error(generated.message);
          let score: number | undefined;
          if (session.target) {
            updateResult(current.id, { image, status: "scoring" });
            const scored = await window.naiDesktop.artistLabScoreImages(session.modelMode, session.target.filePath, image.filePath);
            score = scored.similarity;
          }
          updateResult(current.id, {
            image,
            score,
            delta: score !== undefined && baseline?.score !== undefined ? score - baseline.score : undefined,
            status: "done",
          });
        } catch (error: any) {
          updateResult(current.id, { status: "failed", error: error?.message ?? String(error) });
        }
      }
    }
    setRunning(false);
    await Promise.allSettled([refreshAccount(), refreshHistory()]);
    setModelStatus(await window.naiDesktop.artistLabModelStatus(session.modelMode));
    if (!cancelRef.current) setMessage(text.complete);
  };

  const stop = () => {
    cancelRef.current = true;
    void window.naiDesktop.cancel();
    setRunning(false);
  };

  const ranked = [...session.results].sort((left, right) => {
    if (session.sortMode === "sequence") return left.sequence - right.sequence;
    if (left.status !== "done" && right.status === "done") return 1;
    if (left.status === "done" && right.status !== "done") return -1;
    return Number(right.liked) - Number(left.liked) || (right.score ?? 0) - (left.score ?? 0);
  });
  const done = session.results.filter((item) => item.status === "done" || item.status === "failed").length;
  const contributions = session.results
    .filter((item) => item.status === "done" && item.tags.length === 1 && item.delta !== undefined)
    .sort((left, right) => (right.delta ?? 0) - (left.delta ?? 0));

  return (
    <main className="artist-lab">
      <header className="artist-lab-hero">
        <div><span className="eyebrow">{text.eyebrow}</span><h2>{text.title}</h2><p>{text.subtitle}</p></div>
        <Button onClick={onBack}>{text.back}</Button>
      </header>

      <section className="artist-lab-config-grid">
        <article className="artist-lab-panel target-panel">
          <h3>{text.target}</h3>
          {session.target ? <img src={session.target.fileUrl} alt={session.target.name} /> : <div className="artist-target-empty">◎</div>}
          <Button onClick={() => void chooseTarget()}>{session.target ? text.change : text.choose}</Button>
          <small>{text.targetHint}</small>
        </article>
        <article className="artist-lab-panel artist-lab-controls">
          <label><span>{text.model}</span><select value={session.modelMode} onChange={(event) => patchExperiment({ modelMode: event.target.value as ArtistLabModelMode })}><option value="high">{text.high}</option><option value="light">{text.light}</option></select></label>
          <small>{text.modelHint}</small>
          <div className="artist-model-cache"><span>{text.cache}: {modelStatus ? `${formatBytes(modelStatus.cachedBytes)} · ${modelStatus.cachedFiles}` : "—"}</span><Button variant="ghost" onClick={async () => setModelStatus(await window.naiDesktop.artistLabClearModels())}>{text.clearCache}</Button></div>
          <label><span>{text.prompt}</span><textarea value={session.basePrompt} onChange={(event) => patchExperiment({ basePrompt: event.target.value })} /></label>
          <small>{text.promptHint}</small>
          <label><span>{sharedStyleText.label}</span><textarea value={session.sharedStylePrompt} onChange={(event) => patchExperiment({ sharedStylePrompt: event.target.value })} /></label>
          <small>{sharedStyleText.hint}</small>
          <div className="artist-run-options"><label><span>{text.count}</span><input type="number" min={1} max={40} value={session.count} onChange={(event) => patch({ count: Math.max(1, Math.min(40, Number(event.target.value) || 1)) })} /></label><label><span>{text.seed}</span><input type="number" min={0} value={session.seed} onChange={(event) => patchExperiment({ seed: Math.max(0, Math.floor(Number(event.target.value) || 0)) })} /></label><label><span>{text.rounds}</span><input type="number" min={1} max={5} disabled={session.mode !== "match"} value={session.mode === "match" ? session.autoRounds : 1} onChange={(event) => patch({ autoRounds: Math.max(1, Math.min(5, Number(event.target.value) || 1)) })} /></label></div>
          <small>{text.roundsHint}</small>
        </article>
      </section>

      <section className="artist-lab-panel artist-browser">
        <div className="artist-browser-heading"><div><h3>{text.search}</h3><small>{text.selectedHint}</small></div><div className="artist-search-row"><input value={session.search} placeholder={text.searchPlaceholder} onChange={(event) => patch({ search: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") void searchArtists(); }} /><Button onClick={() => void searchArtists()} disabled={searching}>{searching ? text.searching : text.searchButton}</Button></div></div>
        <div className="artist-selected"><strong>{text.selected}</strong>{session.selectedArtists.length === 0 ? <span>{text.noArtists}</span> : session.selectedArtists.map((name) => <button key={name} type="button" onClick={() => toggleArtist(name)}>{name} ×</button>)}</div>
        {artists.length > 0 && <div className="artist-tag-results">{artists.map((artist) => <button type="button" key={artist.id} className={session.selectedArtists.includes(artist.name) ? "selected" : ""} onClick={() => toggleArtist(artist.name)}><b>{artist.name}</b><span>{artist.postCount.toLocaleString()}</span></button>)}</div>}
      </section>

      <section className="artist-lab-panel artist-queue-panel">
        <div className="artist-section-heading"><div><h3>{text.queue}</h3><small>{text.queueHint}</small></div><b>{plannedCombinations.length}</b></div>
        {plannedCombinations.length === 0 ? <div className="artist-queue-empty">{text.emptyQueue}</div> : <ol className="artist-combination-queue">{plannedCombinations.map((item, index) => <li key={item.id}><span>#{String(index + 1).padStart(2, "0")}</span><code>{item.prompt}</code></li>)}</ol>}
      </section>

      <section className="artist-lab-actions">
        {running ? <Button variant="danger" onClick={stop}>{text.stop}</Button> : <Button variant="primary" onClick={() => void runRound(false)}>{text.start}</Button>}
        <Button disabled={running || !session.results.some((item) => item.status === "done")} onClick={() => void runRound(true)}>{text.iterate}</Button>
        <span>{running ? interpolate(text.running, { done, total: session.results.length }) : message}</span>
      </section>

      {session.baseline && <section className="artist-lab-panel artist-baseline-panel">
        <div className="artist-section-heading"><div><h3>{contributionText.baseline}</h3><small>{contributionText.baselineHint}</small></div>{session.baseline.score !== undefined && <b>{text.score} {(session.baseline.score * 100).toFixed(1)}%</b>}</div>
        {session.baseline.error
          ? <p className="artist-error">{contributionText.baselineFailed}<br />{session.baseline.error}</p>
          : session.baseline.image && <div className="artist-baseline-content"><img src={session.baseline.image.fileUrl} alt={contributionText.baseline} /><div><strong>{contributionText.baseline}</strong><p>{contributionText.baselineHint}</p></div></div>}
      </section>}

      {contributions.length > 0 && <section className="artist-lab-panel artist-contribution-panel">
        <div className="artist-section-heading"><div><h3>{contributionText.contribution}</h3><small>{contributionText.contributionHint}</small></div><b>{contributions.length}</b></div>
        <div className="artist-contribution-list">{contributions.map((result) => <article key={`contribution-${result.id}`}>
          {result.image && <img src={result.image.fileUrl} alt={result.tags[0].name} />}
          <div><strong>{result.tags[0].name}</strong><span>{text.score} {((result.score ?? 0) * 100).toFixed(1)}%</span></div>
          <b className={(result.delta ?? 0) >= 0 ? "positive" : "negative"}>{(result.delta ?? 0) >= 0 ? "+" : ""}{((result.delta ?? 0) * 100).toFixed(1)}% · {(result.delta ?? 0) >= 0 ? contributionText.improved : contributionText.reduced}</b>
        </article>)}</div>
      </section>}

      {ranked.length > 0 && <section className="artist-gallery-section"><div className="artist-gallery-heading"><div><h3>{text.gallery}</h3><small>{text.galleryHint}</small></div><div className="artist-sort-toggle"><button type="button" className={session.sortMode === "sequence" ? "active" : ""} onClick={() => patch({ sortMode: "sequence" })}>{text.sequenceOrder}</button><button type="button" className={session.sortMode === "score" ? "active" : ""} onClick={() => patch({ sortMode: "score" })}>{text.scoreOrder}</button></div></div><div className="artist-candidate-grid">{ranked.map((result) => <article key={result.id} className={`artist-candidate ${result.status}`}>
        <header className="artist-candidate-header"><b>#{String(result.sequence).padStart(2, "0")} · {text.round} {result.round}</b><span>{text[result.status]}</span></header>
        <div className="artist-candidate-media">{result.image ? <img src={result.image.fileUrl} alt={result.prompt} /> : <div className="artist-candidate-placeholder">{text[result.status]}</div>}{result.score !== undefined && <b className="artist-score">{text.score} {(result.score * 100).toFixed(1)}%{result.delta !== undefined ? ` · ${result.delta >= 0 ? "+" : ""}${(result.delta * 100).toFixed(1)}%` : ""}</b>}</div>
        <div className="artist-string-block"><span>{text.artistString}</span><button type="button" onClick={() => { void navigator.clipboard.writeText(result.prompt); setMessage(text.copied); }}>{text.copy}</button><code>{result.prompt}</code></div>
        {result.error && <small className="artist-error">{result.error}</small>}
        <div className="artist-candidate-actions"><Button variant="ghost" onClick={() => setSession((state) => ({ ...state, results: state.results.map((item) => item.id === result.id ? { ...item, liked: !item.liked } : item) }))}>{result.liked ? text.unlike : text.like}</Button><Button variant="primary" disabled={result.status !== "done"} onClick={() => { applyParams({ stylePrompt: [session.sharedStylePrompt.trim(), result.prompt].filter(Boolean).join(", ") }); setMessage(text.applied); }}>{text.apply}</Button></div>
      </article>)}</div></section>}
    </main>
  );
}

type ArtistLabScreen = "home" | "reverse" | "random";
const SCREEN_KEY = "langbai.artist-lab.screen.v2";

export default function ArtistLab({ onBack }: { onBack: () => void }) {
  const language = useAppStore((state) => state.settings?.language ?? "zh-CN");
  const [screen, setScreen] = useState<ArtistLabScreen>(() => {
    const saved = localStorage.getItem(SCREEN_KEY);
    return saved === "reverse" || saved === "random" ? saved : "home";
  });
  const open = (next: ArtistLabScreen) => {
    localStorage.setItem(SCREEN_KEY, next);
    setScreen(next);
  };
  if (screen === "reverse") return <TargetArtistLab onBack={() => open("home")} />;
  if (screen === "random") return <RandomArtistLab onBack={() => open("home")} />;
  const text = HOME_TEXT[language];
  return <main className="artist-lab artist-lab-home">
    <header className="artist-lab-hero"><div><span className="eyebrow">{text.eyebrow}</span><h2>{text.title}</h2><p>{text.subtitle}</p></div><Button onClick={onBack}>{text.back}</Button></header>
    <section className="artist-lab-mode-grid">
      <button type="button" className="artist-lab-mode-card reverse" onClick={() => open("reverse")}><span className="artist-mode-icon">◎</span><div><h3>{text.reverse}</h3><p>{text.reverseDesc}</p><b>{text.enter} →</b></div></button>
      <button type="button" className="artist-lab-mode-card random" onClick={() => open("random")}><span className="artist-mode-icon">⌘</span><div><h3>{text.random}</h3><p>{text.randomDesc}</p><b>{text.enter} →</b></div></button>
    </section>
  </main>;
}
