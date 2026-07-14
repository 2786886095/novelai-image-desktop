import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { groupLabel, parameterLabel } from "./MetadataInspector";
import { inspectImageMetadata } from "./png-meta";
import { useAppStore } from "./store";

const COPY_RESET_MS = 1_500;

const TEXT = {
  "zh-CN": {
    title: "AI绘画咒语图库",
    subtitle: "原生接入 AITag 的公开作品数据；搜索、浏览并查看生成原参数。",
    back: "返回工具",
    source: "打开 AITag 网站",
    query: "搜索作品、作者、标签、模型或 ID",
    prompt: "搜索正向提示词（可选）",
    search: "搜索",
    newest: "最新作品",
    monthly: "本月排行",
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
    sourceNotice: "数据与图片来自 AITag；接口结构变更时可能暂时不可用。",
  },
  "zh-TW": {
    title: "AI 繪畫咒語圖庫",
    subtitle: "原生接入 AITag 的公開作品資料；搜尋、瀏覽並查看生成原參數。",
    back: "返回工具",
    source: "開啟 AITag 網站",
    query: "搜尋作品、作者、標籤、模型或 ID",
    prompt: "搜尋正向提示詞（可選）",
    search: "搜尋",
    newest: "最新作品",
    monthly: "本月排行",
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
    sourceNotice: "資料與圖片來自 AITag；介面結構變更時可能暫時無法使用。",
  },
  "en-US": {
    title: "AI Art Prompt Gallery",
    subtitle: "Native access to AITag public data for searching works and inspecting generation metadata.",
    back: "Back to Tools",
    source: "Open AITag",
    query: "Search works, creators, tags, models, or IDs",
    prompt: "Search positive prompts (optional)",
    search: "Search",
    newest: "Newest",
    monthly: "Monthly Rank",
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
    sourceNotice: "Data and images are provided by AITag; availability may change with its API.",
  },
  "ja-JP": {
    title: "AI イラスト呪文ギャラリー",
    subtitle: "AITag の公開データをネイティブに検索し、作品と生成パラメータを確認できます。",
    back: "ツールへ戻る",
    source: "AITag を開く",
    query: "作品、作者、タグ、モデル、ID を検索",
    prompt: "ポジティブプロンプトを検索（任意）",
    search: "検索",
    newest: "新着作品",
    monthly: "月間ランキング",
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
    sourceNotice: "データと画像は AITag 提供です。API 変更時は一時的に利用できない場合があります。",
  },
  "ko-KR": {
    title: "AI 그림 프롬프트 갤러리",
    subtitle: "AITag 공개 데이터를 기본 화면에서 검색하고 작품 생성 매개변수를 확인합니다.",
    back: "도구로 돌아가기",
    source: "AITag 열기",
    query: "작품, 작가, 태그, 모델 또는 ID 검색",
    prompt: "긍정 프롬프트 검색(선택 사항)",
    search: "검색",
    newest: "최신 작품",
    monthly: "월간 순위",
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
    sourceNotice: "데이터와 이미지는 AITag에서 제공되며 API 변경 시 일시적으로 사용할 수 없을 수 있습니다.",
  },
} as const;

type GalleryText = (typeof TEXT)[keyof typeof TEXT];

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
          {imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : <span>AITag</span>}
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

export default function AitagGallery({ onBack }: { onBack: () => void }) {
  const language = normalizeAppLanguage(useAppStore((state) => state.settings?.language));
  const settings = useAppStore((state) => state.settings);
  const applyParams = useAppStore((state) => state.applyParams);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const text = TEXT[language];
  const [config, setConfig] = useState<AitagConfig>(() => normalizeAitagConfig({}));
  const [query, setQuery] = useState("");
  const [prompt, setPrompt] = useState("");
  const [sort, setSort] = useState<AitagSort>("new");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(() => normalizeAitagSearch({}));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<AitagWorkDetail | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const cache = useRef(new Map<number, Promise<AitagWorkDetail>>());

  const loadDetail = useCallback((id: number) => {
    const existing = cache.current.get(id);
    if (existing) return existing;
    const request = window.naiDesktop.aitagWork(id).then(normalizeAitagDetail);
    cache.current.set(id, request);
    request.catch(() => cache.current.delete(id));
    return request;
  }, []);

  const search = useCallback(async (targetPage = 1) => {
    setLoading(true);
    setError(false);
    try {
      const raw = await window.naiDesktop.aitagSearch({
        page: targetPage,
        query,
        prompt,
        sort,
      });
      const normalized = normalizeAitagSearch(raw);
      setResult(normalized);
      setPage(normalized.page);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [prompt, query, sort]);

  useEffect(() => {
    void window.naiDesktop.aitagConfig().then((raw) => setConfig(normalizeAitagConfig(raw))).catch(() => undefined);
    void search(1);
  }, []); // initial load only; later searches are explicit

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
  const compatibleCount = report ? Object.values(report.imported).filter((value) => value !== undefined).length : 0;

  const applyCompatible = () => {
    if (!report || !compatibleCount) return;
    const patch = { ...report.imported };
    if (settings?.lockNegativePrompt) delete patch.negativePrompt;
    applyParams(patch);
    setActiveTab("generate");
  };
  const maxPage = Math.max(1, Math.ceil(result.total / AITAG_PAGE_SIZE));

  if (selected) {
    return (
      <main className="aitag-page aitag-detail-page">
        <header className="aitag-header">
          <div>
            <button type="button" className="btn secondary compact" onClick={() => setSelected(null)}>{text.detailBack}</button>
            <h2>{selected.work.title || `#${selected.work.id}`}</h2>
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
            {imageUrl ? <img src={imageUrl} alt={interpolate(text.image, "index", selectedImage + 1)} /> : null}
            <div className="aitag-image-strip">
              {selected.images.map((candidate, index) => (
                <button key={candidate.id || index} type="button" className={index === selectedImage ? "active" : ""} onClick={() => setSelectedImage(index)}>
                  <img src={aitagImageUrl(config, candidate)} alt={interpolate(text.image, "index", index + 1)} loading="lazy" />
                  <span>{index + 1}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="aitag-metadata-panel">
            <div className="aitag-metadata-title">
              <div><span>{text.model}</span><b>{image?.model || selected.work.aiType || "—"}</b></div>
              <div className="aitag-compatible-action">
                <span>{interpolate(text.compatible, "count", compatibleCount)}</span>
                <button type="button" className="btn primary compact" disabled={!compatibleCount} onClick={applyCompatible}>{text.use}</button>
              </div>
            </div>
            {image?.promptText ? (
              <article className="aitag-data-block">
                <header><h3>{text.promptText}</h3><CopyButton value={image.promptText} text={text} /></header>
                <pre>{image.promptText}</pre>
              </article>
            ) : null}
            <article className="aitag-data-block">
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
          <button type="button" className="btn secondary compact" onClick={onBack}>{text.back}</button>
          <h2>{text.title}</h2>
          <p>{text.subtitle}</p>
        </div>
        <button type="button" className="btn secondary" onClick={() => void window.naiDesktop.openExternal(AITAG_SITE_URL)}>{text.source}</button>
      </header>

      <section className="aitag-search-panel">
        <div className="aitag-search-fields">
          <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(1); }} placeholder={text.query} />
          <input value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(1); }} placeholder={text.prompt} />
          <button type="button" className="btn primary" onClick={() => void search(1)}>{text.search}</button>
        </div>
        <div className="aitag-sort-tabs">
          <button type="button" className={sort === "new" ? "active" : ""} onClick={() => setSort("new")}>{text.newest}</button>
          <button type="button" className={sort === "monthly" ? "active" : ""} onClick={() => setSort("monthly")}>{text.monthly}</button>
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
