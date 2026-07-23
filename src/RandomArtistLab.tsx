import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./components/ui";
import { generatePopularArtistRecipes, type GeneratedArtistRecipe, type StyleMutationCategory } from "./artist-recipe";
import { createArtistLabRandom, type ArtistTagRecord } from "./artist-lab";
import { useAppStore } from "./store";
import type { AppLanguage, HistoryItem } from "./types";

type RandomResult = GeneratedArtistRecipe & {
  sequence: number;
  status: "pending" | "generating" | "done" | "failed";
  image?: HistoryItem;
  error?: string;
  liked?: boolean;
  saving?: boolean;
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
  results: RandomResult[];
  favorites: RandomResult[];
};

const STORAGE_KEY = "langbai.artist-lab.random.v4";
let sessionCache: RandomSession | null = null;

const TEXT = {
  "zh-CN": { title: "随机画师串抽卡", subtitle: "每次抽卡重新组合画师、权重和可选风格词；内容、Seed 与生成参数保持不变。", back: "返回画风实验室", pool: "热门画师候选库", poolSize: "按热度载入前 N 名", load: "载入", ready: "已按热度载入前 {count} 名画师", loading: "正在读取热门画师…", refresh: "刷新排行", hint: "可选择 100～5000 名；热度采用 Danbooru 作品数，不等于独立使用人数。", base: "固定内容提示词", auxiliary: "固定附加词（每次都保留）", mutate: "抽卡时额外加入随机风格词", mutateHint: "开启后，每个组合在抽卡阶段从艺术风格、媒介/笔触、色彩、光照、氛围中抽取 2～6 个词，并分配 0.3～1.5 权重；生成时直接使用该组合。", count: "本批生成数量", range: "每串画师数量（最多 20 名）", min: "最少", max: "最多", seed: "固定 NovelAI Seed", draw: "重新抽卡", preview: "本批抽卡预览", previewHint: "只抽画师名和权重，不下载代表图。重新抽卡会清除上一批未收藏的临时图片。", generate: "生成这一批", stop: "停止任务", refine: "根据喜欢项再抽卡", needPool: "画师池尚未载入。", needPrompt: "请填写固定内容提示词。", needLikes: "请先收藏至少一个喜欢项。", running: "正在生成 {done}/{total}", complete: "本批已完成；未收藏图片会在下一次抽卡时自动清理。", pending: "等待", generating: "生成中", done: "已完成", failed: "失败", like: "收藏到喜欢", saved: "已收藏", saving: "保存中…", retry: "重试", apply: "应用到生成", copy: "复制", copied: "已复制画师串。", applied: "已应用到生成页。", empty: "画师池加载后即可抽卡。", unlimited: "请输入任意正整数；数量越大，耗时和接口请求越多。", mutation: "本次风格/光影变异词", favorites: "喜欢的画风", favoritesHint: "收藏图片已转入永久目录；未收藏结果只保留在临时缓存。", remove: "移除收藏", removed: "已移除收藏和本地图片。", categories: "艺术风格|媒介/笔触|色彩|光照|氛围" },
  "zh-TW": { title: "隨機畫師串抽卡", subtitle: "每次抽卡重新組合畫師、權重與可選風格詞；內容、Seed 與生成參數保持不變。", back: "返回畫風實驗室", pool: "熱門畫師候選庫", poolSize: "依熱度載入前 N 名", load: "載入", ready: "已依熱度載入前 {count} 名畫師", loading: "正在讀取熱門畫師…", refresh: "更新排行", hint: "可選擇 100～5000 名；熱度採用 Danbooru 作品數，不等於獨立使用人數。", base: "固定內容提示詞", auxiliary: "固定附加詞（每次保留）", mutate: "抽卡時額外加入隨機風格詞", mutateHint: "開啟後，每個組合會在抽卡階段從藝術風格、媒介/筆觸、色彩、光照、氛圍抽取 2～6 個詞，並配置 0.3～1.5 權重。", count: "本批生成數量", range: "每串畫師數量（最多 20 名）", min: "最少", max: "最多", seed: "固定 NovelAI Seed", draw: "重新抽卡", preview: "本批抽卡預覽", previewHint: "只抽畫師名和權重，不下載代表圖；重新抽卡會清除未收藏暫存圖。", generate: "生成這一批", stop: "停止任務", refine: "依喜歡項再抽卡", needPool: "畫師池尚未載入。", needPrompt: "請填寫固定內容提示詞。", needLikes: "請先收藏至少一項。", running: "正在生成 {done}/{total}", complete: "本批已完成；未收藏圖片會於下次抽卡清理。", pending: "等待", generating: "生成中", done: "已完成", failed: "失敗", like: "收藏到喜歡", saved: "已收藏", saving: "儲存中…", retry: "重試", apply: "套用到生成", copy: "複製", copied: "已複製畫師串。", applied: "已套用到生成頁。", empty: "畫師池載入後即可抽卡。", unlimited: "可輸入任意正整數；數量越大，耗時與請求越多。", mutation: "本次風格/光影變異詞", favorites: "喜歡的畫風", favoritesHint: "收藏圖片已移至永久目錄；未收藏結果只保留於暫存。", remove: "移除收藏", removed: "已移除收藏與本機圖片。", categories: "藝術風格|媒介/筆觸|色彩|光照|氛圍" },
  "en-US": { title: "Random Artist-string Gacha", subtitle: "Every draw rerolls artists, weights, and optional style terms while content, seed, and generation settings stay fixed.", back: "Back to Artist Lab", pool: "Popular artist pool", poolSize: "Load top N by popularity", load: "Load", ready: "Loaded the top {count} artists", loading: "Loading popular artists…", refresh: "Refresh ranking", hint: "Choose 100–5000. Popularity is Danbooru post count, not unique-user count.", base: "Fixed content prompt", auxiliary: "Fixed extra terms (always kept)", mutate: "Add random style terms during the draw", mutateHint: "Each draw adds 2–6 weighted terms (0.3–1.5) from art style, medium/brushwork, color, lighting, and atmosphere; generation uses that exact recipe.", count: "Images in this batch", range: "Artists per string (maximum 20)", min: "Minimum", max: "Maximum", seed: "Fixed NovelAI seed", draw: "Draw again", preview: "Current draw", previewHint: "Only artist names and weights are drawn. Starting a new draw clears unliked temporary images.", generate: "Generate this batch", stop: "Stop", refine: "Draw from favorites", needPool: "The artist pool is not ready.", needPrompt: "Enter a fixed content prompt.", needLikes: "Save at least one favorite first.", running: "Generating {done}/{total}", complete: "Batch complete. Unliked images will be cleared by the next draw.", pending: "Pending", generating: "Generating", done: "Complete", failed: "Failed", like: "Save favorite", saved: "Saved", saving: "Saving…", retry: "Retry", apply: "Apply to Generate", copy: "Copy", copied: "Artist string copied.", applied: "Applied to Generate.", empty: "Draws appear after the pool loads.", unlimited: "Enter any positive integer. Larger batches take longer and make more API requests.", mutation: "Style / lighting terms in this draw", favorites: "Favorite styles", favoritesHint: "Favorites are moved to permanent storage; unliked results remain temporary.", remove: "Remove favorite", removed: "Favorite and local image removed.", categories: "Art style|Medium / brushwork|Color|Lighting|Atmosphere" },
  "ja-JP": { title: "ランダム画家タグ抽選", subtitle: "抽選ごとに画家・重み・任意の画風語を再構成し、内容・Seed・生成設定は固定します。", back: "画風ラボへ戻る", pool: "人気画家候補", poolSize: "人気順の上位 N 名", load: "読込", ready: "人気順上位 {count} 名を読込済み", loading: "人気画家を読込中…", refresh: "順位を更新", hint: "100～5000 名を指定可能。Danbooru作品数であり利用者数ではありません。", base: "固定内容プロンプト", auxiliary: "固定追加語（常に保持）", mutate: "抽選時に画風語を追加", mutateHint: "抽選時に画風、画材/筆致、色彩、光、雰囲気から 2～6 語を選び、0.3～1.5 の重みを付けます。", count: "このバッチの枚数", range: "1組の画家数（最大20名）", min: "最小", max: "最大", seed: "固定 NovelAI Seed", draw: "再抽選", preview: "現在の抽選", previewHint: "代表画像は取得しません。再抽選すると未保存の一時画像を消去します。", generate: "このバッチを生成", stop: "停止", refine: "お気に入りから抽選", needPool: "画家候補が未準備です。", needPrompt: "固定内容を入力してください。", needLikes: "先に1件以上保存してください。", running: "生成中 {done}/{total}", complete: "完了。未保存画像は次回抽選時に消去されます。", pending: "待機", generating: "生成中", done: "完了", failed: "失敗", like: "お気に入り保存", saved: "保存済み", saving: "保存中…", retry: "再試行", apply: "生成へ適用", copy: "コピー", copied: "コピーしました。", applied: "生成へ適用しました。", empty: "候補読込後に抽選できます。", unlimited: "任意の正整数を入力できます。大きいほど時間と通信量が増えます。", mutation: "今回の画風・光変異語", favorites: "お気に入り画風", favoritesHint: "お気に入りは永久保存し、それ以外は一時キャッシュのみです。", remove: "お気に入り削除", removed: "お気に入りと画像を削除しました。", categories: "画風|画材・筆致|色彩|光|雰囲気" },
  "ko-KR": { title: "무작위 작가 조합 뽑기", subtitle: "매번 작가·가중치·선택적 화풍 용어를 다시 뽑고 내용·Seed·생성 설정은 고정합니다.", back: "화풍 실험실로", pool: "인기 작가 후보", poolSize: "인기순 상위 N명", load: "불러오기", ready: "인기순 상위 {count}명 로드됨", loading: "인기 작가 로딩 중…", refresh: "순위 새로고침", hint: "100～5000명을 선택할 수 있습니다. Danbooru 게시물 수이며 사용자 수가 아닙니다.", base: "고정 내용 프롬프트", auxiliary: "고정 추가 용어 (항상 유지)", mutate: "뽑을 때 무작위 화풍 용어 추가", mutateHint: "화풍, 매체/붓질, 색상, 조명, 분위기에서 2～6개를 뽑고 0.3～1.5 가중치를 부여합니다.", count: "이번 배치 수", range: "조합당 작가 수 (최대 20명)", min: "최소", max: "최대", seed: "고정 NovelAI Seed", draw: "다시 뽑기", preview: "현재 뽑기", previewHint: "대표 이미지는 받지 않습니다. 다시 뽑으면 저장하지 않은 임시 이미지를 삭제합니다.", generate: "이 배치 생성", stop: "중지", refine: "즐겨찾기 기반 뽑기", needPool: "작가 풀이 준비되지 않았습니다.", needPrompt: "고정 프롬프트를 입력하세요.", needLikes: "먼저 하나 이상 저장하세요.", running: "생성 중 {done}/{total}", complete: "완료. 저장하지 않은 이미지는 다음 뽑기 때 삭제됩니다.", pending: "대기", generating: "생성 중", done: "완료", failed: "실패", like: "즐겨찾기 저장", saved: "저장됨", saving: "저장 중…", retry: "재시도", apply: "생성에 적용", copy: "복사", copied: "복사했습니다.", applied: "생성 화면에 적용했습니다.", empty: "풀 로드 후 뽑을 수 있습니다.", unlimited: "임의의 양의 정수를 입력할 수 있습니다. 수가 크면 시간과 요청이 늘어납니다.", mutation: "이번 화풍/조명 변이 용어", favorites: "좋아하는 화풍", favoritesHint: "즐겨찾기는 영구 저장되고 나머지는 임시 캐시에만 보관됩니다.", remove: "즐겨찾기 제거", removed: "즐겨찾기와 로컬 이미지를 삭제했습니다.", categories: "화풍|매체/붓질|색상|조명|분위기" },
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

function restore(basePrompt: string): RandomSession {
  if (sessionCache) return sessionCache;
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<RandomSession> | null;
    sessionCache = {
      basePrompt: typeof raw?.basePrompt === "string" ? raw.basePrompt : basePrompt,
      auxiliaryPrompt: typeof raw?.auxiliaryPrompt === "string" ? raw.auxiliaryPrompt : "",
      count: positiveInteger(raw?.count, 8),
      artistCount: Math.max(1, Math.min(20, positiveInteger(raw?.artistCount, 8))),
      poolSize: clampPoolSize(raw?.poolSize),
      seed: Math.max(0, Math.floor(Number(raw?.seed) || 246813579)),
      drawSeed: positiveInteger(raw?.drawSeed, freshSeed()),
      mutateAuxiliary: raw?.mutateAuxiliary === true,
      biasFavorites: raw?.biasFavorites === true,
      results: Array.isArray(raw?.results) ? raw.results : [],
      favorites: Array.isArray(raw?.favorites) ? raw.favorites : [],
    };
  } catch {
    sessionCache = { basePrompt, auxiliaryPrompt: "", count: 8, artistCount: 8, poolSize: 1000, seed: 246813579, drawSeed: freshSeed(), mutateAuxiliary: false, biasFavorites: false, results: [], favorites: [] };
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

  const likedArtists = session.favorites.flatMap((item) => item.artists.map((artist) => artist.name));
  const poolKey = pool.map((artist) => `${artist.id}:${artist.postCount}`).join("|");
  const planned = useMemo(() => generatePopularArtistRecipes(pool, {
    count: session.count,
    minArtists: session.artistCount,
    maxArtists: session.artistCount,
    auxiliaryPrompt: session.auxiliaryPrompt,
    mutateAuxiliary: session.mutateAuxiliary,
    favoriteArtists: session.biasFavorites ? likedArtists : undefined,
    random: createArtistLabRandom(session.drawSeed),
  }), [poolKey, session.count, session.artistCount, session.auxiliaryPrompt, session.mutateAuxiliary, session.biasFavorites, likedArtists.join("|"), session.drawSeed]);

  const clearCurrent = async () => {
    const temporary = session.results.filter((item) => !item.liked && item.image?.filePath).map((item) => item.image!.filePath);
    await Promise.allSettled(temporary.map((filePath) => window.naiDesktop.artistLabDeleteTemporary(filePath)));
    patch({ results: [] });
  };

  const draw = async (fromLikes = false) => {
    if (fromLikes && likedArtists.length === 0) return setMessage(text.needLikes);
    await clearCurrent();
    patch({ drawSeed: freshSeed() + (fromLikes ? likedArtists.length : 0), biasFavorites: fromLikes });
  };

  const fixedParams = () => ({ ...params, positivePrompt: session.basePrompt.trim(), stylePrompt: "", width: 512, height: 512, seedMode: "fixed" as const, seed: session.seed, qualityToggle: false });
  const extras = { vibeImages: [], charCaptions: [], preciseReferences: [] };

  const generateOne = async (recipe: RandomResult) => {
    const id = recipe.id;
    setSession((current) => ({ ...current, results: current.results.map((item) => item.id === id ? { ...item, status: "generating", error: undefined } : item) }));
    try {
      const generated = await window.naiDesktop.generateArtistLab({ ...fixedParams(), stylePrompt: recipe.prompt }, extras, "random");
      const image = generated.items[0];
      if (!generated.ok || !image) throw new Error(generated.message);
      setSession((current) => ({ ...current, results: current.results.map((item) => item.id === id ? { ...item, image, status: "done", error: undefined } : item) }));
    } catch (error: any) {
      setSession((current) => ({ ...current, results: current.results.map((item) => item.id === id ? { ...item, status: "failed", error: error?.message ?? String(error) } : item) }));
    }
  };

  const run = async (fromLikes = false) => {
    if (pool.length === 0) return setMessage(text.needPool);
    if (!session.basePrompt.trim()) return setMessage(text.needPrompt);
    if (fromLikes && likedArtists.length === 0) return setMessage(text.needLikes);
    await clearCurrent();
    const recipes = fromLikes ? generatePopularArtistRecipes(pool, {
      count: session.count,
      minArtists: session.artistCount,
      maxArtists: session.artistCount,
      auxiliaryPrompt: session.auxiliaryPrompt,
      mutateAuxiliary: session.mutateAuxiliary,
      favoriteArtists: likedArtists,
      random: createArtistLabRandom(freshSeed()),
    }) : planned;
    const batchId = freshSeed().toString(36);
    const pending: RandomResult[] = recipes.map((recipe, index) => ({ ...recipe, id: `${batchId}-${recipe.id}`, sequence: index + 1, status: "pending" }));
    patch({ results: pending });
    setRunning(true);
    cancelRef.current = false;
    for (const result of pending) {
      if (cancelRef.current) break;
      await generateOne(result);
    }
    setRunning(false);
    await Promise.allSettled([refreshAccount()]);
    if (!cancelRef.current) setMessage(text.complete);
  };

  const retry = async (result: RandomResult) => {
    if (running || result.status !== "failed") return;
    setRunning(true);
    cancelRef.current = false;
    await generateOne(result);
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
    await window.naiDesktop.deleteHistory(result.image.id);
    setSession((current) => ({
      ...current,
      favorites: current.favorites.filter((item) => item.id !== result.id),
      results: current.results.filter((item) => item.id !== result.id),
    }));
    await refreshHistory();
    setMessage(text.removed);
  };

  const batchDone = session.results.filter((item) => item.status === "done" || item.status === "failed").length;
  const renderMutationTerms = (result: GeneratedArtistRecipe) => result.mutations.length > 0 && <div className="artist-mutation-block"><b>{text.mutation}</b><div>{result.mutations.map((token, index) => <span key={`${token.value}-${index}`}><small>{categoryLabels[token.category]}</small>{token.weight}::{token.value}</span>)}</div></div>;
  const renderCard = (result: RandomResult, favorite = false) => <article key={result.id} className={`artist-candidate ${result.status}`}><header className="artist-candidate-header"><b>#{String(result.sequence).padStart(2, "0")} · {result.artists.length}</b><span>{favorite || result.liked ? text.saved : text[result.status]}</span></header><div className="artist-candidate-media">{result.image ? <img src={result.image.fileUrl} alt={result.prompt} /> : <div className="artist-candidate-placeholder">{text[result.status]}</div>}</div>{renderMutationTerms(result)}<div className="artist-string-block"><button type="button" onClick={() => { void navigator.clipboard.writeText(result.prompt); setMessage(text.copied); }}>{text.copy}</button><code>{result.prompt}</code></div>{result.error && <small className="artist-error">{result.error}</small>}<div className="artist-candidate-actions">{favorite ? <Button variant="ghost" onClick={() => void removeFavorite(result)}>{text.remove}</Button> : result.status === "failed" ? <Button variant="ghost" disabled={running} onClick={() => void retry(result)}>{text.retry}</Button> : <Button variant="ghost" disabled={result.status !== "done" || result.liked || result.saving} onClick={() => void saveFavorite(result)}>{result.saving ? text.saving : result.liked ? text.saved : text.like}</Button>}<Button variant="primary" disabled={result.status !== "done"} onClick={() => { applyParams({ stylePrompt: result.prompt }); setMessage(text.applied); }}>{text.apply}</Button></div></article>;

  return <main className="artist-lab random-artist-lab">
    <header className="artist-lab-hero"><div><h2>{text.title}</h2><p>{text.subtitle}</p></div><Button onClick={onBack}>{text.back}</Button></header>
    <section className="artist-lab-panel random-pool-summary"><div><h3>{text.pool}</h3><strong>{loading ? text.loading : interpolate(text.ready, { count: pool.length })}</strong><small>{text.hint}</small></div><div className="artist-pool-actions"><label><span>{text.poolSize}</span><input type="number" min={100} max={5000} step={100} value={session.poolSize} onChange={(event) => patch({ poolSize: clampPoolSize(event.target.value) })} /></label><Button onClick={() => void loadPool(false)} disabled={loading}>{text.load}</Button><Button onClick={() => void loadPool(true)} disabled={loading}>{text.refresh}</Button></div></section>
    <section className="artist-lab-panel random-artist-settings">
      <label className="wide"><span>{text.base}</span><textarea value={session.basePrompt} onChange={(event) => patch({ basePrompt: event.target.value })} /></label>
      <label className="wide"><span>{text.auxiliary}</span><textarea value={session.auxiliaryPrompt} onChange={(event) => patch({ auxiliaryPrompt: event.target.value })} /></label>
      <label className="random-check wide"><input type="checkbox" checked={session.mutateAuxiliary} onChange={(event) => patch({ mutateAuxiliary: event.target.checked })} /><span><b>{text.mutate}</b><small>{text.mutateHint}</small></span></label>
      <label><span>{text.count}</span><input type="number" min={1} value={session.count} onChange={(event) => patch({ count: positiveInteger(event.target.value, 1) })} /><small>{text.unlimited}</small></label>
      <label><span>{text.range}</span><input type="number" min={1} max={20} value={session.artistCount} onChange={(event) => patch({ artistCount: Math.min(20, positiveInteger(event.target.value, 1)) })} /></label>
      <label><span>{text.seed}</span><input type="number" min={0} value={session.seed} onChange={(event) => patch({ seed: Math.max(0, Math.floor(Number(event.target.value) || 0)) })} /></label>
    </section>
    <section className="artist-lab-panel artist-queue-panel"><div className="artist-section-heading"><div><h3>{text.preview}</h3><small>{text.previewHint}</small></div><div className="artist-preview-actions"><b>{planned.length}</b><Button onClick={() => void draw(false)} disabled={running || pool.length === 0}>{text.draw}</Button></div></div>{planned.length === 0 ? <div className="artist-queue-empty">{text.empty}</div> : <ol className="artist-combination-queue">{planned.map((recipe, index) => <li key={recipe.id}><span>#{String(index + 1).padStart(2, "0")}</span><div><code>{recipe.prompt}</code>{renderMutationTerms(recipe)}</div></li>)}</ol>}</section>
    <section className="artist-lab-actions">{running ? <Button variant="danger" onClick={() => { cancelRef.current = true; void window.naiDesktop.cancel(); }}>{text.stop}</Button> : <Button variant="primary" onClick={() => void run(false)}>{text.generate}</Button>}<Button disabled={running || likedArtists.length === 0} onClick={() => void draw(true)}>{text.refine}</Button><span>{running ? interpolate(text.running, { done: batchDone, total: session.results.length }) : message}</span></section>
    {session.results.length > 0 && <section className="artist-candidate-grid">{session.results.map((result) => renderCard(result))}</section>}
    {session.favorites.length > 0 && <section className="artist-lab-panel artist-favorites-panel"><div className="artist-section-heading"><div><h3>{text.favorites}</h3><small>{text.favoritesHint}</small></div><b>{session.favorites.length}</b></div><div className="artist-candidate-grid">{session.favorites.map((result) => renderCard(result, true))}</div></section>}
  </main>;
}
