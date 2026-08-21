import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import gsap from "gsap";
import "weui/dist/style/weui.css";
import { AppPortal } from "./components/ui";
import { useAppStore } from "./store";
import type { AppLanguage, ReferencePresetLibrary } from "./types";
import {
  catalogCategoryName,
  catalogGameName,
  catalogName,
  catalogSearchText,
  catalogSeriesMetrics,
  fetchReferenceAsset,
  formatCatalogBytes,
  loadReferenceCatalog,
  type ReferenceCatalogAsset,
  type ReferenceCatalogManifest,
} from "./referenceCatalog";

const COPY = {
  "zh-CN": {
    eyebrow: "角色资产云端目录", title: "在线角色精准参考库", hint: "按游戏系列查找角色，下载成功后自动归入本机预设；已有分组会直接复用。",
    search: "搜索角色、形态或游戏", game: "游戏系列", category: "图片分类", cardsPerRow: "每排显示", all: "全部", inGame: "游戏内角色图", illustration: "角色立绘", resource: "角色资源",
    load: "读取在线目录", refresh: "刷新目录", loading: "正在读取…", retry: "重试", preview: "预览", close: "关闭", download: "下载到本机", downloaded: "已下载", size: "大小", progress: "下载进度",
    noResult: "没有匹配的角色", unavailable: "在线目录暂不可用", downloadedToast: "精准参考图已下载，并加入对应本机分组。", assets: "份精准参考", games: "个游戏系列", found: "当前结果",
    seriesTitle: "整系列下载", seriesHint: "一次下载该游戏的全部精准参考图；只下载本机尚未保存的项目。", selectSeries: "先选择一个游戏系列，即可查看总大小并整包下载。",
    total: "系列总计", pending: "待下载", saved: "已保存", downloadSeries: "下载整个系列", downloadingSeries: "正在下载系列", confirmSeries: "确认下载整个系列？", confirm: "开始下载", cancel: "取消",
    seriesDone: "系列下载完成", seriesPartial: "系列下载结束，但有项目失败；再次点击可重试未完成项目。", failed: "失败", nothingPending: "该系列已全部下载。",
  },
  "zh-TW": {
    eyebrow: "角色資產雲端目錄", title: "線上角色精準參考庫", hint: "依遊戲系列尋找角色，下載成功後自動歸入本機預設；既有分組會直接沿用。",
    search: "搜尋角色、形態或遊戲", game: "遊戲系列", category: "圖片分類", cardsPerRow: "每列顯示", all: "全部", inGame: "遊戲內角色圖", illustration: "角色立繪", resource: "角色資源",
    load: "讀取線上目錄", refresh: "重新整理", loading: "讀取中…", retry: "重試", preview: "預覽", close: "關閉", download: "下載到本機", downloaded: "已下載", size: "大小", progress: "下載進度",
    noResult: "找不到符合的角色", unavailable: "線上目錄暫時無法使用", downloadedToast: "精準參考圖已下載並加入對應分組。", assets: "份精準參考", games: "個遊戲系列", found: "目前結果",
    seriesTitle: "整系列下載", seriesHint: "一次下載該遊戲的全部精準參考圖；僅下載本機尚未儲存的項目。", selectSeries: "先選擇一個遊戲系列，即可查看總大小並整包下載。",
    total: "系列總計", pending: "待下載", saved: "已儲存", downloadSeries: "下載整個系列", downloadingSeries: "正在下載系列", confirmSeries: "確認下載整個系列？", confirm: "開始下載", cancel: "取消",
    seriesDone: "系列下載完成", seriesPartial: "系列下載結束，但有項目失敗；再次點擊可重試未完成項目。", failed: "失敗", nothingPending: "該系列已全部下載。",
  },
  "en-US": {
    eyebrow: "Cloud character assets", title: "Online Precise Reference Library", hint: "Browse by game series. Successful downloads are filed into local presets and existing groups are reused.",
    search: "Search character, form, or game", game: "Game series", category: "Image category", cardsPerRow: "Cards per row", all: "All", inGame: "In-game", illustration: "Illustration", resource: "Character resources",
    load: "Load online catalog", refresh: "Refresh catalog", loading: "Loading…", retry: "Retry", preview: "Preview", close: "Close", download: "Download locally", downloaded: "Downloaded", size: "Size", progress: "Download progress",
    noResult: "No matching characters", unavailable: "Online catalog unavailable", downloadedToast: "Precise reference downloaded and added to its local group.", assets: "precise references", games: "game series", found: "Results",
    seriesTitle: "Download a full series", seriesHint: "Download every precise reference in this game; items already saved locally are skipped.", selectSeries: "Choose a game series to see its total size and download it as a set.",
    total: "Series total", pending: "Pending", saved: "Saved", downloadSeries: "Download full series", downloadingSeries: "Downloading series", confirmSeries: "Download this full series?", confirm: "Start download", cancel: "Cancel",
    seriesDone: "Series download complete", seriesPartial: "Series download finished with failures. Run it again to retry unfinished items.", failed: "Failed", nothingPending: "This series is already fully downloaded.",
  },
  "ja-JP": {
    eyebrow: "クラウドキャラクター素材", title: "オンライン精密参照ライブラリ", hint: "ゲームシリーズ別に探せます。保存後はローカルプリセットへ自動分類し、既存グループを再利用します。",
    search: "キャラクター・形態・ゲームを検索", game: "ゲームシリーズ", category: "画像分類", cardsPerRow: "1行の件数", all: "すべて", inGame: "ゲーム内", illustration: "立ち絵", resource: "キャラクター素材",
    load: "オンラインカタログを読む", refresh: "カタログを更新", loading: "読込中…", retry: "再試行", preview: "プレビュー", close: "閉じる", download: "端末に保存", downloaded: "保存済み", size: "サイズ", progress: "ダウンロード",
    noResult: "一致するキャラクターがありません", unavailable: "オンラインカタログを利用できません", downloadedToast: "精密参照を保存し、対応グループへ追加しました。", assets: "件の精密参照", games: "ゲームシリーズ", found: "検索結果",
    seriesTitle: "シリーズ一括保存", seriesHint: "このゲームの精密参照をまとめて保存します。保存済みの項目はスキップします。", selectSeries: "ゲームシリーズを選択すると、合計サイズを確認して一括保存できます。",
    total: "シリーズ合計", pending: "未保存", saved: "保存済み", downloadSeries: "シリーズを一括保存", downloadingSeries: "シリーズを保存中", confirmSeries: "シリーズ全体を保存しますか？", confirm: "保存を開始", cancel: "キャンセル",
    seriesDone: "シリーズの保存が完了しました", seriesPartial: "一部の保存に失敗しました。もう一度実行すると未完了項目を再試行できます。", failed: "失敗", nothingPending: "このシリーズはすべて保存済みです。",
  },
  "ko-KR": {
    eyebrow: "클라우드 캐릭터 에셋", title: "온라인 정밀 참조 라이브러리", hint: "게임 시리즈별로 찾고, 다운로드 후 로컬 프리셋에 자동 분류합니다. 기존 그룹은 그대로 재사용합니다.",
    search: "캐릭터·형태·게임 검색", game: "게임 시리즈", category: "이미지 분류", cardsPerRow: "행당 카드", all: "전체", inGame: "게임 내", illustration: "일러스트", resource: "캐릭터 리소스",
    load: "온라인 카탈로그 불러오기", refresh: "목록 새로고침", loading: "불러오는 중…", retry: "재시도", preview: "미리보기", close: "닫기", download: "기기에 저장", downloaded: "저장됨", size: "크기", progress: "다운로드 진행",
    noResult: "일치하는 캐릭터가 없습니다", unavailable: "온라인 카탈로그를 사용할 수 없습니다", downloadedToast: "정밀 참조를 저장하고 해당 그룹에 추가했습니다.", assets: "개 정밀 참조", games: "개 게임 시리즈", found: "검색 결과",
    seriesTitle: "시리즈 전체 다운로드", seriesHint: "이 게임의 모든 정밀 참조를 한 번에 저장합니다. 이미 저장된 항목은 건너뜁니다.", selectSeries: "게임 시리즈를 선택하면 전체 크기를 확인하고 한 번에 다운로드할 수 있습니다.",
    total: "시리즈 전체", pending: "다운로드 대기", saved: "저장됨", downloadSeries: "시리즈 전체 다운로드", downloadingSeries: "시리즈 다운로드 중", confirmSeries: "시리즈 전체를 다운로드할까요?", confirm: "다운로드 시작", cancel: "취소",
    seriesDone: "시리즈 다운로드 완료", seriesPartial: "일부 항목이 실패했습니다. 다시 실행하면 완료되지 않은 항목을 재시도합니다.", failed: "실패", nothingPending: "이 시리즈는 모두 다운로드되었습니다.",
  },
} as const;

type DownloadResult = { ok: boolean; bytes: number };
type BulkDownloadState = {
  game: string;
  busy: boolean;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  totalBytes: number;
  processedBytes: number;
};

function textFor(language: AppLanguage | undefined) {
  return COPY[language && language in COPY ? language : "zh-CN"];
}

function base64FromBytes(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

function motionDisabled() {
  return document.hidden || Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

export default function ReferenceCatalogPanel({ library, onDownloaded }: { library: ReferencePresetLibrary; onDownloaded?: () => void }) {
  const panelRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<HTMLElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLElement>(null);
  const inFlightRef = useRef(new Set<string>());
  const captureGameAppliedRef = useRef(false);
  const captureStateAppliedRef = useRef(false);
  const captureParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const captureState = captureParams.get("uiCatalogState");
  const captureGame = captureParams.get("uiCatalogGame");
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
  const [confirmSeries, setConfirmSeries] = useState(false);
  const [bulk, setBulk] = useState<BulkDownloadState | null>(null);
  const [gridColumns, setGridColumns] = useState(() => {
    const stored = Number(globalThis.localStorage?.getItem("langbai.reference-catalog.columns.v1"));
    return [2, 3, 4, 5].includes(stored) ? stored : 4;
  });

  const load = async (refresh = false) => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      setCatalog(await loadReferenceCatalog(undefined, refresh));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.unavailable);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => { globalThis.localStorage?.setItem("langbai.reference-catalog.columns.v1", String(gridColumns)); }, [gridColumns]);

  useLayoutEffect(() => {
    if (!panelRef.current || motionDisabled()) return;
    const context = gsap.context(() => {
      const timeline = gsap.timeline({ defaults: { ease: "power2.out" } });
      timeline
        .fromTo(headerRef.current, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.32 })
        .fromTo(".reference-catalog-stat", { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.24, stagger: 0.04 }, "-=0.14");
    }, panelRef);
    return () => context.revert();
  }, []);

  const gameOptions = useMemo(
    () => catalog?.games ?? [...new Set((catalog?.assets ?? []).map((item) => item.game))].sort().map((id) => ({
      id,
      names: undefined,
      categories: [...new Set((catalog?.assets ?? []).filter((asset) => asset.game === id).map((asset) => asset.category))],
    })),
    [catalog],
  );
  const availableCategories = useMemo(
    () => game === "__all__"
      ? [...new Set((catalog?.assets ?? []).map((asset) => asset.category))]
      : gameOptions.find((item) => item.id === game)?.categories ?? [],
    [catalog, game, gameOptions],
  );
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
  const downloadedIds = useMemo(
    () => new Set(library.presets.map((item) => item.sourceId).filter((value): value is string => Boolean(value))),
    [library.presets],
  );
  const selectedSeriesAssets = useMemo(
    () => game === "__all__" ? [] : (catalog?.assets ?? []).filter((asset) => asset.game === game),
    [catalog, game],
  );
  const seriesMetrics = useMemo(
    () => catalogSeriesMetrics(selectedSeriesAssets, downloadedIds),
    [downloadedIds, selectedSeriesAssets],
  );
  const pendingSeriesAssets = useMemo(
    () => selectedSeriesAssets.filter((asset) => !downloadedIds.has(asset.id)),
    [downloadedIds, selectedSeriesAssets],
  );
  const bulkPercent = bulk?.totalBytes
    ? Math.min(100, Math.round(bulk.processedBytes / bulk.totalBytes * 100))
    : bulk?.totalCount
      ? Math.min(100, Math.round((bulk.completedCount + bulk.failedCount) / bulk.totalCount * 100))
      : 0;

  // Screenshot QA states are only enabled by Electron's explicit capture query.
  // They let release audits cover selected-series, progress, failure, preview,
  // and confirmation layouts without downloading hundreds of real assets.
  useEffect(() => {
    if (!catalog || !captureState || captureState === "empty" || captureGameAppliedRef.current) return;
    const requestedGame = captureGame && gameOptions.some((item) => item.id === captureGame)
      ? captureGame
      : gameOptions[0]?.id ?? catalog.assets[0]?.game;
    if (!requestedGame) return;
    captureGameAppliedRef.current = true;
    setGame(requestedGame);
  }, [captureGame, captureState, catalog, gameOptions]);

  useEffect(() => {
    if (!captureState || captureStateAppliedRef.current || game === "__all__" || !selectedSeriesAssets.length) return;
    captureStateAppliedRef.current = true;
    if (captureState === "confirm") {
      setConfirmSeries(true);
      return;
    }
    if (captureState === "preview") {
      setPreviewAsset(selectedSeriesAssets[0]);
      return;
    }
    const totalCount = Math.max(1, pendingSeriesAssets.length);
    const totalBytes = Math.max(1, seriesMetrics.pendingBytes);
    if (captureState === "progress") {
      const completedCount = Math.min(37, Math.max(1, Math.floor(totalCount * .22)));
      setBulk({ game, busy: true, totalCount, completedCount, failedCount: 0, totalBytes, processedBytes: Math.floor(totalBytes * .24) });
    } else if (captureState === "failed") {
      setBulk({ game, busy: false, totalCount, completedCount: Math.max(0, totalCount - 3), failedCount: Math.min(3, totalCount), totalBytes, processedBytes: totalBytes });
    } else if (captureState === "complete") {
      setBulk({ game, busy: false, totalCount, completedCount: totalCount, failedCount: 0, totalBytes, processedBytes: totalBytes });
    }
  }, [captureState, game, pendingSeriesAssets.length, selectedSeriesAssets, seriesMetrics.pendingBytes]);

  useEffect(() => { setVisibleCount(60); }, [category, game, query]);
  useEffect(() => {
    if (bulk && !bulk.busy && bulk.game !== game) setBulk(null);
  }, [bulk, game]);

  useLayoutEffect(() => {
    if (!gridRef.current || motionDisabled()) return;
    const cards = gridRef.current.querySelectorAll(".reference-catalog-card");
    const animation = gsap.fromTo(
      cards,
      { autoAlpha: 0, y: 12, scale: 0.992 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.3, stagger: { each: 0.024, from: "start", grid: "auto" }, ease: "power2.out", clearProps: "transform,opacity,visibility" },
    );
    return () => { animation.kill(); };
  }, [category, game, query, visibleAssets.length]);

  useLayoutEffect(() => {
    if (game === "__all__" || !seriesRef.current || motionDisabled()) return;
    const animation = gsap.fromTo(seriesRef.current, { autoAlpha: 0, y: 10, scale: 0.995 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.28, ease: "power2.out", clearProps: "transform,opacity,visibility" });
    return () => { animation.kill(); };
  }, [game]);

  useLayoutEffect(() => {
    if (!previewAsset || !previewRef.current || motionDisabled()) return;
    const animation = gsap.fromTo(previewRef.current, { autoAlpha: 0, scale: 0.96, y: 12 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.24, ease: "power2.out", clearProps: "transform,opacity,visibility" });
    return () => { animation.kill(); };
  }, [previewAsset]);

  useLayoutEffect(() => {
    if (!confirmSeries || !confirmRef.current || motionDisabled()) return;
    const animation = gsap.fromTo(confirmRef.current, { autoAlpha: 0, scale: 0.94, y: 10 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.22, ease: "back.out(1.2)", clearProps: "transform,opacity,visibility" });
    return () => { animation.kill(); };
  }, [confirmSeries]);

  const persistAsset = async (
    asset: ReferenceCatalogAsset,
    options: { notify?: boolean; onBytes?: (loaded: number, total: number) => void } = {},
  ): Promise<DownloadResult> => {
    if (inFlightRef.current.has(asset.id) || downloadedIds.has(asset.id)) return { ok: true, bytes: 0 };
    inFlightRef.current.add(asset.id);
    setActive((current) => ({ ...current, [asset.id]: true }));
    setProgress((current) => ({ ...current, [asset.id]: 0 }));
    try {
      const bytes = await fetchReferenceAsset(asset, (loaded, total) => {
        const normalizedTotal = total || asset.bytes || loaded;
        setProgress((current) => ({
          ...current,
          [asset.id]: normalizedTotal ? Math.min(100, Math.round(loaded / normalizedTotal * 100)) : 0,
        }));
        options.onBytes?.(loaded, normalizedTotal);
      });
      const result = await window.naiDesktop.saveReferencePreset({
        name: catalogName(asset, language),
        group: `${asset.game} · ${asset.category}`,
        kind: "precise",
        base64: base64FromBytes(bytes),
        extension: ".png",
        sourceId: asset.id,
        sourceNames: asset.names,
        sourceGameNames: asset.gameNames,
        sourceGameId: asset.game,
        sourceCategory: asset.category,
        preciseType: "character",
        strength: 1,
        fidelity: 1,
        informationExtracted: 1,
        width: asset.width,
        height: asset.height,
      });
      if (!result.ok) throw new Error(result.message || "Download failed");
      setProgress((current) => ({ ...current, [asset.id]: 100 }));
      if (options.notify !== false) {
        setToast(text.downloadedToast);
        onDownloaded?.();
      }
      return { ok: true, bytes: bytes.byteLength };
    } catch (reason) {
      if (options.notify !== false) setToast(reason instanceof Error ? reason.message : text.unavailable);
      return { ok: false, bytes: 0 };
    } finally {
      inFlightRef.current.delete(asset.id);
      setActive((current) => ({ ...current, [asset.id]: false }));
    }
  };

  const downloadSeries = async () => {
    if (game === "__all__" || bulk?.busy) return;
    setConfirmSeries(false);
    const queue = pendingSeriesAssets;
    if (!queue.length) return setToast(text.nothingPending);
    const totalBytes = queue.reduce((sum, asset) => sum + Math.max(0, asset.bytes || 0), 0);
    setBulk({ game, busy: true, totalCount: queue.length, completedCount: 0, failedCount: 0, totalBytes, processedBytes: 0 });
    let completedCount = 0;
    let failedCount = 0;
    let processedBytes = 0;
    for (const asset of queue) {
      const estimatedBytes = Math.max(0, asset.bytes || 0);
      const result = await persistAsset(asset, {
        notify: false,
        onBytes: (loaded, total) => {
          const currentTotal = estimatedBytes || total || loaded;
          setBulk((current) => current ? { ...current, processedBytes: processedBytes + Math.min(currentTotal, loaded) } : current);
        },
      });
      if (result.ok) completedCount += 1;
      else failedCount += 1;
      processedBytes += estimatedBytes || result.bytes;
      setBulk((current) => current ? { ...current, completedCount, failedCount, processedBytes } : current);
    }
    setBulk((current) => current ? { ...current, busy: false, completedCount, failedCount, processedBytes: Math.max(current.totalBytes, processedBytes) } : current);
    onDownloaded?.();
    setToast(failedCount ? `${text.seriesPartial} ${text.failed} ${failedCount}` : `${text.seriesDone} · ${completedCount}`);
  };

  return <>
    <section ref={panelRef} className="reference-catalog-panel panel-card weui-panel">
      <header ref={headerRef} className="reference-catalog-header">
        <div className="reference-catalog-header-main">
          <span className="reference-catalog-cloud-mark" aria-hidden="true"><i className="weui-icon-download" /></span>
          <div className="reference-catalog-header-copy"><span className="reference-catalog-eyebrow">{text.eyebrow}</span><h3>{text.title}</h3><p>{text.hint}</p></div>
        </div>
        <button type="button" className="weui-btn weui-btn_mini weui-btn_primary reference-catalog-load" onClick={() => void load(Boolean(catalog))} disabled={loading}>{loading && <i className="weui-loading" />}<span>{loading ? text.loading : catalog ? text.refresh : text.load}</span></button>
      </header>

      {catalog && <div className="reference-catalog-stats" aria-label={text.title}>
        <span className="reference-catalog-stat"><strong>{catalog.assets.length}</strong><small>{text.assets}</small></span>
        <span className="reference-catalog-stat"><strong>{gameOptions.length}</strong><small>{text.games}</small></span>
        <span className="reference-catalog-stat"><strong>{assets.length}</strong><small>{text.found}</small></span>
      </div>}

      {error && <div className="reference-catalog-error weui-cell weui-cell_warn"><span className="weui-cell__hd"><i className="weui-icon-warn" /></span><span className="weui-cell__bd"><strong>{text.unavailable}</strong><small>{error}</small></span><span className="weui-cell__ft"><button type="button" className="weui-btn weui-btn_mini weui-btn_default" onClick={() => void load(true)}>{text.retry}</button></span></div>}
      {loading && !catalog && <div className="weui-loadmore reference-catalog-loading" role="status"><i className="weui-loading" /><span className="weui-loadmore__tips">{text.loading}</span></div>}

      {catalog && <>
        <section className="reference-catalog-filter-shell" aria-label={text.search}>
          <div className="weui-search-bar reference-catalog-search" role="search"><div className="weui-search-bar__form"><div className="weui-search-bar__box"><i className="weui-icon-search" /><input className="weui-search-bar__input" type="search" value={query} placeholder={text.search} aria-label={text.search} onChange={(event) => setQuery(event.target.value)} />{query && <button className="weui-icon-clear" type="button" aria-label={text.close} onClick={() => setQuery("")} />}</div></div></div>
          <div className="reference-catalog-toolbar">
            <label className="weui-cell weui-cell_select weui-cell_select-after reference-catalog-select"><span className="weui-cell__hd">{text.game}</span><span className="weui-cell__bd"><select className="weui-select" value={game} onChange={(event) => { setGame(event.target.value); setCategory("__all__"); }}><option value="__all__">{text.all}</option>{gameOptions.map((item) => <option value={item.id} key={item.id}>{localizedGame(item.id)}</option>)}</select></span></label>
            {(game === "__all__" || availableCategories.length > 1) && <label className="weui-cell weui-cell_select weui-cell_select-after reference-catalog-select"><span className="weui-cell__hd">{text.category}</span><span className="weui-cell__bd"><select className="weui-select" value={category} onChange={(event) => setCategory(event.target.value)}><option value="__all__">{text.all}</option>{availableCategories.map((item) => <option value={item} key={item}>{localizedCategory(item)}</option>)}</select></span></label>}
            <label className="weui-cell weui-cell_select weui-cell_select-after reference-catalog-select reference-catalog-columns"><span className="weui-cell__hd">{text.cardsPerRow}</span><span className="weui-cell__bd"><select className="weui-select" value={gridColumns} onChange={(event) => setGridColumns(Number(event.target.value))}>{[2, 3, 4, 5].map((value) => <option value={value} key={value}>{value}</option>)}</select></span></label>
          </div>
        </section>

        {game === "__all__" ? <div className="reference-catalog-series-placeholder weui-cell"><span className="weui-cell__hd"><i className="weui-icon-info-circle" /></span><span className="weui-cell__bd">{text.selectSeries}</span></div> : <section ref={seriesRef} className="reference-catalog-series-card">
          <div className="reference-catalog-series-copy"><span className="reference-catalog-series-icon" aria-hidden="true"><i className="weui-icon-download" /></span><div><span className="reference-catalog-eyebrow">{text.seriesTitle}</span><h4>{localizedGame(game)}</h4><p>{text.seriesHint}</p></div></div>
          <div className="reference-catalog-series-metrics"><span><small>{text.total}</small><strong>{seriesMetrics.totalCount} · {formatCatalogBytes(seriesMetrics.totalBytes)}</strong></span><span><small>{text.pending}</small><strong>{seriesMetrics.pendingCount} · {formatCatalogBytes(seriesMetrics.pendingBytes)}</strong></span><span><small>{text.saved}</small><strong>{seriesMetrics.downloadedCount}</strong></span></div>
          {bulk?.game === game && <div className="reference-catalog-bulk-progress" role="status" aria-live="polite"><div className="reference-catalog-bulk-progress-copy"><span>{bulk.busy ? text.downloadingSeries : bulk.failedCount ? text.seriesPartial : text.seriesDone}</span><strong>{bulk.completedCount + bulk.failedCount}/{bulk.totalCount} · {bulkPercent}%</strong></div><div className="weui-progress"><div className="weui-progress__bar"><span className="weui-progress__inner-bar" style={{ width: `${bulkPercent}%` }} /></div></div>{bulk.failedCount > 0 && <small>{text.failed} {bulk.failedCount}</small>}</div>}
          <button type="button" className="weui-btn weui-btn_primary reference-catalog-series-action" disabled={Boolean(bulk?.busy) || seriesMetrics.pendingCount === 0} onClick={() => setConfirmSeries(true)}>{bulk?.busy ? <i className="weui-loading" /> : <i className="weui-icon-download" aria-hidden="true" />}<span>{bulk?.busy ? `${text.downloadingSeries} ${bulk.completedCount + bulk.failedCount}/${bulk.totalCount}` : seriesMetrics.pendingCount ? text.downloadSeries : text.nothingPending}</span></button>
        </section>}

        <div className="reference-catalog-result-heading"><div><strong>{text.found}</strong><span>{assets.length} / {catalog.assets.length}</span></div><span>{game === "__all__" ? text.all : localizedGame(game)}{category !== "__all__" ? ` · ${localizedCategory(category)}` : ""}</span></div>
        <div className="reference-catalog-grid" ref={gridRef} style={{ "--reference-catalog-columns": gridColumns } as CSSProperties}>
          {visibleAssets.map((asset) => {
            const percent = progress[asset.id] ?? 0;
            const busy = Boolean(active[asset.id]);
            const done = downloadedIds.has(asset.id);
            return <article className="reference-catalog-card" key={asset.id} onDoubleClick={() => setPreviewAsset(asset)}>
              <div className="reference-catalog-thumb"><img src={asset.thumbnailMirrors?.gitee || asset.thumbnailUrl || asset.downloadUrl} onError={(event) => { const fallback = asset.thumbnailMirrors?.github || asset.downloadMirrors?.github; if (fallback && event.currentTarget.src !== fallback) event.currentTarget.src = fallback; }} alt={catalogName(asset, language)} loading="lazy" /><button type="button" className="reference-catalog-preview-button" aria-label={`${text.preview} ${catalogName(asset, language)}`} onClick={() => setPreviewAsset(asset)}><i className="weui-icon-search" /></button>{done && <span className="reference-catalog-downloaded-badge"><i className="weui-icon-success-no-circle" />{text.downloaded}</span>}</div>
              <div className="reference-catalog-card-body"><strong title={catalogName(asset, language)}>{catalogName(asset, language)}</strong><small>{localizedGame(asset.game)} · {localizedCategory(asset.category)}</small><small>{asset.width}×{asset.height} · {formatCatalogBytes(asset.bytes)}</small>{busy && <div className="weui-progress reference-catalog-progress" aria-label={`${text.progress} ${percent}%`}><div className="weui-progress__bar"><span className="weui-progress__inner-bar" style={{ width: `${percent}%` }} /></div><em>{percent}%</em></div>}<button type="button" className={`weui-btn ${done ? "weui-btn_default" : "weui-btn_primary"}`} disabled={busy || done || Boolean(bulk?.busy)} onClick={() => void persistAsset(asset)}>{busy && <i className="weui-loading" />}{done ? text.downloaded : busy ? `${text.progress} ${percent}%` : text.download}</button></div>
            </article>;
          })}
        </div>
        {assets.length === 0 && <div className="weui-loadmore weui-loadmore_line reference-catalog-empty"><span className="weui-loadmore__tips">{text.noResult}</span></div>}
        {visibleAssets.length < assets.length && <div className="reference-catalog-more"><button type="button" className="weui-btn weui-btn_default" onClick={() => setVisibleCount((value) => value + 60)}>{text.load} · {visibleAssets.length}/{assets.length}</button></div>}
      </>}
    </section>

    {previewAsset && <AppPortal><div className="modal-backdrop reference-catalog-preview-backdrop" onClick={() => setPreviewAsset(null)}><div ref={previewRef} className="reference-catalog-preview" onClick={(event) => event.stopPropagation()}><button type="button" className="reference-preset-close" aria-label={text.close} onClick={() => setPreviewAsset(null)}>×</button><div className="reference-catalog-preview-stage"><img src={previewAsset.thumbnailMirrors?.gitee || previewAsset.thumbnailUrl || previewAsset.downloadUrl} onError={(event) => { const fallback = previewAsset.thumbnailMirrors?.github || previewAsset.downloadMirrors?.github; if (fallback && event.currentTarget.src !== fallback) event.currentTarget.src = fallback; }} alt={catalogName(previewAsset, language)} /></div><div className="reference-catalog-preview-copy"><strong>{catalogName(previewAsset, language)}</strong><span>{localizedGame(previewAsset.game)} · {localizedCategory(previewAsset.category)} · {previewAsset.width}×{previewAsset.height}</span></div></div></div></AppPortal>}

    {confirmSeries && game !== "__all__" && <AppPortal><div className="weui-mask reference-catalog-confirm-mask" onClick={() => setConfirmSeries(false)}><section ref={confirmRef} className="weui-dialog reference-catalog-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="reference-series-download-title" onClick={(event) => event.stopPropagation()}><div className="weui-dialog__hd"><strong id="reference-series-download-title" className="weui-dialog__title">{text.confirmSeries}</strong></div><div className="weui-dialog__bd"><b>{localizedGame(game)}</b><p>{text.pending} {seriesMetrics.pendingCount} · {formatCatalogBytes(seriesMetrics.pendingBytes)}</p><small>{text.seriesHint}</small></div><div className="weui-dialog__ft"><button type="button" className="weui-dialog__btn weui-dialog__btn_default" onClick={() => setConfirmSeries(false)}>{text.cancel}</button><button type="button" className="weui-dialog__btn weui-dialog__btn_primary" onClick={() => void downloadSeries()}>{text.confirm}</button></div></section></div></AppPortal>}
  </>;
}
