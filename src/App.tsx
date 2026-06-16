import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { format } from "date-fns";
import { InpaintCanvas } from "./InpaintCanvas";
import { useAppStore } from "./store";
import { estimateAnlas } from "./anlas";
import { relatedTags } from "./related-tags";
import {
  APP_NAME,
  APP_VERSION,
  DEFAULT_PARAMS,
  DIRECTOR_TOOLS,
  EMOTION_OPTIONS,
  NAI_INPAINT_MODELS,
  NAI_MODELS,
  NAI_SAMPLERS,
  NAI_UC_PRESETS,
  type AppSettings,
  type HistoryGroup,
  type GenerateParams,
  type ImportedParams,
  type ModePromptTemplates,
  type NAIModel,
  type NAISampler,
  type PromptTemplate,
  type ReversePromptMode,
  type TagSuggestion,
  type TokenStatus,
} from "./types";

const docsUrl = "https://docs.novelai.net/en/image/";
const tokenHelpUrl = "https://docs.novelai.net/en/api/";
const appIconUrl = "./icon.png";

// ── Tag autocomplete helpers ──────────────────────────────────────────────────
function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

/** CSS color per Danbooru tag category */
const CAT_COLOR: Record<number, string> = {
  0: "#4ade80", // general
  1: "#fb923c", // artist
  3: "#a78bfa", // copyright
  4: "#60a5fa", // character
  5: "#94a3b8", // meta
};

const CAT_LABEL: Record<number, string> = {
  0: "通用",
  1: "画师",
  3: "作品",
  4: "角色",
  5: "元信息",
};

const TAG_ZH: Record<string, string> = {
  "1girl": "一个女孩 / 单女性角色",
  "1boy": "一个男孩 / 单男性角色",
  solo: "单人画面",
  "long hair": "长发",
  "short hair": "短发",
  "blonde hair": "金发",
  "black hair": "黑发",
  "white hair": "白发",
  "blue hair": "蓝发",
  "red hair": "红发",
  "pink hair": "粉发",
  "green hair": "绿发",
  "blue eyes": "蓝眼睛",
  "green eyes": "绿眼睛",
  "red eyes": "红眼睛",
  "yellow eyes": "黄眼睛 / 金色眼睛",
  gloves: "手套",
  "black gloves": "黑色手套",
  "white gloves": "白色手套",
  dress: "连衣裙",
  "white dress": "白色连衣裙",
  "school uniform": "校服",
  skirt: "裙子",
  smile: "微笑",
  "looking at viewer": "看向观众 / 正视镜头",
  "open mouth": "张嘴",
  "hair ornament": "发饰",
  earrings: "耳环",
  "male focus": "男性为主体",
  "grey eyes": "灰色眼睛",
  "simple background": "简单背景",
  outdoors: "户外",
  night: "夜晚",
  city: "城市",
  masterpiece: "杰作 / 高质量修饰词",
  "best quality": "最佳质量修饰词",
  "very aesthetic": "高审美质量修饰词",
  "artist name": "画师名占位标签",
};

const TAB_ITEMS = [
  { value: "generate", label: "生成", icon: "✦", title: "文生图 / 图生图", desc: "提示词、参考图、批量生成" },
  { value: "inpaint", label: "重绘", icon: "◌", title: "局部重绘", desc: "涂抹蒙版后重绘指定区域" },
  { value: "upscale", label: "超分", icon: "↗", title: "云端放大", desc: "2× / 4× 云端超分" },
  { value: "postprocess", label: "后期", icon: "◈", title: "导演工具", desc: "移除背景、线稿、上色、表情" },
  { value: "inspect", label: "反推", icon: "◎", title: "AI 反推提示词", desc: "图片分析与提示词反推" },
  { value: "convert", label: "转换", icon: "⇄", title: "中文描述转标签", desc: "自然语言转 Danbooru 标签" },
] as const;

type PromptChip = {
  tag: string;
  zh: string;
  aliases: string[];
};

const PROMPT_CHIP_POOL: PromptChip[] = [
  { tag: "masterpiece", zh: "杰作/高质量", aliases: ["高质量", "杰作", "质量", "精致"] },
  { tag: "best quality", zh: "最佳质量", aliases: ["高质量", "清晰", "精美"] },
  { tag: "very aesthetic", zh: "高审美", aliases: ["美", "高级", "审美"] },
  { tag: "1girl", zh: "单个女孩", aliases: ["女孩", "少女", "女角色", "女性"] },
  { tag: "solo", zh: "单人构图", aliases: ["单人", "一个人", "独自"] },
  { tag: "looking at viewer", zh: "看向观众", aliases: ["看镜头", "正视", "凝视"] },
  { tag: "detailed eyes", zh: "精细眼睛", aliases: ["眼睛", "眼神", "精细"] },
  { tag: "cinematic lighting", zh: "电影感光照", aliases: ["电影", "光影", "氛围光"] },
  { tag: "dynamic pose", zh: "动态姿势", aliases: ["动作", "姿势", "动感"] },
  { tag: "simple background", zh: "简单背景", aliases: ["纯色", "简洁", "背景简单"] },
  { tag: "watercolor", zh: "水彩风格", aliases: ["水彩", "透明", "柔和"] },
  { tag: "soft shading", zh: "柔和阴影", aliases: ["柔和", "软阴影", "温柔"] },
  { tag: "upper body", zh: "上半身", aliases: ["半身", "胸像", "上身"] },
  { tag: "portrait", zh: "肖像", aliases: ["头像", "肖像", "特写"] },
  { tag: "full body", zh: "全身", aliases: ["全身", "站姿", "整体"] },
  { tag: "floating hair", zh: "飘发", aliases: ["头发飘动", "风吹头发", "飘逸"] },
  { tag: "blue eyes", zh: "蓝眼睛", aliases: ["蓝眼", "蓝色眼睛"] },
  { tag: "white hair", zh: "白发", aliases: ["白头发", "银发"] },
  { tag: "black dress", zh: "黑裙", aliases: ["黑色裙子", "礼服", "裙子"] },
  { tag: "smile", zh: "微笑", aliases: ["笑", "笑容", "开心"] },
  { tag: "open mouth", zh: "张嘴", aliases: ["开口", "说话", "嘴"] },
  { tag: "dramatic lighting", zh: "戏剧光", aliases: ["强光", "强对比", "舞台光"] },
  { tag: "golden hour", zh: "黄金时刻", aliases: ["夕阳", "黄昏", "暖光"] },
  { tag: "backlighting", zh: "逆光", aliases: ["背光", "轮廓光", "逆光"] },
  { tag: "rain", zh: "雨景", aliases: ["雨", "下雨", "雨天"] },
  { tag: "night sky", zh: "夜空", aliases: ["夜晚", "星空", "夜景"] },
  { tag: "city lights", zh: "城市灯光", aliases: ["城市", "霓虹", "街景"] },
  { tag: "flower field", zh: "花田", aliases: ["花", "花海", "草地"] },
  { tag: "transparent background", zh: "透明背景", aliases: ["透明", "抠图", "无背景"] },
  { tag: "high contrast", zh: "高对比", aliases: ["对比", "强烈", "黑白"] },
  { tag: "pastel colors", zh: "粉彩色", aliases: ["粉色", "柔和颜色", "浅色"] },
  { tag: "ink wash", zh: "水墨", aliases: ["水墨", "国风", "墨色"] },
  { tag: "oil painting", zh: "油画", aliases: ["油画", "厚涂", "绘画"] },
  { tag: "comic style", zh: "漫画风", aliases: ["漫画", "分镜", "美漫"] },
  { tag: "depth of field", zh: "景深", aliases: ["虚化", "背景虚化", "镜头"] },
  { tag: "from below", zh: "低角度", aliases: ["仰视", "低机位"] },
  { tag: "from above", zh: "高角度", aliases: ["俯视", "高机位"] },
  { tag: "motion blur", zh: "运动模糊", aliases: ["速度", "动感模糊"] },
  { tag: "wind", zh: "风", aliases: ["风吹", "飘动", "风"] },
  { tag: "water droplets", zh: "水滴", aliases: ["水珠", "雨滴", "湿"] },
  { tag: "ornate costume", zh: "华丽服装", aliases: ["华丽", "服装", "礼服"] },
  { tag: "hair ornament", zh: "发饰", aliases: ["头饰", "发夹", "发饰"] },
  { tag: "gloves", zh: "手套", aliases: ["手套", "戴手套"] },
  { tag: "cape", zh: "披风", aliases: ["披风", "斗篷"] },
  { tag: "throne", zh: "王座", aliases: ["王座", "皇宫", "坐着"] },
  { tag: "library", zh: "图书馆", aliases: ["书房", "图书馆", "书"] },
  { tag: "studio lighting", zh: "棚拍灯光", aliases: ["棚拍", "摄影棚", "打光"] },
];

function pickPromptChips(count = 12, query = ""): PromptChip[] {
  const normalized = query.trim().toLowerCase().replace(/_/g, " ");
  const pool = normalized
    ? PROMPT_CHIP_POOL.filter((chip) => {
        const haystack = [chip.tag, chip.zh, ...chip.aliases].join(" ").toLowerCase();
        return haystack.includes(normalized) || chip.aliases.some((alias) => normalized.includes(alias.toLowerCase()));
      })
    : PROMPT_CHIP_POOL;
  return [...(pool.length ? pool : PROMPT_CHIP_POOL)]
    .map((chip) => ({ chip, score: normalized ? 0 : Math.random() }))
    .sort((a, b) => a.score - b.score)
    .slice(0, count)
    .map((item) => item.chip);
}

function tagDescription(s: TagSuggestion): string {
  return s.description ?? TAG_ZH[s.tag.toLowerCase().replace(/_/g, " ")] ?? `${CAT_LABEL[s.category] ?? "标签"}分类`;
}

/** Word-at-cursor: scan backwards from cursor for [\w-] chars */
function wordAtCursor(text: string, cursor: number): { word: string; start: number } {
  // Include CJK so Chinese input (e.g. "蓝眼") triggers the 灵感胶囊 autocomplete.
  const wordChar = /[\w㐀-鿿-]/;
  let s = cursor;
  while (s > 0 && wordChar.test(text[s - 1])) s--;
  return { word: text.slice(s, cursor), start: s };
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
  const taRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearSuggestions() { setSuggestions([]); }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    const cursor = e.target.selectionStart ?? text.length;
    onChange(text);
    setActiveIdx(0);
    if (!enabled) {
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

// ── PNG metadata parser ───────────────────────────────────────────────────────
function parsePngMeta(buffer: ArrayBuffer): Record<string, string> {
  const sig = new Uint8Array(buffer, 0, 8);
  if (
    sig[0] !== 0x89 ||
    sig[1] !== 0x50 ||
    sig[2] !== 0x4e ||
    sig[3] !== 0x47 ||
    sig[4] !== 0x0d ||
    sig[5] !== 0x0a ||
    sig[6] !== 0x1a ||
    sig[7] !== 0x0a
  ) {
    return {};
  }
  const view = new DataView(buffer);
  const result: Record<string, string> = {};
  let offset = 8;
  while (offset + 12 <= buffer.byteLength) {
    const length = view.getUint32(offset, false);
    const type = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7),
    );
    if (type === "IEND") break;
    if (type === "tEXt" && length > 0 && offset + 8 + length <= buffer.byteLength) {
      const data = new Uint8Array(buffer, offset + 8, length);
      const nullIdx = data.indexOf(0);
      if (nullIdx >= 0) {
        const key = new TextDecoder("latin1").decode(data.subarray(0, nullIdx));
        const value = new TextDecoder("utf-8").decode(data.subarray(nullIdx + 1));
        result[key] = value;
      }
    }
    offset += 12 + length;
  }
  return result;
}

/**
 * Map NovelAI PNG metadata (tEXt chunks: Description + Comment JSON) to our
 * GenerateParams shape. Only fields present and valid are returned, so applying
 * the result never clobbers a setting the image didn't specify.
 */
function parseImportedParams(meta: Record<string, string>): ImportedParams {
  const out: ImportedParams = {};
  let comment: Record<string, unknown> = {};
  try {
    comment = JSON.parse(meta.Comment ?? "{}");
  } catch {
    comment = {};
  }

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const samplerValues = NAI_SAMPLERS.map((s) => s.value) as string[];
  const modelValues = NAI_MODELS.map((m) => m.value) as string[];

  const prompt = meta.Description ?? (typeof comment.prompt === "string" ? comment.prompt : undefined);
  if (prompt) out.positivePrompt = prompt.trim();
  if (typeof comment.uc === "string") out.negativePrompt = comment.uc.trim();

  out.steps = num(comment.steps);
  out.cfgScale = num(comment.scale);
  out.cfgRescale = num(comment.cfg_rescale);
  out.seed = num(comment.seed);
  out.width = num(comment.width);
  out.height = num(comment.height);
  if (typeof comment.sampler === "string" && samplerValues.includes(comment.sampler)) {
    out.sampler = comment.sampler as NAISampler;
  }
  if (typeof comment.noise_schedule === "string") out.noiseSchedule = comment.noise_schedule;
  if (typeof comment.sm === "boolean") out.smea = comment.sm;
  if (typeof comment.sm_dyn === "boolean") out.smeaDyn = comment.sm_dyn;

  const modelCandidate = typeof comment.model === "string" ? comment.model : meta.Source;
  if (modelCandidate && modelValues.includes(modelCandidate)) {
    out.model = modelCandidate as NAIModel;
  }

  // Drop undefined keys so the caller's spread doesn't overwrite with undefined.
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as ImportedParams;
}

// ── Shared UI primitives ──────────────────────────────────────────────────────
function Button({
  children,
  variant = "secondary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button className={clsx("btn", `btn-${variant}`, className)} {...props}>
      {children}
    </button>
  );
}

function IconText({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <span className="icon-text">
      <span className="btn-icon" aria-hidden="true">{icon}</span>
      <span>{children}</span>
    </span>
  );
}

function AppPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return <>{children}</>;
  return createPortal(children, document.body);
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <label className="toggle-card">
      <span className="toggle-copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <span className={clsx("toggle", checked && "toggle-on")}>
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span />
      </span>
    </label>
  );
}

function NumberInput({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function SliderInput({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="slider-field">
      <span>
        {label}
        <strong>{value}</strong>
      </span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

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
          ? `${account.tierName ?? "已连接"} · Anlas ${account.anlasBalance ?? "未知"}`
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
        <IconText icon="📁">输出目录</IconText>
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
          <NumberInput label="CFG Scale（提示词引导）" value={params.cfgScale} min={1} max={12} step={0.1} onChange={(v) => setParam("cfgScale", v)} />
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
          <Toggle checked={params.smea} onChange={(v) => setParam("smea", v)} label="SMEA（高级采样）" description="旧模型可用；V4/V4.5 会按 API 兼容策略处理。" />
          <Toggle checked={params.smeaDyn} onChange={(v) => setParam("smeaDyn", v)} label="SMEA Dyn（动态 SMEA）" description="仅在 SMEA 开启时生效。" />
        </div>
        <footer>
          <Button
            onClick={() => {
              for (const [key, value] of Object.entries(DEFAULT_PARAMS) as [keyof GenerateParams, any][]) {
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
function VibeTransferModal({ onClose }: { onClose: () => void }) {
  const vibeImages = useAppStore((state) => state.vibeImages);
  const addVibeImage = useAppStore((state) => state.addVibeImage);
  const removeVibeImage = useAppStore((state) => state.removeVibeImage);
  const updateVibeImage = useAppStore((state) => state.updateVibeImage);
  const clearVibeImages = useAppStore((state) => state.clearVibeImages);

  function handleFile(file: File, infoExtracted: number, strength: number) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const base64 = dataUrl.split(",")[1] ?? "";
      addVibeImage({ id: crypto.randomUUID(), previewUrl: dataUrl, base64, infoExtracted, strength });
    };
    reader.readAsDataURL(file);
  }

  return (
    <AppPortal>
      <div className="modal-backdrop">
      <div className="modal vibe-modal">
        <header>
          <h2>参考图管理（氛围迁移 / 精确参考）</h2>
          <button onClick={onClose}>×</button>
        </header>
        <div className="vibe-body">
          {vibeImages.length === 0 && <p className="vibe-empty">还没有参考图，使用下方按钮添加。</p>}
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
          <div className="vibe-add-row">
            <label className="btn btn-secondary vibe-add-btn">
              <IconText icon="+">氛围迁移图（提取 0.7）</IconText>
              <input
                type="file"
                hidden
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) { handleFile(f, 0.7, 0.6); e.target.value = ""; }
                }}
              />
            </label>
            <label className="btn btn-secondary vibe-add-btn">
              <IconText icon="+">精确参考图（提取 1.0）</IconText>
              <input
                type="file"
                hidden
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) { handleFile(f, 1.0, 1.0); e.target.value = ""; }
                }}
              />
            </label>
          </div>
        </div>
        <footer>
          <Button onClick={clearVibeImages}>
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
  const charCaptions = useAppStore((state) => state.charCaptions);
  const settings = useAppStore((state) => state.settings);
  const setToast = useAppStore((state) => state.setToast);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showVibeModal, setShowVibeModal] = useState(false);
  const [showCharModal, setShowCharModal] = useState(false);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [chipQuery, setChipQuery] = useState("");
  const [promptChips, setPromptChips] = useState<PromptChip[]>(() => pickPromptChips());
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
    if (tpl.negativePrompt.trim()) setParam("negativePrompt", tpl.negativePrompt.trim());
    setToast(`已应用模板「${tpl.name}」`);
  }

  function appendChip(tag: string) {
    const current = promptValue.trim();
    const next = current ? `${current.replace(/\s*,?\s*$/, "")}, ${tag}, ` : `${tag}, `;
    setParam(promptKey, next);
    setPromptChips(pickPromptChips(12, chipQuery));
  }

  useEffect(() => {
    setPromptChips(pickPromptChips(12, chipQuery));
  }, [chipQuery]);

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
          <select value={params.model} onChange={(e) => setParam("model", e.target.value as GenerateParams["model"])}>
            {NAI_MODELS.map((m) => (
              <option value={m.value} key={m.value}>{m.label}</option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        <span>风格提示词（Style Prompt）</span>
        <input
          value={params.stylePrompt}
          placeholder="输入风格提示词，如 anime style, watercolor..."
          onChange={(e) => setParam("stylePrompt", e.target.value)}
        />
      </label>
      <div className="prompt-chip-zone">
        <div className="prompt-chip-head">
          <span>灵感胶囊</span>
          <button type="button" onClick={() => setPromptChips(pickPromptChips(12, chipQuery))}>换一组</button>
        </div>
        <input
          className="prompt-chip-search"
          value={chipQuery}
          placeholder="输入中文大概意思，例如：蓝眼白发、夜景城市、水彩风格"
          onChange={(e) => setChipQuery(e.target.value)}
        />
        <div className="prompt-chip-list">
          {promptChips.map((chip) => (
            <button key={chip.tag} type="button" onClick={() => appendChip(chip.tag)} title={`${chip.tag}：${chip.zh}`}>
              <span>{chip.tag}</span>
              <small>{chip.zh}</small>
            </button>
          ))}
        </div>
        {related.length > 0 && (
          <div className="related-tags">
            <div className="related-tags-head">🔗 相关推荐（常一起使用）</div>
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
      </div>
      <div className="prompt-tabs">
        <button className={clsx(promptTab === "positive" && "active")} onClick={() => setPromptTab("positive")}>
          正面提示词
        </button>
        <button className={clsx(promptTab === "negative" && "active")} onClick={() => setPromptTab("negative")}>
          负面提示词
        </button>
      </div>
      <PromptTextarea
        value={promptValue}
        onChange={(v) => setParam(promptKey, v)}
        model={params.model}
        enabled={settings?.autoComplete ?? true}
        placeholder={promptTab === "positive" ? "输入正面提示词..." : "输入不希望出现的内容..."}
      />
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
              ≈{tokenEst} tokens{tokenWarn ? " ⚠ 超出225限制" : ""}
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
          <IconText icon="◇">精确参考</IconText>
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
        <NumberInput label="宽度" value={params.width} min={64} max={2048} onChange={(v) => setParam("width", v)} />
        <span>×</span>
        <NumberInput label="高度" value={params.height} min={64} max={2048} onChange={(v) => setParam("height", v)} />
      </div>
      <div className="preset-row">
        <button onClick={() => { setParam("width", 1024); setParam("height", 1024); }}>1024×1024</button>
        <button onClick={() => { setParam("width", 1216); setParam("height", 832); }}>1216×832</button>
        <button onClick={() => { setParam("width", 832); setParam("height", 1216); }}>832×1216</button>
        <button onClick={() => { setParam("width", 1024); setParam("height", 1536); }}>1024×1536</button>
        <button onClick={() => { setParam("width", 1536); setParam("height", 1024); }}>1536×1024</button>
        <button onClick={() => { setParam("width", 1472); setParam("height", 1472); }}>1472×1472</button>
      </div>
      <div className="seed-row">
        <NumberInput label="种子（0 = 随机）" value={params.seed} min={0} onChange={(v) => setParam("seed", v)} />
        <Button title="随机种子" onClick={() => setParam("seed", Math.floor(Math.random() * 2_147_483_647))}>
          ⇄
        </Button>
        <Button title="重置为随机" onClick={() => setParam("seed", 0)}>
          ↺
        </Button>
      </div>
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
    </>
  );
}

// ── Workbench image upload ────────────────────────────────────────────────────
function WorkbenchImageUpload() {
  const workbenchImage = useAppStore((state) => state.workbenchImage);
  const loadWorkbenchImage = useAppStore((state) => state.loadWorkbenchImage);
  const clearWorkbenchImage = useAppStore((state) => state.clearWorkbenchImage);

  return (
    <div className="wb-upload">
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
          <IconText icon="📂">加载图片...</IconText>
        </Button>
      )}
    </div>
  );
}

// ── Account + Run button ──────────────────────────────────────────────────────
type CostFeature = "generate" | "i2i" | "inpaint" | "upscale" | "director";

function FeatureCostCard({
  feature,
  batchCount = 1,
  label,
}: {
  feature: CostFeature;
  batchCount?: number;
  label: string;
}) {
  const params = useAppStore((state) => state.params);
  const account = useAppStore((state) => state.account);
  const upscaleScale = useAppStore((state) => state.upscaleScale);
  const directorTool = useAppStore((state) => state.directorTool);
  const base = estimateAnlas(params, batchCount, account.tierLevel);
  let estimated = base.total;
  let detail = base.free ? "Opus 免费条件命中" : `${base.perImage}/张 × ${Math.max(1, batchCount)}`;

  if (feature === "i2i") {
    detail = `${detail}，图生图按尺寸/步数另有控制成本风险`;
  } else if (feature === "inpaint") {
    detail = `${detail}，局部重绘按重绘模型与尺寸计费`;
  } else if (feature === "upscale") {
    estimated = upscaleScale === 4 ? 8 : 4;
    detail = `${upscaleScale}x 云端超分，实际扣费以 API 返回后的余额为准`;
  } else if (feature === "director") {
    estimated = 4;
    detail = `${directorTool} 后期处理，部分工具可能按图像尺寸调整`;
  }

  const balance = account.anlasBalance;
  const insufficient = typeof balance === "number" && estimated > balance;

  return (
    <div className={clsx("cost-row cost-card", estimated === 0 && "cost-free", insufficient && "cost-warn")}>
      <div>
        <span>{label}</span>
        <small>{detail}</small>
      </div>
      <strong>{estimated === 0 ? "预计免费" : `约 ${estimated} Anlas`}</strong>
      <small className="cost-balance">
        当前余额：{balance ?? "未知"} Anlas{insufficient ? " · 可能不足" : ""}
      </small>
    </div>
  );
}

function AccountAndRunButton({
  label,
  onRun,
  openSettings,
}: {
  label: string;
  onRun: () => void;
  openSettings: () => void;
}) {
  const account = useAppStore((state) => state.account);
  const isGenerating = useAppStore((state) => state.isGenerating);
  const cancel = useAppStore((state) => state.cancel);
  const togglePause = useAppStore((state) => state.togglePause);
  const queuePaused = useAppStore((state) => state.queuePaused);
  const queueProgress = useAppStore((state) => state.queueProgress);
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
          <IconText icon="🔑">请先设置 API</IconText>
        </Button>
      ) : isGenerating ? (
        <>
          {queueProgress && queueProgress.total > 1 && (
            <div className="queue-progress">
              进度 {queueProgress.done + queueProgress.failed}/{queueProgress.total}
              {queueProgress.failed > 0 ? ` · 失败 ${queueProgress.failed}` : ""}
            </div>
          )}
          <div className="run-button-row">
            <Button variant="secondary" onClick={togglePause}>
              <IconText icon={queuePaused ? "▶" : "⏸"}>{queuePaused ? "继续" : "暂停"}</IconText>
            </Button>
            <Button variant="danger" onClick={() => void cancel()}>
              <IconText icon="■">停止</IconText>
            </Button>
          </div>
        </>
      ) : (
        <>
          {lastAnlasSpent != null && lastAnlasSpent > 0 && (
            <div className="anlas-spent">上次实扣 {lastAnlasSpent} Anlas</div>
          )}
          <Button variant="primary" className="full" onClick={onRun}>
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
        <p className="wildcard-hint">
          💡 支持动态提示词通配符 <code>{"{red|blue|green} hair"}</code>，批量时每张随机取一项；NovelAI 的 <code>{"{tag}"}</code> 权重语法不受影响。
        </p>
        <FeatureCostCard feature="generate" batchCount={batchCount} label="文生图预计消耗" />
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
        <FeatureCostCard feature="i2i" label="图生图预计消耗" />
      </div>
      <AccountAndRunButton label="图生图" onRun={() => void generateI2I()} openSettings={openSettings} />
    </>
  );
}

// ── Inpaint panel ─────────────────────────────────────────────────────────────
function InpaintPanel({ openSettings }: { openSettings: () => void }) {
  const inpaintModel = useAppStore((state) => state.inpaintModel);
  const setInpaintModel = useAppStore((state) => state.setInpaintModel);
  const brushSize = useAppStore((state) => state.brushSize);
  const setBrushSize = useAppStore((state) => state.setBrushSize);
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
        <SliderInput label="画笔大小" value={brushSize} min={2} max={128} step={1} onChange={setBrushSize} />
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
        <FeatureCostCard feature="inpaint" label="局部重绘预计消耗" />
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
  return (
    <>
      <div className="panel-scroll">
        <WorkbenchImageUpload />
        <div className="scale-buttons">
          <Button variant={scale === 2 ? "primary" : "secondary"} onClick={() => setScale(2)}>2×</Button>
          <Button variant={scale === 4 ? "primary" : "secondary"} onClick={() => setScale(4)}>4×</Button>
        </div>
        {workbenchImage && (
          <div className="info-card">
            <strong>输出尺寸预估</strong>
            <span>
              {workbenchImage.width}×{workbenchImage.height} → {workbenchImage.width * scale}×{workbenchImage.height * scale}
            </span>
          </div>
        )}
        <FeatureCostCard feature="upscale" label="超分预计消耗" />
      </div>
      <AccountAndRunButton label={`云端超分 ${scale}×`} onRun={() => void upscale()} openSettings={openSettings} />
    </>
  );
}

// ── Director Tools panel ──────────────────────────────────────────────────────
function DirectorPanel({ openSettings }: { openSettings: () => void }) {
  const tool = useAppStore((state) => state.directorTool);
  const setTool = useAppStore((state) => state.setDirectorTool);
  const options = useAppStore((state) => state.augmentOptions);
  const setOption = useAppStore((state) => state.setAugmentOption);
  const run = useAppStore((state) => state.runDirectorTool);
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
        <FeatureCostCard feature="director" label="后期工具预计消耗" />
      </div>
      <AccountAndRunButton label="执行后期处理" onRun={() => void run()} openSettings={openSettings} />
    </>
  );
}

// ── Inspect panel (AI 反推提示词) ─────────────────────────────────────────────
// Per-mode system-prompt template editor (used in both 反推 and 转换 settings).
function ModeTemplateEditor({
  value,
  onChange,
}: {
  value: ModePromptTemplates;
  onChange: (next: ModePromptTemplates) => void;
}) {
  const [mode, setMode] = useState<ReversePromptMode>("tags");
  const labels: [ReversePromptMode, string][] = [
    ["tags", "Danbooru 标签"],
    ["natural", "自然语言"],
    ["mixed", "混合模式"],
  ];
  return (
    <div className="field">
      <span>提示词模板（按输出模式独立）</span>
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
        style={{ minHeight: 120 }}
        value={value?.[mode] ?? ""}
        placeholder="留空则使用内置默认模板"
        onChange={(e) => onChange({ ...value, [mode]: e.target.value })}
      />
      <small className="settings-hint">标签 / 自然语言 / 混合三种输出各用独立系统提示词；留空使用内置默认。</small>
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
  const setReversePromptMode = useAppStore((state) => state.setReversePromptMode);
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
            <IconText icon="📂">打开文件</IconText>
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
  const setConvertMode = useAppStore((state) => state.setConvertMode);
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
            <p>需要在 <strong>设置 › AI 反推</strong> 中配置视觉模型 API。</p>
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

// ── Image canvas (center) ─────────────────────────────────────────────────────
function ImageCanvas() {
  const currentImage = useAppStore((state) => state.currentImage);
  const isGenerating = useAppStore((state) => state.isGenerating);
  const activeTab = useAppStore((state) => state.activeTab);
  const generate = useAppStore((state) => state.generate);
  const settings = useAppStore((state) => state.settings);
  const inspectImageUrl = useAppStore((state) => state.inspectImageUrl);
  const loadWorkbenchFromPath = useAppStore((state) => state.loadWorkbenchFromPath);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const variationFromImage = useAppStore((state) => state.variationFromImage);
  const [dropOver, setDropOver] = useState(false);
  const superDrop = settings?.superDrop ?? false;

  function handleDragOver(e: React.DragEvent) {
    if (!superDrop) return;
    e.preventDefault();
    setDropOver(true);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDropOver(false);
    if (!superDrop) return;
    const file = e.dataTransfer.files[0];
    if (!file) return;
    // Electron exposes file.path on dropped files
    const filePath = (file as any).path as string | undefined;
    if (filePath) {
      void loadWorkbenchFromPath(filePath);
    }
  }

  function sendCurrentTo(tab: "generate" | "inpaint" | "upscale" | "postprocess") {
    if (!currentImage) return;
    void loadWorkbenchFromPath(currentImage.filePath);
    setActiveTab(tab);
  }

  if (activeTab === "inspect") {
    return (
      <main className="canvas-area">
        {inspectImageUrl ? (
          <div className="image-stage">
            <img src={inspectImageUrl} alt="反推图片" />
          </div>
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
            <span>{superDrop ? "支持拖入图片到工作台" : "API-only 生成"}</span>
            <span>历史一键复用</span>
          </span>
        </button>
      )}
      {currentImage && (
        <div className="image-stage">
          <img src={currentImage.fileUrl} alt="生成结果" />
          {settings?.showFloatingToolbar && (
            <div className="floating-toolbar">
              <Button onClick={() => window.naiDesktop.openInExplorer(currentImage.filePath)}>
                <IconText icon="📍">定位</IconText>
              </Button>
              <Button onClick={() => void navigator.clipboard.writeText(currentImage.filePath)}>
                <IconText icon="⧉">复制路径</IconText>
              </Button>
              <Button onClick={() => sendCurrentTo("generate")}>
                <IconText icon="▧">工作台</IconText>
              </Button>
              <Button onClick={() => sendCurrentTo("inpaint")}>
                <IconText icon="◌">重绘</IconText>
              </Button>
              <Button onClick={() => sendCurrentTo("upscale")}>
                <IconText icon="↗">超分</IconText>
              </Button>
              <Button onClick={() => sendCurrentTo("postprocess")}>
                <IconText icon="◈">后期</IconText>
              </Button>
              <Button onClick={() => variationFromImage(currentImage)} title="载入此图参数并锁定种子，改提示词后即为变体">
                <IconText icon="🔒">锁种变体</IconText>
              </Button>
              <Button onClick={generate}>
                <IconText icon="↻">再生成</IconText>
              </Button>
            </div>
          )}
        </div>
      )}
    </main>
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
  const [newGroupName, setNewGroupName] = useState("");

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
    const next = window.prompt("重命名分组", activeGroup.name);
    if (next && next.trim()) void renameHistoryGroup(activeGroup.id, next.trim());
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
            ⬇ 导出ZIP
          </button>
          <button type="button" disabled={!activeGroup} title="重命名当前分组" onClick={renameActiveGroup}>
            ✎ 重命名
          </button>
          <button type="button" disabled={!activeGroup} title="删除当前分组" onClick={deleteActiveGroup}>
            🗑 删除
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
            <button className="history-delete" title="删除记录和本地文件" onClick={() => void deleteHistory(item.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
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
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<TokenStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [newTplName, setNewTplName] = useState("");
  const [newTplPrefix, setNewTplPrefix] = useState("");
  const [newTplSuffix, setNewTplSuffix] = useState("");
  const [newTplNeg, setNewTplNeg] = useState("");
  const [modelCheckKind, setModelCheckKind] = useState<"reverse" | "convert" | "">("");
  const [modelCheckMessage, setModelCheckMessage] = useState("");
  const [detectedModels, setDetectedModels] = useState<string[]>([]);
  const [tagTestQuery, setTagTestQuery] = useState("蓝眼白发少女");
  const [tagTestMessage, setTagTestMessage] = useState("");
  const [tagTestTags, setTagTestTags] = useState<TagSuggestion[]>([]);
  const [tagTesting, setTagTesting] = useState(false);

  if (!settings) return null;

  const update = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    await window.naiDesktop.setSetting(key, value);
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
    const result = await window.naiDesktop.listAiModels(kind);
    setModelCheckKind("");
    setModelCheckMessage(result.message);
    setDetectedModels(result.models.slice(0, 30));
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
                  <Button onClick={() => window.naiDesktop.openExternal(tokenHelpUrl)}>
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
                    <IconText icon="📁">浏览...</IconText>
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
                <NumberInput label="历史记录保留天数" value={settings.historyRetentionDays} min={1} max={3650} onChange={(v) => void update("historyRetentionDays", v)} />
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
                  <Toggle checked={settings.showFloatingToolbar} onChange={(v) => void update("showFloatingToolbar", v)} label="生成后工具悬浮条" description="在画布底部显示定位、复制和发送到功能面板按钮。" />
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
                <ModeTemplateEditor
                  value={settings.reversePromptTemplates}
                  onChange={(next) => void update("reversePromptTemplates", next)}
                />
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
                <ModeTemplateEditor
                  value={settings.convertPromptTemplates}
                  onChange={(next) => void update("convertPromptTemplates", next)}
                />
              </div>
            )}
            {modelCheckMessage && (section === "ai-reverse" || section === "convert-api") && (
              <div className="status-box ok model-check-result">
                <strong>{modelCheckMessage}</strong>
                {detectedModels.length > 0 && <small>{detectedModels.join(", ")}</small>}
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
                    <span>Tag/MCP 服务地址</span>
                    <input
                      value={settings.tagServerUrl}
                      placeholder="例如：http://127.0.0.1:8765 或 MCP HTTP 网关"
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
    </AppPortal>
  );
}

// ── Onboarding wizard ─────────────────────────────────────────────────────────
function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [token, setToken] = useState("");
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const settings = useAppStore((state) => state.settings);
  const load = useAppStore((state) => state.load);
  const setShowOnboarding = useAppStore((state) => state.setShowOnboarding);
  const refreshAccount = useAppStore((state) => state.refreshAccount);
  const cards = [
    ["欢迎", "设置用户语言", "已根据系统语言检测为简体中文。"],
    ["API", "配置 NovelAI API Token", "Token 只保存在本机主进程存储中，渲染层不会直接持有。"],
    ["保存", "选择图片保存位置", "生成图片会自动保存到此目录并写入右侧历史。"],
    ["界面", "了解主界面", "左侧参数、中间画布、右侧历史；英文输入会自动推测 tag。"],
    ["完成", "一切就绪", "之后可随时在设置中修改 API、输出目录和偏好。"],
  ];
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
              <span>第 {step + 1}/5 步</span>
            </div>
            <div className="chibi">N</div>
            <div className="card-foot">ⓘ {cards[step][0]}</div>
          </aside>
          <section className="onboarding-content">
            <h2>{cards[step][1]}</h2>
            <p>{cards[step][2]}</p>
            {step === 0 && (
              <label className="field wide">
                <span>语言</span>
                <select defaultValue="zh-CN" onChange={(e) => window.naiDesktop.setSetting("language", e.target.value as AppSettings["language"])}>
                  <option value="zh-CN">简体中文</option>
                  <option value="en-US">English（英文）</option>
                  <option value="ja-JP">日本語（日文）</option>
                </select>
              </label>
            )}
            {step === 1 && (
              <div className="settings-form">
                <label className="field wide">
                  <span>Persistent API Token（持久 API 令牌）</span>
                  <input type="password" value={token} placeholder="粘贴 NovelAI API Token" onChange={(e) => setToken(e.target.value)} />
                </label>
                <div className="row-actions">
                  <Button variant="primary" onClick={verify} disabled={checking}>
                    {checking ? <IconText icon="…">验证中...</IconText> : <IconText icon="✓">验证并保存</IconText>}
                  </Button>
                  <Button onClick={() => window.naiDesktop.openExternal(tokenHelpUrl)}>
                    <IconText icon="❔">如何获取 Token</IconText>
                  </Button>
                </div>
                {tokenStatus && <div className={clsx("status-box", tokenStatus.valid ? "ok" : "bad")}>{tokenStatus.message}</div>}
              </div>
            )}
            {step === 2 && (
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
                  <IconText icon="📁">浏览...</IconText>
                </Button>
              </div>
            )}
            {step === 3 && (
              <div className="intro-grid">
                <div><strong>左侧</strong><span>提示词、模型、图片输入、功能参数</span></div>
                <div><strong>中间</strong><span>生成预览、重绘画布、定位文件</span></div>
                <div><strong>右侧</strong><span>按日期查看历史、删除记录</span></div>
                <div><strong>补全</strong><span>输入 g / glo 等英文片段，Tab 或 Enter 插入 tag</span></div>
              </div>
            )}
            {step === 4 && <div className="done-mark">✓</div>}
          </section>
        </div>
        <div className="onboarding-footer">
          <Button disabled={step === 0} onClick={() => setStep((v) => Math.max(0, v - 1))}>上一步</Button>
          {step < 4
            ? <Button variant="primary" onClick={() => setStep((v) => Math.min(4, v + 1))}>下一步</Button>
            : <Button variant="primary" onClick={finish}>开始使用</Button>}
        </div>
      </div>
      </div>
    </AppPortal>
  );
}

// ── Update banner ─────────────────────────────────────────────────────────────
function UpdateBanner() {
  const updateInfo = useAppStore((state) => state.updateInfo);
  const dismissUpdate = useAppStore((state) => state.dismissUpdate);
  if (!updateInfo?.hasUpdate) return null;
  return (
    <div className="update-banner">
      <span>
        🎉 发现新版本 <strong>v{updateInfo.latestVersion}</strong>（当前 v{updateInfo.currentVersion}）
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
      <div className="workspace">
        <LeftPanel openSettings={() => setShowSettings(true)} />
        {activeTab === "inpaint" ? <InpaintCanvas /> : <ImageCanvas />}
        <HistoryPanel />
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
