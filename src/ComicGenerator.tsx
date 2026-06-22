import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Button, NumberInput, Toggle } from "./components/ui";
import { createDefaultComicProject } from "./comic-template";
import {
  COMIC_ANALYZE_SYSTEM_PROMPT,
  CONVERT_SYSTEM_PROMPTS,
  SCOPED_REVERSE_SYSTEM_PROMPTS,
} from "./data/prompt-templates";
import { parseWeightedTag, setTagLevelInPrompt, splitPromptTags, formatMultiplier } from "./prompt-weight";
import { useAppStore } from "./store";
import {
  createDefaultBatchRedraw,
  NAI_MODELS,
  NAI_SAMPLERS,
  NAI_UC_PRESETS,
  type BatchRedrawItem,
  type BatchRedrawProject,
  type ComicPanel,
  type ComicProject,
  type ComicReferenceAsset,
  type ComicReferenceKind,
  type GenerateFailureKind,
  type GenerateParams,
  type NAIModel,
  type NAISampler,
  type PreciseReferenceItem,
  type ReversePromptMode,
  type ReversePromptScope,
  type UcPreset,
  type VibeTransferItem,
} from "./types";

const STORAGE_KEY = "langbai.novelai.comic-project.v1";

const STEPS = [
  { key: "story", label: "故事", hint: "导入剧情，AI 拆分镜" },
  { key: "global", label: "全局设定", hint: "角色 / 风格 / 参数" },
  { key: "panels", label: "分镜", hint: "转换提示词 / 微调" },
  { key: "generate", label: "生成", hint: "队列出图 / 实扣积分" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

function uid() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function anlasSpent(before?: number, after?: number) {
  if (typeof before !== "number" || typeof after !== "number") return null;
  return Math.max(0, before - after);
}

function normalizeComicReference(ref: Partial<ComicReferenceAsset>): ComicReferenceAsset {
  const base64 = ref.base64 ?? "";
  return {
    id: ref.id || uid(),
    name: ref.name ?? "参考图",
    kind: ref.kind ?? "precise",
    scope: ref.scope ?? "full",
    subjectHint: ref.subjectHint ?? "",
    base64,
    previewUrl: ref.previewUrl ?? (base64 ? dataUrlFromBase64(base64) : ""),
    reversePrompt: ref.reversePrompt ?? "",
    infoExtracted: typeof ref.infoExtracted === "number" ? ref.infoExtracted : 0.7,
    strength: typeof ref.strength === "number" ? ref.strength : 0.45,
    useForGeneration: ref.useForGeneration ?? true,
  };
}

function normalizeComicPanelData(panel: Partial<ComicPanel>, index: number, trustOutputs: boolean): ComicPanel {
  const override = panel.paramsOverride;
  return {
    id: panel.id || uid(),
    index: typeof panel.index === "number" && panel.index > 0 ? panel.index : index + 1,
    cnPrompt: panel.cnPrompt ?? "",
    contextSummary: panel.contextSummary ?? "",
    enPrompt: panel.enPrompt ?? "",
    localNegativePrompt: panel.localNegativePrompt ?? "",
    negativeMode: panel.negativeMode === "override" ? "override" : "append",
    paramsOverride:
      override && typeof override === "object"
        ? { enabled: !!override.enabled, params: override.params ?? {} }
        : { enabled: false, params: {} },
    status: panel.status ?? "draft",
    actualAnlas: panel.actualAnlas,
    // Output references point at machine-local files; only trust them from our own
    // localStorage, never from an imported (untrusted) project JSON.
    historyItemId: trustOutputs ? panel.historyItemId : undefined,
    outputPath: trustOutputs ? panel.outputPath : undefined,
    outputUrl: trustOutputs ? panel.outputUrl : undefined,
    error: trustOutputs ? panel.error : undefined,
  };
}

// Single source of truth for turning a raw/old/untrusted project blob into a
// fully-populated ComicProject. Shared by localStorage hydration and JSON import
// so both stay robust against missing fields (paramsOverride / negativeMode / …).
function normalizeComicProject(
  parsed: Partial<ComicProject> | null | undefined,
  params: GenerateParams,
  options: { trustOutputs: boolean },
): ComicProject {
  const source = parsed ?? {};
  return {
    ...createDefaultComicProject(params),
    ...source,
    historyGroupId: options.trustOutputs ? source.historyGroupId : undefined,
    mode: source.mode ?? "natural",
    desiredPanelCount: source.desiredPanelCount ?? "auto",
    autoExportZip: source.autoExportZip ?? false,
    adultBranch: false,
    inheritPreviousFrame: false,
    continuityBible: "",
    globalParams: { ...params, ...(source.globalParams ?? {}), positivePrompt: "" },
    references: (source.references ?? []).map((ref) => normalizeComicReference(ref)),
    panels: (source.panels ?? []).map((panel, index) => normalizeComicPanelData(panel, index, options.trustOutputs)),
  };
}

function makeStoredComicProject(project: ComicProject): ComicProject {
  return {
    ...project,
    references: project.references.map((ref) => ({
      ...ref,
      // previewUrl duplicates base64 as a data URL and can double localStorage work.
      // normalizeComicReference rebuilds it from base64 when the project is loaded.
      previewUrl: "",
    })),
  };
}

function readStoredProject(params: GenerateParams): ComicProject {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultComicProject(params);
    return normalizeComicProject(JSON.parse(raw) as Partial<ComicProject>, params, { trustOutputs: true });
  } catch {
    return createDefaultComicProject(params);
  }
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.readAsDataURL(file);
  });
}

function dataUrlFromBase64(base64: string) {
  return base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;
}

function sortedPanels(project: ComicProject) {
  return [...project.panels].sort((a, b) => a.index - b.index);
}

function mergePanelParams(project: ComicProject, panel: ComicPanel): GenerateParams {
  const base = { ...project.globalParams, positivePrompt: "" };
  if (!panel.paramsOverride.enabled) return base;
  return { ...base, ...panel.paramsOverride.params, positivePrompt: "" };
}

function setPanelTagLevel(panel: ComicPanel, tagIndex: number, level: number): ComicPanel {
  return { ...panel, enPrompt: setTagLevelInPrompt(panel.enPrompt, tagIndex, level) };
}

function labelForKind(kind: ComicReferenceKind) {
  switch (kind) {
    case "vibe":
      return "氛围迁移";
    case "precise":
      return "精准参考";
    case "character":
      return "角色参考";
    case "scene":
      return "场景参考";
    case "object":
      return "物品参考";
    default:
      return kind;
  }
}

function labelForScope(scope: ReversePromptScope) {
  switch (scope) {
    case "character":
      return "角色";
    case "object":
      return "物品";
    case "scene":
      return "场景";
    default:
      return "整张图片";
  }
}

function labelForPanelStatus(status: ComicPanel["status"]) {
  switch (status) {
    case "draft": return "草稿";
    case "converted": return "已转换";
    case "generating": return "生成中";
    case "done": return "已出图";
    case "failed": return "失败";
    default: return status;
  }
}

// Character / scene / object references describe persistent subjects, so their
// reverse-engineered prompts belong in the global setting (they should appear in
// every panel). Vibe / precise references are visual-only and are not folded in.
function isGlobalPromptKind(kind: ComicReferenceKind) {
  return kind === "character" || kind === "scene" || kind === "object";
}

function referenceContextLines(project: ComicProject) {
  return project.references
    .map((ref) => {
      const parts = [
        `【${labelForKind(ref.kind)}·${ref.name}】`,
        ref.subjectHint?.trim() ? `用户说明：${ref.subjectHint.trim()}` : "",
        ref.scope ? `反推范围：${labelForScope(ref.scope)}` : "",
        ref.reversePrompt?.trim() ? `反推结果：${ref.reversePrompt.trim()}` : "",
      ].filter(Boolean);
      return parts.join(" ");
    })
    .filter(Boolean);
}

function updatePanel(project: ComicProject, panelId: string, updater: (panel: ComicPanel) => ComicPanel): ComicProject {
  return {
    ...project,
    panels: project.panels.map((panel) => (panel.id === panelId ? updater(panel) : panel)),
  };
}

function updateReference(
  project: ComicProject,
  refId: string,
  updater: (ref: ComicReferenceAsset) => ComicReferenceAsset,
): ComicProject {
  return {
    ...project,
    references: project.references.map((ref) => (ref.id === refId ? updater(ref) : ref)),
  };
}

type QueueState = { total: number; done: number; current: number; paused: boolean } | null;
type PanelOutput = {
  ok: boolean;
  historyItemId?: string;
  outputPath?: string;
  outputUrl?: string;
  failureKind?: GenerateFailureKind;
  message?: string;
};

export function ToolsHub() {
  const [activeTool, setActiveTool] = useState<"hub" | "comic" | "redraw">("hub");
  if (activeTool === "comic") return <ComicGenerator onBack={() => setActiveTool("hub")} />;
  if (activeTool === "redraw") return <BatchRedraw onBack={() => setActiveTool("hub")} />;

  return (
    <main className="tools-hub">
      <section className="tools-hero">
        <div>
          <span className="eyebrow">Tools</span>
          <h2>工具板块</h2>
          <p>把复杂流程收进专用工具里。</p>
        </div>
      </section>
      <section className="tool-card-grid">
        <button type="button" className="tool-card ready" onClick={() => setActiveTool("comic")}>
          <b>漫画生成器</b>
          <span>故事拆分、参考图反推、分镜转换、队列出图与 ZIP 打包。</span>
          <small>已接入</small>
        </button>
        <button type="button" className="tool-card ready" onClick={() => setActiveTool("redraw")}>
          <b>批量图生图</b>
          <span>导入图片 + 对应提示词，按改图强度逐张图生图，存入分组并打包 ZIP。</span>
          <small>已接入</small>
        </button>
      </section>
    </main>
  );
}

// ── 批量图生图 (batch img2img) ────────────────────────────────────────────────
// The whole project lives in the store (state.batchRedraw) so switching tools or
// tabs never loses imported images / prompts / params / references. 导出/导入项目
// give durable file-based save-restore (localStorage would overflow on many imgs).

const REDRAW_STEPS = [
  { key: "import", label: "导入", hint: "分组名 · 选图 · 项目" },
  { key: "params", label: "参数", hint: "全模型 · 精准参考 · 氛围" },
  { key: "prompts", label: "提示词", hint: "导入 · AI 反推 · 逐张" },
  { key: "generate", label: "生成", hint: "逐张图生图 · 重试 · 打包" },
] as const;

function batchItemParams(project: BatchRedrawProject, item: BatchRedrawItem): GenerateParams {
  const base = item.overrideParams ? { ...project.globalParams, ...item.params } : project.globalParams;
  const positive = [project.globalStyle.trim(), item.prompt.trim()].filter(Boolean).join(", ");
  return {
    ...base,
    positivePrompt: positive,
    negativePrompt: project.globalNegative.trim() || base.negativePrompt,
    fileNamePrefix: item.name,
  };
}

function normalizeBatchItem(raw: Partial<BatchRedrawItem>, index: number): BatchRedrawItem {
  return {
    id: raw.id ?? uid(),
    name: String(raw.name ?? `image_${index + 1}`),
    base64: String(raw.base64 ?? ""),
    prompt: String(raw.prompt ?? ""),
    strength: raw.strength == null ? null : Number(raw.strength),
    overrideParams: Boolean(raw.overrideParams),
    params: raw.params ?? {},
    status: raw.status === "done" ? "done" : "pending",
    resultUrl: raw.resultUrl,
    resultPath: raw.resultPath,
    historyItemId: raw.historyItemId,
  };
}

function normalizeBatchProject(parsed: unknown, fallback: BatchRedrawProject): BatchRedrawProject {
  if (!parsed || typeof parsed !== "object") return fallback;
  const p = parsed as Partial<BatchRedrawProject>;
  return {
    ...fallback,
    ...p,
    globalParams: { ...fallback.globalParams, ...(p.globalParams ?? {}) },
    items: Array.isArray(p.items) ? p.items.map((it, i) => normalizeBatchItem(it, i)).filter((it) => it.base64) : [],
    preciseReferences: Array.isArray(p.preciseReferences) ? p.preciseReferences : [],
    vibeImages: Array.isArray(p.vibeImages) ? p.vibeImages : [],
    seededFromMain: true,
  };
}

function BatchStatusBadge({ status }: { status: BatchRedrawItem["status"] }) {
  if (status === "done") return <span className="redraw-badge done">已生成</span>;
  if (status === "generating") return <span className="redraw-badge run">生成中…</span>;
  if (status === "failed") return <span className="redraw-badge fail">失败</span>;
  return null;
}

// Reusable parameter editor — drives both the global params and per-image overrides.
function BatchParamFields({ value, onPatch }: { value: GenerateParams; onPatch: (patch: Partial<GenerateParams>) => void }) {
  const SIZE_PRESETS = [
    { label: "竖图 832×1216", w: 832, h: 1216 },
    { label: "方图 1024×1024", w: 1024, h: 1024 },
    { label: "横图 1216×832", w: 1216, h: 832 },
  ];
  return (
    <div className="batch-params">
      <div className="batch-size-presets">
        {SIZE_PRESETS.map((s) => (
          <button
            type="button"
            key={s.label}
            className={clsx("batch-chip", value.width === s.w && value.height === s.h && "active")}
            onClick={() => onPatch({ width: s.w, height: s.h })}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="comic-panel-param-controls">
        <label className="comic-field"><span>模型（全模型可选）</span>
          <select value={value.model} onChange={(e) => onPatch({ model: e.target.value as NAIModel })}>
            {NAI_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <label className="comic-field"><span>采样器</span>
          <select value={value.sampler} onChange={(e) => onPatch({ sampler: e.target.value as NAISampler })}>
            {NAI_SAMPLERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <NumberInput label="宽度" value={value.width} min={64} max={1600} step={64} onChange={(v) => onPatch({ width: v })} />
        <NumberInput label="高度" value={value.height} min={64} max={1600} step={64} onChange={(v) => onPatch({ height: v })} />
        <NumberInput label="步数" value={value.steps} min={1} max={50} onChange={(v) => onPatch({ steps: v })} />
        <NumberInput label="提示词引导" value={value.cfgScale} min={1} max={10} step={0.1} onChange={(v) => onPatch({ cfgScale: v })} />
        <NumberInput label="CFG Rescale" value={value.cfgRescale} min={0} max={1} step={0.01} onChange={(v) => onPatch({ cfgRescale: v })} />
        <NumberInput label="种子（0=随机）" value={value.seed} min={0} max={4294967295} onChange={(v) => onPatch({ seed: v, seedMode: v > 0 ? "fixed" : "random" })} />
        <label className="comic-field"><span>负面预设</span>
          <select value={value.ucPreset} onChange={(e) => onPatch({ ucPreset: Number(e.target.value) as UcPreset })}>
            {NAI_UC_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>
      </div>
      <div className="comic-panel-param-toggles">
        <Toggle checked={value.qualityToggle} onChange={(v) => onPatch({ qualityToggle: v })} label="Quality Tags" description="质量词增强" />
        <Toggle checked={value.variety} onChange={(v) => onPatch({ variety: v })} label="Variety+" description="增加采样多样性" />
        <Toggle checked={value.smea} onChange={(v) => onPatch({ smea: v })} label="SMEA" description="V3 高分辨率优化" />
        <Toggle checked={value.smeaDyn} onChange={(v) => onPatch({ smeaDyn: v })} label="SMEA Dyn" description="V3 动态优化" />
      </div>
    </div>
  );
}

function BatchPrecisePicker({ refs, onChange }: { refs: PreciseReferenceItem[]; onChange: (next: PreciseReferenceItem[]) => void }) {
  async function add(files: FileList | null) {
    if (!files) return;
    const next = [...refs];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      next.push({ base64: await toBase64(f), type: "character", strength: 1, fidelity: 1, informationExtracted: 1 });
    }
    onChange(next);
  }
  return (
    <div className="batch-ref-block">
      <div className="batch-ref-head">
        <span>全局精准参考 · 仅 V4 / V4.5（每图 +5 Anlas）</span>
        <label className="btn btn-secondary btn-sm">＋ 添加<input type="file" hidden multiple accept="image/*" onChange={(e) => { void add(e.target.files); e.target.value = ""; }} /></label>
      </div>
      {refs.length === 0 ? (
        <p className="settings-hint" style={{ margin: 0 }}>未添加。用于在每张重绘中保持角色 / 画风一致。</p>
      ) : (
        <div className="batch-ref-list">
          {refs.map((r, i) => (
            <div className="batch-ref-row" key={i}>
              <img src={dataUrlFromBase64(r.base64)} alt={`precise-${i}`} />
              <select value={r.type} onChange={(e) => onChange(refs.map((x, j) => (j === i ? { ...x, type: e.target.value as PreciseReferenceItem["type"] } : x)))}>
                <option value="character">角色</option>
                <option value="style">画风</option>
                <option value="character&style">角色+画风</option>
              </select>
              <label>强度<input type="number" min={0} max={1} step={0.05} value={r.strength} onChange={(e) => onChange(refs.map((x, j) => (j === i ? { ...x, strength: Number(e.target.value) } : x)))} /></label>
              <label>保真<input type="number" min={0} max={1} step={0.05} value={r.fidelity} onChange={(e) => onChange(refs.map((x, j) => (j === i ? { ...x, fidelity: Number(e.target.value) } : x)))} /></label>
              <label title="高=带更多纹理/网点，调低可减弱">信息<input type="number" min={0} max={1} step={0.05} value={r.informationExtracted ?? 1} onChange={(e) => onChange(refs.map((x, j) => (j === i ? { ...x, informationExtracted: Number(e.target.value) } : x)))} /></label>
              <button className="vibe-remove" onClick={() => onChange(refs.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BatchVibePicker({ vibes, onChange }: { vibes: VibeTransferItem[]; onChange: (next: VibeTransferItem[]) => void }) {
  async function add(files: FileList | null) {
    if (!files) return;
    const next = [...vibes];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      next.push({ base64: await toBase64(f), infoExtracted: 1, strength: 0.6 });
    }
    onChange(next);
  }
  return (
    <div className="batch-ref-block">
      <div className="batch-ref-head">
        <span>全局氛围迁移 · Vibe Transfer（首次编码会扣 Anlas）</span>
        <label className="btn btn-secondary btn-sm">＋ 添加<input type="file" hidden multiple accept="image/*" onChange={(e) => { void add(e.target.files); e.target.value = ""; }} /></label>
      </div>
      {vibes.length === 0 ? (
        <p className="settings-hint" style={{ margin: 0 }}>未添加。把参考图的整体氛围迁移到每张重绘。</p>
      ) : (
        <div className="batch-ref-list">
          {vibes.map((v, i) => (
            <div className="batch-ref-row" key={i}>
              <img src={dataUrlFromBase64(v.base64)} alt={`vibe-${i}`} />
              <label>信息量<input type="number" min={0} max={1} step={0.05} value={v.infoExtracted} onChange={(e) => onChange(vibes.map((x, j) => (j === i ? { ...x, infoExtracted: Number(e.target.value) } : x)))} /></label>
              <label>强度<input type="number" min={0} max={1} step={0.05} value={v.strength} onChange={(e) => onChange(vibes.map((x, j) => (j === i ? { ...x, strength: Number(e.target.value) } : x)))} /></label>
              <button className="vibe-remove" onClick={() => onChange(vibes.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BatchRedraw({ onBack }: { onBack?: () => void }) {
  const params = useAppStore((state) => state.params);
  const project = useAppStore((state) => state.batchRedraw);
  const setBatchRedraw = useAppStore((state) => state.setBatchRedraw);
  const resetBatchRedraw = useAppStore((state) => state.resetBatchRedraw);
  const running = useAppStore((state) => state.batchRunning);
  const progress = useAppStore((state) => state.batchProgress);
  const setBatchRunning = useAppStore((state) => state.setBatchRunning);
  const setToast = useAppStore((state) => state.setToast);
  const refreshHistory = useAppStore((state) => state.refreshHistory);
  const refreshAccount = useAppStore((state) => state.refreshAccount);

  const [aiFilling, setAiFilling] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const { items, globalStrength, step } = project;
  const globalParams = project.globalParams;
  const readyCount = items.filter((it) => it.prompt.trim()).length;
  const doneCount = items.filter((it) => it.status === "done").length;
  const pendingReady = items.filter((it) => it.status !== "done" && it.prompt.trim()).length;

  // Seed global style / negative / params from the main 生成 screen the first time
  // the tool is opened with an empty project ("默认为生成中锁定的，可自行修改").
  useEffect(() => {
    if (project.seededFromMain || project.items.length > 0) return;
    setBatchRedraw((prev) => ({
      ...prev,
      globalParams: { ...params, fileNamePrefix: "" },
      globalStyle: params.positivePrompt,
      globalNegative: params.negativePrompt,
      seededFromMain: true,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patch(p: Partial<BatchRedrawProject>) {
    setBatchRedraw((prev) => ({ ...prev, ...p }));
  }
  function setStep(next: BatchRedrawProject["step"]) {
    patch({ step: next });
  }
  function patchItem(id: string, p: Partial<BatchRedrawItem>) {
    setBatchRedraw((prev) => ({ ...prev, items: prev.items.map((it) => (it.id === id ? { ...it, ...p } : it)) }));
  }
  function syncFromMain() {
    patch({
      globalParams: { ...params, fileNamePrefix: "" },
      globalStyle: params.positivePrompt,
      globalNegative: params.negativePrompt,
      seededFromMain: true,
    });
    setToast("已同步主界面的模型 / 参数 / 风格 / 负面词");
  }

  async function importImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    arr.sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true }));
    const next: BatchRedrawItem[] = [];
    for (const f of arr) {
      next.push({
        id: uid(),
        name: f.name.replace(/\.[^.]+$/, ""),
        base64: await toBase64(f),
        prompt: "",
        strength: null,
        overrideParams: false,
        params: {},
        status: "pending",
      });
    }
    setBatchRedraw((prev) => ({ ...prev, items: [...prev.items, ...next] }));
    setToast(`已导入 ${next.length} 张图片（按名称升序）`);
  }

  function assignPromptLines(lines: string[]): number {
    const clean = lines.map((l) => l.trim()).filter(Boolean);
    let n = 0;
    setBatchRedraw((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => {
        if (clean[i] == null) return it;
        n += 1;
        return { ...it, prompt: clean[i] };
      }),
    }));
    return Math.min(clean.length, items.length);
  }

  async function importPromptsFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    const n = assignPromptLines(text.split(/\r?\n/));
    setToast(`已按顺序导入 ${n} 条提示词`);
  }

  function importBulkPrompts() {
    if (!project.promptBulk.trim()) {
      setToast("请先在文本框粘贴/输入提示词（每行一条）");
      return;
    }
    if (items.length === 0) {
      setToast("请先在「导入」步骤导入图片");
      return;
    }
    const n = assignPromptLines(project.promptBulk.split(/\r?\n/));
    setToast(`已按顺序导入 ${n} 条提示词`);
  }

  async function aiFill() {
    if (aiFilling || running) return;
    const targets = useAppStore.getState().batchRedraw.items.filter((it) => !it.prompt.trim());
    if (targets.length === 0) {
      setToast("所有图片都已有提示词");
      return;
    }
    setAiFilling(true);
    cancelRef.current = false;
    const mode = useAppStore.getState().batchRedraw.aiMode;
    try {
      for (const it of targets) {
        if (cancelRef.current) break;
        const res = await window.naiDesktop.reversePrompt(it.base64, mode);
        if (res.ok && res.prompt) patchItem(it.id, { prompt: res.prompt.trim() });
      }
      setToast("AI 反推填充完成");
    } catch (error) {
      setToast(`AI 填充失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setAiFilling(false);
    }
  }

  // Run img2img serially over the given items. Regenerating an item first deletes
  // its previous output (磁盘 + 历史记录) so 重试 never leaves the old image behind.
  async function runTargets(targets: BatchRedrawItem[]) {
    if (running) return;
    const proj = useAppStore.getState().batchRedraw;
    if (!proj.groupName.trim()) {
      setToast("请先填写分组名称");
      setStep("import");
      return;
    }
    const ready = targets.filter((it) => it.prompt.trim());
    if (ready.length === 0) {
      setToast("没有可生成的图片（每张需要提示词）");
      return;
    }
    cancelRef.current = false;
    setBatchRunning(true, { done: 0, total: ready.length });

    try {
      await window.naiDesktop.createHistoryGroup(proj.groupName.trim());
    } catch {
      /* group ensured by the main process anyway */
    }

    const extras = {
      vibeImages: proj.vibeImages,
      charCaptions: [],
      preciseReferences: proj.preciseReferences,
    };

    let done = 0;
    let failed = 0;
    let lastError = "";
    for (const it of ready) {
      if (cancelRef.current) break;
      if (it.historyItemId) {
        try {
          await window.naiDesktop.deleteHistory(it.historyItemId);
        } catch {
          /* previous output already gone */
        }
      }
      patchItem(it.id, { status: "generating", error: undefined, resultUrl: undefined, resultPath: undefined, historyItemId: undefined });
      const res = await window.naiDesktop.redrawImage({
        imageBase64: it.base64,
        params: batchItemParams(proj, it),
        strength: it.strength ?? proj.globalStrength,
        extras,
        groupName: proj.groupName.trim(),
        fileNamePrefix: it.name,
      });
      const out = res.ok ? res.items[0] : undefined;
      if (res.ok && out) {
        patchItem(it.id, { status: "done", resultUrl: out.fileUrl, resultPath: out.filePath, historyItemId: out.id, error: undefined });
        done += 1;
      } else {
        patchItem(it.id, { status: "failed", error: res.message });
        failed += 1;
        lastError = res.message;
      }
      setBatchRunning(true, { done: done + failed, total: ready.length });
    }

    await refreshHistory();
    await refreshAccount();
    setBatchRunning(false, null);
    setToast(
      cancelRef.current
        ? `已停止（完成 ${done} 张）`
        : failed > 0
          ? `完成 ${done} 张，失败 ${failed} 张：${lastError}`
          : `全部完成，共 ${done} 张，已存入分组「${proj.groupName.trim()}」`,
    );
  }

  function stop() {
    cancelRef.current = true;
    void window.naiDesktop.cancel();
  }

  async function exportZip() {
    const name = project.groupName.trim();
    if (!name) {
      setToast("请先填写分组名称");
      return;
    }
    let gid: string | undefined;
    try {
      const groups = await window.naiDesktop.createHistoryGroup(name);
      gid = groups.find((g) => g.name.trim().toLowerCase() === name.toLowerCase())?.id;
    } catch {
      /* ignore */
    }
    if (!gid) {
      setToast("请先生成后再打包");
      return;
    }
    const res = await window.naiDesktop.exportHistoryGroup(gid);
    setToast(res.ok ? `已打包 ZIP：${res.path ?? "完成"}` : res.message);
  }

  function exportProject() {
    const data = JSON.stringify(useAppStore.getState().batchRedraw, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.groupName.trim() || "批量图生图"}.batch.json`;
    a.click();
    URL.revokeObjectURL(url);
    setToast("已导出项目（含图片与参数）");
  }

  async function importProject(file: File | null) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const next = normalizeBatchProject(parsed, createDefaultBatchRedraw(params));
      setBatchRedraw(() => next);
      setToast(`已导入项目（${next.items.length} 张图片）`);
    } catch (error) {
      setToast(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function clearProject() {
    if (running) return;
    resetBatchRedraw();
    setToast("已清除当前项目");
  }

  return (
    <main className="comic-generator redraw-wizard">
      <div className="comic-page-title">
        <span className="eyebrow">工具 / 批量图生图</span>
        <strong>{project.groupName.trim() || "未命名批量任务"}</strong>
        <small>{items.length} 张 · {readyCount} 已配提示词 · {doneCount} 已生成 · 强度 {globalStrength.toFixed(2)}</small>
      </div>

      <nav className="comic-steps">
        {REDRAW_STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            className={clsx("comic-step-btn", step === s.key && "active")}
            onClick={() => setStep(s.key)}
          >
            <b>{i + 1}</b>
            <span>{s.label}</span>
            <small>{s.hint}</small>
          </button>
        ))}
      </nav>

      <div className="comic-step-actions">
        {onBack ? <Button onClick={onBack} variant="ghost">返回工具首页</Button> : null}
        <span className="redraw-flow-hint">流程：导入 → 参数 → 提示词 → 生成（项目自动保存，切换不丢失）</span>
      </div>

      {step === "import" && (
        <section className="redraw-card">
          <label className="field">
            <span>分组名称（最终图片全部存入此分组，并作为打包来源）</span>
            <input value={project.groupName} onChange={(e) => patch({ groupName: e.target.value })} placeholder="例如：重绘_0622" />
          </label>
          <div className="redraw-actions">
            <label className="btn btn-primary">
              ＋ 导入图片
              <input type="file" hidden multiple accept="image/png,image/jpeg,image/webp" onChange={(e) => { void importImages(e.target.files); e.target.value = ""; }} />
            </label>
            <Button variant="secondary" onClick={exportProject} disabled={items.length === 0}>导出项目</Button>
            <label className="btn btn-secondary redraw-file-btn">
              导入项目
              <input type="file" hidden accept=".json,application/json" onChange={(e) => { void importProject(e.target.files?.[0] ?? null); e.target.value = ""; }} />
            </label>
            <Button variant="ghost" onClick={clearProject} disabled={running || items.length === 0}>清除当前项目</Button>
          </div>
          <p className="settings-hint" style={{ margin: 0 }}>
            默认按文件名升序（1 / 2 / 10 正确顺序）。项目（图片+提示词+参数+参考）会自动保存，切换工具/标签不会丢失；「导出项目」可跨重启备份/迁移。
          </p>
          <div className="redraw-grid">
            {items.length === 0 && <p className="vibe-empty">还没有导入图片。点「导入图片」开始。</p>}
            {items.map((it, idx) => (
              <div className="redraw-thumb-card" key={it.id}>
                <img src={dataUrlFromBase64(it.base64)} alt={it.name} title="双击放大" onDoubleClick={() => setLightbox(dataUrlFromBase64(it.base64))} />
                <span className="redraw-thumb-name" title={it.name}>#{idx + 1} {it.name}</span>
                <button className="vibe-remove" title="移除" onClick={() => setBatchRedraw((prev) => ({ ...prev, items: prev.items.filter((p) => p.id !== it.id) }))}>×</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {step === "params" && (
        <section className="redraw-card redraw-globals">
          <div className="redraw-globals-head">
            <strong>全局参数 · 默认取自主界面「生成」，可自行修改</strong>
            <Button variant="ghost" onClick={syncFromMain}>同步主界面参数</Button>
          </div>
          <label className="field">
            <span>全局改图强度：{globalStrength.toFixed(2)}（越低越保留原图）</span>
            <input type="range" min={0.1} max={0.99} step={0.01} value={globalStrength} onChange={(e) => patch({ globalStrength: Number(e.target.value) })} />
          </label>
          <div className="redraw-global-prompts">
            <label className="field">
              <span>全局风格提示词（拼在每张图提示词前）</span>
              <textarea className="redraw-global-text" value={project.globalStyle} onChange={(e) => patch({ globalStyle: e.target.value })} placeholder="如 masterpiece, best quality, anime" />
            </label>
            <label className="field">
              <span>全局负面提示词（留空用模型默认负面词）</span>
              <textarea className="redraw-global-text" value={project.globalNegative} onChange={(e) => patch({ globalNegative: e.target.value })} placeholder="如 lowres, bad anatomy" />
            </label>
          </div>
          <BatchParamFields value={globalParams} onPatch={(p) => patch({ globalParams: { ...globalParams, ...p } })} />
          <BatchPrecisePicker refs={project.preciseReferences} onChange={(next) => patch({ preciseReferences: next })} />
          <BatchVibePicker vibes={project.vibeImages} onChange={(next) => patch({ vibeImages: next })} />
        </section>
      )}

      {step === "prompts" && (
        <section className="redraw-card">
          <label className="field">
            <span>批量输入提示词（每行一条，按顺序对应图片）→ 点「导入文本」</span>
            <textarea
              className="redraw-bulk"
              value={project.promptBulk}
              placeholder={"第 1 张的提示词\n第 2 张的提示词\n第 3 张的提示词\n..."}
              onChange={(e) => patch({ promptBulk: e.target.value })}
            />
          </label>
          <div className="redraw-actions">
            <Button variant="primary" onClick={importBulkPrompts} disabled={running || items.length === 0}>导入文本</Button>
            <label className="btn btn-secondary redraw-file-btn">
              导入 .txt 文件
              <input type="file" hidden accept=".txt,text/plain" onChange={(e) => { void importPromptsFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
            </label>
            <span className="redraw-ai-mode">
              反推模式
              <select value={project.aiMode} onChange={(e) => patch({ aiMode: e.target.value as ReversePromptMode })}>
                <option value="tags">标签 (Danbooru)</option>
                <option value="natural">自然语言</option>
                <option value="mixed">混合</option>
              </select>
            </span>
            <Button variant="secondary" onClick={() => void aiFill()} disabled={aiFilling || running || items.length === 0}>
              {aiFilling ? "AI 反推中…" : "AI 反推填充空缺"}
            </Button>
          </div>
          <p className="settings-hint" style={{ margin: 0 }}>导入优先（每行对应一张）；空缺可用所选模式 AI 反推补全。双击图片放大；每张可单独改图强度 / 单独参数后立即「重新生成」。</p>
          <div className="redraw-cards">
            {items.length === 0 && <p className="vibe-empty">请先在「导入」步骤导入图片。</p>}
            {items.map((it, idx) => (
              <article className={clsx("redraw-card-item", `status-${it.status}`)} key={it.id}>
                <div className="redraw-card-thumb" title="双击放大" onDoubleClick={() => setLightbox(it.resultUrl || dataUrlFromBase64(it.base64))}>
                  <img
                    src={it.resultUrl || dataUrlFromBase64(it.base64)}
                    alt={it.name}
                    draggable={Boolean(it.resultUrl)}
                    title={it.resultUrl ? "可拖出到桌面 / 其他程序" : undefined}
                    onDragStart={(e) => {
                      if (!it.resultUrl) return;
                      e.preventDefault();
                      window.naiDesktop.startImageDrag(it.resultUrl);
                    }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = dataUrlFromBase64(it.base64); }}
                  />
                  <BatchStatusBadge status={it.status} />
                </div>
                <div className="redraw-card-body">
                  <div className="redraw-card-head"><b>#{idx + 1}</b><span title={it.name}>{it.name}</span></div>
                  <textarea
                    className="redraw-prompt"
                    value={it.prompt}
                    placeholder="该图片的提示词（导入 / AI 反推 / 手动编辑）"
                    onChange={(e) => patchItem(it.id, { prompt: e.target.value })}
                  />
                  <div className="redraw-card-row">
                    <label className="redraw-strength-inline">
                      强度
                      <input
                        type="number"
                        min={0.1}
                        max={0.99}
                        step={0.01}
                        value={it.strength ?? ""}
                        placeholder={globalStrength.toFixed(2)}
                        onChange={(e) => patchItem(it.id, { strength: e.target.value === "" ? null : Number(e.target.value) })}
                      />
                    </label>
                    <label className="redraw-override-toggle">
                      <input
                        type="checkbox"
                        checked={it.overrideParams}
                        onChange={(e) => patchItem(it.id, { overrideParams: e.target.checked, params: e.target.checked && Object.keys(it.params).length === 0 ? { ...globalParams } : it.params })}
                      />
                      单独参数
                    </label>
                    <Button variant="secondary" onClick={() => void runTargets([it])} disabled={running || !it.prompt.trim()}>
                      {it.status === "done" ? "重新生成" : it.status === "failed" ? "重试" : "生成此张"}
                    </Button>
                  </div>
                  {it.overrideParams && (
                    <details className="redraw-override-panel" open>
                      <summary>本图独立高级参数（覆盖全局）</summary>
                      <BatchParamFields value={{ ...globalParams, ...it.params }} onPatch={(p) => patchItem(it.id, { params: { ...it.params, ...p } })} />
                    </details>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {step === "generate" && (
        <section className="redraw-card">
          <div className="redraw-generate-bar">
            <p className="settings-hint" style={{ margin: 0 }}>
              对 {readyCount} 张已配提示词的图片逐张图生图，存入分组「{project.groupName.trim() || "未命名"}」。结果实时显示；可单张「重试 / 重新生成」（自动删除上一次成图），完成后打包 ZIP（按名称升序）。
            </p>
            <div className="redraw-footer">
              {progress && <div className="redraw-progress">进度 {progress.done}/{progress.total}</div>}
              {running ? (
                <Button variant="danger" onClick={stop}>✕ 停止</Button>
              ) : (
                <>
                  <Button variant="primary" onClick={() => void runTargets(items)} disabled={readyCount === 0}>
                    ▶ 开始批量（{readyCount} 张）
                  </Button>
                  <Button variant="secondary" onClick={() => void runTargets(items.filter((it) => it.status !== "done"))} disabled={pendingReady === 0}>
                    生成未完成（{pendingReady}）
                  </Button>
                </>
              )}
              <Button variant="secondary" onClick={() => void exportZip()} disabled={running || doneCount === 0}>打包 ZIP</Button>
            </div>
          </div>
          <div className="redraw-cards">
            {items.length === 0 && <p className="vibe-empty">请先导入图片并配置提示词。</p>}
            {items.map((it, idx) => (
              <article className={clsx("redraw-card-item", `status-${it.status}`)} key={it.id}>
                <div className="redraw-card-thumb" title="双击放大" onDoubleClick={() => setLightbox(it.resultUrl || dataUrlFromBase64(it.base64))}>
                  <img
                    src={it.resultUrl || dataUrlFromBase64(it.base64)}
                    alt={it.name}
                    draggable={Boolean(it.resultUrl)}
                    title={it.resultUrl ? "可拖出到桌面 / 其他程序" : undefined}
                    onDragStart={(e) => {
                      if (!it.resultUrl) return;
                      e.preventDefault();
                      window.naiDesktop.startImageDrag(it.resultUrl);
                    }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = dataUrlFromBase64(it.base64); }}
                  />
                  <BatchStatusBadge status={it.status} />
                </div>
                <div className="redraw-card-body">
                  <div className="redraw-card-head"><b>#{idx + 1}</b><span title={it.name}>{it.name}</span></div>
                  {it.error ? (
                    <p className="redraw-card-error" title={it.error}>{it.error}</p>
                  ) : (
                    <p className="redraw-card-prompt" title={it.prompt}>{it.prompt || "（无提示词，将被跳过）"}</p>
                  )}
                  <div className="redraw-card-row">
                    <Button variant="secondary" onClick={() => void runTargets([it])} disabled={running || !it.prompt.trim()}>
                      {it.status === "done" ? "重新生成" : it.status === "failed" ? "重试" : "生成此张"}
                    </Button>
                    {it.resultUrl && <Button variant="ghost" onClick={() => setLightbox(it.resultUrl!)}>查看大图</Button>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {lightbox && (
        <div className="redraw-lightbox" role="presentation" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="预览" />
          <button className="redraw-lightbox-close" onClick={() => setLightbox(null)}>×</button>
        </div>
      )}
    </main>
  );
}

export function ComicGenerator({ onBack }: { onBack?: () => void }) {
  const currentParams = useAppStore((state) => state.params);
  const account = useAppStore((state) => state.account);
  const settings = useAppStore((state) => state.settings);
  const refreshHistory = useAppStore((state) => state.refreshHistory);
  const refreshAccount = useAppStore((state) => state.refreshAccount);
  const setToast = useAppStore((state) => state.setToast);
  const [project, setProject] = useState<ComicProject>(() => readStoredProject(currentParams));
  const [step, setStep] = useState<StepKey>("story");
  const [busy, setBusy] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [activePanelId, setActivePanelId] = useState("");
  const [generationLog, setGenerationLog] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [panelEditorTab, setPanelEditorTab] = useState<"content" | "params" | "weights">("content");
  const [translatingPanel, setTranslatingPanel] = useState("");
  const [queue, setQueue] = useState<QueueState>(null);
  const [queueAnlasQuote, setQueueAnlasQuote] = useState<number | null>(null);
  const [queueQuoteError, setQueueQuoteError] = useState("");
  const [queueQuoteLoading, setQueueQuoteLoading] = useState(false);
  const [queueAnlasSpent, setQueueAnlasSpent] = useState<number | null>(null);
  const queueRef = useRef({ paused: false, cancelled: false });
  const mountedRef = useRef(true);
  const comicRootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      const wasRunning = !queueRef.current.cancelled;
      queueRef.current.cancelled = true;
      // Leaving the comic tab mid-queue must abort the in-flight paid request,
      // otherwise it keeps generating, billing, and saving in the background.
      if (wasRunning) void window.naiDesktop.cancel();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
    // Reference images are stored as base64; a few large ones can blow past the
    // localStorage quota. Guard the write and fall back to persisting references
    // without their image data rather than letting the page state go unstable.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(makeStoredComicProject(project)));
    } catch {
      try {
        const slim = makeStoredComicProject({
          ...project,
          references: project.references.map((ref) => ({ ...ref, base64: "", previewUrl: "" })),
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
        setToast("参考图过大，已只保存项目文本（参考图需重新上传）。建议精简参考图数量或尺寸。");
      } catch {
        setToast("项目过大，无法保存到本地缓存，请导出项目 JSON 备份。");
      }
    }
    }, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [project, setToast]);

  useEffect(() => {
    comicRootRef.current?.scrollTo({ top: 0 });
  }, [step]);

  useEffect(() => {
    let cancelled = false;
    void window.naiDesktop.getHistory().then((history) => {
      if (cancelled) return;
      const byId = new Map(history.map((item) => [item.id, item]));
      const byPanel = new Map<number, (typeof history)[number]>();
      for (const item of history) {
        if (
          item.comicProjectId === project.id &&
          typeof item.comicPanelNo === "number" &&
          !byPanel.has(item.comicPanelNo)
        ) {
          byPanel.set(item.comicPanelNo, item);
        }
      }
      setProject((prev) => {
        let changed = false;
        const nextPanels = prev.panels.map((panel) => {
          const item = (panel.historyItemId ? byId.get(panel.historyItemId) : undefined) ?? byPanel.get(panel.index);
          if (!item || (panel.outputUrl === item.fileUrl && panel.historyItemId === item.id)) return panel;
          changed = true;
          return {
            ...panel,
            status: "done" as const,
            historyItemId: item.id,
            outputPath: item.filePath,
            outputUrl: item.fileUrl,
            error: undefined,
          };
        });
        return changed ? { ...prev, panels: nextPanels } : prev;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const panels = useMemo(() => sortedPanels(project), [project]);
  const activePanel = useMemo(() => panels.find((panel) => panel.id === activePanelId) ?? panels[0], [panels, activePanelId]);
  const activePanelTags = useMemo(
    () => (activePanel ? splitPromptTags(activePanel.enPrompt).slice(0, 48) : []),
    [activePanel],
  );
  const selectedPanels = useMemo(
    () => (selectedIds.size ? panels.filter((panel) => selectedIds.has(panel.id)) : panels),
    [panels, selectedIds],
  );
  const explicitlySelectedPanels = useMemo(
    () => panels.filter((panel) => selectedIds.has(panel.id)),
    [panels, selectedIds],
  );
  const ungeneratedPanels = useMemo(
    () => panels.filter((panel) => !panel.outputUrl),
    [panels],
  );
  const quotePreviewTargets = explicitlySelectedPanels.length ? explicitlySelectedPanels : ungeneratedPanels;
  const quoteTargetLabel = explicitlySelectedPanels.length
    ? `已选 ${explicitlySelectedPanels.length} 张`
    : `未生成 ${ungeneratedPanels.length} 张`;
  const convertedCount = panels.filter((panel) => panel.enPrompt.trim()).length;
  const doneCount = panels.filter((panel) => panel.status === "done").length;
  const queueRunning = Boolean(queue);
  const quotePreviewKey = JSON.stringify({
    step,
    queueRunning,
    account: {
      hasToken: account.hasToken,
      tierLevel: account.tierLevel,
      active: account.hasActiveSubscription,
      balance: account.anlasBalance,
    },
    references: project.references.filter((ref) => ref.base64 && ref.useForGeneration !== false).length,
    panels: quotePreviewTargets.map((panel) => {
      const params = mergePanelParams(project, panel);
      return {
        id: panel.id,
        model: params.model,
        width: params.width,
        height: params.height,
        steps: params.steps,
        smea: params.smea,
        smeaDyn: params.smeaDyn,
      };
    }),
  });

  useEffect(() => {
    if (panels.length > 0 && !panels.some((panel) => panel.id === activePanelId)) {
      setActivePanelId(panels[0].id);
    }
  }, [activePanelId, panels]);

  useEffect(() => {
    let cancelled = false;
    if (step !== "generate" || !account.hasToken) {
      setQueueAnlasQuote(null);
      setQueueQuoteError("");
      setQueueQuoteLoading(false);
      return;
    }
    if (queueRunning) return;
    if (!quotePreviewTargets.length) {
      setQueueAnlasQuote(0);
      setQueueQuoteError("");
      setQueueQuoteLoading(false);
      return;
    }
    setQueueAnlasQuote(null);
    setQueueQuoteError("");
    setQueueQuoteLoading(true);
    const timer = window.setTimeout(() => {
      void quotePanelTargets(quotePreviewTargets, account)
        .then((result) => {
          if (cancelled) return;
          if (result.ok) setQueueAnlasQuote(result.amount);
          else setQueueQuoteError(result.message);
        })
        .finally(() => {
          if (!cancelled) setQueueQuoteLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [quotePreviewKey]);

  function patchProject(patch: Partial<ComicProject>) {
    setProject((prev) => ({ ...prev, ...patch }));
  }

  function patchGlobalParam<K extends keyof GenerateParams>(key: K, value: GenerateParams[K]) {
    setProject((prev) => ({ ...prev, globalParams: { ...prev.globalParams, [key]: value, positivePrompt: "" } }));
  }

  function patchPanelParam<K extends keyof GenerateParams>(panelId: string, key: K, value: GenerateParams[K]) {
    setProject((prev) => updatePanel(prev, panelId, (panel) => ({
      ...panel,
      paramsOverride: {
        ...panel.paramsOverride,
        params: { ...panel.paramsOverride.params, [key]: value },
      },
    })));
  }

  function setDesiredPanelCount(value: number) {
    patchProject({ desiredPanelCount: value > 0 ? Math.round(value) : "auto" });
  }

  function modeLabel(mode: ReversePromptMode) {
    return mode === "natural" ? "自然语言" : mode === "tags" ? "Danbooru 标签" : "混合";
  }

  function templateStatus(kind: "reverse" | "convert" | "comic") {
    if (kind === "comic") {
      const custom = settings?.comicAnalyzePromptTemplate?.trim();
      return {
        label: custom ? "使用设置中的 AI 拆分分镜模板" : "使用内置 AI 拆分分镜模板",
        text: custom || COMIC_ANALYZE_SYSTEM_PROMPT,
      };
    }
    const map = kind === "reverse" ? settings?.reversePromptTemplates : settings?.convertPromptTemplates;
    const legacy = kind === "reverse" ? settings?.visionSystemPrompt : kind === "convert" ? settings?.convertSystemPrompt : "";
    const builtIn =
      kind === "reverse"
        ? SCOPED_REVERSE_SYSTEM_PROMPTS[project.mode]
        : CONVERT_SYSTEM_PROMPTS[project.mode];
    const custom = map?.[project.mode]?.trim() || legacy?.trim();
    return {
      label: custom ? "使用自定义模板" : "使用内置模板",
      text: custom || builtIn,
    };
  }

  function syncCurrentParams() {
    setProject((prev) => ({
      ...prev,
      globalParams: { ...currentParams, positivePrompt: "" },
      globalStylePrompt: currentParams.stylePrompt,
      globalNegativePrompt: currentParams.negativePrompt,
    }));
    setToast("已同步当前生图参数到漫画项目。");
  }

  function createNewProject() {
    if (!window.confirm("确定新建项目？当前漫画项目内容会被清空。")) return;
    const base = createDefaultComicProject(currentParams);
    setProject({
      ...base,
      title: "未命名漫画项目",
      rawScript: "",
      globalPrompt: "",
      globalCharacterSetting: "",
      continuityBible: "",
      globalStylePrompt: currentParams.stylePrompt,
      globalNegativePrompt: currentParams.negativePrompt,
      mode: project.mode,
      desiredPanelCount: project.desiredPanelCount,
      adultBranch: false,
      inheritPreviousFrame: false,
      references: [],
      panels: [],
    });
    setSelectedIds(new Set());
    setStep("story");
    setGenerationLog("已新建空白漫画项目。");
  }

  function clearPanels() {
    if (!project.panels.length || !window.confirm("只清空分镜列表？故事、全局设定和参考图会保留。")) return;
    patchProject({ panels: [], continuityBible: "" });
    setSelectedIds(new Set());
    setGenerationLog("已清空分镜列表。");
  }

  function exportProjectJson() {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.title || "comic-project"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importProjectJson(file: File | null) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Partial<ComicProject>;
      // trustOutputs: false — strip outputPath/outputUrl/historyItemId from the
      // imported (untrusted) JSON so a malicious project can't point the exporter
      // at arbitrary local files.
      setProject(normalizeComicProject(parsed, currentParams, { trustOutputs: false }));
      setSelectedIds(new Set());
      setGenerationLog("已导入漫画项目 JSON（已清除外部文件路径，需重新生成图片）。");
    } catch (error) {
      setToast(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function addReferences(files: FileList | null) {
    if (!files?.length) return;
    const refs: ComicReferenceAsset[] = [];
    for (const file of Array.from(files)) {
      const base64 = await toBase64(file);
      refs.push({
        id: uid(),
        name: file.name,
        kind: "precise",
        base64,
        previewUrl: dataUrlFromBase64(base64),
        reversePrompt: "",
        scope: "full",
        subjectHint: "",
        infoExtracted: 1,
        strength: 0.65,
        useForGeneration: true,
      });
    }
    setProject((prev) => ({ ...prev, references: [...prev.references, ...refs] }));
  }

  async function reverseReference(ref: ComicReferenceAsset) {
    setBusy(`reverse:${ref.id}`);
    try {
      const result = await window.naiDesktop.comicReverseAsset(
        ref.base64,
        project.mode,
        ref.scope ?? "full",
        ref.subjectHint ?? "",
      );
      setProject((prev) =>
        updateReference(prev, ref.id, (item) => ({
          ...item,
          reversePrompt: result.ok ? result.prompt ?? "" : item.reversePrompt,
        })),
      );
      setToast(result.message);
    } finally {
      setBusy("");
    }
  }

  // Fold every character/scene/object reverse-prompt into the global character
  // setting so it is carried through analyze + convert for all panels.
  function foldReferencesIntoGlobal() {
    const lines = project.references
      .filter((ref) => isGlobalPromptKind(ref.kind) && ref.reversePrompt.trim())
      .map((ref) => `【${labelForKind(ref.kind)}·${ref.name}】${ref.reversePrompt.trim()}`);
    if (!lines.length) {
      setToast("没有可写入全局设定的角色/场景/物品反推结果。");
      return;
    }
    setProject((prev) => ({
      ...prev,
      globalCharacterSetting: [prev.globalCharacterSetting.trim(), ...lines].filter(Boolean).join("\n"),
    }));
    setToast(`已把 ${lines.length} 条参考反推写入全局设定。`);
  }

  async function analyzeScript() {
    setBusy("analyze");
    try {
      const result = await window.naiDesktop.comicAnalyzeScript({
        script: project.rawScript,
        adultBranch: false,
        mode: project.mode,
        desiredPanelCount: project.desiredPanelCount,
        referencePrompts: referenceContextLines(project),
      });
      if (!result.ok) {
        setToast(result.message);
        return;
      }
      setProject((prev) => ({
        ...prev,
        title: result.title || prev.title,
        globalPrompt: result.globalPrompt || prev.globalPrompt,
        globalCharacterSetting:
          result.globalCharacterSetting || referenceContextLines(prev).join("\n") || prev.globalCharacterSetting,
        continuityBible: "",
        panels: (result.panels ?? []).map((panel, index) => ({
          id: uid(),
          index: index + 1,
          cnPrompt: panel.cnPrompt,
          contextSummary: panel.contextSummary || panel.cnPrompt.slice(0, 120),
          enPrompt: "",
          localNegativePrompt: "",
          negativeMode: "append",
          paramsOverride: { enabled: false, params: {} },
          status: "draft",
        })),
      }));
      setSelectedIds(new Set());
      setToast(`已拆分 ${result.panels?.length ?? 0} 个分镜。`);
      setStep("global");
    } finally {
      setBusy("");
    }
  }

  async function convertPanels(targets = selectedPanels) {
    if (!targets.length) return;
    setBusy("convert");
    try {
      const allPanels = sortedPanels(project);
      const requestPanels = targets.map((panel) => {
        const index = allPanels.findIndex((item) => item.id === panel.id);
        return {
          panelId: panel.id,
          index: panel.index,
          cnPrompt: panel.cnPrompt,
          previousCnPrompt: allPanels[index - 1]?.cnPrompt ?? "",
          nextCnPrompt: allPanels[index + 1]?.cnPrompt ?? "",
          previousPrompts: allPanels.slice(Math.max(0, index - 2), index).map((item) => item.enPrompt || item.cnPrompt),
          previousSummaries: allPanels.slice(Math.max(0, index - 2), index).map((item) => item.contextSummary || item.cnPrompt),
          nextSummaries: allPanels.slice(index + 1, index + 2).map((item) => item.contextSummary || item.cnPrompt),
        };
      });
      const result = await window.naiDesktop.comicConvertPanels({
        mode: project.mode,
        globalPrompt: project.globalPrompt,
        globalCharacterSetting: project.globalCharacterSetting,
        continuityBible: "",
        globalStylePrompt: project.globalStylePrompt,
        referencePrompts: referenceContextLines(project),
        adultBranch: false,
        panels: requestPanels,
      });
      setProject((prev) => ({
        ...prev,
        panels: prev.panels.map((panel) => {
          const converted = result.panels.find((item) => item.panelId === panel.id);
          if (!converted) return panel;
          return {
            ...panel,
            enPrompt: converted.enPrompt || panel.enPrompt,
            contextSummary: converted.contextSummary || panel.contextSummary,
            status: converted.error ? "failed" : "converted",
            error: converted.error,
          };
        }),
      }));
      setToast(result.message);
    } finally {
      setBusy("");
    }
  }

  async function checkConsistency() {
    if (!panels.some((panel) => panel.enPrompt.trim())) {
      setToast("请先转换至少一个分镜英文提示词。");
      return;
    }
    setBusy("consistency");
    try {
      const result = await window.naiDesktop.comicCheckConsistency({
        mode: project.mode,
        globalPrompt: project.globalPrompt,
        globalCharacterSetting: project.globalCharacterSetting,
        referencePrompts: referenceContextLines(project),
        panels: panels.map((panel) => ({
          id: panel.id,
          index: panel.index,
          cnPrompt: panel.cnPrompt,
          enPrompt: panel.enPrompt,
        })),
      });
      if (!result.ok) {
        setToast(result.message);
        return;
      }
      setProject((prev) => ({
        ...prev,
        panels: prev.panels.map((panel) => {
          const fixed = result.panels.find((item) => item.panelId === panel.id);
          return fixed?.enPrompt ? { ...panel, enPrompt: fixed.enPrompt, status: "converted" } : panel;
        }),
      }));
      setToast(result.message);
    } finally {
      setBusy("");
    }
  }

  async function translatePanelText(panel: ComicPanel, direction: "to-en" | "to-zh") {
    const source = direction === "to-en" ? panel.cnPrompt.trim() : panel.enPrompt.trim();
    if (!source) {
      setToast(direction === "to-en" ? "当前分镜没有中文描述。" : "当前分镜没有英文提示词。");
      return;
    }
    setTranslatingPanel(`${panel.id}:${direction}`);
    try {
      const result = await window.naiDesktop.translate(source, direction === "to-en" ? "en" : "zh");
      if (!result.ok || !result.text?.trim()) {
        setToast(result.error ?? "翻译失败，请检查翻译设置和网络。");
        return;
      }
      setProject((prev) => updatePanel(prev, panel.id, (old) => direction === "to-en"
        ? { ...old, enPrompt: result.text!.trim(), status: "converted", error: undefined }
        : { ...old, cnPrompt: result.text!.trim(), error: undefined }));
      setToast(direction === "to-en" ? `分镜 #${panel.index} 已直译为英文。` : `分镜 #${panel.index} 已回译为中文。`);
    } finally {
      setTranslatingPanel("");
    }
  }

  async function generatePanel(panel: ComicPanel): Promise<PanelOutput> {
    setBusy(`generate:${panel.id}`);
    setProject((prev) => updatePanel(prev, panel.id, (old) => ({ ...old, status: "generating", error: undefined })));
    try {
      const result = await window.naiDesktop.comicGeneratePanel({
        projectId: project.id,
        projectTitle: project.title,
        historyGroupId: project.historyGroupId,
        panelId: panel.id,
        panelIndex: panel.index,
        params: mergePanelParams(project, panel),
        globalStylePrompt: project.globalStylePrompt,
        panelPrompt: panel.enPrompt || panel.cnPrompt,
        globalNegativePrompt: project.globalNegativePrompt,
        localNegativePrompt: panel.localNegativePrompt,
        negativeMode: panel.negativeMode,
        references: project.references,
        previousImagePath: undefined,
        inheritPreviousFrame: false,
      });
      if (!mountedRef.current || queueRef.current.cancelled) {
        return { ok: false, failureKind: "cancelled", message: "已取消漫画生图队列。" };
      }
      const item = result.items[0];
      setProject((prev) => ({
        ...updatePanel(prev, panel.id, (old) => ({
          ...old,
          status: result.ok && item ? "done" : "failed",
          historyItemId: item?.id ?? old.historyItemId,
          outputPath: item?.filePath ?? old.outputPath,
          outputUrl: item?.fileUrl ?? old.outputUrl,
          error: result.ok ? undefined : result.message,
        })),
        historyGroupId: item?.groupId ?? prev.historyGroupId,
      }));
      if (item && mountedRef.current) {
        await refreshHistory(item.date);
        await refreshAccount();
      }
      if (result.ok && item) {
        return { ok: true, historyItemId: item.id, outputPath: item.filePath, outputUrl: item.fileUrl };
      }
      return { ok: false, failureKind: result.failureKind, message: result.message };
    } finally {
      if (mountedRef.current) setBusy("");
    }
  }

  async function exportProjectZip(target: ComicProject = project) {
    setBusy("exportZip");
    try {
      const result = await window.naiDesktop.comicExportProjectZip(target);
      setToast(result.message);
      if (result.ok && result.path) setGenerationLog(`ZIP 已导出：${result.path}`);
      return result.ok;
    } finally {
      if (mountedRef.current) setBusy("");
    }
  }

  async function runQueue(targets: ComicPanel[], anlasBefore?: number) {
    if (!targets.length) return;
    queueRef.current = { paused: false, cancelled: false };
    setQueue({ total: targets.length, done: 0, current: 0, paused: false });
    setQueueAnlasSpent(null);
    // Collect each panel's freshly-generated output here. React state updates are
    // async, so the closure `project` is stale by the time the loop ends — we must
    // build the export target from these collected results, not from `project`.
    const generatedOutputs = new Map<string, PanelOutput>();
    for (let i = 0; i < targets.length; i += 1) {
      if (queueRef.current.cancelled) break;
      while (queueRef.current.paused && !queueRef.current.cancelled) {
        await sleep(220);
      }
      if (queueRef.current.cancelled) break;
      setQueue((q) => (q ? { ...q, current: i + 1 } : q));
      setGenerationLog(`正在生成第 ${targets[i].index} 张（${i + 1}/${targets.length}）...`);
      const output = await generatePanel(targets[i]);
      if (!mountedRef.current || output.failureKind === "cancelled") break;
      if (output.ok) {
        generatedOutputs.set(targets[i].id, output);
        const currentAccount = await refreshAccount();
        const spent = anlasSpent(anlasBefore, currentAccount.anlasBalance);
        if (spent != null) setQueueAnlasSpent(spent);
      } else if (output.failureKind === "auth") {
        queueRef.current.cancelled = true;
        const message = `队列已停止：${output.message ?? "NovelAI Token 或 Image Endpoint 鉴权失败。"}`;
        setGenerationLog(message);
        setToast(message);
      }
      setQueue((q) => (q ? { ...q, done: i + 1 } : q));
    }
    if (!mountedRef.current) return;
    const finalAccount = await refreshAccount();
    const spent = anlasSpent(anlasBefore, finalAccount.anlasBalance);
    if (spent != null) setQueueAnlasSpent(spent);
    const cancelled = queueRef.current.cancelled;
    setQueue(null);
    const spentText = spent != null ? `实扣 ${spent} Anlas。` : "实扣读取失败，请刷新积分确认。";
    if (!cancelled && project.autoExportZip) {
      const exportTarget: ComicProject = {
        ...project,
        panels: project.panels.map((panel) => {
          const output = generatedOutputs.get(panel.id);
          return output
            ? { ...panel, status: "done", historyItemId: output.historyItemId, outputPath: output.outputPath, outputUrl: output.outputUrl }
            : panel;
        }),
      };
      const exported = await exportProjectZip(exportTarget);
      setGenerationLog(exported ? `队列已全部生成完成并导出 ZIP。${spentText}` : `队列已全部生成完成，但 ZIP 导出失败。${spentText}`);
    } else {
      setGenerationLog(cancelled ? `队列已取消。${spentText}` : `队列已全部生成完成。${spentText}`);
    }
  }

  async function quotePanelTargets(targets: ComicPanel[], quoteAccount = account) {
    const quoteCache = new Map<string, number>();
    const usableRefs = project.references.filter((ref) => ref.base64 && ref.useForGeneration !== false);
    const vibeKindCount = usableRefs.filter((ref) => ref.kind === "vibe").length;
    const preciseKindCount = usableRefs.length - vibeKindCount;
    let amount = 0;
    for (const panel of targets) {
      const params = mergePanelParams(project, panel);
      // Precise (director) references only bill on V4.5; on other models they
      // fall back to Vibe Transfer, so count them as vibe there.
      const supportsPrecise = params.model.includes("4-5");
      const vibeCount = supportsPrecise ? vibeKindCount : vibeKindCount + preciseKindCount;
      const preciseCount = supportsPrecise ? preciseKindCount : 0;
      const key = JSON.stringify({
        model: params.model,
        width: params.width,
        height: params.height,
        steps: params.steps,
        smea: params.smea,
        smeaDyn: params.smeaDyn,
        vibeCount,
        preciseCount,
      });
      let panelAmount = quoteCache.get(key);
      if (panelAmount == null) {
        const quote = await window.naiDesktop.quoteAnlas({
          feature: "generate",
          params: { ...params, stylePrompt: "", positivePrompt: "quote", negativePrompt: "" },
          extras: {
            vibeImages: Array.from({ length: vibeCount }, () => ({
              base64: "",
              infoExtracted: 0.7,
              strength: 0.5,
            })),
            charCaptions: [],
            preciseReferences: Array.from({ length: preciseCount }, () => ({
              base64: "",
              type: "character" as const,
              strength: 1,
              fidelity: 1,
            })),
          },
          batchCount: 1,
          account: quoteAccount,
        });
        if (!quote.ok || typeof quote.amount !== "number") {
          return { ok: false as const, amount: 0, message: `分镜 #${panel.index}：${quote.message}` };
        }
        panelAmount = quote.amount;
        quoteCache.set(key, panelAmount);
      }
      amount += panelAmount;
    }
    return { ok: true as const, amount, message: "" };
  }

  async function startQueue(targets: ComicPanel[]) {
    if (!targets.length) {
      setToast("没有可生成的分镜。");
      return;
    }
    const freshAccount = await window.naiDesktop.hasToken();
    if (!freshAccount.hasToken) {
      setToast("请先在设置中配置 NovelAI API Token。");
      await refreshAccount();
      return;
    }
    if (!settings?.imageBaseUrl?.trim()) {
      setToast("请先在设置中填写 NovelAI Image Endpoint。");
      return;
    }
    const emptyPrompt = targets.find((panel) => !(panel.enPrompt || panel.cnPrompt).trim());
    if (emptyPrompt) {
      setToast(`分镜 #${emptyPrompt.index} 缺少可用于生图的提示词。`);
      return;
    }
    const quoted = await quotePanelTargets(targets, freshAccount);
    if (!quoted.ok) {
      setToast(`无法读取生成前扣费：${quoted.message}`);
      return;
    }
    const totalQuote = quoted.amount;
    setQueueAnlasQuote(totalQuote);
    if (typeof freshAccount.anlasBalance === "number" && totalQuote > freshAccount.anlasBalance) {
      setToast(`漫画队列需要 ${totalQuote} Anlas，当前余额 ${freshAccount.anlasBalance} Anlas，已阻止执行。`);
      return;
    }
    const ok = window.confirm(
      `将按顺序生成 ${targets.length} 个分镜。\n` +
        `生成前扣费（本地估算，非 NovelAI 官方报价）：约 ${totalQuote} Anlas\n` +
        `当前余额：${freshAccount.anlasBalance ?? "未知"} Anlas\n` +
        `生成后会按 NovelAI 账户余额差显示实际扣费，以实际为准。\n\n是否继续？`,
    );
    if (!ok) return;
    void runQueue(targets, freshAccount.anlasBalance);
  }

  function addPanel(afterIndex?: number) {
    setProject((prev) => {
      const nextIndex = afterIndex ?? prev.panels.length;
      const next = [...prev.panels];
      next.splice(nextIndex, 0, {
        id: uid(),
        index: nextIndex + 1,
        cnPrompt: "新分镜描述",
        contextSummary: "",
        enPrompt: "",
        localNegativePrompt: "",
        negativeMode: "append",
        paramsOverride: { enabled: false, params: {} },
        status: "draft",
      });
      return { ...prev, panels: next.map((panel, index) => ({ ...panel, index: index + 1 })) };
    });
  }

  function removePanel(panelId: string) {
    setProject((prev) => ({
      ...prev,
      panels: prev.panels.filter((panel) => panel.id !== panelId).map((panel, index) => ({ ...panel, index: index + 1 })),
    }));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(panelId);
      return next;
    });
  }

  function markPanelImageUnavailable(panelId: string) {
    setProject((prev) => updatePanel(prev, panelId, (panel) => ({
      ...panel,
      status: "failed",
      historyItemId: undefined,
      outputPath: undefined,
      outputUrl: undefined,
      error: "本地成图文件不可读取，请重新生成本分镜。",
    })));
  }

  function toggleSelected(panelId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(panelId)) next.delete(panelId);
      else next.add(panelId);
      return next;
    });
  }

  return (
    <main ref={comicRootRef} className={clsx("comic-generator", step === "panels" && "comic-generator-panels")}>
      <div className="comic-page-title">
        <span className="eyebrow">工具 / 漫画生成器</span>
        <strong>{project.title || "未命名漫画项目"}</strong>
        <small>{panels.length} 分镜 · {convertedCount} 已转换 · {doneCount} 已出图 · {modeLabel(project.mode)}</small>
      </div>

      <nav className="comic-steps">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            className={clsx("comic-step-btn", step === s.key && "active")}
            onClick={() => setStep(s.key)}
          >
            <b>{i + 1}</b>
            <span>{s.label}</span>
            <small>{s.hint}</small>
          </button>
        ))}
      </nav>

      {step === "story" && (
        <div className="comic-step-actions">
          {onBack ? <Button onClick={onBack} variant="ghost">返回工具首页</Button> : null}
          <Button onClick={createNewProject} variant="ghost">新建项目</Button>
          <Button onClick={clearPanels} variant="ghost" disabled={!panels.length}>清空分镜</Button>
          <Button onClick={exportProjectJson} variant="ghost">另存项目 JSON</Button>
          <label className="comic-upload-btn">
            导入项目 JSON
            <input type="file" accept=".json,application/json" onChange={(event) => void importProjectJson(event.currentTarget.files?.[0] ?? null)} />
          </label>
        </div>
      )}

      {step === "story" && (
        <section className="comic-card">
          <div className="comic-section-title">
            <strong>第 1 步 · 导入故事</strong>
            <span>粘贴剧情，让 AI 拆出分镜与全局设定</span>
          </div>
          <label className="comic-field">
            <span>标题</span>
            <input value={project.title} onChange={(event) => patchProject({ title: event.target.value })} />
          </label>
          <div className="comic-api-info">
            <div><b>参考图反推</b><span>{settings?.visionApiModel || "未设置模型"} · {settings?.visionApiUrl || "未设置 API"}</span></div>
            <div><b>AI 拆分镜 / 分镜转换</b><span>{settings?.convertApiModel || "未设置模型"} · {settings?.convertApiUrl || "未设置 API"}</span></div>
            <div><b>最终生图</b><span>NovelAI API · {settings?.imageBaseUrl || "https://image.novelai.net"}</span></div>
          </div>
          <div className="comic-mode-row">
            <label>
              模板模式
              <select
                value={project.mode}
                onChange={(event) => patchProject({ mode: event.target.value as ReversePromptMode })}
              >
                <option value="natural">自然语言</option>
                <option value="tags">Danbooru 标签</option>
                <option value="mixed">混合</option>
              </select>
            </label>
            <label>
              目标分镜数量（0=自动）
              <NumberInput
                label=""
                value={typeof project.desiredPanelCount === "number" ? project.desiredPanelCount : 0}
                min={0}
                max={500}
                onChange={setDesiredPanelCount}
              />
            </label>
          </div>
          <details className="comic-template-preview">
            <summary>查看当前模板 · {modeLabel(project.mode)}</summary>
            <div>
              <strong>反推模板：{templateStatus("reverse").label}</strong>
              <pre>{templateStatus("reverse").text}</pre>
              <strong>转换模板：{templateStatus("convert").label}</strong>
              <pre>{templateStatus("convert").text}</pre>
              <strong>AI 拆分分镜模板：{templateStatus("comic").label}</strong>
              <pre>{templateStatus("comic").text}</pre>
            </div>
          </details>
          <label className="comic-field">
            <span>剧情 / 全局故事（可含分段说明，例如 1-7、8-15）</span>
            <textarea
              value={project.rawScript}
              onChange={(event) => patchProject({ rawScript: event.target.value, globalPrompt: event.target.value })}
            />
          </label>
          <div className="comic-story-references">
            <div className="comic-section-title">
              <strong>故事参考图</strong>
              <span>在拆分镜前上传，AI 会结合用户说明生成全局设定；这些图后续默认作为精准参考沿用到每张分镜。</span>
            </div>
            <div className="comic-mode-row">
              <label className="comic-upload-btn">
                上传角色 / 物品 / 场景参考图
                <input type="file" accept="image/*" multiple onChange={(event) => addReferences(event.target.files)} />
              </label>
              <Button onClick={foldReferencesIntoGlobal} variant="secondary">把已反推内容写入全局设定</Button>
            </div>
            <div className="comic-reference-list compact">
              {project.references.length === 0 && <p className="comic-empty">可选：上传角色、物品或场景图片，并说明它在故事中对应什么。</p>}
              {project.references.map((ref) => (
                <div className="comic-reference" key={`story-${ref.id}`}>
                  <img src={ref.previewUrl} alt="" />
                  <div>
                    <strong>{ref.name}</strong>
                    <div className="comic-reference-controls">
                      <label>
                        用途
                        <select
                          value={ref.kind}
                          onChange={(event) => setProject((prev) => updateReference(prev, ref.id, (item) => ({ ...item, kind: event.target.value as ComicReferenceKind })))}
                        >
                          {(["precise", "character", "scene", "object", "vibe"] as ComicReferenceKind[]).map((kind) => (
                            <option key={kind} value={kind}>{labelForKind(kind)}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        对应说明
                        <input
                          value={ref.subjectHint ?? ""}
                          placeholder="例如：这是主角变身后的角色 / 桌上的皮套盒"
                          onChange={(event) => setProject((prev) => updateReference(prev, ref.id, (item) => ({
                            ...item,
                            subjectHint: event.target.value,
                          })))}
                        />
                      </label>
                    </div>
                    <label className="checkbox-line comic-reference-generate-toggle">
                      <input
                        type="checkbox"
                        checked={ref.useForGeneration !== false}
                        onChange={(event) => setProject((prev) => updateReference(prev, ref.id, (item) => ({
                          ...item,
                          useForGeneration: event.target.checked,
                        })))}
                      />
                      <span>参与最终生图参考（关闭后仍保留说明和反推结果）</span>
                    </label>
                    <div className="comic-actions">
                      <Button onClick={() => reverseReference(ref)} disabled={busy === `reverse:${ref.id}`}>
                        {busy === `reverse:${ref.id}` ? "反推中..." : "反推参考图"}
                      </Button>
                      <Button variant="danger" onClick={() => setProject((prev) => ({ ...prev, references: prev.references.filter((item) => item.id !== ref.id) }))}>删除</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="comic-actions">
            <Button onClick={analyzeScript} disabled={busy === "analyze"} variant="primary">
              {busy === "analyze" ? "拆分中..." : "AI 拆分分镜 →"}
            </Button>
            <span className="comic-empty">拆分后会自动跳到「全局设定」。</span>
          </div>
        </section>
      )}

      {step === "global" && (
        <section className="comic-card">
          <div className="comic-section-title">
            <strong>第 2 步 · 全局设定</strong>
            <div className="comic-actions">
              <span>所有分镜共享</span>
              <Button onClick={syncCurrentParams} variant="ghost">同步当前生图参数</Button>
            </div>
          </div>
          <label className="comic-field">
            <span>全局角色设定（角色/皮套/限制等，会参与每个分镜转换）</span>
            <textarea
              value={project.globalCharacterSetting}
              onChange={(event) => patchProject({ globalCharacterSetting: event.target.value })}
            />
          </label>
          <label className="comic-field">
            <span>全局风格提示词（拼接到每张正面提示词最前）</span>
            <textarea
              value={project.globalStylePrompt}
              onChange={(event) => patchProject({ globalStylePrompt: event.target.value })}
            />
          </label>
          <label className="comic-field">
            <span>全局负面提示词</span>
            <textarea
              value={project.globalNegativePrompt}
              onChange={(event) => patchProject({ globalNegativePrompt: event.target.value })}
            />
          </label>
          <label className="comic-field">
            <span>模型</span>
            <select value={project.globalParams.model} onChange={(event) => patchGlobalParam("model", event.target.value as NAIModel)}>
              {NAI_MODELS.map((model) => (
                <option key={model.value} value={model.value}>{model.label}</option>
              ))}
            </select>
          </label>
          <button type="button" className="comic-disclosure" onClick={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? "▾ 收起高级参数" : "▸ 展开高级参数（尺寸 / 步数 / 采样器 / 开关）"}
          </button>
          {showAdvanced && (
            <>
              <div className="comic-param-grid">
                <NumberInput label="宽度" value={project.globalParams.width} min={64} max={1600} step={64} onChange={(v) => patchGlobalParam("width", v)} />
                <NumberInput label="高度" value={project.globalParams.height} min={64} max={1600} step={64} onChange={(v) => patchGlobalParam("height", v)} />
                <NumberInput label="步数" value={project.globalParams.steps} min={1} max={50} onChange={(v) => patchGlobalParam("steps", v)} />
                <NumberInput label="CFG" value={project.globalParams.cfgScale} min={1} max={10} step={0.5} onChange={(v) => patchGlobalParam("cfgScale", v)} />
              </div>
              <label className="comic-field">
                <span>采样器</span>
                <select value={project.globalParams.sampler} onChange={(event) => patchGlobalParam("sampler", event.target.value as NAISampler)}>
                  {NAI_SAMPLERS.map((sampler) => (
                    <option key={sampler.value} value={sampler.value}>{sampler.label}</option>
                  ))}
                </select>
              </label>
              <label className="comic-field">
                <span>UC 预设</span>
                <select value={project.globalParams.ucPreset} onChange={(event) => patchGlobalParam("ucPreset", Number(event.target.value) as UcPreset)}>
                  {NAI_UC_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value}>{preset.label}</option>
                  ))}
                </select>
              </label>
              <div className="comic-toggle-row">
                <Toggle checked={project.globalParams.qualityToggle} onChange={(v) => patchGlobalParam("qualityToggle", v)} label="Quality Tags" description="使用 NovelAI 质量词增强。" />
                <Toggle checked={project.globalParams.variety} onChange={(v) => patchGlobalParam("variety", v)} label="Variety+" description="开启多样化采样。" />
                <Toggle checked={project.globalParams.smea} onChange={(v) => patchGlobalParam("smea", v)} label="SMEA" description="高分辨率优化（V3）。" />
                <Toggle checked={project.globalParams.smeaDyn} onChange={(v) => patchGlobalParam("smeaDyn", v)} label="SMEA Dyn" description="动态 SMEA（V3）。" />
              </div>
            </>
          )}
        </section>
      )}

      {step === "panels" && (
        <section className="comic-card comic-panels-card">
          <div className="comic-section-title">
            <strong>第 3 步 · 分镜</strong>
            <span>{selectedIds.size ? `已选 ${selectedIds.size}` : "未选择时作用于全部"}</span>
          </div>
          <div className="comic-mode-row">
            <div className="comic-inline-help">
              分镜转换沿用第 1 步模板模式：<b>{modeLabel(project.mode)}</b>。这样全局反推、拆分镜和转换不会互相打架。
            </div>
            <Button onClick={() => convertPanels()} disabled={busy === "convert"} variant="primary">
              {busy === "convert" ? "转换中..." : selectedIds.size ? "转换选中" : "转换全部"}
            </Button>
            <Button onClick={() => void checkConsistency()} disabled={busy === "consistency"}>
              {busy === "consistency" ? "检测中..." : "AI 一致性检测"}
            </Button>
            <Button onClick={() => addPanel()}>新增分镜</Button>
            <Button onClick={() => setSelectedIds(new Set(panels.map((panel) => panel.id)))}>全选</Button>
            <Button onClick={() => setSelectedIds(new Set())}>清空选择</Button>
          </div>
          {activePanel && (
            <div className="comic-panel-workspace">
              <aside className="comic-panel-sidebar">
                {panels.map((panel) => (
                  <button
                    key={panel.id}
                    type="button"
                    className={clsx("comic-panel-nav-item", activePanel.id === panel.id && "active", selectedIds.has(panel.id) && "selected")}
                    onClick={() => setActivePanelId(panel.id)}
                  >
                    <span>#{panel.index}</span>
                    <small>{labelForPanelStatus(panel.status)}</small>
                  </button>
                ))}
              </aside>
              <article className="comic-panel-editor">
                <header>
                  <label className="comic-check">
                    <input type="checkbox" checked={selectedIds.has(activePanel.id)} onChange={() => toggleSelected(activePanel.id)} />
                    <strong>分镜 #{activePanel.index}</strong>
                  </label>
                  <span className={clsx("comic-status", activePanel.status)}>{labelForPanelStatus(activePanel.status)}</span>
                  <div className="comic-actions">
                    <Button onClick={() => convertPanels([activePanel])} disabled={busy === "convert"}>转换本张</Button>
                    <Button onClick={() => void startQueue([activePanel])} disabled={Boolean(busy) || queueRunning} variant="primary">
                      {busy === `generate:${activePanel.id}` ? "生成中..." : "生成本张"}
                    </Button>
                    <Button onClick={() => addPanel(activePanel.index)}>插入</Button>
                    <Button variant="danger" onClick={() => removePanel(activePanel.id)}>删除</Button>
                  </div>
                </header>
                <div className="comic-panel-editor-tabs" role="tablist" aria-label="分镜编辑视图">
                  <button type="button" className={panelEditorTab === "content" ? "active" : ""} onClick={() => setPanelEditorTab("content")}>分镜内容</button>
                  <button type="button" className={panelEditorTab === "params" ? "active" : ""} onClick={() => setPanelEditorTab("params")}>独立参数</button>
                  <button type="button" className={panelEditorTab === "weights" ? "active" : ""} onClick={() => setPanelEditorTab("weights")}>提示词权重</button>
                </div>
                <div className="comic-panel-editor-body">
                  {activePanel.error ? <div className="comic-panel-error">{activePanel.error}</div> : null}
                  {panelEditorTab === "content" ? (
                    <>
                      {activePanel.outputUrl ? (
                        <div className="comic-panel-result">
                          <img
                            src={activePanel.outputUrl}
                            alt={`分镜 #${activePanel.index} 生成结果`}
                            draggable
                            title="可拖出到桌面 / 其他程序"
                            onDragStart={(e) => {
                              e.preventDefault();
                              if (activePanel.outputUrl) window.naiDesktop.startImageDrag(activePanel.outputUrl);
                            }}
                            onError={() => markPanelImageUnavailable(activePanel.id)}
                          />
                          <div><strong>分镜 #{activePanel.index} 成图</strong><span>重新生成会替换本分镜当前成图记录。</span></div>
                        </div>
                      ) : <div className="comic-panel-no-result">本分镜尚未生成图片</div>}
                      <div className="comic-panel-grid">
                        <div className="comic-field">
                          <div className="comic-field-heading">
                            <span>中文分镜描述</span>
                            <Button variant="ghost" onClick={() => void translatePanelText(activePanel, "to-en")} disabled={Boolean(translatingPanel)}>
                              {translatingPanel === `${activePanel.id}:to-en` ? "翻译中..." : "直译英文"}
                            </Button>
                          </div>
                          <textarea value={activePanel.cnPrompt} onChange={(event) => setProject((prev) => updatePanel(prev, activePanel.id, (old) => ({ ...old, cnPrompt: event.target.value })))} />
                        </div>
                        <div className="comic-field">
                          <div className="comic-field-heading">
                            <span>英文生图提示词</span>
                            <Button variant="ghost" onClick={() => void translatePanelText(activePanel, "to-zh")} disabled={Boolean(translatingPanel)}>
                              {translatingPanel === `${activePanel.id}:to-zh` ? "翻译中..." : "回译中文"}
                            </Button>
                          </div>
                          <textarea value={activePanel.enPrompt} onChange={(event) => setProject((prev) => updatePanel(prev, activePanel.id, (old) => ({ ...old, enPrompt: event.target.value, status: "converted" })))} />
                        </div>
                      </div>
                      <div className="comic-panel-negative-row">
                        <label className="comic-field"><span>本分镜负面提示词</span><textarea value={activePanel.localNegativePrompt} placeholder="留空则只使用全局负面提示词" onChange={(event) => setProject((prev) => updatePanel(prev, activePanel.id, (old) => ({ ...old, localNegativePrompt: event.target.value })))} /></label>
                        <label className="comic-field"><span>负面词组合方式</span><select value={activePanel.negativeMode} onChange={(event) => setProject((prev) => updatePanel(prev, activePanel.id, (old) => ({ ...old, negativeMode: event.target.value as ComicPanel["negativeMode"] })))}><option value="append">追加到全局负面词</option><option value="override">覆盖全局负面词</option></select></label>
                      </div>
                    </>
                  ) : null}
                  {panelEditorTab === "params" ? (
                    <section className="comic-panel-params">
                      <Toggle checked={activePanel.paramsOverride.enabled} onChange={(enabled) => setProject((prev) => updatePanel(prev, activePanel.id, (old) => ({ ...old, paramsOverride: { ...old.paramsOverride, enabled } })))} label="本分镜独立生图参数" description="开启后只覆盖当前分镜；关闭时继续使用第 2 步全局参数。" />
                      {activePanel.paramsOverride.enabled ? (
                        <div className="comic-panel-param-controls">
                          <label className="comic-field"><span>模型</span><select value={activePanel.paramsOverride.params.model ?? project.globalParams.model} onChange={(event) => patchPanelParam(activePanel.id, "model", event.target.value as NAIModel)}>{NAI_MODELS.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}</select></label>
                          <label className="comic-field"><span>采样器</span><select value={activePanel.paramsOverride.params.sampler ?? project.globalParams.sampler} onChange={(event) => patchPanelParam(activePanel.id, "sampler", event.target.value as NAISampler)}>{NAI_SAMPLERS.map((sampler) => <option key={sampler.value} value={sampler.value}>{sampler.label}</option>)}</select></label>
                          <NumberInput label="宽度" value={activePanel.paramsOverride.params.width ?? project.globalParams.width} min={64} max={1600} step={64} onChange={(value) => patchPanelParam(activePanel.id, "width", value)} />
                          <NumberInput label="高度" value={activePanel.paramsOverride.params.height ?? project.globalParams.height} min={64} max={1600} step={64} onChange={(value) => patchPanelParam(activePanel.id, "height", value)} />
                          <NumberInput label="步数" value={activePanel.paramsOverride.params.steps ?? project.globalParams.steps} min={1} max={50} onChange={(value) => patchPanelParam(activePanel.id, "steps", value)} />
                          <NumberInput label="提示词引导" value={activePanel.paramsOverride.params.cfgScale ?? project.globalParams.cfgScale} min={1} max={10} step={0.1} onChange={(value) => patchPanelParam(activePanel.id, "cfgScale", value)} />
                          <NumberInput label="CFG Rescale" value={activePanel.paramsOverride.params.cfgRescale ?? project.globalParams.cfgRescale} min={0} max={1} step={0.01} onChange={(value) => patchPanelParam(activePanel.id, "cfgRescale", value)} />
                          <NumberInput label="种子（0=随机）" value={activePanel.paramsOverride.params.seed ?? project.globalParams.seed} min={0} max={4294967295} onChange={(value) => patchPanelParam(activePanel.id, "seed", value)} />
                          <label className="comic-field"><span>负面预设</span><select value={activePanel.paramsOverride.params.ucPreset ?? project.globalParams.ucPreset} onChange={(event) => patchPanelParam(activePanel.id, "ucPreset", Number(event.target.value) as UcPreset)}>{NAI_UC_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}</select></label>
                          <div className="comic-panel-param-toggles">
                            <Toggle checked={activePanel.paramsOverride.params.qualityToggle ?? project.globalParams.qualityToggle} onChange={(value) => patchPanelParam(activePanel.id, "qualityToggle", value)} label="Quality Tags" description="质量词增强" />
                            <Toggle checked={activePanel.paramsOverride.params.variety ?? project.globalParams.variety} onChange={(value) => patchPanelParam(activePanel.id, "variety", value)} label="Variety+" description="增加采样多样性" />
                            <Toggle checked={activePanel.paramsOverride.params.smea ?? project.globalParams.smea} onChange={(value) => patchPanelParam(activePanel.id, "smea", value)} label="SMEA" description="V3 高分辨率优化" />
                            <Toggle checked={activePanel.paramsOverride.params.smeaDyn ?? project.globalParams.smeaDyn} onChange={(value) => patchPanelParam(activePanel.id, "smeaDyn", value)} label="SMEA Dyn" description="V3 动态优化" />
                          </div>
                        </div>
                      ) : <p className="comic-empty">当前分镜正在使用第 2 步的全局生图参数。</p>}
                    </section>
                  ) : null}
                  {panelEditorTab === "weights" ? (
                    activePanelTags.length > 0 ? (
                      <div className="comic-weight-tags">
                        {activePanelTags.map((tag, index) => {
                          const parsed = parseWeightedTag(tag);
                          return (
                            <span className="comic-weight-tag" key={`${activePanel.id}-${index}-${tag}`}>
                              <b>{parsed.core}</b>
                              <small>{formatMultiplier(parsed.level) || "x1.00"}</small>
                              <button onClick={() => setProject((prev) => updatePanel(prev, activePanel.id, (old) => setPanelTagLevel(old, index, parsed.level + 1)))}>+</button>
                              <button onClick={() => setProject((prev) => updatePanel(prev, activePanel.id, (old) => setPanelTagLevel(old, index, parsed.level - 1)))}>-</button>
                              <button onClick={() => setProject((prev) => updatePanel(prev, activePanel.id, (old) => setPanelTagLevel(old, index, 0)))}>重置</button>
                            </span>
                          );
                        })}
                      </div>
                    ) : <p className="comic-empty">当前英文提示词没有可调整的标签。</p>
                  ) : null}
                </div>
              </article>
            </div>
          )}
        </section>
      )}

      {step === "generate" && (
        <section className="comic-card">
          <div className="comic-section-title">
            <strong>第 4 步 · 队列出图</strong>
            <span>{convertedCount}/{panels.length} 已转换</span>
          </div>
          <div className="comic-cost-row">
            <div className="comic-cost-card">
              <strong>{account.anlasBalance ?? "未知"}</strong>
              <span>当前余额</span>
            </div>
            <div className="comic-cost-card">
              <strong>{queueQuoteLoading ? "报价中" : queueAnlasQuote != null ? queueAnlasQuote : "不可用"}</strong>
              <span>{quoteTargetLabel} · 生成前将扣 Anlas</span>
            </div>
            <div className="comic-cost-card">
              <strong>{queueAnlasSpent != null ? queueAnlasSpent : "等待"}</strong>
              <span>本次已实扣 Anlas</span>
            </div>
            <div className="comic-cost-card">
              <strong>{doneCount}/{panels.length}</strong>
              <span>已完成分镜</span>
            </div>
          </div>

          {!queueRunning ? (
            <>
              <div className="comic-toggle-row" style={{ marginBottom: 12 }}>
                <Toggle
                  checked={project.autoExportZip}
                  onChange={(value) => patchProject({ autoExportZip: value })}
                  label="生成全部后自动导出 ZIP"
                  description="ZIP 包含已生成图片、project.json 和 prompts.md。"
                />
              </div>
              <div className="comic-actions" style={{ marginTop: 4 }}>
                <Button onClick={() => void startQueue(ungeneratedPanels)} variant="primary" disabled={!ungeneratedPanels.length}>
                  生成全部未生成（{ungeneratedPanels.length}）
                </Button>
                <Button onClick={() => void startQueue(explicitlySelectedPanels)} disabled={!explicitlySelectedPanels.length}>
                  生成 / 重试选中（{explicitlySelectedPanels.length}）
                </Button>
                <Button onClick={() => setSelectedIds(new Set(panels.map((panel) => panel.id)))}>全选</Button>
                <Button onClick={() => setSelectedIds(new Set())} disabled={!selectedIds.size}>清空选择</Button>
                <Button onClick={() => void exportProjectZip()} disabled={!doneCount || busy === "exportZip"}>
                  {busy === "exportZip" ? "导出中..." : "导出已生成 ZIP"}
                </Button>
                <span className="comic-empty">勾选已有成图后仍可重新生成；未转换分镜会回退使用中文描述。</span>
              </div>
              {queueQuoteError ? <div className="comic-quote-error">报价失败：{queueQuoteError}</div> : null}
            </>
          ) : (
            <div className="comic-queue">
              <div className="comic-progress">
                <div
                  className="comic-progress-fill"
                  style={{ width: `${queue ? Math.round((queue.done / Math.max(1, queue.total)) * 100) : 0}%` }}
                />
              </div>
              <div className="comic-queue-status">
                {queue?.paused ? "已暂停" : "生成中"} · {queue?.done}/{queue?.total}
              </div>
              <div className="comic-queue-controls">
                {queue?.paused ? (
                  <Button
                    onClick={() => {
                      queueRef.current.paused = false;
                      setQueue((q) => (q ? { ...q, paused: false } : q));
                    }}
                    variant="primary"
                  >
                    继续
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      queueRef.current.paused = true;
                      setQueue((q) => (q ? { ...q, paused: true } : q));
                    }}
                  >
                    暂停
                  </Button>
                )}
                <Button
                  variant="danger"
                  onClick={() => {
                    queueRef.current.cancelled = true;
                    queueRef.current.paused = false;
                    // Abort the panel that is mid-flight, not just the queue —
                    // otherwise the current paid request keeps running and bills.
                    void window.naiDesktop.cancel();
                  }}
                >
                  取消
                </Button>
              </div>
            </div>
          )}

          <div className="comic-thumbs">
            {panels.map((panel) => (
              <div className={clsx("comic-thumb", panel.status, selectedIds.has(panel.id) && "selected")} key={panel.id} title={panel.error || panel.cnPrompt}>
                <label className="comic-thumb-select">
                  <input type="checkbox" checked={selectedIds.has(panel.id)} onChange={() => toggleSelected(panel.id)} />
                  <span>选择 #{panel.index}</span>
                </label>
                {panel.outputUrl ? (
                  <img src={panel.outputUrl} alt={`#${panel.index}`} onError={() => markPanelImageUnavailable(panel.id)} />
                ) : (
                  <div className="comic-thumb-empty">#{panel.index}</div>
                )}
                <span>#{panel.index}</span>
                <Button
                  variant={panel.outputUrl ? "secondary" : panel.status === "failed" ? "danger" : "secondary"}
                  onClick={() => void startQueue([panel])}
                  disabled={queueRunning}
                >
                  {panel.outputUrl ? "重新生成" : panel.status === "failed" ? "重试" : "生成"}
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {generationLog && <div className="comic-log">{generationLog}</div>}
    </main>
  );
}
