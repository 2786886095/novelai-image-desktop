import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import clsx from "clsx";
import { format } from "date-fns";
// Keep Tools in deferred chunks. The hub itself is warmed with the other
// top-level screens; its larger children are evaluated progressively during
// idle time instead of all competing with first paint.
const loadToolsHub = () => import("./ToolsHub");
const ToolsHub = lazy(loadToolsHub);
const loadOnlineGalleryPage = () => import("./features/online-gallery/OnlineGalleryPage");
const loadAgentPage = () => import("./AgentPage");
const loadInpaintCanvas = () => import("./InpaintCanvas").then((m) => ({ default: m.InpaintCanvas }));
const loadMetadataInspector = () => import("./MetadataInspector");
const OnlineGalleryPage = lazy(loadOnlineGalleryPage);
const AgentPage = lazy(loadAgentPage);
const InpaintCanvas = lazy(loadInpaintCanvas);
const MetadataInspector = lazy(loadMetadataInspector);
import { useAppStore } from "./store";
import { relatedTags } from "./related-tags";
import { fmtCount, wordAtCursor } from "./text-utils";
import { inspectImageMetadata, parseImageMeta } from "./png-meta";
import { INPAINT_BRUSH_SLIDER_MAX, INPAINT_BRUSH_SLIDER_MIN } from "./inpaint-brush";
import { droppedImagePath, droppedImagePaths, hasDraggedFiles } from "./drag-drop";
import { compactRemoteErrorText } from "./error-message";
import { flushArtistFavoritePersistence, hydrateArtistFavoriteLibrary } from "./artist-favorite-library";
import { BackupRestoreSettings, DataPortabilitySettings } from "./features/settings/DataBackupSettings";
import ResourceDatabaseSettings from "./features/settings/ResourceDatabaseSettings";
import { collectPortableWorkspaceData } from "./features/settings/data-backup-workspace";
import { splitPromptTags, parseWeightedTag, formatMultiplier, setTagLevelInPrompt } from "./prompt-weight";
import {
  normalizePrompt,
  DEFAULT_NORMALIZE_OPTIONS,
  NORMALIZE_LABELS,
  type NormalizeOptions,
} from "./prompt-normalize";
import {
  COMIC_ANALYZE_SYSTEM_PROMPT,
  CONVERT_SYSTEM_PROMPTS,
  SCOPED_REVERSE_SYSTEM_PROMPTS,
} from "./data/prompt-templates";
import {
  V45_CONVERT_SYSTEM_PROMPTS,
  V45_SCOPED_REVERSE_SYSTEM_PROMPTS,
} from "./data/prompt-templates-v45";
import { Button, IconText, AppPortal, Toggle, NumberInput, CommittedNumberInput, SliderInput, SecretInput, SelectMenu } from "./components/ui";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { confirmAction } from "./components/confirm";
import { Icon, type IconName } from "./components/icons";
import { AppMenuBar, AppTitleBar } from "./app/AppChrome";
import AppTabBar from "./app/AppTabBar";
import { isActiveTab, WIDE_WORKSPACE_TABS } from "./app/navigation";
import { QualityPresetControl } from "./components/QualityPresetControl";
import { PositivePromptPresetControl } from "./PositivePromptPresets";
import { PromptChunkControl } from "./PromptChunks";
import ReferencePresetManager, {
  ReferencePresetQuickSaveDialog,
  referencePresetTextFor,
  type QuickPresetSource,
} from "./ReferencePresetManager";
import { isScrollInsideFloatingMenu } from "./floating-menu";
import { desktopUiFormat, desktopUiText, getGeneratePanelText, getLocalizedTabItems, getSettingsSectionText, getSettingsShellText, getTokenGuideText, localizedDesktopOptionLabel, SUPPORTED_APP_LANGUAGES } from "./i18n";
import {
  CAT_COLOR,
  CAPSULE_TAXONOMY,
  localizedCapsuleCategoryName,
  localizedCapsuleSubgroupName,
  localizedCategoryLabel,
  localizedTagLabel,
  tagDescription,
} from "./prompt-data";
import {
  APP_NAME,
  APP_VERSION,
  DEFAULT_PARAMS,
  DIRECTOR_TOOLS,
  EMOTION_OPTIONS,
  MAX_NAI_DIRECTOR_INPUT_PIXELS,
  MAX_NAI_SEED,
  MAX_NAI_UPSCALE_INPUT_PIXELS,
  NAI_INPAINT_MODELS,
  NAI_MODELS,
  NAI_SAMPLERS,
  NAI_UC_PRESETS,
  DEFAULT_MODEL_FOR_MODE,
  supportsNAIModelMode,
  isNAIV4PlusModel,
  isNAIV5Model,
  maxNAICharacterPrompts,
  supportsNAICharacterPrompts,
  supportsNAINoiseScheduleControl,
  supportsNAIPreciseReference,
  supportsNAIVibeTransfer,
  supportsNAIVariety,
  type AnlasQuoteFeature,
  type AnlasQuoteResult,
  type ModelMode,
  type AiCallLogEntry,
  type AppSettings,
  type HistoryItem,
  type GenerateParams,
  type ModePromptTemplates,
  type PromptTemplate,
  type StylePromptPreset,
  type StylePromptPreviewImage,
  type PreciseReferenceType,
  type PromptVariants,
  type ReversePromptMode,
  type ReversePromptScope,
  type ReversePromptTemplateVersion,
  type TagSuggestion,
  type TextToolHistoryItem,
  type TextToolJob,
  type TokenStatus,
} from "./types";
import {
  adaptiveNAIImageSize,
  maxNAIDimensionFor,
  NAI_MIN_DIMENSION,
  NAI_DIMENSION_STEP,
  snapNAIDimensionWithinArea,
} from "./nai-dimensions";

const novelAiImageUrl = "https://novelai.net/image";
const DEFAULT_HTTP_PROXY = "http://127.0.0.1:7890";
const DEFAULT_SOCKS_PROXY = "socks5://127.0.0.1:10808";
const appIconUrl = "./icon.png";
const onboardingHeroUrl = "./onboarding-hero.png";
const projectGithubUrl = "https://github.com/2786886095/novelai-image-desktop";
const rewardWechatUrl = "./about/wechat-reward.jpg";
const rewardAlipayUrl = "./about/alipay-reward.jpg";

function hasTranslatableText(segment: string) {
  return /[\p{Letter}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(segment);
}

function makeStylePresetId() {
  const cryptoId = globalThis.crypto?.randomUUID?.();
  return cryptoId ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function fitSizeWithinPixels(width: number, height: number, maxPixels: number) {
  const pixels = width * height;
  if (!width || !height || pixels <= maxPixels) return { width, height, resized: false };
  const ratio = Math.sqrt(maxPixels / pixels);
  return {
    width: Math.max(1, Math.floor(width * ratio)),
    height: Math.max(1, Math.floor(height * ratio)),
    resized: true,
  };
}

// Settings section: download/manage the local Danbooru Chinese tag library. The
// data is an optional download (GPL-3.0 source kept out of this MIT app's
// bundle); once present, both the tag autocomplete and the inspiration capsule
// use it. Exposed via an onChange callback so the capsule can refresh.
function TagLibrarySettingsSection({ onChanged }: { onChanged?: () => void }) {
  const setToast = useAppStore((state) => state.setToast);
  const language = useAppStore((state) => state.settings?.language);
  const [status, setStatus] = useState<{ downloaded: boolean; count: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);

  const refresh = useCallback(() => {
    void window.naiDesktop.danbooruStatus().then((s) => setStatus({
      downloaded: s.bilingualDownloaded,
      count: s.bilingualCount,
    }));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function download() {
    if (busy) return;
    setBusy(true);
    setToast(t("tagLibrary.downloadingToast"));
    try {
      const res = await window.naiDesktop.downloadDanbooru();
      setToast(res.message);
      if (res.ok) {
        setStatus({ downloaded: true, count: res.count ?? 0 });
        onChanged?.();
      }
    } catch (error) {
      setToast(f("tagLibrary.downloadFailed", { message: error instanceof Error ? error.message : String(error) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <label className="field">
        <span>{t("tagLibrary.title")}</span>
        <input
          readOnly
          value={
            status?.downloaded
              ? `${t("tagLibrary.downloaded")}${status.count ? `（${f("tagLibrary.itemCount", { count: status.count })}）` : ""}`
              : t("tagLibrary.notDownloaded")
          }
        />
      </label>
      <p className="field-hint">
        {t("tagLibrary.hint")}
      </p>
      <div className="row-actions">
        <Button onClick={() => void download()} disabled={busy}>
          <IconText icon={<Icon name="globe" />}>
            {busy ? t("tagLibrary.downloading") : status?.downloaded ? t("tagLibrary.redownload") : t("tagLibrary.download")}
          </IconText>
        </Button>
      </div>
    </>
  );
}

// Inspiration capsule browser. BROWSE (no search) uses the curated, accurate
// CAPSULE_TAXONOMY — every tag genuinely belongs to its category (the old
// substring-seed approach leaked cross-category tags, e.g. cropped_jacket under
// 构图). SEARCH queries the local Danbooru library for breadth. Browse works
// offline; search needs the downloaded library.
function capsuleBrowserText(language: unknown) {
  switch (language) {
    case "zh-TW":
      return { needsLibrary: "搜尋需要本地標籤庫，請先到設定下載。下方分類可離線使用。", empty: "沒有匹配的標籤", loading: "載入中…" };
    case "en-US":
      return { needsLibrary: "Search requires the local tag library. Download it in Settings first. Categories below work offline.", empty: "No matching tags", loading: "Loading…" };
    case "ja-JP":
      return { needsLibrary: "検索にはローカルタグライブラリが必要です。先に設定でダウンロードしてください。下のカテゴリはオフラインで使えます。", empty: "一致するタグがありません", loading: "読み込み中…" };
    case "ko-KR":
      return { needsLibrary: "검색에는 로컬 태그 라이브러리가 필요합니다. 먼저 설정에서 다운로드하세요. 아래 분류는 오프라인으로 사용할 수 있습니다.", empty: "일치하는 태그 없음", loading: "불러오는 중…" };
    default:
      return { needsLibrary: "搜索需要本地标签库，请先到设置下载。下方分类可离线使用。", empty: "没有匹配的标签", loading: "加载中…" };
  }
}

function CapsuleBrowser({ query, onPick, language }: { query: string; onPick: (tag: string) => void; language?: unknown }) {
  const [downloaded, setDownloaded] = useState<boolean | null>(null);
  const [items, setItems] = useState<TagSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const q = query.trim();
  const text = capsuleBrowserText(language);

  useEffect(() => {
    void window.naiDesktop.danbooruStatus().then((s) => {
      setDownloaded(/[㐀-鿿]/.test(q) ? s.bilingualDownloaded : s.downloaded);
    });
  }, [query]);

  useEffect(() => {
    if (!q) {
      setItems([]);
      return;
    }
    let alive = true;
    setLoading(true);
    void window.naiDesktop.danbooruSearch(q, 150).then((res) => {
      if (!alive) return;
      setItems(res);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [q]);

  if (q) {
    if (downloaded === false) {
      return <p className="chip-empty">{text.needsLibrary}</p>;
    }
    return (
      <div className="capsule-browser">
        <div className="capsule-browser-list">
          {items.map((t) => {
            const label = localizedTagLabel(t.tag, t.description, language);
            return (
              <button
                key={t.tag}
                type="button"
                className="capsule-tax-chip"
                onClick={() => onPick(t.tag)}
                title={`${t.tag}｜${label}｜${fmtCount(t.count)}`}
              >
                <span className="capsule-tax-zh">{label}</span>
                <span className="capsule-tax-en">{t.tag}</span>
              </button>
            );
          })}
          {items.length === 0 && !loading && <span className="chip-empty">{text.empty}</span>}
          {loading && <span className="chip-empty">{text.loading}</span>}
        </div>
      </div>
    );
  }

  return <CapsuleTaxonomy onPick={onPick} language={language} />;
}

// Inspiration capsule taxonomy: category tabs → subgroup tabs → bilingual chips.
// Built-in fallback used when the local library isn't downloaded.
function CapsuleTaxonomy({ onPick, language }: { onPick: (tag: string) => void; language?: unknown }) {
  const [catIdx, setCatIdx] = useState(0);
  const [subIdx, setSubIdx] = useState(0);
  const category = CAPSULE_TAXONOMY[catIdx] ?? CAPSULE_TAXONOMY[0];
  const subgroup = category.subgroups[subIdx] ?? category.subgroups[0];
  return (
    <div className="capsule-tax">
      <div className="capsule-tax-cats">
        {CAPSULE_TAXONOMY.map((c, i) => (
          <button
            key={c.name}
            type="button"
            className={clsx("capsule-tax-cat", i === catIdx && "active")}
            onClick={() => {
              setCatIdx(i);
              setSubIdx(0);
            }}
          >
            {localizedCapsuleCategoryName(c.name, language)}
          </button>
        ))}
      </div>
      <div className="capsule-tax-subs">
        {category.subgroups.map((s, i) => (
          <button
            key={s.name}
            type="button"
            className={clsx("capsule-tax-sub", i === subIdx && "active")}
            onClick={() => setSubIdx(i)}
          >
            {localizedCapsuleSubgroupName(s.name, language)}
          </button>
        ))}
      </div>
      <div className="capsule-tax-chips">
        {subgroup.tags.map((t) => (
          <button
            key={t.en}
            type="button"
            className="capsule-tax-chip"
            onClick={() => onPick(t.en)}
            title={`${t.en}：${t.zh}`}
          >
            <span className="capsule-tax-zh">{localizedTagLabel(t.en, t.zh, language)}</span>
            <span className="capsule-tax-en">{t.en}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Pixel position of the caret inside a textarea (relative to the textarea's own
// top-left), via a hidden mirror element — used to anchor the autocomplete
// dropdown right under the character being typed instead of at the box bottom.
function caretCoordinates(el: HTMLTextAreaElement, position: number): { top: number; left: number; height: number } {
  const computed = window.getComputedStyle(el);
  const div = document.createElement("div");
  const copyProps = [
    "boxSizing", "width", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
    "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "fontStyle", "fontVariant", "fontWeight", "fontStretch", "fontSize", "fontSizeAdjust",
    "lineHeight", "fontFamily", "textAlign", "textTransform", "textIndent", "letterSpacing", "wordSpacing", "tabSize",
  ] as const;
  div.style.position = "absolute";
  div.style.visibility = "hidden";
  div.style.whiteSpace = "pre-wrap";
  div.style.wordWrap = "break-word";
  div.style.overflow = "hidden";
  for (const prop of copyProps) {
    (div.style as unknown as Record<string, string>)[prop] = computed.getPropertyValue(
      prop.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()),
    );
  }
  div.textContent = el.value.slice(0, position);
  const span = document.createElement("span");
  span.textContent = el.value.slice(position) || ".";
  div.appendChild(span);
  document.body.appendChild(div);
  const lineHeight = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.3;
  const result = {
    top: span.offsetTop + parseFloat(computed.borderTopWidth || "0"),
    left: span.offsetLeft + parseFloat(computed.borderLeftWidth || "0"),
    height: lineHeight,
  };
  document.body.removeChild(div);
  return result;
}

// ── PromptTextarea: textarea with Danbooru tag autocomplete ───────────────────
function PromptTextarea({
  value,
  onChange,
  model,
  enabled,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  model: string;
  enabled: boolean;
  placeholder?: string;
  className?: string;
}) {
  const language = useAppStore((state) => state.settings?.language);
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  // Only the vertical caret position — the dropdown stays full-width so long tag
  // text never overflows/clips horizontally.
  const [acTop, setAcTop] = useState<number | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const composingRef = useRef(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function clearSuggestions() { setSuggestions([]); setAcTop(null); }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    const cursor = e.target.selectionStart ?? text.length;
    onChange(text);
    setActiveIdx(0);
    if (!enabled || composingRef.current) {
      clearSuggestions();
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    const { word } = wordAtCursor(text, cursor);
    if (word.length < 1) {
      clearSuggestions();
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await window.naiDesktop.suggestTags(model, word);
        setSuggestions(res.slice(0, 8));
        const ta = taRef.current;
        if (ta && res.length > 0) {
          const c = caretCoordinates(ta, cursor);
          // Anchor just below the caret line (vertical only); full-width horizontally.
          setAcTop(c.top - ta.scrollTop + c.height + 2);
        }
      } catch {
        setSuggestions([]);
      }
    }, 160);
  }

  function applyTag(tag: string) {
    const ta = taRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart ?? value.length;
    const { start } = wordAtCursor(value, cursor);
    // Extend forward to cover the rest of any partial word
    let end = cursor;
    while (end < value.length && /[\w-]/.test(value[end])) end++;
    const after = value.slice(end).replace(/^\s*,\s*/, "").trimStart();
    const before = value.slice(0, start);
    const newVal = before + tag + ", " + after;
    onChange(newVal);
    clearSuggestions();
    const pos = start + tag.length + 2;
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(pos, pos); });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing || composingRef.current) return;
    if (!suggestions.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); applyTag(suggestions[activeIdx].tag); }
    else if (e.key === "Escape") { clearSuggestions(); }
  }

  return (
    <div className="prompt-ac-wrap">
      <textarea
        ref={taRef}
        className={clsx("prompt-box", className)}
        value={value}
        placeholder={placeholder}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => {
          composingRef.current = true;
          clearSuggestions();
          if (timerRef.current) clearTimeout(timerRef.current);
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false;
          handleChange(event as unknown as React.ChangeEvent<HTMLTextAreaElement>);
        }}
        onBlur={() => { if (timerRef.current) clearTimeout(timerRef.current); setTimeout(clearSuggestions, 180); }}
      />
      {suggestions.length > 0 && (
        <div
          className={clsx("ac-dropdown", acTop != null && "ac-dropdown-caret")}
          style={acTop != null ? { top: acTop } : undefined}
        >
          {suggestions.map((s, i) => (
            <button
              key={s.tag}
              className={clsx("ac-item", i === activeIdx && "ac-active")}
              onMouseDown={(e) => { e.preventDefault(); applyTag(s.tag); }}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span className="ac-dot" style={{ background: CAT_COLOR[s.category] ?? "#94a3b8" }} />
              <span className="ac-main">
                <span className="ac-tag">{s.tag}</span>
                <span className="ac-desc">{tagDescription(s, language)}</span>
              </span>
              <span className="ac-meta">
                <span>{localizedCategoryLabel(s.category, language)}</span>
                <span>{fmtCount(s.count)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Shared UI primitives ──────────────────────────────────────────────────────
// ── Splash ────────────────────────────────────────────────────────────────────
function SplashPage() {
  // Show a custom entrance image when public/splash.png exists; otherwise fall
  // back to the built-in animated orbs. The <img> hides itself on load error.
  const [hasCustom, setHasCustom] = useState(true);
  const language = useAppStore((state) => state.settings?.language);
  const bootError = useAppStore((state) => state.bootError);
  const load = useAppStore((state) => state.load);
  return (
    <div className="splash-page splash-animate">
      {hasCustom && (
        <img
          className="splash-custom"
          src="./splash.png"
          alt=""
          onError={() => setHasCustom(false)}
        />
      )}
      {!hasCustom && (
        <div className="splash-art">
          <div className="splash-orb splash-orb-a" />
          <div className="splash-orb splash-orb-b" />
          <div className="splash-logo-mark">
            <div className="logo-gem" />
            <div className="logo-ring" />
          </div>
        </div>
      )}
      <div className="splash-title">
        <div className="splash-brand">
          <img className="brand-icon-img" src={appIconUrl} alt="" />
          <h1>{APP_NAME}</h1>
        </div>
        <div className="splash-divider" />
        <p className="splash-sub">{desktopUiText(language, "splash.subtitle")}</p>
        <p className="splash-ver">v{APP_VERSION}</p>
        {bootError && (
          <>
            <p className="splash-sub" style={{ color: "var(--danger)" }}>
              {bootError}
            </p>
            <Button variant="primary" onClick={() => void load()}>
              {desktopUiText(language, "splash.retry")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Title bar ─────────────────────────────────────────────────────────────────
function OpusUsageDialog({ onClose }: { onClose: () => void }) {
  const account = useAppStore((state) => state.account);
  const refreshAccount = useAppStore((state) => state.refreshAccount);
  const language = useAppStore((state) => state.settings?.language);
  const [refreshing, setRefreshing] = useState(false);
  const captureMode = new URLSearchParams(window.location.search).get("uiCapture") === "opusUsage";
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);
  const usage = account.opusUsage;
  const remainingPercent = usage ? Math.min(100, Math.max(0, usage.isNegative ? 0 : usage.percent)) : 0;
  const remainingImages = Math.round(17.3 * remainingPercent);
  const refillPercent = usage && usage.timeUntilNextPercent > 0
    ? Math.round((86_400 / usage.timeUntilNextPercent) * 10) / 10
    : 0;
  const refillImages = Math.round(17.3 * refillPercent);

  const refresh = async () => {
    setRefreshing(true);
    try { await refreshAccount(); } finally { setRefreshing(false); }
  };

  useEffect(() => {
    if (!captureMode) void refresh();
  }, [captureMode]);

  return <AppPortal>
    <div className="modal-backdrop opus-usage-backdrop" onMouseDown={onClose}>
      <section className="modal opus-usage-dialog" role="dialog" aria-modal="true" aria-labelledby="opus-usage-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <small>NovelAI Diffusion V5</small>
            <h2 id="opus-usage-title">{t("opusUsage.title")}</h2>
          </div>
          <button type="button" aria-label={t("opusUsage.close")} onClick={onClose}><Icon name="close" /></button>
        </header>
        <p>{t("opusUsage.explanation")}</p>
        {usage ? <>
          <div className="opus-usage-value">
            <strong>{f("opusUsage.remaining", { percent: Math.round(remainingPercent * 10) / 10, images: remainingImages })}</strong>
          </div>
          <div className="opus-usage-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={remainingPercent}>
            <div style={{ width: `${remainingPercent}%` }} />
          </div>
          <p className="opus-usage-refill">{f("opusUsage.refill", { percent: refillPercent, images: refillImages })}</p>
          {usage.isNegative && <p className="opus-usage-warning">{t("opusUsage.empty")}</p>}
        </> : <p className="opus-usage-warning">{t("opusUsage.unavailable")}</p>}
        <footer>
          <span className={account.stale || !usage ? "stale" : ""}>
            <span className="pulse-dot" />
            {account.stale
              ? t("opusUsage.stale")
              : usage && account.opusUsageUpdatedAt
                ? t("opusUsage.updated")
                : t("opusUsage.unavailable")}
          </span>
          <Button disabled={refreshing} onClick={() => void refresh()}>{refreshing ? "…" : t("opusUsage.refresh")}</Button>
        </footer>
      </section>
    </div>
  </AppPortal>;
}

function QualityAndTransparencyControls({ compact = false }: { compact?: boolean }) {
  const params = useAppStore((state) => state.params);
  const setParam = useAppStore((state) => state.setParam);
  const language = useAppStore((state) => state.settings?.language);
  return (
    <QualityPresetControl
      language={language}
      model={params.model}
      value={params.qualityPreset}
      transparentBackground={params.transparentBackground}
      compact={compact}
      onChange={(value) => setParam("qualityPreset", value)}
      onTransparentChange={(value) => setParam("transparentBackground", value)}
    />
  );
}

// ── Advanced params modal ─────────────────────────────────────────────────────
function AdvancedParamsModal({ onClose }: { onClose: () => void }) {
  const params = useAppStore((state) => state.params);
  const setParam = useAppStore((state) => state.setParam);
  const settings = useAppStore((state) => state.settings);
  const t = useCallback((key: string) => desktopUiText(settings?.language, key), [settings?.language]);

  return (
    <AppPortal>
      <div className="modal-backdrop">
      <div className="modal advanced-modal">
        <header>
          <h2>{t("advanced.title")}</h2>
          <button aria-label={t("common.close")} onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className="advanced-grid">
          <NumberInput label={t("advanced.steps")} value={params.steps} min={1} max={50} onChange={(v) => setParam("steps", v)} />
          <NumberInput label={t("advanced.cfgScale")} value={params.cfgScale} min={1} max={10} step={0.1} onChange={(v) => setParam("cfgScale", Math.min(10, Math.max(1, v)))} />
          <NumberInput label={t("advanced.cfgRescale")} value={params.cfgRescale} min={0} max={1} step={0.01} onChange={(v) => setParam("cfgRescale", v)} />
          <label className="field">
            <span>{t("advanced.sampler")}</span>
            <select value={params.sampler} onChange={(e) => setParam("sampler", e.target.value as GenerateParams["sampler"])}>
              {NAI_SAMPLERS.map((s) => (
                <option value={s.value} key={s.value}>{localizedDesktopOptionLabel(settings?.language, s.value, s.label)}</option>
              ))}
            </select>
          </label>
          {supportsNAINoiseScheduleControl(params.model) && (
            <label className="field">
              <span>{t("advanced.noiseSchedule")}</span>
              <select value={params.noiseSchedule} onChange={(e) => setParam("noiseSchedule", e.target.value)}>
                <option value="native">{localizedDesktopOptionLabel(settings?.language, "native", "Native")}</option>
                <option value="karras">{localizedDesktopOptionLabel(settings?.language, "karras", "Karras")}</option>
                <option value="exponential">{localizedDesktopOptionLabel(settings?.language, "exponential", "Exponential")}</option>
              </select>
            </label>
          )}
          <label className="field">
            <span>{t("advanced.ucPreset")}</span>
            <select value={params.ucPreset} onChange={(e) => setParam("ucPreset", Number(e.target.value) as GenerateParams["ucPreset"])}>
              {NAI_UC_PRESETS.map((p) => (
                <option value={p.value} key={p.value}>{localizedDesktopOptionLabel(settings?.language, p.value, p.label)}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="toggle-list compact">
          <QualityAndTransparencyControls compact />
          {/* SMEA / SMEA Dyn only exist on V3-era models; V4/V4.5/V5 ignore them, so
              we hide the toggles there instead of showing a control with no effect. */}
          {!isNAIV4PlusModel(params.model) && (
            <>
              <Toggle checked={params.smea} onChange={(v) => setParam("smea", v)} label={t("advanced.smea")} description={t("advanced.smeaDesc")} />
              <Toggle checked={params.smeaDyn} onChange={(v) => setParam("smeaDyn", v)} label={t("advanced.smeaDyn")} description={t("advanced.smeaDynDesc")} />
            </>
          )}
        </div>
        <footer>
          <Button
            onClick={() => {
              for (const [key, value] of Object.entries(DEFAULT_PARAMS) as [keyof GenerateParams, any][]) {
                if (key === "stylePrompt" && settings?.lockStylePrompt) continue;
                if (key === "negativePrompt" && settings?.lockNegativePrompt) continue;
                setParam(key, value);
              }
            }}
          >
            <IconText icon="↺">{t("advanced.reset")}</IconText>
          </Button>
          <Button variant="primary" onClick={onClose}>
            <IconText icon="✓">{t("advanced.confirm")}</IconText>
          </Button>
        </footer>
      </div>
      </div>
    </AppPortal>
  );
}

// ── Vibe Transfer modal ───────────────────────────────────────────────────────
// The three official precise-reference sizes. Given a source image, recommend the
// one whose aspect ratio is closest (which the main process will scale+pad to),
// and estimate how much black bar that leaves — so the user can pre-resize to
// the recommended size to avoid padding entirely.
const PRECISE_REF_SIZES = [
  { width: 1024, height: 1536 },
  { width: 1472, height: 1472 },
  { width: 1536, height: 1024 },
];
function recommendPreciseSize(w?: number, h?: number) {
  if (!w || !h) return null;
  const aspect = w / h;
  const target = PRECISE_REF_SIZES.reduce(
    (best, c) =>
      Math.abs(c.width / c.height - aspect) < Math.abs(best.width / best.height - aspect) ? c : best,
    PRECISE_REF_SIZES[0],
  );
  const exact = w === target.width && h === target.height;
  const scale = Math.min(target.width / w, target.height / h);
  const padPercent = Math.round((1 - (Math.round(w * scale) * Math.round(h * scale)) / (target.width * target.height)) * 100);
  return { target, exact, padPercent };
}

function VibeTransferModal({ onClose }: { onClose: () => void }) {
  const language = useAppStore((state) => state.settings?.language);
  const vibeImages = useAppStore((state) => state.vibeImages);
  const addVibeImage = useAppStore((state) => state.addVibeImage);
  const removeVibeImage = useAppStore((state) => state.removeVibeImage);
  const updateVibeImage = useAppStore((state) => state.updateVibeImage);
  const clearVibeImages = useAppStore((state) => state.clearVibeImages);
  const preciseReferences = useAppStore((state) => state.preciseReferences);
  const addPreciseReference = useAppStore((state) => state.addPreciseReference);
  const removePreciseReference = useAppStore((state) => state.removePreciseReference);
  const updatePreciseReference = useAppStore((state) => state.updatePreciseReference);
  const clearPreciseReferences = useAppStore((state) => state.clearPreciseReferences);
  const setToast = useAppStore((state) => state.setToast);
  const setParam = useAppStore((state) => state.setParam);
  const model = useAppStore((state) => state.params.model);
  const preciseSupported = supportsNAIPreciseReference(model);
  const vibeSupported = supportsNAIVibeTransfer(model);
  const presetText = referencePresetTextFor(language);
  const [showPresetLibrary, setShowPresetLibrary] = useState(false);
  const [quickSaveSource, setQuickSaveSource] = useState<QuickPresetSource | null>(null);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("uiPresetPicker") === "1") {
      setShowPresetLibrary(true);
    }
  }, []);

  const switchToV45 = () => {
    setParam(
      "model",
      model.includes("curated")
        ? "nai-diffusion-4-5-curated"
        : "nai-diffusion-4-5-full",
    );
  };

  function handleVibeFile(file: File, infoExtracted: number, strength: number) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const base64 = dataUrl.split(",")[1] ?? "";
      addVibeImage({ id: crypto.randomUUID(), previewUrl: dataUrl, base64, infoExtracted, strength });
    };
    reader.readAsDataURL(file);
  }

  function handlePreciseFile(file: File) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      // Any decodable image is accepted — the main process preprocesses it to the
      // nearest official size (scale-to-fit + black pad), matching NovelAI.
      const probe = new Image();
      probe.onload = () => {
        const base64 = dataUrl.split(",")[1] ?? "";
        addPreciseReference({
          id: crypto.randomUUID(),
          previewUrl: dataUrl,
          base64,
          // Default to character-only: "character&style" copies the reference's
          // rendering style (a prime cause of unwanted texture/halftone bleed when
          // the art style is meant to come from the prompt's artist tags instead).
          type: "character",
          strength: 1,
          fidelity: 1,
          informationExtracted: 1,
          srcWidth: probe.naturalWidth,
          srcHeight: probe.naturalHeight,
        });
      };
      probe.onerror = () => setToast(t("reference.preciseReadFailed"));
      probe.src = dataUrl;
    };
    reader.onerror = () => setToast(t("reference.preciseLoadFailed"));
    reader.readAsDataURL(file);
  }

  return (
    <AppPortal>
      <div className="modal-backdrop">
      <div className="modal vibe-modal">
        <header>
          <h2>{t("reference.title")}</h2>
          <div className="vibe-header-actions">
            <Button className="vibe-open-presets" onClick={() => setShowPresetLibrary(true)}>{presetText.open}</Button>
            <button aria-label={t("common.close")} onClick={onClose}><Icon name="close" /></button>
          </div>
        </header>
        <div className="vibe-body">
          <h3 className="vibe-section-title">
            {t("reference.vibeTitle")}
            {!vibeSupported && <span className="vibe-hint">{t("reference.vibeUnsupportedV5")}</span>}
          </h3>
          {vibeImages.length === 0 && <p className="vibe-empty">{t("reference.emptyVibe")}</p>}
          {vibeImages.map((img) => (
            <div className="vibe-row" key={img.id}>
              <img src={img.previewUrl} className="vibe-thumb" alt={t("reference.thumbAlt")} />
              <div className="vibe-row-sliders">
                <div className="reference-control">
                  <SliderInput
                    label={t("reference.infoExtracted")}
                    value={img.infoExtracted}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(v) => updateVibeImage(img.id, { infoExtracted: v })}
                  />
                  <p>{t("reference.infoExtractedHelp")}</p>
                </div>
                <div className="reference-control">
                  <SliderInput
                    label={t("reference.strength")}
                    value={img.strength}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(v) => updateVibeImage(img.id, { strength: v })}
                  />
                  <p>{t("reference.vibeStrengthHelp")}</p>
                </div>
              </div>
              <button className="vibe-save-preset" title={presetText.quickSave} onClick={() => setQuickSaveSource({ kind: "vibe", previewUrl: img.previewUrl, base64: img.base64, infoExtracted: img.infoExtracted, strength: img.strength })}>
                <Icon name="star" />
              </button>
              <button className="vibe-remove" title={t("reference.remove")} onClick={() => removeVibeImage(img.id)}>
                <Icon name="close" />
              </button>
            </div>
          ))}

          <h3 className="vibe-section-title">
            {t("reference.preciseTitle")}
            {!preciseSupported && <span className="vibe-hint">{t("reference.preciseUnsupported")}</span>}
          </h3>
          {!preciseSupported && (
            <Button className="vibe-switch-model" onClick={switchToV45}>
              {t("reference.switchV45")}
            </Button>
          )}
          <p className="vibe-hint">{t("reference.preciseHint")}</p>
          {preciseReferences.length === 0 && <p className="vibe-empty">{t("reference.emptyPrecise")}</p>}
          {preciseReferences.map((ref) => (
            <div className="vibe-row" key={ref.id}>
              <img src={ref.previewUrl} className="vibe-thumb" alt={t("reference.preciseAlt")} />
              <div className="vibe-row-sliders">
                <label className="field">
                  <span>{t("reference.type")}</span>
                  <select
                    value={ref.type}
                    onChange={(e) => updatePreciseReference(ref.id, { type: e.target.value as PreciseReferenceType })}
                  >
                    {(["character", "style", "character&style"] as PreciseReferenceType[]).map((type) => (
                      <option key={type} value={type}>{t(`reference.type.${type}`)}</option>
                    ))}
                  </select>
                  <small className="reference-control-help">{t("reference.typeHelp")}</small>
                </label>
                <div className="reference-control">
                  <SliderInput
                    label={t("reference.preciseStrength")}
                    value={ref.strength}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(v) => updatePreciseReference(ref.id, { strength: v })}
                  />
                  <p>{t("reference.preciseStrengthHelp")}</p>
                </div>
                <div className="reference-control">
                  <SliderInput
                    label={t("reference.fidelity")}
                    value={ref.fidelity}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(v) => updatePreciseReference(ref.id, { fidelity: v })}
                  />
                  <p>{t("reference.fidelityHelp")}</p>
                </div>
                {(() => {
                  const rec = recommendPreciseSize(ref.srcWidth, ref.srcHeight);
                  if (!rec) return null;
                  return (
                    <p className={clsx("precise-size-hint", rec.exact && "ok")}>
                      {f("reference.recommendedSize", {
                        source: `${ref.srcWidth}×${ref.srcHeight}`,
                        target: `${rec.target.width}×${rec.target.height}`,
                      })}
                      {rec.exact
                        ? t("reference.sizeExact")
                        : f("reference.sizePadded", { pad: rec.padPercent })}
                    </p>
                  );
                })()}
              </div>
              <button className="vibe-save-preset" title={presetText.quickSave} onClick={() => setQuickSaveSource({ kind: "precise", previewUrl: ref.previewUrl, base64: ref.base64, preciseType: ref.type, strength: ref.strength, fidelity: ref.fidelity, informationExtracted: ref.informationExtracted ?? 1, width: ref.srcWidth, height: ref.srcHeight })}>
                <Icon name="star" />
              </button>
              <button className="vibe-remove" title={t("reference.remove")} onClick={() => removePreciseReference(ref.id)}>
                <Icon name="close" />
              </button>
            </div>
          ))}

          <div className="vibe-add-row">
            <label className={clsx("btn btn-secondary vibe-add-btn", !vibeSupported && "disabled")} aria-disabled={!vibeSupported}>
              <IconText icon="+">{t("reference.addVibe")}</IconText>
              <input
                type="file"
                hidden
                accept="image/png,image/jpeg,image/webp"
                disabled={!vibeSupported}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) { handleVibeFile(f, 1, 1); e.target.value = ""; }
                }}
              />
            </label>
            <label className={clsx("btn btn-secondary vibe-add-btn", !preciseSupported && "disabled")} aria-disabled={!preciseSupported}>
              <IconText icon="+">{t("reference.addPrecise")}</IconText>
              <input
                type="file"
                hidden
                accept="image/png,image/jpeg,image/webp"
                disabled={!preciseSupported}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) { handlePreciseFile(f); e.target.value = ""; }
                }}
              />
            </label>
          </div>
        </div>
        <footer>
          <Button onClick={() => { clearVibeImages(); clearPreciseReferences(); }}>
            <IconText icon="⌧">{t("reference.clearAll")}</IconText>
          </Button>
          <Button variant="primary" onClick={onClose}>
            <IconText icon="✓">{t("reference.done")}</IconText>
          </Button>
        </footer>
      </div>
      </div>
      {showPresetLibrary && (
        <ReferencePresetManager
          modal
          onBack={() => setShowPresetLibrary(false)}
          onApplied={() => setShowPresetLibrary(false)}
        />
      )}
      {quickSaveSource && (
        <ReferencePresetQuickSaveDialog
          source={quickSaveSource}
          onClose={() => setQuickSaveSource(null)}
        />
      )}
    </AppPortal>
  );
}

// ── Character Captions modal ──────────────────────────────────────────────────
function CharCaptionsModal({ onClose }: { onClose: () => void }) {
  const language = useAppStore((state) => state.settings?.language);
  const settings = useAppStore((state) => state.settings);
  const charCaptions = useAppStore((state) => state.charCaptions);
  const params = useAppStore((state) => state.params);
  const refreshSettings = useAppStore((state) => state.refreshSettings);
  const setToast = useAppStore((state) => state.setToast);
  const addCharCaption = useAppStore((state) => state.addCharCaption);
  const removeCharCaption = useAppStore((state) => state.removeCharCaption);
  const updateCharCaption = useAppStore((state) => state.updateCharCaption);
  const clearCharCaptions = useAppStore((state) => state.clearCharCaptions);
  const supportsCharacters = supportsNAICharacterPrompts(params.model);
  const maxCharacters = maxNAICharacterPrompts(params.model);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);
  const generateText = useMemo(() => getGeneratePanelText(language), [language]);
  const customPositions = charCaptions.some((caption) => caption.useCoords);
  const [collapsedCharacters, setCollapsedCharacters] = useState<Set<string>>(() => new Set());
  const toggleCharacterAutoComplete = useCallback(async () => {
    const next = !(settings?.autoComplete ?? true);
    await window.naiDesktop.setSetting("autoComplete", next);
    await refreshSettings();
    setToast(next ? t("prompt.autocompleteOnToast") : t("prompt.autocompleteOffToast"));
  }, [refreshSettings, setToast, settings?.autoComplete, t]);

  const toggleCharacterCollapsed = useCallback((id: string) => {
    setCollapsedCharacters((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setPositionMode = useCallback((custom: boolean) => {
    for (const caption of charCaptions) {
      updateCharCaption(caption.id, { useCoords: custom });
    }
  }, [charCaptions, updateCharCaption]);

  return (
    <AppPortal>
      <div className="modal-backdrop">
      <div className="modal char-modal">
        <header>
          <h2>{t("character.title")}</h2>
          <button aria-label={t("common.close")} onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className="char-body">
          {!supportsCharacters && (
            <div className="status-box bad">
              {t("character.unsupported")}
            </div>
          )}
          {supportsCharacters && charCaptions.length > 0 && (
            <section className="char-position-section" aria-label={t("character.positionMode")}>
              <div className="char-position-toolbar">
                <div>
                  <strong>{t("character.positionMode")}</strong>
                  <small>{t("character.positionHint")}</small>
                </div>
                <div className="char-position-mode" role="group" aria-label={t("character.positionMode")}>
                  <button
                    type="button"
                    className={clsx(!customPositions && "active")}
                    aria-pressed={!customPositions}
                    onClick={() => setPositionMode(false)}
                  >
                    {t("character.aiChoice")}
                  </button>
                  <button
                    type="button"
                    className={clsx(customPositions && "active")}
                    aria-pressed={customPositions}
                    onClick={() => setPositionMode(true)}
                  >
                    {t("character.customPosition")}
                  </button>
                </div>
              </div>
              {customPositions && (
                <div className="char-position-stage-wrap">
                  <div
                    className="char-position-stage"
                    style={{
                      aspectRatio: `${Math.max(1, params.width)} / ${Math.max(1, params.height)}`,
                      width: `min(100%, ${Math.min(560, 390 * (Math.max(1, params.width) / Math.max(1, params.height)))}px)`,
                    }}
                    aria-label={t("character.positionCanvas")}
                  >
                    <div className="char-position-grid" aria-hidden="true" />
                    {charCaptions.map((caption, index) => (
                      <button
                        key={caption.id}
                        type="button"
                        className="char-position-marker"
                        style={{
                          left: `${(caption.useCoords ? caption.x : 0.5) * 100}%`,
                          top: `${(caption.useCoords ? caption.y : 0.5) * 100}%`,
                        }}
                        aria-label={f("character.markerLabel", { index: index + 1 })}
                        title={`${f("character.label", { index: index + 1 })} · X ${caption.x.toFixed(2)} · Y ${caption.y.toFixed(2)}`}
                        onPointerDown={(event) => {
                          event.currentTarget.setPointerCapture(event.pointerId);
                          const stage = event.currentTarget.parentElement;
                          if (!stage) return;
                          const rect = stage.getBoundingClientRect();
                          updateCharCaption(caption.id, {
                            useCoords: true,
                            x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
                            y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
                          });
                        }}
                        onPointerMove={(event) => {
                          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                          const stage = event.currentTarget.parentElement;
                          if (!stage) return;
                          const rect = stage.getBoundingClientRect();
                          updateCharCaption(caption.id, {
                            useCoords: true,
                            x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
                            y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
                          });
                        }}
                        onKeyDown={(event) => {
                          const step = event.shiftKey ? 0.05 : 0.01;
                          const patch: { x?: number; y?: number } = {};
                          if (event.key === "ArrowLeft") patch.x = Math.max(0, caption.x - step);
                          if (event.key === "ArrowRight") patch.x = Math.min(1, caption.x + step);
                          if (event.key === "ArrowUp") patch.y = Math.max(0, caption.y - step);
                          if (event.key === "ArrowDown") patch.y = Math.min(1, caption.y + step);
                          if (patch.x == null && patch.y == null) return;
                          event.preventDefault();
                          updateCharCaption(caption.id, { ...patch, useCoords: true });
                        }}
                      >
                        {index + 1}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
          {charCaptions.map((cc, idx) => {
            const collapsed = collapsedCharacters.has(cc.id);
            const contentId = `character-content-${cc.id}`;
            return (
            <div className={clsx("char-row", collapsed && "collapsed")} key={cc.id}>
              <div className="char-row-head">
                <div className="char-row-title">
                  <strong>{f("character.label", { index: idx + 1 })}</strong>
                  <span className="char-row-position-summary">
                    {cc.useCoords
                      ? `${t("character.customPosition")} · X ${cc.x.toFixed(2)} · Y ${cc.y.toFixed(2)}`
                      : t("character.aiChoice")}
                  </span>
                </div>
                <div className="char-row-actions">
                  <button
                    type="button"
                    className="char-row-toggle"
                    aria-expanded={!collapsed}
                    aria-controls={contentId}
                    onClick={() => toggleCharacterCollapsed(cc.id)}
                  >
                    <Icon name="chevronDown" />
                    <span>{t(collapsed ? "character.expand" : "character.collapse")}</span>
                  </button>
                  <Button variant="ghost" onClick={() => removeCharCaption(cc.id)}>
                    <IconText icon="✕">{t("character.delete")}</IconText>
                  </Button>
                </div>
              </div>
              {!collapsed && (
              <div className="char-row-content" id={contentId}>
                <div
                  className="char-prompt-tools"
                  role="group"
                  aria-label={t("character.title")}
                >
                  <button
                    type="button"
                    className={clsx("prompt-tool-btn", (settings?.autoComplete ?? true) && "tool-on")}
                    title={generateText.prompt.autocompleteTitle}
                    onClick={() => void toggleCharacterAutoComplete()}
                  >
                    <Icon name="bulb" />
                    <span>{(settings?.autoComplete ?? true) ? generateText.prompt.autocompleteOn : generateText.prompt.autocompleteOff}</span>
                  </button>
                  <PromptChunkControl
                    value={cc.prompt}
                    onApply={(prompt) => updateCharCaption(cc.id, { prompt })}
                  />
                  <PositivePromptPresetControl
                    value={cc.prompt}
                    onApply={(prompt) => updateCharCaption(cc.id, { prompt })}
                  />
                </div>
                <PromptTextarea
                  value={cc.prompt}
                  model={params.model}
                  enabled={settings?.autoComplete ?? true}
                  placeholder={t("character.placeholder")}
                  className="char-prompt"
                  onChange={(prompt) => updateCharCaption(cc.id, { prompt })}
                />
                <label className="field">
                  <span>{t("character.negative")}</span>
                  <PromptTextarea
                    value={cc.negativePrompt ?? ""}
                    model={params.model}
                    enabled={settings?.autoComplete ?? true}
                    placeholder={t("character.negativePlaceholder")}
                    className="char-prompt"
                    onChange={(negativePrompt) => updateCharCaption(cc.id, { negativePrompt })}
                  />
                </label>
                {cc.useCoords && (
                  <div className="char-coords" aria-label={t("character.exactPosition")}>
                    <NumberInput
                      label={t("character.x")}
                      value={cc.x}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(v) => updateCharCaption(cc.id, { x: v })}
                    />
                    <NumberInput
                      label={t("character.y")}
                      value={cc.y}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(v) => updateCharCaption(cc.id, { y: v })}
                    />
                  </div>
                )}
              </div>
              )}
            </div>
            );
          })}
          <Button className="full" onClick={addCharCaption} disabled={!supportsCharacters || charCaptions.length >= maxCharacters}>
            <IconText icon="+">{t("character.add")}</IconText>
          </Button>
        </div>
        <footer>
          <Button onClick={clearCharCaptions}>
            <IconText icon="⌧">{t("character.clear")}</IconText>
          </Button>
          <Button variant="primary" onClick={onClose}>
            <IconText icon="✓">{t("character.done")}</IconText>
          </Button>
        </footer>
      </div>
      </div>
    </AppPortal>
  );
}

function StylePresetImagesModal({
  preset,
  text,
  onImport,
  onDropImages,
  onReplace,
  onDelete,
  onClose,
}: {
  preset: StylePromptPreset;
  text: ReturnType<typeof getGeneratePanelText>["prompt"];
  onImport: () => void;
  onDropImages: (sourcePaths: string[]) => void;
  onReplace: (image: StylePromptPreviewImage) => void;
  onDelete: (image: StylePromptPreviewImage) => void;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<StylePromptPreviewImage | null>(null);
  const [dragging, setDragging] = useState(false);
  const images = preset.previewImages ?? [];
  const language = useAppStore((state) => state.settings?.language);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (preview) setPreview(null);
      else onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, preview]);
  return (
    <AppPortal>
      <div className="modal-backdrop" onMouseDown={onClose}>
        <div className="modal style-image-modal" onMouseDown={(event) => event.stopPropagation()}>
          <header>
            <div>
              <h2>{text.stylePresetImageManager}</h2>
              <small>{preset.name} · {images.length}/3</small>
            </div>
            <button type="button" aria-label={t("common.close")} onClick={onClose}><Icon name="close" /></button>
          </header>
          <div
            className={clsx("style-image-modal-body", dragging && "dragging")}
            onDragEnter={(event) => {
              if (!hasDraggedFiles(event.dataTransfer)) return;
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => {
              if (!hasDraggedFiles(event.dataTransfer)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              setDragging(true);
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
              setDragging(false);
            }}
            onDrop={(event) => {
              if (!hasDraggedFiles(event.dataTransfer)) return;
              event.preventDefault();
              setDragging(false);
              const paths = droppedImagePaths(event.dataTransfer, 3 - images.length);
              if (paths.length > 0) onDropImages(paths);
            }}
          >
            {images.length === 0 ? (
              <div
                className="style-image-empty"
                role="button"
                tabIndex={0}
                onClick={onImport}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onImport();
                  }
                }}
              >
                <Icon name="palette" />
                <strong>{text.stylePresetNoImages}</strong>
                <span>{text.stylePresetDropImages}</span>
                <span>{text.stylePresetImageHint}</span>
              </div>
            ) : (
              <div className="style-image-grid">
                {images.map((image) => (
                  <article key={image.id}>
                    <button
                      type="button"
                      className="style-image-preview-button"
                      onDoubleClick={() => setPreview(image)}
                      title={text.stylePresetImageHint}
                    >
                      <img src={image.fileUrl} alt={`${preset.name} · ${image.name}`} />
                    </button>
                    <small title={image.name}>{image.name}</small>
                    <div>
                      <Button type="button" variant="secondary" onClick={() => onReplace(image)}>
                        <Icon name="folderOpen" /> {text.stylePresetReplaceImage}
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => onDelete(image)}>
                        <Icon name="trash" /> {text.stylePresetDeleteImage}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <p>{text.stylePresetImageHint}</p>
          </div>
          <footer>
            <Button type="button" onClick={onClose}>{t("common.close")}</Button>
            <Button type="button" variant="primary" disabled={images.length >= 3} onClick={onImport}>
              <Icon name="folderOpen" /> {text.stylePresetAddImages}
            </Button>
          </footer>
        </div>
      </div>
      {preview && (
        <div className="style-image-lightbox" role="dialog" aria-modal="true" onMouseDown={() => setPreview(null)}>
          <button type="button" aria-label={t("common.close")} onClick={() => setPreview(null)}><Icon name="close" /></button>
          <img src={preview.fileUrl} alt={`${preset.name} · ${preview.name}`} onMouseDown={(event) => event.stopPropagation()} />
        </div>
      )}
    </AppPortal>
  );
}

// ── Prompt + Params ───────────────────────────────────────────────────────────
function PromptAndParams({
  includeModel = true,
  imageToImage = false,
  lockSizeToSource = false,
  promptOverride,
}: {
  includeModel?: boolean;
  imageToImage?: boolean;
  /** Inpaint always renders against the loaded source image. Its dimensions are
   * prepared by the main process and must not be edited through shared generate
   * parameters. Keep only a compact read-only source-size indicator. */
  lockSizeToSource?: boolean;
  // When set, the positive-prompt textarea (and every action that edits it —
  // templates, capsule insert, weight adjust, translate, normalize) reads and
  // writes here instead of the shared params.positivePrompt. Used by the
  // inpaint panel so it doesn't inherit the main generate/i2i prompt.
  promptOverride?: { value: string; onChange: (value: string) => void };
}) {
  const params = useAppStore((state) => state.params);
  const setParam = useAppStore((state) => state.setParam);
  const workbenchImage = useAppStore((state) => state.workbenchImage);
  const i2iSizeMode = useAppStore((state) => state.i2iSizeMode);
  const setI2ISizeMode = useAppStore((state) => state.setI2ISizeMode);
  const promptTab = useAppStore((state) => state.promptTab);
  const setPromptTab = useAppStore((state) => state.setPromptTab);
  const vibeImages = useAppStore((state) => state.vibeImages);
  const preciseRefCount = useAppStore((state) => state.preciseReferences.length);
  const charCaptions = useAppStore((state) => state.charCaptions);
  const settings = useAppStore((state) => state.settings);
  const setToast = useAppStore((state) => state.setToast);
  const refreshSettings = useAppStore((state) => state.refreshSettings);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showVibeModal, setShowVibeModal] = useState(false);
  const [showCharModal, setShowCharModal] = useState(false);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [chipQuery, setChipQuery] = useState("");
  const [chipOpen, setChipOpen] = useState(false);
  const [showWeights, setShowWeights] = useState(false);
  const [showNormalize, setShowNormalize] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [selectedStylePresetId, setSelectedStylePresetId] = useState("");
  const [selectedStylePresetGroup, setSelectedStylePresetGroup] = useState("all");
  const [styleGroupPromptOpen, setStyleGroupPromptOpen] = useState(false);
  const [stylePresetMenuOpen, setStylePresetMenuOpen] = useState(false);
  const [stylePresetActionId, setStylePresetActionId] = useState("");
  const [hoveredStylePresetId, setHoveredStylePresetId] = useState("");
  const [styleImageManagerPresetId, setStyleImageManagerPresetId] = useState("");
  const stylePresetPickerRef = useRef<HTMLDivElement>(null);
  const stylePresetMenuRef = useRef<HTMLDivElement>(null);
  const [stylePresetMenuPosition, setStylePresetMenuPosition] = useState({ left: 0, top: 0, width: 240 });
  const [styleNamePrompt, setStyleNamePrompt] = useState<{ stylePrompt: string; fallbackName: string } | null>(null);
  const adaptiveI2ISize = workbenchImage
    ? adaptiveNAIImageSize(workbenchImage.width, workbenchImage.height, params)
    : { width: params.width, height: params.height };
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("uiCapture") !== "referenceModal") return;
    const store = useAppStore.getState();
    const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const previewUrl = `data:image/png;base64,${base64}`;
    if (store.vibeImages.length === 0) {
      store.addVibeImage({ id: "ui-capture-vibe", previewUrl, base64, infoExtracted: 1, strength: 1 });
    }
    if (store.preciseReferences.length === 0) {
      store.addPreciseReference({ id: "ui-capture-precise", previewUrl, base64, type: "character", strength: 1, fidelity: 1, informationExtracted: 1, srcWidth: 1024, srcHeight: 1536 });
    }
    setShowVibeModal(true);
  }, []);
  // Original prompt text kept per tab so a translation can be reverted (还原).
  const [translateBackup, setTranslateBackup] = useState<Record<string, string>>({});
  // The override (inpaint) fully replaces params.positivePrompt as the source
  // of truth for every positive-prompt read/write in this component.
  const effectivePositivePrompt = promptOverride ? promptOverride.value : params.positivePrompt;
  function setPositivePromptValue(value: string) {
    if (promptOverride) promptOverride.onChange(value);
    else setParam("positivePrompt", value);
  }
  const promptValue = promptTab === "positive" ? effectivePositivePrompt : params.negativePrompt;
  const promptKey = promptTab === "positive" ? "positivePrompt" : "negativePrompt";
  // Unified setter for every "edit whichever tab is active" action (capsule
  // insert, weight adjust, translate, normalize) — negative prompt is always
  // shared, positive prompt goes through the override when present.
  function setPromptValue(value: string) {
    if (promptKey === "positivePrompt") setPositivePromptValue(value);
    else setParam("negativePrompt", value);
  }
  const templates: PromptTemplate[] = settings?.promptTemplates ?? [];
  const stylePromptPresets: StylePromptPreset[] = settings?.stylePromptPresets ?? [];
  const stylePreviewRecoverySignature = stylePromptPresets
    .map((preset) => `${preset.id}:${(preset.previewImages ?? []).map((image) => image.id).join(",")}`)
    .join("|");
  const attemptedStylePreviewRecoveryRef = useRef("");
  const stylePromptPresetGroups = useMemo(() => {
    const groups = new Set<string>(["Default", ...(settings?.stylePromptPresetGroups ?? [])]);
    stylePromptPresets.forEach((preset) => groups.add(preset.group || "Default"));
    return [...groups];
  }, [settings?.stylePromptPresetGroups, stylePromptPresets]);
  const selectedStylePreset = stylePromptPresets.find((item) => item.id === selectedStylePresetId);
  const hoveredStylePreset = stylePromptPresets.find((item) => item.id === hoveredStylePresetId);
  const styleImageManagerPreset = stylePromptPresets.find((item) => item.id === styleImageManagerPresetId);
  const generateText = useMemo(() => getGeneratePanelText(settings?.language), [settings?.language]);
  const t = useCallback((key: string) => desktopUiText(settings?.language, key), [settings?.language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(settings?.language, key, values), [settings?.language]);
  // Co-occurrence: prefer the user-installed SQLite pack and retain the small
  // built-in table as an offline fallback until that pack is installed.
  const fallbackRelated = useMemo(() => relatedTags(effectivePositivePrompt, 8), [effectivePositivePrompt]);
  const [databaseRelated, setDatabaseRelated] = useState(fallbackRelated);
  useEffect(() => {
    setDatabaseRelated([]);
    const sourceTags = splitPromptTags(effectivePositivePrompt)
      .map((segment) => parseWeightedTag(segment).core)
      .filter(Boolean);
    if (!sourceTags.length) {
      setDatabaseRelated([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void window.naiDesktop.relatedResourceTags(sourceTags, 8).then((items) => {
        if (cancelled) return;
        setDatabaseRelated(items.map((item) => ({
          tag: item.tag.replaceAll("_", " "),
          zh: item.description || "本地相关标签",
        })));
      }).catch(() => {
        if (!cancelled) setDatabaseRelated([]);
      });
    }, 140);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [effectivePositivePrompt]);
  const related = databaseRelated.length > 0 ? databaseRelated : fallbackRelated;

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("uiStylePresetOpen") !== "1") return;
    let cancelled = false;
    const prepare = async () => {
      if (stylePromptPresets.length === 0) {
        await window.naiDesktop.setSetting("stylePromptPresetGroups", ["Default", "光影", "厚涂"]);
        await window.naiDesktop.setSetting("stylePromptPresets", [
          { id: "ui-style-1", name: "柔和逆光", prompt: "soft backlighting, rim light", group: "光影", createdAt: "2026-08-22T00:00:00.000Z", previewImages: [] },
          { id: "ui-style-2", name: "油画厚涂", prompt: "impasto, painterly, textured brushwork", group: "厚涂", createdAt: "2026-08-22T00:00:00.000Z", previewImages: [] },
          { id: "ui-style-3", name: "清透动画", prompt: "clean anime lineart, soft gradient", group: "Default", createdAt: "2026-08-22T00:00:00.000Z", previewImages: [] },
        ]);
        await refreshSettings();
        return;
      }
      if (new URLSearchParams(window.location.search).get("uiStylePresetImages") === "1") {
        setStyleImageManagerPresetId(stylePromptPresets[0]?.id ?? "");
        return;
      }
      window.requestAnimationFrame(() => {
        if (cancelled) return;
        const rect = stylePresetPickerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const width = Math.min(window.innerWidth - 24, Math.max(260, rect.width));
        const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
        setSelectedStylePresetGroup(selectedStylePreset?.group || "Default");
        setStylePresetMenuPosition({ left, top: rect.bottom + 6, width });
        setStylePresetMenuOpen(true);
        if (new URLSearchParams(window.location.search).get("uiStylePresetActions") === "1") {
          setStylePresetActionId("ui-style-3");
        }
      });
    };
    void prepare();
    return () => { cancelled = true; };
  }, [stylePromptPresets.length]);

  function applyTemplate(tpl: PromptTemplate) {
    setShowTemplateMenu(false);
    const current = effectivePositivePrompt.trim();
    const parts = [tpl.prefix.trim(), current, tpl.suffix.trim()].filter(Boolean);
    setPositivePromptValue(parts.join(", "));
    if (tpl.negativePrompt.trim() && !(settings?.lockNegativePrompt ?? false)) {
      setParam("negativePrompt", tpl.negativePrompt.trim());
    }
    setToast(f("prompt.templateApplied", { name: tpl.name }));
  }

  useEffect(() => {
    const stylePrompt = params.stylePrompt.trim();
    const matched = stylePromptPresets.find((preset) => preset.prompt.trim() === stylePrompt);
    setSelectedStylePresetId(matched?.id ?? "");
  }, [params.stylePrompt, stylePromptPresets]);

  // Recover every style preset as soon as the generate panel loads.  Recovery
  // must not depend on opening the image manager: otherwise the picker keeps
  // showing 0/3 after an older build lost only the previewImages metadata even
  // though the copied image files are still present on disk.
  useEffect(() => {
    if (stylePromptPresets.length === 0) return;
    if (attemptedStylePreviewRecoveryRef.current === stylePreviewRecoverySignature) return;
    attemptedStylePreviewRecoveryRef.current = stylePreviewRecoverySignature;
    let cancelled = false;
    void Promise.all(
      stylePromptPresets.map((preset) =>
        window.naiDesktop.reconcileStylePromptPresetImages(
          preset.id,
          preset.previewImages ?? [],
        ),
      ),
    ).then(async (restoredByPreset) => {
      if (cancelled) return;
      let changed = false;
      const restoredPresets = stylePromptPresets.map((preset, index) => {
        const current = preset.previewImages ?? [];
        const restored = restoredByPreset[index] ?? [];
        const currentIds = current.map((image) => image.id).join("|");
        const restoredIds = restored.map((image) => image.id).join("|");
        if (currentIds === restoredIds) return preset;
        changed = true;
        return { ...preset, previewImages: restored };
      });
      if (!changed) return;
      await window.naiDesktop.setSetting("stylePromptPresets", restoredPresets);
      if (!cancelled) await refreshSettings();
    });
    return () => { cancelled = true; };
  }, [stylePreviewRecoverySignature]);

  useEffect(() => {
    if (!stylePresetMenuOpen) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !stylePresetPickerRef.current?.contains(target) &&
        !stylePresetMenuRef.current?.contains(target)
      ) {
        setStylePresetMenuOpen(false);
        setHoveredStylePresetId("");
      }
    };
    const closeFloatingMenu = (event: Event) => {
      if (isScrollInsideFloatingMenu(stylePresetMenuRef.current, event.target)) {
        return;
      }
      setStylePresetMenuOpen(false);
      setHoveredStylePresetId("");
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("scroll", closeFloatingMenu, true);
    window.addEventListener("resize", closeFloatingMenu);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("scroll", closeFloatingMenu, true);
      window.removeEventListener("resize", closeFloatingMenu);
    };
  }, [stylePresetMenuOpen]);

  function toggleStylePresetMenu() {
    if (stylePresetMenuOpen) {
      setStylePresetMenuOpen(false);
      setHoveredStylePresetId("");
      return;
    }
    const rect = stylePresetPickerRef.current?.getBoundingClientRect();
    if (rect) {
      const width = Math.min(window.innerWidth - 24, Math.max(260, rect.width));
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
      setStylePresetMenuPosition({ left, top: rect.bottom + 6, width });
    }
    setSelectedStylePresetGroup(selectedStylePreset?.group || "Default");
    setStylePresetMenuOpen(true);
  }

  async function applyStylePromptPreset(id: string) {
    setSelectedStylePresetId(id);
    const preset = stylePromptPresets.find((item) => item.id === id);
    if (!preset) return;
    setStylePresetMenuOpen(false);
    setHoveredStylePresetId("");
    setLockedAwareParam("stylePrompt", preset.prompt);
    setToast(f("prompt.stylePresetApplied", { name: preset.name }));
  }

  function saveStylePromptPreset() {
    const stylePrompt = params.stylePrompt.trim();
    if (!stylePrompt) {
      setToast(t("prompt.stylePresetNeedPrompt"));
      return;
    }
    const fallbackName = stylePrompt.slice(0, 28) || `Style ${stylePromptPresets.length + 1}`;
    setStyleNamePrompt({ stylePrompt, fallbackName });
  }

  async function confirmSaveStylePromptPreset(rawName: string) {
    const name = rawName.trim();
    if (!name || !styleNamePrompt) return;
    const preset: StylePromptPreset = {
      id: makeStylePresetId(),
      name,
      prompt: styleNamePrompt.stylePrompt,
      group: selectedStylePresetGroup === "all" ? "Default" : selectedStylePresetGroup,
      createdAt: new Date().toISOString(),
      previewImages: [],
    };
    setStyleNamePrompt(null);
    await window.naiDesktop.setSetting("stylePromptPresets", [...stylePromptPresets, preset]);
    await refreshSettings();
    setSelectedStylePresetId(preset.id);
    setToast(f("prompt.stylePresetSaved", { name }));
  }

  async function createStylePromptGroup(rawName: string) {
    const name = rawName.trim();
    setStyleGroupPromptOpen(false);
    if (!name) return;
    if (stylePromptPresetGroups.some((group) => group.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setToast(t("prompt.styleGroupExists"));
      return;
    }
    await window.naiDesktop.setSetting("stylePromptPresetGroups", [...stylePromptPresetGroups, name]);
    await refreshSettings();
    setSelectedStylePresetGroup(name);
    setToast(f("prompt.styleGroupCreated", { name }));
  }

  async function moveStylePromptPreset(presetId: string, group: string) {
    await window.naiDesktop.setSetting(
      "stylePromptPresets",
      stylePromptPresets.map((preset) => preset.id === presetId ? { ...preset, group } : preset),
    );
    await refreshSettings();
    setStylePresetActionId("");
    const preset = stylePromptPresets.find((item) => item.id === presetId);
    if (preset) setToast(f("prompt.styleMoved", { name: preset.name, group: group === "Default" ? t("prompt.styleGroupDefault") : group }));
  }

  async function deleteStylePromptGroup(groupOverride?: string) {
    const group = groupOverride ?? selectedStylePresetGroup;
    if (group === "all" || group === "Default") return;
    if (!(await confirmAction(f("prompt.styleGroupDeleteConfirm", { name: group })))) return;
    await window.naiDesktop.setSetting(
      "stylePromptPresets",
      stylePromptPresets.map((preset) => preset.group === group ? { ...preset, group: "Default" } : preset),
    );
    await window.naiDesktop.setSetting(
      "stylePromptPresetGroups",
      stylePromptPresetGroups.filter((item) => item !== group),
    );
    await refreshSettings();
    setSelectedStylePresetGroup("all");
    setToast(f("prompt.styleGroupDeleted", { name: group }));
  }

  async function deleteStylePromptPreset(presetId = selectedStylePresetId) {
    const preset = stylePromptPresets.find((item) => item.id === presetId);
    if (!preset) return;
    if (!(await confirmAction(f("prompt.stylePresetDeleteConfirm", { name: preset.name })))) return;
    await window.naiDesktop.deleteStylePromptPresetImages(preset.id);
    await window.naiDesktop.setSetting(
      "stylePromptPresets",
      stylePromptPresets.filter((item) => item.id !== preset.id),
    );
    await refreshSettings();
    setSelectedStylePresetId("");
    setStylePresetActionId("");
    setToast(f("prompt.stylePresetDeleted", { name: preset.name }));
  }

  async function updateStylePresetImages(
    presetId: string,
    images: StylePromptPreviewImage[],
  ) {
    await window.naiDesktop.setSetting(
      "stylePromptPresets",
      stylePromptPresets.map((item) =>
        item.id === presetId ? { ...item, previewImages: images.slice(0, 3) } : item,
      ),
    );
    await refreshSettings();
  }

  useEffect(() => {
    if (!styleImageManagerPresetId) return;
    const preset = stylePromptPresets.find((item) => item.id === styleImageManagerPresetId);
    if (!preset) return;
    let cancelled = false;
    void window.naiDesktop
      .reconcileStylePromptPresetImages(preset.id, preset.previewImages ?? [])
      .then(async (restored) => {
        if (cancelled) return;
        const currentIds = (preset.previewImages ?? []).map((image) => image.id).join("|");
        const restoredIds = restored.map((image) => image.id).join("|");
        if (currentIds !== restoredIds) await updateStylePresetImages(preset.id, restored);
      });
    return () => { cancelled = true; };
  }, [styleImageManagerPresetId]);

  async function importStylePresetImages(preset: StylePromptPreset) {
    const current = await window.naiDesktop.reconcileStylePromptPresetImages(
      preset.id,
      preset.previewImages ?? [],
    );
    const available = 3 - current.length;
    if (available <= 0) {
      setToast(generateText.prompt.stylePresetImageLimit);
      return;
    }
    const imported = await window.naiDesktop.importStylePromptPresetImages(
      preset.id,
      available,
      generateText.prompt.stylePresetImageManager,
    );
    if (imported.length === 0) return;
    await updateStylePresetImages(preset.id, [...current, ...imported]);
  }

  async function importDroppedStylePresetImages(
    preset: StylePromptPreset,
    sourcePaths: string[],
  ) {
    const current = await window.naiDesktop.reconcileStylePromptPresetImages(
      preset.id,
      preset.previewImages ?? [],
    );
    const available = 3 - current.length;
    if (available <= 0) {
      setToast(generateText.prompt.stylePresetImageLimit);
      return;
    }
    const imported = await window.naiDesktop.importStylePromptPresetImagePaths(
      sourcePaths,
      preset.id,
      available,
    );
    if (imported.length === 0) return;
    await updateStylePresetImages(preset.id, [...current, ...imported]);
    setToast(
      generateText.prompt.stylePresetImagesImported.replace(
        "{count}",
        String(imported.length),
      ),
    );
  }

  async function replaceStylePresetImage(
    preset: StylePromptPreset,
    image: StylePromptPreviewImage,
  ) {
    const imported = await window.naiDesktop.importStylePromptPresetImages(
      preset.id,
      1,
      generateText.prompt.stylePresetReplaceImage,
    );
    if (imported.length === 0) return;
    await window.naiDesktop.deleteStylePromptPresetImage(preset.id, image.id);
    const next = (preset.previewImages ?? []).map((item) =>
      item.id === image.id ? imported[0] : item,
    );
    await updateStylePresetImages(preset.id, next);
  }

  async function deleteStylePresetImage(
    preset: StylePromptPreset,
    image: StylePromptPreviewImage,
  ) {
    await window.naiDesktop.deleteStylePromptPresetImage(preset.id, image.id);
    await updateStylePresetImages(
      preset.id,
      (preset.previewImages ?? []).filter((item) => item.id !== image.id),
    );
  }

  function appendChip(tag: string) {
    const current = promptValue.trim();
    const next = current ? `${current.replace(/\s*,?\s*$/, "")}, ${tag}, ` : `${tag}, `;
    setPromptValue(next);
  }

  // Per-tag weight editor: parse the active prompt into { core, level } chips.
  const weightTags = useMemo(
    () => splitPromptTags(promptValue).map((seg) => parseWeightedTag(seg)),
    [promptValue],
  );
  function bumpWeight(index: number, delta: number) {
    const tag = weightTags[index];
    if (!tag) return;
    setPromptValue(setTagLevelInPrompt(promptValue, index, tag.level + delta));
  }

  async function toggleAutoComplete() {
    const next = !(settings?.autoComplete ?? true);
    await window.naiDesktop.setSetting("autoComplete", next);
    await refreshSettings();
    setToast(next ? t("prompt.autocompleteOnToast") : t("prompt.autocompleteOffToast"));
  }

  const modelMode: ModelMode = settings?.modelMode ?? "anime";
  async function switchModelMode(mode: ModelMode) {
    if (mode === modelMode) return;
    await window.naiDesktop.setSetting("modelMode", mode);
    await refreshSettings();
    // V4/V4.5/V5 are shared by Anime and Furry modes. Preserve the user's
    // selected modern model; only migrate when that model cannot serve the
    // newly selected mode (Anime V3 / dedicated Furry V3).
    if (!supportsNAIModelMode(params.model, mode)) {
      setParam("model", DEFAULT_MODEL_FOR_MODE[mode]);
    }
    setToast(mode === "furry" ? t("prompt.modeFurryToast") : t("prompt.modeAnimeToast"));
  }

  // Save + lock the style / negative prompt so it persists and survives
  // resets / template applies.
  async function toggleLock(which: "style" | "neg") {
    const lockKey = which === "style" ? "lockStylePrompt" : "lockNegativePrompt";
    const savedKey = which === "style" ? "savedStylePrompt" : "savedNegativePrompt";
    const next = !(settings?.[lockKey] ?? false);
    if (next) {
      await window.naiDesktop.setSetting(savedKey, which === "style" ? params.stylePrompt : params.negativePrompt);
    }
    await window.naiDesktop.setSetting(lockKey, next);
    await refreshSettings();
    setToast(next ? t("prompt.lockedToast") : t("prompt.unlockedToast"));
  }
  // Keep the saved copy in sync while a field is locked.
  function setLockedAwareParam(key: "stylePrompt" | "positivePrompt" | "negativePrompt", value: string) {
    if (key === "positivePrompt") {
      setPositivePromptValue(value);
      return;
    }
    setParam(key, value);
    if (key === "stylePrompt" && settings?.lockStylePrompt) {
      void window.naiDesktop.setSetting("savedStylePrompt", value);
    } else if (key === "negativePrompt" && settings?.lockNegativePrompt) {
      void window.naiDesktop.setSetting("savedNegativePrompt", value);
    }
  }
  const styleLocked = settings?.lockStylePrompt ?? false;
  const negLocked = settings?.lockNegativePrompt ?? false;

  async function translatePrompt() {
    const text = promptValue.trim();
    if (!text) {
      setToast(t("prompt.emptyTranslate"));
      return;
    }
    setTranslating(true);
    const original = promptValue;
    try {
      // Translate comma-separated natural-language segments with provider-side
      // auto language detection. English Danbooru tags normally round-trip to the
      // same text, while Chinese/Japanese/Korean/other languages become English.
      const segments = text.split(",");
      let translatedAny = false;
      let failed = false;
      const translated = await Promise.all(
        segments.map(async (seg) => {
          const trimmed = seg.trim();
          if (!trimmed || !hasTranslatableText(trimmed)) return trimmed;
          const res = await window.naiDesktop.translate(trimmed, "en");
          if (res.ok && res.text) {
            translatedAny = true;
            return res.text.trim();
          }
          failed = true;
          return trimmed;
        }),
      );
      if (!translatedAny && failed) {
        setToast(t("prompt.translateFailed"));
        return;
      }
      const joined = translated.filter(Boolean).join(", ");
      setPromptValue(joined + (joined.endsWith(",") ? " " : ", "));
      setTranslateBackup((b) => ({ ...b, [promptKey]: original }));
      setToast(failed ? t("prompt.translatePartialFailed") : t("prompt.translateDone"));
    } catch {
      setToast(t("prompt.translateFailed"));
    } finally {
      setTranslating(false);
    }
  }

  function restoreTranslate() {
    const backup = translateBackup[promptKey];
    if (backup == null) return;
    setPromptValue(backup);
    setTranslateBackup((b) => {
      const next = { ...b };
      delete next[promptKey];
      return next;
    });
    setToast(t("prompt.translateRestored"));
  }

  const tagCount = useMemo(
    () => promptValue.trim().split(",").filter((s) => s.trim().length > 0).length,
    [promptValue],
  );
  // Rough CLIP token estimate: each tag ≈ 1.5 tokens on average
  const tokenEst = Math.round(tagCount * 1.5);
  const tokenWarn = tokenEst > 225;

  return (
    <>
      {includeModel && (
        <label className="field">
          <span>{generateText.prompt.model}</span>
          <div className="model-mode-switch">
            <button type="button" className={clsx(modelMode === "anime" && "active")} onClick={() => void switchModelMode("anime")}>
              <Icon name="palette" /> {generateText.prompt.animeMode}
            </button>
            <button type="button" className={clsx(modelMode === "furry" && "active")} onClick={() => void switchModelMode("furry")}>
              <Icon name="paw" /> {generateText.prompt.furryMode}
            </button>
          </div>
          <select value={params.model} onChange={(e) => setParam("model", e.target.value as GenerateParams["model"])}>
            {NAI_MODELS.filter((m) => supportsNAIModelMode(m.value, modelMode)).map((m) => (
              <option value={m.value} key={m.value}>{localizedDesktopOptionLabel(settings?.language, m.value, m.label)}</option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        <span className="field-label-row">
          {generateText.prompt.stylePrompt}
          <button
            type="button"
            className={clsx("lock-btn", styleLocked && "locked")}
            title={styleLocked ? generateText.prompt.lockSavedTitle : generateText.prompt.lockCurrentTitle}
            onClick={() => void toggleLock("style")}
          >
            {styleLocked ? <><Icon name="lock" /> {generateText.prompt.locked}</> : <><Icon name="unlock" /> {generateText.prompt.lock}</>}
          </button>
        </span>
        <input
          value={params.stylePrompt}
          placeholder={generateText.prompt.stylePlaceholder}
          onChange={(e) => setLockedAwareParam("stylePrompt", e.target.value)}
        />
      </label>
      <div className="style-preset-row">
        <div className="style-preset-picker" ref={stylePresetPickerRef}>
          <button
            type="button"
            className="style-preset-trigger"
            aria-haspopup="listbox"
            aria-expanded={stylePresetMenuOpen}
            onClick={toggleStylePresetMenu}
          >
            <span>{selectedStylePreset?.name ?? generateText.prompt.stylePresetPlaceholder}</span>
            <Icon name="chevronDown" className={clsx("select-menu-chevron-inline", stylePresetMenuOpen && "open")} />
          </button>
        </div>
        <div className="style-preset-actions">
          <Button type="button" variant="secondary" onClick={saveStylePromptPreset}>
            <Icon name="pin" /> {generateText.prompt.stylePresetSave}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!selectedStylePreset}
            onClick={() => selectedStylePreset && setStyleImageManagerPresetId(selectedStylePreset.id)}
          >
            <Icon name="eye" /> {generateText.prompt.stylePresetImages} {selectedStylePreset ? `${(selectedStylePreset.previewImages ?? []).length}/3` : ""}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={!selectedStylePresetId}
            onClick={() => void deleteStylePromptPreset()}
          >
            <Icon name="trash" /> {generateText.prompt.stylePresetDelete}
          </Button>
        </div>
      </div>
      {stylePresetMenuOpen && (
        <AppPortal>
          <div
            ref={stylePresetMenuRef}
            className="style-preset-menu"
            role="listbox"
            style={{
              left: stylePresetMenuPosition.left,
              top: stylePresetMenuPosition.top,
              width: stylePresetMenuPosition.width,
            }}
          >
            <div className="style-preset-menu-list">
              {stylePromptPresetGroups.map((group) => {
                const groupPresets = stylePromptPresets.filter((preset) => (preset.group || "Default") === group);
                const expanded = selectedStylePresetGroup === group;
                return (
                  <section className={clsx("style-folder", expanded && "expanded")} key={group}>
                    <header>
                      <button type="button" onClick={() => setSelectedStylePresetGroup(expanded ? "all" : group)} aria-expanded={expanded}>
                        <Icon name={expanded ? "folderOpen" : "folder"} />
                        <span>{group === "Default" ? t("prompt.styleGroupDefault") : group}</span>
                        <small>{groupPresets.length}</small>
                        <Icon name="chevronRight" />
                      </button>
                      {group !== "Default" && <button type="button" className="style-folder-delete" title={t("prompt.styleGroupDelete")} aria-label={t("prompt.styleGroupDelete")} onClick={() => void deleteStylePromptGroup(group)}><Icon name="trash" /></button>}
                    </header>
                    {expanded && <div className="style-folder-children">
                      {groupPresets.length === 0 && <p>{generateText.prompt.stylePresetPlaceholder}</p>}
                      {groupPresets.map((preset) => (
                    <div className={clsx("style-preset-menu-item", preset.id === selectedStylePresetId && "active")} key={preset.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={preset.id === selectedStylePresetId}
                        onMouseEnter={() => setHoveredStylePresetId(preset.id)}
                        onFocus={() => setHoveredStylePresetId(preset.id)}
                        onClick={() => void applyStylePromptPreset(preset.id)}
                      >
                        <span>{preset.name}</span>
                        <small>
                          <Icon name="eye" /> {(preset.previewImages ?? []).length}/3
                        </small>
                      </button>
                      <button type="button" className="style-preset-more" title={t("prompt.styleMove")} aria-label={f("prompt.styleMoveTo", { name: preset.name })} onClick={() => setStylePresetActionId((current) => current === preset.id ? "" : preset.id)}><Icon name="moreHorizontal" /></button>
                      {stylePresetActionId === preset.id && (
                        <div className="style-preset-item-popover">
                          <strong>{t("prompt.styleMove")}</strong>
                          {stylePromptPresetGroups.map((group) => (
                            <button type="button" key={group} disabled={(preset.group || "Default") === group} onClick={() => void moveStylePromptPreset(preset.id, group)}>
                              {(preset.group || "Default") === group && <Icon name="check" />}
                              <span>{group === "Default" ? t("prompt.styleGroupDefault") : group}</span>
                            </button>
                          ))}
                          <button type="button" className="danger" onClick={() => void deleteStylePromptPreset(preset.id)}><Icon name="trash" /><span>{generateText.prompt.stylePresetDelete}</span></button>
                        </div>
                      )}
                    </div>
                      ))}
                    </div>}
                  </section>
                );
              })}
              <button type="button" className="style-folder-create" onClick={() => setStyleGroupPromptOpen(true)}><Icon name="plus" /><span>{t("prompt.styleGroupCreate")}</span></button>
            </div>
            {hoveredStylePreset && (hoveredStylePreset.previewImages ?? []).length > 0 && (
              <aside className="style-preset-hover-preview">
                <strong>{hoveredStylePreset.name}</strong>
                <div>
                  {(hoveredStylePreset.previewImages ?? []).map((image) => (
                    <img key={image.id} src={image.fileUrl} alt={`${hoveredStylePreset.name} · ${image.name}`} />
                  ))}
                </div>
              </aside>
            )}
          </div>
        </AppPortal>
      )}
      {styleNamePrompt && (
        <InputModal
          title={generateText.prompt.stylePresetSave}
          label={generateText.prompt.stylePresetNamePrompt}
          initial={styleNamePrompt.fallbackName}
          onConfirm={(value) => void confirmSaveStylePromptPreset(value)}
          onClose={() => setStyleNamePrompt(null)}
        />
      )}
      {styleImageManagerPreset && (
        <StylePresetImagesModal
          preset={styleImageManagerPreset}
          text={generateText.prompt}
          onImport={() => void importStylePresetImages(styleImageManagerPreset)}
          onDropImages={(paths) => void importDroppedStylePresetImages(styleImageManagerPreset, paths)}
          onReplace={(image) => void replaceStylePresetImage(styleImageManagerPreset, image)}
          onDelete={(image) => void deleteStylePresetImage(styleImageManagerPreset, image)}
          onClose={() => setStyleImageManagerPresetId("")}
        />
      )}
      <div className={clsx("prompt-chip-zone", !chipOpen && "collapsed")}>
        <button type="button" className="prompt-chip-head" onClick={() => setChipOpen((v) => !v)}>
          <span className="chip-head-title">
            <Icon name="chevronRight" className={clsx("chip-caret", chipOpen && "open")} />
            {generateText.prompt.capsuleTitle}
          </span>
          <small className="chip-head-hint">{chipOpen ? generateText.prompt.capsuleHintOpen : generateText.prompt.capsuleHintClosed}</small>
        </button>
        {chipOpen && (
          <>
            <div className="prompt-chip-toolbar">
              <input
                className="prompt-chip-search"
                value={chipQuery}
                placeholder={generateText.prompt.capsuleSearchPlaceholder}
                onChange={(e) => setChipQuery(e.target.value)}
              />
            </div>
            <CapsuleBrowser query={chipQuery} onPick={appendChip} language={settings?.language} />
            {related.length > 0 && (
              <div className="related-tags">
                <div className="related-tags-head"><Icon name="link" /> {generateText.prompt.relatedTitle}</div>
                <div className="prompt-chip-list">
                  {related.map((r) => (
                    <button
                      key={r.tag}
                      type="button"
                      onClick={() => appendChip(r.tag)}
                      title={`${r.tag}: ${localizedTagLabel(r.tag, r.zh, settings?.language)}`}
                    >
                      <span>{r.tag}</span>
                      <small>{localizedTagLabel(r.tag, r.zh, settings?.language)}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <div className="prompt-tabs">
        <button className={clsx(promptTab === "positive" && "active")} onClick={() => setPromptTab("positive")}>
          {generateText.prompt.positivePrompt}
        </button>
        <button className={clsx(promptTab === "negative" && "active")} onClick={() => setPromptTab("negative")}>
          {generateText.prompt.negativePrompt}{negLocked ? <> <Icon name="lock" /></> : ""}
        </button>
        {promptTab === "negative" && (
          <button
            type="button"
            className={clsx("lock-btn", negLocked && "locked")}
            title={negLocked ? generateText.prompt.lockSavedTitle : generateText.prompt.lockCurrentTitle}
            onClick={() => void toggleLock("neg")}
          >
            {negLocked ? <><Icon name="lock" /> {generateText.prompt.locked}</> : <><Icon name="unlock" /> {generateText.prompt.lock}</>}
          </button>
        )}
      </div>
      <PromptTextarea
        value={promptValue}
        onChange={(v) => setLockedAwareParam(promptKey, v)}
        model={params.model}
        enabled={settings?.autoComplete ?? true}
        placeholder={promptTab === "positive" ? generateText.prompt.positivePlaceholder : generateText.prompt.negativePlaceholder}
      />
      <div className="prompt-toolbar-row">
        {promptTab === "positive" && (
          <PositivePromptPresetControl
            value={effectivePositivePrompt}
            onApply={(value) => setLockedAwareParam("positivePrompt", value)}
          />
        )}
        <button type="button" className="prompt-tool-btn weight-tool-btn" onClick={() => setShowWeights((v) => !v)} disabled={weightTags.length === 0}>
          <Icon name="sliders" />
          <span>{generateText.prompt.weightAdjust}{weightTags.length ? ` (${weightTags.length})` : ""}</span>
          <Icon name="chevronDown" className={clsx("prompt-tool-chevron", showWeights && "open")} />
        </button>
        <button type="button" className="prompt-tool-btn" onClick={() => void translatePrompt()} disabled={translating}>
          {translating ? generateText.prompt.translating : <><Icon name="globe" /> {generateText.prompt.translate}</>}
        </button>
        {translateBackup[promptKey] != null && (
          <button type="button" className="prompt-tool-btn" onClick={restoreTranslate} disabled={translating} title={generateText.prompt.restoreTitle}>
            <Icon name="sparkles" /> {generateText.prompt.restore}
          </button>
        )}
        <button type="button" className="prompt-tool-btn" onClick={() => setShowNormalize(true)} disabled={!promptValue.trim()}>
          <Icon name="sparkles" /> {generateText.prompt.normalize}
        </button>
        {promptTab === "positive" ? (
          <div className="prompt-inline-tool-pair">
            <button
              type="button"
              className={clsx("prompt-tool-btn", (settings?.autoComplete ?? true) && "tool-on")}
              title={generateText.prompt.autocompleteTitle}
              onClick={() => void toggleAutoComplete()}
            >
              <Icon name="bulb" /> {(settings?.autoComplete ?? true) ? generateText.prompt.autocompleteOn : generateText.prompt.autocompleteOff}
            </button>
            <PromptChunkControl
              value={effectivePositivePrompt}
              onApply={(value) => setLockedAwareParam("positivePrompt", value)}
              placement="top-right"
            />
          </div>
        ) : (
          <button
            type="button"
            className={clsx("prompt-tool-btn", (settings?.autoComplete ?? true) && "tool-on")}
            title={generateText.prompt.autocompleteTitle}
            onClick={() => void toggleAutoComplete()}
          >
            <Icon name="bulb" /> {(settings?.autoComplete ?? true) ? generateText.prompt.autocompleteOn : generateText.prompt.autocompleteOff}
          </button>
        )}
      </div>
      {showWeights && weightTags.length > 0 && (
        <div className="weight-editor">
          <div className="weight-editor-hint">{generateText.prompt.weightHint}</div>
          <div className="weight-tag-list">
            {weightTags.map((wt, i) => (
              <div key={`${wt.core}-${i}`} className={clsx("weight-tag", wt.level > 0 && "up", wt.level < 0 && "down")}>
                <button type="button" className="weight-btn" title={generateText.prompt.decreaseWeight} onClick={() => bumpWeight(i, -1)}><Icon name="minus" /></button>
                <span className="weight-tag-core" title={wt.raw}>
                  {wt.core || generateText.prompt.emptyTag}
                  {wt.level !== 0 && <em>{formatMultiplier(wt.level)}</em>}
                </span>
                <button type="button" className="weight-btn" title={generateText.prompt.increaseWeight} onClick={() => bumpWeight(i, 1)}><Icon name="plus" /></button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="prompt-helper">
        {settings?.autoComplete ?? true
          ? generateText.prompt.helperOn
          : generateText.prompt.helperOff}
      </div>
      <div className="token-counter">
        {tagCount > 0 && (
          <>
            <span>{tagCount} {generateText.prompt.tagUnit}</span>
            <span className={clsx(tokenWarn && "token-warn")}>
              ≈{tokenEst} tokens{tokenWarn ? <> <Icon name="warning" /> {generateText.prompt.tokenLimitExceeded}</> : ""}
            </span>
          </>
        )}
      </div>
      <QualityAndTransparencyControls />
      <div className="quick-actions">
        <Button onClick={() => setShowCharModal(true)}>
          <IconText icon="♙">{generateText.prompt.characterPrompt}{charCaptions.length > 0 ? ` · ${charCaptions.length}` : ""}</IconText>
        </Button>
        <Button onClick={() => setShowVibeModal(true)}>
          <IconText icon="◒">{generateText.prompt.vibeTransfer}{vibeImages.length > 0 ? ` · ${vibeImages.length}` : ""}</IconText>
        </Button>
        <Button onClick={() => setShowVibeModal(true)}>
          <IconText icon="◇">{generateText.prompt.preciseReference}{preciseRefCount > 0 ? ` · ${preciseRefCount}` : ""}</IconText>
        </Button>
        {templates.length > 0 && (
          <div className="template-dropdown" style={{ position: "relative" }}>
            <Button onClick={() => setShowTemplateMenu((v) => !v)}>
              <IconText icon="▣">{generateText.prompt.template}<Icon name="chevronDown" className={clsx("prompt-tool-chevron", showTemplateMenu && "open")} /></IconText>
            </Button>
            {showTemplateMenu && (
              <div className="menu-pop template-pop">
                {templates.map((tpl) => (
                  <button key={tpl.id} onClick={() => applyTemplate(tpl)}>
                    <span>{tpl.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {imageToImage && workbenchImage && !lockSizeToSource && (
        <div className="i2i-size-control">
          <div className="i2i-size-mode" role="group" aria-label={t("i2i.sizeMode")}>
            <button
              type="button"
              className={clsx(i2iSizeMode === "adaptive" && "active")}
              onClick={() => setI2ISizeMode("adaptive")}
            >
              {t("i2i.sizeAdaptive")}
            </button>
            <button
              type="button"
              className={clsx(i2iSizeMode === "custom" && "active")}
              onClick={() => setI2ISizeMode("custom")}
            >
              {t("i2i.sizeCustom")}
            </button>
          </div>
          <small>
            {i2iSizeMode === "adaptive"
              ? f("i2i.sizeAdaptivePath", {
                  source: `${workbenchImage.width}×${workbenchImage.height}`,
                  output: `${adaptiveI2ISize.width}×${adaptiveI2ISize.height}`,
                })
              : f("i2i.sizeCustomPath", { output: `${params.width}×${params.height}` })}
          </small>
        </div>
      )}
      {lockSizeToSource ? (
        workbenchImage && (
          <div className="inpaint-source-size" aria-label={t("inpaint.sourceSizeLocked")}>
            <Icon name="image" />
            <span>{t("inpaint.sourceSizeLocked")}</span>
            <strong>{workbenchImage.width}×{workbenchImage.height}</strong>
          </div>
        )
      ) : (
        <>
          <div className="size-row">
            <CommittedNumberInput
              label={generateText.prompt.width}
              value={params.width}
              min={NAI_MIN_DIMENSION}
              max={maxNAIDimensionFor(params.height)}
              step={NAI_DIMENSION_STEP}
              normalize={(value) =>
                snapNAIDimensionWithinArea(value, params.height, params.width)
              }
              onCommit={(value) => {
                if (imageToImage) setI2ISizeMode("custom");
                setParam("width", value);
              }}
            />
            <span>×</span>
            <CommittedNumberInput
              label={generateText.prompt.height}
              value={params.height}
              min={NAI_MIN_DIMENSION}
              max={maxNAIDimensionFor(params.width)}
              step={NAI_DIMENSION_STEP}
              normalize={(value) =>
                snapNAIDimensionWithinArea(value, params.width, params.height)
              }
              onCommit={(value) => {
                if (imageToImage) setI2ISizeMode("custom");
                setParam("height", value);
              }}
            />
          </div>
          <small className="dimension-input-hint">{t("size.commitHint")}</small>
          <div className="preset-row">
            {[
              [1024, 1024], [1216, 832], [832, 1216],
              [1024, 1536], [1536, 1024], [1472, 1472],
              [1088, 1920], [1920, 1088],
              [512, 768], [768, 512], [640, 640],
            ].map(([width, height]) => (
              <button
                key={`${width}x${height}`}
                onClick={() => {
                  if (imageToImage) setI2ISizeMode("custom");
                  setParam("width", width);
                  setParam("height", height);
                }}
              >
                {width}×{height}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="seed-mode-switch">
        <button
          type="button"
          className={clsx(params.seedMode === "random" && "active")}
          onClick={() => setParam("seedMode", "random")}
        >
          <Icon name="dice" /> {generateText.prompt.randomSeed}
        </button>
        <button
          type="button"
          className={clsx(params.seedMode === "fixed" && "active")}
          onClick={() => {
            setParam("seedMode", "fixed");
            if (params.seed <= 0) setParam("seed", Math.floor(Math.random() * MAX_NAI_SEED) + 1);
          }}
        >
          <Icon name="pin" /> {generateText.prompt.fixedSeed}
        </button>
      </div>
      {params.seedMode === "fixed" && (
        <div className="seed-row">
          <NumberInput label={generateText.prompt.fixedSeedValue} value={params.seed} min={1} max={MAX_NAI_SEED} onChange={(v) => setParam("seed", v)} />
          <Button
            className="seed-randomize-button"
            title={generateText.prompt.randomizeSeedTitle}
            onClick={() => setParam("seed", Math.floor(Math.random() * MAX_NAI_SEED) + 1)}
          >
            <Icon name="swap" />
          </Button>
        </div>
      )}
      {supportsNAIVariety(params.model) && (
        <label className="checkbox-line">
          <input type="checkbox" checked={params.variety} onChange={(e) => setParam("variety", e.target.checked)} />
          <span>{generateText.prompt.variety}</span>
        </label>
      )}
      {styleGroupPromptOpen && (
        <InputModal
          title={t("prompt.styleGroupCreate")}
          label={t("prompt.styleGroupName")}
          initial=""
          onConfirm={(value) => void createStylePromptGroup(value)}
          onClose={() => setStyleGroupPromptOpen(false)}
        />
      )}
      <Button className="full" onClick={() => setShowAdvanced(true)}>
        <IconText icon="settings">{generateText.prompt.advancedParams}</IconText>
      </Button>
      {showAdvanced && <AdvancedParamsModal onClose={() => setShowAdvanced(false)} />}
      {showVibeModal && <VibeTransferModal onClose={() => setShowVibeModal(false)} />}
      {showCharModal && <CharCaptionsModal onClose={() => setShowCharModal(false)} />}
      {showNormalize && (
        <PromptNormalizeModal
          value={promptValue}
          onApply={(next) => {
            setPromptValue(next);
            setShowNormalize(false);
            setToast(t("prompt.normalizedToast"));
          }}
          onClose={() => setShowNormalize(false)}
        />
      )}
    </>
  );
}

// ── Prompt standardization modal ──────────────────────────────────────────────
function PromptNormalizeModal({
  value,
  onApply,
  onClose,
}: {
  value: string;
  onApply: (next: string) => void;
  onClose: () => void;
}) {
  const language = useAppStore((state) => state.settings?.language);
  const [opts, setOpts] = useState<NormalizeOptions>(DEFAULT_NORMALIZE_OPTIONS);
  const preview = useMemo(() => normalizePrompt(value, opts), [value, opts]);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  return (
    <AppPortal>
      <div className="modal-backdrop" onMouseDown={onClose}>
        <div className="modal normalize-modal" onMouseDown={(e) => e.stopPropagation()}>
          <header>
            <h2>{t("normalize.title")}</h2>
            <button aria-label={t("common.close")} onClick={onClose}><Icon name="close" /></button>
          </header>
          <div className="normalize-body">
            <div className="normalize-options">
              {NORMALIZE_LABELS.map(({ key, label }) => (
                <label key={key} className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={opts[key]}
                    onChange={(e) => setOpts((o) => ({ ...o, [key]: e.target.checked }))}
                  />
                  <span>{t(`normalize.option.${key}`) || label}</span>
                </label>
              ))}
            </div>
            <div className="normalize-preview">
              <small>{t("normalize.preview")}</small>
              <div className="normalize-preview-box">{preview || t("normalize.empty")}</div>
            </div>
          </div>
          <footer>
            <Button onClick={onClose}>{t("common.cancel")}</Button>
            <Button variant="primary" disabled={!preview.trim()} onClick={() => onApply(preview)}>
              {t("common.apply")}
            </Button>
          </footer>
        </div>
      </div>
    </AppPortal>
  );
}

// ── Workbench image upload ────────────────────────────────────────────────────
function WorkbenchImageUpload() {
  const language = useAppStore((state) => state.settings?.language);
  const workbenchImage = useAppStore((state) => state.workbenchImage);
  const loadWorkbenchImage = useAppStore((state) => state.loadWorkbenchImage);
  const loadWorkbenchFromPath = useAppStore((state) => state.loadWorkbenchFromPath);
  const clearWorkbenchImage = useAppStore((state) => state.clearWorkbenchImage);
  const [dragging, setDragging] = useState(false);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
    setDragging(true);
  }

  async function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
    setDragging(false);
    const filePath = await droppedImagePath(event.dataTransfer);
    if (filePath) void loadWorkbenchFromPath(filePath);
  }

  return (
    <div
      className={clsx("wb-upload", dragging && "dragging")}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {workbenchImage ? (
        <>
          <img src={workbenchImage.fileUrl} alt={t("workbench.loadedAlt")} className="wb-thumb" />
          <small>
            {workbenchImage.width || t("common.unknown")} × {workbenchImage.height || t("common.unknown")}
          </small>
          <div className="row-actions tight">
          <Button className="full" onClick={loadWorkbenchImage}>
            <IconText icon="↻">{t("workbench.reload")}</IconText>
          </Button>
            <Button variant="ghost" onClick={() => void clearWorkbenchImage()}>
              <IconText icon="✕">{t("workbench.clear")}</IconText>
            </Button>
          </div>
        </>
      ) : (
        <Button className="full" onClick={loadWorkbenchImage}>
          <IconText icon={<Icon name="folderOpen" />}>{t("workbench.load")}</IconText>
        </Button>
      )}
      <small className="wb-drop-hint">{t("workbench.dropHint")}</small>
    </div>
  );
}

// ── Account + Run button ──────────────────────────────────────────────────────

function FeatureCostCard({
  label,
  feature,
}: {
  label: string;
  feature: AnlasQuoteFeature;
}) {
  const account = useAppStore((state) => state.account);
  const language = useAppStore((state) => state.settings?.language);
  const params = useAppStore((state) => state.params);
  const batchCount = useAppStore((state) => state.batchCount);
  const i2iParams = useAppStore((state) => state.i2iParams);
  const i2iSizeMode = useAppStore((state) => state.i2iSizeMode);
  const inpaintStrength = useAppStore((state) => state.inpaintStrength);
  const inpaintModel = useAppStore((state) => state.inpaintModel);
  const inpaintMask = useAppStore((state) => state.inpaintMask);
  const upscaleScale = useAppStore((state) => state.upscaleScale);
  const directorTool = useAppStore((state) => state.directorTool);
  const workbenchImage = useAppStore((state) => state.workbenchImage);
  const vibeCount = useAppStore((state) => state.vibeImages.length);
  const preciseCount = useAppStore((state) => state.preciseReferences.length);
  const isGenerating = useAppStore((state) => state.isGenerating);
  const currentAnlasSpent = useAppStore((state) => state.currentAnlasSpent);
  const lastAnlasSpent = useAppStore((state) => state.lastAnlasSpent);
  const [quote, setQuote] = useState<AnlasQuoteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const balance = account.anlasBalance;
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);
  const quoteKey = JSON.stringify({
    feature,
    model: params.model,
    width: params.width,
    height: params.height,
    steps: params.steps,
    smea: params.smea,
    smeaDyn: params.smeaDyn,
    batchCount,
    strength: i2iParams.strength,
    i2iSizeMode,
    inpaintStrength,
    inpaintModel,
    hasMask: Boolean(inpaintMask),
    upscaleScale,
    directorTool,
    workbenchPath: workbenchImage?.filePath ?? "",
    workbenchWidth: workbenchImage?.width ?? 0,
    workbenchHeight: workbenchImage?.height ?? 0,
    vibeCount,
    preciseCount,
    hasToken: account.hasToken,
    tierLevel: account.tierLevel,
    active: account.hasActiveSubscription,
    balance,
  });

  useEffect(() => {
    let cancelled = false;
    if (!account.hasToken) {
      setQuote(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = window.setTimeout(() => {
      const quoteSize = feature === "inpaint" && workbenchImage
        ? { width: workbenchImage.width, height: workbenchImage.height }
        : feature === "i2i" && i2iSizeMode === "adaptive" && workbenchImage
          ? adaptiveNAIImageSize(workbenchImage.width, workbenchImage.height, params)
          : { width: params.width, height: params.height };
      const quoteParams = {
        ...params,
        ...quoteSize,
        stylePrompt: "",
        positivePrompt: "quote",
        negativePrompt: "",
      };
      const extras = {
        vibeImages: Array.from({ length: vibeCount }, () => ({ base64: "", infoExtracted: 1, strength: 1 })),
        charCaptions: [],
        preciseReferences: Array.from({ length: preciseCount }, () => ({
          base64: "",
          type: "character" as const,
          strength: 1,
          fidelity: 1,
        })),
      };
      void window.naiDesktop
        .quoteAnlas({
          feature,
          params: quoteParams,
          extras,
          batchCount,
          i2iParams: { ...i2iParams, noise: 0 },
          inpaintStrength,
          inpaintNoise: 0,
          inpaintModel,
          maskBase64: inpaintMask,
          upscaleScale,
          directorTool,
          image: workbenchImage
            ? { width: workbenchImage.width, height: workbenchImage.height }
            : null,
          account,
        })
        .then((result) => {
          if (!cancelled) setQuote(result);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [quoteKey]);

  const sourceLabel =
    quote?.source === "official-api"
      ? t("cost.official")
      : quote?.source === "estimate-formula"
        ? t("cost.estimateFormula")
        : quote?.source === "estimate-fixed"
          ? t("cost.estimateFixed")
          : "";
  const isEstimate = quote?.source === "estimate-formula" || quote?.source === "estimate-fixed";
  const unavailableText =
    quote?.reason === "missing-token"
      ? t("cost.configureToken")
      : quote?.reason === "missing-image"
        ? t("cost.loadImageFirst")
        : quote?.reason === "missing-params"
          ? t("cost.invalidParams")
          : quote?.reason === "image-too-large"
            ? t("cost.imageTooLarge")
            : t("cost.unavailable");
  const primary =
    quote?.ok && typeof quote.amount === "number"
      ? quote.amount === 0
        ? t("cost.zero")
        : isEstimate
          ? f("cost.estimated", { amount: quote.amount })
          : f("cost.willSpend", { amount: quote.amount })
      : loading
        ? t("cost.loading")
        : unavailableText;
  const actualText = isGenerating
    ? currentAnlasSpent != null
      ? f("cost.currentSpent", { amount: currentAnlasSpent })
      : t("cost.waitingActual")
    : lastAnlasSpent != null
      ? f("cost.lastSpent", { amount: lastAnlasSpent })
      : t("cost.actualHint");

  return (
    <div
      className={clsx(
        "cost-row cost-card",
        isGenerating && "cost-live",
        quote?.amount === 0 && "cost-free",
        quote?.insufficient && "cost-warn",
        !loading && (!quote || !quote.ok) && "cost-card-unavailable",
      )}
    >
      <div>
        <span>{label}</span>
        <small>{sourceLabel || t("cost.readingHint")}</small>
      </div>
      <strong className="cost-primary">{primary}</strong>
      <small className="cost-balance">
        {f("cost.balance", { balance: balance ?? t("common.unknown") })}{account.stale ? t("cost.cached") : ""} · {actualText}
        {quote?.insufficient ? t("cost.insufficient") : ""}
      </small>
    </div>
  );
}

// Collapsible queue panel shown while a main-generate queue is running. Adapted
// to the app's compact left-footer style rather than a full-screen queue board.
function QueuePanel() {
  const queue = useAppStore((state) => state.generationQueue);
  const collapsed = useAppStore((state) => state.queueCollapsed);
  const toggleCollapsed = useAppStore((state) => state.toggleQueueCollapsed);
  const removeJob = useAppStore((state) => state.removeQueueJob);
  const clearQueue = useAppStore((state) => state.clearQueue);
  const progress = useAppStore((state) => state.queueProgress);
  const queuePaused = useAppStore((state) => state.queuePaused);
  const language = useAppStore((state) => state.settings?.language);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);

  const done = progress ? progress.done + progress.failed : 0;
  const total = progress?.total ?? 1 + queue.length;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  // Everything not yet done and not the single running image is "queued" — this
  // includes both manually-enqueued jobs AND the remaining initial-batch images.
  const queued = Math.max(0, total - done - 1);
  // The initial-batch remainder has no per-item snapshot; show it as a summary.
  const batchPending = Math.max(0, queued - queue.length);

  return (
    <div className="queue-panel">
      <div className="queue-panel-head">
        <span className="queue-panel-title">
          {t("queue.title")}{queued > 0 ? f("queue.queued", { count: queued }) : ""}
        </span>
        <div className="queue-panel-actions">
          {queued > 0 && (
            <button type="button" className="queue-mini-btn" onClick={() => clearQueue()}>
              {t("queue.clear")}
            </button>
          )}
          <button
            type="button"
            className="queue-mini-btn queue-collapse-btn"
            onClick={toggleCollapsed}
            aria-label={collapsed ? t("queue.expand") : t("queue.collapse")}
          >
            <Icon name="chevronRight" className={clsx("disclosure-chevron", !collapsed && "open")} />
          </button>
        </div>
      </div>
      <div className="queue-progressbar">
        <div className="queue-progressbar-fill" style={{ width: `${pct}%` }} />
      </div>
      {!collapsed && (
        <ul className="queue-list">
          <li className="queue-item queue-item-running">
            <span className="queue-spinner" />
            <span className="queue-item-label">
              {queuePaused ? t("queue.paused") : t("queue.running")}
            </span>
          </li>
          {queue.map((job) => (
            <li className="queue-item" key={job.id}>
              {job.quotePending ? <span className="queue-spinner" aria-hidden="true" /> : null}
              <span className="queue-item-label" title={job.label}>
                {job.label}{job.quotePending ? ` · ${t("queue.adding")}` : ""}
              </span>
              <span className="queue-item-time">
                {new Date(job.addedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <button
                type="button"
                className="queue-item-remove"
                onClick={() => removeJob(job.id)}
                aria-label={t("queue.remove")}
                title={t("queue.remove")}
              >
                <Icon name="close" />
              </button>
            </li>
          ))}
          {batchPending > 0 && (
            <li className="queue-item queue-item-batch">
              <span className="queue-item-label">{f("queue.batchPending", { count: batchPending })}</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

// Concurrent job tracker for convert/反推 — unlike QueuePanel above, there's no
// serial drain loop: every submission fires immediately, so more than one
// entry can be "processing" at once. Shared by both tools; each caller passes
// its own job list + collapse state from the store.
function TextToolQueuePanel({
  jobs,
  collapsed,
  onToggleCollapsed,
  onRemoveJob,
}: {
  jobs: TextToolJob[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onRemoveJob: (id: string) => void;
}) {
  const language = useAppStore((state) => state.settings?.language);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  if (jobs.length === 0) return null;
  const processingCount = jobs.filter((job) => job.status === "processing").length;
  return (
    <div className="queue-panel texttool-panel">
      <div className="queue-panel-head">
        <span className="queue-panel-title">
          {t("textTool.queueTitle")}
          {processingCount > 0 ? ` · ${processingCount}` : ""}
        </span>
        <div className="queue-panel-actions">
          <button
            type="button"
            className="queue-mini-btn queue-collapse-btn"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? t("queue.expand") : t("queue.collapse")}
          >
            <Icon name="chevronRight" className={clsx("disclosure-chevron", !collapsed && "open")} />
          </button>
        </div>
      </div>
      {!collapsed && (
        <ul className="queue-list">
          {jobs.map((job) => (
            <li className={clsx("queue-item", job.status === "processing" && "queue-item-running")} key={job.id}>
              {job.status === "processing" && <span className="queue-spinner" />}
              <span className="queue-item-label" title={job.message || job.result || job.label}>
                {job.status === "failed" ? <><Icon name="warning" /> {job.label}</> : job.status === "done" ? <><Icon name="check" /> {job.label}</> : job.label}
              </span>
              <span className="queue-item-time">
                {new Date(job.addedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <button
                type="button"
                className="queue-item-remove"
                onClick={() => onRemoveJob(job.id)}
                aria-label={t("queue.remove")}
                title={t("queue.remove")}
              >
                <Icon name="close" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Persisted convert/反推 history — reuses the same .queue-panel chrome, with
// its own (locally-collapsed-by-default) section rather than the shared
// queue-collapsed store flag, since browsing old results is secondary to
// watching active jobs.
function TextToolHistoryPanel({
  items,
  onDelete,
  onClear,
  onUse,
}: {
  items: TextToolHistoryItem[];
  onDelete: (id: string) => void;
  onClear: () => void;
  onUse: (result: string) => void;
}) {
  const language = useAppStore((state) => state.settings?.language);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const [collapsed, setCollapsed] = useState(true);
  if (items.length === 0) return null;
  return (
    <div className="queue-panel texttool-panel">
      <div className="queue-panel-head">
        <span className="queue-panel-title">
          {t("textTool.historyTitle")} · {items.length}
        </span>
        <div className="queue-panel-actions">
          <button
            type="button"
            className="queue-mini-btn"
            onClick={async () => {
              if (await confirmAction(t("textTool.historyClearConfirm"))) onClear();
            }}
          >
            {t("textTool.historyClear")}
          </button>
          <button
            type="button"
            className="queue-mini-btn queue-collapse-btn"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? t("queue.expand") : t("queue.collapse")}
          >
            <Icon name="chevronRight" className={clsx("disclosure-chevron", !collapsed && "open")} />
          </button>
        </div>
      </div>
      {!collapsed && (
        <ul className="queue-list">
          {items.map((item) => (
            <TextToolHistoryItemRow key={item.id} item={item} onDelete={onDelete} onUse={onUse} />
          ))}
        </ul>
      )}
    </div>
  );
}

// Collapsed by default so a long history list stays scannable — the
// namePrompt/featurePrompt pair (or single result) only renders once this
// specific record is expanded, not inline for every item at once.
function TextToolHistoryItemRow({
  item,
  onDelete,
  onUse,
}: {
  item: TextToolHistoryItem;
  onDelete: (id: string) => void;
  onUse: (result: string) => void;
}) {
  const language = useAppStore((state) => state.settings?.language);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const [expanded, setExpanded] = useState(false);
  const hasVariants = Boolean(item.variants && (item.variants.namePrompt.trim() || item.variants.featurePrompt.trim()));
  return (
    <li className="texttool-history-item">
      <div className="texttool-history-item-head">
        <span className="queue-item-time">
          {new Date(item.createdAt).toLocaleString("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <button
          type="button"
          className="queue-item-remove"
          onClick={() => onDelete(item.id)}
          aria-label={t("queue.remove")}
          title={t("queue.remove")}
        >
          <Icon name="close" />
        </button>
      </div>
      <button type="button" className="texttool-history-item-toggle" onClick={() => setExpanded((value) => !value)}>
        <span className="texttool-history-item-input">{item.input.trim() || item.result}</span>
        <Icon name="chevronRight" className={clsx("disclosure-chevron", expanded && "open")} />
      </button>
      {expanded &&
        (hasVariants ? (
          <PromptVariantCards variants={item.variants ?? null} onUse={onUse} />
        ) : (
          <button type="button" className="queue-mini-btn" onClick={() => onUse(item.result)}>
            {t("variant.use")}
          </button>
        ))}
    </li>
  );
}

// Settings section: configurable error-log path + open/view actions.
function LogSettingsSection({
  logDir,
  loggingEnabled,
  refreshSettings,
}: {
  logDir: string;
  loggingEnabled: boolean;
  refreshSettings: () => Promise<void>;
}) {
  const setToast = useAppStore((state) => state.setToast);
  const language = useAppStore((state) => state.settings?.language);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);
  const [info, setInfo] = useState<{ path: string; exists: boolean; sizeBytes: number } | null>(null);
  const refresh = useCallback(() => {
    void window.naiDesktop
      .getLogInfo()
      .then((i) => setInfo({ path: i.path, exists: i.exists, sizeBytes: i.sizeBytes }));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh, logDir]);

  const setDir = async (dir: string) => {
    await window.naiDesktop.setSetting("logDir", dir);
    await refreshSettings();
  };
  const choose = async () => {
    const dir = await window.naiDesktop.selectLogDir();
    if (dir) {
      await setDir(dir);
      setToast(t("log.updatedPath"));
    }
  };
  const openFile = async () => {
    const r = await window.naiDesktop.openLogFile();
    if (!r.ok) setToast(r.message || t("log.openFileFailed"));
  };
  const openDir = async () => {
    const r = await window.naiDesktop.openLogDir();
    if (!r.ok) setToast(r.message || t("log.openDirFailed"));
  };

  const toggleEnabled = async (v: boolean) => {
    await window.naiDesktop.setSetting("loggingEnabled", v);
    await refreshSettings();
    setToast(v ? t("log.enabled") : t("log.disabled"));
  };

  return (
    <>
      <Toggle
        checked={loggingEnabled}
        onChange={(v) => void toggleEnabled(v)}
        label={t("log.label")}
        description={t("log.desc")}
      />
      <label className="field">
        <span>{t("log.path")}</span>
        <input
          value={logDir}
          placeholder={t("log.placeholder")}
          disabled={!loggingEnabled}
          onChange={(e) => void setDir(e.target.value)}
        />
      </label>
      <p className="field-hint">
        {info ? (
          info.exists
            ? f("log.currentWithSize", { path: info.path, size: Math.max(1, Math.round(info.sizeBytes / 1024)) })
            : f("log.currentEmpty", { path: info.path })
        ) : ""}
      </p>
      <div className="row-actions">
        <Button onClick={choose}>
          <IconText icon={<Icon name="folder" />}>{t("log.chooseFolder")}</IconText>
        </Button>
        <Button onClick={openFile}>
          <IconText icon="↗">{t("log.openFile")}</IconText>
        </Button>
        <Button onClick={openDir}>
          <IconText icon="↗">{t("log.openDir")}</IconText>
        </Button>
        {logDir ? (
          <Button onClick={() => void setDir("")}>
            <IconText icon="↺">{t("log.reset")}</IconText>
          </Button>
        ) : null}
      </div>
    </>
  );
}

function AccountAndRunButton({
  label,
  onRun,
  openSettings,
  model,
  allowQueue = false,
  disabled = false,
  disabledReason = "",
}: {
  label: string;
  onRun: () => void;
  openSettings: () => void;
  model?: string;
  allowQueue?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const account = useAppStore((state) => state.account);
  const language = useAppStore((state) => state.settings?.language);
  const isGenerating = useAppStore((state) => state.isGenerating);
  const cancel = useAppStore((state) => state.cancel);
  const togglePause = useAppStore((state) => state.togglePause);
  const queuePaused = useAppStore((state) => state.queuePaused);
  const generationQueueLength = useAppStore((state) => state.generationQueue.length);
  const queueAdding = useAppStore((state) => state.queueAdding);
  const enqueueGeneration = useAppStore((state) => state.enqueueGeneration);
  const currentAnlasSpent = useAppStore((state) => state.currentAnlasSpent);
  const refreshAccount = useAppStore((state) => state.refreshAccount);
  const [refreshingAccount, setRefreshingAccount] = useState(false);
  const [showOpusUsage, setShowOpusUsage] = useState(
    () => new URLSearchParams(window.location.search).get("uiCapture") === "opusUsage",
  );
  const [accountDetailsCollapsed, setAccountDetailsCollapsed] = useState(
    () => localStorage.getItem("langbai.account-details-collapsed") === "1",
  );
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);
  const showV5Allowance = account.tierLevel === 3 && Boolean(model && isNAIV5Model(model));
  const usagePercent = account.opusUsage
    ? Math.round(Math.min(100, Math.max(0, account.opusUsage.isNegative ? 0 : account.opusUsage.percent)) * 10) / 10
    : null;
  const remainingImages = usagePercent === null ? null : Math.round(17.3 * usagePercent);
  const refillPercent = account.opusUsage && account.opusUsage.timeUntilNextPercent > 0
    ? Math.round((86_400 / account.opusUsage.timeUntilNextPercent) * 10) / 10
    : null;
  const refillImages = refillPercent === null ? null : Math.round(17.3 * refillPercent);
  async function refreshBalance() {
    setRefreshingAccount(true);
    try {
      await refreshAccount();
    } finally {
      setRefreshingAccount(false);
    }
  }
  function toggleAccountDetails() {
    setAccountDetailsCollapsed((collapsed) => {
      const next = !collapsed;
      localStorage.setItem("langbai.account-details-collapsed", next ? "1" : "0");
      return next;
    });
  }
  return (
    <div className="left-footer">
      <div className={clsx("account-details-shell", accountDetailsCollapsed && "collapsed")}>
        <button
          type="button"
          className="account-details-toggle"
          onClick={toggleAccountDetails}
          aria-expanded={!accountDetailsCollapsed}
          aria-label={accountDetailsCollapsed ? t("account.expandDetails") : t("account.collapseDetails")}
          title={accountDetailsCollapsed ? t("account.expandDetails") : t("account.collapseDetails")}
        >
          <span className="account-details-toggle-copy">
            <strong>{account.hasToken ? account.tierName ?? t("account.configured") : t("account.notSet")}</strong>
            <small>{f("account.anlas", { balance: account.anlasBalance ?? t("common.unknown") })}</small>
          </span>
          <Icon name="chevronRight" className={clsx("disclosure-chevron", !accountDetailsCollapsed && "open")} />
        </button>
        {!accountDetailsCollapsed && (
          <div className="account-details-content">
            <div className="account-mini">
              <div>
                <strong>{account.hasToken ? account.tierName ?? t("account.configured") : t("account.notSet")}</strong>
                <small>
                  {f("account.anlas", { balance: account.anlasBalance ?? t("common.unknown") })}
                  {account.expiresAt ? f("account.expires", { date: account.expiresAt }) : ""}
                </small>
              </div>
              <button type="button" onClick={() => void refreshBalance()} disabled={!account.hasToken || refreshingAccount}>
                {refreshingAccount ? t("account.refreshing") : t("account.refresh")}
              </button>
            </div>
            {showV5Allowance && (
              <button
                type="button"
                className={`account-opus-usage${account.stale ? " stale" : ""}`}
                aria-label={account.stale ? t("opusUsage.stale") : t("opusUsage.open")}
                onClick={() => setShowOpusUsage(true)}
              >
                <span className="account-opus-main">
                  <span className="account-opus-label">V5</span>
                  <span className="account-opus-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={usagePercent ?? 0}>
                    <span style={{ width: `${usagePercent ?? 0}%` }} />
                  </span>
                  <strong>{usagePercent === null ? "--" : `${usagePercent}%`}</strong>
                  <em>{remainingImages === null ? t("opusUsage.unavailable") : f("opusUsage.compactImages", { images: remainingImages })}</em>
                </span>
                <small className="account-opus-explanation">
                  {refillPercent === null || refillImages === null
                    ? t("opusUsage.compactRule")
                    : f("opusUsage.compactExplanation", { percent: refillPercent, images: refillImages })}
                </small>
              </button>
            )}
          </div>
        )}
      </div>
      {!account.hasToken ? (
        <Button variant="primary" className="full" onClick={openSettings}>
          <IconText icon={<Icon name="key" />}>{t("account.setupFirst")}</IconText>
        </Button>
      ) : (
        <div className="run-state-swap">
          <div
            className={clsx("run-state-pane", isGenerating && "active")}
            aria-hidden={!isGenerating}
            inert={!isGenerating}
          >
            <div className="run-state-pane-inner">
              {allowQueue && <QueuePanel />}
              <div className="anlas-spent">
                {currentAnlasSpent != null ? f("account.currentSpent", { amount: currentAnlasSpent }) : t("account.currentReading")}
              </div>
              {allowQueue ? (
                <Button
                  variant="primary"
                  className="full queue-add-button"
                  onClick={() => void enqueueGeneration()}
                  disabled={queueAdding}
                >
                  {queueAdding
                    ? t("account.addingQueueCost")
                    : generationQueueLength > 0
                      ? f("account.addQueueWaiting", { count: generationQueueLength })
                      : t("account.addQueue")}
                </Button>
              ) : null}
              <div className={clsx("run-button-row", !allowQueue && "single-action")}>
                {allowQueue ? (
                  <Button variant="secondary" className="run-row-btn" onClick={togglePause}>
                    {queuePaused ? t("account.resume") : t("account.pause")}
                  </Button>
                ) : null}
                <Button variant="danger" className="run-row-btn" onClick={() => void cancel()}>
                  {t("account.stop")}
                </Button>
              </div>
            </div>
          </div>
          <div
            className={clsx("run-state-pane", !isGenerating && "active")}
            aria-hidden={isGenerating}
            inert={isGenerating}
          >
            <div className="run-state-pane-inner">
              {disabled && disabledReason ? <div className="run-disabled-reason">{disabledReason}</div> : null}
              <Button variant="primary" className="full" onClick={onRun} disabled={disabled}>
                <IconText icon="▶">{label}</IconText>
              </Button>
            </div>
          </div>
        </div>
      )}
      {showV5Allowance && showOpusUsage && <OpusUsageDialog onClose={() => setShowOpusUsage(false)} />}
    </div>
  );
}

// ── Generate panel (T2I) ──────────────────────────────────────────────────────
function GeneratePanel({ openSettings }: { openSettings: () => void }) {
  const language = useAppStore((state) => state.settings?.language);
  const generate = useAppStore((state) => state.generate);
  const batchCount = useAppStore((state) => state.batchCount);
  const setBatchCount = useAppStore((state) => state.setBatchCount);
  const batchIntervalSeconds = useAppStore((state) => state.batchIntervalSeconds);
  const setBatchIntervalSeconds = useAppStore((state) => state.setBatchIntervalSeconds);
  const fileNamePrefix = useAppStore((state) => state.params.fileNamePrefix);
  const model = useAppStore((state) => state.params.model);
  const setParam = useAppStore((state) => state.setParam);
  const groups = useAppStore((state) => state.historyGroups);
  const generationGroupId = useAppStore((state) => state.generationGroupId);
  const setGenerationGroupId = useAppStore((state) => state.setGenerationGroupId);
  const createGenerationGroup = useAppStore((state) => state.createGenerationGroup);
  const [newGroupName, setNewGroupName] = useState("");
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);

  return (
    <>
      <div className="panel-scroll">
        <PromptAndParams />
        <CommittedNumberInput label={t("generate.batchCount")} value={batchCount} min={1} max={999} normalize={(value) => Math.max(1, Math.min(999, Math.round(value)))} onCommit={setBatchCount} />
        <CommittedNumberInput
          label={t("generate.batchInterval")}
          value={batchIntervalSeconds}
          min={0}
          max={3600}
          normalize={(value) => Math.max(0, Math.min(3600, Math.round(value)))}
          onCommit={setBatchIntervalSeconds}
        />
        <small className="field-hint">{t("generate.batchIntervalHint")}</small>
        <label className="field">
          <span>{t("generate.fileNamePrefix")}</span>
          <input
            value={fileNamePrefix}
            placeholder={t("generate.fileNamePlaceholder")}
            onChange={(e) => setParam("fileNamePrefix", e.target.value)}
          />
        </label>
        <div className="field">
          <span>{t("generate.historyGroup")}</span>
          <SelectMenu
            value={groups.some((group) => group.id === generationGroupId) ? generationGroupId : ""}
            ariaLabel={t("generate.historyGroup")}
            options={[
              { value: "", label: t("history.ungrouped") },
              ...groups.map((group) => ({ value: group.id, label: group.name })),
            ]}
            onChange={(value) => void setGenerationGroupId(value)}
          />
        </div>
        <div className="history-group-create generation-group-create">
          <input
            value={newGroupName}
            placeholder={t("history.newGroup")}
            onChange={(event) => setNewGroupName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              const name = newGroupName.trim();
              if (!name) return;
              void createGenerationGroup(name);
              setNewGroupName("");
            }}
          />
          <button
            type="button"
            disabled={!newGroupName.trim()}
            onClick={() => {
              const name = newGroupName.trim();
              if (!name) return;
              void createGenerationGroup(name);
              setNewGroupName("");
            }}
          >
            {t("history.create")}
          </button>
        </div>
        <p className="wildcard-hint">
          <Icon name="bulb" /> {f("generate.wildcardHint", { example: "{red|blue|green} hair", tag: "{tag}" })}
        </p>
        <FeatureCostCard label={t("cost.beforeRun")} feature="generate" />
      </div>
      <AccountAndRunButton
        label={batchCount > 1 ? f("generate.batchRun", { count: batchCount }) : t("generate.run")}
        onRun={() => void generate()}
        openSettings={openSettings}
        model={model}
        allowQueue
      />
    </>
  );
}

// ── I2I panel ─────────────────────────────────────────────────────────────────
function I2IPanel({ openSettings }: { openSettings: () => void }) {
  const language = useAppStore((state) => state.settings?.language);
  const i2iParams = useAppStore((state) => state.i2iParams);
  const batchCount = useAppStore((state) => state.batchCount);
  const model = useAppStore((state) => state.params.model);
  const setI2IParam = useAppStore((state) => state.setI2IParam);
  const i2iSourceMode = useAppStore((state) => state.i2iSourceMode);
  const setI2ISourceMode = useAppStore((state) => state.setI2ISourceMode);
  const setBatchCount = useAppStore((state) => state.setBatchCount);
  const batchIntervalSeconds = useAppStore((state) => state.batchIntervalSeconds);
  const setBatchIntervalSeconds = useAppStore((state) => state.setBatchIntervalSeconds);
  const generateI2I = useAppStore((state) => state.generateI2I);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);
  return (
    <>
      <div className="panel-scroll">
        <WorkbenchImageUpload />
        <div className="field">
          <span>生成后下次重绘使用</span>
          <div className="mode-buttons i2i-source-policy" role="group" aria-label="下次重绘来源">
            <Button variant={i2iSourceMode === "original" ? "primary" : "secondary"} onClick={() => setI2ISourceMode("original")}>始终使用原图</Button>
            <Button variant={i2iSourceMode === "latest" ? "primary" : "secondary"} onClick={() => setI2ISourceMode("latest")}>使用最新结果</Button>
          </div>
          <small className="field-hint">生成后自动打开原图/结果对比；选择原图可连续尝试而无需重复加载。</small>
        </div>
        <SliderInput label={t("i2i.strength")} value={i2iParams.strength} min={0} max={1} step={0.01} onChange={(v) => setI2IParam("strength", v)} />
        <NumberInput label={t("i2i.extraNoiseSeed")} value={i2iParams.extraNoiseSeed} min={0} onChange={(v) => setI2IParam("extraNoiseSeed", v)} />
        <div className="panel-divider" />
        <PromptAndParams imageToImage />
        <CommittedNumberInput label={t("generate.batchCount")} value={batchCount} min={1} max={999} normalize={(value) => Math.max(1, Math.min(999, Math.round(value)))} onCommit={setBatchCount} />
        <CommittedNumberInput
          label={t("generate.batchInterval")}
          value={batchIntervalSeconds}
          min={0}
          max={3600}
          normalize={(value) => Math.max(0, Math.min(3600, Math.round(value)))}
          onCommit={setBatchIntervalSeconds}
        />
        <small className="field-hint">{t("generate.batchIntervalHint")}</small>
        <FeatureCostCard label={t("cost.beforeRun")} feature="i2i" />
      </div>
      <AccountAndRunButton
        label={batchCount > 1 ? f("generate.batchRun", { count: batchCount }) : t("i2i.run")}
        onRun={() => void generateI2I()}
        openSettings={openSettings}
        model={model}
      />
    </>
  );
}

// ── Inpaint panel ─────────────────────────────────────────────────────────────
function InpaintPanel({ openSettings }: { openSettings: () => void }) {
  const language = useAppStore((state) => state.settings?.language);
  const inpaintSourceMode = useAppStore((state) => state.inpaintSourceMode);
  const setInpaintSourceMode = useAppStore((state) => state.setInpaintSourceMode);
  const inpaintPositivePrompt = useAppStore((state) => state.inpaintPositivePrompt);
  const setInpaintPositivePrompt = useAppStore((state) => state.setInpaintPositivePrompt);
  const inpaintModel = useAppStore((state) => state.inpaintModel);
  const setInpaintModel = useAppStore((state) => state.setInpaintModel);
  const inpaintStrength = useAppStore((state) => state.inpaintStrength);
  const setInpaintStrength = useAppStore((state) => state.setInpaintStrength);
  const brushSize = useAppStore((state) => state.brushSize);
  const setBrushSize = useAppStore((state) => state.setBrushSize);
  const brushOpacity = useAppStore((state) => state.brushOpacity);
  const setBrushOpacity = useAppStore((state) => state.setBrushOpacity);
  const brushColor = useAppStore((state) => state.brushColor);
  const setBrushColor = useAppStore((state) => state.setBrushColor);
  const brushMode = useAppStore((state) => state.brushMode);
  const setBrushMode = useAppStore((state) => state.setBrushMode);
  const brushShape = useAppStore((state) => state.brushShape);
  const setBrushShape = useAppStore((state) => state.setBrushShape);
  const clearInpaintMask = useAppStore((state) => state.clearInpaintMask);
  const inpaint = useAppStore((state) => state.inpaint);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  return (
    <>
      <div className="panel-scroll">
        <WorkbenchImageUpload />
        <div className="field">
          <span>生成后下次重绘使用</span>
          <div className="mode-buttons i2i-source-policy" role="group" aria-label="下次局部重绘来源">
            <Button variant={inpaintSourceMode === "original" ? "primary" : "secondary"} onClick={() => void setInpaintSourceMode("original")}>始终使用原图</Button>
            <Button variant={inpaintSourceMode === "latest" ? "primary" : "secondary"} onClick={() => void setInpaintSourceMode("latest")}>使用最新结果</Button>
          </div>
          <small className="field-hint">默认保留最初加载的图片连续重绘；切换来源时会清空旧蒙版，完成后自动打开前后对比。</small>
        </div>
        <label className="field">
          <span>{t("inpaint.model")}</span>
          <select value={inpaintModel} onChange={(e) => setInpaintModel(e.target.value as typeof inpaintModel)}>
            {NAI_INPAINT_MODELS.map((m) => (
              <option value={m.value} key={m.value}>{localizedDesktopOptionLabel(language, m.value, m.label)}</option>
            ))}
          </select>
        </label>
        <Button
          className="full"
          variant="ghost"
          onClick={() => {
            setInpaintModel("nai-diffusion-5-full-inpainting");
            setInpaintStrength(1);
            setBrushSize(4);
            setBrushOpacity(0.55);
            setBrushColor("#ffffff");
            setBrushMode("paint");
            setBrushShape("round");
          }}
        >
          <IconText icon={<Icon name="refresh" />}>{t("inpaint.restoreDefaults")}</IconText>
        </Button>
        <SliderInput label={t("inpaint.strength")} value={inpaintStrength} min={0.1} max={1} step={0.01} onChange={setInpaintStrength} />
        <small className={clsx(
          "field-hint inpaint-strength-hint",
          inpaintStrength < 0.6 && "warning",
        )}>
          {t(
            inpaintStrength < 0.6
              ? "inpaint.strengthLowHint"
              : inpaintStrength > 0.9
                ? "inpaint.strengthFullHint"
                : "inpaint.strengthHighHint",
          )}
        </small>
        <SliderInput
          label={t("inpaint.brushSize")}
          value={brushSize}
          min={INPAINT_BRUSH_SLIDER_MIN}
          max={INPAINT_BRUSH_SLIDER_MAX}
          step={1}
          onChange={setBrushSize}
        />
        <SliderInput label={t("inpaint.brushOpacity")} value={brushOpacity} min={0.05} max={1} step={0.01} onChange={setBrushOpacity} />
        <div className="field inpaint-color-field">
          <span>{t("inpaint.brushColor")}</span>
          <div className="inpaint-color-palette" role="group" aria-label={t("inpaint.brushColor")}>
            {["#ffffff", "#000000", "#ef4444", "#7c3aed", "#06b6d4", "#22c55e", "#f59e0b"].map((color) => <button key={color} type="button" className={brushColor === color ? "active" : ""} style={{ backgroundColor: color }} aria-label={`${t("inpaint.brushColor")} ${color}`} aria-pressed={brushColor === color} title={color} onClick={() => setBrushColor(color)} />)}
          </div>
        </div>
        <div className="mode-buttons">
          <Button variant={brushMode === "paint" ? "primary" : "secondary"} onClick={() => setBrushMode("paint")}>
            <IconText icon={<Icon name="brush" />}>{t("inpaint.paintBrush")}</IconText>
          </Button>
          <Button variant={brushMode === "erase" ? "primary" : "secondary"} onClick={() => setBrushMode("erase")}>
            <IconText icon={<Icon name="eraser" />}>{t("inpaint.eraser")}</IconText>
          </Button>
        </div>
        <div className="mode-buttons inpaint-shape-panel-buttons">
          <Button variant={brushShape === "round" ? "primary" : "secondary"} onClick={() => setBrushShape("round")}>
            <span className="inpaint-shape-button-label"><span className="inpaint-shape-swatch round" />{t("inpaint.roundBrush")}</span>
          </Button>
          <Button variant={brushShape === "square" ? "primary" : "secondary"} onClick={() => setBrushShape("square")}>
            <span className="inpaint-shape-button-label"><span className="inpaint-shape-swatch square" />{t("inpaint.squareBrush")}</span>
          </Button>
        </div>
        <small className="field-hint">{t("inpaint.precisionHint")}</small>
        <Button className="full" onClick={clearInpaintMask}>
          <IconText icon={<Icon name="clear" />}>{t("inpaint.clearMask")}</IconText>
        </Button>
        <div className="panel-divider" />
        <PromptAndParams
          includeModel={false}
          lockSizeToSource
          promptOverride={{ value: inpaintPositivePrompt, onChange: setInpaintPositivePrompt }}
        />
        <FeatureCostCard label={t("cost.beforeRun")} feature="inpaint" />
      </div>
      <AccountAndRunButton label={t("inpaint.run")} onRun={() => void inpaint()} openSettings={openSettings} />
    </>
  );
}

// ── Upscale panel ─────────────────────────────────────────────────────────────
function UpscalePanel({ openSettings }: { openSettings: () => void }) {
  const language = useAppStore((state) => state.settings?.language);
  const workbenchImage = useAppStore((state) => state.workbenchImage);
  const scale = useAppStore((state) => state.upscaleScale);
  const setScale = useAppStore((state) => state.setUpscaleScale);
  const upscale = useAppStore((state) => state.upscaleCurrentImage);
  const preparedSize = workbenchImage
    ? fitSizeWithinPixels(workbenchImage.width, workbenchImage.height, MAX_NAI_UPSCALE_INPUT_PIXELS)
    : null;
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);
  return (
    <>
      <div className="panel-scroll">
        <WorkbenchImageUpload />
        <small className="field-hint">超分只负责扩大输出并补足清晰度，不进行第二次创意扩散；画面变化通常小于“增强”。2×/4×会直接改变分辨率。</small>
        <div className="scale-buttons">
          <Button variant={scale === 2 ? "primary" : "secondary"} onClick={() => setScale(2)}>2×</Button>
          <Button variant={scale === 4 ? "primary" : "secondary"} onClick={() => setScale(4)}>4×</Button>
        </div>
        {workbenchImage && (
          <div className={clsx("info-card", preparedSize?.resized && "limit-card")}>
            <strong>{t("upscale.sizeEstimate")}</strong>
            <span>
              {preparedSize?.resized
                ? `${workbenchImage.width}×${workbenchImage.height} → ${t("upscale.preResize")} ${preparedSize.width}×${preparedSize.height} → ${preparedSize.width * scale}×${preparedSize.height * scale}`
                : `${workbenchImage.width}×${workbenchImage.height} → ${workbenchImage.width * scale}×${workbenchImage.height * scale}`}
            </span>
            {preparedSize?.resized ? (
              <small>{t("upscale.resizeHint")}</small>
            ) : null}
          </div>
        )}
        <FeatureCostCard label={t("cost.beforeRun")} feature="upscale" />
      </div>
      <AccountAndRunButton label={f("upscale.run", { scale })} onRun={() => void upscale()} openSettings={openSettings} />
    </>
  );
}

function EnhancePanel({ openSettings }: { openSettings: () => void }) {
  const workbenchImage = useAppStore((state) => state.workbenchImage);
  const params = useAppStore((state) => state.params);
  const i2iParams = useAppStore((state) => state.i2iParams);
  const i2iSizeMode = useAppStore((state) => state.i2iSizeMode);
  const applyParams = useAppStore((state) => state.applyParams);
  const setI2IParam = useAppStore((state) => state.setI2IParam);
  const setI2ISizeMode = useAppStore((state) => state.setI2ISizeMode);
  const generateI2I = useAppStore((state) => state.generateI2I);
  const [magnitude, setMagnitude] = useState(3);
  const [enhanceScale, setEnhanceScale] = useState<1 | 2>(1);

  async function runEnhance() {
    if (!workbenchImage) return;
    const previous = { width: params.width, height: params.height, strength: i2iParams.strength, noise: i2iParams.noise, sizeMode: i2iSizeMode };
    const target = adaptiveNAIImageSize(workbenchImage.width * enhanceScale, workbenchImage.height * enhanceScale, params);
    setI2ISizeMode("custom");
    applyParams({ width: target.width, height: target.height });
    // Official Enhance is prompt-aware, but conservative defaults must keep the
    // source pose/composition. The old 0.50/0.225 midpoint behaved like a
    // redraw and routinely replaced limbs, expressions and framing.
    setI2IParam("strength", Math.min(0.48, 0.10 + magnitude * 0.034));
    setI2IParam("noise", Math.min(0.22, 0.018 + magnitude * 0.014));
    try {
      await generateI2I();
    } finally {
      applyParams({ width: previous.width, height: previous.height });
      setI2IParam("strength", previous.strength);
      setI2IParam("noise", previous.noise);
      setI2ISizeMode(previous.sizeMode);
    }
  }

  const target = workbenchImage ? adaptiveNAIImageSize(workbenchImage.width * enhanceScale, workbenchImage.height * enhanceScale, params) : null;
  return (
    <>
      <div className="panel-scroll">
        <WorkbenchImageUpload />
        <SliderInput label={`增强幅度 ${magnitude}`} value={magnitude} min={1} max={10} step={1} onChange={setMagnitude} />
        <small className="field-hint">增强会使用当前正面、风格与负面提示词。默认采用保守强度以保留姿势和构图；提高幅度仍可能改变局部结构。</small>
        <div className="field">
          <span>输出倍率</span>
          <div className="scale-buttons">
            <Button variant={enhanceScale === 1 ? "primary" : "secondary"} onClick={() => setEnhanceScale(1)}>1× 保持分辨率</Button>
            <Button variant={enhanceScale === 2 ? "primary" : "secondary"} onClick={() => setEnhanceScale(2)}>2× 同时放大</Button>
          </div>
        </div>
        {workbenchImage && target ? <div className="info-card"><strong>输出尺寸</strong><span>{workbenchImage.width}×{workbenchImage.height} → {target.width}×{target.height}</span><small>1×只做二次扩散增强；2×会改变分辨率。尺寸会按 NovelAI 支持范围自动对齐。</small></div> : null}
        <FeatureCostCard label="生成前扣费" feature="i2i" />
      </div>
      <AccountAndRunButton label={`增强图像 ${enhanceScale}×`} onRun={() => void runEnhance()} openSettings={openSettings} />
    </>
  );
}

// ── Director Tools panel ──────────────────────────────────────────────────────
function DirectorPanel({ openSettings }: { openSettings: () => void }) {
  const language = useAppStore((state) => state.settings?.language);
  const workbenchImage = useAppStore((state) => state.workbenchImage);
  const tool = useAppStore((state) => state.directorTool);
  const setTool = useAppStore((state) => state.setDirectorTool);
  const options = useAppStore((state) => state.augmentOptions);
  const setOption = useAppStore((state) => state.setAugmentOption);
  const run = useAppStore((state) => state.runDirectorTool);
  const preparedSize = workbenchImage
    ? fitSizeWithinPixels(workbenchImage.width, workbenchImage.height, MAX_NAI_DIRECTOR_INPUT_PIXELS)
    : null;
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);
  return (
    <>
      <div className="panel-scroll">
        <WorkbenchImageUpload />
        <div className="director-tools">
          {DIRECTOR_TOOLS.map((item) => (
            <button className={clsx(tool === item.value && "active")} key={item.value} onClick={() => setTool(item.value)}>
              {localizedDesktopOptionLabel(language, item.value, item.label)}
            </button>
          ))}
        </div>
        {tool === "colorize" && (
          <label className="field">
            <span>{t("director.colorizePrompt")}</span>
            <input value={options.colorizePrompt} placeholder={t("director.colorizePlaceholder")} onChange={(e) => setOption("colorizePrompt", e.target.value)} />
          </label>
        )}
        {tool === "emotion" && (
          <>
            <label className="field">
              <span>{t("director.emotion")}</span>
              <select value={options.emotion} onChange={(e) => setOption("emotion", e.target.value as typeof options.emotion)}>
                {EMOTION_OPTIONS.map((em) => (
                  <option value={em.value} key={em.value}>{localizedDesktopOptionLabel(language, em.value, em.label)}</option>
                ))}
              </select>
            </label>
            <SliderInput label={t("director.emotionLevel")} value={options.emotionLevel} min={0} max={5} step={1} onChange={(v) => setOption("emotionLevel", v)} />
          </>
        )}
        <SliderInput label={t("director.defry")} value={options.defry} min={0} max={5} step={1} onChange={(v) => setOption("defry", v)} />
        {workbenchImage && preparedSize?.resized ? (
          <div className="info-card limit-card">
            <strong>{t("director.sizeProtection")}</strong>
            <span>
              {f("director.sizeProtectionPath", {
                source: `${workbenchImage.width}×${workbenchImage.height}`,
                prepared: `${preparedSize.width}×${preparedSize.height}`,
              })}
            </span>
            <small>{t("director.sizeProtectionHint")}</small>
          </div>
        ) : null}
        <FeatureCostCard label={t("cost.beforeRun")} feature="director" />
      </div>
      <AccountAndRunButton label={t("director.run")} onRun={() => void run()} openSettings={openSettings} />
    </>
  );
}

function PostprocessPanel({ openSettings }: { openSettings: () => void }) {
  const [mode, setMode] = useState<"upscale" | "director">("upscale");
  const setActiveCanvasSurface = useAppStore((state) => state.setActiveCanvasSurface);
  useEffect(() => {
    setActiveCanvasSurface(mode === "upscale" ? "postprocess:upscale" : "postprocess:director");
  }, [mode, setActiveCanvasSurface]);
  return (
    <>
      <div className="postprocess-mode-switcher" role="tablist" aria-label="后期工具">
        <button className={clsx(mode === "upscale" && "active")} onClick={() => setMode("upscale")}>超分</button>
        <button className={clsx(mode === "director" && "active")} onClick={() => setMode("director")}>导演工具</button>
      </div>
      {mode === "upscale"
        ? <UpscalePanel openSettings={openSettings} />
        : <DirectorPanel openSettings={openSettings} />}
    </>
  );
}

// ── Inspect panel (AI 反推提示词) ─────────────────────────────────────────────
// Per-mode system-prompt template editor (used in both 反推 and 转换 settings).
function ModeTemplateEditor({
  value,
  defaults,
  onChange,
  title,
}: {
  value: ModePromptTemplates;
  defaults: ModePromptTemplates;
  onChange: (next: ModePromptTemplates) => void;
  title?: string;
}) {
  const language = useAppStore((state) => state.settings?.language);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);
  const [mode, setMode] = useState<ReversePromptMode>("tags");
  const labels: [ReversePromptMode, string][] = [
    ["tags", t("mode.tags")],
    ["natural", t("mode.natural")],
    ["mixed", t("mode.mixed")],
  ];
  const override = value?.[mode]?.trim() ?? "";
  const defaultText = defaults[mode] ?? "";
  const isCustom = override.length > 0 && override !== defaultText.trim();
  // Show the built-in default text when there's no override, so it's never hidden.
  const shown = override.length > 0 ? value[mode] : defaultText;
  const activeModeLabel = labels.find(([v]) => v === mode)?.[1] ?? t("mode.tags");
  return (
    <div className="field">
      <span className="field-label-row">
        <strong>{title ?? t("template.editorTitle")}</strong>
        {t("template.modeSeparated")}
        <span className={clsx("tpl-state", isCustom && "custom")}>{isCustom ? t("template.custom") : t("template.default")}</span>
      </span>
      <div className="mode-selector" style={{ marginBottom: 8 }}>
        {labels.map(([val, label]) => (
          <button
            key={val}
            type="button"
            className={clsx("mode-btn", mode === val && "active")}
            onClick={() => setMode(val)}
          >
            {label}
          </button>
        ))}
      </div>
      <textarea
        className="prompt-box"
        style={{ minHeight: 160 }}
        value={shown}
        onChange={(e) => onChange({ ...value, [mode]: e.target.value })}
      />
      <div className="tpl-actions">
        <button
          type="button"
          className="prompt-tool-btn"
          disabled={override.length > 0 && !isCustom}
          title={t("template.restoreModeTitle")}
          onClick={() => onChange({ ...value, [mode]: defaultText })}
        >
          {f("template.restoreMode", { mode: activeModeLabel })}
        </button>
      </div>
      <small className="settings-hint">{t("template.modeHint")}</small>
    </div>
  );
}

function SingleTemplateEditor({
  value,
  defaultValue,
  onChange,
  title,
  description,
}: {
  value: string;
  defaultValue: string;
  onChange: (next: string) => void;
  title: string;
  description?: string;
}) {
  const language = useAppStore((state) => state.settings?.language);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const override = value?.trim() ?? "";
  const isCustom = override.length > 0 && override !== defaultValue.trim();
  const shown = override.length > 0 ? value : defaultValue;
  return (
    <div className="field">
      <span className="field-label-row">
        <strong>{title}</strong>
        {description}
        <span className={clsx("tpl-state", isCustom && "custom")}>{isCustom ? t("template.custom") : t("template.default")}</span>
      </span>
      <textarea
        className="prompt-box"
        style={{ minHeight: 180 }}
        value={shown}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="tpl-actions">
        <button
          type="button"
          className="prompt-tool-btn"
          disabled={override.length > 0 && !isCustom}
          title={t("template.restoreTitle")}
          onClick={() => onChange(defaultValue)}
        >
          {t("template.restore")}
        </button>
      </div>
      <small className="settings-hint">{t("template.comicHint")}</small>
    </div>
  );
}

function PromptVariantCards({
  variants,
  onUse,
}: {
  variants: PromptVariants | null;
  onUse: (text: string) => void;
}) {
  const language = useAppStore((state) => state.settings?.language);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  if (!variants || (!variants.namePrompt.trim() && !variants.featurePrompt.trim())) return null;
  const cards = [
    [t("variant.nameTitle"), t("variant.nameHint"), variants.namePrompt],
    [t("variant.featureTitle"), t("variant.featureHint"), variants.featurePrompt],
  ] as const;
  return (
    <div className="prompt-variant-grid">
      {cards.map(([title, hint, text]) => (
        <div className="prompt-variant-card" key={title}>
          <div>
            <strong>{title}</strong>
            <small>{hint}</small>
          </div>
          <textarea readOnly value={text} />
          <Button className="full" disabled={!text.trim()} onClick={() => onUse(text)}>
            {t("variant.use")}
          </Button>
        </div>
      ))}
    </div>
  );
}

function ReversePanel() {
  const setInspectImage = useAppStore((state) => state.setInspectImage);
  const clearInspect = useAppStore((state) => state.clearInspect);
  const inspectImageUrl = useAppStore((state) => state.inspectImageUrl);
  const reversePromptText = useAppStore((state) => state.reversePromptText);
  const reversePromptMode = useAppStore((state) => state.reversePromptMode);
  const reversePromptScope = useAppStore((state) => state.reversePromptScope);
  const reversePromptHint = useAppStore((state) => state.reversePromptHint);
  const reverseKnownCharacter = useAppStore((state) => state.reverseKnownCharacter);
  const reversePromptVariants = useAppStore((state) => state.reversePromptVariants);
  const setReversePromptMode = useAppStore((state) => state.setReversePromptMode);
  const setReversePromptScope = useAppStore((state) => state.setReversePromptScope);
  const setReversePromptHint = useAppStore((state) => state.setReversePromptHint);
  const setReverseKnownCharacter = useAppStore((state) => state.setReverseKnownCharacter);
  const runReversePrompt = useAppStore((state) => state.runReversePrompt);
  const setReversePromptText = useAppStore((state) => state.setReversePromptText);
  const reverseJobs = useAppStore((state) => state.reverseJobs);
  const reverseQueueCollapsed = useAppStore((state) => state.reverseQueueCollapsed);
  const toggleReverseQueueCollapsed = useAppStore((state) => state.toggleReverseQueueCollapsed);
  const removeReverseJob = useAppStore((state) => state.removeReverseJob);
  const reverseHistory = useAppStore((state) => state.reverseHistory);
  const loadReverseHistory = useAppStore((state) => state.loadReverseHistory);
  const deleteReverseHistoryItem = useAppStore((state) => state.deleteReverseHistoryItem);
  const clearReverseHistory = useAppStore((state) => state.clearReverseHistory);
  const setParam = useAppStore((state) => state.setParam);
  const setToast = useAppStore((state) => state.setToast);
  const settings = useAppStore((state) => state.settings);
  const refreshSettings = useAppStore((state) => state.refreshSettings);
  const language = settings?.language;
  const inspectMeta = useAppStore((state) => state.inspectMeta);
  const applyParams = useAppStore((state) => state.applyParams);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const [dragging, setDragging] = useState(false);
  const fileReadRevision = useRef(0);
  const hasImage = Boolean(inspectImageUrl);
  const reverseTemplateVersion = settings?.reversePromptTemplateVersion ?? "v5";
  const reverseBusy = reverseJobs.some((job) => job.status === "processing");
  useEffect(() => {
    void loadReverseHistory();
  }, [loadReverseHistory]);
  useEffect(() => () => {
    // Any FileReader that finishes after this panel unmounts must discard and
    // revoke its not-yet-stored object URL instead of reviving stale state.
    fileReadRevision.current += 1;
  }, []);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);

  const imported = useMemo(
    () => (inspectMeta ? inspectImageMetadata(inspectMeta).imported : {}),
    [inspectMeta],
  );
  const hasMeta = Object.keys(imported).length > 0;

  function restoreParams() {
    if (!hasMeta) {
      setToast(t("inspect.noMeta"));
      return;
    }
    // The locked negative prompt must survive this restore too, same as
    // reset/template. (parseImportedParams never extracts stylePrompt from
    // metadata, so only negativePrompt is relevant here.)
    const patch = { ...imported };
    if (settings?.lockNegativePrompt) delete patch.negativePrompt;
    applyParams(patch);
    setActiveTab("generate");
    setToast(t("inspect.metaRestored"));
  }

  const modes: [ReversePromptMode, string, string][] = [
    ["tags", t("mode.tags"), t("inspect.mode.tagsTip")],
    ["natural", t("mode.natural"), t("inspect.mode.naturalTip")],
    ["mixed", t("mode.mixed"), t("inspect.mode.mixedTip")],
  ];
  const scopes: [ReversePromptScope, string, string][] = [
    ["full", t("inspect.scope.full"), t("inspect.scope.fullTip")],
    ["character", t("inspect.scope.character"), t("inspect.scope.characterTip")],
    ["object", t("inspect.scope.object"), t("inspect.scope.objectTip")],
    ["scene", t("inspect.scope.scene"), t("inspect.scope.sceneTip")],
  ];

  function handleFile(file: File) {
    const revision = ++fileReadRevision.current;
    const url = URL.createObjectURL(file);
    // Real filesystem path, when resolvable — used only so a reverse history
    // record can later be dropped once this source image is gone.
    const path = (file as File & { path?: string }).path || window.naiDesktop.getPathForFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (revision !== fileReadRevision.current) {
        URL.revokeObjectURL(url);
        return;
      }
      const buf = ev.target?.result as ArrayBuffer;
      // Store base64 for vision API; also read PNG meta as bonus
      const bytes = new Uint8Array(buf);
      const chunks: string[] = [];
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
      }
      const b64 = btoa(chunks.join(""));
      const meta = parseImageMeta(buf);
      setInspectImage(url, meta, b64, path);
    };
    reader.onerror = () => URL.revokeObjectURL(url);
    reader.onabort = () => URL.revokeObjectURL(url);
    try {
      reader.readAsArrayBuffer(file);
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }

  function applyToPanel() {
    if (!reversePromptText.trim()) return;
    setParam("positivePrompt", reversePromptText.trim());
    setToast(t("shared.reusedToGenerate"));
  }

  async function setReverseTemplateVersion(version: "v4.5" | "v5") {
    if (version === reverseTemplateVersion) return;
    await window.naiDesktop.setSetting("reversePromptTemplateVersion", version);
    await refreshSettings();
  }

  // Apply selected template to the reverse prompt result
  function applyTemplate(tpl: PromptTemplate) {
    const base = reversePromptText.trim();
    const parts = [tpl.prefix.trim(), base, tpl.suffix.trim()].filter(Boolean);
    const merged = parts.join(", ");
    setReversePromptText(merged);
    setToast(f("prompt.templateApplied", { name: tpl.name }));
  }

  const templates: PromptTemplate[] = settings?.promptTemplates ?? [];

  return (
    <>
      <div className="panel-scroll">
        <div
          className={clsx("inspect-drop-zone", dragging && "dragging")}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
        >
          {hasImage ? (
            <img src={inspectImageUrl} className="wb-thumb" style={{ maxHeight: 110 }} alt={t("inspect.imageAlt")} />
          ) : (
            <span style={{ fontSize: 12 }}>{t("inspect.dropHint")}</span>
          )}
          <label className="btn btn-secondary" style={{ cursor: "pointer", fontSize: 12 }}>
            <IconText icon={<Icon name="folderOpen" />}>{t("inspect.openFile")}</IconText>
            <input
              type="file"
              hidden
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) { handleFile(f); e.target.value = ""; }
              }}
            />
          </label>
        </div>

        {hasImage && (
          <div className="meta-restore">
            <Button variant="secondary" className="full" disabled={!hasMeta} onClick={restoreParams}>
              {t("inspect.restoreParams")}
            </Button>
            <small>
              {hasMeta
                ? t("inspect.restoreMetaOk")
                : t("inspect.restoreMetaMissing")}
            </small>
          </div>
        )}

        <div className="reverse-scope-card reverse-template-version-card">
          <span className="field-label-row">{t("inspect.templateVersionTitle")}</span>
          <div className="mode-selector compact">
            {(["v4.5", "v5"] as const).map((version) => (
              <button
                key={version}
                className={clsx("mode-btn", reverseTemplateVersion === version && "active")}
                onClick={() => void setReverseTemplateVersion(version)}
              >
                {t(`inspect.templateVersion.${version === "v4.5" ? "v45" : "v5"}`)}
              </button>
            ))}
          </div>
          <small>{t("inspect.templateVersionHint")}</small>
        </div>

        <div className="mode-selector">
          {modes.map(([val, label, tip]) => (
            <button
              key={val}
              className={clsx("mode-btn", reversePromptMode === val && "active")}
              title={tip}
              onClick={() => setReversePromptMode(val)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="reverse-scope-card">
          <span className="field-label-row">{t("inspect.scopeTitle")}</span>
          <div className="mode-selector compact">
            {scopes.map(([val, label, tip]) => (
              <button
                key={val}
                className={clsx("mode-btn", reversePromptScope === val && "active")}
                title={tip}
                onClick={() => setReversePromptScope(val)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="field">
            <span>{t("inspect.subjectHint")}</span>
            <input
              value={reversePromptHint}
              placeholder={t("inspect.subjectPlaceholder")}
              onChange={(e) => setReversePromptHint(e.target.value)}
            />
          </label>
          <label className="checkbox-line prompt-character-toggle">
            <input
              type="checkbox"
              checked={reverseKnownCharacter}
              onChange={(e) => setReverseKnownCharacter(e.target.checked)}
            />
            <span>{t("inspect.knownCharacter")}</span>
          </label>
        </div>

        {hasImage && (
          <Button
            variant="primary"
            className="full"
            onClick={() => void runReversePrompt()}
          >
            <IconText icon={reverseBusy ? "…" : "◎"}>{t("inspect.run")}</IconText>
          </Button>
        )}

        <TextToolQueuePanel
          jobs={reverseJobs}
          collapsed={reverseQueueCollapsed}
          onToggleCollapsed={toggleReverseQueueCollapsed}
          onRemoveJob={removeReverseJob}
        />

        {reversePromptText && (
          <>
            <div className="inspect-result-label">{t("inspect.result")}</div>
            <textarea
              className="prompt-box"
              style={{ minHeight: 120 }}
              value={reversePromptText}
              onChange={(e) => setReversePromptText(e.target.value)}
            />
            <PromptVariantCards variants={reversePromptVariants} onUse={setReversePromptText} />
            {templates.length > 0 && (
              <div className="template-apply-row">
                <span style={{ fontSize: 12 }}>{t("inspect.applyTemplate")}</span>
                <div className="template-chip-list">
                  {templates.map((tpl) => (
                    <button
                      key={tpl.id}
                      className="template-chip"
                      onClick={() => applyTemplate(tpl)}
                    >
                      {tpl.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <TextToolHistoryPanel
          items={reverseHistory}
          onDelete={(id) => void deleteReverseHistoryItem(id)}
          onClear={() => void clearReverseHistory()}
          onUse={setReversePromptText}
        />

        {!hasImage && (
          <div className="inspect-hint">
            <p>{t("inspect.emptyHint1")}</p>
            <p>{t("inspect.emptyHint2")}</p>
          </div>
        )}
      </div>
      <div className="left-footer">
        <div style={{ display: "grid", gap: 8 }}>
          <Button
            variant="primary"
            className="full"
            disabled={!reversePromptText.trim()}
            onClick={applyToPanel}
          >
            <IconText icon="↙">{t("inspect.reuse")}</IconText>
          </Button>
          {hasImage && (
            <Button className="full" onClick={clearInspect}>
              <IconText icon="✕">{t("inspect.clearImage")}</IconText>
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

// ── Left panel ────────────────────────────────────────────────────────────────
function LeftPanel({ openSettings }: { openSettings: () => void }) {
  const activeTab = useAppStore((state) => state.activeTab);
  const language = useAppStore((state) => state.settings?.language);
  const [generateMode, setGenerateMode] = useState<"t2i" | "i2i" | "enhance">("t2i");
  const setActiveCanvasSurface = useAppStore((state) => state.setActiveCanvasSurface);
  const currentImage = useAppStore((state) => state.currentImage);
  const workbenchImage = useAppStore((state) => state.workbenchImage);
  const loadWorkbenchFromPath = useAppStore((state) => state.loadWorkbenchFromPath);
  const tabItems = useMemo(() => getLocalizedTabItems(language), [language]);
  const generateText = useMemo(() => getGeneratePanelText(language), [language]);
  const meta = tabItems.find((item) => item.value === activeTab) ?? tabItems[0];
  useEffect(() => {
    if (activeTab === "generate") setActiveCanvasSurface(`generate:${generateMode}`);
    if (activeTab === "inpaint") setActiveCanvasSurface("inpaint");
  }, [activeTab, generateMode, setActiveCanvasSurface]);
  useEffect(() => {
    if (
      activeTab === "generate" &&
      generateMode === "enhance" &&
      !workbenchImage &&
      currentImage?.filePath
    ) {
      void loadWorkbenchFromPath(currentImage.filePath, { silent: true });
    }
  }, [activeTab, currentImage?.filePath, generateMode, loadWorkbenchFromPath, workbenchImage]);
  return (
    <aside className="left-panel">
      <div className="panel-head">
        <span aria-hidden="true"><Icon name={meta.icon} /></span>
        <div>
          <strong>{meta.title}</strong>
          <small>{meta.desc}</small>
        </div>
      </div>
      {activeTab === "generate" && (
        <>
          <div className="generate-mode-switcher">
            <button
              className={clsx(generateMode === "t2i" && "active")}
              onClick={() => setGenerateMode("t2i")}
            >
              {generateText.modeSwitch.textToImage}
            </button>
            <button
              className={clsx(generateMode === "i2i" && "active")}
              onClick={() => setGenerateMode("i2i")}
            >
              {generateText.modeSwitch.imageToImage}
            </button>
            <button
              className={clsx(generateMode === "enhance" && "active")}
              onClick={() => setGenerateMode("enhance")}
            >
              增强
            </button>
          </div>
          {generateMode === "t2i"
            ? <GeneratePanel openSettings={openSettings} />
            : generateMode === "i2i"
              ? <I2IPanel openSettings={openSettings} />
              : <EnhancePanel openSettings={openSettings} />}
        </>
      )}
      {activeTab === "inpaint" && <InpaintPanel openSettings={openSettings} />}
      {activeTab === "postprocess" && <PostprocessPanel openSettings={openSettings} />}
      {activeTab === "inspect" && <ReversePanel />}
      {activeTab === "convert" && <PromptConverterPanel />}
    </aside>
  );
}

// ── Prompt Converter panel ────────────────────────────────────────────────────
function PromptConverterPanel() {
  const convertInput = useAppStore((state) => state.convertInput);
  const convertResult = useAppStore((state) => state.convertResult);
  const setConvertInput = useAppStore((state) => state.setConvertInput);
  const setConvertResult = useAppStore((state) => state.setConvertResult);
  const convertMode = useAppStore((state) => state.convertMode);
  const convertKnownCharacter = useAppStore((state) => state.convertKnownCharacter);
  const convertResultVariants = useAppStore((state) => state.convertResultVariants);
  const setConvertMode = useAppStore((state) => state.setConvertMode);
  const setConvertKnownCharacter = useAppStore((state) => state.setConvertKnownCharacter);
  const runConvertPrompt = useAppStore((state) => state.runConvertPrompt);
  const convertJobs = useAppStore((state) => state.convertJobs);
  const convertQueueCollapsed = useAppStore((state) => state.convertQueueCollapsed);
  const toggleConvertQueueCollapsed = useAppStore((state) => state.toggleConvertQueueCollapsed);
  const removeConvertJob = useAppStore((state) => state.removeConvertJob);
  const convertHistory = useAppStore((state) => state.convertHistory);
  const loadConvertHistory = useAppStore((state) => state.loadConvertHistory);
  const deleteConvertHistoryItem = useAppStore((state) => state.deleteConvertHistoryItem);
  const clearConvertHistory = useAppStore((state) => state.clearConvertHistory);
  const setParam = useAppStore((state) => state.setParam);
  const setToast = useAppStore((state) => state.setToast);
  const settings = useAppStore((state) => state.settings);
  const refreshSettings = useAppStore((state) => state.refreshSettings);
  const templates: PromptTemplate[] = settings?.promptTemplates ?? [];
  const language = settings?.language;
  const convertTemplateVersion = settings?.convertPromptTemplateVersion ?? "v5";
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);
  const convertBusy = convertJobs.some((job) => job.status === "processing");
  useEffect(() => {
    void loadConvertHistory();
  }, [loadConvertHistory]);

  function applyToPanel() {
    if (!convertResult.trim()) return;
    setParam("positivePrompt", convertResult.trim());
    setToast(t("shared.reusedToGenerate"));
  }

  function applyTemplate(tpl: PromptTemplate) {
    const base = convertResult.trim();
    const parts = [tpl.prefix.trim(), base, tpl.suffix.trim()].filter(Boolean);
    setConvertResult(parts.join(", "));
    setToast(f("prompt.templateApplied", { name: tpl.name }));
  }

  async function setConvertTemplateVersion(version: ReversePromptTemplateVersion) {
    if (version === convertTemplateVersion) return;
    await window.naiDesktop.setSetting("convertPromptTemplateVersion", version);
    await refreshSettings();
  }

  return (
    <>
      <div className="panel-scroll">
        <div className="convert-header">
          <strong>{t("convert.title")}</strong>
          <small>{t("convert.subtitle")}</small>
        </div>
        <label className="field">
          <span>{t("convert.input")}</span>
          <textarea
            className="prompt-box"
            style={{ minHeight: 110 }}
            value={convertInput}
            placeholder={t("convert.placeholder")}
            onChange={(e) => setConvertInput(e.target.value)}
          />
        </label>

        <div className="reverse-scope-card reverse-template-version-card">
          <span className="field-label-row">{t("convert.templateVersionTitle")}</span>
          <div className="mode-selector compact">
            {(["v4.5", "v5"] as const).map((version) => (
              <button
                type="button"
                key={version}
                className={clsx("mode-btn", convertTemplateVersion === version && "active")}
                onClick={() => void setConvertTemplateVersion(version)}
              >
                {t(`inspect.templateVersion.${version === "v4.5" ? "v45" : "v5"}`)}
              </button>
            ))}
          </div>
          <small>{t("convert.templateVersionHint")}</small>
        </div>

        <div className="mode-selector">
          {([
            ["tags", t("mode.tags")],
            ["natural", t("mode.natural")],
            ["mixed", t("mode.mixed")],
          ] as [ReversePromptMode, string][]).map(([val, label]) => (
            <button
              key={val}
              className={clsx("mode-btn", convertMode === val && "active")}
              onClick={() => setConvertMode(val)}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="checkbox-line prompt-character-toggle">
          <input
            type="checkbox"
            checked={convertKnownCharacter}
            onChange={(e) => setConvertKnownCharacter(e.target.checked)}
          />
          <span>{t("convert.knownCharacter")}</span>
        </label>
        <small className="prompt-character-hint">
          {t("convert.knownCharacterHint")}
        </small>

        <Button
          variant="primary"
          className="full"
          disabled={!convertInput.trim()}
          onClick={() => void runConvertPrompt()}
        >
          <IconText icon={convertBusy ? "…" : "⇄"}>
            {t(`convert.run.${convertMode}`)}
          </IconText>
        </Button>

        <TextToolQueuePanel
          jobs={convertJobs}
          collapsed={convertQueueCollapsed}
          onToggleCollapsed={toggleConvertQueueCollapsed}
          onRemoveJob={removeConvertJob}
        />

        {convertResult && (
          <>
            <div className="inspect-result-label">{t("convert.result")}</div>
            <textarea
              className="prompt-box"
              style={{ minHeight: 130 }}
              value={convertResult}
              onChange={(e) => setConvertResult(e.target.value)}
            />
            <PromptVariantCards variants={convertResultVariants} onUse={setConvertResult} />
            {templates.length > 0 && (
              <div className="template-apply-row">
                <span style={{ fontSize: 12 }}>{t("convert.applyTemplate")}</span>
                <div className="template-chip-list">
                  {templates.map((tpl) => (
                    <button key={tpl.id} className="template-chip" onClick={() => applyTemplate(tpl)}>
                      {tpl.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <TextToolHistoryPanel
          items={convertHistory}
          onDelete={(id) => void deleteConvertHistoryItem(id)}
          onClear={() => void clearConvertHistory()}
          onUse={setConvertResult}
        />

        {!convertResult && (
          <div className="inspect-hint">
            <p>{t("convert.emptyHint1")}</p>
            <p>{t("convert.emptyHint2")}</p>
          </div>
        )}
      </div>
      <div className="left-footer">
        <div style={{ display: "grid", gap: 8 }}>
          <Button variant="primary" className="full" disabled={!convertResult.trim()} onClick={applyToPanel}>
            <IconText icon="↙">{t("convert.reuse")}</IconText>
          </Button>
          <Button
            className="full"
            disabled={!convertResult.trim()}
            onClick={() => { void navigator.clipboard.writeText(convertResult); setToast(t("convert.copied")); }}
          >
            <IconText icon="⧉">{t("convert.copy")}</IconText>
          </Button>
        </div>
      </div>
    </>
  );
}

// ── AI call log panel ─────────────────────────────────────────────────────────
function AiLogPanel() {
  const [entries, setEntries] = useState<AiCallLogEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const language = useAppStore((state) => state.settings?.language);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.naiDesktop.getAiCallLog();
      setEntries(Array.isArray(list) ? list : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function clearAll() {
    await window.naiDesktop.clearAiCallLog();
    setExpanded(new Set());
    await load();
  }

  return (
    <main className="ai-log-panel">
      <div className="ai-log-head">
        <div>
          <strong>{t("aiLog.title")}</strong>
          <small>{t("aiLog.subtitle")}</small>
        </div>
        <div className="ai-log-actions">
          <button className="btn btn-ghost" onClick={() => void load()} disabled={loading}>
            {loading ? t("aiLog.refreshing") : t("aiLog.refresh")}
          </button>
          <button className="btn btn-danger" onClick={() => void clearAll()} disabled={!entries.length}>
            {t("aiLog.clear")}
          </button>
        </div>
      </div>
      {entries.length === 0 ? (
        <div className="ai-log-empty">{t("aiLog.empty")}</div>
      ) : (
        <div className="ai-log-list">
          {entries.map((entry) => {
            const open = expanded.has(entry.id);
            return (
              <div className={clsx("ai-log-item", entry.ok ? "ok" : "fail")} key={entry.id}>
                <button type="button" className="ai-log-item-head" onClick={() => toggle(entry.id)}>
                  <Icon name="chevronRight" className={clsx("ai-log-caret disclosure-chevron", open && "open")} />
                  <span className={clsx("ai-log-badge", entry.ok ? "ok" : "fail")}>{entry.ok ? t("aiLog.ok") : t("aiLog.fail")}</span>
                  <span className="ai-log-label">{entry.label}</span>
                  <span className="ai-log-meta">{entry.api === "vision" ? t("aiLog.visionApi") : t("aiLog.textApi")} · {entry.model}</span>
                  <span className="ai-log-time">{format(new Date(entry.time), "HH:mm:ss")}</span>
                </button>
                {open && (
                  <div className="ai-log-body">
                    <AiLogField title={t("aiLog.systemPrompt")} text={entry.systemPrompt} />
                    <AiLogField title={t("aiLog.user")} text={entry.userText} />
                    <AiLogField title={entry.ok ? t("aiLog.responseOk") : t("aiLog.responseFail")} text={entry.response} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

function AiLogField({ title, text }: { title: string; text: string }) {
  const language = useAppStore((state) => state.settings?.language);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  return (
    <div className="ai-log-field">
      <div className="ai-log-field-head">
        <span>{title}</span>
        <button
          type="button"
          className="btn btn-ghost btn-mini"
          onClick={() => void navigator.clipboard.writeText(text)}
          disabled={!text}
        >
          {t("aiLog.copy")}
        </button>
      </div>
      <pre className="ai-log-pre">{text || t("aiLog.emptyValue")}</pre>
    </div>
  );
}

// ── Image canvas (center) ─────────────────────────────────────────────────────
type ViewableImage = { id?: string; fileUrl: string; width: number; height: number };

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function ZoomableImageStage({
  image,
  compareBeforeImage,
  alt,
}: {
  image: ViewableImage;
  compareBeforeImage?: ViewableImage | null;
  alt: string;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const compareClipRef = useRef<HTMLDivElement>(null);
  const compareDividerRef = useRef<HTMLButtonElement>(null);
  const compareDragRef = useRef(false);
  const compareRectRef = useRef<DOMRect | null>(null);
  const comparePositionRef = useRef(50);
  const pendingComparePositionRef = useRef(50);
  const compareAnimationFrameRef = useRef<number | null>(null);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [shellSize, setShellSize] = useState({ width: 0, height: 0 });
  const [intrinsicSize, setIntrinsicSize] = useState({ width: 0, height: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [compareEnabled, setCompareEnabled] = useState(Boolean(compareBeforeImage));
  const language = useAppStore((state) => state.settings?.language);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const canCompare = Boolean(compareBeforeImage?.fileUrl);
  const frameSize = useMemo(() => {
    const shellWidth = shellSize.width;
    const shellHeight = shellSize.height;
    const imageWidth = Math.max(1, intrinsicSize.width || image.width || 1);
    const imageHeight = Math.max(1, intrinsicSize.height || image.height || 1);
    if (shellWidth <= 0 || shellHeight <= 0) return undefined;
    const aspect = imageWidth / imageHeight;
    let width = shellWidth;
    let height = width / aspect;
    if (height > shellHeight) {
      height = shellHeight;
      width = height * aspect;
    }
    return { width, height };
  }, [image.height, image.width, intrinsicSize.height, intrinsicSize.width, shellSize.height, shellSize.width]);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    comparePositionRef.current = 50;
    pendingComparePositionRef.current = 50;
    if (compareAnimationFrameRef.current !== null) {
      cancelAnimationFrame(compareAnimationFrameRef.current);
      compareAnimationFrameRef.current = null;
    }
    if (compareClipRef.current) compareClipRef.current.style.clipPath = "inset(0 0 0 50%)";
    if (compareDividerRef.current) compareDividerRef.current.style.left = "50%";
    setCompareEnabled(Boolean(compareBeforeImage));
    setIntrinsicSize({ width: 0, height: 0 });
  }, [image.fileUrl, compareBeforeImage?.fileUrl]);

  useEffect(() => {
    const element = shellRef.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setShellSize({ width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    if (compareAnimationFrameRef.current !== null) {
      cancelAnimationFrame(compareAnimationFrameRef.current);
    }
  }, []);

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function clampPanForZoom(nextPan: { x: number; y: number }, nextZoom: number) {
    if (!frameSize || shellSize.width <= 0 || shellSize.height <= 0) return nextPan;
    const baseLeft = (shellSize.width - frameSize.width) / 2;
    const baseTop = (shellSize.height - frameSize.height) / 2;
    const scaledWidth = frameSize.width * nextZoom;
    const scaledHeight = frameSize.height * nextZoom;
    const centeredX = (shellSize.width - scaledWidth) / 2 - baseLeft;
    const centeredY = (shellSize.height - scaledHeight) / 2 - baseTop;
    const minX = scaledWidth > shellSize.width ? shellSize.width - baseLeft - scaledWidth : centeredX;
    const maxX = scaledWidth > shellSize.width ? -baseLeft : centeredX;
    const minY = scaledHeight > shellSize.height ? shellSize.height - baseTop - scaledHeight : centeredY;
    const maxY = scaledHeight > shellSize.height ? -baseTop : centeredY;
    return {
      x: clampNumber(nextPan.x, minX, maxX),
      y: clampNumber(nextPan.y, minY, maxY),
    };
  }

  function updateComparePosition(clientX: number) {
    const rect = compareRectRef.current ?? frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = ((clientX - rect.left) / Math.max(1, rect.width)) * 100;
    pendingComparePositionRef.current = clampNumber(next, 0, 100);
    if (compareAnimationFrameRef.current !== null) return;
    compareAnimationFrameRef.current = requestAnimationFrame(() => {
      const position = pendingComparePositionRef.current;
      comparePositionRef.current = position;
      if (compareClipRef.current) {
        compareClipRef.current.style.clipPath = `inset(0 0 0 ${position}%)`;
      }
      if (compareDividerRef.current) {
        compareDividerRef.current.style.left = `${position}%`;
      }
      compareAnimationFrameRef.current = null;
    });
  }

  function beginCompareDragging(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    compareDragRef.current = true;
    compareRectRef.current = frameRef.current?.getBoundingClientRect() ?? null;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateComparePosition(event.clientX);
  }

  function moveCompareDivider(event: React.PointerEvent<HTMLButtonElement>) {
    if (compareDragRef.current) updateComparePosition(event.clientX);
  }

  function stopCompareDragging(event: React.PointerEvent<HTMLButtonElement>) {
    compareDragRef.current = false;
    compareRectRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const rect = frameRef.current?.getBoundingClientRect();
    const next = clampNumber(zoom * (event.deltaY < 0 ? 1.16 : 1 / 1.16), 1, 8);
    if (!rect || next === 1) {
      setZoom(next);
      setPan({ x: 0, y: 0 });
      return;
    }
    const baseLeft = rect.left - pan.x;
    const baseTop = rect.top - pan.y;
    const imageX = clampNumber((event.clientX - rect.left) / zoom, 0, rect.width / zoom);
    const imageY = clampNumber((event.clientY - rect.top) / zoom, 0, rect.height / zoom);
    setZoom(next);
    setPan(clampPanForZoom({
      x: event.clientX - baseLeft - imageX * next,
      y: event.clientY - baseTop - imageY * next,
    }, next));
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (zoom <= 1) return;
    if (event.button !== 1) return;
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;
    event.preventDefault();
    panStartRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!isPanning || !panStartRef.current) return;
    const start = panStartRef.current;
    setPan(clampPanForZoom({
      x: start.panX + event.clientX - start.x,
      y: start.panY + event.clientY - start.y,
    }, zoom));
  }

  function stopPanning(event: React.PointerEvent<HTMLDivElement>) {
    setIsPanning(false);
    panStartRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released when the pointer leaves the app window.
    }
  }

  return (
    <div className="image-stage">
      <div className="image-viewer-toolbar">
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" className="btn btn-ghost btn-mini" onClick={resetView} disabled={zoom === 1 && pan.x === 0 && pan.y === 0}>
          {t("viewer.reset")}
        </button>
        {canCompare ? (
          <button
            type="button"
            className={clsx("btn btn-ghost btn-mini", compareEnabled && "active")}
            onClick={() => setCompareEnabled((value) => !value)}
          >
            {t("viewer.compare")}
          </button>
        ) : null}
      </div>
      <div
        ref={shellRef}
        className={clsx("zoom-frame-shell", zoom > 1 && "is-zoomed", isPanning && "is-panning")}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopPanning}
        onPointerCancel={stopPanning}
        onAuxClick={(event) => event.preventDefault()}
      >
        <div
          ref={frameRef}
          className={clsx("zoom-frame", compareEnabled && canCompare && "is-comparing")}
          style={{ ...frameSize, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          {compareEnabled && canCompare ? (
            <>
              <img className="zoom-image" src={compareBeforeImage!.fileUrl} alt={t("viewer.beforeAlt")} draggable={false} />
              <div ref={compareClipRef} className="compare-after-clip" style={{ clipPath: "inset(0 0 0 50%)" }}>
                <img
                  className="zoom-image zoom-image-absolute"
                  src={image.fileUrl}
                  alt={t("viewer.afterAlt")}
                  draggable={false}
                  onLoad={(event) => {
                    const { naturalWidth, naturalHeight } = event.currentTarget;
                    if (naturalWidth > 0 && naturalHeight > 0) setIntrinsicSize({ width: naturalWidth, height: naturalHeight });
                  }}
                  onError={() => {
                    if (image.id) void useAppStore.getState().dropMissingImage(image.id);
                  }}
                />
              </div>
              <button
                ref={compareDividerRef}
                type="button"
                className="compare-divider"
                style={{ left: "50%" }}
                onPointerDown={beginCompareDragging}
                onPointerMove={moveCompareDivider}
                onPointerUp={stopCompareDragging}
                onPointerCancel={stopCompareDragging}
                aria-label={t("viewer.compareDividerLabel")}
                title={t("viewer.compareDividerLabel")}
              >
                <span />
              </button>
            </>
          ) : (
            <img
              className="zoom-image"
              src={image.fileUrl}
              alt={alt}
              draggable={zoom === 1}
              title={t("viewer.dragTitle")}
              onLoad={(event) => {
                const { naturalWidth, naturalHeight } = event.currentTarget;
                if (naturalWidth > 0 && naturalHeight > 0) setIntrinsicSize({ width: naturalWidth, height: naturalHeight });
              }}
              onDragStart={(event) => {
                event.preventDefault();
                window.naiDesktop.startImageDrag(image.fileUrl);
              }}
              onError={() => {
                if (image.id) void useAppStore.getState().dropMissingImage(image.id);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ImageCanvas() {
  const currentImage = useAppStore((state) => state.currentImage);
  const comparisonBeforeImage = useAppStore((state) => state.comparisonBeforeImage);
  const comparisonSurface = useAppStore((state) => state.comparisonSurface);
  const activeCanvasSurface = useAppStore((state) => state.activeCanvasSurface);
  const isGenerating = useAppStore((state) => state.isGenerating);
  const generationPreview = useAppStore((state) => state.generationPreview);
  const generationPhase = useAppStore((state) => state.generationPhase);
  const activeTab = useAppStore((state) => state.activeTab);
  const generate = useAppStore((state) => state.generate);
  const settings = useAppStore((state) => state.settings);
  const language = settings?.language;
  const inspectImageUrl = useAppStore((state) => state.inspectImageUrl);
  const loadWorkbenchFromPath = useAppStore((state) => state.loadWorkbenchFromPath);
  const [dropOver, setDropOver] = useState(false);
  const [handoffPreview, setHandoffPreview] = useState<typeof generationPreview>(null);
  const [handoffLeaving, setHandoffLeaving] = useState(false);
  const superDrop = settings?.superDrop ?? false;
  const dropEnabled = superDrop || activeTab === "generate" || activeTab === "postprocess";
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);
  const streamPreviewComplete = generationPhase === "saving" || (generationPreview?.progress ?? 0) >= 1;
  const visibleGenerationPreview = isGenerating ? generationPreview : handoffPreview;
  const previewComplete = !isGenerating || streamPreviewComplete;
  const waitingCopy = generationPhase === "preparing"
    ? { title: t("canvas.preparingTitle"), hint: t("canvas.preparingHint") }
    : generationPhase === "requesting"
      ? { title: t("canvas.requestingTitle"), hint: t("canvas.requestingHint") }
      : generationPhase === "saving"
        ? { title: t("canvas.savingTitle"), hint: t("canvas.savingHint") }
        : { title: t("canvas.generatingTitle"), hint: t("canvas.generatingHint") };
  const comparisonBelongsToActiveTab =
    (activeTab === "generate" && comparisonSurface?.startsWith("generate:")) ||
    (activeTab === "inpaint" && comparisonSurface === "inpaint") ||
    (activeTab === "postprocess" && comparisonSurface?.startsWith("postprocess:"));

  useEffect(() => {
    if (isGenerating) {
      if (generationPreview?.imageDataUrl && streamPreviewComplete) {
        setHandoffPreview(generationPreview);
        setHandoffLeaving(false);
      } else if (generationPhase === "preparing" || generationPhase === "requesting") {
        setHandoffPreview(null);
        setHandoffLeaving(false);
      }
      return;
    }
    if (!handoffPreview?.imageDataUrl) return;
    // A successful store handoff uses the exact final stream frame while the
    // durable local URL decodes. If it does not match, the request failed or was
    // cancelled and no completion cross-fade should be shown.
    if (currentImage?.fileUrl !== handoffPreview.imageDataUrl) {
      setHandoffPreview(null);
      setHandoffLeaving(false);
      return;
    }
    let firstFrame = 0;
    let secondFrame = 0;
    let finishTimer = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setHandoffLeaving(true);
        finishTimer = window.setTimeout(() => {
          setHandoffPreview(null);
          setHandoffLeaving(false);
        }, 180);
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(finishTimer);
    };
  }, [generationPhase, generationPreview, handoffPreview, isGenerating, streamPreviewComplete]);

  function handleDragOver(e: React.DragEvent) {
    if (!dropEnabled || !hasDraggedFiles(e.dataTransfer)) return;
    e.preventDefault();
    setDropOver(true);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDropOver(false);
    if (!dropEnabled) return;
    const filePath = await droppedImagePath(e.dataTransfer);
    if (filePath) {
      void loadWorkbenchFromPath(filePath);
    }
  }

  if (activeTab === "inspect") {
    return (
      <main className="canvas-area">
        {inspectImageUrl ? (
          <ZoomableImageStage image={{ fileUrl: inspectImageUrl, width: 1, height: 1 }} alt={t("inspect.canvasAlt")} />
        ) : (
          <div className="coming-soon">
            <div className="coming-soon-icon"><Icon name="scan" /></div>
            <h2>{t("inspect.canvasTitle")}</h2>
            <p>{t("inspect.canvasHint")}</p>
          </div>
        )}
      </main>
    );
  }

  if (activeTab === "convert") {
    return (
      <main className="canvas-area">
        <div className="coming-soon">
          <div className="coming-soon-icon"><Icon name="swap" /></div>
          <h2>{t("convert.title")}</h2>
          <p>{t("convert.emptyHint1")}</p>
        </div>
      </main>
    );
  }

  if (activeTab === "postprocess" && !currentImage && !isGenerating) {
    return (
      <main
        className="canvas-area"
        onDragOver={handleDragOver}
        onDragLeave={() => setDropOver(false)}
        onDrop={handleDrop}
      >
        {dropOver && (
          <div className="superdrop-overlay">
            <span>{t("canvas.dropToLoad")}</span>
          </div>
        )}
        <div className="coming-soon">
          <div className="coming-soon-icon"><Icon name="wand" /></div>
          <h2>{t("postprocess.emptyTitle")}</h2>
          <p>{t("postprocess.emptyHint")}</p>
        </div>
      </main>
    );
  }

  return (
    <main
      className="canvas-area"
      onDragOver={handleDragOver}
      onDragLeave={() => setDropOver(false)}
      onDrop={handleDrop}
    >
      {dropOver && (
        <div className="superdrop-overlay">
          <span>{t("canvas.dropToLoad")}</span>
        </div>
      )}
      {(isGenerating || handoffPreview) && (
        <div
          className={clsx(
            "generating-overlay",
            visibleGenerationPreview?.imageDataUrl ? "has-stream-preview" : "is-waiting",
            !isGenerating && "is-completing",
            handoffLeaving && "is-leaving",
          )}
          aria-live="polite"
        >
          {visibleGenerationPreview?.imageDataUrl ? (
            <>
              <div className="generation-stream-frame">
                <img src={visibleGenerationPreview.imageDataUrl} alt={t("canvas.streamingTitle")} />
              </div>
              <div className="generation-stream-status">
                <strong>{previewComplete ? t("canvas.savingTitle") : t("canvas.streamingTitle")}</strong>
                <small>
                  {previewComplete
                    ? t("canvas.savingHint")
                    : f("canvas.streamingProgress", {
                        current: visibleGenerationPreview.currentStep ?? 0,
                        total: visibleGenerationPreview.totalSteps ?? 0,
                        percent: Math.round(visibleGenerationPreview.progress * 100),
                      })}
                </small>
                <span aria-hidden="true">
                  <i style={{ width: `${Math.round(visibleGenerationPreview.progress * 100)}%` }} />
                </span>
              </div>
            </>
          ) : (
            <div className="generation-wait-card">
              <div className="spinner" />
              <div className="generation-wait-copy">
                <strong>{waitingCopy.title}</strong>
                <small>{waitingCopy.hint}</small>
              </div>
              <span className="generation-wait-track" aria-hidden="true"><i /></span>
            </div>
          )}
        </div>
      )}
      {!currentImage && !isGenerating && (
        <button className="empty-canvas" onClick={generate}>
          <span className="empty-illustration" aria-hidden="true">
            <span className="empty-orb empty-orb-a" />
            <span className="empty-orb empty-orb-b" />
            <span className="empty-gem"><Icon name="sparkles" /></span>
          </span>
          <strong>{t("canvas.emptyTitle")}</strong>
          <span>{t("canvas.emptyHint")}</span>
          <span className="empty-shortcuts">
            <span>{t("canvas.shortcutAutocomplete")}</span>
            <span>{dropEnabled ? t("canvas.shortcutDrop") : t("canvas.shortcutApiOnly")}</span>
            <span>{t("canvas.shortcutReuse")}</span>
          </span>
        </button>
      )}
      {currentImage && <ZoomableImageStage
        image={currentImage}
        compareBeforeImage={comparisonBelongsToActiveTab && comparisonSurface === activeCanvasSurface ? comparisonBeforeImage : null}
        alt={t("canvas.resultAlt")}
      />}
    </main>
  );
}

// ── Reusable in-app input modal (Electron has no window.prompt) ────────────────
function InputModal({
  title,
  label,
  initial,
  confirmText,
  onConfirm,
  onClose,
}: {
  title: string;
  label: string;
  initial: string;
  confirmText?: string;
  onConfirm: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const language = useAppStore((state) => state.settings?.language);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  return (
    <AppPortal>
      <div className="modal-backdrop" onMouseDown={onClose}>
        <div className="modal input-modal" onMouseDown={(e) => e.stopPropagation()}>
          <header>
            <h2>{title}</h2>
            <button aria-label={t("common.close")} onClick={onClose}><Icon name="close" /></button>
          </header>
          <div className="input-modal-body">
            <label className="field">
              <span>{label}</span>
              <input
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onConfirm(value);
                  else if (e.key === "Escape") onClose();
                }}
              />
            </label>
          </div>
          <footer className="input-modal-footer">
            <Button onClick={onClose}>{t("common.cancel")}</Button>
            <Button variant="primary" onClick={() => onConfirm(value)}>{confirmText ?? t("common.confirm")}</Button>
          </footer>
        </div>
      </div>
    </AppPortal>
  );
}

type ProxyPreset = AppSettings["proxyMode"];

function proxyPresetFor(mode: AppSettings["proxyMode"], value: string): ProxyPreset {
  if (["auto", "direct", "http", "socks", "custom"].includes(mode)) return mode;
  const normalized = value.trim().toLowerCase().replace(/\/$/, "");
  if (!normalized) return "direct";
  if (normalized === DEFAULT_HTTP_PROXY) return "http";
  if (normalized === DEFAULT_SOCKS_PROXY) return "socks";
  return "custom";
}

function ProxyPresetControl({ mode, value, onChange }: {
  mode: AppSettings["proxyMode"];
  value: string;
  onChange: (mode: AppSettings["proxyMode"], value: string) => void;
}) {
  const [preset, setPreset] = useState<ProxyPreset>(() => proxyPresetFor(mode, value));
  const [customValue, setCustomValue] = useState(value);
  const language = useAppStore((state) => state.settings?.language);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);

  useEffect(() => {
    setCustomValue(value);
    setPreset(proxyPresetFor(mode, value));
  }, [mode, value]);

  function selectPreset(next: ProxyPreset) {
    setPreset(next);
    if (next === "auto" || next === "direct") onChange(next, "");
    if (next === "http") onChange(next, DEFAULT_HTTP_PROXY);
    if (next === "socks") onChange(next, DEFAULT_SOCKS_PROXY);
    if (next === "custom") onChange(next, customValue);
  }

  return (
    <div className="proxy-preset-control">
      <label className="field">
        <span>{t("proxy.label")}</span>
        <select value={preset} onChange={(event) => selectPreset(event.target.value as ProxyPreset)}>
          <option value="auto">{t("proxy.auto")}</option>
          <option value="http">{t("proxy.http")}</option>
          <option value="direct">{t("proxy.direct")}</option>
          <option value="socks">{t("proxy.socks")}</option>
          <option value="custom">{t("proxy.custom")}</option>
        </select>
      </label>
      {preset === "custom" && (
        <label className="field">
          <span>{t("proxy.customLabel")}</span>
          <input
            value={customValue}
            placeholder={t("proxy.placeholder")}
            onChange={(event) => {
              setCustomValue(event.target.value);
              onChange("custom", event.target.value);
            }}
          />
        </label>
      )}
      <div className={clsx("proxy-current", (preset === "direct" || preset === "auto") && "direct")}>
        <strong>{preset === "auto" ? t("proxy.currentAuto") : preset === "direct" ? t("proxy.currentDirect") : t("proxy.currentProxy")}</strong>
        <code>{preset === "auto" ? t("proxy.autoValue") : preset === "direct" ? t("proxy.directValue") : (preset === "custom" ? customValue : value) || t("proxy.empty")}</code>
      </div>
    </div>
  );
}

function TokenGuideModal({ onClose }: { onClose: () => void }) {
  const [previewImage, setPreviewImage] = useState("");
  const language = useAppStore((state) => state.settings?.language);
  const text = getTokenGuideText(language);
  const steps = text.steps.map((step, index) => ({
    ...step,
    image: `./tutorial/token-step-${index + 1}.webp`,
  }));
  return (
    <AppPortal>
      <div className="modal-backdrop token-guide-backdrop">
        <div className="modal token-guide-modal">
          <header>
            <div>
              <h2>{text.title}</h2>
              <p>{text.subtitle}</p>
            </div>
            <button type="button" aria-label={text.close} onClick={onClose}><Icon name="close" /></button>
          </header>
          <div className="token-guide-body">
            {steps.map((item, index) => (
              <figure className="token-guide-step" key={item.image}>
                <figcaption>
                  <span className="token-guide-number">{index + 1}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                  </div>
                </figcaption>
                <button type="button" className="token-guide-image-button" onClick={() => setPreviewImage(item.image)}>
                  <img src={item.image} alt={`${text.stepAltPrefix} ${text.stepAltSuffix} ${index + 1}: ${item.title}`} loading="lazy" draggable={false} />
                  <span>{text.zoom}</span>
                </button>
              </figure>
            ))}
            <div className="token-guide-warning">
              {text.warning}
            </div>
          </div>
          <footer>
            <Button onClick={() => window.naiDesktop.openExternal(novelAiImageUrl)}>{text.openNovelAi}</Button>
            <Button variant="primary" onClick={onClose}>{text.confirm}</Button>
          </footer>
        </div>
        {previewImage && (
          <div className="token-guide-preview" onMouseDown={() => setPreviewImage("")}>
            <button type="button" aria-label={text.close} onClick={() => setPreviewImage("")}><Icon name="close" /></button>
            <img src={previewImage} alt={text.previewAlt} onMouseDown={(event) => event.stopPropagation()} draggable={false} />
          </div>
        )}
      </div>
    </AppPortal>
  );
}

// ── History panel ─────────────────────────────────────────────────────────────
function HistoryPanel() {
  const history = useAppStore((state) => state.history);
  const isGenerating = useAppStore((state) => state.isGenerating);
  const generationPhase = useAppStore((state) => state.generationPhase);
  const dates = useAppStore((state) => state.historyDates);
  const groups = useAppStore((state) => state.historyGroups);
  const selectedDate = useAppStore((state) => state.selectedDate);
  const selectedGroupId = useAppStore((state) => state.selectedGroupId);
  const setSelectedDate = useAppStore((state) => state.setSelectedDate);
  const setSelectedGroupId = useAppStore((state) => state.setSelectedGroupId);
  const createHistoryGroup = useAppStore((state) => state.createHistoryGroup);
  const renameHistoryGroup = useAppStore((state) => state.renameHistoryGroup);
  const deleteHistoryGroup = useAppStore((state) => state.deleteHistoryGroup);
  const exportHistoryGroup = useAppStore((state) => state.exportHistoryGroup);
  const setHistoryItemGroup = useAppStore((state) => state.setHistoryItemGroup);
  const selectImage = useAppStore((state) => state.selectImage);
  const deleteHistory = useAppStore((state) => state.deleteHistory);
  const renameHistoryItem = useAppStore((state) => state.renameHistoryItem);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const setToast = useAppStore((state) => state.setToast);
  const language = useAppStore((state) => state.settings?.language);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);
  const pendingHistoryLabel = generationPhase === "saving" ? t("canvas.savingTitle") : t("canvas.generatingTitle");
  const [newGroupName, setNewGroupName] = useState("");
  // window.prompt() is unsupported in Electron, so use an in-app input modal.
  const [renameTarget, setRenameTarget] = useState<
    { kind: "item" | "group"; id: string; initial: string; title: string; label: string } | null
  >(null);

  function renameItem(item: HistoryItem) {
    const current = item.filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? "";
    setRenameTarget({ kind: "item", id: item.id, initial: current, title: t("history.renameImageModal"), label: t("history.renameImageLabel") });
  }

  function submitGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    void createHistoryGroup(name);
    setNewGroupName("");
  }

  const activeGroup = groups.find((g) => g.id === selectedGroupId);
  const canExport = selectedGroupId !== "" && history.length > 0;

  function renameActiveGroup() {
    if (!activeGroup) return;
    setRenameTarget({ kind: "group", id: activeGroup.id, initial: activeGroup.name, title: t("history.renameGroupModal"), label: t("history.renameGroupLabel") });
  }

  function confirmRename(value: string) {
    const name = value.trim();
    const target = renameTarget;
    setRenameTarget(null);
    if (!name || !target) return;
    if (target.kind === "item") void renameHistoryItem(target.id, name);
    else void renameHistoryGroup(target.id, name);
  }

  async function deleteActiveGroup() {
    if (!activeGroup) return;
    if (await confirmAction(f("history.deleteGroupConfirm", { name: activeGroup.name }))) {
      void deleteHistoryGroup(activeGroup.id);
    }
  }

  async function deleteItem(item: HistoryItem) {
    const deleted = await deleteHistory(item.id);
    if (deleted) setToast(t("history.deleteImageDone"));
  }

  async function inspectHistoryMetadata(item: HistoryItem) {
    const result = await window.naiDesktop.saveMetadataSnapshotFromPath(item.filePath);
    if (!result.ok) {
      setToast(t("history.metadataFailed"));
      return;
    }
    setActiveTab("metadata");
  }

  return (
    <aside className="history-panel">
      <div className="history-title">
        <div>
          <strong>{t("history.title")}</strong>
          <small>{history.length > 0 ? f("history.count", { count: history.length }) : t("history.emptySubtitle")}</small>
        </div>
      </div>
      <div className="history-filters">
        <SelectMenu
          ariaLabel={t("history.dateAria")}
          value={selectedDate}
          options={[{ value: "", label: t("history.allDates") }, ...dates.map((date) => ({ value: date, label: date }))]}
          onChange={(value) => void setSelectedDate(value)}
        />
        <SelectMenu
          ariaLabel={t("history.groupAria")}
          value={selectedGroupId}
          options={[
            { value: "", label: t("history.allGroups") },
            { value: "__ungrouped", label: t("history.ungrouped") },
            ...groups.map((group) => ({ value: group.id, label: group.name })),
          ]}
          onChange={(value) => void setSelectedGroupId(value)}
        />
        <div className="history-group-create">
          <input
            value={newGroupName}
            placeholder={t("history.newGroup")}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitGroup();
            }}
          />
          <button type="button" onClick={submitGroup}>{t("history.create")}</button>
        </div>
        <div className="history-group-actions">
          <button type="button" disabled={!canExport} title={t("history.exportTitle")} onClick={() => void exportHistoryGroup(selectedGroupId)}>
            <Icon name="download" /> {t("history.export")}
          </button>
          <button type="button" disabled={!activeGroup} title={t("history.renameGroupTitle")} onClick={renameActiveGroup}>
            <Icon name="brush" /> {t("history.rename")}
          </button>
          <button type="button" disabled={!activeGroup} title={t("history.deleteGroupTitle")} onClick={deleteActiveGroup}>
            <Icon name="trash" /> {t("history.delete")}
          </button>
        </div>
      </div>
      <div className="history-grid">
        {isGenerating && (
          <div className="history-item history-item-pending" aria-label={pendingHistoryLabel}>
            <div className="history-thumb-frame history-thumb-pending" aria-hidden="true">
              <span><Icon name="sparkles" /></span>
            </div>
            <div className="history-item-footer">
              <span className="history-meta">{pendingHistoryLabel}</span>
            </div>
          </div>
        )}
        {history.length === 0 && !isGenerating && (
          <div className="history-empty">
            <span><Icon name="image" /></span>
            <strong>{t("history.emptyTitle")}</strong>
            <small>{t("history.emptyHint")}</small>
          </div>
        )}
        {history.map((item) => (
          <div className="history-item" key={item.id}>
            <button onClick={() => selectImage(item)}>
              <div className="history-thumb-frame">
                <img
                  src={item.fileUrl}
                  alt={t("history.thumbAlt")}
                  draggable
                  // Decode only when scrolled into view and off the main thread —
                  // otherwise a large library decodes every full-res PNG at once,
                  // which freezes the UI and balloons memory.
                  loading="lazy"
                  decoding="async"
                  title={t("history.dragTitle")}
                  onDragStart={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.naiDesktop.startImageDrag(item.filePath);
                  }}
                  // File deleted/moved on disk → drop it from the library instead
                  // of showing a broken thumbnail (main re-checks before removing).
                  onError={() => void useAppStore.getState().dropMissingImage(item.id)}
                />
              </div>
            </button>
            <div className="history-item-footer">
              <span className="history-meta">{item.model} · {item.width}×{item.height}</span>
              <div className="history-item-group-row" onClick={(event) => event.stopPropagation()}>
                <SelectMenu
                  className="history-item-group-trigger"
                  value={item.groupId ?? ""}
                  ariaLabel={t("history.itemGroupTitle")}
                  label={<Icon name="folder" />}
                  options={[
                    { value: "", label: t("history.ungrouped") },
                    ...groups.map((group) => ({ value: group.id, label: group.name })),
                  ]}
                  onChange={(value) => void setHistoryItemGroup(item.id, value || undefined)}
                />
              </div>
            </div>
            <div className="history-item-controls" onClick={(event) => event.stopPropagation()}>
              <button className="history-metadata" title={t("history.metadataTitle")} aria-label={t("history.metadataTitle")} onClick={() => void inspectHistoryMetadata(item)}>
                <Icon name="eye" />
              </button>
              <button className="history-rename" title={t("history.renameImageTitle")} aria-label={t("history.renameImageTitle")} onClick={() => renameItem(item)}>
                <Icon name="brush" />
              </button>
              <button className="history-delete" title={t("history.deleteImageTitle")} aria-label={t("history.deleteImageTitle")} onClick={() => void deleteItem(item)}>
                <Icon name="close" />
              </button>
            </div>
          </div>
        ))}
      </div>
      {renameTarget && (
        <InputModal
          title={renameTarget.title}
          label={renameTarget.label}
          initial={renameTarget.initial}
          confirmText={t("history.renameConfirm")}
          onConfirm={confirmRename}
          onClose={() => setRenameTarget(null)}
        />
      )}
    </aside>
  );
}

// ── Settings modal ────────────────────────────────────────────────────────────
function SettingsModal({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState(
    () => new URLSearchParams(window.location.search).get("uiSettingsSection") ?? "api",
  );
  const settings = useAppStore((state) => state.settings);
  const account = useAppStore((state) => state.account);
  const refreshAccount = useAppStore((state) => state.refreshAccount);
  const refreshSettings = useAppStore((state) => state.refreshSettings);
  const setShowOnboarding = useAppStore((state) => state.setShowOnboarding);
  const [reverseTemplateDefaults, setReverseTemplateDefaults] = useState(SCOPED_REVERSE_SYSTEM_PROMPTS);
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<TokenStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [showTokenGuide, setShowTokenGuide] = useState(false);
  const [newTplName, setNewTplName] = useState("");
  const [newTplPrefix, setNewTplPrefix] = useState("");
  const [newTplSuffix, setNewTplSuffix] = useState("");
  const [newTplNeg, setNewTplNeg] = useState("");
  const [modelCheckKind, setModelCheckKind] = useState<"reverse" | "convert" | "">("");
  const [modelCheckMessage, setModelCheckMessage] = useState("");
  const [detectedModels, setDetectedModels] = useState<string[]>([]);
  const [detectedKind, setDetectedKind] = useState<"reverse" | "convert" | "">("");
  const [tagTestQuery, setTagTestQuery] = useState("");
  const [tagTestMessage, setTagTestMessage] = useState("");
  const [tagTestTags, setTagTestTags] = useState<TagSuggestion[]>([]);
  const [tagTesting, setTagTesting] = useState(false);
  const [aitagCacheStats, setAitagCacheStats] = useState({ bytes: 0, files: 0 });
  const [aitagCacheBusy, setAitagCacheBusy] = useState(false);
  const [aitagCacheRetentionDays, setAitagCacheRetentionDays] = useState(() => {
    const days = Number(localStorage.getItem("langbai.aitag.cache-retention-days.v1") ?? "30");
    return Number.isFinite(days) ? days : 30;
  });
  const language = settings?.language;
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);

  // Pull the versioned built-in V5 defaults from the main process, never from
  // current settings — otherwise a user's customization would be treated as
  // the default by "restore default".
  useEffect(() => {
    void window.naiDesktop.getReverseTemplateDefaults().then((defaults) => {
      if (defaults && (defaults.tags || defaults.natural || defaults.mixed)) {
        setReverseTemplateDefaults(defaults);
      }
    });
  }, []);

  useEffect(() => {
    if (section !== "storage") return;
    void window.naiDesktop.aitagCacheStats().then(setAitagCacheStats).catch(() => undefined);
  }, [section]);

  if (!settings) return null;

  const update = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    await window.naiDesktop.setSetting(key, value);
    await refreshSettings();
  };
  const updateProxy = async (mode: AppSettings["proxyMode"], value: string) => {
    await window.naiDesktop.setSetting("proxyMode", mode);
    await window.naiDesktop.setSetting("proxyUrl", value);
    await refreshSettings();
  };
  const verify = async () => {
    setChecking(true);
    const result = await window.naiDesktop.verifyToken(token);
    setStatus(result);
    setChecking(false);
    await refreshAccount();
  };
  const selectDir = async () => {
    await window.naiDesktop.selectOutputDir();
    await refreshSettings();
  };
  const clearAitagCache = async () => {
    setAitagCacheBusy(true);
    try {
      setAitagCacheStats(await window.naiDesktop.aitagClearCache());
    } finally {
      setAitagCacheBusy(false);
    }
  };
  const cacheSize = aitagCacheStats.bytes < 1024 * 1024
    ? `${(aitagCacheStats.bytes / 1024).toFixed(1)} KB`
    : `${(aitagCacheStats.bytes / (1024 * 1024)).toFixed(1)} MB`;

  function saveNewTemplate() {
    if (!newTplName.trim()) return;
    const tpl: PromptTemplate = {
      id: crypto.randomUUID(),
      name: newTplName.trim(),
      prefix: newTplPrefix.trim(),
      suffix: newTplSuffix.trim(),
      negativePrompt: newTplNeg.trim(),
    };
    const existing = settings?.promptTemplates ?? [];
    void update("promptTemplates", [...existing, tpl]);
    setNewTplName("");
    setNewTplPrefix("");
    setNewTplSuffix("");
    setNewTplNeg("");
  }

  function deleteTemplate(id: string) {
    const existing = settings?.promptTemplates ?? [];
    void update("promptTemplates", existing.filter((t) => t.id !== id));
  }

  async function detectModels(kind: "reverse" | "convert") {
    setModelCheckKind(kind);
    setModelCheckMessage(t("settings.detectModelsToast"));
    setDetectedModels([]);
    setDetectedKind("");
    const result = await window.naiDesktop.listAiModels(kind);
    setModelCheckKind("");
    setModelCheckMessage(result.message);
    setDetectedModels(result.models.slice(0, 80));
    if (result.models.length > 0) setDetectedKind(kind);
  }

  async function detectTagServer() {
    setTagTesting(true);
    setTagTestMessage(t("settings.detectTagToast"));
    setTagTestTags([]);
    const result = await window.naiDesktop.testTagServer(tagTestQuery);
    setTagTesting(false);
    setTagTestMessage(result.message);
    setTagTestTags(result.tags.slice(0, 12));
  }

  const settingsShellText = getSettingsShellText(settings.language);
  const settingsSectionText = getSettingsSectionText(settings.language);
  const nav: Array<[string, string, IconName]> = [
    ["api", settingsShellText.nav.api, "key"],
    ["storage", settingsShellText.nav.storage, "database"],
    ["backup", settingsShellText.nav.backup, "cloudSync"],
    ["ai-reverse", settingsShellText.nav["ai-reverse"], "smartToy"],
    ["convert-api", settingsShellText.nav["convert-api"], "translate"],
    ["templates", settingsShellText.nav.templates, "template"],
    ["prompt", settingsShellText.nav.prompt, "wand"],
    ["language", settingsShellText.nav.language, "globe"],
    ["appearance", settingsShellText.nav.appearance, "palette"],
    ["performance", settingsShellText.nav.performance, "speed"],
    ["about", settingsShellText.nav.about, "info"],
  ];

  return (
    <AppPortal>
      <div className="modal-backdrop">
      <div className="modal settings-modal">
        <header>
          <h2>{settingsShellText.title}</h2>
          <button aria-label={t("common.close")} onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className="settings-body">
          <nav className="settings-nav">
            {nav.map(([value, label, icon]) => (
              <button className={clsx(section === value && "active")} key={value} onClick={() => setSection(value)}>
                <Icon name={icon} /><span>{label}</span>
              </button>
            ))}
          </nav>
          <section className="settings-content">
            {section === "api" && (
              <div className="settings-form">
                <div className="account-card">
                  <strong>{t("settings.accountTitle")}</strong>
                  <span>{account.hasToken ? `${account.tierName ?? t("settings.verified")} · Anlas ${account.anlasBalance ?? t("title.unknown")}` : t("settings.noToken")}</span>
                </div>
                <SecretInput
                  label={t("settings.apiTokenLabel")}
                  value={token}
                  placeholder={t("settings.apiTokenPlaceholder")}
                  onChange={(e) => setToken(e.target.value)}
                  showLabel={t("settings.showKey")}
                  hideLabel={t("settings.hideKey")}
                />
                <div className="row-actions">
                  <Button variant="primary" disabled={checking} onClick={verify}>
                    {checking ? <IconText icon="…">{t("settings.verifying")}</IconText> : <IconText icon="✓">{t("settings.verifySave")}</IconText>}
                  </Button>
                  <Button onClick={() => setShowTokenGuide(true)}>
                    <IconText icon="❔">{t("settings.tokenGuide")}</IconText>
                  </Button>
                  <Button
                    variant="danger"
                    onClick={async () => {
                      await window.naiDesktop.clearToken();
                      await refreshAccount();
                    }}
                  >
                    <IconText icon="⇥">{t("settings.logout")}</IconText>
                  </Button>
                </div>
                {status && <div className={clsx("status-box", status.valid ? "ok" : "bad")}>{status.message}</div>}
                <label className="field">
                  <span>{t("settings.accountEndpoint")}</span>
                  <input value={settings.apiBaseUrl} onChange={(e) => void update("apiBaseUrl", e.target.value)} />
                </label>
                <label className="field">
                  <span>{t("settings.imageEndpoint")}</span>
                  <input value={settings.imageBaseUrl} onChange={(e) => void update("imageBaseUrl", e.target.value)} />
                </label>
                <label className="field-inline">
                  <input
                    type="checkbox"
                    checked={settings.allowCustomEndpoint}
                    onChange={(e) => void update("allowCustomEndpoint", e.target.checked)}
                  />
                  <span>
                    {t("settings.allowCustomEndpoint")}
                  </span>
                </label>
                {settings.allowCustomEndpoint && (
                  <label className="field-inline">
                    <input
                      type="checkbox"
                      checked={settings.allowCustomEndpointFallback}
                      onChange={(e) => void update("allowCustomEndpointFallback", e.target.checked)}
                    />
                    <span>
                      {t("settings.allowCustomEndpointFallback")}
                    </span>
                  </label>
                )}

                <div className="proxy-card">
                  <ProxyPresetControl mode={settings.proxyMode} value={settings.proxyUrl} onChange={(mode, value) => void updateProxy(mode, value)} />
                  <p className="settings-hint" style={{ margin: "2px 0 8px" }}>
                    {t("settings.proxyHint")}
                  </p>
                  <div className="proxy-scope" style={{ opacity: settings.proxyMode !== "direct" ? 1 : 0.5 }}>
                    <span className="proxy-scope-title">{t("settings.proxyScopeTitle")}</span>
                    {([
                      ["proxyForNai", t("settings.proxyForNai")],
                      ["proxyForAi", t("settings.proxyForAi")],
                      ["proxyForMcp", t("settings.proxyForMcp")],
                      ["proxyForTranslate", t("settings.proxyForTranslate")],
                      ["proxyForUpdate", t("settings.proxyForUpdate")],
                    ] as [keyof AppSettings, string][]).map(([key, label]) => (
                      <label className="checkbox-line" key={key}>
                        <input
                          type="checkbox"
                          disabled={settings.proxyMode === "direct"}
                          checked={settings[key] as boolean}
                          onChange={(e) => void update(key, e.target.checked as never)}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {section === "storage" && (
              <div className="settings-form">
                <label className="field">
                  <span>{t("settings.outputDir")}</span>
                  <input value={settings.outputDir} onChange={(e) => void update("outputDir", e.target.value)} />
                </label>
                <div className="row-actions">
                  <Button onClick={selectDir}>
                    <IconText icon={<Icon name="folder" />}>{t("settings.browse")}</IconText>
                  </Button>
                  <Button onClick={() => window.naiDesktop.openInExplorer(settings.outputDir)}>
                    <IconText icon="↗">{t("settings.openOutputDir")}</IconText>
                  </Button>
                </div>
                <Toggle
                  checked={settings.keepImageMetadata ?? true}
                  onChange={(v) => void update("keepImageMetadata", v)}
                  label={t("settings.keepMetadata")}
                  description={t("settings.keepMetadataDesc")}
                />
                <div className="info-card">
                  <strong>{t("settings.aitagCacheTitle")}</strong>
                  <span>{t("settings.aitagCacheDesc")}</span>
                  <span>{f("settings.aitagCacheSize", { files: aitagCacheStats.files, size: cacheSize })}</span>
                  <label className="field">
                    <span>{t("settings.aitagCacheRetention")}</span>
                    <select value={aitagCacheRetentionDays} onChange={(event) => {
                      const days = Number(event.target.value);
                      setAitagCacheRetentionDays(days);
                      localStorage.setItem("langbai.aitag.cache-retention-days.v1", String(days));
                    }}>
                      {[1, 7, 30, 90, 180].map((days) => <option key={days} value={days}>{f("settings.aitagCacheDays", { days })}</option>)}
                      <option value={0}>{t("settings.aitagCacheNever")}</option>
                    </select>
                  </label>
                  <div className="row-actions">
                    <Button onClick={() => void clearAitagCache()} disabled={aitagCacheBusy}>
                      {t("settings.clearAitagCache")}
                    </Button>
                  </div>
                </div>
                <LogSettingsSection
                  logDir={settings.logDir ?? ""}
                  loggingEnabled={settings.loggingEnabled ?? true}
                  refreshSettings={refreshSettings}
                />
                <ResourceDatabaseSettings language={settings.language} />
                <TagLibrarySettingsSection />
                <div className="row-actions">
                  <Button
                    onClick={() => {
                      onClose();
                      setShowOnboarding(true);
                    }}
                  >
                    <IconText icon="❔">{t("settings.onboarding")}</IconText>
                  </Button>
                </div>
                <label className="field">
                  <span>{t("settings.imageNameTemplate")}</span>
                  <input
                    value={settings.imageNameTemplate}
                    placeholder="{date}_{seq}_{model}"
                    onChange={(e) => void update("imageNameTemplate", e.target.value)}
                  />
                  <small className="settings-hint">
                    {f("settings.imageNameHint", { placeholders: "{date} {time} {seq} {seed} {model} {type} {ts}" })}
                  </small>
                </label>
                <DataPortabilitySettings language={settings.language} />
              </div>
            )}
            {section === "performance" && (
              <div className="settings-form">
                <div className="info-card">
                  <strong>{settingsSectionText.performance.strategyTitle}</strong>
                  <span>{settingsSectionText.performance.strategyDesc}</span>
                </div>
                <div className="toggle-list">
                  <Toggle
                    checked={settings.superDrop}
                    onChange={(v) => void update("superDrop", v)}
                    label={settingsSectionText.performance.superDropLabel}
                    description={settingsSectionText.performance.superDropDesc}
                  />
                  <Toggle
                    checked={settings.streamPreviewEnabled ?? true}
                    onChange={(v) => void update("streamPreviewEnabled", v)}
                    label={settingsSectionText.performance.streamPreviewLabel}
                    description={settingsSectionText.performance.streamPreviewDesc}
                  />
                </div>
                <div className="info-card">
                  <strong>{settingsSectionText.performance.persistSectionTitle}</strong>
                  <span>{settingsSectionText.performance.persistSectionDesc}</span>
                </div>
                <div className="toggle-list">
                  <Toggle
                    checked={settings.persistGenerateParams ?? true}
                    onChange={(v) => void update("persistGenerateParams", v)}
                    label={settingsSectionText.performance.persistGenerateLabel}
                    description={settingsSectionText.performance.persistGenerateDesc}
                  />
                  <Toggle
                    checked={settings.persistI2IParams ?? true}
                    onChange={(v) => void update("persistI2IParams", v)}
                    label={settingsSectionText.performance.persistI2ILabel}
                    description={settingsSectionText.performance.persistI2IDesc}
                  />
                  <Toggle
                    checked={settings.persistInpaintParams ?? true}
                    onChange={(v) => void update("persistInpaintParams", v)}
                    label={settingsSectionText.performance.persistInpaintLabel}
                    description={settingsSectionText.performance.persistInpaintDesc}
                  />
                  <Toggle
                    checked={settings.persistUpscaleParams ?? true}
                    onChange={(v) => void update("persistUpscaleParams", v)}
                    label={settingsSectionText.performance.persistUpscaleLabel}
                    description={settingsSectionText.performance.persistUpscaleDesc}
                  />
                  <Toggle
                    checked={settings.persistDirectorParams ?? true}
                    onChange={(v) => void update("persistDirectorParams", v)}
                    label={settingsSectionText.performance.persistDirectorLabel}
                    description={settingsSectionText.performance.persistDirectorDesc}
                  />
                </div>
              </div>
            )}
            {section === "about" && (
              <div className="settings-form about-settings">
                <div className="about-hero-card">
                  <img src={appIconUrl} alt="" />
                  <div>
                    <strong>{APP_NAME}</strong>
                    <span>{f("settings.aboutVersion", { version: APP_VERSION })}</span>
                  </div>
                </div>
                <label className="field">
                  <span>{t("settings.updateSource")}</span>
                  <select
                    value={settings.updateSource ?? "github"}
                    onChange={async (event) => {
                      await update("updateSource", event.target.value as AppSettings["updateSource"]);
                      await useAppStore.getState().checkUpdate();
                    }}
                  >
                    <option value="github">{t("settings.updateSourceGithub")}</option>
                    <option value="gitee">{t("settings.updateSourceGitee")}</option>
                  </select>
                  <small className="settings-hint">{t("settings.updateSourceFallback")}</small>
                </label>
                <div className="about-block">
                  <div>
                    <strong>{t("settings.aboutProjectTitle")}</strong>
                    <span>{t("settings.aboutProjectDesc")}</span>
                  </div>
                  <button
                    type="button"
                    className="about-link"
                    onClick={() => window.naiDesktop.openExternal(projectGithubUrl)}
                  >
                    {projectGithubUrl}
                  </button>
                </div>
                <div className="about-block">
                  <div>
                    <strong>{t("settings.aboutAuthorTitle")}</strong>
                    <span>{t("settings.aboutAuthorDesc")}</span>
                  </div>
                  <div className="about-copyline">
                    <span>{t("settings.aboutAuthorQq")}</span>
                    <strong>2786886095</strong>
                  </div>
                  <div className="about-copyline">
                    <span>{t("settings.aboutNovelAiGroup")}</span>
                    <strong>921985070</strong>
                  </div>
                </div>
                <div className="about-block">
                  <div>
                    <strong>{t("settings.aboutSupportTitle")}</strong>
                    <span>{t("settings.aboutSupportMessage")}</span>
                  </div>
                  <div className="reward-grid">
                    <figure>
                      <img src={rewardWechatUrl} alt={t("settings.aboutWechatReward")} />
                      <figcaption>{t("settings.aboutWechatReward")}</figcaption>
                    </figure>
                    <figure>
                      <img src={rewardAlipayUrl} alt={t("settings.aboutAlipayReward")} />
                      <figcaption>{t("settings.aboutAlipayReward")}</figcaption>
                    </figure>
                  </div>
                </div>
              </div>
            )}
            {section === "appearance" && (
              <div className="settings-form">
                <label className="field">
                  <span>{settingsSectionText.appearance.theme}</span>
                  <select value={settings.theme} onChange={(e) => void update("theme", e.target.value as AppSettings["theme"])}>
                    <option value="light">{settingsSectionText.appearance.themeLight}</option>
                    <option value="dark">{settingsSectionText.appearance.themeDark}</option>
                    <option value="system">{settingsSectionText.appearance.themeSystem}</option>
                  </select>
                </label>
                <div className="field">
                  <span>{settingsSectionText.appearance.workspaceLayout}</span>
                  <div className="row-actions">
                    <Button onClick={() => useAppStore.getState().resetWsWidths()}>
                      <IconText icon="⟲">{settingsSectionText.appearance.resetWorkspace}</IconText>
                    </Button>
                  </div>
                  <p className="field-hint">{settingsSectionText.appearance.workspaceHint}</p>
                </div>
              </div>
            )}
            {section === "language" && (
              <div className="settings-form">
                <label className="field">
                  <span>{settingsSectionText.language.language}</span>
                  <select value={settings.language} onChange={(e) => void update("language", e.target.value as AppSettings["language"])}>
                    {SUPPORTED_APP_LANGUAGES.map((language) => (
                      <option value={language.code} key={language.code}>
                        {language.menuLabel}
                      </option>
                    ))}
                  </select>
                  <small className="settings-hint">{settingsSectionText.language.hint}</small>
                </label>
              </div>
            )}
            {section === "backup" && (
              <BackupRestoreSettings settings={settings} update={update} />
            )}
            {section === "ai-reverse" && (
              <div className="settings-form">
                <p className="settings-hint">{t("settings.aiReverseHint")}</p>
                <label className="field">
                  <span>{t("settings.apiUrl")}</span>
                  <input
                    value={settings.visionApiUrl}
                    placeholder="https://api.openai.com/v1"
                    onChange={(e) => void update("visionApiUrl", e.target.value)}
                  />
                </label>
                <SecretInput
                  label="API Key"
                  value={settings.visionApiKey}
                  placeholder="sk-..."
                  onChange={(e) => void update("visionApiKey", e.target.value)}
                  showLabel={t("settings.showKey")}
                  hideLabel={t("settings.hideKey")}
                />
                <label className="field">
                  <span>{t("settings.modelName")}</span>
                  <input
                    value={settings.visionApiModel}
                    placeholder="gpt-4o"
                    onChange={(e) => void update("visionApiModel", e.target.value)}
                  />
                </label>
                <Button onClick={() => void detectModels("reverse")} disabled={modelCheckKind === "reverse"}>
                  <IconText icon="◎">{modelCheckKind === "reverse" ? t("settings.detecting") : t("settings.detectReverseModels")}</IconText>
                </Button>
                {detectedKind === "reverse" && detectedModels.length > 0 && (
                  <label className="field">
                    <span>{f("settings.detectedModelLabel", { count: detectedModels.length })}</span>
                    <select
                      value={detectedModels.includes(settings.visionApiModel) ? settings.visionApiModel : ""}
                      onChange={(e) => e.target.value && void update("visionApiModel", e.target.value)}
                    >
                      <option value="">{t("settings.chooseDetected")}</option>
                      {detectedModels.map((m) => (
                        <option value={m} key={m}>{m}</option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="info-card">
                  <strong>{t("settings.reverseTemplate")}</strong>
                  <span>{t("settings.templateMoved")}</span>
                </div>
              </div>
            )}
            {section === "convert-api" && (
              <div className="settings-form">
                <p className="settings-hint">{t("settings.convertHint")}</p>
                <label className="field">
                  <span>{t("settings.apiUrl")}</span>
                  <input
                    value={settings.convertApiUrl}
                    placeholder="https://api.openai.com/v1"
                    onChange={(e) => void update("convertApiUrl", e.target.value)}
                  />
                </label>
                <SecretInput
                  label="API Key"
                  value={settings.convertApiKey}
                  placeholder="sk-..."
                  onChange={(e) => void update("convertApiKey", e.target.value)}
                  showLabel={t("settings.showKey")}
                  hideLabel={t("settings.hideKey")}
                />
                <label className="field">
                  <span>{t("settings.modelName")}</span>
                  <input
                    value={settings.convertApiModel}
                    placeholder="gpt-4o-mini"
                    onChange={(e) => void update("convertApiModel", e.target.value)}
                  />
                </label>
                <Button onClick={() => void detectModels("convert")} disabled={modelCheckKind === "convert"}>
                  <IconText icon="◎">{modelCheckKind === "convert" ? t("settings.detecting") : t("settings.detectConvertModels")}</IconText>
                </Button>
                {detectedKind === "convert" && detectedModels.length > 0 && (
                  <label className="field">
                    <span>{f("settings.detectedModelLabel", { count: detectedModels.length })}</span>
                    <select
                      value={detectedModels.includes(settings.convertApiModel) ? settings.convertApiModel : ""}
                      onChange={(e) => e.target.value && void update("convertApiModel", e.target.value)}
                    >
                      <option value="">{t("settings.chooseDetected")}</option>
                      {detectedModels.map((m) => (
                        <option value={m} key={m}>{m}</option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="info-card">
                  <strong>{t("settings.convertTemplate")}</strong>
                  <span>{t("settings.templateMoved")}</span>
                </div>
              </div>
            )}
            {modelCheckMessage && (section === "ai-reverse" || section === "convert-api") && (
              <div className="status-box ok model-check-result">
                <strong>{modelCheckMessage}</strong>
                {detectedModels.length > 0 && <small>{detectedModels.join(", ")}</small>}
              </div>
            )}
            {section === "templates" && (
              <div className="settings-form">
                <div className="info-card">
                  <strong>{t("settings.unifiedTemplate")}</strong>
                  <span>{t("settings.unifiedTemplateDesc")}</span>
                </div>
                <VersionedModeTemplateEditor
                  title={t("settings.reverseTemplateTitle")}
                  values={{
                    "v4.5": settings.reversePromptTemplatesV45,
                    v5: settings.reversePromptTemplates,
                  }}
                  defaults={{
                    "v4.5": V45_SCOPED_REVERSE_SYSTEM_PROMPTS,
                    v5: reverseTemplateDefaults,
                  }}
                  onChange={(version, next) => void update(
                    version === "v4.5" ? "reversePromptTemplatesV45" : "reversePromptTemplates",
                    next,
                  )}
                />
                <VersionedModeTemplateEditor
                  title={t("settings.convertTemplateTitle")}
                  values={{
                    "v4.5": settings.convertPromptTemplatesV45,
                    v5: settings.convertPromptTemplates,
                  }}
                  defaults={{
                    "v4.5": V45_CONVERT_SYSTEM_PROMPTS,
                    v5: CONVERT_SYSTEM_PROMPTS,
                  }}
                  onChange={(version, next) => void update(
                    version === "v4.5" ? "convertPromptTemplatesV45" : "convertPromptTemplates",
                    next,
                  )}
                />
                <SingleTemplateEditor
                  title={t("settings.comicAnalyzeTemplateTitle")}
                  description={t("settings.singleTemplateShared")}
                  value={settings.comicAnalyzePromptTemplate}
                  defaultValue={COMIC_ANALYZE_SYSTEM_PROMPT}
                  onChange={(next) => void update("comicAnalyzePromptTemplate", next)}
                />
              </div>
            )}
            {section === "prompt" && (
              <div className="settings-form">
                <div className="toggle-list">
                  <Toggle checked={settings.autoComplete} onChange={(v) => void update("autoComplete", v)} label={t("settings.autoComplete")} description={t("settings.autoCompleteDesc")} />
                  <Toggle checked={settings.tagServerEnabled} onChange={(v) => void update("tagServerEnabled", v)} label={t("settings.tagServerEnabled")} description={t("settings.tagServerEnabledDesc")} />
                </div>
                <div className="tag-server-card">
                  <label className="field">
                    <span>{t("settings.tagServerType")}</span>
                    <select value={settings.tagServerType} onChange={(e) => void update("tagServerType", e.target.value as AppSettings["tagServerType"])}>
                      <option value="rest">{t("settings.transportRest")}</option>
                      <option value="http">{t("settings.transportHttp")}</option>
                      <option value="sse">{t("settings.transportSse")}</option>
                      <option value="stdio">{t("settings.transportStdio")}</option>
                    </select>
                  </label>
                  {settings.tagServerType === "stdio" ? (
                    <>
                      <label className="field">
                        <span>{t("settings.command")}</span>
                        <input
                          value={settings.tagServerCommand}
                          placeholder={t("settings.commandPlaceholder")}
                          onChange={(e) => void update("tagServerCommand", e.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>{t("settings.args")}</span>
                        <input
                          value={settings.tagServerArgs}
                          placeholder={t("settings.argsPlaceholder")}
                          onChange={(e) => void update("tagServerArgs", e.target.value)}
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="field">
                        <span>{settings.tagServerType === "rest" ? t("settings.serviceUrl") : t("settings.mcpUrl")}</span>
                        <input
                          value={settings.tagServerUrl}
                          placeholder={settings.tagServerType === "rest" ? t("settings.serviceUrlPlaceholder") : t("settings.mcpUrlPlaceholder")}
                          onChange={(e) => void update("tagServerUrl", e.target.value)}
                        />
                      </label>
                      <SecretInput
                        label={t("settings.serviceKey")}
                        value={settings.tagServerApiKey}
                        placeholder={t("settings.serviceKeyPlaceholder")}
                        onChange={(e) => void update("tagServerApiKey", e.target.value)}
                        showLabel={t("settings.showKey")}
                        hideLabel={t("settings.hideKey")}
                      />
                    </>
                  )}
                  {settings.tagServerType !== "rest" && (
                    <label className="field">
                      <span>{t("settings.mcpTool")}</span>
                      <input
                        value={settings.tagServerTool}
                        placeholder="search_tags"
                        onChange={(e) => void update("tagServerTool", e.target.value)}
                      />
                    </label>
                  )}
                  <div className="history-group-create">
                    <input value={tagTestQuery} onChange={(e) => setTagTestQuery(e.target.value)} placeholder={t("settings.testSearchPlaceholder")} />
                    <button type="button" onClick={() => void detectTagServer()} disabled={tagTesting}>
                      {tagTesting ? t("settings.testing") : t("settings.test")}
                    </button>
                  </div>
                  {tagTestMessage && (
                    <div className={clsx("status-box", tagTestTags.length > 0 ? "ok" : "bad")}>
                      <strong>{tagTestMessage}</strong>
                      {tagTestTags.length > 0 && <small>{tagTestTags.map((tag) => tag.tag).join(", ")}</small>}
                    </div>
                  )}
                  <div className="toggle-list" style={{ marginTop: 4 }}>
                    <Toggle checked={settings.mcpForCapsule} onChange={(v) => void update("mcpForCapsule", v)} label={t("settings.mcpForCapsule")} description={t("settings.mcpForCapsuleDesc")} />
                    <Toggle checked={settings.mcpForReverse} onChange={(v) => void update("mcpForReverse", v)} label={t("settings.mcpForReverse")} description={t("settings.mcpForReverseDesc")} />
                    <Toggle checked={settings.mcpForConvert} onChange={(v) => void update("mcpForConvert", v)} label={t("settings.mcpForConvert")} description={t("settings.mcpForConvertDesc")} />
                  </div>
                </div>
                <div className="tag-server-card">
                  <p className="settings-hint" style={{ margin: 0 }}>{t("settings.translateHint")}</p>
                  <label className="field">
                    <span>{t("settings.translateEngine")}</span>
                    <select value={settings.translateProvider} onChange={(e) => void update("translateProvider", e.target.value as AppSettings["translateProvider"])}>
                      <option value="google">{t("settings.googleTranslate")}</option>
                      <option value="baidu">{t("settings.baiduTranslate")}</option>
                    </select>
                  </label>
                  {settings.translateProvider === "baidu" && (
                    <>
                      <label className="field">
                        <span>{t("settings.baiduAppId")}</span>
                        <input
                          value={settings.baiduAppId}
                          placeholder={t("settings.baiduAppIdPlaceholder")}
                          onChange={(e) => void update("baiduAppId", e.target.value)}
                        />
                      </label>
                      <SecretInput
                        label={t("settings.baiduSecret")}
                        value={settings.baiduSecret}
                        placeholder={t("settings.baiduSecretPlaceholder")}
                        onChange={(e) => void update("baiduSecret", e.target.value)}
                        showLabel={t("settings.showKey")}
                        hideLabel={t("settings.hideKey")}
                      />
                    </>
                  )}
                </div>
                <p className="settings-hint">{t("settings.promptTemplateHint")}</p>
                {(settings.promptTemplates ?? []).length === 0 && (
                  <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("settings.noTemplates")}</p>
                )}
                {(settings.promptTemplates ?? []).map((tpl) => (
                  <div className="tpl-item" key={tpl.id}>
                    <div className="tpl-item-head">
                      <strong>{tpl.name}</strong>
                      <Button variant="ghost" onClick={() => deleteTemplate(tpl.id)}>
                        <IconText icon="✕">{t("settings.delete")}</IconText>
                      </Button>
                    </div>
                    {tpl.prefix && <small>{f("settings.prefix", { value: tpl.prefix })}</small>}
                    {tpl.suffix && <small>{f("settings.suffix", { value: tpl.suffix })}</small>}
                    {tpl.negativePrompt && <small>{f("settings.negative", { value: tpl.negativePrompt })}</small>}
                  </div>
                ))}
                <div className="tpl-new">
                  <strong style={{ fontSize: 12 }}>{t("settings.newTemplate")}</strong>
                  <label className="field">
                    <span>{t("settings.templateName")}</span>
                    <input value={newTplName} placeholder={t("settings.templateNamePlaceholder")} onChange={(e) => setNewTplName(e.target.value)} />
                  </label>
                  <label className="field">
                    <span>{t("settings.prefixLabel")}</span>
                    <input value={newTplPrefix} placeholder="masterpiece, best quality, " onChange={(e) => setNewTplPrefix(e.target.value)} />
                  </label>
                  <label className="field">
                    <span>{t("settings.suffixLabel")}</span>
                    <input value={newTplSuffix} placeholder="4k, ultra detail" onChange={(e) => setNewTplSuffix(e.target.value)} />
                  </label>
                  <label className="field">
                    <span>{t("settings.negativePromptOptional")}</span>
                    <input value={newTplNeg} placeholder="lowres, bad anatomy, ..." onChange={(e) => setNewTplNeg(e.target.value)} />
                  </label>
                  <Button variant="primary" onClick={saveNewTemplate} disabled={!newTplName.trim()}>
                    <IconText icon="+">{t("settings.addTemplate")}</IconText>
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>
        <footer>
          <Button variant="primary" onClick={onClose}>
            <IconText icon="✓">{t("settings.close")}</IconText>
          </Button>
        </footer>
      </div>
      </div>
      {showTokenGuide && <TokenGuideModal onClose={() => setShowTokenGuide(false)} />}
    </AppPortal>
  );
}

// ── Onboarding wizard ─────────────────────────────────────────────────────────
function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [token, setToken] = useState("");
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [showTokenGuide, setShowTokenGuide] = useState(false);
  const [onboardingProxyMode, setOnboardingProxyMode] = useState<AppSettings["proxyMode"]>("auto");
  const [onboardingProxyUrl, setOnboardingProxyUrl] = useState("");
  const settings = useAppStore((state) => state.settings);
  const load = useAppStore((state) => state.load);
  const setShowOnboarding = useAppStore((state) => state.setShowOnboarding);
  const refreshSettings = useAppStore((state) => state.refreshSettings);
  const refreshAccount = useAppStore((state) => state.refreshAccount);
  const account = useAppStore((state) => state.account);
  const language = settings?.language;
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);
  const cards = [
    { badge: t("onboarding.card0.badge"), title: t("onboarding.card0.title"), desc: t("onboarding.card0.desc") },
    { badge: t("onboarding.card1.badge"), title: t("onboarding.card1.title"), desc: t("onboarding.card1.desc") },
    { badge: t("onboarding.card2.badge"), title: t("onboarding.card2.title"), desc: t("onboarding.card2.desc") },
    { badge: t("onboarding.card3.badge"), title: t("onboarding.card3.title"), desc: t("onboarding.card3.desc") },
    { badge: t("onboarding.card4.badge"), title: t("onboarding.card4.title"), desc: t("onboarding.card4.desc") },
    { badge: t("onboarding.card5.badge"), title: t("onboarding.card5.title"), desc: t("onboarding.card5.desc") },
    { badge: t("onboarding.card6.badge"), title: t("onboarding.card6.title"), desc: t("onboarding.card6.desc") },
    { badge: t("onboarding.card7.badge"), title: t("onboarding.card7.title"), desc: t("onboarding.card7.desc") },
  ];
  useEffect(() => {
    if (settings) {
      setOnboardingProxyMode(settings.proxyMode);
      setOnboardingProxyUrl(settings.proxyUrl);
    }
  }, [settings?.proxyMode, settings?.proxyUrl]);
  const finish = async () => {
    await window.naiDesktop.completeSetup();
    await load();
    setShowOnboarding(false);
  };
  const verify = async () => {
    setChecking(true);
    const result = await window.naiDesktop.verifyToken(token);
    setTokenStatus(result);
    setChecking(false);
    await refreshAccount();
  };

  return (
    <AppPortal>
      <div className="modal-backdrop onboarding-backdrop">
      <div className="onboarding">
        <div className="onboarding-top">
          <div className="dots">
            {cards.map((_, index) => (
              <span key={index} className={clsx(index === step && "active")} />
            ))}
          </div>
          <button onClick={finish}>{t("onboarding.skip")}</button>
        </div>
        <div className="onboarding-body">
          <aside className="onboarding-card">
            <div className="card-head">
              <strong>{APP_NAME}</strong>
              <span>{f("onboarding.step", { current: step + 1, total: cards.length })}</span>
            </div>
            <div className="onboarding-hero-asset">
              <img src={onboardingHeroUrl} alt="" />
            </div>
            <div className="card-foot">ⓘ {cards[step].badge}</div>
          </aside>
          <section className="onboarding-content">
            <h2>{cards[step].title}</h2>
            <p>{cards[step].desc}</p>
            {step === 0 && (
              <div className="settings-form">
                <div className="intro-grid">
                  <div><strong>{t("onboarding.text2imgTitle")}</strong><span>{t("onboarding.text2imgDesc")}</span></div>
                  <div><strong>{t("onboarding.redrawTitle")}</strong><span>{t("onboarding.redrawDesc")}</span></div>
                  <div><strong>{t("onboarding.directorTitle")}</strong><span>{t("onboarding.directorDesc")}</span></div>
                  <div><strong>{t("onboarding.tagsTitle")}</strong><span>{t("onboarding.tagsDesc")}</span></div>
                </div>
                <div className="row-actions">
                  <Button onClick={() => window.naiDesktop.openExternal("https://github.com/2786886095/novelai-image-desktop")}>
                    <IconText icon="↗">{t("onboarding.github")}</IconText>
                  </Button>
                </div>
                <label className="field wide">
                  <span>{t("onboarding.language")}</span>
                  <select defaultValue={settings?.language ?? "zh-CN"} onChange={(e) => window.naiDesktop.setSetting("language", e.target.value as AppSettings["language"])}>
                    {SUPPORTED_APP_LANGUAGES.map((language) => (
                      <option value={language.code} key={language.code}>
                        {language.menuLabel}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {step === 1 && (
              <div className="onboarding-proxy">
                <div className="onboarding-network-warning">
                  {t("onboarding.networkWarning")}
                </div>
                <ProxyPresetControl
                  mode={onboardingProxyMode}
                  value={onboardingProxyUrl}
                  onChange={(mode, value) => {
                    setOnboardingProxyMode(mode);
                    setOnboardingProxyUrl(value);
                    void (async () => {
                      await window.naiDesktop.setSetting("proxyMode", mode);
                      await window.naiDesktop.setSetting("proxyUrl", value);
                    })();
                  }}
                />
              </div>
            )}
            {step === 2 && (
              <div className="settings-form">
                {account.hasToken && !tokenStatus && (
                  <div className="status-box ok">{t("onboarding.tokenConfigured")}</div>
                )}
                <SecretInput
                  className="wide"
                  label={t("settings.apiTokenLabel")}
                  value={token}
                  placeholder={account.hasToken ? t("onboarding.tokenKeep") : t("settings.apiTokenPlaceholder")}
                  onChange={(e) => setToken(e.target.value)}
                  showLabel={t("settings.showKey")}
                  hideLabel={t("settings.hideKey")}
                />
                <div className="row-actions">
                  <Button variant="primary" onClick={verify} disabled={checking}>
                    {checking ? <IconText icon="…">{t("settings.verifying")}</IconText> : <IconText icon="✓">{t("onboarding.verifySave")}</IconText>}
                  </Button>
                  <Button onClick={() => setShowTokenGuide(true)}>
                    <IconText icon="❔">{t("settings.tokenGuide")}</IconText>
                  </Button>
                </div>
                {tokenStatus && <div className={clsx("status-box", tokenStatus.valid ? "ok" : "bad")}>{tokenStatus.message}</div>}
              </div>
            )}
            {step === 3 && (
              <div className="settings-form">
                <p className="settings-hint" style={{ margin: 0 }}>{t("onboarding.optionalHint")}</p>
                <SecretInput
                  className="wide"
                  label={t("onboarding.visionKeyLabel")}
                  defaultValue={settings?.visionApiKey ?? ""}
                  placeholder={t("onboarding.visionKeyPlaceholder")}
                  onChange={(e) => void window.naiDesktop.setSetting("visionApiKey", e.target.value)}
                  showLabel={t("settings.showKey")}
                  hideLabel={t("settings.hideKey")}
                />
                <SecretInput
                  className="wide"
                  label={t("onboarding.convertKeyLabel")}
                  defaultValue={settings?.convertApiKey ?? ""}
                  placeholder={t("onboarding.convertKeyPlaceholder")}
                  onChange={(e) => void window.naiDesktop.setSetting("convertApiKey", e.target.value)}
                  showLabel={t("settings.showKey")}
                  hideLabel={t("settings.hideKey")}
                />
                <label className="field wide">
                  <span>{t("settings.translateEngine")}</span>
                  <select
                    defaultValue={settings?.translateProvider ?? "google"}
                    onChange={(e) => void window.naiDesktop.setSetting("translateProvider", e.target.value as AppSettings["translateProvider"])}
                  >
                    <option value="google">{t("settings.googleTranslate")}</option>
                    <option value="baidu">{t("settings.baiduTranslate")}</option>
                  </select>
                </label>
              </div>
            )}
            {step === 4 && (
              <div className="settings-form">
                <label className="field wide">
                  <span>{t("onboarding.currentOutputDir")}</span>
                  <input readOnly value={settings?.outputDir ?? ""} />
                </label>
                <Button
                  onClick={async () => {
                    const selected = await window.naiDesktop.selectOutputDir();
                    if (selected) {
                      await refreshSettings();
                      setShowOnboarding(true);
                    }
                  }}
                >
                  <IconText icon={<Icon name="folder" />}>{t("settings.browse")}</IconText>
                </Button>
                <Toggle
                  checked={settings?.keepImageMetadata ?? true}
                  onChange={(v) =>
                    void (async () => {
                      await window.naiDesktop.setSetting("keepImageMetadata", v);
                      await load();
                    })()
                  }
                  label={t("settings.keepMetadata")}
                  description={t("settings.keepMetadataDesc")}
                />
              </div>
            )}
            {step === 5 && (
              <div className="settings-form">
                <TagLibrarySettingsSection />
              </div>
            )}
            {step === 6 && (
              <div className="intro-grid">
                <div><strong>{t("onboarding.leftTitle")}</strong><span>{t("onboarding.leftDesc")}</span></div>
                <div><strong>{t("onboarding.centerTitle")}</strong><span>{t("onboarding.centerDesc")}</span></div>
                <div><strong>{t("onboarding.rightTitle")}</strong><span>{t("onboarding.rightDesc")}</span></div>
                <div><strong>{t("onboarding.completeTitle")}</strong><span>{t("onboarding.completeDesc")}</span></div>
              </div>
            )}
            {step === 7 && <div className="done-mark"><Icon name="check" /></div>}
          </section>
        </div>
        <div className="onboarding-footer">
          <Button disabled={step === 0} onClick={() => setStep((v) => Math.max(0, v - 1))}>{t("onboarding.prev")}</Button>
          {step < cards.length - 1
            ? <Button variant="primary" onClick={() => setStep((v) => Math.min(cards.length - 1, v + 1))}>{t("onboarding.next")}</Button>
            : <Button variant="primary" onClick={finish}>{t("onboarding.start")}</Button>}
        </div>
      </div>
      </div>
      {showTokenGuide && <TokenGuideModal onClose={() => setShowTokenGuide(false)} />}
    </AppPortal>
  );
}

// ── Update banner ─────────────────────────────────────────────────────────────
function UpdateBanner() {
  const updateInfo = useAppStore((state) => state.updateInfo);
  const dismissUpdate = useAppStore((state) => state.dismissUpdate);
  const updateProgress = useAppStore((state) => state.updateProgress);
  const downloadUpdate = useAppStore((state) => state.downloadUpdate);
  const language = useAppStore((state) => state.settings?.language);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);
  // Always render an element so .app-shell keeps a stable 6-row grid; the empty
  // slot collapses to 0 height when there's no update.
  if (!updateInfo?.hasUpdate) return <div className="update-banner-slot" />;

  // Windows downloads a verified Setup.exe from Gitee (GitHub fallback), so
  // both installed and portable builds share the same update experience.
  const manualOnly = window.naiDesktop.platform !== "win32";
  const busy = updateProgress?.kind === "checking" || updateProgress?.kind === "progress";
  const downloaded = updateProgress?.kind === "downloaded";
  const failed = updateProgress?.kind === "error";

  return (
    <div className="update-banner">
      <span>
        <Icon name="upgrade" /> {f("update.newVersion", { latest: updateInfo.latestVersion, current: updateInfo.currentVersion })}
        {failed && <> · {updateProgress.message}</>}
      </span>
      <div className="update-banner-actions">
        {manualOnly ? (
          <button
            className="btn btn-primary"
            onClick={() => updateInfo.releaseUrl && void window.naiDesktop.openExternal(updateInfo.releaseUrl)}
          >
            {t("update.download")}
          </button>
        ) : downloaded ? (
          <button className="btn btn-primary" disabled>
            {t("update.autoRestarting")}
          </button>
        ) : (
          <button className="btn btn-primary" disabled={busy} onClick={() => void downloadUpdate()}>
            {updateProgress?.kind === "progress"
              ? f("update.downloading", { percent: updateProgress.percent })
              : busy
                ? t("update.checking")
                : t("update.downloadInApp")}
          </button>
        )}
        {!busy && !downloaded ? <button className="btn btn-ghost" onClick={dismissUpdate}>{t("update.later")}</button> : null}
      </div>
    </div>
  );
}

function VersionedModeTemplateEditor({
  title,
  values,
  defaults,
  onChange,
}: {
  title: string;
  values: Record<ReversePromptTemplateVersion, ModePromptTemplates>;
  defaults: Record<ReversePromptTemplateVersion, ModePromptTemplates>;
  onChange: (
    version: ReversePromptTemplateVersion,
    next: ModePromptTemplates,
  ) => void;
}) {
  const language = useAppStore((state) => state.settings?.language);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const [version, setVersion] = useState<ReversePromptTemplateVersion>("v5");
  return (
    <div className="versioned-template-editor">
      <div className="mode-selector compact template-version-selector" role="group" aria-label={title}>
        {(["v4.5", "v5"] as const).map((item) => (
          <button
            type="button"
            key={item}
            className={clsx("mode-btn", version === item && "active")}
            onClick={() => setVersion(item)}
          >
            {t(`inspect.templateVersion.${item === "v4.5" ? "v45" : "v5"}`)}
          </button>
        ))}
      </div>
      <ModeTemplateEditor
        title={title}
        value={values[version]}
        defaults={defaults[version]}
        onChange={(next) => onChange(version, next)}
      />
    </div>
  );
}

const V5_MIGRATION_NOTICE_KEY = "langbai.notice.v5-model-migration.seen";
const V5_MIGRATION_NOTICE_LEGACY_KEY = "langbai.notice.v5-model-migration.v2";
const V5_MIGRATION_NOTICE_TEXT = {
  "zh-CN": {
    eyebrow: "模型更新提醒",
    title: "NovelAI V5 Full 已上线",
    body: "为避免改变旧项目的复现结果，升级软件不会强制覆盖你已经保存的模型。旧用户如仍显示 V4 / V4.5，请在生成页的模型列表中手动选择 NAI Diffusion V5 Full；新建默认配置已经使用 V5 Full。",
    risk: "V5 的训练分布与旧模型不同，V4 / V4.5 时期的画师标签或画师串可能弱化、失效或呈现不同效果。需要复现旧结果时请保留旧模型，并在切换后重新测试画师串。",
    keep: "保持当前模型",
    go: "前往模型选择",
  },
  "zh-TW": {
    eyebrow: "模型更新提醒",
    title: "NovelAI V5 Full 已上線",
    body: "為避免改變舊專案的重現結果，升級軟體不會強制覆蓋已儲存的模型。舊使用者若仍顯示 V4 / V4.5，請在生成頁的模型清單中手動選擇 NAI Diffusion V5 Full；新建預設已使用 V5 Full。",
    risk: "V5 的訓練分佈與舊模型不同，V4 / V4.5 時期的畫師標籤或畫師串可能減弱、失效或呈現不同效果。需要重現舊結果時請保留舊模型，並在切換後重新測試畫師串。",
    keep: "保留目前模型",
    go: "前往模型選擇",
  },
  "en-US": {
    eyebrow: "Model update",
    title: "NovelAI V5 Full is available",
    body: "Upgrades intentionally preserve the model saved in existing projects so their results remain reproducible. If an older installation still shows V4 or V4.5, choose NAI Diffusion V5 Full manually on Generate. New default configurations already use V5 Full.",
    risk: "V5 has a different training distribution. Artist tags or artist strings tuned for V4/V4.5 may become weaker, stop working, or look different. Keep the legacy model for reproducibility and retest strings after switching.",
    keep: "Keep current model",
    go: "Open model selector",
  },
  "ja-JP": {
    eyebrow: "モデル更新のお知らせ",
    title: "NovelAI V5 Full が利用できます",
    body: "既存プロジェクトの再現性を守るため、更新時に保存済みモデルを強制変更しません。旧環境で V4 / V4.5 のままの場合は、生成画面のモデル一覧から NAI Diffusion V5 Full を手動で選択してください。新規既定値は V5 Full です。",
    risk: "V5 は旧モデルと学習分布が異なるため、V4 / V4.5 向けの画家タグや画家列が弱くなる、効かなくなる、または違う結果になる場合があります。再現には旧モデルを残し、切替後に再検証してください。",
    keep: "現在のモデルを維持",
    go: "モデル選択へ",
  },
  "ko-KR": {
    eyebrow: "모델 업데이트 안내",
    title: "NovelAI V5 Full을 사용할 수 있습니다",
    body: "기존 프로젝트의 재현 결과를 보호하기 위해 업데이트가 저장된 모델을 강제로 변경하지 않습니다. 이전 설치에서 V4 / V4.5가 계속 표시되면 생성 화면의 모델 목록에서 NAI Diffusion V5 Full을 직접 선택하세요. 새 기본 구성은 V5 Full입니다.",
    risk: "V5는 이전 모델과 학습 분포가 달라 V4/V4.5용 작가 태그나 작가 문자열이 약해지거나 작동하지 않거나 다른 결과를 낼 수 있습니다. 재현이 필요하면 이전 모델을 유지하고 전환 후 다시 테스트하세요.",
    keep: "현재 모델 유지",
    go: "모델 선택으로 이동",
  },
} as const;

function V5MigrationNotice() {
  const paramsModel = useAppStore((state) => state.params.model);
  const settings = useAppStore((state) => state.settings);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const captureMode = new URLSearchParams(window.location.search).has("uiCapture");
  const [dismissed, setDismissed] = useState(() => captureMode
    || localStorage.getItem(V5_MIGRATION_NOTICE_KEY) === "seen"
    || localStorage.getItem(V5_MIGRATION_NOTICE_LEGACY_KEY) === "dismissed");
  const shouldShow = Boolean(settings && !dismissed && !isNAIV5Model(paramsModel));
  useEffect(() => {
    if (!shouldShow) return;
    // Mark as seen when the dialog is first presented, not only after a button
    // click, so a force-close while it is open cannot make it recur forever.
    localStorage.setItem(V5_MIGRATION_NOTICE_KEY, "seen");
  }, [shouldShow]);
  if (!shouldShow || !settings) return null;
  const text = V5_MIGRATION_NOTICE_TEXT[settings.language ?? "zh-CN"] ?? V5_MIGRATION_NOTICE_TEXT["zh-CN"];
  const dismiss = () => {
    localStorage.setItem(V5_MIGRATION_NOTICE_KEY, "seen");
    setDismissed(true);
  };
  return (
    <AppPortal>
      <div className="modal-backdrop v5-migration-backdrop">
        <section className="modal v5-migration-notice" role="dialog" aria-modal="true" aria-labelledby="v5-migration-title">
          <span className="v5-migration-mark" aria-hidden="true"><Icon name="sparkles" /></span>
          <div className="v5-migration-copy">
            <small>{text.eyebrow}</small>
            <h2 id="v5-migration-title">{text.title}</h2>
            <p>{text.body}</p>
            <p className="v5-migration-risk">{text.risk}</p>
          </div>
          <footer>
            <Button onClick={dismiss}>{text.keep}</Button>
            <Button variant="primary" onClick={() => { dismiss(); setActiveTab("generate"); }}>{text.go}</Button>
          </footer>
        </section>
      </div>
    </AppPortal>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
// Draggable splitter between workspace rails. Drag = resize; double-click = reset.
// Width changes apply live (store) and persist to localStorage on release.
function WorkspaceResizer({ edge }: { edge: "left" | "right" }) {
  const width = useAppStore((s) => (edge === "left" ? s.wsLeftWidth : s.wsRightWidth));
  const setWsWidth = useAppStore((s) => s.setWsWidth);
  const saveWsWidths = useAppStore((s) => s.saveWsWidths);
  const resetWsWidths = useAppStore((s) => s.resetWsWidths);
  const language = useAppStore((s) => s.settings?.language);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const drag = useRef<{ startX: number; startW: number } | null>(null);

  return (
    <div
      className={clsx("ws-resizer", edge)}
      role="separator"
      aria-orientation="vertical"
      title={t("workspace.resizeTitle")}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { startX: e.clientX, startW: width };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.startX;
        setWsWidth(edge, drag.current.startW + (edge === "left" ? dx : -dx));
      }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        drag.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        saveWsWidths();
      }}
      onDoubleClick={() => resetWsWidths()}
    >
      <span className="ws-resizer-grip" />
      <button
        type="button"
        className="ws-resizer-reset"
        title={t("workspace.resetTitle")}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          resetWsWidths();
        }}
      >
        <Icon name="refresh" />
      </button>
    </div>
  );
}

function PersistentTabView({
  active,
  children,
  scope,
}: {
  active: boolean;
  children: React.ReactNode;
  scope: string;
}) {
  const [hasMounted, setHasMounted] = useState(active);
  useEffect(() => {
    if (active) setHasMounted(true);
  }, [active]);
  if (!hasMounted && !active) return null;
  return (
    <div
      className={clsx("persistent-tools-view", !active && "is-hidden")}
      aria-hidden={!active}
    >
      <AppErrorBoundary scope={scope} resetKey={active}>
        {children}
      </AppErrorBoundary>
    </div>
  );
}

function MainPage() {
  const showSettings = useAppStore((state) => state.showSettings);
  const setShowSettings = useAppStore((state) => state.setShowSettings);
  const showOnboarding = useAppStore((state) => state.showOnboarding);
  const statusText = useAppStore((state) => state.statusText);
  const toast = useAppStore((state) => state.toast);
  const clearToast = useAppStore((state) => state.clearToast);
  const currentImage = useAppStore((state) => state.currentImage);
  const activeTab = useAppStore((state) => state.activeTab);
  const settings = useAppStore((state) => state.settings);
  const language = settings?.language;
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const wsLeftWidth = useAppStore((state) => state.wsLeftWidth);
  const wsRightWidth = useAppStore((state) => state.wsRightWidth);
  const uiCaptureParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const uiCaptureTheme = uiCaptureParams.get("uiTheme");
  // Final render-boundary guard: even if a future IPC path forgets to sanitize
  // an upstream HTML error page, it can never expand across the application.
  const displayStatusText = useMemo(
    () => statusText ? compactRemoteErrorText(statusText, { serviceLabel: "NovelAI API 源", maxLength: 240 }) : "",
    [statusText],
  );
  const displayToast = useMemo(
    () => toast ? compactRemoteErrorText(toast, { serviceLabel: "NovelAI API 源", maxLength: 360 }) : "",
    [toast],
  );

  useEffect(() => {
    const captureSurface = uiCaptureParams.get("uiCapture");
    if (captureSurface) useAppStore.getState().setShowOnboarding(false);
    if (captureSurface === "opusUsage" || captureSurface === "opusInline") {
      useAppStore.setState({
        account: {
          hasToken: true,
          tierName: "Opus",
          tierLevel: 3,
          anlasBalance: 10_000,
          opusUsage: { percent: 73.4, isNegative: false, timeUntilNextPercent: 6042 },
          opusUsageUpdatedAt: Date.now(),
        },
      });
    }
    if (isActiveTab(captureSurface)) {
      useAppStore.getState().setActiveTab(captureSurface);
    } else if (captureSurface === "aitag") {
      useAppStore.getState().setActiveTab("onlineGallery");
    } else if (captureSurface === "randomArtist" || captureSurface === "v5ArtistRepair" || captureSurface === "artistStringDraw") {
      useAppStore.getState().setActiveTab("tools");
    } else if (captureSurface === "settings") {
      useAppStore.getState().setShowSettings(true);
    }
  }, [uiCaptureParams]);

  // Apply theme class
  useEffect(() => {
    if (!settings) return;
    if (uiCaptureTheme === "dark" || uiCaptureTheme === "light") {
      document.documentElement.classList.toggle("theme-dark", uiCaptureTheme === "dark");
      return;
    }
    const resolved =
      settings.theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : settings.theme;
    document.documentElement.classList.toggle("theme-dark", resolved === "dark");
  }, [settings?.theme, uiCaptureTheme]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(clearToast, 4500);
    return () => window.clearTimeout(timer);
  }, [toast, clearToast]);

  return (
    <div className="app-shell">
      <AppTitleBar />
      <UpdateBanner />
      <V5MigrationNotice />
      <AppMenuBar openSettings={() => setShowSettings(true)} />
      <AppTabBar />
      <div
        className={clsx("workspace", WIDE_WORKSPACE_TABS.has(activeTab) && "workspace-tools")}
        style={{ "--ws-left": `${wsLeftWidth}px`, "--ws-right": `${wsRightWidth}px` } as CSSProperties}
      >
        <AppErrorBoundary key={activeTab} scope={`tab:${activeTab}`}>
          {activeTab === "metadata" || activeTab === "tools" || activeTab === "referencePresets" || activeTab === "onlineGallery" || activeTab === "agent" ? null : activeTab === "records" ? (
            <AiLogPanel />
          ) : (
            <>
              <LeftPanel openSettings={() => setShowSettings(true)} />
              <WorkspaceResizer edge="left" />
              {activeTab === "inpaint" ? (
                <Suspense fallback={<div className="lazy-tool-loading">{t("tool.loadingInpaint")}</div>}>
                  <InpaintCanvas />
                </Suspense>
              ) : (
                <ImageCanvas />
              )}
              <WorkspaceResizer edge="right" />
              <HistoryPanel />
            </>
          )}
        </AppErrorBoundary>
        <PersistentTabView active={activeTab === "tools"} scope="tab:tools">
          <Suspense fallback={<div className="lazy-tool-loading">{t("tool.loadingTools")}</div>}>
            <ToolsHub />
          </Suspense>
        </PersistentTabView>
        <PersistentTabView active={activeTab === "metadata"} scope="tab:metadata">
          <Suspense fallback={<div className="lazy-tool-loading">{t("tool.loadingTools")}</div>}>
            <MetadataInspector onBack={() => useAppStore.getState().setActiveTab("generate")} />
          </Suspense>
        </PersistentTabView>
        <PersistentTabView active={activeTab === "onlineGallery"} scope="tab:onlineGallery">
          <Suspense fallback={<div className="lazy-tool-loading">{t("tool.loadingTools")}</div>}>
            <OnlineGalleryPage />
          </Suspense>
        </PersistentTabView>
        <PersistentTabView active={activeTab === "agent"} scope="tab:agent">
          <Suspense fallback={<div className="lazy-tool-loading">{t("tool.loadingTools")}</div>}>
            <AgentPage />
          </Suspense>
        </PersistentTabView>
        <PersistentTabView active={activeTab === "referencePresets"} scope="tab:referencePresets">
          <ReferencePresetManager onBack={() => useAppStore.getState().setActiveTab("tools")} />
        </PersistentTabView>
      </div>
      <footer className="status-bar">
        <span className="status-bar-message" title={displayStatusText}>{displayStatusText}</span>
        {currentImage && (
          <span>{format(new Date(currentImage.createdAt), "yyyy-MM-dd HH:mm:ss")}</span>
        )}
      </footer>
      {showOnboarding && <OnboardingWizard />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {displayToast && (
        <div className="toast" role="alert">
          <span>{displayToast}</span>
          <button type="button" aria-label={t("common.close")} title={t("common.close")} onClick={clearToast}>
            <Icon name="close" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const SPLASH_MIN_VISIBLE_MS = 900;
  const [splash, setSplash] = useState(true);
  const bootDone = useAppStore((state) => state.bootDone);
  const load = useAppStore((state) => state.load);
  const checkUpdate = useAppStore((state) => state.checkUpdate);

  useEffect(() => {
    let cancelled = false;
    // Warm top-level routes behind the splash. Individual large tool screens
    // are intentionally excluded from this critical path and warmed one by one
    // once the renderer has idle time.
    const warmScreens = Promise.allSettled([
      loadToolsHub(),
      loadOnlineGalleryPage(),
      loadAgentPage(),
      loadInpaintCanvas(),
      loadMetadataInspector(),
    ]);
    const minimumSplash = new Promise<void>((resolve) => {
      window.setTimeout(resolve, SPLASH_MIN_VISIBLE_MS);
    });
    void Promise.all([warmScreens, minimumSplash]).then(() => {
      if (!cancelled) setSplash(false);
    });
    const deferredToolWarmTimer = window.setTimeout(() => {
      void loadToolsHub().then((module) => module.preloadToolScreens());
    }, 1_500);
    void load();
    void checkUpdate();
    // Favorites are mirrored to a filesystem sidecar and random-gacha history.
    // Merge every available source at boot before a profile rename can make a
    // still-existing collection appear empty.
    void hydrateArtistFavoriteLibrary();
    // Full archive work must not compete with scrolling, generation or initial
    // route setup. Track real interaction and wait for a quiet window; the
    // service performs the due check and defaults migrated users to metadata-
    // only automatic archives.
    const BACKUP_IDLE_MS = 45_000;
    let lastInteractionAt = Date.now();
    let automaticBackupTimer: number | undefined;
    let automaticBackupStarted = false;
    const markInteraction = () => { lastInteractionAt = Date.now(); };
    const attemptAutomaticBackup = () => {
      if (cancelled || automaticBackupStarted) return;
      const idleFor = Date.now() - lastInteractionAt;
      const activelyGenerating = useAppStore.getState().isGenerating;
      if (
        activelyGenerating ||
        (document.visibilityState === "visible" && idleFor < BACKUP_IDLE_MS)
      ) {
        automaticBackupTimer = window.setTimeout(
          attemptAutomaticBackup,
          activelyGenerating ? 30_000 : Math.max(10_000, BACKUP_IDLE_MS - idleFor),
        );
        return;
      }
      automaticBackupStarted = true;
      void flushArtistFavoritePersistence().then(() => (
        window.naiDesktop.runAutomaticBackup(collectPortableWorkspaceData())
      ));
    };
    window.addEventListener("pointerdown", markInteraction, { passive: true });
    window.addEventListener("keydown", markInteraction);
    window.addEventListener("wheel", markInteraction, { passive: true });
    automaticBackupTimer = window.setTimeout(attemptAutomaticBackup, 60_000);
    // A release may appear while the app is already open, and a transient
    // network/proxy failure at boot should not suppress updates for the whole
    // session. Retry once shortly after launch, then poll at a low frequency.
    const updateRetryTimer = window.setTimeout(() => void checkUpdate(), 30_000);
    const updatePollTimer = window.setInterval(() => void checkUpdate(), 30 * 60_000);
    // Keep the real boot path fast, but let the entrance breathe. 300ms felt
    // like a flash-cut from the splash artwork into the workbench; ~0.9s keeps
    // the app feeling responsive while making the transition intentional.
    return () => {
      cancelled = true;
      window.clearTimeout(deferredToolWarmTimer);
      if (automaticBackupTimer !== undefined) window.clearTimeout(automaticBackupTimer);
      window.removeEventListener("pointerdown", markInteraction);
      window.removeEventListener("keydown", markInteraction);
      window.removeEventListener("wheel", markInteraction);
      window.clearTimeout(updateRetryTimer);
      window.clearInterval(updatePollTimer);
    };
  }, [load, checkUpdate]);

  const shouldShowSplash = useMemo(() => splash || !bootDone, [splash, bootDone]);
  return shouldShowSplash ? <SplashPage /> : <MainPage />;
}
