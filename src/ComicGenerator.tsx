import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { estimateAnlas } from "./anlas";
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
  NAI_MODELS,
  NAI_SAMPLERS,
  NAI_UC_PRESETS,
  type ComicPanel,
  type ComicProject,
  type ComicReferenceAsset,
  type ComicReferenceKind,
  type GenerateParams,
  type NAIModel,
  type NAISampler,
  type ReversePromptMode,
  type ReversePromptScope,
  type UcPreset,
} from "./types";

const STORAGE_KEY = "langbai.novelai.comic-project.v1";

const STEPS = [
  { key: "story", label: "故事", hint: "导入剧情，AI 拆分镜" },
  { key: "global", label: "全局设定", hint: "角色 / 风格 / 参数" },
  { key: "panels", label: "分镜", hint: "转换提示词 / 微调" },
  { key: "generate", label: "生成", hint: "队列出图 / 估算积分" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

function uid() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
type PanelOutput = { historyItemId?: string; outputPath?: string; outputUrl?: string };

export function ToolsHub() {
  const [activeTool, setActiveTool] = useState<"hub" | "comic">("hub");
  if (activeTool === "comic") return <ComicGenerator onBack={() => setActiveTool("hub")} />;

  return (
    <main className="tools-hub">
      <section className="tools-hero">
        <div>
          <span className="eyebrow">Tools</span>
          <h2>工具板块</h2>
          <p>把复杂流程收进专用工具里。当前只开放已经能使用的漫画生成器，未完成工具不再占位干扰。</p>
        </div>
      </section>
      <section className="tool-card-grid">
        <button type="button" className="tool-card ready" onClick={() => setActiveTool("comic")}>
          <b>漫画生成器</b>
          <span>故事拆分、参考图反推、分镜转换、队列出图与 ZIP 打包。</span>
          <small>已接入</small>
        </button>
      </section>
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
  const [queue, setQueue] = useState<QueueState>(null);
  const queueRef = useRef({ paused: false, cancelled: false });

  useEffect(() => {
    // Reference images are stored as base64; a few large ones can blow past the
    // localStorage quota. Guard the write and fall back to persisting references
    // without their image data rather than letting the page state go unstable.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    } catch {
      try {
        const slim = {
          ...project,
          references: project.references.map((ref) => ({ ...ref, base64: "", previewUrl: "" })),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
        setToast("参考图过大，已只保存项目文本（参考图需重新上传）。建议精简参考图数量或尺寸。");
      } catch {
        setToast("项目过大，无法保存到本地缓存，请导出项目 JSON 备份。");
      }
    }
  }, [project]);

  const panels = useMemo(() => sortedPanels(project), [project]);
  const activePanel = useMemo(() => panels.find((panel) => panel.id === activePanelId) ?? panels[0], [panels, activePanelId]);
  const selectedPanels = useMemo(
    () => (selectedIds.size ? panels.filter((panel) => selectedIds.has(panel.id)) : panels),
    [panels, selectedIds],
  );
  const convertedCount = panels.filter((panel) => panel.enPrompt.trim()).length;
  const doneCount = panels.filter((panel) => panel.status === "done").length;

  useEffect(() => {
    if (panels.length > 0 && !panels.some((panel) => panel.id === activePanelId)) {
      setActivePanelId(panels[0].id);
    }
  }, [activePanelId, panels]);

  const estSingle = estimateAnlas(project.globalParams, 1, account.tierLevel);
  const estSelected = estimateAnlas(project.globalParams, Math.max(1, selectedPanels.length), account.tierLevel);
  const estAll = estimateAnlas(project.globalParams, Math.max(1, panels.length), account.tierLevel);

  function patchProject(patch: Partial<ComicProject>) {
    setProject((prev) => ({ ...prev, ...patch }));
  }

  function patchGlobalParam<K extends keyof GenerateParams>(key: K, value: GenerateParams[K]) {
    setProject((prev) => ({ ...prev, globalParams: { ...prev.globalParams, [key]: value, positivePrompt: "" } }));
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

  async function generatePanel(panel: ComicPanel): Promise<PanelOutput | undefined> {
    setBusy(`generate:${panel.id}`);
    try {
      const result = await window.naiDesktop.comicGeneratePanel({
        projectId: project.id,
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
      const item = result.items[0];
      setProject((prev) =>
        updatePanel(prev, panel.id, (old) => ({
          ...old,
          status: result.ok && item ? "done" : "failed",
          historyItemId: item?.id ?? old.historyItemId,
          outputPath: item?.filePath ?? old.outputPath,
          outputUrl: item?.fileUrl ?? old.outputUrl,
          error: result.ok ? undefined : result.message,
        })),
      );
      if (item) {
        await refreshHistory(item.date);
        await refreshAccount();
      }
      if (result.ok && item) {
        return { historyItemId: item.id, outputPath: item.filePath, outputUrl: item.fileUrl };
      }
      return undefined;
    } finally {
      setBusy("");
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
      setBusy("");
    }
  }

  async function runQueue(targets: ComicPanel[]) {
    if (!targets.length) return;
    queueRef.current = { paused: false, cancelled: false };
    setQueue({ total: targets.length, done: 0, current: 0, paused: false });
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
      if (output) generatedOutputs.set(targets[i].id, output);
      setQueue((q) => (q ? { ...q, done: i + 1 } : q));
    }
    const cancelled = queueRef.current.cancelled;
    setQueue(null);
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
      await exportProjectZip(exportTarget);
    } else {
      setGenerationLog(cancelled ? "队列已取消。" : "队列已全部生成完成。");
    }
  }

  function startQueue(targets: ComicPanel[]) {
    if (!targets.length) {
      setToast("没有可生成的分镜。");
      return;
    }
    const est = estimateAnlas(project.globalParams, targets.length, account.tierLevel);
    const ok = window.confirm(
      `将按顺序生成 ${targets.length} 个分镜。\n` +
        `预计消耗：${est.free ? "可能免费" : `${est.total} Anlas`}\n` +
        `当前余额：${account.anlasBalance ?? "未知"} Anlas\n\n是否继续？`,
    );
    if (!ok) return;
    void runQueue(targets);
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

  function toggleSelected(panelId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(panelId)) next.delete(panelId);
      else next.add(panelId);
      return next;
    });
  }

  const queueRunning = Boolean(queue);

  return (
    <main className="comic-generator">
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

      <div className="comic-step-actions">
        {onBack ? <Button onClick={onBack} variant="ghost">返回工具首页</Button> : null}
        <Button onClick={createNewProject} variant="ghost">新建项目</Button>
        <Button onClick={clearPanels} variant="ghost" disabled={!panels.length}>清空分镜</Button>
        <Button onClick={exportProjectJson} variant="ghost">另存项目 JSON</Button>
        <label className="comic-upload-btn">
          导入项目 JSON
          <input type="file" accept=".json,application/json" onChange={(event) => void importProjectJson(event.currentTarget.files?.[0] ?? null)} />
        </label>
        <Button onClick={syncCurrentParams} variant="ghost">同步当前生图参数</Button>
      </div>

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
            <span>所有分镜共享</span>
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
                <NumberInput label="宽度" value={project.globalParams.width} min={64} max={2048} step={64} onChange={(v) => patchGlobalParam("width", v)} />
                <NumberInput label="高度" value={project.globalParams.height} min={64} max={2048} step={64} onChange={(v) => patchGlobalParam("height", v)} />
                <NumberInput label="步数" value={project.globalParams.steps} min={1} max={50} onChange={(v) => patchGlobalParam("steps", v)} />
                <NumberInput label="CFG" value={project.globalParams.cfgScale} min={1} max={20} step={0.5} onChange={(v) => patchGlobalParam("cfgScale", v)} />
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
                    <small>{panel.status}</small>
                  </button>
                ))}
              </aside>
              <article className="comic-panel-editor">
                <header>
                  <label className="comic-check">
                    <input type="checkbox" checked={selectedIds.has(activePanel.id)} onChange={() => toggleSelected(activePanel.id)} />
                    <strong>分镜 #{activePanel.index}</strong>
                  </label>
                  <span className={clsx("comic-status", activePanel.status)}>{activePanel.status}</span>
                  <div className="comic-actions">
                    <Button onClick={() => addPanel(activePanel.index)}>插入</Button>
                    <Button variant="danger" onClick={() => removePanel(activePanel.id)}>删除</Button>
                  </div>
                </header>
                <div className="comic-panel-grid">
                  <label className="comic-field">
                    <span>中文分镜描述</span>
                    <textarea
                      value={activePanel.cnPrompt}
                      onChange={(event) => setProject((prev) => updatePanel(prev, activePanel.id, (old) => ({ ...old, cnPrompt: event.target.value })))}
                    />
                  </label>
                  <label className="comic-field">
                    <span>英文生图提示词</span>
                    <textarea
                      value={activePanel.enPrompt}
                      onChange={(event) => setProject((prev) => updatePanel(prev, activePanel.id, (old) => ({ ...old, enPrompt: event.target.value, status: "converted" })))}
                    />
                  </label>
                </div>
                <footer>
                  <span>{activePanel.error || (activePanel.outputPath ? "已出图" : "尚未生成")}</span>
                  <div className="comic-actions">
                    <Button onClick={() => convertPanels([activePanel])} disabled={busy === "convert"}>转换本张</Button>
                    <Button onClick={() => startQueue([activePanel])} disabled={Boolean(busy) || queueRunning} variant="primary">
                      {busy === `generate:${activePanel.id}` ? "生成中..." : "生成本张"}
                    </Button>
                  </div>
                </footer>
              </article>
            </div>
          )}
          <div className="comic-panel-list">
            {panels.map((panel, arrayIndex) => {
              const tags = splitPromptTags(panel.enPrompt).slice(0, 48);
              return (
                <article className={clsx("comic-panel", selectedIds.has(panel.id) && "selected")} key={panel.id}>
                  <header>
                    <label className="comic-check">
                      <input type="checkbox" checked={selectedIds.has(panel.id)} onChange={() => toggleSelected(panel.id)} />
                      <strong>#{panel.index}</strong>
                    </label>
                    <span className={clsx("comic-status", panel.status)}>{panel.status}</span>
                    <div className="comic-actions">
                      <Button onClick={() => addPanel(arrayIndex + 1)}>插入</Button>
                      <Button variant="danger" onClick={() => removePanel(panel.id)}>删除</Button>
                    </div>
                  </header>
                  <div className="comic-panel-grid">
                    <label className="comic-field">
                      <span>中文分镜描述</span>
                      <textarea
                        value={panel.cnPrompt}
                        onChange={(event) => setProject((prev) => updatePanel(prev, panel.id, (old) => ({ ...old, cnPrompt: event.target.value })))}
                      />
                    </label>
                    <label className="comic-field">
                      <span>英文生图提示词</span>
                      <textarea
                        value={panel.enPrompt}
                        onChange={(event) => setProject((prev) => updatePanel(prev, panel.id, (old) => ({ ...old, enPrompt: event.target.value, status: "converted" })))}
                      />
                    </label>
                  </div>
                  <div className="comic-panel-options">
                    <Toggle
                      checked={panel.paramsOverride.enabled}
                      onChange={(enabled) => setProject((prev) => updatePanel(prev, panel.id, (old) => ({ ...old, paramsOverride: { ...old.paramsOverride, enabled } })))}
                      label="局部参数覆盖"
                      description="只影响当前分镜。"
                    />
                    {panel.paramsOverride.enabled && (
                      <div className="comic-param-grid mini">
                        <NumberInput
                          label="宽度"
                          value={panel.paramsOverride.params.width ?? project.globalParams.width}
                          min={64}
                          max={2048}
                          step={64}
                          onChange={(value) => setProject((prev) => updatePanel(prev, panel.id, (old) => ({
                            ...old,
                            paramsOverride: { ...old.paramsOverride, params: { ...old.paramsOverride.params, width: value } },
                          })))}
                        />
                        <NumberInput
                          label="高度"
                          value={panel.paramsOverride.params.height ?? project.globalParams.height}
                          min={64}
                          max={2048}
                          step={64}
                          onChange={(value) => setProject((prev) => updatePanel(prev, panel.id, (old) => ({
                            ...old,
                            paramsOverride: { ...old.paramsOverride, params: { ...old.paramsOverride.params, height: value } },
                          })))}
                        />
                        <NumberInput
                          label="步数"
                          value={panel.paramsOverride.params.steps ?? project.globalParams.steps}
                          min={1}
                          max={50}
                          onChange={(value) => setProject((prev) => updatePanel(prev, panel.id, (old) => ({
                            ...old,
                            paramsOverride: { ...old.paramsOverride, params: { ...old.paramsOverride.params, steps: value } },
                          })))}
                        />
                      </div>
                    )}
                  </div>
                  {tags.length > 0 && (
                    <div className="comic-weight-tags">
                      {tags.map((tag, index) => {
                        const parsed = parseWeightedTag(tag);
                        return (
                          <span className="comic-weight-tag" key={`${panel.id}-${index}-${tag}`}>
                            <b>{parsed.core}</b>
                            <small>{formatMultiplier(parsed.level) || "x1.00"}</small>
                            <button onClick={() => setProject((prev) => updatePanel(prev, panel.id, (old) => setPanelTagLevel(old, index, parsed.level + 1)))}>+</button>
                            <button onClick={() => setProject((prev) => updatePanel(prev, panel.id, (old) => setPanelTagLevel(old, index, parsed.level - 1)))}>-</button>
                            <button onClick={() => setProject((prev) => updatePanel(prev, panel.id, (old) => setPanelTagLevel(old, index, 0)))}>重置</button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <footer>
                    <span>{panel.error || (panel.outputPath ? "已出图" : "尚未生成")}</span>
                    <div className="comic-actions">
                      <Button onClick={() => convertPanels([panel])} disabled={busy === "convert"}>转换</Button>
                      <Button onClick={() => startQueue([panel])} disabled={Boolean(busy) || queueRunning} variant="primary">
                        {busy === `generate:${panel.id}` ? "生成中..." : "生成本张"}
                      </Button>
                    </div>
                  </footer>
                </article>
              );
            })}
          </div>
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
              <strong>{estSingle.free ? "免费" : `${estSingle.total}`}</strong>
              <span>单张预估 Anlas</span>
            </div>
            <div className="comic-cost-card">
              <strong>{estSelected.free ? "免费" : `${estSelected.total}`}</strong>
              <span>选中 {selectedPanels.length} 张预估</span>
            </div>
            <div className="comic-cost-card">
              <strong>{estAll.free ? "免费" : `${estAll.total}`}</strong>
              <span>全部 {panels.length} 张预估</span>
            </div>
            <div className="comic-cost-card">
              <strong>{account.anlasBalance ?? "未知"}</strong>
              <span>当前余额</span>
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
                <label className="comic-upload-btn">
                  导入参考图 / 素材图
                  <input type="file" accept="image/*" multiple onChange={(event) => addReferences(event.target.files)} />
                </label>
                <Button onClick={() => startQueue(panels)} variant="primary">生成全部（{panels.length}）</Button>
                <Button onClick={() => startQueue(selectedPanels)} disabled={!selectedIds.size}>
                  生成选中（{selectedPanels.length}）
                </Button>
                <Button onClick={() => void exportProjectZip()} disabled={!doneCount || busy === "exportZip"}>
                  {busy === "exportZip" ? "导出中..." : "导出已生成 ZIP"}
                </Button>
                <span className="comic-empty">未转换的分镜会回退用中文描述出图，建议先在第 3 步转换。</span>
              </div>
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
                  }}
                >
                  取消
                </Button>
              </div>
            </div>
          )}

          <div className="comic-thumbs">
            {panels.map((panel) => (
              <div className={clsx("comic-thumb", panel.status)} key={panel.id} title={panel.error || panel.cnPrompt}>
                {panel.outputUrl ? (
                  <img src={panel.outputUrl} alt={`#${panel.index}`} />
                ) : (
                  <div className="comic-thumb-empty">#{panel.index}</div>
                )}
                <span>#{panel.index}</span>
                {panel.status === "failed" && (
                  <Button variant="danger" onClick={() => startQueue([panel])} disabled={queueRunning}>重试</Button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {generationLog && <div className="comic-log">{generationLog}</div>}
    </main>
  );
}
