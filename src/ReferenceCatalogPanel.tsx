import { useEffect, useMemo, useState } from "react";
import { Button } from "./components/ui";
import { useAppStore } from "./store";
import type { AppLanguage, ReferencePresetLibrary } from "./types";
import {
  catalogName,
  catalogSearchText,
  fetchReferenceAsset,
  formatCatalogBytes,
  loadReferenceCatalog,
  type ReferenceCatalogAsset,
  type ReferenceCatalogManifest,
} from "./referenceCatalog";

const COPY = {
  "zh-CN": { title: "在线角色精准参考库", hint: "只下载 NovelAI 精准参考图；每个角色/形态只保留一个最佳尺寸，优先使用 Gitee 大陆线路。", search: "搜索角色、形态或游戏", game: "游戏", category: "分类", all: "全部", inGame: "游戏内角色图", illustration: "角色立绘", resource: "角色资源", load: "读取在线目录", loading: "正在读取…", retry: "重试", download: "下载到本机", downloaded: "已下载", size: "大小", progress: "下载进度", noResult: "没有匹配的角色", unavailable: "在线目录暂不可用", downloadedToast: "精准参考图已下载到本机预设库。" },
  "zh-TW": { title: "線上角色精準參考庫", hint: "只下載 NovelAI 精準參考圖；每個角色／形態只保留一個最佳尺寸，優先使用 Gitee 中國大陸線路。", search: "搜尋角色、形態或遊戲", game: "遊戲", category: "分類", all: "全部", inGame: "遊戲內角色圖", illustration: "角色立繪", resource: "角色資源", load: "讀取線上目錄", loading: "讀取中…", retry: "重試", download: "下載到本機", downloaded: "已下載", size: "大小", progress: "下載進度", noResult: "找不到符合的角色", unavailable: "線上目錄暫時無法使用", downloadedToast: "精準參考圖已下載到本機預設庫。" },
  "en-US": { title: "Online Precise Reference Library", hint: "Downloads precise references only. One best size is kept per character/form, with Gitee preferred in mainland China.", search: "Search character, form, or game", game: "Game", category: "Category", all: "All", inGame: "In-game", illustration: "Illustration", resource: "Character resources", load: "Load online catalog", loading: "Loading…", retry: "Retry", download: "Download locally", downloaded: "Downloaded", size: "Size", progress: "Download progress", noResult: "No matching characters", unavailable: "Online catalog unavailable", downloadedToast: "Precise reference downloaded to the local preset library." },
  "ja-JP": { title: "オンライン精密参照ライブラリ", hint: "精密参照のみをダウンロードします。キャラクター／形態ごとに最適なサイズを1つ保持し、中国本土では Gitee を優先します。", search: "キャラクター・形態・ゲームを検索", game: "ゲーム", category: "分類", all: "すべて", inGame: "ゲーム内", illustration: "立ち絵", resource: "キャラクター素材", load: "オンラインカタログを読む", loading: "読込中…", retry: "再試行", download: "端末に保存", downloaded: "保存済み", size: "サイズ", progress: "ダウンロード", noResult: "一致するキャラクターがありません", unavailable: "オンラインカタログを利用できません", downloadedToast: "精密参照をローカルプリセットに保存しました。" },
  "ko-KR": { title: "온라인 정밀 참조 라이브러리", hint: "정밀 참조만 다운로드합니다. 캐릭터/형태마다 최적 크기 하나만 유지하며 중국 본토에서는 Gitee를 우선합니다.", search: "캐릭터·형태·게임 검색", game: "게임", category: "분류", all: "전체", inGame: "게임 내", illustration: "일러스트", resource: "캐릭터 리소스", load: "온라인 카탈로그 불러오기", loading: "불러오는 중…", retry: "재시도", download: "기기에 저장", downloaded: "저장됨", size: "크기", progress: "다운로드 진행", noResult: "일치하는 캐릭터가 없습니다", unavailable: "온라인 카탈로그를 사용할 수 없습니다", downloadedToast: "정밀 참조를 로컬 프리셋에 저장했습니다." },
} as const;

function textFor(language: AppLanguage | undefined) { return COPY[language && language in COPY ? language : "zh-CN"]; }
function base64FromBytes(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  return btoa(binary);
}
export default function ReferenceCatalogPanel({ library, onDownloaded }: { library: ReferencePresetLibrary; onDownloaded?: () => void }) {
  const language = useAppStore((state) => state.settings?.language) as AppLanguage | undefined;
  const setToast = useAppStore((state) => state.setToast);
  const text = textFor(language);
  const [catalog, setCatalog] = useState<ReferenceCatalogManifest | null>(null);
  const [query, setQuery] = useState("");
  const [game, setGame] = useState("__all__");
  const [category, setCategory] = useState("__all__");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [active, setActive] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true); setError("");
    try { setCatalog(await loadReferenceCatalog()); } catch (reason) { setError(reason instanceof Error ? reason.message : text.unavailable); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const gameOptions = useMemo(() => catalog?.games ?? [...new Set((catalog?.assets ?? []).map((item) => item.game))].sort().map((id) => ({ id, names: undefined, categories: [...new Set((catalog?.assets ?? []).filter((asset) => asset.game === id).map((asset) => asset.category))] })), [catalog]);
  const availableCategories = useMemo(() => game === "__all__"
    ? [...new Set((catalog?.assets ?? []).map((asset) => asset.category))]
    : gameOptions.find((item) => item.id === game)?.categories ?? [], [catalog, game, gameOptions]);
  const localizedGame = (gameId: string) => {
    const record = gameOptions.find((item) => item.id === gameId);
    return record?.names?.[language ?? "zh-CN"] || record?.names?.["zh-CN"] || gameId;
  };
  const localizedCategory = (value: string) => value === "游戏内角色图" ? text.inGame : value === "角色立绘" ? text.illustration : text.resource;
  const assets = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (catalog?.assets ?? []).filter((item) =>
      (game === "__all__" || item.game === game) &&
      (category === "__all__" || item.category === category) &&
      (!needle || catalogSearchText(item).includes(needle)),
    );
  }, [catalog, category, game, query]);
  const downloadedIds = useMemo(() => new Set(library.presets.map((item) => item.sourceId).filter(Boolean)), [library.presets]);

  const download = async (asset: ReferenceCatalogAsset) => {
    if (active[asset.id] || downloadedIds.has(asset.id)) return;
    setActive((current) => ({ ...current, [asset.id]: true }));
    setProgress((current) => ({ ...current, [asset.id]: 0 }));
    try {
      const bytes = await fetchReferenceAsset(asset, (loaded, total) => setProgress((current) => ({ ...current, [asset.id]: total ? Math.min(100, Math.round(loaded / total * 100)) : 0 })));
      const result = await window.naiDesktop.saveReferencePreset({
        name: catalogName(asset, language), group: `${localizedGame(asset.game)} · ${localizedCategory(asset.category)}`, kind: "precise",
        base64: base64FromBytes(bytes), extension: ".png", sourceId: asset.id,
        preciseType: "character", strength: 1, fidelity: 1, informationExtracted: 1, width: asset.width, height: asset.height,
      });
      if (!result.ok) throw new Error(result.message || "Download failed");
      setProgress((current) => ({ ...current, [asset.id]: 100 }));
      setToast(text.downloadedToast); onDownloaded?.();
    } catch (reason) { setToast(reason instanceof Error ? reason.message : text.unavailable); }
    finally { setActive((current) => ({ ...current, [asset.id]: false })); }
  };

  return <section className="reference-catalog-panel panel-card">
    <header className="reference-preset-section-heading">
      <div><h3>{text.title}</h3><p>{text.hint}</p></div>
      <Button onClick={() => void load()} disabled={loading}>{loading ? text.loading : catalog ? text.retry : text.load}</Button>
    </header>
    {error && <div className="reference-catalog-error"><span>{text.unavailable}</span><small>{error}</small><Button onClick={() => void load()}>{text.retry}</Button></div>}
    {catalog && <>
      <div className="reference-catalog-toolbar">
        <input type="search" value={query} placeholder={text.search} onChange={(event) => setQuery(event.target.value)} />
        <label><span>{text.game}</span><select value={game} onChange={(event) => { setGame(event.target.value); setCategory("__all__"); }}><option value="__all__">{text.all}</option>{gameOptions.map((item) => <option value={item.id} key={item.id}>{localizedGame(item.id)}</option>)}</select></label>
        {(game === "__all__" || availableCategories.length > 1) && <label><span>{text.category}</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="__all__">{text.all}</option>{availableCategories.map((item) => <option value={item} key={item}>{localizedCategory(item)}</option>)}</select></label>}
      </div>
      <div className="reference-catalog-grid">
        {assets.map((asset) => {
          const percent = progress[asset.id] ?? 0; const busy = Boolean(active[asset.id]); const done = downloadedIds.has(asset.id);
          return <article className="reference-catalog-card" key={asset.id}>
            <div className="reference-catalog-thumb"><img src={asset.thumbnailMirrors?.gitee || asset.thumbnailUrl || asset.downloadUrl} onError={(event) => { const fallback = asset.thumbnailMirrors?.github || asset.downloadMirrors?.github; if (fallback && event.currentTarget.src !== fallback) event.currentTarget.src = fallback; }} alt={catalogName(asset, language)} loading="lazy" /></div>
            <div className="reference-catalog-card-body"><strong>{catalogName(asset, language)}</strong><small>{localizedGame(asset.game)} · {localizedCategory(asset.category)}</small><small>{asset.width}×{asset.height} · {text.size} {formatCatalogBytes(asset.bytes)}</small>
              {busy && <div className="reference-catalog-progress" aria-label={`${text.progress} ${percent}%`}><span style={{ width: `${percent}%` }} /><em>{percent}%</em></div>}
              <Button variant={done ? "secondary" : "primary"} disabled={busy || done} onClick={() => void download(asset)}>{done ? text.downloaded : busy ? `${text.progress} ${percent}%` : text.download}</Button>
            </div>
          </article>;
        })}
      </div>
      {assets.length === 0 && <div className="reference-catalog-empty">{text.noResult}</div>}
    </>}
  </section>;
}
