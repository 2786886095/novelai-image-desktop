import { DEFAULT_ARTIST_IMAGE_BUDGET, iterationInteger, nextArtistBatch, planArtistImages, planArtistRounds, restoreArtistIteration } from "./artist-iteration-budget";
import { imagePasteProps } from "./image-paste";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "./store";
import { Button, CommittedNumberInput, SelectMenuCompat } from "./components/ui";
import { Icon } from "./components/icons";
import {
  createArtistLabRandom,
  normalizeArtistProgress,
  shouldResetArtistSearch,
  type ArtistLabModelMode,
  type ArtistLabModelStatus,
  type ArtistReferenceMatch,
} from "./artist-lab";
import { generateArtistMatchRecipes, type GeneratedArtistRecipe } from "./artist-recipe";
import type { AppLanguage, HistoryItem } from "./types";
import RandomArtistLab from "./RandomArtistLab";
import DetectiveArtistLab from "./DetectiveArtistLab";
import {InlineReversePromptSkillControls, callSelectedInlineReverse, reversePromptSelectionIdentity} from './components/InlineReversePromptSkillControls';

type TargetImage = { filePath: string; fileUrl: string; name: string; width?: number; height?: number };
type LabResult = GeneratedArtistRecipe & {
  sequence: number;
  round: number;
  status: "pending" | "generating" | "scoring" | "done" | "failed" | "skipped";
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
  imageBudget: number;
  iterationRounds: number;
  imagesUsed: number;
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
  "zh-CN": { title: "目标画风自动迭代", subtitle: "固定内容、画幅与 Seed，先测单画师，再围绕高分组合做权重微调与增删，避免无意义地反复随机。", back: "返回画风实验室", target: "目标图片", choose: "选择图片", change: "更换图片", local: "目标图与评分都留在本机；每位画师会综合多张公开参考缩略图，降低单图误判。", model: "评分模型", high: "高精度 DINOv2 Base（默认）", light: "轻量 DINOv2 Small", cache: "模型缓存", clear: "清除模型缓存", prompt: "固定内容提示词", reverse: "AI 反推内容", reversing: "正在反推…", fixedStyle: "固定辅助风格词（可选）", batch: "每轮候选数", seed: "固定 Seed", goal: "停止目标", budget: "最多生成图片数", advanced: "高级迭代设置", stagnant: "连续无明显提升轮数", improvement: "最低明显提升（百分点）", scan: "每次预筛画师数", shortlist: "保留相似画师数", start: "开始自动迭代", stop: "停止", needTarget: "请先选择目标图片。", needPrompt: "请填写或反推固定内容提示词。", baseline: "无画师基线", discovering: "正在读取多张代表图并预筛相似画师…", running: "第 {round} 轮 · {done}/{total} · 当前最佳 {best}%", reached: "已达到目标：{best}%", stopped: "任务已停止。", failedRound: "本轮没有成功图片，已停止以避免无限重试。", reset: "连续 {count} 轮无明显提升，已扩展画师池并保留当前最佳组合。", matches: "当前相似画师候选", progress: "相对进度", raw: "原始相似度", apply: "应用到生成", copy: "复制", copied: "已复制画师串。", applied: "已应用到生成页。", pending: "等待", generating: "生成中", scoring: "评分中", done: "已完成", failed: "失败", skipped: "预算结束", round: "轮次", best: "最佳", reverseFail: "反推失败：{message}" },
} satisfies Record<AppLanguage, Record<string, string>>;

const HOME = {
  "zh-CN": { title: "画风实验室", subtitle: "目标图自动迭代与随机画师串抽卡是两条独立流程。", back: "返回工具", target: "目标图自动迭代", targetDesc: "本机模型筛选和评分，自动扩展相似画师并迭代到目标。", random: "随机画师串抽卡", randomDesc: "每批重新随机画师与权重，由你选择喜欢的组合。", enter: "进入" },
} satisfies Record<AppLanguage, Record<string, string>>;

function restore(basePrompt: string): Session {
  if (sessionCache) return sessionCache;
  const fallback: Session = { modelMode: "high", target: null, basePrompt, sharedStylePrompt: "", batchSize: 8, seed: 246813579, targetProgress: 85, stagnantLimit: 2, minImprovement: 2, scanCount: 40, shortlist: 20, imageBudget: DEFAULT_ARTIST_IMAGE_BUDGET, iterationRounds: 38, imagesUsed: 0, discoveryOffset: 0, matches: [], bestProgress: 0, round: 0, resetCount: 0, results: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Session> | null;
    sessionCache = { ...fallback, ...raw, ...restoreArtistIteration(raw), modelMode: raw?.modelMode === "light" ? "light" : "high", target: raw?.target ?? null, results: Array.isArray(raw?.results) ? raw.results : [], matches: Array.isArray(raw?.matches) ? raw.matches : [] };
  } catch { sessionCache = fallback; }
  return sessionCache;
}

const ITERATION_TEXT = {
  "zh-CN": { rounds: "迭代轮数", budget: "图片预算（含基线）", estimate: "最多 {rounds} 轮 / {images} 张（含 1 张基线，末轮可不足一批）；达到目标或手动停止会提前结束。", finished: "已完成设置的迭代：{rounds} 轮，共生成 {images} 张。" },
} satisfies Record<AppLanguage, Record<string, string>>;

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

function previewSizeForTarget(target: TargetImage | null) {
  const width = target?.width ?? 0;
  const height = target?.height ?? 0;
  if (width <= 0 || height <= 0) return { width: 512, height: 512 };
  const ratio = width / height;
  const options = [
    { width: 512, height: 512 },
    { width: 640, height: 448 },
    { width: 448, height: 640 },
    { width: 768, height: 384 },
    { width: 384, height: 768 },
  ];
  return options.reduce((best, option) =>
    Math.abs(option.width / option.height - ratio) < Math.abs(best.width / best.height - ratio)
      ? option
      : best);
}

export function TargetArtistLab({ onBack }: { onBack: () => void }) {
  const language = useAppStore((state) => state.settings?.language ?? "zh-CN");
  const params = useAppStore((state) => state.params);
  const reverseMode = useAppStore(state => state.reversePromptMode);
  const applyParams = useAppStore((state) => state.applyParams);
  const refreshAccount = useAppStore((state) => state.refreshAccount);
  const refreshHistory = useAppStore((state) => state.refreshHistory);
  const text = TEXT[language];
  const iterationText = ITERATION_TEXT[language];
  const [session, setSession] = useState(() => restore(params.positivePrompt));
  const [running, setRunning] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [message, setMessage] = useState("");
  const [modelStatus, setModelStatus] = useState<ArtistLabModelStatus | null>(null);
  const cancelRef = useRef(false);
  const reversingRef = useRef(false);
  const reverseSource = useRef(session); reverseSource.current=session;
  const patch = (next: Partial<Session>) => setSession((current) => ({ ...current, ...next }));

  useEffect(() => {
    sessionCache = session;
    const timer = window.setTimeout(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(session)), 250);
    return () => window.clearTimeout(timer);
  }, [session]);
  useEffect(() => { void window.naiDesktop.artistLabModelStatus(session.modelMode).then(setModelStatus); }, [session.modelMode]);

  const chooseTarget = async (path?: string) => {
    const target = await window.naiDesktop.artistLabPickTarget(path);
    if (target) patch({ target, baseline: undefined, results: [], matches: [], discoveryOffset: 0, bestProgress: 0, round: 0, resetCount: 0, imagesUsed: 0 });
  };

  const reverseContent = async () => {
    if(reversingRef.current||running)return;
    if (!session.target) return setMessage(text.needTarget);
    const context=reversePromptSelectionIdentity(useAppStore.getState().settings), target=session.target.filePath, original=session.basePrompt;
    reversingRef.current=true;setReversing(true);
    try {
      const response = await fetch(session.target.fileUrl);
      const base64=bytesToBase64(new Uint8Array(await response.arrayBuffer()));
      if(context!==reversePromptSelectionIdentity(useAppStore.getState().settings))throw Error('反推版本或模型已改变，请重新反推。');
      const result = await callSelectedInlineReverse(base64, reverseMode, "只提取主体、构图、环境与动作；不要输出 artist 标签、画师名或纯画风词。");
      if (!result.ok || !result.prompt) throw new Error(result.message);
      if(context!==reversePromptSelectionIdentity(useAppStore.getState().settings)||reverseSource.current.target?.filePath!==target||reverseSource.current.basePrompt!==original||useAppStore.getState().reversePromptMode!==reverseMode)throw Error('图片、提示词或反推选项已改变，旧结果未覆盖当前内容。');
      patch({ basePrompt: result.prompt });
      setMessage("");
    } catch (error: any) { setMessage(interpolate(text.reverseFail, { message: error?.message ?? String(error) })); }
    finally { reversingRef.current=false;setReversing(false); }
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
    const previewSize = previewSizeForTarget(session.target);
    const fixedParams = { ...params, model: "nai-diffusion-4-5-full" as const, positivePrompt: session.basePrompt.trim(), stylePrompt: session.sharedStylePrompt.trim(), ...previewSize, seedMode: "fixed" as const, seed: session.seed, qualityPreset: "none" as const, qualityToggle: false, transparentBackground: false };
    const extras = { vibeImages: [], charCaptions: [], preciseReferences: [] };
    patch({ results: [], baseline: undefined, matches: [], discoveryOffset: 0, bestProgress: 0, round: 0, resetCount: 0, imagesUsed: 0 });
    let baselineSimilarity = 0;
    try {
      setMessage(text.cache);
      // Download/validate the scorer before spending any generation credits.
      await window.naiDesktop.artistLabScoreImages(session.modelMode, session.target.filePath, session.target.filePath);
      if (cancelRef.current) {setRunning(false); return;}
      setMessage(text.baseline);
      const generated = await window.naiDesktop.generateArtistLab(fixedParams, extras, "target");
      const image = generated.items[0];
      if (!generated.ok || !image) throw new Error(generated.message);
      baselineSimilarity = (await window.naiDesktop.artistLabScoreImages(session.modelMode, session.target.filePath, image.filePath)).similarity;
      patch({ baseline: { image, similarity: baselineSimilarity }, imagesUsed: 1 });
    } catch (error: any) {
      patch({ baseline: { error: error?.message ?? String(error) } });
      setRunning(false);
      return;
    }

    let imagesUsed = 1;
    while (!cancelRef.current && round < session.iterationRounds && bestProgress < session.targetProgress && imagesUsed < session.imageBudget) {
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
        const merged = new Map(matches.map((item) => [item.artist.id, item]));
        for (const item of discovered.matches) {
          const existing = merged.get(item.artist.id);
          if (!existing || item.similarity > existing.similarity) merged.set(item.artist.id, item);
        }
        matches = [...merged.values()].sort((a, b) => b.similarity - a.similarity).slice(0, Math.max(session.shortlist, 40));
        stagnant = 0;
        patch({ matches, discoveryOffset: offset, resetCount });
        if (matches.length === 0) break;
      }
      round += 1;
      const previousBest = bestProgress;
      const elites = accumulated.filter((item) => item.status === "done").sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0)).slice(0, Math.max(2, Math.ceil(session.batchSize / 4))).map((item) => item.artists);
      const pool = matches.map((match, index) => ({ ...match.artist, postCount: Math.max(match.artist.postCount, Math.round((matches.length - index) ** 3)) }));
      const recipes = generateArtistMatchRecipes(pool, {
        count: nextArtistBatch(round - 1, session.iterationRounds, imagesUsed, session.imageBudget, session.batchSize),
        round,
        eliteArtists: elites,
        seenPrompts: new Set(accumulated.map((item) => item.prompt)),
        random: createArtistLabRandom((session.seed + round * 2654435761 + resetCount * 97) >>> 0),
      });
      if (recipes.length === 0) {
        stagnant = session.stagnantLimit;
        matches = [];
        continue;
      }
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
          imagesUsed += 1;
          accumulated = accumulated.map((item) => item.id === current.id ? { ...item, image, status: "scoring" } : item);
          setSession((state) => ({ ...state, results: accumulated, imagesUsed }));
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
    if (imagesUsed >= session.imageBudget || round >= session.iterationRounds) {
      accumulated = accumulated.map((item) => item.status === "pending" ? { ...item, status: "skipped" } : item);
      setSession((state) => ({ ...state, results: accumulated, imagesUsed }));
      if (accumulated.some((item) => item.round === round && item.status === "done")) setMessage(interpolate(iterationText.finished, { rounds: round, images: imagesUsed }));
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
      <article {...imagePasteProps(paths=>chooseTarget(paths[0]))} className="artist-lab-panel target-panel"><h3>{text.target}</h3>{session.target ? <img src={session.target.fileUrl} alt={session.target.name} /> : <div className="artist-target-empty"><Icon name="scan" /></div>}<Button onClick={() => void chooseTarget()}>{session.target ? text.change : text.choose}</Button><small>{text.local}</small></article>
      <article className="artist-lab-panel artist-lab-controls">
        <label><span>{text.model}</span><SelectMenuCompat value={session.modelMode} onChange={(event) => patch({ modelMode: event.target.value as ArtistLabModelMode })}><option value="high">{text.high}</option><option value="light">{text.light}</option></SelectMenuCompat></label>
        <div className="artist-model-cache"><span>{text.cache}: {modelStatus ? `${formatBytes(modelStatus.cachedBytes)} · ${modelStatus.cachedFiles}` : "—"}</span><Button variant="ghost" onClick={async () => setModelStatus(await window.naiDesktop.artistLabClearModels())}>{text.clear}</Button></div>
        <InlineReversePromptSkillControls disabled={running||reversing}/>
        <label><span>{text.prompt}</span><textarea value={session.basePrompt} onChange={(event) => patch({ basePrompt: event.target.value })} /></label><Button onClick={() => void reverseContent()} disabled={!session.target || reversing||running}>{reversing ? text.reversing : text.reverse}</Button>
        <label><span>{text.fixedStyle}</span><textarea value={session.sharedStylePrompt} onChange={(event) => patch({ sharedStylePrompt: event.target.value })} /></label>
        <div className="artist-run-options">
          <CommittedNumberInput label={text.batch} value={session.batchSize} min={1} max={40} normalize={(value) => Math.max(1, Math.min(40, Math.round(value)))} disabled={running} onCommit={(batchSize) => patch({ batchSize, ...planArtistImages(session.imageBudget, batchSize) })} />
          <CommittedNumberInput label={text.seed} value={session.seed} min={0} normalize={(value) => Math.max(0, Math.floor(value))} onCommit={(seed) => patch({ seed })} />
          <CommittedNumberInput label={text.goal} value={session.targetProgress} min={1} max={100} normalize={(value) => Math.max(1, Math.min(100, value))} onCommit={(targetProgress) => patch({ targetProgress })} />
          <CommittedNumberInput label={iterationText.rounds} value={session.iterationRounds} min={1} disabled={running} normalize={(value) => iterationInteger(value, session.iterationRounds)} onCommit={(rounds) => patch(planArtistRounds(rounds, session.batchSize))} />
          <CommittedNumberInput label={iterationText.budget} value={session.imageBudget} min={2} disabled={running} normalize={(value) => iterationInteger(value, session.imageBudget, 2)} onCommit={(imageBudget) => patch(planArtistImages(imageBudget, session.batchSize))} />
        </div>
        <small role="status">{interpolate(iterationText.estimate, { rounds: session.iterationRounds, images: Math.min(session.imageBudget, 1 + session.iterationRounds * session.batchSize) })}</small>
        <details className="artist-lab-advanced"><summary>{text.advanced}</summary><div className="artist-run-options">
          <CommittedNumberInput label={text.stagnant} value={session.stagnantLimit} min={1} normalize={(value) => Math.max(1, Math.floor(value))} onCommit={(stagnantLimit) => patch({ stagnantLimit })} />
          <CommittedNumberInput label={text.improvement} value={session.minImprovement} min={0.1} step={0.1} normalize={(value) => Math.max(0.1, value)} onCommit={(minImprovement) => patch({ minImprovement })} />
          <CommittedNumberInput label={text.scan} value={session.scanCount} min={10} max={120} normalize={(value) => Math.max(10, Math.min(120, Math.round(value)))} onCommit={(scanCount) => patch({ scanCount })} />
          <CommittedNumberInput label={text.shortlist} value={session.shortlist} min={4} max={120} normalize={(value) => Math.max(4, Math.min(120, Math.round(value)))} onCommit={(shortlist) => patch({ shortlist })} />
        </div></details>
      </article>
    </section>
    <section className="artist-lab-actions">{running ? <Button variant="danger" onClick={() => { cancelRef.current = true; void window.naiDesktop.cancel(); }}>{text.stop}</Button> : <Button variant="primary" onClick={() => void start()}>{text.start}</Button>}<span>{message}</span></section>
    {session.baseline && <section className="artist-lab-panel artist-baseline-panel"><div className="artist-section-heading"><h3>{text.baseline}</h3>{session.baseline.similarity !== undefined && <b>{text.raw} {(session.baseline.similarity * 100).toFixed(1)}%</b>}</div>{session.baseline.image && <div className="artist-baseline-content"><img src={session.baseline.image.fileUrl} alt={text.baseline} /></div>}{session.baseline.error && <p className="artist-error">{session.baseline.error}</p>}</section>}
    {session.matches.length > 0 && <section className="artist-lab-panel"><div className="artist-section-heading"><h3>{text.matches}</h3><b>{session.matches.length}</b></div><div className="artist-reference-grid">{session.matches.map((match) => <article key={match.artist.id}><img src={match.referenceUrl} alt={match.artist.name} /><b>{match.artist.name}</b><span>{(match.similarity * 100).toFixed(1)}%</span></article>)}</div></section>}
    {ranked.length > 0 && <section className="artist-gallery-section"><div className="artist-gallery-heading"><h3>{text.best}: {session.bestProgress.toFixed(1)}% / {session.targetProgress}%</h3></div><div className="artist-candidate-grid">{ranked.map((result) => <article key={result.id} className={`artist-candidate ${result.status}`}><header className="artist-candidate-header"><b>#{result.sequence} · {text.round} {result.round}</b><span>{text[result.status]}</span></header><div className="artist-candidate-media">{result.image ? <img src={result.image.fileUrl} alt={result.prompt} /> : <div className="artist-candidate-placeholder">{text[result.status]}</div>}{result.progress !== undefined && <b className="artist-score">{text.progress} {result.progress.toFixed(1)}%</b>}</div><div className="artist-string-block"><button type="button" onClick={() => { void navigator.clipboard.writeText(result.prompt); setMessage(text.copied); }}>{text.copy}</button><code>{result.prompt}</code></div>{result.error && <small className="artist-error">{result.error}</small>}<div className="artist-candidate-actions"><Button variant="primary" disabled={result.status !== "done"} onClick={() => { applyParams({ stylePrompt: [session.sharedStylePrompt.trim(), result.prompt].filter(Boolean).join(", ") }); setMessage(text.applied); }}>{text.apply}</Button></div></article>)}</div></section>}
  </main>;
}

type ArtistLabScreen = "home" | "target" | "random";
export default function ArtistLab({ onBack }: { onBack: () => void }) {
  const language = useAppStore((state) => state.settings?.language ?? "zh-CN");
  const [screen, setScreen] = useState<ArtistLabScreen>("home");
  // ToolsHub stays mounted across top-level tabs. Keep this subpage and its
  // in-memory draft alive; only an explicit Back action returns to the index.
  // A fresh application session still starts on the lightweight home screen.
  const open = setScreen;
  if (screen === "target") return <DetectiveArtistLab onBack={() => open("home")} />;
  if (screen === "random") return <RandomArtistLab onBack={() => open("home")} />;
  const text = HOME[language];
  return <main className="artist-lab artist-lab-home"><header className="artist-lab-hero"><div><h2>{text.title}</h2><p>{text.subtitle}</p></div><Button onClick={onBack}>{text.back}</Button></header><section className="artist-lab-mode-grid"><button type="button" className="artist-lab-mode-card reverse" onClick={() => open("target")}><span className="artist-mode-icon"><Icon name="scan" /></span><div><h3>{text.target}</h3><p>{text.targetDesc}</p><b>{text.enter} →</b></div></button><button type="button" className="artist-lab-mode-card random" onClick={() => open("random")}><span className="artist-mode-icon"><Icon name="dice" /></span><div><h3>{text.random}</h3><p>{text.randomDesc}</p><b>{text.enter} →</b></div></button></section></main>;
}
