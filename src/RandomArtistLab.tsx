import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./components/ui";
import { generatePopularArtistRecipes, type GeneratedArtistRecipe } from "./artist-recipe";
import { createArtistLabRandom, type ArtistTagRecord } from "./artist-lab";
import { useAppStore } from "./store";
import type { AppLanguage, HistoryItem } from "./types";

type RandomResult = GeneratedArtistRecipe & {
  sequence: number;
  status: "pending" | "generating" | "done" | "failed";
  image?: HistoryItem;
  error?: string;
  liked?: boolean;
};

type RandomSession = {
  basePrompt: string;
  auxiliaryPrompt: string;
  count: number;
  minArtists: number;
  maxArtists: number;
  seed: number;
  drawSeed: number;
  mutateAuxiliary: boolean;
  results: RandomResult[];
};

const STORAGE_KEY = "langbai.artist-lab.random.v3";
let sessionCache: RandomSession | null = null;

const TEXT = {
  "zh-CN": { title: "随机画师串抽卡", subtitle: "每次抽卡都会重新组合画师与权重；内容、Seed 和参数保持不变，便于公平比较。", back: "返回画风实验室", pool: "动态热门画师池", ready: "已载入 {count} 名画师", loading: "正在读取热门画师…", refresh: "刷新排行", hint: "热度采用 Danbooru 作品数并进行平方根降权，不等于独立使用人数。", base: "固定内容提示词", auxiliary: "辅助画风词", mutate: "允许非画师词参与随机变异", count: "本批生成数量", range: "每串画师数量", min: "最少", max: "最多", seed: "固定 NovelAI Seed", draw: "重新抽卡", preview: "本批抽卡预览", previewHint: "只预览画师名和权重，不下载代表图。每次重新抽卡都会得到一批新组合。", generate: "生成这一批", stop: "停止任务", refine: "根据喜欢项再抽卡", needPool: "画师池尚未载入。", needPrompt: "请填写固定内容提示词。", needLikes: "请先选择至少一个喜欢项。", running: "正在生成 {done}/{total}", complete: "本批已完成，可继续抽卡或从喜欢项偏向组合。", pending: "等待", generating: "生成中", done: "已完成", failed: "失败", like: "喜欢", unlike: "取消喜欢", apply: "应用到生成", copy: "复制", copied: "已复制画师串。", applied: "已应用到生成页。", empty: "画师池加载后即可抽卡。", unlimited: "请输入任意正整数；数量越大，耗时和接口请求越多。" },
  "zh-TW": { title: "隨機畫師串抽卡", subtitle: "每次抽卡都重新組合畫師與權重；內容、Seed 與參數保持一致。", back: "返回畫風實驗室", pool: "動態熱門畫師池", ready: "已載入 {count} 名畫師", loading: "正在讀取熱門畫師…", refresh: "更新排行", hint: "熱度採用 Danbooru 作品數並以平方根降權，不等於獨立使用人數。", base: "固定內容提示詞", auxiliary: "輔助畫風詞", mutate: "允許非畫師詞參與隨機變異", count: "本批生成數量", range: "每串畫師數量", min: "最少", max: "最多", seed: "固定 NovelAI Seed", draw: "重新抽卡", preview: "本批抽卡預覽", previewHint: "只預覽畫師名與權重，不下載代表圖。", generate: "生成這一批", stop: "停止任務", refine: "依喜歡項再抽卡", needPool: "畫師池尚未載入。", needPrompt: "請填寫固定內容提示詞。", needLikes: "請先選擇至少一個喜歡項。", running: "正在生成 {done}/{total}", complete: "本批已完成。", pending: "等待", generating: "生成中", done: "已完成", failed: "失敗", like: "喜歡", unlike: "取消喜歡", apply: "套用到生成", copy: "複製", copied: "已複製畫師串。", applied: "已套用到生成頁。", empty: "畫師池載入後即可抽卡。", unlimited: "可輸入任意正整數；數量越大，耗時與請求越多。" },
  "en-US": { title: "Random Artist-string Gacha", subtitle: "Every draw rerolls artists and weights while content, seed, and generation parameters stay fixed.", back: "Back to Artist Lab", pool: "Dynamic popular-artist pool", ready: "Loaded {count} artists", loading: "Loading popular artists…", refresh: "Refresh ranking", hint: "Popularity uses Danbooru post counts with square-root compression; it is not unique-user count.", base: "Fixed content prompt", auxiliary: "Auxiliary style terms", mutate: "Allow non-artist terms to mutate", count: "Images in this batch", range: "Artists per string", min: "Minimum", max: "Maximum", seed: "Fixed NovelAI seed", draw: "Draw again", preview: "Current draw", previewHint: "Only names and weights are needed; no representative images are downloaded.", generate: "Generate this batch", stop: "Stop", refine: "Draw from liked results", needPool: "The artist pool is not ready.", needPrompt: "Enter a fixed content prompt.", needLikes: "Like at least one result first.", running: "Generating {done}/{total}", complete: "Batch complete.", pending: "Pending", generating: "Generating", done: "Complete", failed: "Failed", like: "Like", unlike: "Unlike", apply: "Apply to Generate", copy: "Copy", copied: "Artist string copied.", applied: "Applied to Generate.", empty: "Draws appear after the pool loads.", unlimited: "Enter any positive integer. Larger batches take longer and make more API requests." },
  "ja-JP": { title: "ランダム画家タグ抽選", subtitle: "抽選ごとに画家と重みを再構成し、内容・Seed・生成設定は固定します。", back: "画風ラボへ戻る", pool: "動的人気画家プール", ready: "{count} 名を読込済み", loading: "人気画家を読込中…", refresh: "順位を更新", hint: "Danbooru作品数を平方根で圧縮した人気度で、利用者数ではありません。", base: "固定内容プロンプト", auxiliary: "補助画風語", mutate: "非画家語もランダム変異", count: "このバッチの枚数", range: "1配方の画家数", min: "最小", max: "最大", seed: "固定 NovelAI Seed", draw: "再抽選", preview: "現在の抽選", previewHint: "代表画像は取得せず、名前と重みだけを使います。", generate: "このバッチを生成", stop: "停止", refine: "お気に入りから抽選", needPool: "画家プールが未準備です。", needPrompt: "固定内容を入力してください。", needLikes: "先に1件以上お気に入りにしてください。", running: "生成中 {done}/{total}", complete: "バッチ完了。", pending: "待機", generating: "生成中", done: "完了", failed: "失敗", like: "お気に入り", unlike: "解除", apply: "生成へ適用", copy: "コピー", copied: "コピーしました。", applied: "生成へ適用しました。", empty: "プール読込後に抽選できます。", unlimited: "任意の正整数を入力できます。大きいほど時間と通信量が増えます。" },
  "ko-KR": { title: "무작위 작가 조합 뽑기", subtitle: "뽑을 때마다 작가와 가중치를 새로 구성하고 내용·Seed·생성 설정은 고정합니다.", back: "화풍 실험실로", pool: "동적 인기 작가 풀", ready: "작가 {count}명 로드됨", loading: "인기 작가 로딩 중…", refresh: "순위 새로고침", hint: "Danbooru 게시물 수를 제곱근 압축한 인기도이며 사용자 수가 아닙니다.", base: "고정 내용 프롬프트", auxiliary: "보조 화풍 용어", mutate: "비작가 용어도 무작위 변이", count: "이번 배치 수", range: "조합당 작가 수", min: "최소", max: "최대", seed: "고정 NovelAI Seed", draw: "다시 뽑기", preview: "현재 뽑기", previewHint: "대표 이미지를 받지 않고 이름과 가중치만 사용합니다.", generate: "이 배치 생성", stop: "중지", refine: "좋아요 항목으로 뽑기", needPool: "작가 풀이 준비되지 않았습니다.", needPrompt: "고정 프롬프트를 입력하세요.", needLikes: "먼저 하나 이상 좋아요를 선택하세요.", running: "생성 중 {done}/{total}", complete: "배치 완료.", pending: "대기", generating: "생성 중", done: "완료", failed: "실패", like: "좋아요", unlike: "취소", apply: "생성에 적용", copy: "복사", copied: "복사했습니다.", applied: "생성 화면에 적용했습니다.", empty: "풀 로드 후 뽑을 수 있습니다.", unlimited: "임의의 양의 정수를 입력할 수 있습니다. 수가 크면 시간과 요청이 늘어납니다." },
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

function restore(basePrompt: string): RandomSession {
  if (sessionCache) return sessionCache;
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<RandomSession> | null;
    sessionCache = {
      basePrompt: typeof raw?.basePrompt === "string" ? raw.basePrompt : basePrompt,
      auxiliaryPrompt: typeof raw?.auxiliaryPrompt === "string" ? raw.auxiliaryPrompt : "",
      count: positiveInteger(raw?.count, 8),
      minArtists: Math.max(1, Math.min(24, positiveInteger(raw?.minArtists, 4))),
      maxArtists: Math.max(1, Math.min(24, positiveInteger(raw?.maxArtists, 10))),
      seed: Math.max(0, Math.floor(Number(raw?.seed) || 246813579)),
      drawSeed: positiveInteger(raw?.drawSeed, freshSeed()),
      mutateAuxiliary: raw?.mutateAuxiliary === true,
      results: Array.isArray(raw?.results) ? raw.results : [],
    };
  } catch {
    sessionCache = { basePrompt, auxiliaryPrompt: "", count: 8, minArtists: 4, maxArtists: 10, seed: 246813579, drawSeed: freshSeed(), mutateAuxiliary: false, results: [] };
  }
  return sessionCache;
}

export default function RandomArtistLab({ onBack }: { onBack: () => void }) {
  const language = useAppStore((state) => state.settings?.language ?? "zh-CN");
  const params = useAppStore((state) => state.params);
  const applyParams = useAppStore((state) => state.applyParams);
  const refreshAccount = useAppStore((state) => state.refreshAccount);
  const refreshHistory = useAppStore((state) => state.refreshHistory);
  const text = TEXT[language];
  const [session, setSession] = useState(() => restore(params.positivePrompt));
  const [pool, setPool] = useState<ArtistTagRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const cancelRef = useRef(false);
  const patch = (next: Partial<RandomSession>) => setSession((current) => ({ ...current, ...next }));

  useEffect(() => {
    sessionCache = session;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }, [session]);

  const loadPool = async (force = false) => {
    setLoading(true);
    try {
      const targetSize = force ? Math.max(1000, pool.length + 500) : 1000;
      setPool(await window.naiDesktop.artistLabPopularArtists(targetSize, force));
      setMessage("");
    } catch (error: any) { setMessage(error?.message ?? String(error)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadPool(false); }, []);

  const likedArtists = session.results.filter((item) => item.liked).flatMap((item) => item.artists.map((artist) => artist.name));
  const poolKey = pool.map((artist) => `${artist.id}:${artist.postCount}`).join("|");
  const planned = useMemo(() => generatePopularArtistRecipes(pool, {
    count: session.count,
    minArtists: Math.min(session.minArtists, session.maxArtists),
    maxArtists: Math.max(session.minArtists, session.maxArtists),
    auxiliaryPrompt: session.auxiliaryPrompt,
    mutateAuxiliary: session.mutateAuxiliary,
    random: createArtistLabRandom(session.drawSeed),
  }), [poolKey, session.count, session.minArtists, session.maxArtists, session.auxiliaryPrompt, session.mutateAuxiliary, session.drawSeed]);

  const interpolate = (value: string, values: Record<string, unknown>) => Object.entries(values).reduce((out, [key, replacement]) => out.replaceAll(`{${key}}`, String(replacement)), value);
  const draw = (fromLikes = false) => {
    if (fromLikes && likedArtists.length === 0) return setMessage(text.needLikes);
    patch({ drawSeed: freshSeed() + (fromLikes ? likedArtists.length : 0) });
  };

  const run = async (fromLikes = false) => {
    if (pool.length === 0) return setMessage(text.needPool);
    if (!session.basePrompt.trim()) return setMessage(text.needPrompt);
    if (fromLikes && likedArtists.length === 0) return setMessage(text.needLikes);
    const recipes = fromLikes ? generatePopularArtistRecipes(pool, {
      count: session.count,
      minArtists: Math.min(session.minArtists, session.maxArtists),
      maxArtists: Math.max(session.minArtists, session.maxArtists),
      auxiliaryPrompt: session.auxiliaryPrompt,
      mutateAuxiliary: session.mutateAuxiliary,
      favoriteArtists: likedArtists,
      random: createArtistLabRandom(freshSeed()),
    }) : planned;
    const offset = session.results.length;
    const batchId = freshSeed().toString(36);
    const pending: RandomResult[] = recipes.map((recipe, index) => ({ ...recipe, id: `${batchId}-${recipe.id}`, sequence: offset + index + 1, status: "pending" }));
    patch({ results: [...session.results, ...pending] });
    setRunning(true);
    cancelRef.current = false;
    const fixedParams = { ...params, positivePrompt: session.basePrompt.trim(), stylePrompt: "", width: 512, height: 512, seedMode: "fixed" as const, seed: session.seed, qualityToggle: false };
    const extras = { vibeImages: [], charCaptions: [], preciseReferences: [] };
    for (const result of pending) {
      if (cancelRef.current) break;
      setSession((current) => ({ ...current, results: current.results.map((item) => item.id === result.id ? { ...item, status: "generating" } : item) }));
      try {
        const generated = await window.naiDesktop.generateArtistLab({ ...fixedParams, stylePrompt: result.prompt }, extras, "random");
        const image = generated.items[0];
        if (!generated.ok || !image) throw new Error(generated.message);
        setSession((current) => ({ ...current, results: current.results.map((item) => item.id === result.id ? { ...item, image, status: "done" } : item) }));
      } catch (error: any) {
        setSession((current) => ({ ...current, results: current.results.map((item) => item.id === result.id ? { ...item, status: "failed", error: error?.message ?? String(error) } : item) }));
      }
    }
    setRunning(false);
    await Promise.allSettled([refreshAccount(), refreshHistory()]);
    if (!cancelRef.current) setMessage(text.complete);
    patch({ drawSeed: freshSeed() });
  };

  const batchDone = session.results.slice(-planned.length).filter((item) => item.status === "done" || item.status === "failed").length;
  return <main className="artist-lab random-artist-lab">
    <header className="artist-lab-hero"><div><h2>{text.title}</h2><p>{text.subtitle}</p></div><Button onClick={onBack}>{text.back}</Button></header>
    <section className="artist-lab-panel random-pool-summary"><div><h3>{text.pool}</h3><strong>{loading ? text.loading : interpolate(text.ready, { count: pool.length })}</strong><small>{text.hint}</small></div><Button onClick={() => void loadPool(true)} disabled={loading}>{text.refresh}</Button></section>
    <section className="artist-lab-panel random-artist-settings">
      <label className="wide"><span>{text.base}</span><textarea value={session.basePrompt} onChange={(event) => patch({ basePrompt: event.target.value })} /></label>
      <label className="wide"><span>{text.auxiliary}</span><textarea value={session.auxiliaryPrompt} onChange={(event) => patch({ auxiliaryPrompt: event.target.value })} /></label>
      <label className="random-check wide"><input type="checkbox" checked={session.mutateAuxiliary} onChange={(event) => patch({ mutateAuxiliary: event.target.checked })} /><span>{text.mutate}</span></label>
      <label><span>{text.count}</span><input type="number" min={1} value={session.count} onChange={(event) => patch({ count: positiveInteger(event.target.value, 1) })} /><small>{text.unlimited}</small></label>
      <fieldset><legend>{text.range}</legend><label><span>{text.min}</span><input type="number" min={1} max={24} value={session.minArtists} onChange={(event) => patch({ minArtists: Math.min(24, positiveInteger(event.target.value, 1)) })} /></label><label><span>{text.max}</span><input type="number" min={1} max={24} value={session.maxArtists} onChange={(event) => patch({ maxArtists: Math.min(24, positiveInteger(event.target.value, 1)) })} /></label></fieldset>
      <label><span>{text.seed}</span><input type="number" min={0} value={session.seed} onChange={(event) => patch({ seed: Math.max(0, Math.floor(Number(event.target.value) || 0)) })} /></label>
    </section>
    <section className="artist-lab-panel artist-queue-panel"><div className="artist-section-heading"><div><h3>{text.preview}</h3><small>{text.previewHint}</small></div><div className="artist-preview-actions"><b>{planned.length}</b><Button onClick={() => draw(false)} disabled={running || pool.length === 0}>{text.draw}</Button></div></div>{planned.length === 0 ? <div className="artist-queue-empty">{text.empty}</div> : <ol className="artist-combination-queue">{planned.map((recipe, index) => <li key={recipe.id}><span>#{String(index + 1).padStart(2, "0")}</span><code>{recipe.prompt}</code></li>)}</ol>}</section>
    <section className="artist-lab-actions">{running ? <Button variant="danger" onClick={() => { cancelRef.current = true; void window.naiDesktop.cancel(); }}>{text.stop}</Button> : <Button variant="primary" onClick={() => void run(false)}>{text.generate}</Button>}<Button disabled={running || likedArtists.length === 0} onClick={() => { draw(true); }}>{text.refine}</Button><span>{running ? interpolate(text.running, { done: batchDone, total: planned.length }) : message}</span></section>
    {session.results.length > 0 && <section className="artist-candidate-grid">{session.results.map((result) => <article key={result.id} className={`artist-candidate ${result.status}`}><header className="artist-candidate-header"><b>#{String(result.sequence).padStart(2, "0")} · {result.artists.length}</b><span>{text[result.status]}</span></header><div className="artist-candidate-media">{result.image ? <img src={result.image.fileUrl} alt={result.prompt} /> : <div className="artist-candidate-placeholder">{text[result.status]}</div>}</div><div className="artist-string-block"><button type="button" onClick={() => { void navigator.clipboard.writeText(result.prompt); setMessage(text.copied); }}>{text.copy}</button><code>{result.prompt}</code></div>{result.error && <small className="artist-error">{result.error}</small>}<div className="artist-candidate-actions"><Button variant="ghost" onClick={() => setSession((current) => ({ ...current, results: current.results.map((item) => item.id === result.id ? { ...item, liked: !item.liked } : item) }))}>{result.liked ? text.unlike : text.like}</Button><Button variant="primary" disabled={result.status !== "done"} onClick={() => { applyParams({ stylePrompt: result.prompt }); setMessage(text.applied); }}>{text.apply}</Button></div></article>)}</section>}
  </main>;
}
