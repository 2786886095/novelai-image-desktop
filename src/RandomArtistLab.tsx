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
  mutateAuxiliary: boolean;
  results: RandomResult[];
};

const STORAGE_KEY = "langbai.artist-lab.random.v2";
let sessionCache: RandomSession | null = null;

const TEXT = {
  "zh-CN": {
    eyebrow: "WINDOWS · RANDOM ARTIST COMBINATIONS", title: "随机画师组合", subtitle: "从高人气画师池按降权概率抽样，生成多层级权重配方，再由 NovelAI 逐串出图供你挑选。", back: "返回画风实验室", pool: "热门画师池", poolReady: "已载入 {count} 名画师", loading: "正在读取热门画师…", refresh: "刷新排行", rankingHint: "人气来自 Danbooru 作品数，不代表独立使用人数；平方根降权避免少数榜首垄断结果。", basePrompt: "固定内容提示词", baseHint: "所有图片保持相同内容、Seed、尺寸和生成参数，只改变画风配方。", auxiliary: "辅助画风词", auxiliaryHint: "可放年代、媒介、光照、质量词和抑制词；原文保留。", mutate: "允许非画师词参与随机变异", mutateHint: "默认关闭。开启后才会增删或微调辅助词；负向抑制词不会被转成正向词。", count: "生成数量", range: "每串画师数量", min: "最少", max: "最多", seed: "固定 Seed", preview: "本轮组合预览", previewHint: "成熟配方通常包含多名主画师、辅助画师和点缀画师；每条配方对应一张图。", generate: "按预览生成", stop: "停止任务", refine: "根据喜欢项继续组合", needPool: "热门画师池尚未载入。", needPrompt: "请填写固定内容提示词。", needLikes: "请先选择至少一张喜欢的结果。", quote: "本轮官方报价：{amount} Anlas", quoteFail: "报价不可用：{message}。仍可尝试生成，以 NovelAI 返回为准。", running: "正在生成 {done}/{total}", complete: "本轮完成。选择喜欢的画师串后可继续产生偏好变体。", pending: "等待", generating: "生成中", done: "已完成", failed: "失败", like: "喜欢", unlike: "取消喜欢", apply: "应用到生成", copy: "复制", copied: "已复制画师串。", applied: "已将该画风配方写入生成页。", artists: "画师", popularity: "作品数", empty: "组合会在画师池载入后出现。",
  },
  "zh-TW": {
    eyebrow: "WINDOWS · RANDOM ARTIST COMBINATIONS", title: "隨機畫師組合", subtitle: "從高人氣畫師池按降權機率抽樣，生成多層級權重配方，再由 NovelAI 逐串出圖供你挑選。", back: "返回畫風實驗室", pool: "熱門畫師池", poolReady: "已載入 {count} 名畫師", loading: "正在讀取熱門畫師…", refresh: "更新排行", rankingHint: "人氣來自 Danbooru 作品數，不是獨立使用人數；平方根降權避免少數榜首壟斷。", basePrompt: "固定內容提示詞", baseHint: "所有圖片維持相同內容、Seed、尺寸和參數，只改變畫風配方。", auxiliary: "輔助畫風詞", auxiliaryHint: "可放年代、媒介、光照、品質詞和抑制詞；原文保留。", mutate: "允許非畫師詞參與隨機變異", mutateHint: "預設關閉；負向抑制詞不會轉成正向詞。", count: "生成數量", range: "每串畫師數量", min: "最少", max: "最多", seed: "固定 Seed", preview: "本輪組合預覽", previewHint: "每條配方對應一張圖。", generate: "依預覽生成", stop: "停止任務", refine: "依喜歡項繼續組合", needPool: "熱門畫師池尚未載入。", needPrompt: "請填寫固定內容提示詞。", needLikes: "請先選擇至少一張喜歡的結果。", quote: "本輪官方報價：{amount} Anlas", quoteFail: "報價不可用：{message}。仍可嘗試生成。", running: "正在生成 {done}/{total}", complete: "本輪完成。選擇喜歡項後可繼續產生偏好變體。", pending: "等待", generating: "生成中", done: "已完成", failed: "失敗", like: "喜歡", unlike: "取消喜歡", apply: "套用到生成", copy: "複製", copied: "已複製畫師串。", applied: "已將配方寫入生成頁。", artists: "畫師", popularity: "作品數", empty: "組合會在畫師池載入後出現。",
  },
  "en-US": {
    eyebrow: "WINDOWS · RANDOM ARTIST COMBINATIONS", title: "Random Artist Combinations", subtitle: "Sample a popularity-weighted artist pool, build layered weights, and generate one NovelAI image per recipe for preference selection.", back: "Back to Artist Lab", pool: "Popular artist pool", poolReady: "Loaded {count} artists", loading: "Loading popular artists…", refresh: "Refresh ranking", rankingHint: "Popularity means Danbooru post count, not unique users. Square-root weighting prevents a few leaders from monopolizing results.", basePrompt: "Fixed content prompt", baseHint: "Content, seed, size, and parameters stay fixed; only the style recipe changes.", auxiliary: "Auxiliary style terms", auxiliaryHint: "Year, medium, lighting, quality, and suppression terms can be kept here.", mutate: "Allow non-artist terms to mutate", mutateHint: "Off by default. Negative controls are never turned positive.", count: "Image count", range: "Artists per recipe", min: "Minimum", max: "Maximum", seed: "Fixed seed", preview: "Combination preview", previewHint: "Each recipe maps to exactly one image.", generate: "Generate preview", stop: "Stop task", refine: "Combine from liked results", needPool: "The popular artist pool is not ready.", needPrompt: "Enter a fixed content prompt.", needLikes: "Like at least one result first.", quote: "Official quote: {amount} Anlas", quoteFail: "Quote unavailable: {message}. Generation can still be attempted.", running: "Generating {done}/{total}", complete: "Round complete. Like results to create preference-biased variants.", pending: "Pending", generating: "Generating", done: "Complete", failed: "Failed", like: "Like", unlike: "Unlike", apply: "Apply to Generate", copy: "Copy", copied: "Artist string copied.", applied: "Style recipe applied to Generate.", artists: "artists", popularity: "posts", empty: "Combinations appear after the artist pool loads.",
  },
  "ja-JP": {
    eyebrow: "WINDOWS · RANDOM ARTIST COMBINATIONS", title: "ランダム画家タグ組合せ", subtitle: "人気度を圧縮した確率で画家を抽出し、重み付き配方ごとに NovelAI 画像を生成します。", back: "画風ラボへ戻る", pool: "人気画家プール", poolReady: "{count} 名を読み込み済み", loading: "人気画家を読み込み中…", refresh: "順位を更新", rankingHint: "人気度は Danbooru の作品数であり利用者数ではありません。平方根で偏りを抑えます。", basePrompt: "固定内容プロンプト", baseHint: "内容、Seed、サイズ、設定を固定し、画風配方だけを変えます。", auxiliary: "補助画風語", auxiliaryHint: "年代、媒体、照明、品質語、抑制語を指定できます。", mutate: "非画家語もランダム変異", mutateHint: "既定はオフ。負の抑制語を正に変換しません。", count: "生成枚数", range: "配方ごとの画家数", min: "最小", max: "最大", seed: "固定 Seed", preview: "組合せプレビュー", previewHint: "1配方につき1枚を生成します。", generate: "プレビューを生成", stop: "停止", refine: "お気に入りから再組合せ", needPool: "画家プールが未準備です。", needPrompt: "固定内容プロンプトを入力してください。", needLikes: "先に結果を1つ以上お気に入りにしてください。", quote: "公式見積り：{amount} Anlas", quoteFail: "見積り不可：{message}。生成は試行できます。", running: "生成中 {done}/{total}", complete: "完了。お気に入りから次の変体を作成できます。", pending: "待機", generating: "生成中", done: "完了", failed: "失敗", like: "お気に入り", unlike: "解除", apply: "生成へ適用", copy: "コピー", copied: "コピーしました。", applied: "生成画面へ反映しました。", artists: "画家", popularity: "作品", empty: "画家プール読込後に表示されます。",
  },
  "ko-KR": {
    eyebrow: "WINDOWS · RANDOM ARTIST COMBINATIONS", title: "무작위 작가 조합", subtitle: "인기도 편향을 완화해 작가를 추출하고 가중 조합마다 NovelAI 이미지 한 장을 생성합니다.", back: "화풍 실험실로", pool: "인기 작가 풀", poolReady: "작가 {count}명 로드됨", loading: "인기 작가를 불러오는 중…", refresh: "순위 새로고침", rankingHint: "인기도는 Danbooru 작품 수이며 사용자 수가 아닙니다. 제곱근 가중으로 상위 독점을 줄입니다.", basePrompt: "고정 내용 프롬프트", baseHint: "내용, Seed, 크기, 설정은 고정하고 화풍 조합만 변경합니다.", auxiliary: "보조 화풍 용어", auxiliaryHint: "연도, 매체, 조명, 품질 및 억제 용어를 둘 수 있습니다.", mutate: "비작가 용어도 무작위 변이", mutateHint: "기본은 끔이며 음수 억제어를 양수로 바꾸지 않습니다.", count: "생성 수", range: "조합당 작가 수", min: "최소", max: "최대", seed: "고정 Seed", preview: "조합 미리보기", previewHint: "조합 하나가 이미지 한 장과 대응합니다.", generate: "미리보기 생성", stop: "중지", refine: "좋아요 결과로 재조합", needPool: "인기 작가 풀이 준비되지 않았습니다.", needPrompt: "고정 프롬프트를 입력하세요.", needLikes: "먼저 결과를 하나 이상 좋아요로 선택하세요.", quote: "공식 견적: {amount} Anlas", quoteFail: "견적 사용 불가: {message}. 생성은 시도할 수 있습니다.", running: "생성 중 {done}/{total}", complete: "완료. 좋아요 결과로 다음 변형을 만들 수 있습니다.", pending: "대기", generating: "생성 중", done: "완료", failed: "실패", like: "좋아요", unlike: "취소", apply: "생성에 적용", copy: "복사", copied: "복사했습니다.", applied: "생성 화면에 적용했습니다.", artists: "작가", popularity: "작품", empty: "작가 풀 로드 후 표시됩니다.",
  },
} satisfies Record<AppLanguage, Record<string, string>>;

function restore(basePrompt: string, auxiliaryPrompt: string): RandomSession {
  if (sessionCache) return sessionCache;
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<RandomSession> | null;
    sessionCache = {
      basePrompt: typeof raw?.basePrompt === "string" ? raw.basePrompt : basePrompt,
      auxiliaryPrompt: typeof raw?.auxiliaryPrompt === "string" ? raw.auxiliaryPrompt : auxiliaryPrompt,
      count: Math.max(1, Math.min(40, Number(raw?.count) || 8)),
      minArtists: Math.max(1, Math.min(24, Number(raw?.minArtists) || 4)),
      maxArtists: Math.max(1, Math.min(24, Number(raw?.maxArtists) || 10)),
      seed: Number.isSafeInteger(raw?.seed) ? Number(raw?.seed) : 246813579,
      mutateAuxiliary: raw?.mutateAuxiliary === true,
      results: Array.isArray(raw?.results) ? raw.results : [],
    };
  } catch {
    sessionCache = { basePrompt, auxiliaryPrompt, count: 8, minArtists: 4, maxArtists: 10, seed: 246813579, mutateAuxiliary: false, results: [] };
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
  const [session, setSession] = useState(() => restore(params.positivePrompt, ""));
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
      const artists = await window.naiDesktop.artistLabPopularArtists(300, force);
      setPool(artists);
      setMessage("");
    } catch (error: any) {
      setMessage(error?.message ?? String(error));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void loadPool(false); }, []);

  const likedArtists = session.results
    .filter((result) => result.liked)
    .flatMap((result) => result.artists.map((artist) => artist.name));
  const artistPoolKey = pool.map((artist) => `${artist.id}:${artist.postCount}`).join("|");
  const planned = useMemo(() => generatePopularArtistRecipes(pool, {
    count: session.count,
    minArtists: Math.min(session.minArtists, session.maxArtists),
    maxArtists: Math.max(session.minArtists, session.maxArtists),
    auxiliaryPrompt: session.auxiliaryPrompt,
    mutateAuxiliary: session.mutateAuxiliary,
    random: createArtistLabRandom(session.seed),
  }), [artistPoolKey, session.count, session.minArtists, session.maxArtists, session.auxiliaryPrompt, session.mutateAuxiliary, session.seed]);

  const interpolate = (value: string, values: Record<string, unknown>) =>
    Object.entries(values).reduce((out, [key, replacement]) => out.replaceAll(`{${key}}`, String(replacement)), value);

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
      random: createArtistLabRandom(session.seed + session.results.length + 1),
    }) : planned;
    const results: RandomResult[] = recipes.map((recipe, index) => ({ ...recipe, sequence: index + 1, status: "pending" }));
    patch({ results });
    setRunning(true);
    cancelRef.current = false;
    const fixedParams = { ...params, positivePrompt: session.basePrompt.trim(), stylePrompt: "", width: 512, height: 512, seedMode: "fixed" as const, seed: session.seed, qualityToggle: false };
    const extras = { vibeImages: [], charCaptions: [], preciseReferences: [] };
    try {
      const quote = await window.naiDesktop.quoteAnlas({ feature: "generate", params: fixedParams, extras, batchCount: results.length });
      setMessage(quote.ok && quote.amount !== undefined ? interpolate(text.quote, { amount: quote.amount }) : interpolate(text.quoteFail, { message: quote.message }));
    } catch (error: any) {
      setMessage(interpolate(text.quoteFail, { message: error?.message ?? String(error) }));
    }
    for (const result of results) {
      if (cancelRef.current) break;
      setSession((current) => ({ ...current, results: current.results.map((item) => item.id === result.id ? { ...item, status: "generating" } : item) }));
      try {
        const generated = await window.naiDesktop.generate({ ...fixedParams, stylePrompt: result.prompt }, extras);
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
  };

  const done = session.results.filter((result) => result.status === "done" || result.status === "failed").length;
  return <main className="artist-lab random-artist-lab">
    <header className="artist-lab-hero"><div><span className="eyebrow">{text.eyebrow}</span><h2>{text.title}</h2><p>{text.subtitle}</p></div><Button onClick={onBack}>{text.back}</Button></header>
    <section className="artist-lab-panel random-pool-summary"><div><h3>{text.pool}</h3><strong>{loading ? text.loading : interpolate(text.poolReady, { count: pool.length })}</strong><small>{text.rankingHint}</small></div><Button onClick={() => void loadPool(true)} disabled={loading}>{text.refresh}</Button></section>
    <section className="artist-lab-panel random-artist-settings">
      <label className="wide"><span>{text.basePrompt}</span><textarea value={session.basePrompt} onChange={(event) => patch({ basePrompt: event.target.value })} /><small>{text.baseHint}</small></label>
      <label className="wide"><span>{text.auxiliary}</span><textarea value={session.auxiliaryPrompt} onChange={(event) => patch({ auxiliaryPrompt: event.target.value })} /><small>{text.auxiliaryHint}</small></label>
      <label className="random-check wide"><input type="checkbox" checked={session.mutateAuxiliary} onChange={(event) => patch({ mutateAuxiliary: event.target.checked })} /><span><b>{text.mutate}</b><small>{text.mutateHint}</small></span></label>
      <label><span>{text.count}</span><input type="number" min={1} max={40} value={session.count} onChange={(event) => patch({ count: Math.max(1, Math.min(40, Number(event.target.value) || 1)) })} /></label>
      <fieldset><legend>{text.range}</legend><label><span>{text.min}</span><input type="number" min={1} max={24} value={session.minArtists} onChange={(event) => patch({ minArtists: Math.max(1, Math.min(24, Number(event.target.value) || 1)) })} /></label><label><span>{text.max}</span><input type="number" min={1} max={24} value={session.maxArtists} onChange={(event) => patch({ maxArtists: Math.max(1, Math.min(24, Number(event.target.value) || 1)) })} /></label></fieldset>
      <label><span>{text.seed}</span><input type="number" min={0} value={session.seed} onChange={(event) => patch({ seed: Math.max(0, Math.floor(Number(event.target.value) || 0)) })} /></label>
    </section>
    <section className="artist-lab-panel artist-queue-panel"><div className="artist-section-heading"><div><h3>{text.preview}</h3><small>{text.previewHint}</small></div><b>{planned.length}</b></div>{planned.length === 0 ? <div className="artist-queue-empty">{text.empty}</div> : <ol className="artist-combination-queue">{planned.map((recipe, index) => <li key={recipe.id}><span>#{String(index + 1).padStart(2, "0")}</span><code>{recipe.prompt}</code></li>)}</ol>}</section>
    <section className="artist-lab-actions">{running ? <Button variant="danger" onClick={() => { cancelRef.current = true; void window.naiDesktop.cancel(); setRunning(false); }}>{text.stop}</Button> : <Button variant="primary" onClick={() => void run(false)}>{text.generate}</Button>}<Button disabled={running || likedArtists.length === 0} onClick={() => void run(true)}>{text.refine}</Button><span>{running ? interpolate(text.running, { done, total: session.results.length }) : message}</span></section>
    {session.results.length > 0 && <section className="artist-candidate-grid">{session.results.map((result) => <article key={result.id} className={`artist-candidate ${result.status}`}><header className="artist-candidate-header"><b>#{String(result.sequence).padStart(2, "0")} · {result.artists.length} {text.artists}</b><span>{text[result.status]}</span></header><div className="artist-candidate-media">{result.image ? <img src={result.image.fileUrl} alt={result.prompt} /> : <div className="artist-candidate-placeholder">{text[result.status]}</div>}</div><div className="artist-string-block"><span><em>{result.artists.slice(0, 3).map((artist) => artist.name).join(" · ")}</em><button type="button" onClick={() => { void navigator.clipboard.writeText(result.prompt); setMessage(text.copied); }}>{text.copy}</button></span><code>{result.prompt}</code></div>{result.error && <small className="artist-error">{result.error}</small>}<div className="artist-candidate-actions"><Button variant="ghost" onClick={() => setSession((current) => ({ ...current, results: current.results.map((item) => item.id === result.id ? { ...item, liked: !item.liked } : item) }))}>{result.liked ? text.unlike : text.like}</Button><Button variant="primary" disabled={result.status !== "done"} onClick={() => { applyParams({ stylePrompt: result.prompt }); setMessage(text.applied); }}>{text.apply}</Button></div></article>)}</section>}
  </main>;
}
