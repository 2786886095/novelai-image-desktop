import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import clsx from "clsx";
import { format } from "date-fns";
// Code-split the heavy tool screens: they're only rendered when their tab is
// opened, so keeping them out of the initial bundle speeds cold start. The whole
// ComicGenerator module (comic + batch redraw) becomes its own chunk.
const ToolsHub = lazy(() => import("./ComicGenerator").then((m) => ({ default: m.ToolsHub })));
const InpaintCanvas = lazy(() => import("./InpaintCanvas").then((m) => ({ default: m.InpaintCanvas })));
import { useAppStore } from "./store";
import { relatedTags } from "./related-tags";
import { fmtCount, wordAtCursor } from "./text-utils";
import { parsePngMeta, parseImportedParams } from "./png-meta";
import { droppedImagePath, hasDraggedFiles } from "./drag-drop";
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
import { Button, IconText, AppPortal, Toggle, NumberInput, SliderInput } from "./components/ui";
import { Icon } from "./components/icons";
import { desktopUiFormat, desktopUiText, getChromeText, getGeneratePanelText, getLocalizedTabItems, getSettingsSectionText, getSettingsShellText, getTokenGuideText, localizedDesktopOptionLabel, SUPPORTED_APP_LANGUAGES } from "./i18n";
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
  MAX_NAI_UPSCALE_INPUT_PIXELS,
  NAI_INPAINT_MODELS,
  NAI_MODELS,
  NAI_SAMPLERS,
  NAI_UC_PRESETS,
  DEFAULT_MODEL_FOR_MODE,
  type AnlasQuoteFeature,
  type AnlasQuoteResult,
  type ModelMode,
  type AiCallLogEntry,
  type AppSettings,
  type HistoryItem,
  type GenerateParams,
  type ModePromptTemplates,
  type PromptTemplate,
  type PreciseReferenceType,
  type PromptVariants,
  type ReversePromptMode,
  type ReversePromptScope,
  type TagSuggestion,
  type TokenStatus,
} from "./types";

// NovelAI requires generation dimensions to be a multiple of 64, in the
// 64–1600 range. Snap user input so we never send an invalid size (→ HTTP 400).
function snapDimension(value: number): number {
  if (!Number.isFinite(value)) return 1024;
  return Math.min(1600, Math.max(64, Math.round(value / 64) * 64));
}

const docsUrl = "https://docs.novelai.net/en/image/";
const novelAiImageUrl = "https://novelai.net/image";
const DEFAULT_HTTP_PROXY = "http://127.0.0.1:7890";
const DEFAULT_SOCKS_PROXY = "socks5://127.0.0.1:10808";
const appIconUrl = "./icon.png";
const onboardingHeroUrl = "./onboarding-hero.png";

function hasTranslatableText(segment: string) {
  return /[\p{Letter}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(segment);
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
    void window.naiDesktop.danbooruStatus().then((s) => setStatus({ downloaded: s.downloaded, count: s.count }));
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
    void window.naiDesktop.danbooruStatus().then((s) => setDownloaded(s.downloaded));
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
      </div>
    </div>
  );
}

// ── Title bar ─────────────────────────────────────────────────────────────────
function TitleBar() {
  const account = useAppStore((state) => state.account);
  const language = useAppStore((state) => state.settings?.language);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  return (
    <header className="title-bar">
      <div className="window-title">
        <img className="title-icon" src={appIconUrl} alt="" />
        {APP_NAME}
        <span className="title-ver">v{APP_VERSION}</span>
      </div>
      <div className={clsx("title-account", account.hasToken && "online")}>
        <span className="pulse-dot" />
        {account.hasToken
          ? `${account.tierName ?? t("title.connected")} · Anlas ${account.anlasBalance ?? t("common.unknown")}${account.stale ? t("title.cached") : ""}`
          : t("title.notConnected")}
      </div>
      <div className="window-controls">
        <button onClick={() => window.naiDesktop.minimize()}>—</button>
        <button onClick={() => window.naiDesktop.maximize()}>□</button>
        <button className="close" onClick={() => window.naiDesktop.close()}>
          ×
        </button>
      </div>
    </header>
  );
}

// ── Menu bar ──────────────────────────────────────────────────────────────────
function MenuBar({ openSettings }: { openSettings: () => void }) {
  const settings = useAppStore((state) => state.settings);
  const chromeText = getChromeText(settings?.language);

  return (
    <nav className="menu-bar compact-toolbar">
      <button
        className="menu-action"
        onClick={() => settings?.outputDir && window.naiDesktop.openInExplorer(settings.outputDir)}
      >
        <IconText icon={<Icon name="folder" />}>{chromeText.outputDir}</IconText>
      </button>
      <button className="menu-action" onClick={openSettings}>
        <IconText icon="⚙">{chromeText.settings}</IconText>
      </button>
      <button className="menu-action" onClick={() => window.naiDesktop.openExternal(docsUrl)}>
        <IconText icon="❔">{chromeText.docs}</IconText>
      </button>
    </nav>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────
function TabBar() {
  const activeTab = useAppStore((state) => state.activeTab);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const language = useAppStore((state) => state.settings?.language);
  const tabItems = useMemo(() => getLocalizedTabItems(language), [language]);
  return (
    <div className="tab-bar">
      {tabItems.map(({ value, label, icon, title }) => (
        <button
          key={value}
          className={clsx(activeTab === value && "active")}
          title={title}
          onClick={() => setActiveTab(value)}
        >
          <span className="tab-icon">{icon}</span>
          <span>{label}</span>
        </button>
      ))}
    </div>
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
          <button onClick={onClose}>×</button>
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
          <label className="field">
            <span>{t("advanced.noiseSchedule")}</span>
            <select value={params.noiseSchedule} onChange={(e) => setParam("noiseSchedule", e.target.value)}>
              <option value="native">{localizedDesktopOptionLabel(settings?.language, "native", "Native")}</option>
              <option value="karras">{localizedDesktopOptionLabel(settings?.language, "karras", "Karras")}</option>
              <option value="exponential">{localizedDesktopOptionLabel(settings?.language, "exponential", "Exponential")}</option>
            </select>
          </label>
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
          <Toggle checked={params.qualityToggle} onChange={(v) => setParam("qualityToggle", v)} label={t("advanced.qualityToggle")} description={t("advanced.qualityToggleDesc")} />
          {/* SMEA / SMEA Dyn only exist on V3-era models; V4/V4.5 ignore them, so
              we hide the toggles there instead of showing a control with no effect. */}
          {!params.model.includes("-4") && (
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
  const model = useAppStore((state) => state.params.model);
  const isV45 = model.includes("4-5");
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);

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
          <button onClick={onClose}>×</button>
        </header>
        <div className="vibe-body">
          <h3 className="vibe-section-title">{t("reference.vibeTitle")}</h3>
          {vibeImages.length === 0 && <p className="vibe-empty">{t("reference.emptyVibe")}</p>}
          {vibeImages.map((img) => (
            <div className="vibe-row" key={img.id}>
              <img src={img.previewUrl} className="vibe-thumb" alt={t("reference.thumbAlt")} />
              <div className="vibe-row-sliders">
                <SliderInput
                  label={t("reference.infoExtracted")}
                  value={img.infoExtracted}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => updateVibeImage(img.id, { infoExtracted: v })}
                />
                <SliderInput
                  label={t("reference.strength")}
                  value={img.strength}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => updateVibeImage(img.id, { strength: v })}
                />
              </div>
              <button className="vibe-remove" title={t("reference.remove")} onClick={() => removeVibeImage(img.id)}>
                ×
              </button>
            </div>
          ))}

          <h3 className="vibe-section-title">
            {t("reference.preciseTitle")}
            {!isV45 && <span className="vibe-hint">{t("reference.preciseUnsupported")}</span>}
          </h3>
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
                </label>
                <SliderInput
                  label={t("reference.preciseStrength")}
                  value={ref.strength}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => updatePreciseReference(ref.id, { strength: v })}
                />
                <SliderInput
                  label={t("reference.fidelity")}
                  value={ref.fidelity}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => updatePreciseReference(ref.id, { fidelity: v })}
                />
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
              <button className="vibe-remove" title={t("reference.remove")} onClick={() => removePreciseReference(ref.id)}>
                ×
              </button>
            </div>
          ))}

          <div className="vibe-add-row">
            <label className="btn btn-secondary vibe-add-btn">
              <IconText icon="+">{t("reference.addVibe")}</IconText>
              <input
                type="file"
                hidden
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) { handleVibeFile(f, 0.7, 0.6); e.target.value = ""; }
                }}
              />
            </label>
            <label className="btn btn-secondary vibe-add-btn">
              <IconText icon="+">{t("reference.addPrecise")}</IconText>
              <input
                type="file"
                hidden
                accept="image/png,image/jpeg,image/webp"
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
    </AppPortal>
  );
}

// ── Character Captions modal ──────────────────────────────────────────────────
function CharCaptionsModal({ onClose }: { onClose: () => void }) {
  const language = useAppStore((state) => state.settings?.language);
  const charCaptions = useAppStore((state) => state.charCaptions);
  const params = useAppStore((state) => state.params);
  const addCharCaption = useAppStore((state) => state.addCharCaption);
  const removeCharCaption = useAppStore((state) => state.removeCharCaption);
  const updateCharCaption = useAppStore((state) => state.updateCharCaption);
  const clearCharCaptions = useAppStore((state) => state.clearCharCaptions);
  const isV4 = params.model.includes("-4");
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);

  return (
    <AppPortal>
      <div className="modal-backdrop">
      <div className="modal char-modal">
        <header>
          <h2>{t("character.title")}</h2>
          <button onClick={onClose}>×</button>
        </header>
        <div className="char-body">
          {!isV4 && (
            <div className="status-box bad">
              {t("character.unsupported")}
            </div>
          )}
          {charCaptions.map((cc, idx) => (
            <div className="char-row" key={cc.id}>
              <div className="char-row-head">
                <strong>{f("character.label", { index: idx + 1 })}</strong>
                <Button variant="ghost" onClick={() => removeCharCaption(cc.id)}>
                  <IconText icon="✕">{t("character.delete")}</IconText>
                </Button>
              </div>
              <textarea
                className="prompt-box char-prompt"
                value={cc.prompt}
                placeholder={t("character.placeholder")}
                onChange={(e) => updateCharCaption(cc.id, { prompt: e.target.value })}
              />
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={cc.useCoords}
                  onChange={(e) => updateCharCaption(cc.id, { useCoords: e.target.checked })}
                />
                <span>{t("character.useCoords")}</span>
              </label>
              {cc.useCoords && (
                <div className="char-coords">
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
          ))}
          <Button className="full" onClick={addCharCaption}>
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

// ── Prompt + Params ───────────────────────────────────────────────────────────
function PromptAndParams({ includeModel = true }: { includeModel?: boolean }) {
  const params = useAppStore((state) => state.params);
  const setParam = useAppStore((state) => state.setParam);
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
  // Original prompt text kept per tab so a translation can be reverted (还原).
  const [translateBackup, setTranslateBackup] = useState<Record<string, string>>({});
  const promptValue = promptTab === "positive" ? params.positivePrompt : params.negativePrompt;
  const promptKey = promptTab === "positive" ? "positivePrompt" : "negativePrompt";
  const templates: PromptTemplate[] = settings?.promptTemplates ?? [];
  const generateText = useMemo(() => getGeneratePanelText(settings?.language), [settings?.language]);
  const t = useCallback((key: string) => desktopUiText(settings?.language, key), [settings?.language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(settings?.language, key, values), [settings?.language]);
  // Co-occurrence: tags commonly used alongside what's already in the prompt.
  const related = useMemo(() => relatedTags(params.positivePrompt, 8), [params.positivePrompt]);

  function applyTemplate(tpl: PromptTemplate) {
    setShowTemplateMenu(false);
    const current = params.positivePrompt.trim();
    const parts = [tpl.prefix.trim(), current, tpl.suffix.trim()].filter(Boolean);
    setParam("positivePrompt", parts.join(", "));
    if (tpl.negativePrompt.trim() && !(settings?.lockNegativePrompt ?? false)) {
      setParam("negativePrompt", tpl.negativePrompt.trim());
    }
    setToast(f("prompt.templateApplied", { name: tpl.name }));
  }

  function appendChip(tag: string) {
    const current = promptValue.trim();
    const next = current ? `${current.replace(/\s*,?\s*$/, "")}, ${tag}, ` : `${tag}, `;
    setParam(promptKey, next);
  }

  // Per-tag weight editor: parse the active prompt into { core, level } chips.
  const weightTags = useMemo(
    () => splitPromptTags(promptValue).map((seg) => parseWeightedTag(seg)),
    [promptValue],
  );
  function bumpWeight(index: number, delta: number) {
    const tag = weightTags[index];
    if (!tag) return;
    setParam(promptKey, setTagLevelInPrompt(promptValue, index, tag.level + delta));
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
    setParam("model", DEFAULT_MODEL_FOR_MODE[mode]);
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
      setParam(promptKey, joined + (joined.endsWith(",") ? " " : ", "));
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
    setParam(promptKey, backup);
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
            {NAI_MODELS.filter((m) => m.mode === modelMode).map((m) => (
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
      <div className={clsx("prompt-chip-zone", !chipOpen && "collapsed")}>
        <button type="button" className="prompt-chip-head" onClick={() => setChipOpen((v) => !v)}>
          <span className="chip-head-title">
            <span className={clsx("chip-caret", chipOpen && "open")}>▸</span>
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
        <button type="button" className="prompt-tool-btn" onClick={() => setShowWeights((v) => !v)} disabled={weightTags.length === 0}>
          ⚖ {generateText.prompt.weightAdjust}{weightTags.length ? ` (${weightTags.length})` : ""} {showWeights ? "▲" : "▼"}
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
        <button
          type="button"
          className={clsx("prompt-tool-btn", (settings?.autoComplete ?? true) && "tool-on")}
          title={generateText.prompt.autocompleteTitle}
          onClick={() => void toggleAutoComplete()}
        >
          <Icon name="bulb" /> {(settings?.autoComplete ?? true) ? generateText.prompt.autocompleteOn : generateText.prompt.autocompleteOff}
        </button>
      </div>
      {showWeights && weightTags.length > 0 && (
        <div className="weight-editor">
          <div className="weight-editor-hint">{generateText.prompt.weightHint}</div>
          <div className="weight-tag-list">
            {weightTags.map((wt, i) => (
              <div key={`${wt.core}-${i}`} className={clsx("weight-tag", wt.level > 0 && "up", wt.level < 0 && "down")}>
                <button type="button" className="weight-btn" title={generateText.prompt.decreaseWeight} onClick={() => bumpWeight(i, -1)}>−</button>
                <span className="weight-tag-core" title={wt.raw}>
                  {wt.core || generateText.prompt.emptyTag}
                  {wt.level !== 0 && <em>{formatMultiplier(wt.level)}</em>}
                </span>
                <button type="button" className="weight-btn" title={generateText.prompt.increaseWeight} onClick={() => bumpWeight(i, 1)}>＋</button>
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
              <IconText icon="▣">{generateText.prompt.template}{showTemplateMenu ? " ▲" : " ▼"}</IconText>
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
      <div className="size-row">
        <NumberInput label={generateText.prompt.width} value={params.width} min={64} max={1600} step={64} onChange={(v) => setParam("width", snapDimension(v))} />
        <span>×</span>
        <NumberInput label={generateText.prompt.height} value={params.height} min={64} max={1600} step={64} onChange={(v) => setParam("height", snapDimension(v))} />
      </div>
      <div className="preset-row">
        <button onClick={() => { setParam("width", 1024); setParam("height", 1024); }}>1024×1024</button>
        <button onClick={() => { setParam("width", 1216); setParam("height", 832); }}>1216×832</button>
        <button onClick={() => { setParam("width", 832); setParam("height", 1216); }}>832×1216</button>
        <button onClick={() => { setParam("width", 1024); setParam("height", 1536); }}>1024×1536</button>
        <button onClick={() => { setParam("width", 1536); setParam("height", 1024); }}>1536×1024</button>
        <button onClick={() => { setParam("width", 1472); setParam("height", 1472); }}>1472×1472</button>
      </div>
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
            if (params.seed <= 0) setParam("seed", Math.floor(Math.random() * 2_147_483_647));
          }}
        >
          <Icon name="pin" /> {generateText.prompt.fixedSeed}
        </button>
      </div>
      {params.seedMode === "fixed" && (
        <div className="seed-row">
          <NumberInput label={generateText.prompt.fixedSeedValue} value={params.seed} min={1} onChange={(v) => setParam("seed", v)} />
          <Button title={generateText.prompt.randomizeSeedTitle} onClick={() => setParam("seed", Math.floor(Math.random() * 2_147_483_647))}>
            ⇄
          </Button>
        </div>
      )}
      <label className="checkbox-line">
        <input type="checkbox" checked={params.variety} onChange={(e) => setParam("variety", e.target.checked)} />
        <span>{generateText.prompt.variety}</span>
      </label>
      <Button className="full" onClick={() => setShowAdvanced(true)}>
        <IconText icon="⚙">{generateText.prompt.advancedParams}</IconText>
      </Button>
      {showAdvanced && <AdvancedParamsModal onClose={() => setShowAdvanced(false)} />}
      {showVibeModal && <VibeTransferModal onClose={() => setShowVibeModal(false)} />}
      {showCharModal && <CharCaptionsModal onClose={() => setShowCharModal(false)} />}
      {showNormalize && (
        <PromptNormalizeModal
          value={promptValue}
          onApply={(next) => {
            setParam(promptKey, next);
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
            <button onClick={onClose}>×</button>
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
  const inpaintStrength = useAppStore((state) => state.inpaintStrength);
  const inpaintNoise = useAppStore((state) => state.inpaintNoise);
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
    inpaintStrength,
    inpaintNoise,
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
      const quoteParams = { ...params, stylePrompt: "", positivePrompt: "quote", negativePrompt: "" };
      const extras = {
        vibeImages: Array.from({ length: vibeCount }, () => ({ base64: "", infoExtracted: 0.7, strength: 0.5 })),
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
          i2iParams,
          inpaintStrength,
          inpaintNoise,
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
  const primary =
    quote?.ok && typeof quote.amount === "number"
      ? quote.amount === 0
        ? t("cost.zero")
        : isEstimate
          ? f("cost.estimated", { amount: quote.amount })
          : f("cost.willSpend", { amount: quote.amount })
      : loading
        ? t("cost.loading")
        : quote?.message || t("cost.unavailable");
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
      )}
    >
      <div>
        <span>{label}</span>
        <small>{sourceLabel || t("cost.readingHint")}</small>
      </div>
      <strong>{primary}</strong>
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
  const queueAdding = useAppStore((state) => state.queueAdding);
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
            {collapsed ? "▸" : "▾"}
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
              {queuePaused ? t("queue.paused") : queueAdding ? t("queue.adding") : t("queue.running")}
            </span>
          </li>
          {queue.map((job) => (
            <li className="queue-item" key={job.id}>
              <span className="queue-item-label" title={job.label}>
                {job.label}
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
                ✕
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
  allowQueue = false,
  disabled = false,
  disabledReason = "",
}: {
  label: string;
  onRun: () => void;
  openSettings: () => void;
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
  const isGenerateQueueRunning = useAppStore((state) => state.isGenerateQueueRunning);
  const generationQueueLength = useAppStore((state) => state.generationQueue.length);
  const queueAdding = useAppStore((state) => state.queueAdding);
  const enqueueGeneration = useAppStore((state) => state.enqueueGeneration);
  const currentAnlasSpent = useAppStore((state) => state.currentAnlasSpent);
  const lastAnlasSpent = useAppStore((state) => state.lastAnlasSpent);
  const refreshAccount = useAppStore((state) => state.refreshAccount);
  const [refreshingAccount, setRefreshingAccount] = useState(false);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);
  async function refreshBalance() {
    setRefreshingAccount(true);
    try {
      await refreshAccount();
    } finally {
      setRefreshingAccount(false);
    }
  }
  return (
    <div className="left-footer">
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
      {!account.hasToken ? (
        <Button variant="primary" className="full" onClick={openSettings}>
          <IconText icon={<Icon name="key" />}>{t("account.setupFirst")}</IconText>
        </Button>
      ) : isGenerating ? (
        <>
          {isGenerateQueueRunning && <QueuePanel />}
          <div className="anlas-spent">
            {currentAnlasSpent != null ? f("account.currentSpent", { amount: currentAnlasSpent }) : t("account.currentReading")}
          </div>
          {allowQueue && isGenerateQueueRunning ? (
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
          <div className={clsx("run-button-row", !isGenerateQueueRunning && "single-action")}>
            {isGenerateQueueRunning ? (
              <Button variant="secondary" className="run-row-btn" onClick={togglePause}>
                {queuePaused ? t("account.resume") : t("account.pause")}
              </Button>
            ) : null}
            <Button variant="danger" className="run-row-btn" onClick={() => void cancel()}>
              {t("account.stop")}
            </Button>
          </div>
        </>
      ) : (
        <>
          {lastAnlasSpent != null && (
            <div className="anlas-spent">{f("account.lastSpent", { amount: lastAnlasSpent })}</div>
          )}
          {disabled && disabledReason ? <div className="run-disabled-reason">{disabledReason}</div> : null}
          <Button variant="primary" className="full" onClick={onRun} disabled={disabled}>
            <IconText icon="▶">{label}</IconText>
          </Button>
        </>
      )}
    </div>
  );
}

// ── Generate panel (T2I) ──────────────────────────────────────────────────────
function GeneratePanel({ openSettings }: { openSettings: () => void }) {
  const language = useAppStore((state) => state.settings?.language);
  const generate = useAppStore((state) => state.generate);
  const batchCount = useAppStore((state) => state.batchCount);
  const setBatchCount = useAppStore((state) => state.setBatchCount);
  const fileNamePrefix = useAppStore((state) => state.params.fileNamePrefix);
  const setParam = useAppStore((state) => state.setParam);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);

  return (
    <>
      <div className="panel-scroll">
        <PromptAndParams />
        <div className="batch-row">
          <span>{t("generate.batchCount")}</span>
          <input
            type="number"
            className="field"
            style={{ margin: 0 }}
            value={batchCount}
            min={1}
            max={16}
            onChange={(e) => setBatchCount(Number(e.target.value))}
          />
        </div>
        <label className="field">
          <span>{t("generate.fileNamePrefix")}</span>
          <input
            value={fileNamePrefix}
            placeholder={t("generate.fileNamePlaceholder")}
            onChange={(e) => setParam("fileNamePrefix", e.target.value)}
          />
        </label>
        <p className="wildcard-hint">
          <Icon name="bulb" /> {f("generate.wildcardHint", { example: "{red|blue|green} hair", tag: "{tag}" })}
        </p>
        <FeatureCostCard label={t("cost.beforeRun")} feature="generate" />
      </div>
      <AccountAndRunButton
        label={batchCount > 1 ? f("generate.batchRun", { count: batchCount }) : t("generate.run")}
        onRun={() => void generate()}
        openSettings={openSettings}
        allowQueue
      />
    </>
  );
}

// ── I2I panel ─────────────────────────────────────────────────────────────────
function I2IPanel({ openSettings }: { openSettings: () => void }) {
  const language = useAppStore((state) => state.settings?.language);
  const i2iParams = useAppStore((state) => state.i2iParams);
  const setI2IParam = useAppStore((state) => state.setI2IParam);
  const generateI2I = useAppStore((state) => state.generateI2I);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  return (
    <>
      <div className="panel-scroll">
        <WorkbenchImageUpload />
        <SliderInput label={t("i2i.strength")} value={i2iParams.strength} min={0} max={1} step={0.01} onChange={(v) => setI2IParam("strength", v)} />
        <SliderInput label={t("i2i.noise")} value={i2iParams.noise} min={0} max={0.99} step={0.01} onChange={(v) => setI2IParam("noise", v)} />
        <NumberInput label={t("i2i.extraNoiseSeed")} value={i2iParams.extraNoiseSeed} min={0} onChange={(v) => setI2IParam("extraNoiseSeed", v)} />
        <div className="panel-divider" />
        <PromptAndParams />
        <FeatureCostCard label={t("cost.beforeRun")} feature="i2i" />
      </div>
      <AccountAndRunButton label={t("i2i.run")} onRun={() => void generateI2I()} openSettings={openSettings} />
    </>
  );
}

// ── Inpaint panel ─────────────────────────────────────────────────────────────
function InpaintPanel({ openSettings }: { openSettings: () => void }) {
  const language = useAppStore((state) => state.settings?.language);
  const inpaintModel = useAppStore((state) => state.inpaintModel);
  const setInpaintModel = useAppStore((state) => state.setInpaintModel);
  const inpaintStrength = useAppStore((state) => state.inpaintStrength);
  const setInpaintStrength = useAppStore((state) => state.setInpaintStrength);
  const inpaintNoise = useAppStore((state) => state.inpaintNoise);
  const setInpaintNoise = useAppStore((state) => state.setInpaintNoise);
  const brushSize = useAppStore((state) => state.brushSize);
  const setBrushSize = useAppStore((state) => state.setBrushSize);
  const brushOpacity = useAppStore((state) => state.brushOpacity);
  const setBrushOpacity = useAppStore((state) => state.setBrushOpacity);
  const brushMode = useAppStore((state) => state.brushMode);
  const setBrushMode = useAppStore((state) => state.setBrushMode);
  const clearInpaintMask = useAppStore((state) => state.clearInpaintMask);
  const inpaint = useAppStore((state) => state.inpaint);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  return (
    <>
      <div className="panel-scroll">
        <WorkbenchImageUpload />
        <label className="field">
          <span>{t("inpaint.model")}</span>
          <select value={inpaintModel} onChange={(e) => setInpaintModel(e.target.value as typeof inpaintModel)}>
            {NAI_INPAINT_MODELS.map((m) => (
              <option value={m.value} key={m.value}>{localizedDesktopOptionLabel(language, m.value, m.label)}</option>
            ))}
          </select>
        </label>
        <SliderInput label={t("inpaint.strength")} value={inpaintStrength} min={0.1} max={1} step={0.01} onChange={setInpaintStrength} />
        <SliderInput label={t("inpaint.noise")} value={inpaintNoise} min={0} max={0.99} step={0.01} onChange={setInpaintNoise} />
        <SliderInput
          label={t("inpaint.brushSize")}
          value={brushSize}
          min={2}
          max={128}
          step={1}
          onChange={setBrushSize}
        />
        <SliderInput label={t("inpaint.brushOpacity")} value={brushOpacity} min={0.05} max={1} step={0.01} onChange={setBrushOpacity} />
        <div className="mode-buttons">
          <Button variant={brushMode === "paint" ? "primary" : "secondary"} onClick={() => setBrushMode("paint")}>
            <IconText icon="✎">{t("inpaint.paintBrush")}</IconText>
          </Button>
          <Button variant={brushMode === "erase" ? "primary" : "secondary"} onClick={() => setBrushMode("erase")}>
            <IconText icon="⌫">{t("inpaint.eraser")}</IconText>
          </Button>
        </div>
        <Button className="full" onClick={clearInpaintMask}>
          <IconText icon="⌧">{t("inpaint.clearMask")}</IconText>
        </Button>
        <div className="panel-divider" />
        <PromptAndParams includeModel={false} />
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
  const reversePrompting = useAppStore((state) => state.reversePrompting);
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
  const setParam = useAppStore((state) => state.setParam);
  const setToast = useAppStore((state) => state.setToast);
  const settings = useAppStore((state) => state.settings);
  const language = settings?.language;
  const inspectMeta = useAppStore((state) => state.inspectMeta);
  const applyParams = useAppStore((state) => state.applyParams);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const [dragging, setDragging] = useState(false);
  const hasImage = Boolean(inspectImageUrl);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);

  const imported = useMemo(() => (inspectMeta ? parseImportedParams(inspectMeta) : {}), [inspectMeta]);
  const hasMeta = Object.keys(imported).length > 0;

  function restoreParams() {
    if (!hasMeta) {
      setToast(t("inspect.noMeta"));
      return;
    }
    applyParams(imported);
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
    const url = URL.createObjectURL(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const buf = ev.target?.result as ArrayBuffer;
      // Store base64 for vision API; also read PNG meta as bonus
      const b64 = btoa(
        new Uint8Array(buf).reduce((acc, byte) => acc + String.fromCharCode(byte), ""),
      );
      const meta = parsePngMeta(buf);
      setInspectImage(url, meta, b64);
    };
    reader.readAsArrayBuffer(file);
  }

  function applyToPanel() {
    if (!reversePromptText.trim()) return;
    setParam("positivePrompt", reversePromptText.trim());
    setToast(t("shared.reusedToGenerate"));
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

        <div className="info-card">
          <strong>{t("inspect.costTitle")}</strong>
          <span>{t("inspect.costDesc")}</span>
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
            disabled={reversePrompting}
            onClick={() => void runReversePrompt()}
          >
            {reversePrompting ? <IconText icon="…">{t("inspect.running")}</IconText> : <IconText icon="◎">{t("inspect.run")}</IconText>}
          </Button>
        )}

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
  const [generateMode, setGenerateMode] = useState<"t2i" | "i2i">("t2i");
  const tabItems = useMemo(() => getLocalizedTabItems(language), [language]);
  const generateText = useMemo(() => getGeneratePanelText(language), [language]);
  const meta = tabItems.find((item) => item.value === activeTab) ?? tabItems[0];
  return (
    <aside className="left-panel">
      <div className="panel-head">
        <span>{meta.icon}</span>
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
          </div>
          {generateMode === "t2i"
            ? <GeneratePanel openSettings={openSettings} />
            : <I2IPanel openSettings={openSettings} />}
        </>
      )}
      {activeTab === "inpaint" && <InpaintPanel openSettings={openSettings} />}
      {activeTab === "upscale" && <UpscalePanel openSettings={openSettings} />}
      {activeTab === "postprocess" && <DirectorPanel openSettings={openSettings} />}
      {activeTab === "inspect" && <ReversePanel />}
      {activeTab === "convert" && <PromptConverterPanel />}
    </aside>
  );
}

// ── Prompt Converter panel ────────────────────────────────────────────────────
function PromptConverterPanel() {
  const convertInput = useAppStore((state) => state.convertInput);
  const convertResult = useAppStore((state) => state.convertResult);
  const converting = useAppStore((state) => state.converting);
  const setConvertInput = useAppStore((state) => state.setConvertInput);
  const setConvertResult = useAppStore((state) => state.setConvertResult);
  const convertMode = useAppStore((state) => state.convertMode);
  const convertKnownCharacter = useAppStore((state) => state.convertKnownCharacter);
  const convertResultVariants = useAppStore((state) => state.convertResultVariants);
  const setConvertMode = useAppStore((state) => state.setConvertMode);
  const setConvertKnownCharacter = useAppStore((state) => state.setConvertKnownCharacter);
  const runConvertPrompt = useAppStore((state) => state.runConvertPrompt);
  const setParam = useAppStore((state) => state.setParam);
  const setToast = useAppStore((state) => state.setToast);
  const settings = useAppStore((state) => state.settings);
  const templates: PromptTemplate[] = settings?.promptTemplates ?? [];
  const language = settings?.language;
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);

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

  return (
    <>
      <div className="panel-scroll">
        <div className="convert-header">
          <strong>{t("convert.title")}</strong>
          <small>{t("convert.subtitle")}</small>
        </div>
        <div className="info-card">
          <strong>{t("convert.costTitle")}</strong>
          <span>{t("convert.costDesc")}</span>
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

        <Button
          variant="primary"
          className="full"
          disabled={converting || !convertInput.trim()}
          onClick={() => void runConvertPrompt()}
        >
          {converting ? (
            <IconText icon="…">{t("convert.running")}</IconText>
          ) : (
            <IconText icon="⇄">
              {t(`convert.run.${convertMode}`)}
            </IconText>
          )}
        </Button>

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
                  <span className="ai-log-caret">{open ? "▾" : "▸"}</span>
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
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [shellSize, setShellSize] = useState({ width: 0, height: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [compareEnabled, setCompareEnabled] = useState(Boolean(compareBeforeImage));
  const [compareX, setCompareX] = useState(50);
  const [isCompareDragging, setIsCompareDragging] = useState(false);
  const language = useAppStore((state) => state.settings?.language);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const canCompare = Boolean(compareBeforeImage?.fileUrl);
  const compareClip = `inset(0 0 0 ${compareX}%)`;
  const frameSize = useMemo(() => {
    const shellWidth = shellSize.width;
    const shellHeight = shellSize.height;
    const imageWidth = Math.max(1, image.width || 1);
    const imageHeight = Math.max(1, image.height || 1);
    if (shellWidth <= 0 || shellHeight <= 0) return undefined;
    const aspect = imageWidth / imageHeight;
    let width = shellWidth;
    let height = width / aspect;
    if (height > shellHeight) {
      height = shellHeight;
      width = height * aspect;
    }
    return { width, height };
  }, [image.height, image.width, shellSize.height, shellSize.width]);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setCompareX(50);
    setCompareEnabled(Boolean(compareBeforeImage));
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

  useEffect(() => {
    if (!isCompareDragging) return;
    const move = (event: PointerEvent) => updateComparePosition(event.clientX);
    const up = () => setIsCompareDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [isCompareDragging]);

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
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = ((clientX - rect.left) / Math.max(1, rect.width)) * 100;
    setCompareX(clampNumber(next, 0, 100));
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
          className="zoom-frame"
          style={{ ...frameSize, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          <img
            className={clsx("zoom-image", compareEnabled && canCompare && "zoom-image-measure")}
            src={image.fileUrl}
            alt={alt}
            // Draggable only when not zoomed; while zoomed the pointer drives panning.
            draggable={zoom === 1}
            title={t("viewer.dragTitle")}
            onDragStart={(e) => {
              e.preventDefault();
              window.naiDesktop.startImageDrag(image.fileUrl);
            }}
            // The previewed file was deleted on disk → drop it from the library
            // (clears this preview too); main re-checks before removing.
            onError={() => {
              if (image.id) void useAppStore.getState().dropMissingImage(image.id);
            }}
          />
          {compareEnabled && canCompare ? (
            <>
              <img className="zoom-image zoom-image-absolute" src={compareBeforeImage!.fileUrl} alt={t("viewer.beforeAlt")} draggable={false} />
              <div className="compare-after-clip" style={{ clipPath: compareClip }}>
                <img className="zoom-image zoom-image-absolute" src={image.fileUrl} alt={t("viewer.afterAlt")} draggable={false} />
              </div>
              <button
                type="button"
                className="compare-divider"
                style={{ left: `${compareX}%` }}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setIsCompareDragging(true);
                  updateComparePosition(event.clientX);
                }}
                aria-label={t("viewer.compareDividerLabel")}
                title={t("viewer.compareDividerLabel")}
              >
                <span />
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ImageCanvas() {
  const currentImage = useAppStore((state) => state.currentImage);
  const comparisonBeforeImage = useAppStore((state) => state.comparisonBeforeImage);
  const isGenerating = useAppStore((state) => state.isGenerating);
  const activeTab = useAppStore((state) => state.activeTab);
  const generate = useAppStore((state) => state.generate);
  const settings = useAppStore((state) => state.settings);
  const language = settings?.language;
  const inspectImageUrl = useAppStore((state) => state.inspectImageUrl);
  const loadWorkbenchFromPath = useAppStore((state) => state.loadWorkbenchFromPath);
  const [dropOver, setDropOver] = useState(false);
  const superDrop = settings?.superDrop ?? false;
  const dropEnabled = superDrop || activeTab === "generate" || activeTab === "upscale" || activeTab === "postprocess";
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);

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
            <div className="coming-soon-icon">✦</div>
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
          <div className="coming-soon-icon">⇄</div>
          <h2>{t("convert.title")}</h2>
          <p>{t("convert.emptyHint1")}</p>
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
      {isGenerating && (
        <div className="generating-overlay">
          <div className="spinner" />
          <strong>{t("canvas.generatingTitle")}</strong>
          <small>{t("canvas.generatingHint")}</small>
        </div>
      )}
      {!currentImage && !isGenerating && (
        <button className="empty-canvas" onClick={generate}>
          <span className="empty-illustration" aria-hidden="true">
            <span className="empty-orb empty-orb-a" />
            <span className="empty-orb empty-orb-b" />
            <span className="empty-gem">✦</span>
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
      {currentImage && <ZoomableImageStage image={currentImage} compareBeforeImage={comparisonBeforeImage} alt={t("canvas.resultAlt")} />}
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
            <button onClick={onClose}>×</button>
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

type ProxyPreset = "direct" | "http" | "socks" | "custom";

function proxyPresetFor(value: string): ProxyPreset {
  const normalized = value.trim().toLowerCase().replace(/\/$/, "");
  if (!normalized) return "direct";
  if (normalized === DEFAULT_HTTP_PROXY) return "http";
  if (normalized === DEFAULT_SOCKS_PROXY) return "socks";
  return "custom";
}

function ProxyPresetControl({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [preset, setPreset] = useState<ProxyPreset>(() => proxyPresetFor(value));
  const [customValue, setCustomValue] = useState(value);
  const language = useAppStore((state) => state.settings?.language);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);

  useEffect(() => {
    setCustomValue(value);
    const next = proxyPresetFor(value);
    if (next !== "custom") setPreset(next);
  }, [value]);

  function selectPreset(next: ProxyPreset) {
    setPreset(next);
    if (next === "direct") onChange("");
    if (next === "http") onChange(DEFAULT_HTTP_PROXY);
    if (next === "socks") onChange(DEFAULT_SOCKS_PROXY);
  }

  return (
    <div className="proxy-preset-control">
      <label className="field">
        <span>{t("proxy.label")}</span>
        <select value={preset} onChange={(event) => selectPreset(event.target.value as ProxyPreset)}>
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
              onChange(event.target.value);
            }}
          />
        </label>
      )}
      <div className={clsx("proxy-current", preset === "direct" && "direct")}>
        <strong>{preset === "direct" ? t("proxy.currentDirect") : t("proxy.currentProxy")}</strong>
        <code>{preset === "direct" ? t("proxy.directValue") : (preset === "custom" ? customValue : value) || t("proxy.empty")}</code>
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
            <button type="button" aria-label={text.close} onClick={onClose}>×</button>
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
            <button type="button" aria-label={text.close} onClick={() => setPreviewImage("")}>×</button>
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
  const language = useAppStore((state) => state.settings?.language);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);
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

  function deleteActiveGroup() {
    if (!activeGroup) return;
    if (window.confirm(f("history.deleteGroupConfirm", { name: activeGroup.name }))) {
      void deleteHistoryGroup(activeGroup.id);
    }
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
        <select aria-label={t("history.dateAria")} value={selectedDate} onChange={(e) => void setSelectedDate(e.target.value)}>
          <option value="">{t("history.allDates")}</option>
          {dates.map((date) => (
            <option value={date} key={date}>{date}</option>
          ))}
        </select>
        <select aria-label={t("history.groupAria")} value={selectedGroupId} onChange={(e) => void setSelectedGroupId(e.target.value)}>
          <option value="">{t("history.allGroups")}</option>
          <option value="__ungrouped">{t("history.ungrouped")}</option>
          {groups.map((group) => (
            <option value={group.id} key={group.id}>{group.name}</option>
          ))}
        </select>
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
            ✎ {t("history.rename")}
          </button>
          <button type="button" disabled={!activeGroup} title={t("history.deleteGroupTitle")} onClick={deleteActiveGroup}>
            <Icon name="trash" /> {t("history.delete")}
          </button>
        </div>
      </div>
      <div className="history-grid">
        {history.length === 0 && (
          <div className="history-empty">
            <span>◇</span>
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
              <span className="history-meta">{item.model} · {item.width}×{item.height}</span>
            </button>
            <select
              className="history-item-group"
              value={item.groupId ?? ""}
              title={t("history.itemGroupTitle")}
              onChange={(e) => void setHistoryItemGroup(item.id, e.target.value || undefined)}
            >
              <option value="">{t("history.ungrouped")}</option>
              {groups.map((group) => (
                <option value={group.id} key={group.id}>{group.name}</option>
              ))}
            </select>
            <button className="history-rename" title={t("history.renameImageTitle")} onClick={() => renameItem(item)}>
              ✎
            </button>
            <button className="history-delete" title={t("history.deleteImageTitle")} onClick={() => void deleteHistory(item.id)}>
              ×
            </button>
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
  const [section, setSection] = useState("api");
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
  const language = settings?.language;
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);

  // Pull the canonical reverse-template defaults from the main process (owner file
  // or built-in), never from current settings — otherwise a user's customized
  // template would be treated as the default by "restore default".
  useEffect(() => {
    void window.naiDesktop.getReverseTemplateDefaults().then((defaults) => {
      if (defaults && (defaults.tags || defaults.natural || defaults.mixed)) {
        setReverseTemplateDefaults(defaults);
      }
    });
  }, []);

  if (!settings) return null;

  const update = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    await window.naiDesktop.setSetting(key, value);
    await refreshSettings();
  };
  const updateProxy = async (value: string) => {
    await window.naiDesktop.setSetting("proxyMode", proxyPresetFor(value));
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
  const nav = [
    ["api", settingsShellText.nav.api],
    ["storage", settingsShellText.nav.storage],
    ["ai-reverse", settingsShellText.nav["ai-reverse"]],
    ["convert-api", settingsShellText.nav["convert-api"]],
    ["templates", settingsShellText.nav.templates],
    ["prompt", settingsShellText.nav.prompt],
    ["language", settingsShellText.nav.language],
    ["appearance", settingsShellText.nav.appearance],
    ["performance", settingsShellText.nav.performance],
  ];

  return (
    <AppPortal>
      <div className="modal-backdrop">
      <div className="modal settings-modal">
        <header>
          <h2>{settingsShellText.title}</h2>
          <button onClick={onClose}>×</button>
        </header>
        <div className="settings-body">
          <nav className="settings-nav">
            {nav.map(([value, label]) => (
              <button className={clsx(section === value && "active")} key={value} onClick={() => setSection(value)}>
                {label}
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
                <label className="field">
                  <span>{t("settings.apiTokenLabel")}</span>
                  <input type="password" value={token} placeholder={t("settings.apiTokenPlaceholder")} onChange={(e) => setToken(e.target.value)} />
                </label>
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

                <div className="proxy-card">
                  <ProxyPresetControl value={settings.proxyUrl} onChange={(value) => void updateProxy(value)} />
                  <p className="settings-hint" style={{ margin: "2px 0 8px" }}>
                    {t("settings.proxyHint")}
                  </p>
                  <div className="proxy-scope" style={{ opacity: settings.proxyUrl.trim() ? 1 : 0.5 }}>
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
                          disabled={!settings.proxyUrl.trim()}
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
                <LogSettingsSection
                  logDir={settings.logDir ?? ""}
                  loggingEnabled={settings.loggingEnabled ?? true}
                  refreshSettings={refreshSettings}
                />
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
                <label className="field">
                  <span>API Key</span>
                  <input
                    type="password"
                    value={settings.visionApiKey}
                    placeholder="sk-..."
                    onChange={(e) => void update("visionApiKey", e.target.value)}
                  />
                </label>
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
                <label className="field">
                  <span>API Key</span>
                  <input
                    type="password"
                    value={settings.convertApiKey}
                    placeholder="sk-..."
                    onChange={(e) => void update("convertApiKey", e.target.value)}
                  />
                </label>
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
                <ModeTemplateEditor
                  title={t("settings.reverseTemplateTitle")}
                  value={settings.reversePromptTemplates}
                  defaults={reverseTemplateDefaults}
                  onChange={(next) => void update("reversePromptTemplates", next)}
                />
                <ModeTemplateEditor
                  title={t("settings.convertTemplateTitle")}
                  value={settings.convertPromptTemplates}
                  defaults={CONVERT_SYSTEM_PROMPTS}
                  onChange={(next) => void update("convertPromptTemplates", next)}
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
                      <label className="field">
                        <span>{t("settings.serviceKey")}</span>
                        <input
                          type="password"
                          value={settings.tagServerApiKey}
                          placeholder={t("settings.serviceKeyPlaceholder")}
                          onChange={(e) => void update("tagServerApiKey", e.target.value)}
                        />
                      </label>
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
                      <label className="field">
                        <span>{t("settings.baiduSecret")}</span>
                        <input
                          type="password"
                          value={settings.baiduSecret}
                          placeholder={t("settings.baiduSecretPlaceholder")}
                          onChange={(e) => void update("baiduSecret", e.target.value)}
                        />
                      </label>
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
  const [onboardingProxyUrl, setOnboardingProxyUrl] = useState(DEFAULT_HTTP_PROXY);
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
    if (settings) setOnboardingProxyUrl(settings.proxyUrl);
  }, [settings?.proxyUrl]);
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
                  value={onboardingProxyUrl}
                  onChange={(value) => {
                    setOnboardingProxyUrl(value);
                    void (async () => {
                      await window.naiDesktop.setSetting("proxyMode", proxyPresetFor(value));
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
                <label className="field wide">
                  <span>{t("settings.apiTokenLabel")}</span>
                  <input type="password" value={token} placeholder={account.hasToken ? t("onboarding.tokenKeep") : t("settings.apiTokenPlaceholder")} onChange={(e) => setToken(e.target.value)} />
                </label>
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
                <label className="field wide">
                  <span>{t("onboarding.visionKeyLabel")}</span>
                  <input
                    type="password"
                    defaultValue={settings?.visionApiKey ?? ""}
                    placeholder={t("onboarding.visionKeyPlaceholder")}
                    onChange={(e) => void window.naiDesktop.setSetting("visionApiKey", e.target.value)}
                  />
                </label>
                <label className="field wide">
                  <span>{t("onboarding.convertKeyLabel")}</span>
                  <input
                    type="password"
                    defaultValue={settings?.convertApiKey ?? ""}
                    placeholder={t("onboarding.convertKeyPlaceholder")}
                    onChange={(e) => void window.naiDesktop.setSetting("convertApiKey", e.target.value)}
                  />
                </label>
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
            {step === 7 && <div className="done-mark">✓</div>}
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
  const language = useAppStore((state) => state.settings?.language);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const f = useCallback((key: string, values: Record<string, unknown>) => desktopUiFormat(language, key, values), [language]);
  // Always render an element so .app-shell keeps a stable 6-row grid; the empty
  // slot collapses to 0 height when there's no update.
  if (!updateInfo?.hasUpdate) return <div className="update-banner-slot" />;
  return (
    <div className="update-banner">
      <span>
        <Icon name="upgrade" /> {f("update.newVersion", { latest: updateInfo.latestVersion, current: updateInfo.currentVersion })}
      </span>
      <div className="update-banner-actions">
        <button
          className="btn btn-primary"
          onClick={() => updateInfo.releaseUrl && void window.naiDesktop.openExternal(updateInfo.releaseUrl)}
        >
          {t("update.download")}
        </button>
        <button className="btn btn-ghost" onClick={dismissUpdate}>
          {t("update.later")}
        </button>
      </div>
    </div>
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
        ⟲
      </button>
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

  // Apply theme class
  useEffect(() => {
    if (!settings) return;
    const resolved =
      settings.theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : settings.theme;
    document.documentElement.classList.toggle("theme-dark", resolved === "dark");
  }, [settings?.theme]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(clearToast, 4500);
    return () => window.clearTimeout(timer);
  }, [toast, clearToast]);

  return (
    <div className="app-shell">
      <TitleBar />
      <UpdateBanner />
      <MenuBar openSettings={() => setShowSettings(true)} />
      <TabBar />
      <div
        className={clsx("workspace", (activeTab === "tools" || activeTab === "records") && "workspace-tools")}
        style={{ "--ws-left": `${wsLeftWidth}px`, "--ws-right": `${wsRightWidth}px` } as CSSProperties}
      >
        {activeTab === "tools" ? (
          <Suspense fallback={<div className="lazy-tool-loading">{t("tool.loadingTools")}</div>}>
            <ToolsHub />
          </Suspense>
        ) : activeTab === "records" ? (
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
      </div>
      <footer className="status-bar">
        <span>{statusText}</span>
        {currentImage && (
          <span>{format(new Date(currentImage.createdAt), "yyyy-MM-dd HH:mm:ss")}</span>
        )}
      </footer>
      {showOnboarding && <OnboardingWizard />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {toast && <div className="toast">{toast}</div>}
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
    void load();
    void checkUpdate();
    // Keep the real boot path fast, but let the entrance breathe. 300ms felt
    // like a flash-cut from the splash artwork into the workbench; ~0.9s keeps
    // the app feeling responsive while making the transition intentional.
    const timer = window.setTimeout(() => setSplash(false), SPLASH_MIN_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [load, checkUpdate]);

  const shouldShowSplash = useMemo(() => splash || !bootDone, [splash, bootDone]);
  return shouldShowSplash ? <SplashPage /> : <MainPage />;
}
