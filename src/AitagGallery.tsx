import { useCallback, useEffect, useMemo, useRef, useState, type ImgHTMLAttributes } from "react";
import {
  AITAG_PAGE_SIZE,
  AITAG_SITE_URL,
  aitagImageUrl,
  aitagMetadataRecord,
  formatAitagMetadata,
  normalizeAitagConfig,
  normalizeAitagDetail,
  normalizeAitagSearch,
  stripAitagHtml,
  type AitagConfig,
  type AitagSort,
  type AitagWorkDetail,
  type AitagWorkSummary,
} from "./aitag";
import { normalizeAppLanguage } from "./i18n";
import { groupLabel, IMPORT_LABELS, parameterLabel } from "./MetadataInspector";
import { inspectImageMetadata } from "./png-meta";
import {
  DEFAULT_GELBOORU_API_KEY,
  DEFAULT_GELBOORU_USER_ID,
  ONLINE_GALLERY_SOURCES,
  onlineGallerySourceInfo,
  type OnlineGalleryDetail,
  type OnlineGalleryItem,
  type OnlineGalleryPage,
  type OnlineGallerySourceId,
} from "./online-gallery";
import { useAppStore } from "./store";
import type { ImportedParams } from "./types";
import { SelectMenu } from "./components/ui";

const COPY_RESET_MS = 1_500;
const COMPATIBLE_SELECTION_KEY = "langbai.aitag.compatible-params.v1";
export const AITAG_CACHE_RETENTION_KEY = "langbai.aitag.cache-retention-days.v1";
const COMPATIBLE_PARAM_KEYS = Object.keys(IMPORT_LABELS) as (keyof ImportedParams)[];
const ONLINE_GALLERY_SOURCE_KEY = "langbai.online-gallery.source.v1";

function loadCompatibleSelection(): Set<keyof ImportedParams> {
  try {
    const raw = localStorage.getItem(COMPATIBLE_SELECTION_KEY);
    if (!raw) return new Set(COMPATIBLE_PARAM_KEYS);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set(COMPATIBLE_PARAM_KEYS);
    return new Set(parsed.filter((key): key is keyof ImportedParams =>
      typeof key === "string" && COMPATIBLE_PARAM_KEYS.includes(key as keyof ImportedParams)));
  } catch {
    return new Set(COMPATIBLE_PARAM_KEYS);
  }
}

const TEXT = {
  "zh-CN": {
    title: "在线画廊",
    subtitle: "当前来源：AITag。搜索、浏览公开作品并查看生成原参数。",
    back: "返回工具",
    source: "打开 AITag 网站",
    query: "搜索作品、作者、标签、模型或 ID",
    prompt: "搜索正向提示词（可选）",
    search: "搜索",
    refresh: "刷新",
    newest: "最新作品",
    monthly: "本月排行",
    timeRange: "时间范围",
    allTime: "全部时间",
    fullYear: "{year} 全年",
    quarter: "{year} 年第 {quarter} 季度",
    currentMonth: "当前月份",
    older: "更早作品",
    loading: "正在读取 AITag 数据…",
    failed: "读取失败，请检查网络后重试。",
    retry: "重试",
    empty: "没有找到匹配的作品",
    total: "共 {count} 个作品",
    previous: "上一页",
    next: "下一页",
    page: "第 {page} 页",
    images: "{count} 张",
    views: "浏览 {count}",
    bookmarks: "收藏 {count}",
    detailBack: "返回搜索结果",
    workId: "作品 ID",
    author: "作者 ID",
    created: "发布时间",
    aiType: "生成类型",
    model: "模型",
    metadata: "图片原数据",
    promptText: "提示词文本",
    noMetadata: "该图片没有公开的生成原数据。",
    copy: "复制",
    copied: "已复制",
    image: "图片 {index}",
    use: "一键使用到生成",
    compatible: "可用兼容参数 {count} 项",
    compatibleSettings: "兼容参数复用设置",
    selectedCompatible: "已选择 {selected}/{total} 项",
    selectAll: "全选",
    clearAll: "清空",
    noSelected: "请至少勾选一个兼容参数",
    sourceNotice: "数据与图片来自 AITag；接口结构变更时可能暂时不可用。",
  },
  "zh-TW": {
    title: "線上畫廊",
    subtitle: "目前來源：AITag。搜尋、瀏覽公開作品並查看生成原參數。",
    back: "返回工具",
    source: "開啟 AITag 網站",
    query: "搜尋作品、作者、標籤、模型或 ID",
    prompt: "搜尋正向提示詞（可選）",
    search: "搜尋",
    refresh: "重新整理",
    newest: "最新作品",
    monthly: "本月排行",
    timeRange: "時間範圍",
    allTime: "全部時間",
    fullYear: "{year} 全年",
    quarter: "{year} 年第 {quarter} 季度",
    currentMonth: "目前月份",
    older: "更早作品",
    loading: "正在讀取 AITag 資料…",
    failed: "讀取失敗，請檢查網路後重試。",
    retry: "重試",
    empty: "找不到符合的作品",
    total: "共 {count} 個作品",
    previous: "上一頁",
    next: "下一頁",
    page: "第 {page} 頁",
    images: "{count} 張",
    views: "瀏覽 {count}",
    bookmarks: "收藏 {count}",
    detailBack: "返回搜尋結果",
    workId: "作品 ID",
    author: "作者 ID",
    created: "發佈時間",
    aiType: "生成類型",
    model: "模型",
    metadata: "圖片原始資料",
    promptText: "提示詞文字",
    noMetadata: "此圖片沒有公開的生成原始資料。",
    copy: "複製",
    copied: "已複製",
    image: "圖片 {index}",
    use: "一鍵套用到生成",
    compatible: "可用相容參數 {count} 項",
    compatibleSettings: "相容參數重用設定",
    selectedCompatible: "已選擇 {selected}/{total} 項",
    selectAll: "全選",
    clearAll: "清除",
    noSelected: "請至少勾選一個相容參數",
    sourceNotice: "資料與圖片來自 AITag；介面結構變更時可能暫時無法使用。",
  },
  "en-US": {
    title: "Online Gallery",
    subtitle: "Current source: AITag. Search public works and inspect their generation metadata.",
    back: "Back to Tools",
    source: "Open AITag",
    query: "Search works, creators, tags, models, or IDs",
    prompt: "Search positive prompts (optional)",
    search: "Search",
    refresh: "Refresh",
    newest: "Newest",
    monthly: "Monthly Rank",
    timeRange: "Time range",
    allTime: "All time",
    fullYear: "{year} (full year)",
    quarter: "{year} Q{quarter}",
    currentMonth: "Current month",
    older: "Older works",
    loading: "Loading AITag data…",
    failed: "Could not load data. Check your network and try again.",
    retry: "Retry",
    empty: "No matching works found",
    total: "{count} works",
    previous: "Previous",
    next: "Next",
    page: "Page {page}",
    images: "{count} images",
    views: "{count} views",
    bookmarks: "{count} bookmarks",
    detailBack: "Back to results",
    workId: "Work ID",
    author: "Creator ID",
    created: "Published",
    aiType: "AI Type",
    model: "Model",
    metadata: "Original Image Metadata",
    promptText: "Prompt Text",
    noMetadata: "No public generation metadata is available for this image.",
    copy: "Copy",
    copied: "Copied",
    image: "Image {index}",
    use: "Use in Generate",
    compatible: "{count} compatible values",
    compatibleSettings: "Compatible parameters to reuse",
    selectedCompatible: "{selected}/{total} selected",
    selectAll: "Select all",
    clearAll: "Clear all",
    noSelected: "Select at least one compatible parameter",
    sourceNotice: "Data and images are provided by AITag; availability may change with its API.",
  },
  "ja-JP": {
    title: "オンラインギャラリー",
    subtitle: "現在のソース：AITag。公開作品を検索し、生成パラメータを確認できます。",
    back: "ツールへ戻る",
    source: "AITag を開く",
    query: "作品、作者、タグ、モデル、ID を検索",
    prompt: "ポジティブプロンプトを検索（任意）",
    search: "検索",
    refresh: "更新",
    newest: "新着作品",
    monthly: "月間ランキング",
    timeRange: "期間",
    allTime: "全期間",
    fullYear: "{year} 年通年",
    quarter: "{year} 年 Q{quarter}",
    currentMonth: "今月",
    older: "以前の作品",
    loading: "AITag データを読み込み中…",
    failed: "読み込めませんでした。ネットワークを確認して再試行してください。",
    retry: "再試行",
    empty: "一致する作品がありません",
    total: "全 {count} 作品",
    previous: "前のページ",
    next: "次のページ",
    page: "{page} ページ",
    images: "{count} 枚",
    views: "閲覧 {count}",
    bookmarks: "ブックマーク {count}",
    detailBack: "検索結果へ戻る",
    workId: "作品 ID",
    author: "作者 ID",
    created: "公開日時",
    aiType: "生成タイプ",
    model: "モデル",
    metadata: "画像の生成データ",
    promptText: "プロンプトテキスト",
    noMetadata: "この画像には公開された生成データがありません。",
    copy: "コピー",
    copied: "コピー済み",
    image: "画像 {index}",
    use: "生成画面で使用",
    compatible: "互換設定 {count} 件",
    compatibleSettings: "再利用する互換設定",
    selectedCompatible: "{selected}/{total} 件を選択",
    selectAll: "すべて選択",
    clearAll: "すべて解除",
    noSelected: "互換設定を1つ以上選択してください",
    sourceNotice: "データと画像は AITag 提供です。API 変更時は一時的に利用できない場合があります。",
  },
  "ko-KR": {
    title: "온라인 갤러리",
    subtitle: "현재 소스: AITag. 공개 작품을 검색하고 생성 매개변수를 확인합니다.",
    back: "도구로 돌아가기",
    source: "AITag 열기",
    query: "작품, 작가, 태그, 모델 또는 ID 검색",
    prompt: "긍정 프롬프트 검색(선택 사항)",
    search: "검색",
    refresh: "새로고침",
    newest: "최신 작품",
    monthly: "월간 순위",
    timeRange: "기간",
    allTime: "전체 기간",
    fullYear: "{year}년 전체",
    quarter: "{year}년 {quarter}분기",
    currentMonth: "이번 달",
    older: "이전 작품",
    loading: "AITag 데이터를 불러오는 중…",
    failed: "데이터를 불러오지 못했습니다. 네트워크를 확인하고 다시 시도하세요.",
    retry: "다시 시도",
    empty: "일치하는 작품이 없습니다",
    total: "총 {count}개 작품",
    previous: "이전 페이지",
    next: "다음 페이지",
    page: "{page}페이지",
    images: "{count}장",
    views: "조회 {count}",
    bookmarks: "북마크 {count}",
    detailBack: "검색 결과로 돌아가기",
    workId: "작품 ID",
    author: "작가 ID",
    created: "게시 시간",
    aiType: "생성 유형",
    model: "모델",
    metadata: "이미지 원본 데이터",
    promptText: "프롬프트 텍스트",
    noMetadata: "이 이미지에는 공개된 생성 원본 데이터가 없습니다.",
    copy: "복사",
    copied: "복사됨",
    image: "이미지 {index}",
    use: "생성 화면에서 사용",
    compatible: "호환 값 {count}개",
    compatibleSettings: "재사용할 호환 매개변수",
    selectedCompatible: "{selected}/{total}개 선택",
    selectAll: "전체 선택",
    clearAll: "전체 해제",
    noSelected: "호환 매개변수를 하나 이상 선택하세요",
    sourceNotice: "데이터와 이미지는 AITag에서 제공되며 API 변경 시 일시적으로 사용할 수 없을 수 있습니다.",
  },
} as const;

type GalleryText = (typeof TEXT)[keyof typeof TEXT];

// Keep the gallery session outside React. ToolsHub is intentionally unmounted
// when the user visits Generate/Redraw, but returning should feel like switching
// tabs, not like reopening a remote website.
const gallerySession = {
  loaded: false,
  config: normalizeAitagConfig({}),
  query: "",
  prompt: "",
  sort: "new" as AitagSort,
  timeRange: "all",
  page: 1,
  result: normalizeAitagSearch({}),
  selected: null as AitagWorkDetail | null,
  selectedImage: 0,
};
const galleryDetailCache = new Map<number, Promise<AitagWorkDetail>>();

function interpolate(value: string, key: string, replacement: string | number) {
  return value.replace(`{${key}}`, String(replacement));
}

function CopyButton({ value, text }: { value: string; text: GalleryText }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), COPY_RESET_MS);
  };
  return (
    <button type="button" className="btn secondary compact" onClick={() => void copy()} disabled={!value}>
      {copied ? text.copied : text.copy}
    </button>
  );
}

function loadGallerySource(): OnlineGallerySourceId {
  const stored = localStorage.getItem(ONLINE_GALLERY_SOURCE_KEY);
  return ONLINE_GALLERY_SOURCES.some((source) => source.id === stored)
    ? stored as OnlineGallerySourceId
    : "aitag";
}

function GallerySourcePicker({
  value,
  onChange,
}: {
  value: OnlineGallerySourceId;
  onChange: (value: OnlineGallerySourceId) => void;
}) {
  return (
    <div className="online-gallery-source-picker">
      <SelectMenu
        value={value}
        ariaLabel="画廊来源"
        label="画廊来源"
        className="online-gallery-source-menu"
        options={ONLINE_GALLERY_SOURCES.map((source) => ({ value: source.id, label: source.label }))}
        onChange={(source) => onChange(source as OnlineGallerySourceId)}
      />
    </div>
  );
}

function OnlineCachedImage({
  source,
  src,
  onError,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { source: OnlineGallerySourceId; src: string }) {
  const [resolved, setResolved] = useState("");
  const [failed, setFailed] = useState(false);
  const retryRef = useRef(false);
  const activeRef = useRef(true);
  const resolve = useCallback((force: boolean) => {
    const days = Number(localStorage.getItem(AITAG_CACHE_RETENTION_KEY) ?? "30");
    return window.naiDesktop.onlineGalleryCacheImage(source, src, Number.isFinite(days) ? days : 30, force)
      .then((localUrl) => {
        if (!activeRef.current) return;
        setResolved(localUrl);
        setFailed(false);
      })
      .catch(() => {
        if (!activeRef.current) return;
        setResolved("");
        setFailed(true);
      });
  }, [source, src]);
  useEffect(() => {
    activeRef.current = true;
    retryRef.current = false;
    setResolved("");
    setFailed(false);
    void resolve(false);
    return () => { activeRef.current = false; };
  }, [resolve]);
  const handleError: ImgHTMLAttributes<HTMLImageElement>["onError"] = (event) => {
    onError?.(event);
    if (retryRef.current) {
      setResolved("");
      setFailed(true);
      return;
    }
    retryRef.current = true;
    setResolved("");
    void resolve(true);
  };
  return resolved && !failed
    ? <img {...props} src={resolved} onError={handleError} />
    : <span className="aitag-image-loading">{failed ? "图片不可用" : "加载中"}</span>;
}

function ExternalWorkCard({ item, onOpen }: { item: OnlineGalleryItem; onOpen: (item: OnlineGalleryItem) => void }) {
  return (
    <article className="aitag-card online-gallery-card">
      <button type="button" className="aitag-card-hit" aria-label={item.title} onClick={() => onOpen(item)}>
        <div className="aitag-card-image" style={item.cover.width > 0 && item.cover.height > 0 ? { aspectRatio: `${item.cover.width} / ${item.cover.height}` } : undefined}>
          {item.cover.previewUrl
            ? <OnlineCachedImage source={item.source} src={item.cover.previewUrl} alt="" />
            : <span>{item.kind === "collection" ? "法典" : onlineGallerySourceInfo(item.source).label}</span>}
          <small>{item.kind === "collection" ? `${item.mediaCount} 张配图` : item.rating.toUpperCase()}</small>
        </div>
        <div className="aitag-card-copy">
          <b>{item.title || `#${item.id}`}</b>
          <span>{item.author || onlineGallerySourceInfo(item.source).label} · {item.createdAt || "—"}</span>
          <p>{item.description || item.prompt.slice(0, 160)}</p>
          <div>
            <small>{item.kind === "collection" ? "点击进入图鉴" : `评分 ${item.score}`}</small>
            <small>{item.favoriteCount ? `收藏 ${item.favoriteCount}` : `${item.mediaCount} 张`}</small>
          </div>
        </div>
      </button>
    </article>
  );
}

const EMPTY_EXTERNAL_PAGE: OnlineGalleryPage = {
  source: "safebooru",
  page: 1,
  pageSize: 60,
  hasMore: false,
  items: [],
};

function ExternalGallery({
  source,
  onSourceChange,
  onBack,
  text,
}: {
  source: Exclude<OnlineGallerySourceId, "aitag">;
  onSourceChange: (source: OnlineGallerySourceId) => void;
  onBack?: () => void;
  text: GalleryText;
}) {
  const applyParams = useAppStore((state) => state.applyParams);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const [queryValue, setQueryValue] = useState("");
  const [safeOnly, setSafeOnly] = useState(true);
  const [collectionId, setCollectionId] = useState("");
  const [collectionTitle, setCollectionTitle] = useState("");
  const [result, setResult] = useState<OnlineGalleryPage>({ ...EMPTY_EXTERNAL_PAGE, source });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<OnlineGalleryDetail | null>(null);
  const [selectedMedia, setSelectedMedia] = useState(0);
  const gelbooruApiKey = DEFAULT_GELBOORU_API_KEY;
  const gelbooruUserId = DEFAULT_GELBOORU_USER_ID;
  const requestSequence = useRef(0);
  const info = onlineGallerySourceInfo(source);

  const search = useCallback(async (
    targetPage = 1,
    targetCollection = collectionId,
    targetQuery = queryValue,
    targetSafeOnly = safeOnly,
  ) => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError("");
    try {
      const pageResult = await window.naiDesktop.onlineGallerySearch({
        source,
        page: targetPage,
        query: targetQuery,
        collectionId: targetCollection || undefined,
        safeOnly: targetSafeOnly,
        gelbooruApiKey,
        gelbooruUserId,
      });
      if (sequence !== requestSequence.current) return;
      setResult(pageResult);
      setCollectionTitle(pageResult.collectionTitle ?? "");
    } catch (reason) {
      if (sequence !== requestSequence.current) return;
      const message = String(reason ?? "");
      setError(source === "gelbooru" && /401|403|unauthorized|credentials|GELBOORU/i.test(message)
        ? "Gelbooru 凭据无效或已失效，请检查 User ID 与 API Key。"
        : "读取该来源失败，请检查网络或稍后重试。");
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [collectionId, gelbooruApiKey, gelbooruUserId, queryValue, safeOnly, source]);

  useEffect(() => {
    setSelected(null);
    setCollectionId("");
    setCollectionTitle("");
    setQueryValue("");
    setResult({ ...EMPTY_EXTERNAL_PAGE, source });
  }, [source]);

  useEffect(() => {
    void search(1, "", "", true);
  }, [source]); // source switch only; searches after that are explicit

  const refresh = async () => {
    await window.naiDesktop.onlineGalleryClearDataCache();
    await search(result.page);
  };

  const openItem = async (item: OnlineGalleryItem) => {
    if (item.kind === "collection") {
      setCollectionId(item.id);
      setCollectionTitle(item.title);
      setQueryValue("");
      await search(1, item.id, "");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const detail = await window.naiDesktop.onlineGalleryDetail({
        source,
        id: item.id,
        collectionId: item.collectionId,
        gelbooruApiKey,
        gelbooruUserId,
      });
      setSelected(detail);
      setSelectedMedia(0);
    } catch {
      setError("无法打开作品详情，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  if (selected) {
    const media = selected.media[selectedMedia] ?? selected.item.cover;
    const tagGroups = [
      ["艺术家", selected.item.tags.artists],
      ["角色", selected.item.tags.characters],
      ["作品", selected.item.tags.copyrights],
      ["通用", selected.item.tags.general],
      ["元数据", selected.item.tags.meta],
    ] as const;
    return (
      <main className="aitag-page aitag-detail-page">
        <header className="aitag-header">
          <div>
            <button type="button" className="btn secondary compact" onClick={() => setSelected(null)}>{text.detailBack}</button>
            <h2>{selected.item.title || `#${selected.item.id}`}</h2>
            <p>{info.label} · {selected.item.createdAt || "—"}</p>
          </div>
          <button type="button" className="btn secondary" disabled={!selected.item.sourceUrl} onClick={() => void window.naiDesktop.openExternal(selected.item.sourceUrl)}>打开来源页面</button>
        </header>
        <section className="aitag-work-facts">
          <article><span>来源</span><b>{info.label}</b></article>
          <article><span>{text.author}</span><b>{selected.item.author || "—"}</b></article>
          <article><span>内容分级</span><b>{selected.item.rating || "—"}</b></article>
          <article><span>尺寸</span><b>{media.width && media.height ? `${media.width} × ${media.height}` : "—"}</b></article>
        </section>
        <section className="aitag-detail-grid">
          <div className="aitag-detail-visual">
            {media.displayUrl ? <OnlineCachedImage source={source} src={media.displayUrl} alt={selected.item.title} /> : null}
            {selected.media.length > 1 ? (
              <div className="aitag-image-strip">
                {selected.media.map((candidate, index) => (
                  <button key={candidate.id} type="button" className={index === selectedMedia ? "active" : ""} onClick={() => setSelectedMedia(index)}>
                    <OnlineCachedImage source={source} src={candidate.previewUrl} alt={`${selected.item.title} ${index + 1}`} />
                    <span>{index + 1}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="aitag-metadata-panel online-gallery-detail-info">
            {selected.prompt ? (
              <article className="aitag-data-block">
                <header>
                  <h3>{text.promptText}</h3>
                  <div className="online-gallery-inline-actions">
                    <CopyButton value={selected.prompt} text={text} />
                    <button type="button" className="btn primary compact" onClick={() => { applyParams({ positivePrompt: selected.prompt, ...(selected.negativePrompt ? { negativePrompt: selected.negativePrompt } : {}) }); setActiveTab("generate"); }}>{text.use}</button>
                  </div>
                </header>
                <pre>{selected.prompt}</pre>
              </article>
            ) : null}
            {selected.negativePrompt ? (
              <article className="aitag-data-block">
                <header><h3>负面提示词</h3><CopyButton value={selected.negativePrompt} text={text} /></header>
                <pre>{selected.negativePrompt}</pre>
              </article>
            ) : null}
            {tagGroups.map(([label, tags]) => tags.length ? (
              <section key={label} className="online-gallery-tag-section">
                <h3>{label} ({tags.length})</h3>
                <div>{tags.map((tag) => <button key={tag} type="button" onClick={() => { setSelected(null); setQueryValue(tag); void search(1, collectionId, tag); }}>{tag.replaceAll("_", " ")}</button>)}</div>
              </section>
            ) : null)}
            {selected.note ? <article className="aitag-data-block"><header><h3>说明</h3></header><p>{selected.note}</p></article> : null}
          </div>
        </section>
      </main>
    );
  }

  const maxPage = result.total ? Math.max(1, Math.ceil(result.total / result.pageSize)) : undefined;
  return (
    <main className="aitag-page">
      <header className="aitag-header online-gallery-header">
        <div>
          {onBack ? <button type="button" className="btn secondary compact" onClick={onBack}>{text.back}</button> : null}
          <div className="online-gallery-title-line">
            <h2>{collectionTitle || "在线画廊"}</h2>
            <GallerySourcePicker value={source} onChange={onSourceChange} />
          </div>
          <p>{collectionId ? `${info.label} · ${collectionTitle}` : `当前来源：${info.label}。点击卡片可查看完整图片、标签与可用提示词。`}</p>
        </div>
        <div className="aitag-header-actions">
          {collectionId ? <button type="button" className="btn secondary" onClick={() => { setCollectionId(""); setCollectionTitle(""); setQueryValue(""); void search(1, "", ""); }}>返回图鉴列表</button> : null}
          <button type="button" className="btn secondary" disabled={loading} onClick={() => void refresh()}>{text.refresh}</button>
          <button type="button" className="btn secondary" onClick={() => void window.naiDesktop.openExternal(info.siteUrl)}>打开来源网站</button>
        </div>
      </header>
      <section className="aitag-search-panel">
        <div className="online-gallery-search-row">
          <input value={queryValue} onChange={(event) => setQueryValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(1); }} placeholder={source === "quicktag" ? "搜索图鉴、标题、作者或提示词" : "搜索标签，多个标签用空格分隔"} />
          <button type="button" className="btn primary" disabled={loading} onClick={() => void search(1)}>{text.search}</button>
        </div>
        <div className="aitag-sort-tabs online-gallery-filter-row">
          <label className="online-gallery-safe-toggle"><input type="checkbox" checked={safeOnly} onChange={(event) => { const checked = event.target.checked; setSafeOnly(checked); void search(1, collectionId, queryValue, checked); }} /><span>仅显示全年龄</span></label>
          <span>{result.total == null ? `${result.items.length} 个结果` : `共 ${result.total} 个结果`}</span>
        </div>
      </section>
      {loading ? <div className="aitag-state">正在读取 {info.label} 数据…</div> : null}
      {error ? <div className="aitag-state error"><span>{error}</span><button type="button" className="btn secondary" onClick={() => void search(result.page)}>{text.retry}</button></div> : null}
      {!loading && !error && result.items.length === 0 ? <div className="aitag-state">{text.empty}</div> : null}
      {!loading && !error ? (
        <section className="aitag-work-grid online-gallery-work-grid">
          {result.items.map((item) => <ExternalWorkCard key={`${item.source}:${item.id}`} item={item} onOpen={(value) => void openItem(value)} />)}
        </section>
      ) : null}
      {!loading && !error && result.items.length > 0 ? (
        <nav className="aitag-pagination" aria-label={text.page}>
          <button type="button" className="btn secondary" disabled={result.page <= 1} onClick={() => void search(result.page - 1)}>{text.previous}</button>
          <b>{interpolate(text.page, "page", result.page)}{maxPage ? ` / ${maxPage}` : ""}</b>
          <button type="button" className="btn secondary" disabled={maxPage ? result.page >= maxPage : !result.hasMore} onClick={() => void search(result.page + 1)}>{text.next}</button>
        </nav>
      ) : null}
    </main>
  );
}

function AitagCachedImage({ src, onError, ...props }: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  const [resolved, setResolved] = useState("");
  const [failed, setFailed] = useState(false);
  const retryRef = useRef(false);
  const activeRef = useRef(true);
  const resolve = useCallback((force: boolean) => {
    const days = Number(localStorage.getItem(AITAG_CACHE_RETENTION_KEY) ?? "30");
    return window.naiDesktop.aitagCacheImage(src, Number.isFinite(days) ? days : 30, force)
      .then((localUrl) => {
        if (!activeRef.current) return;
        setResolved(localUrl);
        setFailed(false);
      })
      .catch(() => {
        if (!activeRef.current) return;
        setResolved("");
        setFailed(true);
      });
  }, [src]);
  useEffect(() => {
    activeRef.current = true;
    retryRef.current = false;
    setResolved("");
    setFailed(false);
    void resolve(false);
    return () => { activeRef.current = false; };
  }, [resolve]);
  const handleError: ImgHTMLAttributes<HTMLImageElement>["onError"] = (event) => {
    onError?.(event);
    if (retryRef.current) {
      setResolved("");
      setFailed(true);
      return;
    }
    retryRef.current = true;
    setResolved("");
    void resolve(true);
  };
  return resolved && !failed
    ? <img {...props} src={resolved} onError={handleError} />
    : <span className="aitag-image-loading">{failed ? "—" : "AITag"}</span>;
}

function WorkCard({
  work,
  config,
  text,
  loadDetail,
  onOpen,
}: {
  work: AitagWorkSummary;
  config: AitagConfig;
  text: GalleryText;
  loadDetail: (id: number) => Promise<AitagWorkDetail>;
  onOpen: (work: AitagWorkSummary) => void;
}) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void loadDetail(work.id).then((detail) => {
        const first = detail.images[0];
        if (first) setImageUrl(aitagImageUrl(config, first));
      }).catch(() => undefined);
    }, { rootMargin: "320px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [config, loadDetail, work.id]);

  return (
    <article ref={rootRef} className="aitag-card" onClick={() => onOpen(work)}>
      <button type="button" className="aitag-card-hit" aria-label={work.title || `#${work.id}`}>
        <div className="aitag-card-image">
          {imageUrl ? <AitagCachedImage src={imageUrl} alt="" /> : <span>AITag</span>}
          <small>{interpolate(text.images, "count", work.imageCount)}</small>
        </div>
        <div className="aitag-card-copy">
          <b>{work.title || `#${work.id}`}</b>
          <span>{work.aiType || "AI"} · {work.createDate || "—"}</span>
          <p>{stripAitagHtml(work.caption) || work.tags.slice(0, 5).join(" · ")}</p>
          <div>
            <small>{interpolate(text.views, "count", work.totalView)}</small>
            <small>{interpolate(text.bookmarks, "count", work.totalBookmarks)}</small>
          </div>
        </div>
      </button>
    </article>
  );
}

export default function AitagGallery({ onBack }: { onBack?: () => void }) {
  const language = normalizeAppLanguage(useAppStore((state) => state.settings?.language));
  const settings = useAppStore((state) => state.settings);
  const applyParams = useAppStore((state) => state.applyParams);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const text = TEXT[language];
  const [gallerySource, setGallerySourceState] = useState<OnlineGallerySourceId>(loadGallerySource);
  const [config, setConfig] = useState<AitagConfig>(() => gallerySession.config);
  const [query, setQuery] = useState(gallerySession.query);
  const [prompt, setPrompt] = useState(gallerySession.prompt);
  const [sort, setSort] = useState<AitagSort>(gallerySession.sort);
  const [timeRange, setTimeRange] = useState(gallerySession.timeRange);
  const [page, setPage] = useState(gallerySession.page);
  const [result, setResult] = useState(() => gallerySession.result);
  const [loading, setLoading] = useState(!gallerySession.loaded);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<AitagWorkDetail | null>(gallerySession.selected);
  const [selectedImage, setSelectedImage] = useState(gallerySession.selectedImage);
  const [detailLoading, setDetailLoading] = useState(false);
  const [compatibleSelection, setCompatibleSelection] = useState<Set<keyof ImportedParams>>(loadCompatibleSelection);

  const setGallerySource = useCallback((source: OnlineGallerySourceId) => {
    localStorage.setItem(ONLINE_GALLERY_SOURCE_KEY, source);
    setGallerySourceState(source);
  }, []);

  useEffect(() => {
    localStorage.setItem(COMPATIBLE_SELECTION_KEY, JSON.stringify([...compatibleSelection]));
  }, [compatibleSelection]);

  useEffect(() => {
    Object.assign(gallerySession, { config, query, prompt, sort, timeRange, page, result, selected, selectedImage });
  }, [config, page, prompt, query, result, selected, selectedImage, sort, timeRange]);

  const loadDetail = useCallback((id: number) => {
    const existing = galleryDetailCache.get(id);
    if (existing) return existing;
    const request = window.naiDesktop.aitagWork(id).then(normalizeAitagDetail);
    galleryDetailCache.set(id, request);
    request.catch(() => galleryDetailCache.delete(id));
    return request;
  }, []);

  const search = useCallback(async (
    targetPage = 1,
    overrides?: { sort?: AitagSort; timeRange?: string },
  ) => {
    setLoading(true);
    setError(false);
    try {
      const raw = await window.naiDesktop.aitagSearch({
        page: targetPage,
        query,
        prompt,
        sort: overrides?.sort ?? sort,
        timeRange: overrides?.timeRange ?? timeRange,
      });
      const normalized = normalizeAitagSearch(raw);
      setResult(normalized);
      setPage(normalized.page);
      gallerySession.result = normalized;
      gallerySession.page = normalized.page;
      gallerySession.loaded = true;
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [prompt, query, sort, timeRange]);

  useEffect(() => {
    if (gallerySession.loaded) return;
    let active = true;
    void (async () => {
      const snapshot = await window.naiDesktop.aitagSnapshot().catch(() => null);
      if (active && snapshot) {
        const nextConfig = normalizeAitagConfig(snapshot.config);
        const nextResult = normalizeAitagSearch(snapshot.search);
        setConfig(nextConfig);
        setResult(nextResult);
        setPage(nextResult.page);
        setLoading(false);
        gallerySession.config = nextConfig;
        gallerySession.result = nextResult;
        gallerySession.page = nextResult.page;
        gallerySession.loaded = true;
      }
      try {
        const [rawConfig, rawResult] = await Promise.all([
          window.naiDesktop.aitagConfig(),
          window.naiDesktop.aitagSearchFresh({ page: 1, query: "", prompt: "", sort: "new", timeRange: "all" }),
        ]);
        if (!active) return;
        const nextConfig = normalizeAitagConfig(rawConfig);
        const nextResult = normalizeAitagSearch(rawResult);
        setConfig(nextConfig);
        setResult(nextResult);
        setPage(nextResult.page);
        setError(false);
        gallerySession.config = nextConfig;
        gallerySession.result = nextResult;
        gallerySession.page = nextResult.page;
        gallerySession.loaded = true;
      } catch {
        if (active && !snapshot) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []); // initial load only; later searches are explicit

  const refresh = useCallback(async () => {
    galleryDetailCache.clear();
    gallerySession.loaded = false;
    await window.naiDesktop.aitagClearDataCache();
    setSelected(null);
    setSelectedImage(0);
    try {
      const raw = await window.naiDesktop.aitagConfig();
      setConfig(normalizeAitagConfig(raw));
    } catch {
      // Searching still works with the last known CDN/config values.
    }
    await search(page);
  }, [page, search]);

  const openWork = async (work: AitagWorkSummary) => {
    setDetailLoading(true);
    setError(false);
    try {
      const detail = await loadDetail(work.id);
      setSelected(detail);
      setSelectedImage(0);
    } catch {
      setError(true);
    } finally {
      setDetailLoading(false);
    }
  };

  const image = selected?.images[selectedImage];
  const imageUrl = selected && image ? aitagImageUrl(config, image) : "";
  const metadata = image ? formatAitagMetadata(image.aiJson) : "";
  const report = useMemo(
    () => image ? inspectImageMetadata(aitagMetadataRecord(image, selected?.work.aiType ?? "")) : null,
    [image, selected?.work.aiType],
  );
  const compatibleEntries = useMemo(
    () => report
      ? (Object.entries(report.imported) as [keyof ImportedParams, ImportedParams[keyof ImportedParams]][])
          .filter(([, value]) => value !== undefined)
      : [],
    [report],
  );
  const selectedCompatibleEntries = compatibleEntries.filter(([key]) => compatibleSelection.has(key));
  const compatibleCount = compatibleEntries.length;

  const applyCompatible = () => {
    if (!report || !selectedCompatibleEntries.length) return;
    const patch = Object.fromEntries(selectedCompatibleEntries) as Partial<ImportedParams>;
    if (settings?.lockNegativePrompt) delete patch.negativePrompt;
    applyParams(patch);
    setActiveTab("generate");
  };

  const toggleCompatible = (key: keyof ImportedParams) => {
    setCompatibleSelection((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const maxPage = Math.max(1, Math.ceil(result.total / AITAG_PAGE_SIZE));
  const timeOptions = useMemo(() => {
    if (sort === "monthly") {
      const months = [...new Set(config.availableMonths)]
        .filter((month) => month >= "2023-11")
        .sort((a, b) => b.localeCompare(a));
      return [
        { value: "current", label: text.currentMonth },
        ...months.map((month) => ({ value: `m${month}`, label: month })),
        { value: "older", label: text.older },
      ];
    }
    const years = config.availableYears.length ? [...config.availableYears].sort((a, b) => b - a) : [new Date().getFullYear()];
    return [
      { value: "all", label: text.allTime },
      ...years.flatMap((year) => [
        { value: `y${year}`, label: interpolate(text.fullYear, "year", year) },
        ...(year > 2023 ? [1, 2, 3, 4] as const : year === 2023 ? [4] as const : []).map((quarter) => ({
          value: `q${year}Q${quarter}`,
          label: interpolate(interpolate(text.quarter, "year", year), "quarter", quarter),
        })),
      ]),
      { value: "older", label: text.older },
    ];
  }, [config.availableMonths, config.availableYears, sort, text]);

  if (gallerySource !== "aitag") {
    return (
      <ExternalGallery
        source={gallerySource}
        onSourceChange={setGallerySource}
        onBack={onBack}
        text={text}
      />
    );
  }

  if (selected) {
    return (
      <main className="aitag-page aitag-detail-page">
        <header className="aitag-header">
          <div>
            <button type="button" className="btn secondary compact" onClick={() => setSelected(null)}>{text.detailBack}</button>
            <div className="online-gallery-title-line">
              <h2>{selected.work.title || `#${selected.work.id}`}</h2>
              <GallerySourcePicker value={gallerySource} onChange={setGallerySource} />
            </div>
            <p>{text.sourceNotice}</p>
          </div>
          <button type="button" className="btn secondary" onClick={() => void window.naiDesktop.openExternal(`${AITAG_SITE_URL}/i/${selected.work.id}`)}>{text.source}</button>
        </header>

        <section className="aitag-work-facts">
          <article><span>{text.workId}</span><b>{selected.work.id}</b></article>
          <article><span>{text.author}</span><b>{selected.work.userId || "—"}</b></article>
          <article><span>{text.created}</span><b>{selected.work.createDate || "—"}</b></article>
          <article><span>{text.aiType}</span><b>{selected.work.aiType || "—"}</b></article>
        </section>

        <section className="aitag-detail-grid">
          <div className="aitag-detail-visual">
            {imageUrl ? <AitagCachedImage src={imageUrl} alt={interpolate(text.image, "index", selectedImage + 1)} /> : null}
            <div className="aitag-image-strip">
              {selected.images.map((candidate, index) => (
                <button key={candidate.id || index} type="button" className={index === selectedImage ? "active" : ""} onClick={() => setSelectedImage(index)}>
                  <AitagCachedImage src={aitagImageUrl(config, candidate)} alt={interpolate(text.image, "index", index + 1)} loading="lazy" />
                  <span>{index + 1}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="aitag-metadata-panel">
            <div className="aitag-metadata-title">
              <div><span>{text.model}</span><b>{image?.model || selected.work.aiType || "—"}</b></div>
              <div className="aitag-compatible-action">
                <span>{interpolate(interpolate(text.selectedCompatible, "selected", selectedCompatibleEntries.length), "total", compatibleCount)}</span>
                <button type="button" className="btn primary compact" title={!selectedCompatibleEntries.length ? text.noSelected : undefined} disabled={!selectedCompatibleEntries.length} onClick={applyCompatible}>{text.use}</button>
              </div>
            </div>
            {compatibleEntries.length ? (
              <details className="aitag-compatible-details">
                <summary>
                  <span>{text.compatibleSettings}</span>
                  <small>{interpolate(interpolate(text.selectedCompatible, "selected", selectedCompatibleEntries.length), "total", compatibleCount)}</small>
                </summary>
                <div className="aitag-compatible-toolbar">
                  <button type="button" className="btn secondary compact" onClick={() => setCompatibleSelection(new Set(COMPATIBLE_PARAM_KEYS))}>{text.selectAll}</button>
                  <button type="button" className="btn secondary compact" onClick={() => setCompatibleSelection(new Set())}>{text.clearAll}</button>
                </div>
                <div className="aitag-compatible-options">
                  {compatibleEntries.map(([key, value]) => (
                    <label key={key}>
                      <input type="checkbox" checked={compatibleSelection.has(key)} onChange={() => toggleCompatible(key)} />
                      <span><strong>{parameterLabel(language, IMPORT_LABELS[key])}</strong><small>{String(value)}</small></span>
                    </label>
                  ))}
                </div>
              </details>
            ) : null}
            {image?.promptText ? (
              <article className="aitag-data-block">
                <header><h3>{text.promptText}</h3><CopyButton value={image.promptText} text={text} /></header>
                <pre>{image.promptText}</pre>
              </article>
            ) : null}
            <article className="aitag-data-block">
              <details className="aitag-original-details">
                <summary><span>{text.metadata}</span><small>{report?.entries.length ?? 0}</small></summary>
                <div className="aitag-original-details-body">
                  <header><h3>{text.metadata}</h3><CopyButton value={metadata} text={text} /></header>
                  {report?.entries.length ? (
                    <div className="metadata-param-list aitag-param-list">
                      {report.entries.map((entry, index) => (
                        <article key={`${entry.group}-${entry.key}-${index}`}>
                          <div><span>{groupLabel(language, entry.group)}</span><strong>{parameterLabel(language, entry.key)}</strong></div>
                          <pre>{entry.value}</pre>
                          <CopyButton value={entry.value} text={text} />
                        </article>
                      ))}
                    </div>
                  ) : <p>{text.noMetadata}</p>}
                  {metadata ? <details className="aitag-raw-details"><summary>{text.metadata}</summary><pre>{metadata}</pre></details> : null}
                </div>
              </details>
            </article>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="aitag-page">
      <header className="aitag-header">
        <div>
          {onBack ? <button type="button" className="btn secondary compact" onClick={onBack}>{text.back}</button> : null}
          <div className="online-gallery-title-line">
            <h2>{text.title}</h2>
            <GallerySourcePicker value={gallerySource} onChange={setGallerySource} />
          </div>
          <p>{text.subtitle}</p>
        </div>
        <div className="aitag-header-actions">
          <button type="button" className="btn secondary" disabled={loading} onClick={() => void refresh()}>{text.refresh}</button>
          <button type="button" className="btn secondary" onClick={() => void window.naiDesktop.openExternal(AITAG_SITE_URL)}>{text.source}</button>
        </div>
      </header>

      <section className="aitag-search-panel">
        <div className="aitag-search-fields">
          <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(1); }} placeholder={text.query} />
          <input value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(1); }} placeholder={text.prompt} />
          <button type="button" className="btn primary" onClick={() => void search(1)}>{text.search}</button>
        </div>
        <div className="aitag-sort-tabs">
          <button type="button" className={sort === "new" ? "active" : ""} onClick={() => { setSort("new"); setTimeRange("all"); void search(1, { sort: "new", timeRange: "all" }); }}>{text.newest}</button>
          <button type="button" className={sort === "monthly" ? "active" : ""} onClick={() => { setSort("monthly"); setTimeRange("current"); void search(1, { sort: "monthly", timeRange: "current" }); }}>{text.monthly}</button>
          <label className="aitag-time-filter">
            <span>{text.timeRange}</span>
            <select value={timeRange} onChange={(event) => { const value = event.target.value; setTimeRange(value); void search(1, { timeRange: value }); }}>
              {timeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <span>{interpolate(text.total, "count", result.total)}</span>
        </div>
      </section>

      {loading || detailLoading ? <div className="aitag-state">{text.loading}</div> : null}
      {error ? <div className="aitag-state error"><span>{text.failed}</span><button type="button" className="btn secondary" onClick={() => void search(page)}>{text.retry}</button></div> : null}
      {!loading && !error && result.items.length === 0 ? <div className="aitag-state">{text.empty}</div> : null}
      {!loading && !error ? (
        <section className="aitag-work-grid">
          {result.items.map((work) => <WorkCard key={work.id} work={work} config={config} text={text} loadDetail={loadDetail} onOpen={(item) => void openWork(item)} />)}
        </section>
      ) : null}

      {!loading && !error && result.items.length > 0 ? (
        <nav className="aitag-pagination" aria-label={text.page}>
          <button type="button" className="btn secondary" disabled={page <= 1} onClick={() => void search(page - 1)}>{text.previous}</button>
          <b>{interpolate(text.page, "page", page)} / {maxPage}</b>
          <button type="button" className="btn secondary" disabled={page >= maxPage} onClick={() => void search(page + 1)}>{text.next}</button>
        </nav>
      ) : null}
    </main>
  );
}
