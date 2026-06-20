import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { format } from "date-fns";
import { ToolsHub } from "./ComicGenerator";
import { InpaintCanvas } from "./InpaintCanvas";
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
import {
  CAT_COLOR,
  CAT_LABEL,
  TAB_ITEMS,
  pickPromptChips,
  tagDescription,
  zhForTag,
  type PromptChip,
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
  type HistoryGroup,
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
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const composingRef = useRef(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function clearSuggestions() { setSuggestions([]); }

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
        <div className="ac-dropdown">
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
                <span className="ac-desc">{tagDescription(s)}</span>
              </span>
              <span className="ac-meta">
                <span>{CAT_LABEL[s.category] ?? "标签"}</span>
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
        <p className="splash-sub">NovelAI API 图像创作工作台</p>
        <p className="splash-ver">v{APP_VERSION}</p>
      </div>
    </div>
  );
}

// ── Title bar ─────────────────────────────────────────────────────────────────
function TitleBar() {
  const account = useAppStore((state) => state.account);
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
          ? `${account.tierName ?? "已连接"} · Anlas ${account.anlasBalance ?? "未知"}${account.stale ? "（缓存）" : ""}`
          : "未连接 API"}
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

  return (
    <nav className="menu-bar compact-toolbar">
      <button
        className="menu-action"
        onClick={() => settings?.outputDir && window.naiDesktop.openInExplorer(settings.outputDir)}
      >
        <IconText icon={<Icon name="folder" />}>输出目录</IconText>
      </button>
      <button className="menu-action" onClick={openSettings}>
        <IconText icon="⚙">设置</IconText>
      </button>
      <button className="menu-action" onClick={() => window.naiDesktop.openExternal(docsUrl)}>
        <IconText icon="❔">文档</IconText>
      </button>
    </nav>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────
function TabBar() {
  const activeTab = useAppStore((state) => state.activeTab);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  return (
    <div className="tab-bar">
      {TAB_ITEMS.map(({ value, label, icon, title }) => (
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

  return (
    <AppPortal>
      <div className="modal-backdrop">
      <div className="modal advanced-modal">
        <header>
          <h2>高级参数</h2>
          <button onClick={onClose}>×</button>
        </header>
        <div className="advanced-grid">
          <NumberInput label="Steps（采样步数）" value={params.steps} min={1} max={50} onChange={(v) => setParam("steps", v)} />
          <NumberInput label="CFG Scale（提示词引导）" value={params.cfgScale} min={1} max={10} step={0.1} onChange={(v) => setParam("cfgScale", Math.min(10, Math.max(1, v)))} />
          <NumberInput label="CFG Rescale（重缩放）" value={params.cfgRescale} min={0} max={1} step={0.01} onChange={(v) => setParam("cfgRescale", v)} />
          <label className="field">
            <span>Sampler（采样器）</span>
            <select value={params.sampler} onChange={(e) => setParam("sampler", e.target.value as GenerateParams["sampler"])}>
              {NAI_SAMPLERS.map((s) => (
                <option value={s.value} key={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Noise Schedule（噪声计划）</span>
            <select value={params.noiseSchedule} onChange={(e) => setParam("noiseSchedule", e.target.value)}>
              <option value="native">Native（原生）</option>
              <option value="karras">Karras（常用）</option>
              <option value="exponential">Exponential（指数）</option>
            </select>
          </label>
          <label className="field">
            <span>UC Preset（负面预设）</span>
            <select value={params.ucPreset} onChange={(e) => setParam("ucPreset", Number(e.target.value) as GenerateParams["ucPreset"])}>
              {NAI_UC_PRESETS.map((p) => (
                <option value={p.value} key={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="toggle-list compact">
          <Toggle checked={params.qualityToggle} onChange={(v) => setParam("qualityToggle", v)} label="Quality Toggle（质量词）" description="自动追加官方常用质量提示词。" />
          {/* SMEA / SMEA Dyn only exist on V3-era models; V4/V4.5 ignore them, so
              we hide the toggles there instead of showing a control with no effect. */}
          {!params.model.includes("-4") && (
            <>
              <Toggle checked={params.smea} onChange={(v) => setParam("smea", v)} label="SMEA（高级采样）" description="仅 V3 及更早模型可用。" />
              <Toggle checked={params.smeaDyn} onChange={(v) => setParam("smeaDyn", v)} label="SMEA Dyn（动态 SMEA）" description="仅在 SMEA 开启时生效。" />
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
            <IconText icon="↺">重置为默认</IconText>
          </Button>
          <Button variant="primary" onClick={onClose}>
            <IconText icon="✓">确认</IconText>
          </Button>
        </footer>
      </div>
      </div>
    </AppPortal>
  );
}

// ── Vibe Transfer modal ───────────────────────────────────────────────────────
const PRECISE_TYPE_LABELS: Record<PreciseReferenceType, string> = {
  character: "角色",
  style: "风格",
  "character&style": "角色和风格",
};

function VibeTransferModal({ onClose }: { onClose: () => void }) {
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
  const model = useAppStore((state) => state.params.model);
  const isV45 = model.includes("4-5");

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
      const base64 = dataUrl.split(",")[1] ?? "";
      addPreciseReference({
        id: crypto.randomUUID(),
        previewUrl: dataUrl,
        base64,
        type: "character&style",
        strength: 1,
        fidelity: 1,
      });
    };
    reader.readAsDataURL(file);
  }

  return (
    <AppPortal>
      <div className="modal-backdrop">
      <div className="modal vibe-modal">
        <header>
          <h2>参考图管理（氛围迁移 / 精准参考）</h2>
          <button onClick={onClose}>×</button>
        </header>
        <div className="vibe-body">
          <h3 className="vibe-section-title">氛围迁移（Vibe Transfer）</h3>
          {vibeImages.length === 0 && <p className="vibe-empty">还没有氛围迁移图。</p>}
          {vibeImages.map((img) => (
            <div className="vibe-row" key={img.id}>
              <img src={img.previewUrl} className="vibe-thumb" alt="参考图" />
              <div className="vibe-row-sliders">
                <SliderInput
                  label="信息提取量"
                  value={img.infoExtracted}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => updateVibeImage(img.id, { infoExtracted: v })}
                />
                <SliderInput
                  label="参考强度"
                  value={img.strength}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => updateVibeImage(img.id, { strength: v })}
                />
              </div>
              <button className="vibe-remove" title="移除" onClick={() => removeVibeImage(img.id)}>
                ×
              </button>
            </div>
          ))}

          <h3 className="vibe-section-title">
            精准参考（Precise Reference）
            {!isV45 && <span className="vibe-hint"> · 仅 V4.5 模型生效，当前模型不支持</span>}
          </h3>
          {preciseReferences.length === 0 && <p className="vibe-empty">还没有精准参考图。</p>}
          {preciseReferences.map((ref) => (
            <div className="vibe-row" key={ref.id}>
              <img src={ref.previewUrl} className="vibe-thumb" alt="精准参考图" />
              <div className="vibe-row-sliders">
                <label className="field">
                  <span>参考类型</span>
                  <select
                    value={ref.type}
                    onChange={(e) => updatePreciseReference(ref.id, { type: e.target.value as PreciseReferenceType })}
                  >
                    {(Object.keys(PRECISE_TYPE_LABELS) as PreciseReferenceType[]).map((t) => (
                      <option key={t} value={t}>{PRECISE_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </label>
                <SliderInput
                  label="参考强度 Strength"
                  value={ref.strength}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => updatePreciseReference(ref.id, { strength: v })}
                />
                <SliderInput
                  label="保真度 Fidelity"
                  value={ref.fidelity}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => updatePreciseReference(ref.id, { fidelity: v })}
                />
              </div>
              <button className="vibe-remove" title="移除" onClick={() => removePreciseReference(ref.id)}>
                ×
              </button>
            </div>
          ))}

          <div className="vibe-add-row">
            <label className="btn btn-secondary vibe-add-btn">
              <IconText icon="+">氛围迁移图</IconText>
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
              <IconText icon="+">精准参考图（V4.5）</IconText>
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
            <IconText icon="⌧">清空所有</IconText>
          </Button>
          <Button variant="primary" onClick={onClose}>
            <IconText icon="✓">完成</IconText>
          </Button>
        </footer>
      </div>
      </div>
    </AppPortal>
  );
}

// ── Character Captions modal ──────────────────────────────────────────────────
function CharCaptionsModal({ onClose }: { onClose: () => void }) {
  const charCaptions = useAppStore((state) => state.charCaptions);
  const params = useAppStore((state) => state.params);
  const addCharCaption = useAppStore((state) => state.addCharCaption);
  const removeCharCaption = useAppStore((state) => state.removeCharCaption);
  const updateCharCaption = useAppStore((state) => state.updateCharCaption);
  const clearCharCaptions = useAppStore((state) => state.clearCharCaptions);
  const isV4 = params.model.includes("-4");

  return (
    <AppPortal>
      <div className="modal-backdrop">
      <div className="modal char-modal">
        <header>
          <h2>角色提示词（Character Prompt）</h2>
          <button onClick={onClose}>×</button>
        </header>
        <div className="char-body">
          {!isV4 && (
            <div className="status-box bad">
              角色提示词仅支持 V4 / V4.5 模型，当前模型不兼容，生成时将忽略角色设置。
            </div>
          )}
          {charCaptions.map((cc, idx) => (
            <div className="char-row" key={cc.id}>
              <div className="char-row-head">
                <strong>角色 {idx + 1}</strong>
                <Button variant="ghost" onClick={() => removeCharCaption(cc.id)}>
                  <IconText icon="✕">删除</IconText>
                </Button>
              </div>
              <textarea
                className="prompt-box char-prompt"
                value={cc.prompt}
                placeholder="输入该角色的提示词，例如：girl, blue dress, long hair"
                onChange={(e) => updateCharCaption(cc.id, { prompt: e.target.value })}
              />
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={cc.useCoords}
                  onChange={(e) => updateCharCaption(cc.id, { useCoords: e.target.checked })}
                />
                <span>指定角色位置（中心点，0 = 左/上，1 = 右/下）</span>
              </label>
              {cc.useCoords && (
                <div className="char-coords">
                  <NumberInput
                    label="X 位置（左→右）"
                    value={cc.x}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(v) => updateCharCaption(cc.id, { x: v })}
                  />
                  <NumberInput
                    label="Y 位置（上→下）"
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
            <IconText icon="+">添加角色</IconText>
          </Button>
        </div>
        <footer>
          <Button onClick={clearCharCaptions}>
            <IconText icon="⌧">清空角色</IconText>
          </Button>
          <Button variant="primary" onClick={onClose}>
            <IconText icon="✓">完成</IconText>
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
  const [promptChips, setPromptChips] = useState<PromptChip[]>(() => pickPromptChips());
  const [serverChips, setServerChips] = useState<{ tag: string; zh: string }[]>([]);
  const capsuleUsesMcp = Boolean(settings?.tagServerEnabled && settings?.mcpForCapsule);
  const promptValue = promptTab === "positive" ? params.positivePrompt : params.negativePrompt;
  const promptKey = promptTab === "positive" ? "positivePrompt" : "negativePrompt";
  const templates: PromptTemplate[] = settings?.promptTemplates ?? [];
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
    setToast(`已应用模板「${tpl.name}」`);
  }

  function appendChip(tag: string) {
    const current = promptValue.trim();
    const next = current ? `${current.replace(/\s*,?\s*$/, "")}, ${tag}, ` : `${tag}, `;
    setParam(promptKey, next);
    setPromptChips(pickPromptChips(24, chipQuery));
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
    setToast(next ? "已开启输入提词" : "已关闭输入提词");
  }

  const modelMode: ModelMode = settings?.modelMode ?? "anime";
  async function switchModelMode(mode: ModelMode) {
    if (mode === modelMode) return;
    await window.naiDesktop.setSetting("modelMode", mode);
    await refreshSettings();
    setParam("model", DEFAULT_MODEL_FOR_MODE[mode]);
    setToast(mode === "furry" ? "已切换到 Furry 模式" : "已切换到动漫模式");
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
    setToast(next ? "已锁定并保存为默认（重置/模板不会改动）" : "已解锁");
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
      setToast("提示词为空，无需翻译");
      return;
    }
    if (!/[一-鿿]/.test(text)) {
      setToast("当前提示词已是英文");
      return;
    }
    setTranslating(true);
    try {
      const res = await window.naiDesktop.translate(text, "en");
      if (res.ok && res.text) {
        setParam(promptKey, res.text.trim() + (res.text.trim().endsWith(",") ? " " : ", "));
        setToast("已翻译为英文，请检查标签");
      } else {
        setToast(res.error ?? "翻译失败");
      }
    } catch {
      setToast("翻译失败，请检查网络");
    } finally {
      setTranslating(false);
    }
  }

  useEffect(() => {
    setPromptChips(pickPromptChips(24, chipQuery));
  }, [chipQuery]);

  // When the MCP/tag service is enabled for the capsule, search it (debounced)
  // and show server-backed tags alongside the offline dictionary chips.
  useEffect(() => {
    const q = chipQuery.trim();
    if (q.length < 2 || !capsuleUsesMcp) {
      setServerChips([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await window.naiDesktop.searchTagServer(q, 16);
        if (!cancelled) setServerChips(res.map((r) => ({ tag: r.tag, zh: (r.description ?? "").trim() || zhForTag(r.tag) })));
      } catch {
        if (!cancelled) setServerChips([]);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [chipQuery, capsuleUsesMcp]);

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
          <span>模型</span>
          <div className="model-mode-switch">
            <button type="button" className={clsx(modelMode === "anime" && "active")} onClick={() => void switchModelMode("anime")}>
              <Icon name="palette" /> 动漫模式
            </button>
            <button type="button" className={clsx(modelMode === "furry" && "active")} onClick={() => void switchModelMode("furry")}>
              <Icon name="paw" /> Furry 模式
            </button>
          </div>
          <select value={params.model} onChange={(e) => setParam("model", e.target.value as GenerateParams["model"])}>
            {NAI_MODELS.filter((m) => m.mode === modelMode).map((m) => (
              <option value={m.value} key={m.value}>{m.label}</option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        <span className="field-label-row">
          风格提示词（Style Prompt）
          <button
            type="button"
            className={clsx("lock-btn", styleLocked && "locked")}
            title={styleLocked ? "已锁定：重置/模板不会改动，重启保留。点击解锁" : "锁定并保存当前风格提示词，使其固定不变"}
            onClick={() => void toggleLock("style")}
          >
            {styleLocked ? <><Icon name="lock" /> 已锁定</> : <><Icon name="unlock" /> 锁定</>}
          </button>
        </span>
        <input
          value={params.stylePrompt}
          placeholder="输入风格提示词，如 anime style, watercolor..."
          onChange={(e) => setLockedAwareParam("stylePrompt", e.target.value)}
        />
      </label>
      <div className={clsx("prompt-chip-zone", !chipOpen && "collapsed")}>
        <button type="button" className="prompt-chip-head" onClick={() => setChipOpen((v) => !v)}>
          <span className="chip-head-title">
            <span className={clsx("chip-caret", chipOpen && "open")}>▸</span>
            灵感胶囊
          </span>
          <small className="chip-head-hint">{capsuleUsesMcp ? "MCP 已启用 · 中文搜索标签" : chipOpen ? "中文搜索 → 点击插入标签" : "点击展开 · 中文搜 Danbooru 标签"}</small>
        </button>
        {chipOpen && (
          <>
            <div className="prompt-chip-toolbar">
              <input
                className="prompt-chip-search"
                value={chipQuery}
                placeholder="输入中文大概意思，例如：蓝眼白发、夜景城市、水彩风格"
                onChange={(e) => setChipQuery(e.target.value)}
              />
              <button type="button" className="chip-refresh" onClick={() => setPromptChips(pickPromptChips(24, chipQuery))}>换一组</button>
            </div>
            {serverChips.length > 0 && (
              <div className="related-tags">
                <div className="related-tags-head"><Icon name="plug" /> MCP 推荐（{settings?.tagServerTool || "search_tags"}）</div>
                <div className="prompt-chip-list">
                  {serverChips.map((c) => (
                    <button key={`mcp-${c.tag}`} type="button" onClick={() => appendChip(c.tag)} title={`${c.tag}：${c.zh}`}>
                      <span>{c.tag}</span>
                      {c.zh && <small>{c.zh}</small>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="prompt-chip-list">
              {promptChips.length === 0 ? (
                <span className="chip-empty">没有匹配的标签，换个中文词试试（如「猫耳」「赛博朋克」）</span>
              ) : (
                promptChips.map((chip) => (
                  <button key={chip.tag} type="button" onClick={() => appendChip(chip.tag)} title={`${chip.tag}：${chip.zh}`}>
                    <span>{chip.tag}</span>
                    <small>{chip.zh}</small>
                  </button>
                ))
              )}
            </div>
            {related.length > 0 && (
              <div className="related-tags">
                <div className="related-tags-head"><Icon name="link" /> 相关推荐（常一起使用）</div>
                <div className="prompt-chip-list">
                  {related.map((r) => (
                    <button key={r.tag} type="button" onClick={() => appendChip(r.tag)} title={`${r.tag}：${r.zh}`}>
                      <span>{r.tag}</span>
                      <small>{r.zh}</small>
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
          正面提示词
        </button>
        <button className={clsx(promptTab === "negative" && "active")} onClick={() => setPromptTab("negative")}>
          负面提示词{negLocked ? <> <Icon name="lock" /></> : ""}
        </button>
        {promptTab === "negative" && (
          <button
            type="button"
            className={clsx("lock-btn", negLocked && "locked")}
            title={negLocked ? "已锁定：重置/模板不会改动，重启保留。点击解锁" : "锁定并保存当前负面提示词，使其固定不变"}
            onClick={() => void toggleLock("neg")}
          >
            {negLocked ? <><Icon name="lock" /> 已锁定</> : <><Icon name="unlock" /> 锁定</>}
          </button>
        )}
      </div>
      <PromptTextarea
        value={promptValue}
        onChange={(v) => setLockedAwareParam(promptKey, v)}
        model={params.model}
        enabled={settings?.autoComplete ?? true}
        placeholder={promptTab === "positive" ? "输入正面提示词..." : "输入不希望出现的内容..."}
      />
      <div className="prompt-toolbar-row">
        <button type="button" className="prompt-tool-btn" onClick={() => setShowWeights((v) => !v)} disabled={weightTags.length === 0}>
          ⚖ 权重微调{weightTags.length ? ` (${weightTags.length})` : ""} {showWeights ? "▲" : "▼"}
        </button>
        <button type="button" className="prompt-tool-btn" onClick={() => void translatePrompt()} disabled={translating}>
          {translating ? "翻译中…" : <><Icon name="globe" /> 中→英翻译</>}
        </button>
        <button type="button" className="prompt-tool-btn" onClick={() => setShowNormalize(true)} disabled={!promptValue.trim()}>
          <Icon name="sparkles" /> 标准化
        </button>
        <button
          type="button"
          className={clsx("prompt-tool-btn", (settings?.autoComplete ?? true) && "tool-on")}
          title="输入英文时推测候选 tag 的功能"
          onClick={() => void toggleAutoComplete()}
        >
          <Icon name="bulb" /> {(settings?.autoComplete ?? true) ? "提词：开" : "提词：关"}
        </button>
      </div>
      {showWeights && weightTags.length > 0 && (
        <div className="weight-editor">
          <div className="weight-editor-hint">点击 − / ＋ 调整该标签权重（基于 NovelAI 的 {"{}"} / [] 语法）</div>
          <div className="weight-tag-list">
            {weightTags.map((wt, i) => (
              <div key={`${wt.core}-${i}`} className={clsx("weight-tag", wt.level > 0 && "up", wt.level < 0 && "down")}>
                <button type="button" className="weight-btn" title="降低权重" onClick={() => bumpWeight(i, -1)}>−</button>
                <span className="weight-tag-core" title={wt.raw}>
                  {wt.core || "(空)"}
                  {wt.level !== 0 && <em>{formatMultiplier(wt.level)}</em>}
                </span>
                <button type="button" className="weight-btn" title="提高权重" onClick={() => bumpWeight(i, 1)}>＋</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="prompt-helper">
        {settings?.autoComplete ?? true
          ? "英文输入 1 个字符即可推测 tag；↑↓ 选择，Tab/Enter 插入，Esc 关闭。"
          : "Tag 自动补全已关闭，可在设置 › 提示词/补全 中开启。"}
      </div>
      <div className="token-counter">
        {tagCount > 0 && (
          <>
            <span>{tagCount} 个标签</span>
            <span className={clsx(tokenWarn && "token-warn")}>
              ≈{tokenEst} tokens{tokenWarn ? <> <Icon name="warning" /> 超出225限制</> : ""}
            </span>
          </>
        )}
      </div>
      <div className="quick-actions">
        <Button onClick={() => setShowCharModal(true)}>
          <IconText icon="♙">角色提示{charCaptions.length > 0 ? ` · ${charCaptions.length}` : ""}</IconText>
        </Button>
        <Button onClick={() => setShowVibeModal(true)}>
          <IconText icon="◒">氛围迁移{vibeImages.length > 0 ? ` · ${vibeImages.length}` : ""}</IconText>
        </Button>
        <Button onClick={() => setShowVibeModal(true)}>
          <IconText icon="◇">精准参考{preciseRefCount > 0 ? ` · ${preciseRefCount}` : ""}</IconText>
        </Button>
        {templates.length > 0 && (
          <div className="template-dropdown" style={{ position: "relative" }}>
            <Button onClick={() => setShowTemplateMenu((v) => !v)}>
              <IconText icon="▣">模板{showTemplateMenu ? " ▲" : " ▼"}</IconText>
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
        <NumberInput label="宽度" value={params.width} min={64} max={1600} step={64} onChange={(v) => setParam("width", snapDimension(v))} />
        <span>×</span>
        <NumberInput label="高度" value={params.height} min={64} max={1600} step={64} onChange={(v) => setParam("height", snapDimension(v))} />
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
          <Icon name="dice" /> 随机种子
        </button>
        <button
          type="button"
          className={clsx(params.seedMode === "fixed" && "active")}
          onClick={() => {
            setParam("seedMode", "fixed");
            if (params.seed <= 0) setParam("seed", Math.floor(Math.random() * 2_147_483_647));
          }}
        >
          <Icon name="pin" /> 固定种子
        </button>
      </div>
      {params.seedMode === "fixed" && (
        <div className="seed-row">
          <NumberInput label="固定种子值" value={params.seed} min={1} onChange={(v) => setParam("seed", v)} />
          <Button title="随机一个新种子值" onClick={() => setParam("seed", Math.floor(Math.random() * 2_147_483_647))}>
            ⇄
          </Button>
        </div>
      )}
      <label className="checkbox-line">
        <input type="checkbox" checked={params.variety} onChange={(e) => setParam("variety", e.target.checked)} />
        <span>多样化（Variety+）</span>
      </label>
      <Button className="full" onClick={() => setShowAdvanced(true)}>
        <IconText icon="⚙">高级参数...</IconText>
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
            setToast("提示词已标准化");
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
  const [opts, setOpts] = useState<NormalizeOptions>(DEFAULT_NORMALIZE_OPTIONS);
  const preview = useMemo(() => normalizePrompt(value, opts), [value, opts]);
  return (
    <AppPortal>
      <div className="modal-backdrop" onMouseDown={onClose}>
        <div className="modal normalize-modal" onMouseDown={(e) => e.stopPropagation()}>
          <header>
            <h2>提示词标准化</h2>
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
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <div className="normalize-preview">
              <small>预览</small>
              <div className="normalize-preview-box">{preview || "（结果为空）"}</div>
            </div>
          </div>
          <footer>
            <Button onClick={onClose}>取消</Button>
            <Button variant="primary" disabled={!preview.trim()} onClick={() => onApply(preview)}>
              应用
            </Button>
          </footer>
        </div>
      </div>
    </AppPortal>
  );
}

// ── Workbench image upload ────────────────────────────────────────────────────
function WorkbenchImageUpload() {
  const workbenchImage = useAppStore((state) => state.workbenchImage);
  const loadWorkbenchImage = useAppStore((state) => state.loadWorkbenchImage);
  const loadWorkbenchFromPath = useAppStore((state) => state.loadWorkbenchFromPath);
  const clearWorkbenchImage = useAppStore((state) => state.clearWorkbenchImage);
  const [dragging, setDragging] = useState(false);

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
          <img src={workbenchImage.fileUrl} alt="已加载图片" className="wb-thumb" />
          <small>
            {workbenchImage.width || "未知"} × {workbenchImage.height || "未知"}
          </small>
          <div className="row-actions tight">
          <Button className="full" onClick={loadWorkbenchImage}>
            <IconText icon="↻">重新加载</IconText>
          </Button>
            <Button variant="ghost" onClick={() => void clearWorkbenchImage()}>
              <IconText icon="✕">清除</IconText>
            </Button>
          </div>
        </>
      ) : (
        <Button className="full" onClick={loadWorkbenchImage}>
          <IconText icon={<Icon name="folderOpen" />}>加载图片...</IconText>
        </Button>
      )}
      <small className="wb-drop-hint">拖入图片可直接加载</small>
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
      ? "NovelAI 官方报价接口（实际扣费）"
      : quote?.source === "estimate-formula"
        ? "本地估算（官网前端公式，非实际扣费）"
        : quote?.source === "estimate-fixed"
          ? "本地估算（固定规则，非实际扣费）"
          : "";
  const isEstimate = quote?.source === "estimate-formula" || quote?.source === "estimate-fixed";
  const primary =
    quote?.ok && typeof quote.amount === "number"
      ? quote.amount === 0
        ? "本次 0 Anlas"
        : isEstimate
          ? `本次约扣 ${quote.amount} Anlas（估算）`
          : `本次将扣 ${quote.amount} Anlas`
      : loading
        ? "正在读取扣费..."
        : quote?.message || "暂时无法报价";
  const actualText = isGenerating
    ? currentAnlasSpent != null
      ? `当前已实扣 ${currentAnlasSpent} Anlas`
      : "执行中，等待余额校验"
    : lastAnlasSpent != null
      ? `上次实扣 ${lastAnlasSpent} Anlas`
      : "执行后会用余额差再次核对";

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
        <small>{sourceLabel || "读取当前配置对应的扣费估算"}</small>
      </div>
      <strong>{primary}</strong>
      <small className="cost-balance">
        当前余额：{balance ?? "未知"} Anlas{account.stale ? "（缓存）" : ""} · {actualText}
        {quote?.insufficient ? " · 余额不足，执行时会被阻止" : ""}
      </small>
    </div>
  );
}

function AccountAndRunButton({
  label,
  onRun,
  openSettings,
  disabled = false,
  disabledReason = "",
}: {
  label: string;
  onRun: () => void;
  openSettings: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const account = useAppStore((state) => state.account);
  const isGenerating = useAppStore((state) => state.isGenerating);
  const cancel = useAppStore((state) => state.cancel);
  const togglePause = useAppStore((state) => state.togglePause);
  const queuePaused = useAppStore((state) => state.queuePaused);
  const queueProgress = useAppStore((state) => state.queueProgress);
  const currentAnlasSpent = useAppStore((state) => state.currentAnlasSpent);
  const lastAnlasSpent = useAppStore((state) => state.lastAnlasSpent);
  const refreshAccount = useAppStore((state) => state.refreshAccount);
  const [refreshingAccount, setRefreshingAccount] = useState(false);
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
          <strong>{account.hasToken ? account.tierName ?? "已配置 API" : "未设置 API"}</strong>
          <small>
            Anlas：{account.anlasBalance ?? "未知"}
            {account.expiresAt ? ` · 到期 ${account.expiresAt}` : ""}
          </small>
        </div>
        <button type="button" onClick={() => void refreshBalance()} disabled={!account.hasToken || refreshingAccount}>
          {refreshingAccount ? "刷新中" : "刷新积分"}
        </button>
      </div>
      {!account.hasToken ? (
        <Button variant="primary" className="full" onClick={openSettings}>
          <IconText icon={<Icon name="key" />}>请先设置 API</IconText>
        </Button>
      ) : isGenerating ? (
        <>
          {queueProgress && queueProgress.total > 1 && (
            <div className="queue-progress">
              进度 {queueProgress.done + queueProgress.failed}/{queueProgress.total}
              {queueProgress.failed > 0 ? ` · 失败 ${queueProgress.failed}` : ""}
            </div>
          )}
          <div className="anlas-spent">
            {currentAnlasSpent != null ? `本次已实扣 ${currentAnlasSpent} Anlas` : "本次实扣读取中"}
          </div>
          <div className="run-button-row">
            <Button variant="secondary" className="run-row-btn" onClick={togglePause}>
              {queuePaused ? "▶ 继续生成" : "⏸ 暂停"}
            </Button>
            <Button variant="danger" className="run-row-btn" onClick={() => void cancel()}>
              ✕ 停止
            </Button>
          </div>
        </>
      ) : (
        <>
          {lastAnlasSpent != null && (
            <div className="anlas-spent">上次实扣 {lastAnlasSpent} Anlas</div>
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
  const generate = useAppStore((state) => state.generate);
  const batchCount = useAppStore((state) => state.batchCount);
  const setBatchCount = useAppStore((state) => state.setBatchCount);
  const fileNamePrefix = useAppStore((state) => state.params.fileNamePrefix);
  const setParam = useAppStore((state) => state.setParam);

  return (
    <>
      <div className="panel-scroll">
        <PromptAndParams />
        <div className="batch-row">
          <span>批量生成数量</span>
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
          <span>图片命名（文件名前缀，可留空）</span>
          <input
            value={fileNamePrefix}
            placeholder="例如：我的角色 → 我的角色_20260617_01.png"
            onChange={(e) => setParam("fileNamePrefix", e.target.value)}
          />
        </label>
        <p className="wildcard-hint">
          <Icon name="bulb" /> 支持动态提示词通配符 <code>{"{red|blue|green} hair"}</code>，批量时每张随机取一项；NovelAI 的 <code>{"{tag}"}</code> 权重语法不受影响。
        </p>
        <FeatureCostCard label="生成前扣费" feature="generate" />
      </div>
      <AccountAndRunButton
        label={batchCount > 1 ? `批量生成 ${batchCount} 张` : "生成"}
        onRun={() => void generate()}
        openSettings={openSettings}
      />
    </>
  );
}

// ── I2I panel ─────────────────────────────────────────────────────────────────
function I2IPanel({ openSettings }: { openSettings: () => void }) {
  const i2iParams = useAppStore((state) => state.i2iParams);
  const setI2IParam = useAppStore((state) => state.setI2IParam);
  const generateI2I = useAppStore((state) => state.generateI2I);
  return (
    <>
      <div className="panel-scroll">
        <WorkbenchImageUpload />
        <SliderInput label="Strength（改图强度）" value={i2iParams.strength} min={0} max={1} step={0.01} onChange={(v) => setI2IParam("strength", v)} />
        <SliderInput label="Noise（噪声）" value={i2iParams.noise} min={0} max={0.99} step={0.01} onChange={(v) => setI2IParam("noise", v)} />
        <NumberInput label="Extra Noise Seed（0 = 随机）" value={i2iParams.extraNoiseSeed} min={0} onChange={(v) => setI2IParam("extraNoiseSeed", v)} />
        <div className="panel-divider" />
        <PromptAndParams />
        <FeatureCostCard label="生成前扣费" feature="i2i" />
      </div>
      <AccountAndRunButton label="图生图" onRun={() => void generateI2I()} openSettings={openSettings} />
    </>
  );
}

// ── Inpaint panel ─────────────────────────────────────────────────────────────
function InpaintPanel({ openSettings }: { openSettings: () => void }) {
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
  return (
    <>
      <div className="panel-scroll">
        <WorkbenchImageUpload />
        <label className="field">
          <span>重绘模型</span>
          <select value={inpaintModel} onChange={(e) => setInpaintModel(e.target.value as typeof inpaintModel)}>
            {NAI_INPAINT_MODELS.map((m) => (
              <option value={m.value} key={m.value}>{m.label}</option>
            ))}
          </select>
        </label>
        <SliderInput label="重绘强度（1=完全按提示词重画，越低越贴近原图）" value={inpaintStrength} min={0.1} max={1} step={0.01} onChange={setInpaintStrength} />
        <SliderInput label="重绘噪声（一般保持 0）" value={inpaintNoise} min={0} max={0.99} step={0.01} onChange={setInpaintNoise} />
        <SliderInput
          label="圆形画笔大小"
          value={brushSize}
          min={2}
          max={128}
          step={1}
          onChange={setBrushSize}
        />
        <SliderInput label="画笔透明度（仅影响画面涂抹显示）" value={brushOpacity} min={0.05} max={1} step={0.01} onChange={setBrushOpacity} />
        <div className="mode-buttons">
          <Button variant={brushMode === "paint" ? "primary" : "secondary"} onClick={() => setBrushMode("paint")}>
            <IconText icon="✎">画笔（白=重绘）</IconText>
          </Button>
          <Button variant={brushMode === "erase" ? "primary" : "secondary"} onClick={() => setBrushMode("erase")}>
            <IconText icon="⌫">橡皮（黑=保留）</IconText>
          </Button>
        </div>
        <Button className="full" onClick={clearInpaintMask}>
          <IconText icon="⌧">清空蒙版</IconText>
        </Button>
        <div className="panel-divider" />
        <PromptAndParams includeModel={false} />
        <FeatureCostCard label="生成前扣费" feature="inpaint" />
      </div>
      <AccountAndRunButton label="局部重绘" onRun={() => void inpaint()} openSettings={openSettings} />
    </>
  );
}

// ── Upscale panel ─────────────────────────────────────────────────────────────
function UpscalePanel({ openSettings }: { openSettings: () => void }) {
  const workbenchImage = useAppStore((state) => state.workbenchImage);
  const scale = useAppStore((state) => state.upscaleScale);
  const setScale = useAppStore((state) => state.setUpscaleScale);
  const upscale = useAppStore((state) => state.upscaleCurrentImage);
  const preparedSize = workbenchImage
    ? fitSizeWithinPixels(workbenchImage.width, workbenchImage.height, MAX_NAI_UPSCALE_INPUT_PIXELS)
    : null;
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
            <strong>输出尺寸预估</strong>
            <span>
              {preparedSize?.resized
                ? `${workbenchImage.width}×${workbenchImage.height} → 预缩至 ${preparedSize.width}×${preparedSize.height} → ${preparedSize.width * scale}×${preparedSize.height * scale}`
                : `${workbenchImage.width}×${workbenchImage.height} → ${workbenchImage.width * scale}×${workbenchImage.height * scale}`}
            </span>
            {preparedSize?.resized ? (
              <small>NovelAI 云端超分只接受约 1024×1024 等效面积以内的输入，程序会自动预缩后再超分。</small>
            ) : null}
          </div>
        )}
        <FeatureCostCard label="生成前扣费" feature="upscale" />
      </div>
      <AccountAndRunButton label={`云端超分 ${scale}×`} onRun={() => void upscale()} openSettings={openSettings} />
    </>
  );
}

// ── Director Tools panel ──────────────────────────────────────────────────────
function DirectorPanel({ openSettings }: { openSettings: () => void }) {
  const workbenchImage = useAppStore((state) => state.workbenchImage);
  const tool = useAppStore((state) => state.directorTool);
  const setTool = useAppStore((state) => state.setDirectorTool);
  const options = useAppStore((state) => state.augmentOptions);
  const setOption = useAppStore((state) => state.setAugmentOption);
  const run = useAppStore((state) => state.runDirectorTool);
  const preparedSize = workbenchImage
    ? fitSizeWithinPixels(workbenchImage.width, workbenchImage.height, MAX_NAI_DIRECTOR_INPUT_PIXELS)
    : null;
  return (
    <>
      <div className="panel-scroll">
        <WorkbenchImageUpload />
        <div className="director-tools">
          {DIRECTOR_TOOLS.map((item) => (
            <button className={clsx(tool === item.value && "active")} key={item.value} onClick={() => setTool(item.value)}>
              {item.label}
            </button>
          ))}
        </div>
        {tool === "colorize" && (
          <label className="field">
            <span>Colorize Prompt（上色提示）</span>
            <input value={options.colorizePrompt} placeholder="例如：blue dress, warm sunset light" onChange={(e) => setOption("colorizePrompt", e.target.value)} />
          </label>
        )}
        {tool === "emotion" && (
          <>
            <label className="field">
              <span>Emotion（表情）</span>
              <select value={options.emotion} onChange={(e) => setOption("emotion", e.target.value as typeof options.emotion)}>
                {EMOTION_OPTIONS.map((em) => (
                  <option value={em.value} key={em.value}>{em.label}</option>
                ))}
              </select>
            </label>
            <SliderInput label="Emotion Level（表情强度）" value={options.emotionLevel} min={0} max={5} step={1} onChange={(v) => setOption("emotionLevel", v)} />
          </>
        )}
        <SliderInput label="Defry（去噪强度）" value={options.defry} min={0} max={5} step={1} onChange={(v) => setOption("defry", v)} />
        {workbenchImage && preparedSize?.resized ? (
          <div className="info-card limit-card">
            <strong>后期尺寸保护</strong>
            <span>
              {workbenchImage.width}×{workbenchImage.height} → 预缩至 {preparedSize.width}×{preparedSize.height} 处理 → 恢复到原尺寸保存
            </span>
            <small>大图或透明 PNG 直接送入后期接口容易返回 500，程序会自动转换为白底 PNG 并限制输入尺寸。</small>
          </div>
        ) : null}
        <FeatureCostCard label="生成前扣费" feature="director" />
      </div>
      <AccountAndRunButton label="执行后期处理" onRun={() => void run()} openSettings={openSettings} />
    </>
  );
}

// ── Inspect panel (AI 反推提示词) ─────────────────────────────────────────────
// Per-mode system-prompt template editor (used in both 反推 and 转换 settings).
function ModeTemplateEditor({
  value,
  defaults,
  onChange,
  title = "提示词模板",
}: {
  value: ModePromptTemplates;
  defaults: ModePromptTemplates;
  onChange: (next: ModePromptTemplates) => void;
  title?: string;
}) {
  const [mode, setMode] = useState<ReversePromptMode>("tags");
  const labels: [ReversePromptMode, string][] = [
    ["tags", "Danbooru 标签"],
    ["natural", "自然语言"],
    ["mixed", "混合模式"],
  ];
  const override = value?.[mode]?.trim() ?? "";
  const defaultText = defaults[mode] ?? "";
  const isCustom = override.length > 0 && override !== defaultText.trim();
  // Show the built-in default text when there's no override, so it's never hidden.
  const shown = override.length > 0 ? value[mode] : defaultText;
  return (
    <div className="field">
      <span className="field-label-row">
        <strong>{title}</strong>
        提示词模板（三种模式各自独立，绝不混用）
        <span className={clsx("tpl-state", isCustom && "custom")}>{isCustom ? "已自定义" : "默认"}</span>
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
          title="把当前模式恢复为内置默认模板"
          onClick={() => onChange({ ...value, [mode]: defaultText })}
        >
          ↺ 恢复默认（{labels.find(([v]) => v === mode)?.[1]}）
        </button>
      </div>
      <small className="settings-hint">
        标签 / 自然语言 / 混合三种输出各用<strong>独立</strong>系统提示词，互不混用。直接编辑即生效；点「恢复默认」可随时还原为内置模板。
      </small>
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
  const override = value?.trim() ?? "";
  const isCustom = override.length > 0 && override !== defaultValue.trim();
  const shown = override.length > 0 ? value : defaultValue;
  return (
    <div className="field">
      <span className="field-label-row">
        <strong>{title}</strong>
        {description}
        <span className={clsx("tpl-state", isCustom && "custom")}>{isCustom ? "已自定义" : "默认"}</span>
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
          title="恢复为内置默认模板"
          onClick={() => onChange(defaultValue)}
        >
          ↺ 恢复默认
        </button>
      </div>
      <small className="settings-hint">漫画拆分分镜只使用这一套模板；反推和转换仍按三种模式分别读取上方模板。</small>
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
  if (!variants || (!variants.namePrompt.trim() && !variants.featurePrompt.trim())) return null;
  const cards = [
    ["角色名版", "适合模型库认识该角色时使用。", variants.namePrompt],
    ["特征版", "适合模型库不认识该角色时使用。", variants.featurePrompt],
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
            使用这一版
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
  const inspectMeta = useAppStore((state) => state.inspectMeta);
  const applyParams = useAppStore((state) => state.applyParams);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const [dragging, setDragging] = useState(false);
  const hasImage = Boolean(inspectImageUrl);

  const imported = useMemo(() => (inspectMeta ? parseImportedParams(inspectMeta) : {}), [inspectMeta]);
  const hasMeta = Object.keys(imported).length > 0;

  function restoreParams() {
    if (!hasMeta) {
      setToast("该图片不含可识别的 NovelAI 参数。");
      return;
    }
    applyParams(imported);
    setActiveTab("generate");
    setToast("已从图片元数据还原参数。");
  }

  const modes: [ReversePromptMode, string, string][] = [
    ["tags", "Danbooru 标签", "输出标准 Danbooru tag 格式"],
    ["natural", "自然语言", "输出流畅的描述性文字"],
    ["mixed", "混合模式", "Tag + 自然语言结合"],
  ];
  const scopes: [ReversePromptScope, string, string][] = [
    ["full", "整张图片", "反推完整画面、人物、场景和构图"],
    ["character", "角色", "只反推指定角色的外观、服装、姿态"],
    ["object", "物品", "只反推指定物品或道具"],
    ["scene", "场景", "只反推背景、光照、空间和氛围"],
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
    setToast("提示词已复用至生成面板。");
  }

  // Apply selected template to the reverse prompt result
  function applyTemplate(tpl: PromptTemplate) {
    const base = reversePromptText.trim();
    const parts = [tpl.prefix.trim(), base, tpl.suffix.trim()].filter(Boolean);
    const merged = parts.join(", ");
    setReversePromptText(merged);
    setToast(`已应用模板「${tpl.name}」`);
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
            <img src={inspectImageUrl} className="wb-thumb" style={{ maxHeight: 110 }} alt="检视图" />
          ) : (
            <span style={{ fontSize: 12 }}>拖入图片到此处，或点击下方按钮打开</span>
          )}
          <label className="btn btn-secondary" style={{ cursor: "pointer", fontSize: 12 }}>
            <IconText icon={<Icon name="folderOpen" />}>打开文件</IconText>
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
          <strong>积分说明</strong>
          <span>AI 反推不消耗 NovelAI Anlas；只会调用“AI 反推”中配置的视觉模型 API。</span>
        </div>

        {hasImage && (
          <div className="meta-restore">
            <Button variant="secondary" className="full" disabled={!hasMeta} onClick={restoreParams}>
              ↩ 从图片还原参数
            </Button>
            <small>
              {hasMeta
                ? "读取 NovelAI PNG 内嵌的提示词、种子、采样器等参数并填入生成面板。"
                : "未检测到 NovelAI 参数（图片可能被压缩或来自其它来源）。"}
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
          <span className="field-label-row">反推范围选择</span>
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
            <span>目标/角色提示（可选）</span>
            <input
              value={reversePromptHint}
              placeholder="例如：这是芙宁娜 / 只反推右侧角色 / 只反推桌上的盒子"
              onChange={(e) => setReversePromptHint(e.target.value)}
            />
          </label>
          <label className="checkbox-line prompt-character-toggle">
            <input
              type="checkbox"
              checked={reverseKnownCharacter}
              onChange={(e) => setReverseKnownCharacter(e.target.checked)}
            />
            <span>这是网络/游戏/动漫角色，生成角色名版和特征版</span>
          </label>
        </div>

        {hasImage && (
          <Button
            variant="primary"
            className="full"
            disabled={reversePrompting}
            onClick={() => void runReversePrompt()}
          >
            {reversePrompting ? <IconText icon="…">反推中...</IconText> : <IconText icon="◎">AI 反推提示词</IconText>}
          </Button>
        )}

        {reversePromptText && (
          <>
            <div className="inspect-result-label">反推结果</div>
            <textarea
              className="prompt-box"
              style={{ minHeight: 120 }}
              value={reversePromptText}
              onChange={(e) => setReversePromptText(e.target.value)}
            />
            <PromptVariantCards variants={reversePromptVariants} onUse={setReversePromptText} />
            {templates.length > 0 && (
              <div className="template-apply-row">
                <span style={{ fontSize: 12 }}>应用模板</span>
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
            <p>上传图片后，点击「AI 反推提示词」按钮，将使用视觉模型分析图片内容，自动生成适合 NovelAI 的提示词。</p>
            <p>需要在 <strong>设置 › AI 反推</strong> 中填写视觉模型 API 地址和 Key（支持 OpenAI / 兼容接口）。</p>
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
            <IconText icon="↙">复用至生成面板</IconText>
          </Button>
          {hasImage && (
            <Button className="full" onClick={clearInspect}>
              <IconText icon="✕">清除图片</IconText>
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
  const [generateMode, setGenerateMode] = useState<"t2i" | "i2i">("t2i");
  const meta = TAB_ITEMS.find((item) => item.value === activeTab) ?? TAB_ITEMS[0];
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
              文生图
            </button>
            <button
              className={clsx(generateMode === "i2i" && "active")}
              onClick={() => setGenerateMode("i2i")}
            >
              图生图
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

  function applyToPanel() {
    if (!convertResult.trim()) return;
    setParam("positivePrompt", convertResult.trim());
    setToast("提示词已复用至生成面板。");
  }

  function applyTemplate(tpl: PromptTemplate) {
    const base = convertResult.trim();
    const parts = [tpl.prefix.trim(), base, tpl.suffix.trim()].filter(Boolean);
    setConvertResult(parts.join(", "));
    setToast(`已应用模板「${tpl.name}」`);
  }

  return (
    <>
      <div className="panel-scroll">
        <div className="convert-header">
          <strong>提示词转换</strong>
          <small>输入中文或自然语言描述，AI 将转换为 Danbooru 风格标签</small>
        </div>
        <div className="info-card">
          <strong>积分说明</strong>
          <span>转换不消耗 NovelAI Anlas；只会调用“转换 API”中配置的文本模型。</span>
        </div>

        <label className="field">
          <span>描述输入</span>
          <textarea
            className="prompt-box"
            style={{ minHeight: 110 }}
            value={convertInput}
            placeholder={"例如：\n一个短发蓝眼睛的女孩，穿白色连衣裙，站在樱花树下，阳光照射，动漫风格"}
            onChange={(e) => setConvertInput(e.target.value)}
          />
        </label>

        <div className="mode-selector">
          {([
            ["tags", "Danbooru 标签"],
            ["natural", "自然语言"],
            ["mixed", "混合模式"],
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
          <span>这是网络/游戏/动漫角色，生成角色名版和特征版</span>
        </label>

        <Button
          variant="primary"
          className="full"
          disabled={converting || !convertInput.trim()}
          onClick={() => void runConvertPrompt()}
        >
          {converting ? (
            <IconText icon="…">转换中...</IconText>
          ) : (
            <IconText icon="⇄">
              {convertMode === "tags" ? "转换为 Danbooru 标签" : convertMode === "natural" ? "转换为自然语言" : "转换为混合提示词"}
            </IconText>
          )}
        </Button>

        {convertResult && (
          <>
            <div className="inspect-result-label">转换结果（可编辑）</div>
            <textarea
              className="prompt-box"
              style={{ minHeight: 130 }}
              value={convertResult}
              onChange={(e) => setConvertResult(e.target.value)}
            />
            <PromptVariantCards variants={convertResultVariants} onUse={setConvertResult} />
            {templates.length > 0 && (
              <div className="template-apply-row">
                <span style={{ fontSize: 12 }}>叠加模板</span>
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
            <p>输入任意语言的图像描述，AI 将分析语义并输出符合 NovelAI 风格的 Danbooru 标签组合。</p>
            <p>需要在 <strong>设置 › 转换 API</strong> 中配置文本模型 API。</p>
          </div>
        )}
      </div>
      <div className="left-footer">
        <div style={{ display: "grid", gap: 8 }}>
          <Button variant="primary" className="full" disabled={!convertResult.trim()} onClick={applyToPanel}>
            <IconText icon="↙">复用至生成面板</IconText>
          </Button>
          <Button
            className="full"
            disabled={!convertResult.trim()}
            onClick={() => { void navigator.clipboard.writeText(convertResult); setToast("已复制到剪贴板"); }}
          >
            <IconText icon="⧉">复制结果</IconText>
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
          <strong>AI 调用记录</strong>
          <small>反推 / 转换 / 拆分镜 / 一致性检测每次发送给 AI 的内容与原始返回（最多保留最近 200 条，重启后清空）。</small>
        </div>
        <div className="ai-log-actions">
          <button className="btn btn-ghost" onClick={() => void load()} disabled={loading}>
            {loading ? "刷新中..." : "刷新"}
          </button>
          <button className="btn btn-danger" onClick={() => void clearAll()} disabled={!entries.length}>
            清空
          </button>
        </div>
      </div>
      {entries.length === 0 ? (
        <div className="ai-log-empty">暂无记录。进行一次 AI 反推 / 转换 / 漫画拆分镜后，这里会显示发送与返回内容。</div>
      ) : (
        <div className="ai-log-list">
          {entries.map((entry) => {
            const open = expanded.has(entry.id);
            return (
              <div className={clsx("ai-log-item", entry.ok ? "ok" : "fail")} key={entry.id}>
                <button type="button" className="ai-log-item-head" onClick={() => toggle(entry.id)}>
                  <span className="ai-log-caret">{open ? "▾" : "▸"}</span>
                  <span className={clsx("ai-log-badge", entry.ok ? "ok" : "fail")}>{entry.ok ? "成功" : "失败"}</span>
                  <span className="ai-log-label">{entry.label}</span>
                  <span className="ai-log-meta">{entry.api === "vision" ? "反推API" : "转换API"} · {entry.model}</span>
                  <span className="ai-log-time">{format(new Date(entry.time), "HH:mm:ss")}</span>
                </button>
                {open && (
                  <div className="ai-log-body">
                    <AiLogField title="System Prompt（系统指令）" text={entry.systemPrompt} />
                    <AiLogField title="User（发送内容）" text={entry.userText} />
                    <AiLogField title={entry.ok ? "返回（原始输出）" : "返回（错误信息）"} text={entry.response} />
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
          复制
        </button>
      </div>
      <pre className="ai-log-pre">{text || "（空）"}</pre>
    </div>
  );
}

// ── Image canvas (center) ─────────────────────────────────────────────────────
type ViewableImage = { fileUrl: string; width: number; height: number };

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
          复位
        </button>
        {canCompare ? (
          <button
            type="button"
            className={clsx("btn btn-ghost btn-mini", compareEnabled && "active")}
            onClick={() => setCompareEnabled((value) => !value)}
          >
            对比
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
            draggable={false}
          />
          {compareEnabled && canCompare ? (
            <>
              <img className="zoom-image zoom-image-absolute" src={compareBeforeImage!.fileUrl} alt="处理前图片" draggable={false} />
              <div className="compare-after-clip" style={{ clipPath: compareClip }}>
                <img className="zoom-image zoom-image-absolute" src={image.fileUrl} alt="处理后图片" draggable={false} />
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
                aria-label="拖动查看处理前后差异"
                title="拖动查看处理前后差异"
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
  const inspectImageUrl = useAppStore((state) => state.inspectImageUrl);
  const loadWorkbenchFromPath = useAppStore((state) => state.loadWorkbenchFromPath);
  const [dropOver, setDropOver] = useState(false);
  const superDrop = settings?.superDrop ?? false;
  const dropEnabled = superDrop || activeTab === "generate" || activeTab === "upscale" || activeTab === "postprocess";

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
          <ZoomableImageStage image={{ fileUrl: inspectImageUrl, width: 1, height: 1 }} alt="反推图片" />
        ) : (
          <div className="coming-soon">
            <div className="coming-soon-icon">✦</div>
            <h2>AI 反推提示词</h2>
            <p>在左侧上传图片，选择输出模式（Danbooru 标签 / 自然语言 / 混合），然后点击反推按钮。</p>
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
          <h2>提示词转换</h2>
          <p>在左侧输入中文或自然语言描述，AI 将自动转换为适合 NovelAI 的 Danbooru 风格标签提示词。</p>
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
          <span>放开以加载图片</span>
        </div>
      )}
      {isGenerating && (
        <div className="generating-overlay">
          <div className="spinner" />
          <strong>正在处理图片...</strong>
          <small>请求 NovelAI API，完成后会自动保存并写入历史。</small>
        </div>
      )}
      {!currentImage && !isGenerating && (
        <button className="empty-canvas" onClick={generate}>
          <span className="empty-illustration" aria-hidden="true">
            <span className="empty-orb empty-orb-a" />
            <span className="empty-orb empty-orb-b" />
            <span className="empty-gem">✦</span>
          </span>
          <strong>准备开始创作</strong>
          <span>
            在左侧输入英文 tag 或自然提示词，点击下方生成按钮；结果会自动保存并进入右侧历史。
          </span>
          <span className="empty-shortcuts">
            <span>Tag 自动补全</span>
            <span>{dropEnabled ? "支持拖入图片到工作台" : "API-only 生成"}</span>
            <span>历史一键复用</span>
          </span>
        </button>
      )}
      {currentImage && <ZoomableImageStage image={currentImage} compareBeforeImage={comparisonBeforeImage} alt="生成结果" />}
    </main>
  );
}

// ── Reusable in-app input modal (Electron has no window.prompt) ────────────────
function InputModal({
  title,
  label,
  initial,
  confirmText = "确定",
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
            <Button onClick={onClose}>取消</Button>
            <Button variant="primary" onClick={() => onConfirm(value)}>{confirmText}</Button>
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
        <span>代理连接方式</span>
        <select value={preset} onChange={(event) => selectPreset(event.target.value as ProxyPreset)}>
          <option value="http">HTTP 本地代理（推荐） · 127.0.0.1:7890</option>
          <option value="direct">直连（不使用代理）</option>
          <option value="socks">SOCKS5 本地代理 · 127.0.0.1:10808</option>
          <option value="custom">自定义代理地址</option>
        </select>
      </label>
      {preset === "custom" && (
        <label className="field">
          <span>自定义代理地址</span>
          <input
            value={customValue}
            placeholder="例如 http://127.0.0.1:7890"
            onChange={(event) => {
              setCustomValue(event.target.value);
              onChange(event.target.value);
            }}
          />
        </label>
      )}
      <div className={clsx("proxy-current", preset === "direct" && "direct")}>
        <strong>{preset === "direct" ? "当前为直连" : "当前代理"}</strong>
        <code>{preset === "direct" ? "不经过本地代理" : (preset === "custom" ? customValue : value) || "尚未填写"}</code>
      </div>
    </div>
  );
}

function TokenGuideModal({ onClose }: { onClose: () => void }) {
  const [previewImage, setPreviewImage] = useState("");
  const steps = [
    {
      image: "./tutorial/token-step-1.webp",
      title: "打开左上角菜单",
      description: "登录 NovelAI 生图页面后，点击左上角蓝圈标出的三横线菜单。",
    },
    {
      image: "./tutorial/token-step-2.webp",
      title: "进入 Account Settings",
      description: "菜单展开后，在 Account 区域点击蓝圈标出的 Account Settings。",
    },
    {
      image: "./tutorial/token-step-3.webp",
      title: "获取 Persistent API Token",
      description: "在 User Settings 的 Account 页面点击蓝圈标出的 Get Persistent API Token，并复制完整 Token。",
    },
  ];
  return (
    <AppPortal>
      <div className="modal-backdrop token-guide-backdrop">
        <div className="modal token-guide-modal">
          <header>
            <div>
              <h2>获取 NovelAI Persistent API Token</h2>
              <p>按 NovelAI 当前网页界面操作，无需打开旧 API 文档。</p>
            </div>
            <button type="button" aria-label="关闭 Token 教程" onClick={onClose}>×</button>
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
                  <img src={item.image} alt={`Token 获取教程第 ${index + 1} 步：${item.title}`} loading="lazy" draggable={false} />
                  <span>点击查看大图</span>
                </button>
              </figure>
            ))}
            <div className="token-guide-warning">
              Token 等同账号凭证，只粘贴到本软件，不要截图、分享或写入项目文件。
            </div>
          </div>
          <footer>
            <Button onClick={() => window.naiDesktop.openExternal(novelAiImageUrl)}>打开 NovelAI 生图页</Button>
            <Button variant="primary" onClick={onClose}>我知道了</Button>
          </footer>
        </div>
        {previewImage && (
          <div className="token-guide-preview" onMouseDown={() => setPreviewImage("")}>
            <button type="button" aria-label="关闭大图" onClick={() => setPreviewImage("")}>×</button>
            <img src={previewImage} alt="Token 教程大图" onMouseDown={(event) => event.stopPropagation()} draggable={false} />
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
  const [newGroupName, setNewGroupName] = useState("");
  // window.prompt() is unsupported in Electron, so use an in-app input modal.
  const [renameTarget, setRenameTarget] = useState<
    { kind: "item" | "group"; id: string; initial: string; title: string; label: string } | null
  >(null);

  function renameItem(item: HistoryItem) {
    const current = item.filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? "";
    setRenameTarget({ kind: "item", id: item.id, initial: current, title: "重命名图片", label: "新文件名（不含扩展名，会同步重命名本地文件）" });
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
    setRenameTarget({ kind: "group", id: activeGroup.id, initial: activeGroup.name, title: "重命名分组", label: "分组名称" });
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
    if (window.confirm(`删除分组「${activeGroup.name}」？组内图片会转为未分组（文件保留）。`)) {
      void deleteHistoryGroup(activeGroup.id);
    }
  }

  return (
    <aside className="history-panel">
      <div className="history-title">
        <div>
          <strong>历史与素材</strong>
          <small>{history.length > 0 ? `${history.length} 张可复用图片` : "生成后自动出现在这里"}</small>
        </div>
      </div>
      <div className="history-filters">
        <select aria-label="选择历史日期" value={selectedDate} onChange={(e) => void setSelectedDate(e.target.value)}>
          <option value="">全部日期</option>
          {dates.map((date) => (
            <option value={date} key={date}>{date}</option>
          ))}
        </select>
        <select aria-label="选择素材分组" value={selectedGroupId} onChange={(e) => void setSelectedGroupId(e.target.value)}>
          <option value="">全部分组</option>
          <option value="__ungrouped">未分组</option>
          {groups.map((group) => (
            <option value={group.id} key={group.id}>{group.name}</option>
          ))}
        </select>
        <div className="history-group-create">
          <input
            value={newGroupName}
            placeholder="新建分组名"
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitGroup();
            }}
          />
          <button type="button" onClick={submitGroup}>创建</button>
        </div>
        <div className="history-group-actions">
          <button type="button" disabled={!canExport} title="打包当前分组为 ZIP" onClick={() => void exportHistoryGroup(selectedGroupId)}>
            <Icon name="download" /> 导出ZIP
          </button>
          <button type="button" disabled={!activeGroup} title="重命名当前分组" onClick={renameActiveGroup}>
            ✎ 重命名
          </button>
          <button type="button" disabled={!activeGroup} title="删除当前分组" onClick={deleteActiveGroup}>
            <Icon name="trash" /> 删除
          </button>
        </div>
      </div>
      <div className="history-grid">
        {history.length === 0 && (
          <div className="history-empty">
            <span>◇</span>
            <strong>暂无历史记录</strong>
            <small>生成、重绘、超分、后期处理完成后会自动保存到这里。</small>
          </div>
        )}
        {history.map((item) => (
          <div className="history-item" key={item.id}>
            <button onClick={() => selectImage(item)}>
              <div className="history-thumb-frame">
                <img src={item.fileUrl} alt="历史缩略图" />
              </div>
              <span className="history-meta">{item.model} · {item.width}×{item.height}</span>
            </button>
            <select
              className="history-item-group"
              value={item.groupId ?? ""}
              title="设置素材分组"
              onChange={(e) => void setHistoryItemGroup(item.id, e.target.value || undefined)}
            >
              <option value="">未分组</option>
              {groups.map((group) => (
                <option value={group.id} key={group.id}>{group.name}</option>
              ))}
            </select>
            <button className="history-rename" title="重命名图片（同步本地文件）" onClick={() => renameItem(item)}>
              ✎
            </button>
            <button className="history-delete" title="删除记录和本地文件" onClick={() => void deleteHistory(item.id)}>
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
          confirmText="重命名"
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
  const [tagTestQuery, setTagTestQuery] = useState("蓝眼白发少女");
  const [tagTestMessage, setTagTestMessage] = useState("");
  const [tagTestTags, setTagTestTags] = useState<TagSuggestion[]>([]);
  const [tagTesting, setTagTesting] = useState(false);

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
    setModelCheckMessage("正在检测模型...");
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
    setTagTestMessage("正在检测 Tag/MCP 服务...");
    setTagTestTags([]);
    const result = await window.naiDesktop.testTagServer(tagTestQuery);
    setTagTesting(false);
    setTagTestMessage(result.message);
    setTagTestTags(result.tags.slice(0, 12));
  }

  const nav = [
    ["api", "API 配置"],
    ["storage", "存储"],
    ["ai-reverse", "AI 反推"],
    ["convert-api", "转换 API"],
    ["templates", "提示词模板"],
    ["prompt", "提示词/补全"],
    ["appearance", "外观"],
    ["performance", "性能"],
  ];

  return (
    <AppPortal>
      <div className="modal-backdrop">
      <div className="modal settings-modal">
        <header>
          <h2>设置</h2>
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
                  <strong>当前账号</strong>
                  <span>{account.hasToken ? `${account.tierName ?? "已验证"} · Anlas ${account.anlasBalance ?? "未知"}` : "未配置 API Token"}</span>
                </div>
                <label className="field">
                  <span>API Token（Persistent API Token / 持久令牌）</span>
                  <input type="password" value={token} placeholder="粘贴 NovelAI Persistent API Token" onChange={(e) => setToken(e.target.value)} />
                </label>
                <div className="row-actions">
                  <Button variant="primary" disabled={checking} onClick={verify}>
                    {checking ? <IconText icon="…">验证中...</IconText> : <IconText icon="✓">验证并保存 Token</IconText>}
                  </Button>
                  <Button onClick={() => setShowTokenGuide(true)}>
                    <IconText icon="❔">如何获取 Token</IconText>
                  </Button>
                  <Button
                    variant="danger"
                    onClick={async () => {
                      await window.naiDesktop.clearToken();
                      await refreshAccount();
                    }}
                  >
                    <IconText icon="⇥">退出 API 登录</IconText>
                  </Button>
                </div>
                {status && <div className={clsx("status-box", status.valid ? "ok" : "bad")}>{status.message}</div>}
                <label className="field">
                  <span>API Endpoint（账户接口）</span>
                  <input value={settings.apiBaseUrl} onChange={(e) => void update("apiBaseUrl", e.target.value)} />
                </label>
                <label className="field">
                  <span>Image Endpoint（图片接口）</span>
                  <input value={settings.imageBaseUrl} onChange={(e) => void update("imageBaseUrl", e.target.value)} />
                </label>
                <label className="field-inline">
                  <input
                    type="checkbox"
                    checked={settings.allowCustomEndpoint}
                    onChange={(e) => void update("allowCustomEndpoint", e.target.checked)}
                  />
                  <span>
                    允许向非官方 Endpoint 发送 Token（默认关闭）。关闭时，若 Endpoint 不是 *.novelai.net，会自动改用官方地址以防 Token 泄露。
                  </span>
                </label>

                <div className="proxy-card">
                  <ProxyPresetControl value={settings.proxyUrl} onChange={(value) => void updateProxy(value)} />
                  <p className="settings-hint" style={{ margin: "2px 0 8px" }}>
                    NovelAI、AI 反推、谷歌翻译及更新检查等联网功能可能需要代理。请确保所选端口与本机代理软件一致。
                  </p>
                  <div className="proxy-scope" style={{ opacity: settings.proxyUrl.trim() ? 1 : 0.5 }}>
                    <span className="proxy-scope-title">走代理的请求（关掉则该项直连）</span>
                    {([
                      ["proxyForNai", "NovelAI API（验证 / 生图 / 超分等）"],
                      ["proxyForAi", "AI 反推 / 转换（OpenAI 兼容）"],
                      ["proxyForMcp", "MCP / Tag 服务"],
                      ["proxyForTranslate", "翻译（谷歌 / 百度）"],
                      ["proxyForUpdate", "GitHub 更新检查"],
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
                  <span>输出目录</span>
                  <input value={settings.outputDir} onChange={(e) => void update("outputDir", e.target.value)} />
                </label>
                <div className="row-actions">
                  <Button onClick={selectDir}>
                    <IconText icon={<Icon name="folder" />}>浏览...</IconText>
                  </Button>
                  <Button onClick={() => window.naiDesktop.openInExplorer(settings.outputDir)}>
                    <IconText icon="↗">打开输出目录</IconText>
                  </Button>
                </div>
                <label className="field">
                  <span>图片命名模板</span>
                  <input
                    value={settings.imageNameTemplate}
                    placeholder="{date}_{seq}_{model}"
                    onChange={(e) => void update("imageNameTemplate", e.target.value)}
                  />
                  <small className="settings-hint">
                    可用占位符：{"{date} {time} {seq} {seed} {model} {type} {ts}"}。同样应用于分组 ZIP 导出。
                  </small>
                </label>
                <label className="field">
                  <NumberInput label="历史记录保留天数" value={settings.historyRetentionDays} min={1} max={3650} onChange={(v) => void update("historyRetentionDays", v)} />
                  <small className="settings-hint">
                    启动时自动清理超过该天数的应用内历史记录；仅清理列表，不会删除已保存到本地的图片文件。
                  </small>
                </label>
              </div>
            )}
            {section === "performance" && (
              <div className="settings-form">
                <div className="info-card">
                  <strong>执行策略</strong>
                  <span>当前版本使用单任务顺序执行：批量生成会逐张调用 API，避免并发导致取消和历史写入异常。</span>
                </div>
                <div className="toggle-list">
                  <Toggle checked={settings.debugLogs} onChange={(v) => void update("debugLogs", v)} label="调试日志" description="记录 API 请求诊断信息，默认关闭。" />
                  <Toggle checked={settings.superDrop} onChange={(v) => void update("superDrop", v)} label="中央画布拖拽加载" description="将图片拖入中央画布即可加载为工作台图片。" />
                </div>
              </div>
            )}
            {section === "appearance" && (
              <div className="settings-form">
                <label className="field">
                  <span>主题</span>
                  <select value={settings.theme} onChange={(e) => void update("theme", e.target.value as AppSettings["theme"])}>
                    <option value="light">浅色</option>
                    <option value="dark">深色</option>
                    <option value="system">跟随系统</option>
                  </select>
                </label>
                <label className="field">
                  <span>语言</span>
                  <select value={settings.language} onChange={(e) => void update("language", e.target.value as AppSettings["language"])}>
                    <option value="zh-CN">简体中文</option>
                    <option value="en-US">English（英文，即将完善）</option>
                    <option value="ja-JP">日本語（日文，即将完善）</option>
                  </select>
                </label>
                <div className="toggle-list">
                </div>
              </div>
            )}
            {section === "ai-reverse" && (
              <div className="settings-form">
                <p className="settings-hint">配置视觉 AI 模型接口，用于反推面板的「反推提示词」功能。支持 OpenAI 及兼容接口（Gemini、本地 Ollama 等）。</p>
                <label className="field">
                  <span>API 地址</span>
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
                  <span>模型名称</span>
                  <input
                    value={settings.visionApiModel}
                    placeholder="gpt-4o"
                    onChange={(e) => void update("visionApiModel", e.target.value)}
                  />
                </label>
                <Button onClick={() => void detectModels("reverse")} disabled={modelCheckKind === "reverse"}>
                  <IconText icon="◎">{modelCheckKind === "reverse" ? "检测中..." : "检测反推接口模型"}</IconText>
                </Button>
                {detectedKind === "reverse" && detectedModels.length > 0 && (
                  <label className="field">
                    <span>选择模型（检测到 {detectedModels.length} 个）</span>
                    <select
                      value={detectedModels.includes(settings.visionApiModel) ? settings.visionApiModel : ""}
                      onChange={(e) => e.target.value && void update("visionApiModel", e.target.value)}
                    >
                      <option value="">— 从检测结果选择 —</option>
                      {detectedModels.map((m) => (
                        <option value={m} key={m}>{m}</option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="info-card">
                  <strong>反推模板</strong>
                  <span>已集中到「提示词模板」版块，避免同一模板在多个页面重复维护。</span>
                </div>
              </div>
            )}
            {section === "convert-api" && (
              <div className="settings-form">
                <p className="settings-hint">转换 API 只处理文本：把中文或自然语言描述转换为 NovelAI 可用的 Danbooru 英文 tag。它与“AI 反推”的视觉模型 API 分离，可使用更便宜的文本模型。</p>
                <label className="field">
                  <span>API 地址</span>
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
                  <span>模型名称</span>
                  <input
                    value={settings.convertApiModel}
                    placeholder="gpt-4o-mini"
                    onChange={(e) => void update("convertApiModel", e.target.value)}
                  />
                </label>
                <Button onClick={() => void detectModels("convert")} disabled={modelCheckKind === "convert"}>
                  <IconText icon="◎">{modelCheckKind === "convert" ? "检测中..." : "检测转换接口模型"}</IconText>
                </Button>
                {detectedKind === "convert" && detectedModels.length > 0 && (
                  <label className="field">
                    <span>选择模型（检测到 {detectedModels.length} 个）</span>
                    <select
                      value={detectedModels.includes(settings.convertApiModel) ? settings.convertApiModel : ""}
                      onChange={(e) => e.target.value && void update("convertApiModel", e.target.value)}
                    >
                      <option value="">— 从检测结果选择 —</option>
                      {detectedModels.map((m) => (
                        <option value={m} key={m}>{m}</option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="info-card">
                  <strong>转换模板</strong>
                  <span>已集中到「提示词模板」版块，避免同一模板在多个页面重复维护。</span>
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
                  <strong>统一提示词模板</strong>
                  <span>AI 反推和提示词转换各自读取三套模式模板；漫画 AI 拆分分镜读取下方单模板，漫画生成器不再维护隐藏模板。</span>
                </div>
                <ModeTemplateEditor
                  title="AI 反推模板"
                  value={settings.reversePromptTemplates}
                  defaults={reverseTemplateDefaults}
                  onChange={(next) => void update("reversePromptTemplates", next)}
                />
                <ModeTemplateEditor
                  title="提示词转换模板"
                  value={settings.convertPromptTemplates}
                  defaults={CONVERT_SYSTEM_PROMPTS}
                  onChange={(next) => void update("convertPromptTemplates", next)}
                />
                <SingleTemplateEditor
                  title="AI 拆分分镜模板"
                  description="单模板，全模式共用"
                  value={settings.comicAnalyzePromptTemplate}
                  defaultValue={COMIC_ANALYZE_SYSTEM_PROMPT}
                  onChange={(next) => void update("comicAnalyzePromptTemplate", next)}
                />
              </div>
            )}
            {section === "prompt" && (
              <div className="settings-form">
                <div className="toggle-list">
                  <Toggle checked={settings.autoComplete} onChange={(v) => void update("autoComplete", v)} label="标签自动补全" description="输入英文单词时推测可能需要的 NovelAI / Danbooru tag。" />
                  <Toggle checked={settings.tagServerEnabled} onChange={(v) => void update("tagServerEnabled", v)} label="启用 Tag/MCP 服务" description="用于中文灵感、Tag 补全、反推和转换提示词的 Danbooru 标签增强。" />
                </div>
                <div className="tag-server-card">
                  <label className="field">
                    <span>服务类型 / MCP 传输</span>
                    <select value={settings.tagServerType} onChange={(e) => void update("tagServerType", e.target.value as AppSettings["tagServerType"])}>
                      <option value="rest">普通 HTTP 接口（REST /search /tags）</option>
                      <option value="http">MCP · Streamable HTTP（推荐，如 DanbooruSearchOnline）</option>
                      <option value="sse">MCP · SSE（旧版 HTTP+SSE）</option>
                      <option value="stdio">MCP · stdio（本地启动子进程）</option>
                    </select>
                  </label>
                  {settings.tagServerType === "stdio" ? (
                    <>
                      <label className="field">
                        <span>启动命令</span>
                        <input
                          value={settings.tagServerCommand}
                          placeholder="例如：npx 或 mcp-remote 的绝对路径"
                          onChange={(e) => void update("tagServerCommand", e.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>命令参数（空格分隔）</span>
                        <input
                          value={settings.tagServerArgs}
                          placeholder="例如：-y mcp-remote https://sakizuki-danboorusearch.hf.space/mcp/mcp"
                          onChange={(e) => void update("tagServerArgs", e.target.value)}
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="field">
                        <span>{settings.tagServerType === "rest" ? "服务地址" : "MCP 服务地址"}</span>
                        <input
                          value={settings.tagServerUrl}
                          placeholder={settings.tagServerType === "rest" ? "例如：http://127.0.0.1:8765" : "例如：https://sakizuki-danboorusearch.hf.space/mcp/mcp"}
                          onChange={(e) => void update("tagServerUrl", e.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>服务 Key（可选）</span>
                        <input
                          type="password"
                          value={settings.tagServerApiKey}
                          placeholder="Bearer Token，可留空"
                          onChange={(e) => void update("tagServerApiKey", e.target.value)}
                        />
                      </label>
                    </>
                  )}
                  {settings.tagServerType !== "rest" && (
                    <label className="field">
                      <span>MCP 工具名</span>
                      <input
                        value={settings.tagServerTool}
                        placeholder="search_tags"
                        onChange={(e) => void update("tagServerTool", e.target.value)}
                      />
                    </label>
                  )}
                  <div className="history-group-create">
                    <input value={tagTestQuery} onChange={(e) => setTagTestQuery(e.target.value)} placeholder="测试搜索，例如：蓝眼白发少女" />
                    <button type="button" onClick={() => void detectTagServer()} disabled={tagTesting}>
                      {tagTesting ? "检测中" : "检测"}
                    </button>
                  </div>
                  {tagTestMessage && (
                    <div className={clsx("status-box", tagTestTags.length > 0 ? "ok" : "bad")}>
                      <strong>{tagTestMessage}</strong>
                      {tagTestTags.length > 0 && <small>{tagTestTags.map((tag) => tag.tag).join(", ")}</small>}
                    </div>
                  )}
                  <div className="toggle-list" style={{ marginTop: 4 }}>
                    <Toggle checked={settings.mcpForCapsule} onChange={(v) => void update("mcpForCapsule", v)} label="用于灵感胶囊" description="配置并启用服务后默认开启：在灵感胶囊中按中文搜索返回 MCP 标签。" />
                    <Toggle checked={settings.mcpForReverse} onChange={(v) => void update("mcpForReverse", v)} label="用于 AI 反推" description="反推图片后，用 MCP 标签补强结果（默认关闭）。" />
                    <Toggle checked={settings.mcpForConvert} onChange={(v) => void update("mcpForConvert", v)} label="用于提示词转换" description="转换中文描述时，用 MCP 标签补强结果（默认关闭）。" />
                  </div>
                </div>
                <div className="tag-server-card">
                  <p className="settings-hint" style={{ margin: 0 }}>提示词「中→英翻译」按钮使用的翻译引擎。</p>
                  <label className="field">
                    <span>翻译引擎</span>
                    <select value={settings.translateProvider} onChange={(e) => void update("translateProvider", e.target.value as AppSettings["translateProvider"])}>
                      <option value="google">谷歌翻译（免费，可能需要代理）</option>
                      <option value="baidu">百度翻译（需 APP ID 与密钥）</option>
                    </select>
                  </label>
                  {settings.translateProvider === "baidu" && (
                    <>
                      <label className="field">
                        <span>百度翻译 APP ID</span>
                        <input
                          value={settings.baiduAppId}
                          placeholder="在 fanyi-api.baidu.com 申请"
                          onChange={(e) => void update("baiduAppId", e.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>百度翻译密钥</span>
                        <input
                          type="password"
                          value={settings.baiduSecret}
                          placeholder="开发者密钥"
                          onChange={(e) => void update("baiduSecret", e.target.value)}
                        />
                      </label>
                    </>
                  )}
                </div>
                <p className="settings-hint">提示词模板可以为提示词快速添加前缀/后缀/负面词。在生成面板的提示词区或检视面板可一键应用。</p>
                {(settings.promptTemplates ?? []).length === 0 && (
                  <p style={{ fontSize: 12, color: "var(--text-muted)" }}>还没有模板，使用下方表单添加。</p>
                )}
                {(settings.promptTemplates ?? []).map((tpl) => (
                  <div className="tpl-item" key={tpl.id}>
                    <div className="tpl-item-head">
                      <strong>{tpl.name}</strong>
                      <Button variant="ghost" onClick={() => deleteTemplate(tpl.id)}>
                        <IconText icon="✕">删除</IconText>
                      </Button>
                    </div>
                    {tpl.prefix && <small>前缀：{tpl.prefix}</small>}
                    {tpl.suffix && <small>后缀：{tpl.suffix}</small>}
                    {tpl.negativePrompt && <small>负面：{tpl.negativePrompt}</small>}
                  </div>
                ))}
                <div className="tpl-new">
                  <strong style={{ fontSize: 12 }}>新建模板</strong>
                  <label className="field">
                    <span>模板名称 *</span>
                    <input value={newTplName} placeholder="例如：写实质量词" onChange={(e) => setNewTplName(e.target.value)} />
                  </label>
                  <label className="field">
                    <span>前缀（Prefix）</span>
                    <input value={newTplPrefix} placeholder="masterpiece, best quality, " onChange={(e) => setNewTplPrefix(e.target.value)} />
                  </label>
                  <label className="field">
                    <span>后缀（Suffix）</span>
                    <input value={newTplSuffix} placeholder="4k, ultra detail" onChange={(e) => setNewTplSuffix(e.target.value)} />
                  </label>
                  <label className="field">
                    <span>负面提示词（可选）</span>
                    <input value={newTplNeg} placeholder="lowres, bad anatomy, ..." onChange={(e) => setNewTplNeg(e.target.value)} />
                  </label>
                  <Button variant="primary" onClick={saveNewTemplate} disabled={!newTplName.trim()}>
                    <IconText icon="+">添加模板</IconText>
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>
        <footer>
          <Button variant="primary" onClick={onClose}>
            <IconText icon="✓">关闭</IconText>
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
  const refreshAccount = useAppStore((state) => state.refreshAccount);
  const cards = [
    ["网络", "先确认代理连接", "NovelAI、AI 反推、谷歌翻译及更新检查等大部分联网功能通常需要可用代理。默认使用本机 HTTP 代理 127.0.0.1:7890。"],
    ["欢迎", "设置用户语言", "已根据系统语言检测为简体中文。"],
    ["API", "配置 NovelAI API Token", "Token 只保存在本机主进程存储中，渲染层不会直接持有。"],
    ["保存", "选择图片保存位置", "生成图片会自动保存到此目录并写入右侧历史。"],
    ["界面", "了解主界面", "左侧参数、中间画布、右侧历史；英文输入会自动推测 tag。"],
    ["完成", "一切就绪", "之后可随时在设置中修改 API、输出目录和偏好。"],
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
          <button onClick={finish}>跳过向导</button>
        </div>
        <div className="onboarding-body">
          <aside className="onboarding-card">
            <div className="card-head">
              <strong>{APP_NAME}</strong>
              <span>第 {step + 1}/{cards.length} 步</span>
            </div>
            <div className="chibi">N</div>
            <div className="card-foot">ⓘ {cards[step][0]}</div>
          </aside>
          <section className="onboarding-content">
            <h2>{cards[step][1]}</h2>
            <p>{cards[step][2]}</p>
            {step === 0 && (
              <div className="onboarding-proxy">
                <div className="onboarding-network-warning">
                  请先启动本机代理软件，并确认端口与下方选择一致；如果你的网络可以直接访问 NovelAI，可选择“直连”。
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
            {step === 1 && (
              <label className="field wide">
                <span>语言</span>
                <select defaultValue="zh-CN" onChange={(e) => window.naiDesktop.setSetting("language", e.target.value as AppSettings["language"])}>
                  <option value="zh-CN">简体中文</option>
                  <option value="en-US">English（英文）</option>
                  <option value="ja-JP">日本語（日文）</option>
                </select>
              </label>
            )}
            {step === 2 && (
              <div className="settings-form">
                <label className="field wide">
                  <span>Persistent API Token（持久 API 令牌）</span>
                  <input type="password" value={token} placeholder="粘贴 NovelAI API Token" onChange={(e) => setToken(e.target.value)} />
                </label>
                <div className="row-actions">
                  <Button variant="primary" onClick={verify} disabled={checking}>
                    {checking ? <IconText icon="…">验证中...</IconText> : <IconText icon="✓">验证并保存</IconText>}
                  </Button>
                  <Button onClick={() => setShowTokenGuide(true)}>
                    <IconText icon="❔">如何获取 Token</IconText>
                  </Button>
                </div>
                {tokenStatus && <div className={clsx("status-box", tokenStatus.valid ? "ok" : "bad")}>{tokenStatus.message}</div>}
              </div>
            )}
            {step === 3 && (
              <div className="settings-form">
                <label className="field wide">
                  <span>当前输出目录</span>
                  <input readOnly value={settings?.outputDir ?? ""} />
                </label>
                <Button
                  onClick={async () => {
                    await window.naiDesktop.selectOutputDir();
                    await load();
                  }}
                >
                  <IconText icon={<Icon name="folder" />}>浏览...</IconText>
                </Button>
              </div>
            )}
            {step === 4 && (
              <div className="intro-grid">
                <div><strong>左侧</strong><span>提示词、模型、图片输入、功能参数</span></div>
                <div><strong>中间</strong><span>生成预览、重绘画布、定位文件</span></div>
                <div><strong>右侧</strong><span>按日期查看历史、删除记录</span></div>
                <div><strong>补全</strong><span>输入 g / glo 等英文片段，Tab 或 Enter 插入 tag</span></div>
              </div>
            )}
            {step === 5 && <div className="done-mark">✓</div>}
          </section>
        </div>
        <div className="onboarding-footer">
          <Button disabled={step === 0} onClick={() => setStep((v) => Math.max(0, v - 1))}>上一步</Button>
          {step < cards.length - 1
            ? <Button variant="primary" onClick={() => setStep((v) => Math.min(cards.length - 1, v + 1))}>下一步</Button>
            : <Button variant="primary" onClick={finish}>开始使用</Button>}
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
  // Always render an element so .app-shell keeps a stable 6-row grid; the empty
  // slot collapses to 0 height when there's no update.
  if (!updateInfo?.hasUpdate) return <div className="update-banner-slot" />;
  return (
    <div className="update-banner">
      <span>
        <Icon name="upgrade" /> 发现新版本 <strong>v{updateInfo.latestVersion}</strong>（当前 v{updateInfo.currentVersion}）
      </span>
      <div className="update-banner-actions">
        <button
          className="btn btn-primary"
          onClick={() => updateInfo.releaseUrl && void window.naiDesktop.openExternal(updateInfo.releaseUrl)}
        >
          前往下载
        </button>
        <button className="btn btn-ghost" onClick={dismissUpdate}>
          稍后
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
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
      <div className={clsx("workspace", (activeTab === "tools" || activeTab === "records") && "workspace-tools")}>
        {activeTab === "tools" ? (
        <ToolsHub />
        ) : activeTab === "records" ? (
          <AiLogPanel />
        ) : (
          <>
            <LeftPanel openSettings={() => setShowSettings(true)} />
            {activeTab === "inpaint" ? <InpaintCanvas /> : <ImageCanvas />}
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
  const [splash, setSplash] = useState(true);
  const bootDone = useAppStore((state) => state.bootDone);
  const load = useAppStore((state) => state.load);
  const checkUpdate = useAppStore((state) => state.checkUpdate);

  useEffect(() => {
    void load();
    void checkUpdate();
    const timer = window.setTimeout(() => setSplash(false), 2500);
    return () => window.clearTimeout(timer);
  }, [load, checkUpdate]);

  const shouldShowSplash = useMemo(() => splash || !bootDone, [splash, bootDone]);
  return shouldShowSplash ? <SplashPage /> : <MainPage />;
}
