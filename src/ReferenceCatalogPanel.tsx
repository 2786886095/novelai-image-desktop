import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import "weui/dist/style/weui.css";
import { AppPortal } from "./components/ui";
import { useAppStore } from "./store";
import type { AppLanguage, ReferencePresetLibrary } from "./types";
import {
  catalogName,
  catalogCategoryName,
  catalogGameName,
  catalogSearchText,
  fetchReferenceAsset,
  formatCatalogBytes,
  loadReferenceCatalog,
  type ReferenceCatalogAsset,
  type ReferenceCatalogManifest,
} from "./referenceCatalog";

const COPY = {
  "zh-CN": { title: "在线角色精准参考库", hint: "只下载 NovelAI 精准参考图；每个角色/形态只保留一个最佳尺寸，优先使用 Gitee 大陆线路。", search: "搜索角色、形态或游戏", game: "游戏", category: "分类", all: "全部", inGame: "游戏内角色图", illustration: "角色立绘", resource: "角色资源", load: "读取在线目录", refresh: "刷新目录", loading: "正在读取…", retry: "重试", preview: "预览", close: "关闭", download: "下载到本机", downloaded: "已下载", size: "大小", progress: "下载进度", noResult: "没有匹配的角色", unavailable: "在线目录暂不可用", downloadedToast: "精准参考图已下载到本机预设库。" },
  "zh-TW": { title: "線上角色精準參考庫", hint: "只下載 NovelAI 精準參考圖；每個角色／形態只保留一個最佳尺寸，優先使用 Gitee 中國大陸線路。", search: "搜尋角色、形態或遊戲", game: "遊戲", category: "分類", all: "全部", inGame: "遊戲內角色圖", illustration: "角色立繪", resource: "角色資源", load: "讀取線上目錄", refresh: "重新整理", loading: "讀取中…", retry: "重試", preview: "預覽", close: "關閉", download: "下載到本機", downloaded: "已下載", size: "大小", progress: "下載進度", noResult: "找不到符合的角色", unavailable: "線上目錄暫時無法使用", downloadedToast: "精準參考圖已下載到本機預設庫。" },
  "en-US": { title: "Online Precise Reference Library", hint: "Downloads precise references only. One best size is kept per character/form, with Gitee preferred in mainland China.", search: "Search character, form, or game", game: "Game", category: "Category", all: "All", inGame: "In-game", illustration: "Illustration", resource: "Character resources", load: "Load online catalog", refresh: "Refresh catalog", loading: "Loading…", retry: "Retry", preview: "Preview", close: "Close", download: "Download locally", downloaded: "Downloaded", size: "Size", progress: "Download progress", noResult: "No matching characters", unavailable: "Online catalog unavailable", downloadedToast: "Precise reference downloaded to the local preset library." },
  "ja-JP": { title: "オンライン精密参照ライブラリ", hint: "精密参照のみをダウンロードします。キャラクター／形態ごとに最適なサイズを1つ保持し、中国本土では Gitee を優先します。", search: "キャラクター・形態・ゲームを検索", game: "ゲーム", category: "分類", all: "すべて", inGame: "ゲーム内", illustration: "立ち絵", resource: "キャラクター素材", load: "オンラインカタログを読む", refresh: "カタログを更新", loading: "読込中…", retry: "再試行", preview: "プレビュー", close: "閉じる", download: "端末に保存", downloaded: "保存済み", size: "サイズ", progress: "ダウンロード", noResult: "一致するキャラクターがありません", unavailable: "オンラインカタログを利用できません", downloadedToast: "精密参照をローカルプリセットに保存しました。" },
  "ko-KR": { title: "온라인 정밀 참조 라이브러리", hint: "정밀 참조만 다운로드합니다. 캐릭터/형태마다 최적 크기 하나만 유지하며 중국 본토에서는 Gitee를 우선합니다.", search: "캐릭터·형태·게임 검색", game: "게임", category: "분류", all: "전체", inGame: "게임 내", illustration: "일러스트", resource: "캐릭터 리소스", load: "온라인 카탈로그 불러오기", refresh: "목록 새로고침", loading: "불러오는 중…", retry: "재시도", preview: "미리보기", close: "닫기", download: "기기에 저장", downloaded: "저장됨", size: "크기", progress: "다운로드 진행", noResult: "일치하는 캐릭터가 없습니다", unavailable: "온라인 카탈로그를 사용할 수 없습니다", downloadedToast: "정밀 참조를 로컬 프리셋에 저장했습니다." },
} as const;

function textFor(language: AppLanguage | undefined) { return COPY[language && language in COPY ? language : "zh-CN"]; }
function base64FromBytes(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  return btoa(binary);
}
export default function ReferenceCatalogPanel({ library, onDownloaded }: { library: ReferencePresetLibrary; onDownloaded?: () => void }) {
  const panelRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
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
  const [visibleCount, setVisibleCount] = useState(60);
  const [previewAsset, setPreviewAsset] = useState<ReferenceCatalogAsset | null>(null);

  const load = async (refresh = false) => {
    setLoading(true); setError("");
    try { setCatalog(await loadReferenceCatalog(undefined, refresh)); } catch (reason) { setError(reason instanceof Error ? reason.message : text.unavailable); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  useLayoutEffect(() => {
    if (!panelRef.current || document.hidden || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const animation = gsap.fromTo(panelRef.current, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.42, ease: "power2.out" });
    return () => { animation.kill(); };
  }, []);

  const gameOptions = useMemo(() => catalog?.games ?? [...new Set((catalog?.assets ?? []).map((item) => item.game))].sort().map((id) => ({ id, names: undefined, categories: [...new Set((catalog?.assets ?? []).filter((asset) => asset.game === id).map((asset) => asset.category))] })), [catalog]);
  const availableCategories = useMemo(() => game === "__all__"
    ? [...new Set((catalog?.assets ?? []).map((asset) => asset.category))]
    : gameOptions.find((item) => item.id === game)?.categories ?? [], [catalog, game, gameOptions]);
  const localizedGame = (gameId: string) => {
    const record = gameOptions.find((item) => item.id === gameId);
    return catalogGameName(gameId, language, record?.names);
  };
  const localizedCategory = (value: string) => catalogCategoryName(value, language);
  const assets = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (catalog?.assets ?? []).filter((item) =>
      (game === "__all__" || item.game === game) &&
      (category === "__all__" || item.category === category) &&
      (!needle || catalogSearchText(item).includes(needle)),
    );
  }, [catalog, category, game, query]);
  const visibleAssets = useMemo(() => assets.slice(0, visibleCount), [assets, visibleCount]);
  useEffect(() => { setVisibleCount(60); }, [category, game, query]);
  useLayoutEffect(() => {
    if (!gridRef.current || document.hidden || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const cards = gridRef.current.querySelectorAll(".reference-catalog-card");
    const animation = gsap.fromTo(cards, { autoAlpha: 0, y: 14, scale: 0.985 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.32, stagger: 0.018, ease: "power2.out", clearProps: "transform,opacity,visibility" });
    return () => { animation.kill(); };
  }, [category, game, query, visibleAssets.length]);
  useLayoutEffect(() => {
    if (!previewAsset || !previewRef.current || document.hidden || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const animation = gsap.fromTo(previewRef.current, { autoAlpha: 0, scale: 0.96, y: 12 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.24, ease: "power2.out", clearProps: "transform,opacity,visibility" });
    return () => { animation.kill(); };
  }, [previewAsset]);
  const downloadedIds = useMemo(() => new Set(library.presets.map((item) => item.sourceId).filter(Boolean)), [library.presets]);

  const download = async (asset: ReferenceCatalogAsset) => {
    if (active[asset.id] || downloadedIds.has(asset.id)) return;
    setActive((current) => ({ ...current, [asset.id]: true }));
    setProgress((current) => ({ ...current, [asset.id]: 0 }));
    try {
      const bytes = await fetchReferenceAsset(asset, (loaded, total) => setProgress((current) => ({ ...current, [asset.id]: total ? Math.min(100, Math.round(loaded / total * 100)) : 0 })));
      const result = await window.naiDesktop.saveReferencePreset({
        name: catalogName(asset, language), group: `${asset.game} · ${asset.category}`, kind: "precise",
        base64: base64FromBytes(bytes), extension: ".png", sourceId: asset.id,
        sourceNames: asset.names, sourceGameNames: asset.gameNames, sourceGameId: asset.game, sourceCategory: asset.category,
        preciseType: "character", strength: 1, fidelity: 1, informationExtracted: 1, width: asset.width, height: asset.height,
      });
      if (!result.ok) throw new Error(result.message || "Download failed");
      setProgress((current) => ({ ...current, [asset.id]: 100 }));
      setToast(text.downloadedToast); onDownloaded?.();
    } catch (reason) { setToast(reason instanceof Error ? reason.message : text.unavailable); }
    finally { setActive((current) => ({ ...current, [asset.id]: false })); }
  };

  return <><section ref={panelRef} className="reference-catalog-panel panel-card weui-panel">
    <header className="reference-preset-section-heading">
      <div><h3>{text.title}</h3><p>{text.hint}</p></div>
      <button type="button" className="weui-btn weui-btn_mini weui-btn_primary reference-catalog-load" onClick={() => void load(Boolean(catalog))} disabled={loading}>{loading ? text.loading : catalog ? text.refresh : text.load}</button>
    </header>
    {error && <div className="reference-catalog-error weui-cell weui-cell_warn"><span className="weui-cell__bd"><strong>{text.unavailable}</strong><small>{error}</small></span><span className="weui-cell__ft"><button type="button" className="weui-btn weui-btn_mini weui-btn_default" onClick={() => void load(true)}>{text.retry}</button></span></div>}
    {loading && !catalog && <div className="weui-loadmore reference-catalog-loading" role="status"><i className="weui-loading" /><span className="weui-loadmore__tips">{text.loading}</span></div>}
    {catalog && <>
      <div className="reference-catalog-toolbar">
        <div className="weui-search-bar reference-catalog-search" role="search"><div className="weui-search-bar__form"><div className="weui-search-bar__box"><i className="weui-icon-search" /><input className="weui-search-bar__input" type="search" value={query} placeholder={text.search} aria-label={text.search} onChange={(event) => setQuery(event.target.value)} />{query && <button className="weui-icon-clear" type="button" aria-label={text.close} onClick={() => setQuery("")} />}</div></div></div>
        <label className="weui-cell weui-cell_select weui-cell_select-after reference-catalog-select"><span className="weui-cell__hd">{text.game}</span><span className="weui-cell__bd"><select className="weui-select" value={game} onChange={(event) => { setGame(event.target.value); setCategory("__all__"); }}><option value="__all__">{text.all}</option>{gameOptions.map((item) => <option value={item.id} key={item.id}>{localizedGame(item.id)}</option>)}</select></span></label>
        {(game === "__all__" || availableCategories.length > 1) && <label className="weui-cell weui-cell_select weui-cell_select-after reference-catalog-select"><span className="weui-cell__hd">{text.category}</span><span className="weui-cell__bd"><select className="weui-select" value={category} onChange={(event) => setCategory(event.target.value)}><option value="__all__">{text.all}</option>{availableCategories.map((item) => <option value={item} key={item}>{localizedCategory(item)}</option>)}</select></span></label>}
      </div>
      <div className="reference-catalog-grid" ref={gridRef}>
        {visibleAssets.map((asset) => {
          const percent = progress[asset.id] ?? 0; const busy = Boolean(active[asset.id]); const done = downloadedIds.has(asset.id);
          return <article className="reference-catalog-card" key={asset.id} onDoubleClick={() => setPreviewAsset(asset)}>
            <div className="reference-catalog-thumb"><img src={asset.thumbnailMirrors?.gitee || asset.thumbnailUrl || asset.downloadUrl} onError={(event) => { const fallback = asset.thumbnailMirrors?.github || asset.downloadMirrors?.github; if (fallback && event.currentTarget.src !== fallback) event.currentTarget.src = fallback; }} alt={catalogName(asset, language)} loading="lazy" /><button type="button" className="reference-catalog-preview-button" aria-label={`${text.preview} ${catalogName(asset, language)}`} onClick={() => setPreviewAsset(asset)}><i className="weui-icon-search" /></button></div>
            <div className="reference-catalog-card-body"><strong>{catalogName(asset, language)}</strong><small>{localizedGame(asset.game)} · {localizedCategory(asset.category)}</small><small>{asset.width}×{asset.height} · {text.size} {formatCatalogBytes(asset.bytes)}</small>
              {busy && <div className="weui-progress reference-catalog-progress" aria-label={`${text.progress} ${percent}%`}><div className="weui-progress__bar"><span className="weui-progress__inner-bar" style={{ width: `${percent}%` }} /></div><em>{percent}%</em></div>}
              <button type="button" className={`weui-btn ${done ? "weui-btn_default" : "weui-btn_primary"}`} disabled={busy || done} onClick={() => void download(asset)}>{done ? text.downloaded : busy ? `${text.progress} ${percent}%` : text.download}</button>
            </div>
          </article>;
        })}
      </div>
      {assets.length === 0 && <div className="weui-loadmore weui-loadmore_line reference-catalog-empty"><span className="weui-loadmore__tips">{text.noResult}</span></div>}
      {visibleAssets.length < assets.length && <div className="reference-catalog-more"><button type="button" className="weui-btn weui-btn_default" onClick={() => setVisibleCount((value) => value + 60)}>{text.load} · {visibleAssets.length}/{assets.length}</button></div>}
    </>}
  </section>{previewAsset && <AppPortal><div className="modal-backdrop reference-catalog-preview-backdrop" onClick={() => setPreviewAsset(null)}><div ref={previewRef} className="reference-catalog-preview" onClick={(event) => event.stopPropagation()}><button type="button" className="reference-preset-close" aria-label={text.close} onClick={() => setPreviewAsset(null)}>×</button><div className="reference-catalog-preview-stage"><img src={previewAsset.thumbnailMirrors?.gitee || previewAsset.thumbnailUrl || previewAsset.downloadUrl} onError={(event) => { const fallback = previewAsset.thumbnailMirrors?.github || previewAsset.downloadMirrors?.github; if (fallback && event.currentTarget.src !== fallback) event.currentTarget.src = fallback; }} alt={catalogName(previewAsset, language)} /></div><div className="reference-catalog-preview-copy"><strong>{catalogName(previewAsset, language)}</strong><span>{localizedGame(previewAsset.game)} · {localizedCategory(previewAsset.category)} · {previewAsset.width}×{previewAsset.height}</span></div></div></div></AppPortal>}</>;
}
