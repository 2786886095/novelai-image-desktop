import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./components/ui";
import {
  expandArtistRecipeComparisons,
  generatePopularArtistRecipes,
  type ArtistRecipeComparison,
  type ArtistRecipeVariant,
  type GeneratedArtistRecipe,
  type StyleMutationCategory,
} from "./artist-recipe";
import { createArtistLabRandom, type ArtistTagRecord } from "./artist-lab";
import { useAppStore } from "./store";
import type { AppLanguage, HistoryItem } from "./types";

type RandomResult = ArtistRecipeComparison & {
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
  "zh-CN": { title: "随机画师串抽卡", subtitle: "每次抽卡重新组合画师、权重和可选风格词；内容、Seed 与生成参数保持不变。", back: "返回画风实验室", pool: "热门画师候选库", poolSize: "按热度载入前 N 名", load: "载入", ready: "已按热度载入前 {count} 名画师", loading: "正在读取热门画师…", refresh: "刷新排行", hint: "可选择 100～5000 名；热度采用 Danbooru 作品数，不等于独立使用人数。", base: "固定内容提示词", auxiliary: "固定附加词（每次都保留）", mutate: "抽卡时额外加入随机风格词", mutateHint: "开启后，每组使用同一画师串、提示词、Seed 和参数生成 A/B 两张：A 不加风格词，B 从画风、媒介/笔触、色彩、光影、氛围中抽取 2～6 个带 0.3～1.5 权重的词。", count: "本批画师串数量", range: "每串画师数量（最多 20 名）", min: "最少", max: "最多", seed: "固定 NovelAI Seed", draw: "重新抽卡", preview: "本批抽卡预览", previewHint: "开启随机风格词时，每组生成 A/B 两张对照图；重新抽卡会清除上一批未收藏的临时图片。", generate: "生成这一批", stop: "停止任务", refine: "根据喜欢项再抽卡", needPool: "画师池尚未载入。", needPrompt: "请填写固定内容提示词。", needLikes: "请先收藏至少一个喜欢项。", running: "正在生成 {done}/{total}", complete: "本批已完成；未收藏图片会在下一次抽卡时自动清理。", pending: "等待", generating: "生成中", done: "已完成", failed: "失败", like: "收藏到喜欢", saved: "已收藏", saving: "保存中…", retry: "重试", apply: "应用到生成", copy: "复制", copied: "已复制画师串。", applied: "已应用到生成页。", empty: "画师池加载后即可抽卡。", unlimited: "输入画师串组数；开启随机风格词时，实际图片数为两倍。", mutation: "本次风格/光影变异词", favorites: "喜欢的画风", favoritesHint: "A、B 可分别收藏；收藏 B 后，开启风格词的偏好抽卡也会参考其风格词与权重。", remove: "移除收藏", removed: "已移除收藏和本地图片。", categories: "艺术风格|媒介/笔触|色彩|光影|氛围", variantPlain: "A｜仅画师串", variantMutated: "B｜画师串＋随机风格词", copyArtists: "复制画师串", copyFull: "复制完整提示词", copiedArtists: "已复制画师串。", copiedFull: "已复制完整提示词。", pairSummary: "{pairs} 组 · {images} 张" },
  "zh-TW": { title: "隨機畫師串抽卡", subtitle: "每次抽卡重新組合畫師、權重與可選風格詞；內容、Seed 與生成參數保持不變。", back: "返回畫風實驗室", pool: "熱門畫師候選庫", poolSize: "依熱度載入前 N 名", load: "載入", ready: "已依熱度載入前 {count} 名畫師", loading: "正在讀取熱門畫師…", refresh: "更新排行", hint: "可選擇 100～5000 名；熱度採用 Danbooru 作品數，不等於獨立使用人數。", base: "固定內容提示詞", auxiliary: "固定附加詞（每次保留）", mutate: "抽卡時額外加入隨機風格詞", mutateHint: "開啟後，每組以相同畫師串、提示詞、Seed 與參數生成 A/B 兩張：A 不加風格詞，B 抽取 2～6 個帶 0.3～1.5 權重的畫風詞。", count: "本批畫師串組數", range: "每串畫師數量（最多 20 名）", min: "最少", max: "最多", seed: "固定 NovelAI Seed", draw: "重新抽卡", preview: "本批抽卡預覽", previewHint: "開啟隨機風格詞時每組生成 A/B 兩張；重新抽卡會清除未收藏暫存圖。", generate: "生成這一批", stop: "停止任務", refine: "依喜歡項再抽卡", needPool: "畫師池尚未載入。", needPrompt: "請填寫固定內容提示詞。", needLikes: "請先收藏至少一項。", running: "正在生成 {done}/{total}", complete: "本批已完成；未收藏圖片會於下次抽卡清理。", pending: "等待", generating: "生成中", done: "已完成", failed: "失敗", like: "收藏到喜歡", saved: "已收藏", saving: "儲存中…", retry: "重試", apply: "套用到生成", copy: "複製", copied: "已複製畫師串。", applied: "已套用到生成頁。", empty: "畫師池載入後即可抽卡。", unlimited: "輸入畫師串組數；開啟隨機風格詞時實際圖片數為兩倍。", mutation: "本次風格/光影變異詞", favorites: "喜歡的畫風", favoritesHint: "A、B 可分別收藏；收藏 B 後，偏好抽卡也會參考其風格詞與權重。", remove: "移除收藏", removed: "已移除收藏與本機圖片。", categories: "藝術風格|媒介/筆觸|色彩|光影|氛圍", variantPlain: "A｜僅畫師串", variantMutated: "B｜畫師串＋隨機風格詞", copyArtists: "複製畫師串", copyFull: "複製完整提示詞", copiedArtists: "已複製畫師串。", copiedFull: "已複製完整提示詞。", pairSummary: "{pairs} 組 · {images} 張" },
  "en-US": { title: "Random Artist-string Gacha", subtitle: "Every draw rerolls artists, weights, and optional style terms while content, seed, and generation settings stay fixed.", back: "Back to Artist Lab", pool: "Popular artist pool", poolSize: "Load top N by popularity", load: "Load", ready: "Loaded the top {count} artists", loading: "Loading popular artists…", refresh: "Refresh ranking", hint: "Choose 100–5000. Popularity is Danbooru post count, not unique-user count.", base: "Fixed content prompt", auxiliary: "Fixed extra terms (always kept)", mutate: "Add random style terms during the draw", mutateHint: "When enabled, each group creates a fair A/B pair with the same artist string, prompt, seed, and settings: A has no random style terms; B adds 2–6 terms weighted 0.3–1.5.", count: "Artist-string groups in this batch", range: "Artists per string (maximum 20)", min: "Minimum", max: "Maximum", seed: "Fixed NovelAI seed", draw: "Draw again", preview: "Current draw", previewHint: "Style mode creates two A/B images per group. Starting a new draw clears unliked temporary images.", generate: "Generate this batch", stop: "Stop", refine: "Draw from favorites", needPool: "The artist pool is not ready.", needPrompt: "Enter a fixed content prompt.", needLikes: "Save at least one favorite first.", running: "Generating {done}/{total}", complete: "Batch complete. Unliked images will be cleared by the next draw.", pending: "Pending", generating: "Generating", done: "Complete", failed: "Failed", like: "Save favorite", saved: "Saved", saving: "Saving…", retry: "Retry", apply: "Apply to Generate", copy: "Copy", copied: "Artist string copied.", applied: "Applied to Generate.", empty: "Draws appear after the pool loads.", unlimited: "Enter the number of artist-string groups. Style mode generates twice as many images.", mutation: "Style / lighting terms in this draw", favorites: "Favorite styles", favoritesHint: "A and B can be saved independently. Favorite B terms and weights can guide later style-enabled draws.", remove: "Remove favorite", removed: "Favorite and local image removed.", categories: "Art style|Medium / brushwork|Color|Lighting|Atmosphere", variantPlain: "A | Artist string only", variantMutated: "B | Artist string + random styles", copyArtists: "Copy artist string", copyFull: "Copy full prompt", copiedArtists: "Artist string copied.", copiedFull: "Full prompt copied.", pairSummary: "{pairs} groups · {images} images" },
  "ja-JP": { title: "ランダム画家タグ抽選", subtitle: "抽選ごとに画家・重み・任意の画風語を再構成し、内容・Seed・生成設定は固定します。", back: "画風ラボへ戻る", pool: "人気画家候補", poolSize: "人気順の上位 N 名", load: "読込", ready: "人気順上位 {count} 名を読込済み", loading: "人気画家を読込中…", refresh: "順位を更新", hint: "100～5000 名を指定可能。Danbooru作品数であり利用者数ではありません。", base: "固定内容プロンプト", auxiliary: "固定追加語（常に保持）", mutate: "抽選時に画風語を追加", mutateHint: "有効時は同じ画家列・プロンプト・Seed・設定で A/B を生成します。A は画風語なし、B は 0.3～1.5 重みの画風語を 2～6 個追加します。", count: "このバッチの画家列グループ数", range: "1組の画家数（最大20名）", min: "最小", max: "最大", seed: "固定 NovelAI Seed", draw: "再抽選", preview: "現在の抽選", previewHint: "画風語を有効にすると1組につき A/B の2枚を生成します。再抽選時に未保存画像を消去します。", generate: "このバッチを生成", stop: "停止", refine: "お気に入りから抽選", needPool: "画家候補が未準備です。", needPrompt: "固定内容を入力してください。", needLikes: "先に1件以上保存してください。", running: "生成中 {done}/{total}", complete: "完了。未保存画像は次回抽選時に消去されます。", pending: "待機", generating: "生成中", done: "完了", failed: "失敗", like: "お気に入り保存", saved: "保存済み", saving: "保存中…", retry: "再試行", apply: "生成へ適用", copy: "コピー", copied: "コピーしました。", applied: "生成へ適用しました。", empty: "候補読込後に抽選できます。", unlimited: "画家列の組数を入力します。画風語モードでは画像数が2倍になります。", mutation: "今回の画風・光変異語", favorites: "お気に入り画風", favoritesHint: "A/B は個別保存できます。B の画風語と重みは次の画風語抽選にも反映できます。", remove: "お気に入り削除", removed: "お気に入りと画像を削除しました。", categories: "画風|画材・筆致|色彩|光|雰囲気", variantPlain: "A｜画家列のみ", variantMutated: "B｜画家列＋ランダム画風語", copyArtists: "画家列をコピー", copyFull: "完全プロンプトをコピー", copiedArtists: "画家列をコピーしました。", copiedFull: "完全プロンプトをコピーしました。", pairSummary: "{pairs} 組 · {images} 枚" },
  "ko-KR": { title: "무작위 작가 조합 뽑기", subtitle: "매번 작가·가중치·선택적 화풍 용어를 다시 뽑고 내용·Seed·생성 설정은 고정합니다.", back: "화풍 실험실로", pool: "인기 작가 후보", poolSize: "인기순 상위 N명", load: "불러오기", ready: "인기순 상위 {count}명 로드됨", loading: "인기 작가 로딩 중…", refresh: "순위 새로고침", hint: "100～5000명을 선택할 수 있습니다. Danbooru 게시물 수이며 사용자 수가 아닙니다.", base: "고정 내용 프롬프트", auxiliary: "고정 추가 용어 (항상 유지)", mutate: "뽑을 때 무작위 화풍 용어 추가", mutateHint: "켜면 동일한 작가 문자열·프롬프트·Seed·설정으로 A/B를 생성합니다. A는 화풍 용어가 없고 B는 0.3～1.5 가중치의 용어 2～6개를 추가합니다.", count: "이번 배치 작가 문자열 그룹 수", range: "조합당 작가 수 (최대 20명)", min: "최소", max: "최대", seed: "고정 NovelAI Seed", draw: "다시 뽑기", preview: "현재 뽑기", previewHint: "화풍 용어를 켜면 그룹마다 A/B 두 장을 생성합니다. 다시 뽑으면 저장하지 않은 임시 이미지를 삭제합니다.", generate: "이 배치 생성", stop: "중지", refine: "즐겨찾기 기반 뽑기", needPool: "작가 풀이 준비되지 않았습니다.", needPrompt: "고정 프롬프트를 입력하세요.", needLikes: "먼저 하나 이상 저장하세요.", running: "생성 중 {done}/{total}", complete: "완료. 저장하지 않은 이미지는 다음 뽑기 때 삭제됩니다.", pending: "대기", generating: "생성 중", done: "완료", failed: "실패", like: "즐겨찾기 저장", saved: "저장됨", saving: "저장 중…", retry: "재시도", apply: "생성에 적용", copy: "복사", copied: "복사했습니다.", applied: "생성 화면에 적용했습니다.", empty: "풀 로드 후 뽑을 수 있습니다.", unlimited: "작가 문자열 그룹 수를 입력합니다. 화풍 용어 모드에서는 이미지 수가 두 배입니다.", mutation: "이번 화풍/조명 변이 용어", favorites: "좋아하는 화풍", favoritesHint: "A/B를 각각 저장할 수 있습니다. B의 화풍 용어와 가중치는 이후 화풍 추첨에도 반영됩니다.", remove: "즐겨찾기 제거", removed: "즐겨찾기와 로컬 이미지를 삭제했습니다.", categories: "화풍|매체/붓질|색상|조명|분위기", variantPlain: "A｜작가 문자열만", variantMutated: "B｜작가 문자열＋무작위 화풍", copyArtists: "작가 문자열 복사", copyFull: "전체 프롬프트 복사", copiedArtists: "작가 문자열을 복사했습니다.", copiedFull: "전체 프롬프트를 복사했습니다.", pairSummary: "{pairs} 그룹 · {images}장" },
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
  const likedMutations = session.mutateAuxiliary
    ? session.favorites.flatMap((item) => (item.variant ?? (item.mutations.length > 0 ? "mutated" : "plain")) === "mutated" ? item.mutations : [])
    : [];
  const poolKey = pool.map((artist) => `${artist.id}:${artist.postCount}`).join("|");
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
      favoriteMutations: session.mutateAuxiliary ? likedMutations : undefined,
      random: createArtistLabRandom(freshSeed()),
    }) : planned;
    const batchId = freshSeed().toString(36);
    const comparisons = expandArtistRecipeComparisons(recipes, session.mutateAuxiliary);
    const pending: RandomResult[] = comparisons.map((recipe, index) => ({
      ...recipe,
      id: `${batchId}-${recipe.id}`,
      pairId: `${batchId}-${recipe.pairId}`,
      sequence: session.mutateAuxiliary ? Math.floor(index / 2) + 1 : index + 1,
      status: "pending",
    }));
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
  const variantOf = (result: Pick<RandomResult, "variant" | "mutations">): ArtistRecipeVariant => result.variant ?? (result.mutations.length > 0 ? "mutated" : "plain");
  const artistString = (result: Pick<RandomResult, "artists">) => result.artists.map((artist) => `${artist.weight}::artist:${artist.name} ::`).join(", ");
  const renderMutationTerms = (result: GeneratedArtistRecipe) => result.mutations.length > 0 && <div className="artist-mutation-block"><b>{text.mutation}</b><div>{result.mutations.map((token, index) => <span key={`${token.value}-${index}`}><small>{categoryLabels[token.category]}</small>{token.weight}::{token.value}</span>)}</div></div>;
  const renderCard = (result: RandomResult, favorite = false) => {
    const variant = variantOf(result);
    return <article key={result.id} className={`artist-candidate ${result.status} artist-variant-${variant}`}><header className="artist-candidate-header"><b>#{String(result.sequence).padStart(2, "0")} · {variant === "mutated" ? text.variantMutated : text.variantPlain}</b><span>{favorite || result.liked ? text.saved : text[result.status]}</span></header><div className="artist-candidate-media">{result.image ? <img src={result.image.fileUrl} alt={`${variant === "mutated" ? text.variantMutated : text.variantPlain}: ${result.prompt}`} /> : <div className="artist-candidate-placeholder">{text[result.status]}</div>}</div>{renderMutationTerms(result)}<div className="artist-string-block"><div className="artist-copy-actions"><button type="button" onClick={() => { void navigator.clipboard.writeText(artistString(result)); setMessage(text.copiedArtists); }}>{text.copyArtists}</button><button type="button" onClick={() => { void navigator.clipboard.writeText(result.prompt); setMessage(text.copiedFull); }}>{text.copyFull}</button></div><code>{result.prompt}</code></div>{result.error && <small className="artist-error">{result.error}</small>}<div className="artist-candidate-actions">{favorite ? <Button variant="ghost" onClick={() => void removeFavorite(result)}>{text.remove}</Button> : result.status === "failed" ? <Button variant="ghost" disabled={running} onClick={() => void retry(result)}>{text.retry}</Button> : <Button variant="ghost" disabled={result.status !== "done" || result.liked || result.saving} onClick={() => void saveFavorite(result)}>{result.saving ? text.saving : result.liked ? text.saved : text.like}</Button>}<Button variant="primary" disabled={result.status !== "done"} onClick={() => { applyParams({ stylePrompt: result.prompt }); setMessage(text.applied); }}>{text.apply}</Button></div></article>;
  };

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
    <section className="artist-lab-panel artist-queue-panel"><div className="artist-section-heading"><div><h3>{text.preview}</h3><small>{text.previewHint}</small></div><div className="artist-preview-actions"><b>{interpolate(text.pairSummary, { pairs: planned.length, images: plannedComparisons.length })}</b><Button onClick={() => void draw(false)} disabled={running || pool.length === 0}>{text.draw}</Button></div></div>{planned.length === 0 ? <div className="artist-queue-empty">{text.empty}</div> : <ol className="artist-combination-queue">{planned.map((recipe, index) => <li key={recipe.id}><span>#{String(index + 1).padStart(2, "0")}</span><div><b className="artist-ab-label">{text.variantPlain}</b><code>{recipe.basePrompt}</code>{session.mutateAuxiliary && <><b className="artist-ab-label">{text.variantMutated}</b><code>{recipe.prompt}</code>{renderMutationTerms(recipe)}</>}</div></li>)}</ol>}</section>
    <section className="artist-lab-actions">{running ? <Button variant="danger" onClick={() => { cancelRef.current = true; void window.naiDesktop.cancel(); }}>{text.stop}</Button> : <Button variant="primary" onClick={() => void run(false)}>{text.generate}</Button>}<Button disabled={running || likedArtists.length === 0} onClick={() => void draw(true)}>{text.refine}</Button><span>{running ? interpolate(text.running, { done: batchDone, total: session.results.length }) : message}</span></section>
    {session.results.length > 0 && <section className="artist-candidate-grid">{session.results.map((result) => renderCard(result))}</section>}
    {session.favorites.length > 0 && <section className="artist-lab-panel artist-favorites-panel"><div className="artist-section-heading"><div><h3>{text.favorites}</h3><small>{text.favoritesHint}</small></div><b>{session.favorites.length}</b></div><div className="artist-candidate-grid">{session.favorites.map((result) => renderCard(result, true))}</div></section>}
  </main>;
}
