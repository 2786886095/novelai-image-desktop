import { useEffect, useRef, useState } from "react";
import { useAppStore } from "./store";
import { Button } from "./components/ui";
import { Icon } from "./components/icons";
import {
  createArtistLabRandom,
  normalizeArtistProgress,
  shouldResetArtistSearch,
  type ArtistLabModelMode,
  type ArtistLabModelStatus,
  type ArtistReferenceMatch,
} from "./artist-lab";
import { generatePopularArtistRecipes, type GeneratedArtistRecipe } from "./artist-recipe";
import type { AppLanguage, HistoryItem } from "./types";
import RandomArtistLab from "./RandomArtistLab";

type TargetImage = { filePath: string; fileUrl: string; name: string };
type LabResult = GeneratedArtistRecipe & {
  sequence: number;
  round: number;
  status: "pending" | "generating" | "scoring" | "done" | "failed";
  image?: HistoryItem;
  similarity?: number;
  progress?: number;
  error?: string;
};
type Session = {
  modelMode: ArtistLabModelMode;
  target: TargetImage | null;
  basePrompt: string;
  sharedStylePrompt: string;
  batchSize: number;
  seed: number;
  targetProgress: number;
  stagnantLimit: number;
  minImprovement: number;
  scanCount: number;
  shortlist: number;
  discoveryOffset: number;
  matches: ArtistReferenceMatch[];
  baseline?: { image?: HistoryItem; similarity?: number; error?: string };
  bestProgress: number;
  round: number;
  resetCount: number;
  results: LabResult[];
};

const STORAGE_KEY = "langbai.artist-lab.target.v3";
let sessionCache: Session | null = null;

const TEXT = {
  "zh-CN": { title: "目标画风自动迭代", subtitle: "以无画师基线为 0%、目标图为 100%，只变异画师标签与权重，达到目标或手动停止。", back: "返回画风实验室", target: "目标图片", choose: "选择图片", change: "更换图片", local: "目标图与评分都留在本机；只会从 Danbooru 缓存公开代表缩略图。", model: "评分模型", high: "高精度 DINOv2 Base（默认）", light: "轻量 DINOv2 Small", cache: "模型缓存", clear: "清除模型缓存", prompt: "固定内容提示词", reverse: "AI 反推内容", reversing: "正在反推…", fixedStyle: "固定辅助风格词（可选）", batch: "每轮候选数", seed: "固定 Seed", goal: "停止目标", advanced: "高级迭代设置", stagnant: "连续无明显提升轮数", improvement: "最低明显提升（百分点）", scan: "每次预筛画师数", shortlist: "保留相似画师数", start: "开始自动迭代", stop: "停止", needTarget: "请先选择目标图片。", needPrompt: "请填写或反推固定内容提示词。", baseline: "无画师基线", discovering: "正在下载/读取代表缩略图并预筛画师…", running: "第 {round} 轮 · {done}/{total} · 当前最佳 {best}%", reached: "已达到目标：{best}%", stopped: "任务已停止。", failedRound: "本轮没有成功图片，已停止以避免无限重试。", reset: "连续 {count} 轮无明显提升，已重洗画师池并扩展候选。", matches: "当前相似画师候选", progress: "相对进度", raw: "原始相似度", apply: "应用到生成", copy: "复制", copied: "已复制画师串。", applied: "已应用到生成页。", pending: "等待", generating: "生成中", scoring: "评分中", done: "已完成", failed: "失败", round: "轮次", best: "最佳", reverseFail: "反推失败：{message}" },
  "zh-TW": { title: "目標畫風自動迭代", subtitle: "以無畫師基線為 0%、目標圖為 100%，只變動畫師標籤與權重。", back: "返回畫風實驗室", target: "目標圖片", choose: "選擇圖片", change: "更換圖片", local: "目標圖與評分留在本機；只快取 Danbooru 公開縮圖。", model: "評分模型", high: "高精度 DINOv2 Base（預設）", light: "輕量 DINOv2 Small", cache: "模型快取", clear: "清除模型快取", prompt: "固定內容提示詞", reverse: "AI 反推內容", reversing: "正在反推…", fixedStyle: "固定輔助畫風詞（選填）", batch: "每輪候選數", seed: "固定 Seed", goal: "停止目標", advanced: "進階迭代設定", stagnant: "連續無明顯提升輪數", improvement: "最低明顯提升（百分點）", scan: "每次預篩畫師數", shortlist: "保留相似畫師數", start: "開始自動迭代", stop: "停止", needTarget: "請先選擇目標圖片。", needPrompt: "請填寫或反推固定內容提示詞。", baseline: "無畫師基線", discovering: "正在預篩相似畫師…", running: "第 {round} 輪 · {done}/{total} · 最佳 {best}%", reached: "已達目標：{best}%", stopped: "任務已停止。", failedRound: "本輪沒有成功圖片，已停止。", reset: "連續 {count} 輪無提升，已重洗並擴展候選。", matches: "目前相似畫師", progress: "相對進度", raw: "原始相似度", apply: "套用到生成", copy: "複製", copied: "已複製。", applied: "已套用到生成頁。", pending: "等待", generating: "生成中", scoring: "評分中", done: "完成", failed: "失敗", round: "輪次", best: "最佳", reverseFail: "反推失敗：{message}" },
  "en-US": { title: "Automatic Target-style Search", subtitle: "No-artist baseline is 0%, the target image is 100%; only artist tags and weights mutate.", back: "Back to Artist Lab", target: "Target image", choose: "Choose image", change: "Change image", local: "Target and scoring stay local. Only public Danbooru thumbnails are cached.", model: "Scoring model", high: "High accuracy DINOv2 Base (default)", light: "Light DINOv2 Small", cache: "Model cache", clear: "Clear model cache", prompt: "Fixed content prompt", reverse: "Reverse content with AI", reversing: "Reversing…", fixedStyle: "Fixed auxiliary style terms (optional)", batch: "Candidates per round", seed: "Fixed seed", goal: "Stop target", advanced: "Advanced iteration", stagnant: "Stagnant rounds before reset", improvement: "Minimum improvement (points)", scan: "Artists scanned per expansion", shortlist: "Similar artists retained", start: "Start automatic search", stop: "Stop", needTarget: "Choose a target image first.", needPrompt: "Enter or reverse a fixed content prompt.", baseline: "No-artist baseline", discovering: "Caching thumbnails and prefiltering artists…", running: "Round {round} · {done}/{total} · best {best}%", reached: "Target reached: {best}%", stopped: "Task stopped.", failedRound: "No image succeeded this round; stopped to avoid endless retries.", reset: "No meaningful gain for {count} rounds; pool reshuffled and expanded.", matches: "Current similar artists", progress: "Relative progress", raw: "Raw similarity", apply: "Apply to Generate", copy: "Copy", copied: "Artist string copied.", applied: "Applied to Generate.", pending: "Pending", generating: "Generating", scoring: "Scoring", done: "Complete", failed: "Failed", round: "Round", best: "Best", reverseFail: "Reverse failed: {message}" },
  "ja-JP": { title: "目標画風の自動探索", subtitle: "画家なしを0%、目標画像を100%として画家タグと重みだけを変異します。", back: "画風ラボへ戻る", target: "目標画像", choose: "画像を選択", change: "画像を変更", local: "目標と採点は端末内。公開 Danbooru 縮小画像だけをキャッシュします。", model: "採点モデル", high: "高精度 DINOv2 Base（既定）", light: "軽量 DINOv2 Small", cache: "モデルキャッシュ", clear: "キャッシュ削除", prompt: "固定内容プロンプト", reverse: "AIで内容を逆引き", reversing: "逆引き中…", fixedStyle: "固定補助画風語（任意）", batch: "1ラウンドの候補数", seed: "固定 Seed", goal: "停止目標", advanced: "高度な反復設定", stagnant: "リセットまでの停滞回数", improvement: "最低改善ポイント", scan: "拡張ごとの調査数", shortlist: "保持する類似画家", start: "自動探索開始", stop: "停止", needTarget: "目標画像を選択してください。", needPrompt: "固定内容を入力または逆引きしてください。", baseline: "画家なし基準", discovering: "類似画家を事前選別中…", running: "第 {round} 回 · {done}/{total} · 最高 {best}%", reached: "目標到達：{best}%", stopped: "停止しました。", failedRound: "成功画像がないため停止しました。", reset: "{count}回改善せず、候補を拡張・再構成しました。", matches: "現在の類似画家", progress: "相対進捗", raw: "元の類似度", apply: "生成へ適用", copy: "コピー", copied: "コピーしました。", applied: "生成へ適用しました。", pending: "待機", generating: "生成中", scoring: "採点中", done: "完了", failed: "失敗", round: "回", best: "最高", reverseFail: "逆引き失敗：{message}" },
  "ko-KR": { title: "목표 화풍 자동 탐색", subtitle: "작가 없는 기준을 0%, 목표를 100%로 두고 작가 태그와 가중치만 변이합니다.", back: "화풍 실험실로", target: "목표 이미지", choose: "이미지 선택", change: "이미지 변경", local: "목표와 평가는 기기 안에 남고 공개 Danbooru 썸네일만 캐시합니다.", model: "평가 모델", high: "고정밀 DINOv2 Base (기본)", light: "경량 DINOv2 Small", cache: "모델 캐시", clear: "캐시 삭제", prompt: "고정 내용 프롬프트", reverse: "AI 내용 역추론", reversing: "역추론 중…", fixedStyle: "고정 보조 화풍 용어 (선택)", batch: "라운드당 후보", seed: "고정 Seed", goal: "중지 목표", advanced: "고급 반복 설정", stagnant: "리셋 전 정체 라운드", improvement: "최소 개선 포인트", scan: "확장당 탐색 작가", shortlist: "유사 작가 유지 수", start: "자동 탐색 시작", stop: "중지", needTarget: "목표 이미지를 선택하세요.", needPrompt: "고정 내용을 입력하거나 역추론하세요.", baseline: "작가 없는 기준", discovering: "유사 작가를 사전 선별 중…", running: "{round}라운드 · {done}/{total} · 최고 {best}%", reached: "목표 도달: {best}%", stopped: "작업을 중지했습니다.", failedRound: "성공 이미지가 없어 중지했습니다.", reset: "{count}라운드 개선이 없어 풀을 확장했습니다.", matches: "현재 유사 작가", progress: "상대 진행", raw: "원시 유사도", apply: "생성에 적용", copy: "복사", copied: "복사했습니다.", applied: "생성 화면에 적용했습니다.", pending: "대기", generating: "생성 중", scoring: "평가 중", done: "완료", failed: "실패", round: "라운드", best: "최고", reverseFail: "역추론 실패: {message}" },
} satisfies Record<AppLanguage, Record<string, string>>;

const HOME = {
  "zh-CN": { title: "画风实验室", subtitle: "目标图自动迭代与随机画师串抽卡是两条独立流程。", back: "返回工具", target: "目标图自动迭代", targetDesc: "本机模型筛选和评分，自动扩展相似画师并迭代到目标。", random: "随机画师串抽卡", randomDesc: "每批重新随机画师与权重，由你选择喜欢的组合。", enter: "进入" },
  "zh-TW": { title: "畫風實驗室", subtitle: "目標圖自動迭代與隨機畫師串抽卡是兩條獨立流程。", back: "返回工具", target: "目標圖自動迭代", targetDesc: "本機模型篩選與評分，迭代至目標。", random: "隨機畫師串抽卡", randomDesc: "每批重新組合畫師與權重。", enter: "進入" },
  "en-US": { title: "Artist Style Lab", subtitle: "Automatic target matching and random artist-string gacha are separate workflows.", back: "Back to Tools", target: "Automatic target matching", targetDesc: "Local scoring prefilters artists and iterates until the target is reached.", random: "Random artist-string gacha", randomDesc: "Reroll artists and weights every batch, then choose what you like.", enter: "Open" },
  "ja-JP": { title: "画風ラボ", subtitle: "目標自動探索とランダム抽選は独立した機能です。", back: "ツールへ戻る", target: "目標画風の自動探索", targetDesc: "端末内で候補選別・採点し、目標まで反復します。", random: "ランダム画家タグ抽選", randomDesc: "バッチごとに画家と重みを再抽選します。", enter: "開く" },
  "ko-KR": { title: "화풍 실험실", subtitle: "목표 자동 탐색과 무작위 작가 뽑기는 별도 흐름입니다.", back: "도구로", target: "목표 화풍 자동 탐색", targetDesc: "로컬 평가로 후보를 선별하고 목표까지 반복합니다.", random: "무작위 작가 조합 뽑기", randomDesc: "배치마다 작가와 가중치를 다시 뽑습니다.", enter: "열기" },
} satisfies Record<AppLanguage, Record<string, string>>;

function restore(basePrompt: string): Session {
  if (sessionCache) return sessionCache;
  const fallback: Session = { modelMode: "high", target: null, basePrompt, sharedStylePrompt: "", batchSize: 8, seed: 246813579, targetProgress: 85, stagnantLimit: 2, minImprovement: 2, scanCount: 40, shortlist: 20, discoveryOffset: 0, matches: [], bestProgress: 0, round: 0, resetCount: 0, results: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Session> | null;
    sessionCache = { ...fallback, ...raw, modelMode: raw?.modelMode === "light" ? "light" : "high", target: raw?.target ?? null, results: Array.isArray(raw?.results) ? raw.results : [], matches: Array.isArray(raw?.matches) ? raw.matches : [] };
  } catch { sessionCache = fallback; }
  return sessionCache;
}

function interpolate(value: string, values: Record<string, unknown>) {
  return Object.entries(values).reduce((out, [key, replacement]) => out.replaceAll(`{${key}}`, String(replacement)), value);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function TargetArtistLab({ onBack }: { onBack: () => void }) {
  const language = useAppStore((state) => state.settings?.language ?? "zh-CN");
  const params = useAppStore((state) => state.params);
  const applyParams = useAppStore((state) => state.applyParams);
  const refreshAccount = useAppStore((state) => state.refreshAccount);
  const refreshHistory = useAppStore((state) => state.refreshHistory);
  const text = TEXT[language];
  const [session, setSession] = useState(() => restore(params.positivePrompt));
  const [running, setRunning] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [message, setMessage] = useState("");
  const [modelStatus, setModelStatus] = useState<ArtistLabModelStatus | null>(null);
  const cancelRef = useRef(false);
  const patch = (next: Partial<Session>) => setSession((current) => ({ ...current, ...next }));

  useEffect(() => { sessionCache = session; localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); }, [session]);
  useEffect(() => { void window.naiDesktop.artistLabModelStatus(session.modelMode).then(setModelStatus); }, [session.modelMode]);

  const chooseTarget = async () => {
    const target = await window.naiDesktop.artistLabPickTarget();
    if (target) patch({ target, baseline: undefined, results: [], matches: [], discoveryOffset: 0, bestProgress: 0, round: 0, resetCount: 0 });
  };

  const reverseContent = async () => {
    if (!session.target) return setMessage(text.needTarget);
    setReversing(true);
    try {
      const response = await fetch(session.target.fileUrl);
      const result = await window.naiDesktop.reversePrompt(bytesToBase64(new Uint8Array(await response.arrayBuffer())), "tags", "full", "只提取主体、构图、环境与动作；不要输出 artist 标签、画师名或纯画风词。", false);
      if (!result.ok || !result.prompt) throw new Error(result.message);
      patch({ basePrompt: result.prompt });
      setMessage("");
    } catch (error: any) { setMessage(interpolate(text.reverseFail, { message: error?.message ?? String(error) })); }
    finally { setReversing(false); }
  };

  const updateResult = (id: string, update: Partial<LabResult>) => setSession((current) => ({ ...current, results: current.results.map((item) => item.id === id ? { ...item, ...update } : item) }));

  const start = async () => {
    if (!session.target) return setMessage(text.needTarget);
    if (!session.basePrompt.trim()) return setMessage(text.needPrompt);
    setRunning(true);
    cancelRef.current = false;
    let accumulated: LabResult[] = [];
    let matches: ArtistReferenceMatch[] = [];
    let offset = 0;
    let bestProgress = 0;
    let stagnant = 0;
    let round = 0;
    let resetCount = 0;
    const fixedParams = { ...params, positivePrompt: session.basePrompt.trim(), stylePrompt: session.sharedStylePrompt.trim(), width: 512, height: 512, seedMode: "fixed" as const, seed: session.seed, qualityToggle: false };
    const extras = { vibeImages: [], charCaptions: [], preciseReferences: [] };
    patch({ results: [], baseline: undefined, matches: [], discoveryOffset: 0, bestProgress: 0, round: 0, resetCount: 0 });
    let baselineSimilarity = 0;
    try {
      setMessage(text.baseline);
      const generated = await window.naiDesktop.generateArtistLab(fixedParams, extras, "target");
      const image = generated.items[0];
      if (!generated.ok || !image) throw new Error(generated.message);
      baselineSimilarity = (await window.naiDesktop.artistLabScoreImages(session.modelMode, session.target.filePath, image.filePath)).similarity;
      patch({ baseline: { image, similarity: baselineSimilarity } });
    } catch (error: any) {
      patch({ baseline: { error: error?.message ?? String(error) } });
      setRunning(false);
      return;
    }

    while (!cancelRef.current && bestProgress < session.targetProgress) {
      if (matches.length === 0 || shouldResetArtistSearch(stagnant, session.stagnantLimit)) {
        if (matches.length > 0) {
          resetCount += 1;
          setMessage(interpolate(text.reset, { count: stagnant }));
        } else setMessage(text.discovering);
        let discovered;
        try {
          discovered = await window.naiDesktop.artistLabDiscoverSimilar(session.modelMode, session.target.filePath, offset, session.scanCount, session.shortlist, false);
        } catch (error: any) {
          setMessage(error?.message ?? String(error));
          break;
        }
        offset = discovered.nextOffset;
        matches = discovered.matches;
        stagnant = 0;
        patch({ matches, discoveryOffset: offset, resetCount });
        if (matches.length === 0) break;
      }
      round += 1;
      const previousBest = bestProgress;
      const favorites = accumulated.filter((item) => item.status === "done").sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0)).slice(0, Math.max(2, Math.ceil(session.batchSize / 4))).flatMap((item) => item.artists.map((artist) => artist.name));
      const pool = matches.map((match, index) => ({ ...match.artist, postCount: Math.max(match.artist.postCount, Math.round((matches.length - index) ** 3)) }));
      const recipes = generatePopularArtistRecipes(pool, { count: session.batchSize, minArtists: Math.min(2, pool.length), maxArtists: Math.min(10, pool.length), auxiliaryPrompt: "", mutateAuxiliary: false, favoriteArtists: favorites, random: createArtistLabRandom((session.seed + round * 2654435761 + resetCount * 97) >>> 0) });
      let currentRound = recipes.map((recipe, index): LabResult => ({ ...recipe, id: `round-${round}-${recipe.id}`, sequence: accumulated.length + index + 1, round, status: "pending" }));
      accumulated = [...accumulated, ...currentRound];
      setSession((current) => ({ ...current, results: accumulated, round }));
      let successes = 0;
      for (const current of currentRound) {
        if (cancelRef.current) break;
        updateResult(current.id, { status: "generating" });
        try {
          const generated = await window.naiDesktop.generateArtistLab({ ...fixedParams, stylePrompt: [session.sharedStylePrompt.trim(), current.prompt].filter(Boolean).join(", ") }, extras, "target");
          const image = generated.items[0];
          if (!generated.ok || !image) throw new Error(generated.message);
          updateResult(current.id, { image, status: "scoring" });
          const similarity = (await window.naiDesktop.artistLabScoreImages(session.modelMode, session.target.filePath, image.filePath)).similarity;
          const progress = normalizeArtistProgress(baselineSimilarity, similarity);
          bestProgress = Math.max(bestProgress, progress);
          successes += 1;
          currentRound = currentRound.map((item) => item.id === current.id ? { ...item, image, similarity, progress, status: "done" } : item);
          accumulated = accumulated.map((item) => item.id === current.id ? { ...item, image, similarity, progress, status: "done" } : item);
          setSession((state) => ({ ...state, results: accumulated, bestProgress }));
          setMessage(interpolate(text.running, { round, done: successes, total: currentRound.length, best: bestProgress.toFixed(1) }));
          if (bestProgress >= session.targetProgress) break;
        } catch (error: any) {
          const update = { status: "failed" as const, error: error?.message ?? String(error) };
          currentRound = currentRound.map((item) => item.id === current.id ? { ...item, ...update } : item);
          accumulated = accumulated.map((item) => item.id === current.id ? { ...item, ...update } : item);
          setSession((state) => ({ ...state, results: accumulated }));
        }
      }
      if (successes === 0 && !cancelRef.current) { setMessage(text.failedRound); break; }
      const improvement = bestProgress - previousBest;
      stagnant = improvement < session.minImprovement ? stagnant + 1 : 0;
    }
    setRunning(false);
    await Promise.allSettled([refreshAccount(), refreshHistory()]);
    setModelStatus(await window.naiDesktop.artistLabModelStatus(session.modelMode));
    if (cancelRef.current) setMessage(text.stopped);
    else if (bestProgress >= session.targetProgress) setMessage(interpolate(text.reached, { best: bestProgress.toFixed(1) }));
  };

  const ranked = [...session.results].sort((a, b) => (b.progress ?? -1) - (a.progress ?? -1));
  return <main className="artist-lab target-artist-lab">
    <header className="artist-lab-hero"><div><h2>{text.title}</h2><p>{text.subtitle}</p></div><Button onClick={onBack}>{text.back}</Button></header>
    <section className="artist-lab-config-grid">
      <article className="artist-lab-panel target-panel"><h3>{text.target}</h3>{session.target ? <img src={session.target.fileUrl} alt={session.target.name} /> : <div className="artist-target-empty"><Icon name="scan" /></div>}<Button onClick={() => void chooseTarget()}>{session.target ? text.change : text.choose}</Button><small>{text.local}</small></article>
      <article className="artist-lab-panel artist-lab-controls">
        <label><span>{text.model}</span><select value={session.modelMode} onChange={(event) => patch({ modelMode: event.target.value as ArtistLabModelMode })}><option value="high">{text.high}</option><option value="light">{text.light}</option></select></label>
        <div className="artist-model-cache"><span>{text.cache}: {modelStatus ? `${formatBytes(modelStatus.cachedBytes)} · ${modelStatus.cachedFiles}` : "—"}</span><Button variant="ghost" onClick={async () => setModelStatus(await window.naiDesktop.artistLabClearModels())}>{text.clear}</Button></div>
        <label><span>{text.prompt}</span><textarea value={session.basePrompt} onChange={(event) => patch({ basePrompt: event.target.value })} /></label><Button onClick={() => void reverseContent()} disabled={!session.target || reversing}>{reversing ? text.reversing : text.reverse}</Button>
        <label><span>{text.fixedStyle}</span><textarea value={session.sharedStylePrompt} onChange={(event) => patch({ sharedStylePrompt: event.target.value })} /></label>
        <div className="artist-run-options"><label><span>{text.batch}</span><input type="number" min={1} max={40} value={session.batchSize} onChange={(event) => patch({ batchSize: Math.max(1, Math.min(40, Number(event.target.value) || 1)) })} /></label><label><span>{text.seed}</span><input type="number" min={0} value={session.seed} onChange={(event) => patch({ seed: Math.max(0, Math.floor(Number(event.target.value) || 0)) })} /></label><label><span>{text.goal}</span><input type="number" min={1} max={100} value={session.targetProgress} onChange={(event) => patch({ targetProgress: Math.max(1, Math.min(100, Number(event.target.value) || 85)) })} /></label></div>
        <details className="artist-lab-advanced"><summary>{text.advanced}</summary><div className="artist-run-options"><label><span>{text.stagnant}</span><input type="number" min={1} value={session.stagnantLimit} onChange={(event) => patch({ stagnantLimit: Math.max(1, Math.floor(Number(event.target.value) || 2)) })} /></label><label><span>{text.improvement}</span><input type="number" min={0.1} step={0.1} value={session.minImprovement} onChange={(event) => patch({ minImprovement: Math.max(0.1, Number(event.target.value) || 2) })} /></label><label><span>{text.scan}</span><input type="number" min={10} max={120} value={session.scanCount} onChange={(event) => patch({ scanCount: Math.max(10, Math.min(120, Number(event.target.value) || 40)) })} /></label><label><span>{text.shortlist}</span><input type="number" min={4} max={120} value={session.shortlist} onChange={(event) => patch({ shortlist: Math.max(4, Math.min(120, Number(event.target.value) || 20)) })} /></label></div></details>
      </article>
    </section>
    <section className="artist-lab-actions">{running ? <Button variant="danger" onClick={() => { cancelRef.current = true; void window.naiDesktop.cancel(); }}>{text.stop}</Button> : <Button variant="primary" onClick={() => void start()}>{text.start}</Button>}<span>{message}</span></section>
    {session.baseline && <section className="artist-lab-panel artist-baseline-panel"><div className="artist-section-heading"><h3>{text.baseline}</h3>{session.baseline.similarity !== undefined && <b>{text.raw} {(session.baseline.similarity * 100).toFixed(1)}%</b>}</div>{session.baseline.image && <div className="artist-baseline-content"><img src={session.baseline.image.fileUrl} alt={text.baseline} /></div>}{session.baseline.error && <p className="artist-error">{session.baseline.error}</p>}</section>}
    {session.matches.length > 0 && <section className="artist-lab-panel"><div className="artist-section-heading"><h3>{text.matches}</h3><b>{session.matches.length}</b></div><div className="artist-reference-grid">{session.matches.map((match) => <article key={match.artist.id}><img src={match.referenceUrl} alt={match.artist.name} /><b>{match.artist.name}</b><span>{(match.similarity * 100).toFixed(1)}%</span></article>)}</div></section>}
    {ranked.length > 0 && <section className="artist-gallery-section"><div className="artist-gallery-heading"><h3>{text.best}: {session.bestProgress.toFixed(1)}% / {session.targetProgress}%</h3></div><div className="artist-candidate-grid">{ranked.map((result) => <article key={result.id} className={`artist-candidate ${result.status}`}><header className="artist-candidate-header"><b>#{result.sequence} · {text.round} {result.round}</b><span>{text[result.status]}</span></header><div className="artist-candidate-media">{result.image ? <img src={result.image.fileUrl} alt={result.prompt} /> : <div className="artist-candidate-placeholder">{text[result.status]}</div>}{result.progress !== undefined && <b className="artist-score">{text.progress} {result.progress.toFixed(1)}%</b>}</div><div className="artist-string-block"><button type="button" onClick={() => { void navigator.clipboard.writeText(result.prompt); setMessage(text.copied); }}>{text.copy}</button><code>{result.prompt}</code></div>{result.error && <small className="artist-error">{result.error}</small>}<div className="artist-candidate-actions"><Button variant="primary" disabled={result.status !== "done"} onClick={() => { applyParams({ stylePrompt: [session.sharedStylePrompt.trim(), result.prompt].filter(Boolean).join(", ") }); setMessage(text.applied); }}>{text.apply}</Button></div></article>)}</div></section>}
  </main>;
}

type ArtistLabScreen = "home" | "target" | "random";
const SCREEN_KEY = "langbai.artist-lab.screen.v3";

export default function ArtistLab({ onBack }: { onBack: () => void }) {
  const language = useAppStore((state) => state.settings?.language ?? "zh-CN");
  const [screen, setScreen] = useState<ArtistLabScreen>(() => {
    const saved = localStorage.getItem(SCREEN_KEY);
    return saved === "target" || saved === "random" ? saved : "home";
  });
  const open = (next: ArtistLabScreen) => { localStorage.setItem(SCREEN_KEY, next); setScreen(next); };
  if (screen === "target") return <TargetArtistLab onBack={() => open("home")} />;
  if (screen === "random") return <RandomArtistLab onBack={() => open("home")} />;
  const text = HOME[language];
  return <main className="artist-lab artist-lab-home"><header className="artist-lab-hero"><div><h2>{text.title}</h2><p>{text.subtitle}</p></div><Button onClick={onBack}>{text.back}</Button></header><section className="artist-lab-mode-grid"><button type="button" className="artist-lab-mode-card reverse" onClick={() => open("target")}><span className="artist-mode-icon"><Icon name="scan" /></span><div><h3>{text.target}</h3><p>{text.targetDesc}</p><b>{text.enter} →</b></div></button><button type="button" className="artist-lab-mode-card random" onClick={() => open("random")}><span className="artist-mode-icon"><Icon name="dice" /></span><div><h3>{text.random}</h3><p>{text.randomDesc}</p><b>{text.enter} →</b></div></button></section></main>;
}
