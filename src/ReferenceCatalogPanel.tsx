import {PreviewImageViewer} from './components/PreviewImageViewer';
import {errorText} from './error-message';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { animateStudioEntry, motionReduced } from "./motion-system";
import { AppPortal, SelectMenu } from "./components/ui";
import { Icon } from "./components/icons";
import { useAppStore } from "./store";
import type { AppLanguage, ReferencePresetLibrary } from "./types";
import {
  catalogCategoryName,
  catalogThumbnailUrls,
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
    search: "搜索角色、形态或游戏", game: "游戏系列", category: "图片分类", cardsPerRow: "每排显示", itemsPerPage: "每页数量", goToPage: "选择页数", all: "全部", inGame: "游戏内角色图", illustration: "角色立绘", resource: "角色资源",
    load: "读取在线目录", refresh: "刷新目录", loading: "正在读取…", retry: "重试", preview: "预览", close: "关闭", download: "下载到本机", downloaded: "已下载", size: "大小", progress: "下载进度",
    noResult: "没有匹配的角色", unavailable: "在线目录暂不可用", downloadedToast: "精准参考图已下载，并加入对应本机分组。", assets: "份精准参考", games: "个游戏系列", found: "当前结果", previous: "上一页", next: "下一页", loadingPage: "正在准备第 {page} 页…", page: "第 {page} / {pages} 页",
    seriesTitle: "整系列下载", seriesHint: "一次下载该游戏的全部精准参考图；只下载本机尚未保存的项目。", selectSeries: "先选择一个游戏系列，即可查看总大小并整包下载。",
    total: "系列总计", pending: "待下载", saved: "已保存", downloadSeries: "下载整个系列", downloadingSeries: "正在下载系列", confirmSeries: "确认下载整个系列？", confirm: "开始下载", cancel: "取消",
    seriesDone: "系列下载完成", seriesPartial: "系列下载结束，但有项目失败；再次点击可重试未完成项目。", failed: "失败", nothingPending: "该系列已全部下载。",
  },
} as const;

function CatalogPageNumberInput({ page, pageCount, disabled, label, onChange }: { page: number; pageCount: number; disabled: boolean; label: string; onChange: (page: number) => void }) {
  const [draft, setDraft] = useState(String(page));
  useEffect(() => { setDraft(String(page)); }, [page]);
  const submit = () => {
    const requested = Math.max(1, Math.floor(Number(draft) || page));
    const target = Math.min(pageCount, requested);
    setDraft(String(target));
    onChange(target);
  };
  return <div className="gallery-page-number-input reference-catalog-page-number-input"><input type="number" min="1" max={pageCount} step="1" value={draft} disabled={disabled} aria-label={label} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submit(); } }} /><button type="button" className="reference-ui-btn reference-ui-btn-default" disabled={disabled} onClick={submit}>{label}</button></div>;
}

type DownloadResult = { ok: boolean; bytes: number };
const CATALOG_PAGE_SIZE_OPTIONS = [12, 24, 48, 60] as const;
const DEFAULT_CATALOG_PAGE_SIZE = 12;
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
  return document.hidden || motionReduced();
}

function preloadCatalogImage(primaryUrl: string, fallbackUrl?: string) {
  return new Promise<void>((resolve) => {
    const image = new Image();
    let triedFallback = false;
    const finish = () => resolve();
    image.onload = finish;
    image.onerror = () => {
      if (!triedFallback && fallbackUrl && fallbackUrl !== primaryUrl) {
        triedFallback = true;
        image.src = fallbackUrl;
        return;
      }
      finish();
    };
    image.src = primaryUrl;
  });
}

function scrollCatalogGridInsideManager(grid: HTMLElement | null) {
  const scroller = grid?.closest<HTMLElement>(".reference-preset-manager");
  if (!grid || !scroller || scroller.scrollHeight <= scroller.clientHeight) return;
  const gridRect = grid.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  scroller.scrollTo({
    top: Math.max(0, scroller.scrollTop + gridRect.top - scrollerRect.top - 12),
    behavior: "smooth",
  });
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
  const pageRequestRef = useRef(0);
  const captureParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const captureState = captureParams.get("uiCatalogState");
  const captureGame = captureParams.get("uiCatalogGame");
  const captureSelectOpen = captureParams.get("uiSelectOpen") === "1";
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
  const [page, setPage] = useState(1);
  const [pendingPage, setPendingPage] = useState<number | null>(null);
  const [pageSize, setPageSize] = useState(() => {
    const stored = Number(globalThis.localStorage?.getItem("langbai.reference-catalog.page-size.v1"));
    return CATALOG_PAGE_SIZE_OPTIONS.includes(stored as (typeof CATALOG_PAGE_SIZE_OPTIONS)[number]) ? stored : DEFAULT_CATALOG_PAGE_SIZE;
  });
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
      setError(errorText(reason, text.unavailable));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => { globalThis.localStorage?.setItem("langbai.reference-catalog.columns.v1", String(gridColumns)); }, [gridColumns]);
  useEffect(() => { globalThis.localStorage?.setItem("langbai.reference-catalog.page-size.v1", String(pageSize)); }, [pageSize]);

  useLayoutEffect(() => {
    if (!panelRef.current || motionDisabled()) return;
    return animateStudioEntry(headerRef.current, 150);
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
  const pageCount = Math.max(1, Math.ceil(assets.length / pageSize));
  const pageAssets = useMemo(
    () => assets.slice((page - 1) * pageSize, page * pageSize),
    [assets, page, pageSize],
  );
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

  const changePage = async (targetPage: number) => {
    const nextPage = Math.max(1, Math.min(pageCount, targetPage));
    if (nextPage === page || pendingPage !== null) return;
    const requestId = ++pageRequestRef.current;
    const nextAssets = assets.slice((nextPage - 1) * pageSize, nextPage * pageSize);
    setPendingPage(nextPage);
    await Promise.allSettled(nextAssets.map((asset) => preloadCatalogImage(
      catalogThumbnailUrls(asset)[0],
      catalogThumbnailUrls(asset)[1],
    )));
    if (requestId !== pageRequestRef.current) return;
    setPage(nextPage);
    setPendingPage(null);
    window.requestAnimationFrame(() => scrollCatalogGridInsideManager(gridRef.current));
  };

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

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

  useEffect(() => {
    pageRequestRef.current += 1;
    setPendingPage(null);
    setPage(1);
  }, [category, game, pageSize, query]);
  useEffect(() => {
    if (bulk && !bulk.busy && bulk.game !== game) setBulk(null);
  }, [bulk, game]);

  useLayoutEffect(() => {
    if (!gridRef.current || motionDisabled()) return;
    const cards = gridRef.current.querySelectorAll(".reference-catalog-card");
    return animateStudioEntry(cards, 240);
  }, [category, game, page, pageAssets.length, query]);

  useLayoutEffect(() => {
    if (game === "__all__" || !seriesRef.current || motionDisabled()) return;
    return animateStudioEntry(seriesRef.current, 150);
  }, [game]);

  useLayoutEffect(() => {
    if (!previewAsset || !previewRef.current || motionDisabled()) return;
    return animateStudioEntry(previewRef.current, 200);
  }, [previewAsset]);

  useLayoutEffect(() => {
    if (!confirmSeries || !confirmRef.current || motionDisabled()) return;
    return animateStudioEntry(confirmRef.current, 200);
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
      if (!result.ok) throw new Error(result.message || "下载失败。");
      setProgress((current) => ({ ...current, [asset.id]: 100 }));
      if (options.notify !== false) {
        setToast(text.downloadedToast);
        onDownloaded?.();
      }
      return { ok: true, bytes: bytes.byteLength };
    } catch (reason) {
      if (options.notify !== false) setToast(errorText(reason, text.unavailable));
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
    <section ref={panelRef} className="reference-catalog-panel panel-card reference-ui-panel">
      <header ref={headerRef} className="reference-catalog-header">
        <div className="reference-catalog-header-main">
          <span className="reference-catalog-cloud-mark" aria-hidden="true"><Icon name="download" /></span>
          <div className="reference-catalog-header-copy"><span className="reference-catalog-eyebrow">{text.eyebrow}</span><h3>{text.title}</h3><p>{text.hint}</p></div>
        </div>
        <button type="button" className="reference-ui-btn reference-ui-btn-mini reference-ui-btn-primary reference-catalog-load" onClick={() => void load(Boolean(catalog))} disabled={loading}>{loading && <i className="reference-ui-spinner" />}<span>{loading ? text.loading : catalog ? text.refresh : text.load}</span></button>
      </header>

      {catalog && <div className="reference-catalog-stats" aria-label={text.title}>
        <span className="reference-catalog-stat"><strong>{catalog.assets.length}</strong><small>{text.assets}</small></span>
        <span className="reference-catalog-stat"><strong>{gameOptions.length}</strong><small>{text.games}</small></span>
        <span className="reference-catalog-stat"><strong>{assets.length}</strong><small>{text.found}</small></span>
      </div>}

      {error && <div className="reference-catalog-error reference-ui-cell reference-ui-cell-warn"><span className="reference-ui-cell-icon"><Icon name="warning" /></span><span className="reference-ui-cell-body"><strong>{text.unavailable}</strong><small>{error}</small></span><span className="reference-ui-cell-actions"><button type="button" className="reference-ui-btn reference-ui-btn-mini reference-ui-btn-default" onClick={() => void load(true)}>{text.retry}</button></span></div>}
      {loading && !catalog && <div className="reference-ui-loadmore reference-catalog-loading" role="status"><i className="reference-ui-spinner" /><span className="reference-ui-loadmore-copy">{text.loading}</span></div>}

      {catalog && <>
        <section className="reference-catalog-filter-shell" aria-label={text.search}>
          <div className="reference-ui-search reference-catalog-search" role="search"><div className="reference-ui-search-form"><div className="reference-ui-search-box"><Icon name="search" className="reference-catalog-search-icon" /><input className="reference-ui-search-input" type="search" value={query} placeholder={text.search} aria-label={text.search} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />{query && <button className="reference-catalog-search-clear" type="button" aria-label={text.close} onClick={() => { setQuery(""); setPage(1); }}><Icon name="close" /></button>}</div></div></div>
          <div className="reference-catalog-toolbar">
            <SelectMenu defaultOpen={captureSelectOpen} className="reference-catalog-select" value={game} ariaLabel={text.game} label={text.game} options={[{ value: "__all__", label: text.all }, ...gameOptions.map((item) => ({ value: item.id, label: localizedGame(item.id) }))]} onChange={(next) => { setGame(next); setCategory("__all__"); setPage(1); }} />
            {(game === "__all__" || availableCategories.length > 1) && <SelectMenu className="reference-catalog-select" value={category} ariaLabel={text.category} label={text.category} options={[{ value: "__all__", label: text.all }, ...availableCategories.map((item) => ({ value: item, label: localizedCategory(item) }))]} onChange={(next) => { setCategory(next); setPage(1); }} />}
            <SelectMenu className="reference-catalog-select reference-catalog-columns" value={String(gridColumns)} ariaLabel={text.cardsPerRow} label={text.cardsPerRow} options={[2, 3, 4, 5].map((item) => ({ value: String(item), label: String(item) }))} onChange={(next) => setGridColumns(Number(next))} />
            <SelectMenu className="reference-catalog-select reference-catalog-page-size" value={String(pageSize)} ariaLabel={text.itemsPerPage} label={text.itemsPerPage} options={CATALOG_PAGE_SIZE_OPTIONS.map((item) => ({ value: String(item), label: String(item) }))} onChange={(next) => setPageSize(Number(next))} />
          </div>
        </section>

        {game === "__all__" ? <div className="reference-catalog-series-placeholder reference-ui-cell"><span className="reference-ui-cell-icon"><Icon name="info" /></span><span className="reference-ui-cell-body">{text.selectSeries}</span></div> : <section ref={seriesRef} className="reference-catalog-series-card">
          <div className="reference-catalog-series-copy"><span className="reference-catalog-series-icon" aria-hidden="true"><Icon name="download" /></span><div><span className="reference-catalog-eyebrow">{text.seriesTitle}</span><h4>{localizedGame(game)}</h4><p>{text.seriesHint}</p></div></div>
          <div className="reference-catalog-series-metrics"><span><small>{text.total}</small><strong>{seriesMetrics.totalCount} · {formatCatalogBytes(seriesMetrics.totalBytes)}</strong></span><span><small>{text.pending}</small><strong>{seriesMetrics.pendingCount} · {formatCatalogBytes(seriesMetrics.pendingBytes)}</strong></span><span><small>{text.saved}</small><strong>{seriesMetrics.downloadedCount}</strong></span></div>
          {bulk?.game === game && <div className="reference-catalog-bulk-progress" role="status" aria-live="polite"><div className="reference-catalog-bulk-progress-copy"><span>{bulk.busy ? text.downloadingSeries : bulk.failedCount ? text.seriesPartial : text.seriesDone}</span><strong>{bulk.completedCount + bulk.failedCount}/{bulk.totalCount} · {bulkPercent}%</strong></div><div className="reference-ui-progress"><div className="reference-ui-progress-track"><span className="reference-ui-progress-fill" style={{ width: `${bulkPercent}%` }} /></div></div>{bulk.failedCount > 0 && <small>{text.failed} {bulk.failedCount}</small>}</div>}
          <button type="button" className="reference-ui-btn reference-ui-btn-primary reference-catalog-series-action" disabled={Boolean(bulk?.busy) || seriesMetrics.pendingCount === 0} onClick={() => setConfirmSeries(true)}>{bulk?.busy ? <i className="reference-ui-spinner" /> : <Icon name="download" />}<span>{bulk?.busy ? `${text.downloadingSeries} ${bulk.completedCount + bulk.failedCount}/${bulk.totalCount}` : seriesMetrics.pendingCount ? text.downloadSeries : text.nothingPending}</span></button>
        </section>}

        <div className="reference-catalog-result-heading"><div><strong>{text.found}</strong><span>{assets.length} / {catalog.assets.length}</span></div><span>{game === "__all__" ? text.all : localizedGame(game)}{category !== "__all__" ? ` · ${localizedCategory(category)}` : ""}</span></div>
        <div className="reference-catalog-grid" ref={gridRef} style={{ "--reference-catalog-columns": gridColumns } as CSSProperties}>
          {pageAssets.map((asset) => {
            const percent = progress[asset.id] ?? 0;
            const busy = Boolean(active[asset.id]);
            const done = downloadedIds.has(asset.id);
            return <article className="reference-catalog-card" key={asset.id} onDoubleClick={() => setPreviewAsset(asset)}>
              <div className="reference-catalog-thumb" style={asset.width > 0 && asset.height > 0 ? { aspectRatio: `${asset.width} / ${asset.height}` } : undefined}><img src={catalogThumbnailUrls(asset)[0]} onError={(event) => { const fallback = catalogThumbnailUrls(asset)[1]; if (fallback && event.currentTarget.src !== fallback) event.currentTarget.src = fallback; }} alt={catalogName(asset, language)} loading="lazy" /><button type="button" className="reference-catalog-preview-button" aria-label={`${text.preview} ${catalogName(asset, language)}`} onClick={() => setPreviewAsset(asset)}><Icon name="search" /></button>{done && <span className="reference-catalog-downloaded-badge"><Icon name="successCircle" />{text.downloaded}</span>}</div>
              <div className="reference-catalog-card-body"><strong title={catalogName(asset, language)}>{catalogName(asset, language)}</strong><small>{localizedGame(asset.game)} · {localizedCategory(asset.category)}</small><small>{asset.width}×{asset.height} · {formatCatalogBytes(asset.bytes)}</small>{busy && <div className="reference-ui-progress reference-catalog-progress" aria-label={`${text.progress} ${percent}%`}><div className="reference-ui-progress-track"><span className="reference-ui-progress-fill" style={{ width: `${percent}%` }} /></div><em>{percent}%</em></div>}<button type="button" className={`reference-ui-btn ${done ? "reference-ui-btn-default" : "reference-ui-btn-primary"}`} disabled={busy || done || Boolean(bulk?.busy)} onClick={() => void persistAsset(asset)}>{busy && <i className="reference-ui-spinner" />}{done ? text.downloaded : busy ? `${text.progress} ${percent}%` : text.download}</button></div>
            </article>;
          })}
        </div>
        {assets.length === 0 && <div className="reference-ui-loadmore reference-ui-loadmore-line reference-catalog-empty"><span className="reference-ui-loadmore-copy">{text.noResult}</span></div>}
        {assets.length > 0 && <nav className="aitag-pagination reference-catalog-pagination" aria-label={text.page.replace("{page}", String(page)).replace("{pages}", String(pageCount))}><button type="button" className="reference-ui-btn reference-ui-btn-default" disabled={page <= 1 || pendingPage !== null} onClick={() => void changePage(page - 1)}>{text.previous}</button><CatalogPageNumberInput page={pendingPage ?? page} pageCount={pageCount} disabled={pendingPage !== null} label={text.goToPage} onChange={(next) => void changePage(next)} /><b aria-live="polite">{pendingPage === null ? `${text.page.replace("{page}", String(page)).replace("{pages}", String(pageCount))} · ${Math.min((page - 1) * pageSize + 1, assets.length)}–${Math.min(page * pageSize, assets.length)} / ${assets.length}` : text.loadingPage.replace("{page}", String(pendingPage))}</b><button type="button" className="reference-ui-btn reference-ui-btn-default" disabled={page >= pageCount || pendingPage !== null} onClick={() => void changePage(page + 1)}>{text.next}</button></nav>}
      </>}
    </section>

    {previewAsset && <AppPortal><div className="modal-backdrop reference-catalog-preview-backdrop" onClick={() => setPreviewAsset(null)}><div ref={previewRef} className="reference-catalog-preview" onClick={(event) => event.stopPropagation()}><button type="button" className="reference-preset-close" aria-label={text.close} onClick={() => setPreviewAsset(null)}><Icon name="close" /></button><PreviewImageViewer onBackgroundClick={()=>setPreviewAsset(null)} images={assets.map(item=>({src:item.id,alt:catalogName(item,language)}))} index={Math.max(0,assets.findIndex(item=>item.id===previewAsset.id))} onIndex={index=>setPreviewAsset(assets[index])} renderImage={<img src={catalogThumbnailUrls(previewAsset)[0]} onError={(event) => { const fallback = catalogThumbnailUrls(previewAsset)[1]; if (fallback && event.currentTarget.src !== fallback) event.currentTarget.src = fallback; }} alt={catalogName(previewAsset, language)} />}/><div className="reference-catalog-preview-copy"><strong>{catalogName(previewAsset, language)}</strong><span>{localizedGame(previewAsset.game)} · {localizedCategory(previewAsset.category)} · {previewAsset.width}×{previewAsset.height}</span></div></div></div></AppPortal>}

    {confirmSeries && game !== "__all__" && <AppPortal><div className="reference-ui-mask reference-catalog-confirm-mask" onClick={() => setConfirmSeries(false)}><section ref={confirmRef} className="reference-ui-dialog reference-catalog-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="reference-series-download-title" onClick={(event) => event.stopPropagation()}><div className="reference-ui-dialog-head"><strong id="reference-series-download-title" className="reference-ui-dialog-title">{text.confirmSeries}</strong></div><div className="reference-ui-dialog-body"><b>{localizedGame(game)}</b><p>{text.pending} {seriesMetrics.pendingCount} · {formatCatalogBytes(seriesMetrics.pendingBytes)}</p><small>{text.seriesHint}</small></div><div className="reference-ui-dialog-actions"><button type="button" className="reference-ui-dialog-button reference-ui-dialog-button-default" onClick={() => setConfirmSeries(false)}>{text.cancel}</button><button type="button" className="reference-ui-dialog-button reference-ui-dialog-button-primary" onClick={() => void downloadSeries()}>{text.confirm}</button></div></section></div></AppPortal>}
  </>;
}
