import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Button, NumberInput, Toggle } from "./components/ui";
import {
  desktopUiFormat,
  desktopUiText,
  getToolsHubText,
  localizedDesktopOptionLabel,
} from "./i18n";
import { useAppStore } from "./store";
import {
  buildBatchRedrawRequest,
  clearBatchRedrawItemResult,
  resetInterruptedBatchItem,
  shouldStopBatchRedraw,
} from "./batch-redraw-queue";
import { NovelTuiwenStudio } from "./tuiwen/NovelTuiwenStudio";
import AitagGallery from "./AitagGallery";
import ArtistLab from "./ArtistLab";
import { TagComicGenerator } from "./comic/TagComicGenerator";
import ReferencePresetManager, { referencePresetTextFor } from "./ReferencePresetManager";
import {
  createDefaultBatchRedraw,
  NAI_MODELS,
  NAI_SAMPLERS,
  NAI_UC_PRESETS,
  type BatchExportFile,
  type BatchRedrawItem,
  type BatchRedrawProject,
  type GenerateParams,
  type NAIModel,
  type NAISampler,
  type PreciseReferenceItem,
  type ReversePromptMode,
  type UcPreset,
  type VibeTransferItem,
} from "./types";

const REDRAW_STEPS = [
  {
    key: "import",
    labelKey: "batch.step.import",
    hintKey: "batch.step.importHint",
  },
  {
    key: "params",
    labelKey: "batch.step.params",
    hintKey: "batch.step.paramsHint",
  },
  {
    key: "prompts",
    labelKey: "batch.step.prompts",
    hintKey: "batch.step.promptsHint",
  },
  {
    key: "generate",
    labelKey: "batch.step.generate",
    hintKey: "batch.step.generateHint",
  },
] as const;

const PromptCodex = lazy(() => import("./PromptCodex"));

function promptCodexCardText(language: unknown) {
  const text = {
    "zh-CN": ["所长 NovelAI 个人法典", "三套法典离线收录、原章节与统一分类检索、提示词一键复制，并可手动更新。"],
    "zh-TW": ["所長 NovelAI 個人法典", "三套法典離線收錄、原章節與統一分類搜尋、提示詞一鍵複製，並可手動更新。"],
    "en-US": ["NovelAI Personal Codex", "Three offline codices with section/category search, one-click copy, and manual updates."],
    "ja-JP": ["NovelAI 個人プロンプト法典", "3冊をオフライン収録。章・分類検索、ワンクリックコピー、手動更新に対応。"],
    "ko-KR": ["NovelAI 개인 프롬프트 법전", "세 법전을 오프라인 제공하며 장·분류 검색, 원클릭 복사, 수동 업데이트를 지원합니다."],
  } as const;
  const [title, desc] =
    text[
      typeof language === "string" && language in text
        ? (language as keyof typeof text)
        : "zh-CN"
    ];
  return { title, desc };
}

export function ToolsHub() {
  const language = useAppStore((state) => state.settings?.language);
  const text = useMemo(() => getToolsHubText(language), [language]);
  const codexText = useMemo(
    () => promptCodexCardText(language),
    [language],
  );
  const referencePresetText = useMemo(
    () => referencePresetTextFor(language),
    [language],
  );
  const isWindows = window.naiDesktop.platform === "win32";
  const [activeTool, setActiveTool] = useState<
    "hub" | "comic" | "redraw" | "tuiwen" | "aitag" | "artistLab" | "promptCodex" | "referencePresets"
  >(() => {
    const saved = localStorage.getItem("langbai.tools.active.v1");
    return saved === "comic" ||
      saved === "redraw" ||
      saved === "tuiwen" ||
      saved === "aitag" ||
      saved === "promptCodex" ||
      saved === "referencePresets" ||
      (saved === "artistLab" && isWindows)
      ? saved
      : "hub";
  });
  useEffect(() => {
    localStorage.setItem("langbai.tools.active.v1", activeTool);
  }, [activeTool]);
  if (activeTool === "comic")
    return <TagComicGenerator onBack={() => setActiveTool("hub")} />;
  if (activeTool === "redraw")
    return <BatchRedraw onBack={() => setActiveTool("hub")} />;
  if (activeTool === "tuiwen")
    return <NovelTuiwenStudio onBack={() => setActiveTool("hub")} />;
  if (activeTool === "aitag")
    return <AitagGallery onBack={() => setActiveTool("hub")} />;
  if (activeTool === "promptCodex")
    return (
      <Suspense
        fallback={
          <main className="tools-hub">
            <section className="tools-hero">
              <h2>{codexText.title}</h2>
            </section>
          </main>
        }
      >
        <PromptCodex onBack={() => setActiveTool("hub")} />
      </Suspense>
    );
  if (activeTool === "referencePresets")
    return <ReferencePresetManager onBack={() => setActiveTool("hub")} />;
  if (activeTool === "artistLab" && isWindows)
    return <ArtistLab onBack={() => setActiveTool("hub")} />;

  return (
    <main className="tools-hub">
      <section className="tools-hero">
        <div>
          <span className="eyebrow">{text.eyebrow}</span>
          <h2>{text.title}</h2>
          <p>{text.subtitle}</p>
        </div>
      </section>
      <section className="tool-card-grid">
        <button
          type="button"
          className="tool-card ready"
          onClick={() => setActiveTool("comic")}
        >
          <b>{text.comicTitle}</b>
          <span>{text.comicDesc}</span>
          <small>{text.ready}</small>
        </button>
        <button
          type="button"
          className="tool-card ready"
          onClick={() => setActiveTool("referencePresets")}
        >
          <b>{referencePresetText.title}</b>
          <span>{referencePresetText.subtitle}</span>
          <small>{text.ready}</small>
        </button>
        <button
          type="button"
          className="tool-card ready"
          onClick={() => setActiveTool("promptCodex")}
        >
          <b>{codexText.title}</b>
          <span>{codexText.desc}</span>
          <small>{text.ready}</small>
        </button>
        <button
          type="button"
          className="tool-card ready"
          onClick={() => setActiveTool("redraw")}
        >
          <b>{text.batchTitle}</b>
          <span>{text.batchDesc}</span>
          <small>{text.ready}</small>
        </button>
        <button
          type="button"
          className="tool-card ready"
          onClick={() => setActiveTool("tuiwen")}
        >
          <b>{text.tuiwenTitle}</b>
          <span>{text.tuiwenDesc}</span>
          <small>{text.foundation}</small>
        </button>
        <button
          type="button"
          className="tool-card ready"
          onClick={() => setActiveTool("aitag")}
        >
          <b>{text.aitagTitle}</b>
          <span>{text.aitagDesc}</span>
          <small>{text.ready}</small>
        </button>
        {isWindows && (
          <button
            type="button"
            className="tool-card ready"
            onClick={() => setActiveTool("artistLab")}
          >
            <b>{text.artistLabTitle}</b>
            <span>{text.artistLabDesc}</span>
            <small>{text.ready}</small>
          </button>
        )}
      </section>
    </main>
  );
}

function uid() {
  return (
    crypto.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
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

const dataUrlCache = new Map<string, string>();

function dataUrlFromBase64(base64: string) {
  if (base64.startsWith("data:")) return base64;
  const cached = dataUrlCache.get(base64);
  if (cached) return cached;
  const url = `data:image/png;base64,${base64}`;
  if (dataUrlCache.size > 300) dataUrlCache.clear();
  dataUrlCache.set(base64, url);
  return url;
}

// ── 批量图生图 (batch img2img) ────────────────────────────────────────────────
// The whole project lives in the store (state.batchRedraw) so switching tools or
// tabs never loses imported images / prompts / params / references. 导出/导入项目
// give durable file-based save-restore (localStorage would overflow on many imgs).

const LEGACY_BATCH_GROUP_NAME = "批量图生图";

function useBatchLocale() {
  const language = useAppStore((state) => state.settings?.language);
  return {
    language,
    t: (key: string) => desktopUiText(language, key),
    f: (key: string, values: Record<string, unknown>) =>
      desktopUiFormat(language, key, values),
  };
}

function localizedBatchGroupName(name: string, t: (key: string) => string) {
  const trimmed = name.trim();
  return trimmed === LEGACY_BATCH_GROUP_NAME
    ? t("batch.projectDefaultName")
    : trimmed;
}

// normalizeBatchItem's only caller is importProject (a raw file picker read),
// so this is untrusted input by construction. SECURITY: never trust
// resultPath/resultUrl/historyItemId/a "done" status from an imported file —
// those describe THIS machine's own prior output, and accepting them from an
// imported JSON would let a crafted project claim an arbitrary local path is
// a finished result (later readable via ZIP export). Every imported item
// starts fresh at "pending" with no result reference.
function normalizeBatchItem(
  raw: Partial<BatchRedrawItem>,
  index: number,
): BatchRedrawItem {
  return {
    id: raw.id ?? uid(),
    name: String(raw.name ?? `image_${index + 1}`),
    base64: String(raw.base64 ?? ""),
    prompt: String(raw.prompt ?? ""),
    strength: raw.strength == null ? null : Number(raw.strength),
    overrideParams: Boolean(raw.overrideParams),
    params: raw.params ?? {},
    status: "pending",
    resultUrl: undefined,
    resultPath: undefined,
    historyItemId: undefined,
  };
}

function normalizeBatchProject(
  parsed: unknown,
  fallback: BatchRedrawProject,
): BatchRedrawProject {
  if (!parsed || typeof parsed !== "object") return fallback;
  const p = parsed as Partial<BatchRedrawProject>;
  return {
    ...fallback,
    ...p,
    globalParams: { ...fallback.globalParams, ...(p.globalParams ?? {}) },
    items: Array.isArray(p.items)
      ? p.items
          .map((it, i) => normalizeBatchItem(it, i))
          .filter((it) => it.base64)
      : [],
    preciseReferences: Array.isArray(p.preciseReferences)
      ? p.preciseReferences
      : [],
    vibeImages: Array.isArray(p.vibeImages) ? p.vibeImages : [],
    seededFromMain: true,
  };
}

function BatchStatusBadge({ status }: { status: BatchRedrawItem["status"] }) {
  const { t } = useBatchLocale();
  if (status === "done")
    return <span className="redraw-badge done">{t("batch.status.done")}</span>;
  if (status === "generating")
    return (
      <span className="redraw-badge run">{t("batch.status.generating")}</span>
    );
  if (status === "failed")
    return (
      <span className="redraw-badge fail">{t("batch.status.failed")}</span>
    );
  return null;
}

// Reusable parameter editor — drives both the global params and per-image overrides.
function BatchParamFields({
  value,
  onPatch,
}: {
  value: GenerateParams;
  onPatch: (patch: Partial<GenerateParams>) => void;
}) {
  const { language, t } = useBatchLocale();
  const SIZE_PRESETS = [
    { label: t("batch.size.portrait"), w: 832, h: 1216 },
    { label: t("batch.size.square"), w: 1024, h: 1024 },
    { label: t("batch.size.landscape"), w: 1216, h: 832 },
    { label: t("batch.size.tall"), w: 1024, h: 1536 },
    { label: t("batch.size.wide"), w: 1536, h: 1024 },
    { label: t("batch.size.largeSquare"), w: 1472, h: 1472 },
  ];
  return (
    <div className="batch-params">
      <div className="batch-size-presets">
        {SIZE_PRESETS.map((s) => (
          <button
            type="button"
            key={s.label}
            className={clsx(
              "batch-chip",
              value.width === s.w && value.height === s.h && "active",
            )}
            onClick={() => onPatch({ width: s.w, height: s.h })}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="comic-panel-param-controls">
        <label className="comic-field">
          <span>{t("batch.param.model")}</span>
          <select
            value={value.model}
            onChange={(e) => onPatch({ model: e.target.value as NAIModel })}
          >
            {NAI_MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {localizedDesktopOptionLabel(language, m.value, m.label)}
              </option>
            ))}
          </select>
        </label>
        <label className="comic-field">
          <span>{t("batch.param.sampler")}</span>
          <select
            value={value.sampler}
            onChange={(e) => onPatch({ sampler: e.target.value as NAISampler })}
          >
            {NAI_SAMPLERS.map((s) => (
              <option key={s.value} value={s.value}>
                {localizedDesktopOptionLabel(language, s.value, s.label)}
              </option>
            ))}
          </select>
        </label>
        <NumberInput
          label={t("batch.param.width")}
          value={value.width}
          min={64}
          max={1600}
          step={64}
          onChange={(v) => onPatch({ width: v })}
        />
        <NumberInput
          label={t("batch.param.height")}
          value={value.height}
          min={64}
          max={1600}
          step={64}
          onChange={(v) => onPatch({ height: v })}
        />
        <NumberInput
          label={t("batch.param.steps")}
          value={value.steps}
          min={1}
          max={50}
          onChange={(v) => onPatch({ steps: v })}
        />
        <NumberInput
          label={t("batch.param.cfg")}
          value={value.cfgScale}
          min={1}
          max={10}
          step={0.1}
          onChange={(v) => onPatch({ cfgScale: v })}
        />
        <NumberInput
          label="CFG Rescale"
          value={value.cfgRescale}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => onPatch({ cfgRescale: v })}
        />
        <label className="comic-field">
          <span>{t("batch.param.noiseSchedule")}</span>
          <select
            value={value.noiseSchedule}
            onChange={(e) => onPatch({ noiseSchedule: e.target.value })}
          >
            <option value="native">
              {localizedDesktopOptionLabel(language, "native", "Native")}
            </option>
            <option value="karras">
              {localizedDesktopOptionLabel(language, "karras", "Karras")}
            </option>
            <option value="exponential">
              {localizedDesktopOptionLabel(
                language,
                "exponential",
                "Exponential",
              )}
            </option>
          </select>
        </label>
        <NumberInput
          label={t("batch.param.seed")}
          value={value.seed}
          min={0}
          max={4294967295}
          onChange={(v) =>
            onPatch({ seed: v, seedMode: v > 0 ? "fixed" : "random" })
          }
        />
        <label className="comic-field">
          <span>{t("batch.param.ucPreset")}</span>
          <select
            value={value.ucPreset}
            onChange={(e) =>
              onPatch({ ucPreset: Number(e.target.value) as UcPreset })
            }
          >
            {NAI_UC_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {localizedDesktopOptionLabel(language, p.value, p.label)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="comic-panel-param-toggles">
        <Toggle
          checked={value.qualityToggle}
          onChange={(v) => onPatch({ qualityToggle: v })}
          label="Quality Tags"
          description={t("batch.param.qualityDesc")}
        />
        <Toggle
          checked={value.variety}
          onChange={(v) => onPatch({ variety: v })}
          label="Variety+"
          description={t("batch.param.varietyDesc")}
        />
        <Toggle
          checked={value.smea}
          onChange={(v) => onPatch({ smea: v })}
          label="SMEA"
          description={t("batch.param.smeaDesc")}
        />
        <Toggle
          checked={value.smeaDyn}
          onChange={(v) => onPatch({ smeaDyn: v })}
          label="SMEA Dyn"
          description={t("batch.param.smeaDynDesc")}
        />
      </div>
    </div>
  );
}

function BatchPrecisePicker({
  refs,
  onChange,
}: {
  refs: PreciseReferenceItem[];
  onChange: (next: PreciseReferenceItem[]) => void;
}) {
  const { t } = useBatchLocale();
  async function add(files: FileList | null) {
    if (!files) return;
    const next = [...refs];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      next.push({
        base64: await toBase64(f),
        type: "character",
        strength: 1,
        fidelity: 1,
        informationExtracted: 1,
      });
    }
    onChange(next);
  }
  return (
    <div className="batch-ref-block">
      <div className="batch-ref-head">
        <span>{t("batch.ref.preciseTitle")}</span>
        <label className="btn btn-secondary btn-sm">
          {t("batch.ref.add")}
          <input
            type="file"
            hidden
            multiple
            accept="image/*"
            onChange={(e) => {
              void add(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {refs.length === 0 ? (
        <p className="settings-hint" style={{ margin: 0 }}>
          {t("batch.ref.preciseEmpty")}
        </p>
      ) : (
        <div className="batch-ref-list">
          {refs.map((r, i) => (
            <div className="batch-ref-row" key={i}>
              <img src={dataUrlFromBase64(r.base64)} alt={`precise-${i}`} />
              <select
                value={r.type}
                onChange={(e) =>
                  onChange(
                    refs.map((x, j) =>
                      j === i
                        ? {
                            ...x,
                            type: e.target
                              .value as PreciseReferenceItem["type"],
                          }
                        : x,
                    ),
                  )
                }
              >
                <option value="character">
                  {t("reference.type.character")}
                </option>
                <option value="style">{t("batch.ref.style")}</option>
                <option value="character&style">
                  {t("batch.ref.characterStyle")}
                </option>
              </select>
              <label>
                {t("batch.ref.strength")}
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={r.strength}
                  onChange={(e) =>
                    onChange(
                      refs.map((x, j) =>
                        j === i
                          ? { ...x, strength: Number(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                {t("batch.ref.fidelity")}
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={r.fidelity}
                  onChange={(e) =>
                    onChange(
                      refs.map((x, j) =>
                        j === i
                          ? { ...x, fidelity: Number(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              <button
                className="vibe-remove"
                onClick={() => onChange(refs.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BatchVibePicker({
  vibes,
  onChange,
}: {
  vibes: VibeTransferItem[];
  onChange: (next: VibeTransferItem[]) => void;
}) {
  const { t } = useBatchLocale();
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
        <span>{t("batch.ref.vibeTitle")}</span>
        <label className="btn btn-secondary btn-sm">
          {t("batch.ref.add")}
          <input
            type="file"
            hidden
            multiple
            accept="image/*"
            onChange={(e) => {
              void add(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {vibes.length === 0 ? (
        <p className="settings-hint" style={{ margin: 0 }}>
          {t("batch.ref.vibeEmpty")}
        </p>
      ) : (
        <div className="batch-ref-list">
          {vibes.map((v, i) => (
            <div className="batch-ref-row" key={i}>
              <img src={dataUrlFromBase64(v.base64)} alt={`vibe-${i}`} />
              <label>
                {t("batch.ref.info")}
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={v.infoExtracted}
                  onChange={(e) =>
                    onChange(
                      vibes.map((x, j) =>
                        j === i
                          ? { ...x, infoExtracted: Number(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                {t("batch.ref.strength")}
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={v.strength}
                  onChange={(e) =>
                    onChange(
                      vibes.map((x, j) =>
                        j === i
                          ? { ...x, strength: Number(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              <button
                className="vibe-remove"
                onClick={() => onChange(vibes.filter((_, j) => j !== i))}
              >
                ×
              </button>
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
  const cancelling = useAppStore((state) => state.batchCancelRequested);
  const progress = useAppStore((state) => state.batchProgress);
  const setBatchRunning = useAppStore((state) => state.setBatchRunning);
  const requestBatchCancel = useAppStore((state) => state.requestBatchCancel);
  const setToast = useAppStore((state) => state.setToast);
  const refreshHistory = useAppStore((state) => state.refreshHistory);
  const refreshAccount = useAppStore((state) => state.refreshAccount);
  const { t, f } = useBatchLocale();

  const [aiFilling, setAiFilling] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [resultFilter, setResultFilter] = useState<
    "all" | "done" | "failed" | "pending"
  >("all");
  // Cancel signal lives in the global store (batchCancelRequested), not a local
  // ref: a component-local ref only reaches the loop from THIS mount. If the
  // user leaves this tab mid-run and comes back, the still-running loop is a
  // closure from the OLD mount — only global state can still reach it.
  const cancelRefCurrent = () => useAppStore.getState().batchCancelRequested;

  useEffect(() => {
    return () => {
      // Leaving the tab mid-run must abort the in-flight paid request and let a
      // future remount's "stop" still be able to reach this run — otherwise it
      // keeps generating/billing in the background with no way to stop it.
      if (useAppStore.getState().batchRunning) {
        requestBatchCancel();
        void window.naiDesktop.cancel();
      }
    };
  }, [requestBatchCancel]);

  const { items, globalStrength, step } = project;
  const globalParams = project.globalParams;
  const readyCount = items.filter((it) => it.prompt.trim()).length;
  const doneCount = items.filter((it) => it.status === "done").length;
  const failedCount = items.filter((it) => it.status === "failed").length;
  const failedReady = items.filter(
    (it) => it.status === "failed" && it.prompt.trim(),
  ).length;
  const generatingCount = items.filter(
    (it) => it.status === "generating",
  ).length;
  const pendingReady = items.filter(
    (it) => it.status !== "done" && it.prompt.trim(),
  ).length;
  const pendingCount = items.filter(
    (it) => it.status !== "done" && it.status !== "failed",
  ).length;
  const displayGroupName = localizedBatchGroupName(project.groupName, t);
  const progressDone = progress?.done ?? doneCount;
  const progressTotal = progress?.total ?? readyCount;
  const progressPercent =
    progressTotal > 0
      ? Math.min(100, Math.round((progressDone / progressTotal) * 100))
      : 0;
  const visibleGenerationItems = useMemo(
    () =>
      items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => {
          if (resultFilter === "done") return item.status === "done";
          if (resultFilter === "failed") return item.status === "failed";
          if (resultFilter === "pending")
            return item.status !== "done" && item.status !== "failed";
          return true;
        }),
    [items, resultFilter],
  );
  // Master-detail editing in the prompts step (like the comic generator): the
  // left sidebar selects an image, the editor on the right edits that one.
  // Falls back to the first image when nothing (or a removed item) is selected.
  const activeItem =
    items.find((it) => it.id === activeItemId) ?? items[0] ?? null;
  const activeItemIndex = activeItem
    ? items.findIndex((it) => it.id === activeItem.id)
    : -1;
  const batchStatusLabel = (it: BatchRedrawItem) =>
    it.status === "done"
      ? t("batch.status.done")
      : it.status === "generating"
        ? t("batch.status.generating")
        : it.status === "failed"
          ? t("batch.status.failed")
          : it.prompt.trim()
            ? t("batch.status.prompted")
            : t("batch.status.pending");

  // Seed global style / negative / params from the main 生成 screen the first time
  // the tool is opened with an empty project ("默认为生成中锁定的，可自行修改").
  useEffect(() => {
    if (project.seededFromMain || project.items.length > 0) return;
    setBatchRedraw((prev) => ({
      ...prev,
      globalParams: { ...params, fileNamePrefix: "" },
      globalStyle: params.stylePrompt,
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
    setBatchRedraw((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.id === id ? { ...it, ...p } : it)),
    }));
  }
  function syncFromMain() {
    patch({
      globalParams: { ...params, fileNamePrefix: "" },
      globalStyle: params.stylePrompt,
      globalNegative: params.negativePrompt,
      seededFromMain: true,
    });
    setToast(t("batch.toast.synced"));
  }

  async function importImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    arr.sort((a, b) =>
      a.name.localeCompare(b.name, "zh-CN", { numeric: true }),
    );
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
    setToast(f("batch.toast.importedImages", { count: next.length }));
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
    setToast(f("batch.toast.importedPrompts", { count: n }));
  }

  function importBulkPrompts() {
    if (!project.promptBulk.trim()) {
      setToast(t("batch.toast.needPromptBulk"));
      return;
    }
    if (items.length === 0) {
      setToast(t("batch.toast.needImages"));
      return;
    }
    const n = assignPromptLines(project.promptBulk.split(/\r?\n/));
    setToast(f("batch.toast.importedPrompts", { count: n }));
  }

  async function aiFill() {
    if (aiFilling || running) return;
    const targets = useAppStore
      .getState()
      .batchRedraw.items.filter((it) => !it.prompt.trim());
    if (targets.length === 0) {
      setToast(t("batch.toast.allPrompted"));
      return;
    }
    setAiFilling(true);
    useAppStore.setState({ batchCancelRequested: false });
    const mode = useAppStore.getState().batchRedraw.aiMode;
    try {
      for (const it of targets) {
        if (cancelRefCurrent()) break;
        const res = await window.naiDesktop.reversePrompt(it.base64, mode);
        if (res.ok && res.prompt)
          patchItem(it.id, { prompt: res.prompt.trim() });
      }
      setToast(t("batch.toast.aiDone"));
    } catch (error) {
      setToast(
        f("batch.toast.aiFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setAiFilling(false);
    }
  }

  // Run img2img serially over the given items. The complete request for every
  // target is captured when Generate is pressed: edits made during the queue
  // apply to the next run, while an individual retry always starts from the
  // freshly saved parameters. A retry never deletes the prior output from
  // persistent History.
  async function runTargets(targets: BatchRedrawItem[]) {
    // Read the live store flag, not the captured `running` closure: a fast
    // double-click would otherwise start a second concurrent run, and because
    // each redrawImage call aborts the previous in-flight request, the two runs
    // cancel each other → every panel "fails". The store flag is set
    // synchronously below before the first await, so this guard is race-free.
    if (useAppStore.getState().batchRunning) return;
    const proj = useAppStore.getState().batchRedraw;
    if (!proj.groupName.trim()) {
      setToast(t("batch.toast.needGroup"));
      setStep("import");
      return;
    }
    const runGroupName = localizedBatchGroupName(proj.groupName, t);
    // Targets may come from a prior render. Resolve IDs against the current
    // store before snapshotting so changing a parameter then pressing Retry
    // never submits the pre-edit object captured by React.
    const ready = targets
      .map((target) => proj.items.find((item) => item.id === target.id))
      .filter((item): item is BatchRedrawItem => Boolean(item?.prompt.trim()))
      .map((item) => ({
        id: item.id,
        request: buildBatchRedrawRequest(proj, item, runGroupName),
      }));
    if (ready.length === 0) {
      setToast(t("batch.toast.noReady"));
      return;
    }
    setBatchRunning(true, { done: 0, total: ready.length });

    let done = 0;
    let failed = 0;
    let lastError = "";
    // Everything below runs inside try/finally: a throw anywhere (IPC, network,
    // history/account refresh) must never leave the UI stuck in "running" with
    // every button disabled — finally always clears the running flag.
    try {
      try {
        await window.naiDesktop.createHistoryGroup(runGroupName);
      } catch {
        /* group ensured by the main process anyway */
      }

      for (const target of ready) {
        if (cancelRefCurrent()) break;
        // Do not clear an earlier output while the replacement is running.
        // This prevents a failed retry/cancel from visually discarding a good
        // image and leaves it available in the persistent History panel.
        patchItem(target.id, {
          status: "generating",
          error: undefined,
        });
        const res = await window.naiDesktop.redrawImage(target.request);
        // Cancellation controls the whole queue; it is not a failed image.
        // Return the interrupted card to pending and never start another one.
        if (shouldStopBatchRedraw(cancelRefCurrent(), res.failureKind)) {
          setBatchRedraw((prev) => ({
            ...prev,
            items: prev.items.map((item) =>
              item.id === target.id ? resetInterruptedBatchItem(item) : item,
            ),
          }));
          break;
        }
        const out = res.ok ? res.items[0] : undefined;
        if (res.ok && out) {
          patchItem(target.id, {
            status: "done",
            resultUrl: out.fileUrl,
            resultPath: out.filePath,
            historyItemId: out.id,
            error: undefined,
          });
          done += 1;
        } else {
          patchItem(target.id, { status: "failed", error: res.message });
          failed += 1;
          lastError = res.message;
        }
        setBatchRunning(true, { done: done + failed, total: ready.length });
      }
    } catch (error) {
      if (!cancelRefCurrent()) {
        lastError = error instanceof Error ? error.message : String(error);
        failed = Math.max(failed, ready.length - done);
      }
    } finally {
      if (cancelRefCurrent()) {
        setBatchRedraw((prev) => ({
          ...prev,
          items: prev.items.map(resetInterruptedBatchItem),
        }));
      }
      try {
        await refreshHistory();
      } catch {
        /* keep going — never strand the running flag */
      }
      try {
        await refreshAccount();
      } catch {
        /* ignore */
      }
      setBatchRunning(false, null);
    }
    setToast(
      cancelRefCurrent()
        ? f("batch.toast.stopped", { done })
        : failed > 0
          ? f("batch.toast.failed", { done, failed, message: lastError })
          : f("batch.toast.allDone", { done, name: runGroupName }),
    );
  }

  function stop() {
    requestBatchCancel();
    setBatchRedraw((prev) => ({
      ...prev,
      items: prev.items.map(resetInterruptedBatchItem),
    }));
    void window.naiDesktop.cancel();
  }

  async function clearGeneratedResults() {
    if (running) return;
    const snapshot = useAppStore.getState().batchRedraw.items;
    const generated = snapshot.filter(
      (item) =>
        item.historyItemId || item.resultPath || item.status === "failed",
    );
    if (generated.length === 0) return;
    if (!window.confirm(t("batch.results.clearConfirm"))) return;

    const failedIds = new Set<string>();
    for (const historyId of new Set(
      generated.map((item) => item.historyItemId).filter(Boolean) as string[],
    )) {
      try {
        await window.naiDesktop.deleteHistory(historyId);
      } catch {
        failedIds.add(historyId);
      }
    }

    setBatchRedraw((prev) => ({
      ...prev,
      step: failedIds.size === 0 ? "params" : prev.step,
      items: prev.items.map((item) =>
        item.historyItemId && failedIds.has(item.historyItemId)
          ? item
          : clearBatchRedrawItemResult(item),
      ),
    }));
    setResultFilter("all");
    setLightbox(null);
    await refreshHistory();
    setToast(
      failedIds.size === 0
        ? t("batch.toast.resultsCleared")
        : f("batch.toast.resultsClearFailed", { count: failedIds.size }),
    );
  }

  async function exportZip() {
    const name = localizedBatchGroupName(project.groupName, t);
    if (!name) {
      setToast(t("batch.toast.needGroup"));
      return;
    }
    const doneFiles: BatchExportFile[] = useAppStore
      .getState()
      .batchRedraw.items.filter((it) => it.status === "done" && it.resultPath)
      .map((it, index) => ({
        filePath: it.resultPath!,
        name: `${String(index + 1).padStart(3, "0")}_${it.name}`,
      }));
    if (doneFiles.length === 0) {
      setToast(t("batch.toast.needGenerated"));
      return;
    }
    const res = await window.naiDesktop.exportFiles(
      doneFiles,
      f("batch.exportDefault", { name }),
    );
    setToast(
      res.ok
        ? f("batch.toast.zipDone", {
            path: res.path ?? t("batch.toast.zipDoneFallback"),
          })
        : res.message,
    );
  }

  function exportProject() {
    const data = JSON.stringify(useAppStore.getState().batchRedraw, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${displayGroupName || t("batch.projectDefaultName")}.batch.json`;
    a.click();
    URL.revokeObjectURL(url);
    setToast(t("batch.toast.projectExported"));
  }

  async function importProject(file: File | null) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const next = normalizeBatchProject(
        parsed,
        createDefaultBatchRedraw(params),
      );
      setBatchRedraw(() => next);
      setToast(f("batch.toast.projectImported", { count: next.items.length }));
    } catch (error) {
      setToast(
        f("batch.toast.importFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  function clearProject() {
    if (running) return;
    resetBatchRedraw();
    setToast(t("batch.toast.cleared"));
  }

  return (
    <main className="comic-generator redraw-wizard">
      <div className="comic-page-title redraw-page-title">
        <div>
          <span className="eyebrow">{t("batch.titleEyebrow")}</span>
          <strong>{displayGroupName || t("batch.unnamedTask")}</strong>
        </div>
        <div
          className="redraw-page-metrics"
          aria-label={t("batch.titleEyebrow")}
        >
          <span>
            <b>{items.length}</b>
            {t("batch.metric.images")}
          </span>
          <span>
            <b>{readyCount}</b>
            {t("batch.metric.prompted")}
          </span>
          <span>
            <b>{doneCount}</b>
            {t("batch.metric.generated")}
          </span>
          <span>
            <b>{globalStrength.toFixed(2)}</b>
            {t("batch.metric.strength")}
          </span>
        </div>
      </div>

      <nav className="comic-steps" aria-label={t("batch.titleEyebrow")}>
        {REDRAW_STEPS.map((meta, index) => (
          <button
            type="button"
            key={meta.key}
            className={clsx("comic-step-btn", step === meta.key && "active")}
            onClick={() => setStep(meta.key)}
            disabled={running && meta.key !== "generate"}
            aria-current={step === meta.key ? "step" : undefined}
          >
            <b>{index + 1}</b>
            <span>{t(meta.labelKey)}</span>
            <small>{t(meta.hintKey)}</small>
          </button>
        ))}
      </nav>

      <div className="comic-step-actions redraw-header-actions">
        {onBack ? (
          <Button onClick={onBack} variant="ghost">
            {t("batch.back")}
          </Button>
        ) : null}
        <Button
          variant="secondary"
          onClick={exportProject}
          disabled={items.length === 0}
        >
          {t("batch.import.exportProject")}
        </Button>
        <label className="btn btn-secondary redraw-file-btn">
          {t("batch.import.importProject")}
          <input
            type="file"
            hidden
            accept=".json,application/json"
            onChange={(e) => {
              void importProject(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </label>
        <Button
          variant="ghost"
          onClick={clearProject}
          disabled={running || items.length === 0}
        >
          {t("batch.import.clear")}
        </Button>
      </div>

      {step === "import" && (
        <section className="redraw-card redraw-import-stage">
          <label className="field">
            <span>{t("batch.import.groupName")}</span>
            <input
              value={displayGroupName}
              onChange={(e) => patch({ groupName: e.target.value })}
              placeholder={t("batch.import.groupPlaceholder")}
            />
          </label>
          <div className="redraw-import-hero">
            <label className="redraw-dropzone">
              <span>＋</span>
              <strong>{t("batch.import.imagesTitle")}</strong>
              <small>{t("batch.import.imagesDesc")}</small>
              <input
                type="file"
                hidden
                multiple
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  void importImages(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <div className="redraw-import-side">
              <strong>{t("batch.import.projectTitle")}</strong>
              <small>{t("batch.import.projectDesc")}</small>
              <div className="redraw-actions">
                <Button
                  variant="secondary"
                  onClick={exportProject}
                  disabled={items.length === 0}
                >
                  {t("batch.import.exportProject")}
                </Button>
                <label className="btn btn-secondary redraw-file-btn">
                  {t("batch.import.importProject")}
                  <input
                    type="file"
                    hidden
                    accept=".json,application/json"
                    onChange={(e) => {
                      void importProject(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                </label>
                <Button
                  variant="ghost"
                  onClick={clearProject}
                  disabled={running || items.length === 0}
                >
                  {t("batch.import.clear")}
                </Button>
              </div>
            </div>
          </div>
          <p className="settings-hint" style={{ margin: 0 }}>
            {t("batch.import.hint")}
          </p>
          <div className="redraw-grid">
            {items.length === 0 && (
              <div className="redraw-empty-state">
                <b>{t("batch.import.emptyTitle")}</b>
                <span>{t("batch.import.emptyHint")}</span>
              </div>
            )}
            {items.map((it, idx) => (
              <div className="redraw-thumb-card" key={it.id}>
                <img
                  src={dataUrlFromBase64(it.base64)}
                  alt={it.name}
                  loading="lazy"
                  decoding="async"
                  title={t("batch.import.thumbTitle")}
                  onDoubleClick={() =>
                    setLightbox(dataUrlFromBase64(it.base64))
                  }
                />
                <span className="redraw-thumb-name" title={it.name}>
                  #{idx + 1} {it.name}
                </span>
                <button
                  className="vibe-remove"
                  title={t("batch.import.remove")}
                  onClick={() =>
                    setBatchRedraw((prev) => ({
                      ...prev,
                      items: prev.items.filter((p) => p.id !== it.id),
                    }))
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="redraw-step-footer">
            <span>
              {items.length > 0
                ? f("batch.import.footerReady", { count: items.length })
                : t("batch.import.footerEmpty")}
            </span>
            <div className="redraw-step-footer-actions">
              <Button
                variant="primary"
                onClick={() => setStep("params")}
                disabled={items.length === 0}
              >
                {t("batch.next.params")}
              </Button>
            </div>
          </div>
        </section>
      )}

      {step === "params" && (
        <section className="redraw-card redraw-globals redraw-params-stage">
          <div className="redraw-globals-head">
            <strong>{t("batch.params.title")}</strong>
            <Button variant="ghost" onClick={syncFromMain}>
              {t("batch.params.sync")}
            </Button>
          </div>
          <label className="field">
            <span>
              {f("batch.params.strength", { value: globalStrength.toFixed(2) })}
            </span>
            <input
              type="range"
              min={0.1}
              max={0.99}
              step={0.01}
              value={globalStrength}
              onChange={(e) =>
                patch({ globalStrength: Number(e.target.value) })
              }
            />
          </label>
          <div className="redraw-global-prompts">
            <label className="field">
              <span>{t("batch.params.style")}</span>
              <textarea
                className="redraw-global-text"
                value={project.globalStyle}
                onChange={(e) => patch({ globalStyle: e.target.value })}
                placeholder={t("batch.params.stylePlaceholder")}
              />
            </label>
            <label className="field">
              <span>{t("batch.params.negative")}</span>
              <textarea
                className="redraw-global-text"
                value={project.globalNegative}
                onChange={(e) => patch({ globalNegative: e.target.value })}
                placeholder={t("batch.params.negativePlaceholder")}
              />
            </label>
          </div>
          <BatchParamFields
            value={globalParams}
            onPatch={(p) => patch({ globalParams: { ...globalParams, ...p } })}
          />
          <BatchPrecisePicker
            refs={project.preciseReferences}
            onChange={(next) => patch({ preciseReferences: next })}
          />
          <BatchVibePicker
            vibes={project.vibeImages}
            onChange={(next) => patch({ vibeImages: next })}
          />
          <div className="redraw-step-footer">
            <span>{t("batch.params.footer")}</span>
            <div className="redraw-step-footer-actions">
              <Button variant="ghost" onClick={() => setStep("import")}>
                {t("batch.prev.import")}
              </Button>
              <Button
                variant="primary"
                onClick={() => setStep("prompts")}
                disabled={items.length === 0}
              >
                {t("batch.next.prompts")}
              </Button>
            </div>
          </div>
        </section>
      )}

      {step === "prompts" && (
        <section className="redraw-card redraw-prompts-stage">
          <label className="field">
            <span>{t("batch.prompts.bulkLabel")}</span>
            <textarea
              className="redraw-bulk"
              value={project.promptBulk}
              placeholder={t("batch.prompts.bulkPlaceholder")}
              onChange={(e) => patch({ promptBulk: e.target.value })}
            />
          </label>
          <div className="redraw-actions">
            <Button
              variant="primary"
              onClick={importBulkPrompts}
              disabled={running || items.length === 0}
            >
              {t("batch.prompts.importText")}
            </Button>
            <label className="btn btn-secondary redraw-file-btn">
              {t("batch.prompts.importTxt")}
              <input
                type="file"
                hidden
                accept=".txt,text/plain"
                onChange={(e) => {
                  void importPromptsFile(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </label>
            <span className="redraw-ai-mode">
              {t("batch.prompts.reverseMode")}
              <select
                value={project.aiMode}
                onChange={(e) =>
                  patch({ aiMode: e.target.value as ReversePromptMode })
                }
              >
                <option value="tags">{t("mode.tags")}</option>
                <option value="natural">{t("mode.natural")}</option>
                <option value="mixed">{t("mode.mixed")}</option>
              </select>
            </span>
            <Button
              variant="secondary"
              onClick={() => void aiFill()}
              disabled={aiFilling || running || items.length === 0}
            >
              {aiFilling
                ? t("batch.prompts.aiRunning")
                : t("batch.prompts.aiFill")}
            </Button>
          </div>
          <p className="settings-hint" style={{ margin: 0 }}>
            {t("batch.prompts.hint")}
          </p>
          {items.length === 0 ? (
            <p className="vibe-empty">{t("batch.prompts.importFirst")}</p>
          ) : activeItem ? (
            <div className="comic-panel-workspace">
              <aside className="comic-panel-sidebar">
                {items.map((it, idx) => (
                  <button
                    key={it.id}
                    type="button"
                    className={clsx(
                      "comic-panel-nav-item",
                      activeItem.id === it.id && "active",
                      it.status === "done" && "selected",
                    )}
                    onClick={() => setActiveItemId(it.id)}
                    title={it.name}
                  >
                    <span>#{idx + 1}</span>
                    <small>{batchStatusLabel(it)}</small>
                  </button>
                ))}
              </aside>
              <article className="comic-panel-editor">
                <header>
                  <strong>
                    #{activeItemIndex + 1} · {activeItem.name}
                  </strong>
                  <span className={clsx("comic-status", activeItem.status)}>
                    {batchStatusLabel(activeItem)}
                  </span>
                  <div className="comic-actions">
                    <Button
                      variant="primary"
                      onClick={() => void runTargets([activeItem])}
                      disabled={running || !activeItem.prompt.trim()}
                    >
                      {activeItem.status === "done"
                        ? t("batch.prompts.regenerate")
                        : activeItem.status === "failed"
                          ? t("batch.prompts.retry")
                          : t("batch.prompts.generateOne")}
                    </Button>
                  </div>
                </header>
                <div className="comic-panel-editor-body">
                  {activeItem.error ? (
                    <div className="comic-panel-error">{activeItem.error}</div>
                  ) : null}
                  <div
                    className="comic-panel-result"
                    title={t("batch.import.thumbTitle")}
                    onDoubleClick={() =>
                      setLightbox(
                        activeItem.resultUrl ||
                          dataUrlFromBase64(activeItem.base64),
                      )
                    }
                  >
                    <img
                      src={
                        activeItem.resultUrl ||
                        dataUrlFromBase64(activeItem.base64)
                      }
                      alt={activeItem.name}
                      loading="lazy"
                      decoding="async"
                      draggable={Boolean(activeItem.resultUrl)}
                      title={
                        activeItem.resultUrl
                          ? t("batch.prompts.dragOutput")
                          : t("batch.import.thumbTitle")
                      }
                      onDragStart={(e) => {
                        if (!activeItem.resultUrl) return;
                        e.preventDefault();
                        window.naiDesktop.startImageDrag(activeItem.resultUrl);
                      }}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src =
                          dataUrlFromBase64(activeItem.base64);
                      }}
                    />
                    <div>
                      <strong>
                        {activeItem.resultUrl
                          ? t("batch.prompts.currentOutput")
                          : t("batch.prompts.sourceImage")}
                      </strong>
                      <span>
                        {activeItem.resultUrl
                          ? t("batch.prompts.outputHint")
                          : t("batch.prompts.sourceHint")}
                      </span>
                    </div>
                  </div>
                  <label className="comic-field">
                    <span>{t("batch.prompts.itemPrompt")}</span>
                    <textarea
                      style={{ minHeight: 120 }}
                      value={activeItem.prompt}
                      placeholder={t("batch.prompts.itemPromptPlaceholder")}
                      onChange={(e) =>
                        patchItem(activeItem.id, { prompt: e.target.value })
                      }
                    />
                  </label>
                  <div className="comic-panel-negative-row">
                    <label className="comic-field">
                      <span>
                        {f("batch.prompts.itemStrength", {
                          value: globalStrength.toFixed(2),
                        })}
                      </span>
                      <input
                        type="number"
                        min={0.1}
                        max={0.99}
                        step={0.01}
                        value={activeItem.strength ?? ""}
                        placeholder={globalStrength.toFixed(2)}
                        onChange={(e) =>
                          patchItem(activeItem.id, {
                            strength:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <div className="comic-field">
                      <span>{t("batch.prompts.advanced")}</span>
                      <label className="redraw-override-toggle">
                        <input
                          type="checkbox"
                          checked={activeItem.overrideParams}
                          onChange={(e) =>
                            patchItem(activeItem.id, {
                              overrideParams: e.target.checked,
                              params:
                                e.target.checked &&
                                Object.keys(activeItem.params).length === 0
                                  ? { ...globalParams }
                                  : activeItem.params,
                            })
                          }
                        />
                        {t("batch.prompts.override")}
                      </label>
                    </div>
                  </div>
                  {activeItem.overrideParams && (
                    <BatchParamFields
                      value={{ ...globalParams, ...activeItem.params }}
                      onPatch={(p) =>
                        patchItem(activeItem.id, {
                          params: { ...activeItem.params, ...p },
                        })
                      }
                    />
                  )}
                </div>
              </article>
            </div>
          ) : null}
          <div className="redraw-step-footer">
            <span>
              {readyCount > 0
                ? f("batch.prompts.footerReady", {
                    ready: readyCount,
                    total: items.length,
                  })
                : t("batch.prompts.footerEmpty")}
            </span>
            <div className="redraw-step-footer-actions">
              <Button variant="ghost" onClick={() => setStep("params")}>
                {t("batch.prev.params")}
              </Button>
              <Button
                variant="primary"
                onClick={() => setStep("generate")}
                disabled={readyCount === 0}
              >
                {t("batch.next.generate")}
              </Button>
            </div>
          </div>
        </section>
      )}

      {step === "generate" && (
        <section className="redraw-card redraw-results-stage">
          <header className="redraw-results-toolbar">
            <div className="redraw-results-overview">
              <div className="redraw-results-title-row">
                <div>
                  <span className="eyebrow">{t("batch.results.eyebrow")}</span>
                  <strong>{t("batch.results.title")}</strong>
                  <small>
                    {f("batch.results.group", {
                      name: displayGroupName || t("batch.results.unnamed"),
                    })}
                  </small>
                </div>
                <b>
                  {progressDone}
                  <i>/</i>
                  {progressTotal}
                </b>
              </div>
              <div
                className="redraw-results-progress"
                aria-label={f("batch.results.progress", {
                  percent: progressPercent,
                })}
              >
                <i style={{ width: `${progressPercent}%` }} />
              </div>
              <div className="redraw-results-stats">
                <span className="done">
                  {t("batch.results.done")} <b>{doneCount}</b>
                </span>
                <span className="running">
                  {t("batch.results.running")} <b>{generatingCount}</b>
                </span>
                <span className="failed">
                  {t("batch.results.failed")} <b>{failedCount}</b>
                </span>
                <span>
                  {t("batch.results.pending")}{" "}
                  <b>
                    {Math.max(
                      0,
                      readyCount - doneCount - failedCount - generatingCount,
                    )}
                  </b>
                </span>
              </div>
            </div>
            <div className="redraw-results-actions">
              {running ? (
                <Button variant="danger" onClick={stop} disabled={cancelling}>
                  {t("batch.results.stop")}
                </Button>
              ) : (
                <>
                  <Button
                    variant="primary"
                    onClick={() => void runTargets(items)}
                    disabled={readyCount === 0}
                  >
                    {f("batch.results.start", { count: readyCount })}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void runTargets(
                        items.filter((it) => it.status !== "done"),
                      )
                    }
                    disabled={pendingReady === 0}
                  >
                    {f("batch.results.continue", { count: pendingReady })}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() =>
                      void runTargets(
                        useAppStore
                          .getState()
                          .batchRedraw.items.filter(
                            (it) => it.status === "failed" && it.prompt.trim(),
                          ),
                      )
                    }
                    disabled={failedReady === 0}
                  >
                    {f("batch.results.retryFailed", { count: failedReady })}
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                onClick={() => setStep("params")}
                disabled={running}
              >
                {t("batch.results.editParams")}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setStep("prompts")}
                disabled={running}
              >
                {t("batch.results.editPrompts")}
              </Button>
              <Button
                variant="danger"
                onClick={() => void clearGeneratedResults()}
                disabled={running || doneCount + failedCount === 0}
              >
                {t("batch.results.clearGenerated")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => void exportZip()}
                disabled={running || doneCount === 0}
              >
                {f("batch.results.zip", { count: doneCount })}
              </Button>
            </div>
          </header>

          <div
            className="redraw-result-filters"
            role="tablist"
            aria-label={t("batch.results.filterAria")}
          >
            {(
              [
                ["all", t("batch.results.all"), items.length],
                ["done", t("batch.results.completed"), doneCount],
                ["failed", t("batch.results.failed"), failedCount],
                ["pending", t("batch.results.pending"), pendingCount],
              ] as const
            ).map(([key, label, count]) => (
              <button
                type="button"
                role="tab"
                aria-selected={resultFilter === key}
                className={clsx(resultFilter === key && "active", key)}
                key={key}
                onClick={() => setResultFilter(key)}
              >
                {label}
                <b>{count}</b>
              </button>
            ))}
            <span>{t("batch.results.tip")}</span>
          </div>

          <div className="redraw-results-scroll">
            {items.length === 0 ? (
              <div className="redraw-results-empty">
                <b>{t("batch.results.emptyTitle")}</b>
                <span>{t("batch.results.emptyHint")}</span>
              </div>
            ) : visibleGenerationItems.length === 0 ? (
              <div className="redraw-results-empty">
                <b>{t("batch.results.filteredEmpty")}</b>
                <button type="button" onClick={() => setResultFilter("all")}>
                  {t("batch.results.viewAll")}
                </button>
              </div>
            ) : (
              <div className="redraw-results-grid">
                {visibleGenerationItems.map(({ item: it, index: idx }) => (
                  <article
                    className={clsx(
                      "redraw-result-card",
                      `status-${it.status}`,
                    )}
                    key={it.id}
                    aria-busy={it.status === "generating"}
                  >
                    <button
                      type="button"
                      className="redraw-result-preview"
                      title={t("batch.results.previewTitle")}
                      onClick={() =>
                        setLightbox(
                          it.resultUrl || dataUrlFromBase64(it.base64),
                        )
                      }
                    >
                      <img
                        src={it.resultUrl || dataUrlFromBase64(it.base64)}
                        alt={it.name}
                        loading="lazy"
                        decoding="async"
                        draggable={Boolean(it.resultUrl)}
                        onDragStart={(e) => {
                          if (!it.resultUrl) return;
                          e.preventDefault();
                          window.naiDesktop.startImageDrag(it.resultUrl);
                        }}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            dataUrlFromBase64(it.base64);
                        }}
                      />
                      <span className="redraw-result-index">#{idx + 1}</span>
                      <span className="redraw-result-origin">
                        {it.resultUrl
                          ? t("batch.results.output")
                          : t("batch.results.source")}
                      </span>
                      <BatchStatusBadge status={it.status} />
                      {it.status === "generating" && (
                        <i className="redraw-result-shimmer" />
                      )}
                    </button>
                    <div className="redraw-result-body">
                      <div className="redraw-result-name">
                        <strong title={it.name}>{it.name}</strong>
                        <span>
                          {f("batch.results.cardStrength", {
                            value: (it.strength ?? globalStrength).toFixed(2),
                          })}
                        </span>
                      </div>
                      {it.error ? (
                        <p className="redraw-card-error" title={it.error}>
                          {it.error}
                        </p>
                      ) : (
                        <p className="redraw-card-prompt" title={it.prompt}>
                          {it.prompt || t("batch.results.noPrompt")}
                        </p>
                      )}
                      <div className="redraw-result-card-actions">
                        <Button
                          variant={
                            it.status === "failed" ? "danger" : "secondary"
                          }
                          onClick={() => void runTargets([it])}
                          disabled={running || !it.prompt.trim()}
                        >
                          {it.status === "done"
                            ? t("batch.prompts.regenerate")
                            : it.status === "failed"
                              ? t("batch.prompts.retry")
                              : t("batch.prompts.generateOne")}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            setLightbox(
                              it.resultUrl || dataUrlFromBase64(it.base64),
                            )
                          }
                        >
                          {t("batch.results.zoom")}
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {lightbox && (
        <div
          className="redraw-lightbox"
          role="presentation"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt={t("batch.results.previewAlt")} />
          <button
            className="redraw-lightbox-close"
            onClick={() => setLightbox(null)}
          >
            ×
          </button>
        </div>
      )}
    </main>
  );
}

export { TagComicGenerator as ComicGenerator };
