import {comicProviderText,compatibleComicConfirmation} from './comic-provider-text';
import {errorText} from '../error-message';
import {useComicGenerationQueue} from './use-comic-generation';
import type {ComicQueueTask as QueueTask} from './generation-queue';
import {useComicProject,comicPersistenceMessage} from './use-comic-project';
import {RangeInput} from '../components/RangeInput';
import {FilePicker} from '../components/FilePicker';
import {AnimatedCollapse} from '../components/CharacterEditing';
import {PreviewImageViewer} from '../components/PreviewImageViewer';
import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Button, CommittedNumberInput, NumberInput, Toggle, SelectMenuCompat } from "../components/ui";
import { Icon } from "../components/icons";
import { confirmAction } from "../components/confirm";
import { QualityPresetControl } from "../components/QualityPresetControl";
import { useAppStore } from "../store";
import ReferencePresetManager, {
  referencePresetTextFor,
  type ReferencePresetApplyPayload,
} from "../ReferencePresetManager";
import {
  NAI_MODELS,
  NAI_SAMPLERS,
  isNAIV5Model,
  supportsNAIPreciseReference,
  type GenerateParams,
  type TagComicPanel,
  type TagComicPanelReference,
  type TagComicProject,
  type TagComicReferenceAsset,
  type ReferencePreset,
} from "../types";
import {
  TAG_COMIC_SIZE_PRESETS,
  TagComicPanelRangeError,
  TagComicSizeImportError,
  buildTagComicRegenerationTasks,
  createTagComicPanel,
  createTagComicProject,
  mergeTagComicParams,
  normalizeTagComicProject,
  formatTagComicPanelRange,
  parseTagComicImport,
  parseTagComicPanelRange,
  parseTagComicSizeImport,
  tagComicReferenceApplies,
  tagComicSizeTemplate,
} from "./tag-comic";
import {
  NAI_DIMENSION_STEP,
  NAI_MIN_DIMENSION,
  maxNAIDimensionFor,
  snapNAIDimensionWithinArea,
} from "../nai-dimensions";

type Step = "import" | "global" | "panels" | "generate";

const COPY = {
  "zh-CN": {
    title: "漫画生成器",
    subtitle: "直接导入 Tag，统一设定参数，为每个分镜挑选最终主图",
    back: "返回工具",
    stepImport: "导入",
    stepImportHint: "Tag / JSON / CSV",
    stepGlobal: "全局设定",
    stepGlobalHint: "风格 / 参数 / 次数",
    stepPanels: "分镜",
    stepPanelsHint: "标题 / Tag / 微调",
    stepGenerate: "生成",
    stepGenerateHint: "候选 / 主图 / ZIP",
    newProject: "新建项目",
    exportJson: "保存项目 JSON",
    importHeading: "导入 Tag 分镜",
    importDescription:
      "粘贴时每行一个分镜。JSON/CSV 可包含 title 与 prompt（或 tags）字段。",
    importPlaceholder:
      "masterpiece, 1girl, standing...\nmasterpiece, 1girl, close-up...",
    importText: "导入文本",
    chooseFile: "选择 TXT / JSON / CSV",
    replaceWarning: "导入会替换当前分镜，但不会修改全局参数。",
    noTags: "没有找到可导入的 Tag 提示词。",
    imported: "已导入 {count} 个分镜。",
    oldProject: "旧版漫画项目不再兼容，请导出 Tag 后重新导入。",
    projectTitle: "项目名称",
    globalStyle: "全局风格提示词",
    globalNegative: "全局负面提示词",
    initialCount: "每个提示词初次生成次数",
    initialCountHint: "默认 1，范围 1–10；完成后仍可继续追加候选图。",
    sizeMode: "分镜图片尺寸",
    sizeUniform: "统一尺寸",
    sizePerPanel: "逐分镜尺寸",
    sizeModeHint: "逐分镜模式按分镜顺序逐行匹配，只接受下方列出的合法尺寸。",
    sizesInput: "逐分镜尺寸（一行一个）",
    sizesPlaceholder: "832×1216\n1216×832\n1024×1024",
    sizeTemplate: "生成尺寸模板",
    importSizes: "导入并匹配尺寸",
    sizesApplied: "已为 {count} 个分镜匹配尺寸。",
    sizeEmpty: "请先填写逐分镜尺寸。",
    sizeCount: "尺寸数量不一致：需要 {expected} 行，实际 {actual} 行。",
    sizeBlank: "尺寸第 {line} 行为空。",
    sizeFormat: "尺寸第 {line} 行格式错误，请使用“宽×高”。",
    sizeUnsupported: "尺寸第 {line} 行不是软件支持的 NovelAI 尺寸。",
    sizesIncomplete: "部分分镜尚未指定合法尺寸，请重新导入完整尺寸列表。",
    panelSize: "本分镜尺寸",
    useProjectSize: "使用项目全局尺寸",
    preciseHeading: "全局精准参考图",
    preciseHint: "参考图会复制到项目资源目录。最多 5 张，仅 NovelAI V4.5 可用。",
    preciseUpload: "添加精准参考图",
    preciseEmpty: "尚未添加精准参考图。",
    preciseCharacter: "角色",
    preciseStyle: "风格",
    preciseBoth: "角色与风格",
    preciseStrength: "参考强度",
    preciseFidelity: "信息保真度",
    preciseRemove: "移除",
    preciseRemoveConfirm: "移除这张漫画参考图？原工程会备份；已生成图片不受影响。",
    preciseCleanupFailed: "参考记录已移除，但缓存文件清理未完成。",
    precisePanelHeading: "本分镜使用的精准参考",
    precisePanelHint: "勾选后可为当前分镜单独调整类型、强度和保真度。",
    preciseReset: "恢复全局值",
    preciseV45Only: "精准参考当前只能用于 NovelAI V4.5；V5 首发尚未开放。",
    switchV45: "切换项目到 V4.5",
    preciseImportFailed: "精准参考图导入失败：{message}",
    preciseScope: "应用范围",
    preciseScopeAll: "全部分镜",
    preciseScopeInclude: "仅指定分镜",
    preciseScopeExclude: "排除指定分镜",
    preciseRange: "分镜编号",
    preciseRangePlaceholder: "例如：1-8, 10, 12",
    preciseApplyRange: "应用范围",
    preciseCoverage: "当前覆盖 {count}/{total} 个分镜",
    preciseRangeEmpty: "请输入需要指定或排除的分镜编号。",
    preciseRangeFormat: "分镜范围“{token}”格式错误。",
    preciseRangeOut: "分镜范围“{token}”超出当前分镜数量。",
    preciseManual: "手动覆盖",
    dragPanel: "拖拽调整分镜顺序",
    syncParams: "同步生成页参数",
    model: "模型",
    width: "宽度",
    height: "高度",
    steps: "步数",
    cfg: "提示词引导",
    sampler: "采样器",
    seed: "Seed（0 = 随机）",
    advanced: "展开高级参数",
    collapse: "收起高级参数",
    panelsHeading: "逐个编辑分镜",
    panelsEmpty: "还没有分镜，请先导入 Tag。",
    addPanel: "新增分镜",
    panelTitle: "分镜标题",
    panelPrompt: "Tag 提示词",
    delete: "删除",
    moveUp: "上移",
    moveDown: "下移",
    override: "单独设置本分镜参数",
    overrideHint: "关闭时使用全局生成参数。负面提示词始终使用全局设定。",
    ready: "待生成",
    generating: "生成中",
    done: "已生成",
    failed: "失败",
    generateHeading: "候选图与主图",
    generateInitial: "生成未完成的初始候选",
    addAll: "全部分镜各追加 1 张",
    addOne: "追加 1 张",
    retry: "重试",
    chooseMain: "设为主图",
    currentMain: "当前主图",
    candidates: "候选图片（{count}）",
    showCandidates: "展开候选",
    hideCandidates: "收起候选",
    noCandidate: "尚未生成候选图",
    previewHint: "双击主图可全屏预览",
    exportZip: "打包当前主图 ZIP",
    exportHint: "ZIP 每个分镜只包含当前选中的主图，并在点击后选择保存路径。",
    balance: "余额 {amount} Anlas",
    progress: "生成进度 {done}/{total}",
    stop: "停止全部任务",
    queueStopped: "已停止剩余生成任务。",
    confirmGenerate:
      "将生成 {count} 张图片，官方预估 {quote} Anlas。是否继续？",
    quoteFailed: "官方报价暂不可用，仍然尝试生成？",
    needToken: "请先配置 NovelAI Token。",
    emptyPrompt: "分镜 #{index} 的 Tag 为空。",
    generated: "分镜 #{index} 已追加候选图。",
    exportDone: "ZIP 已保存：{path}",
    confirmNew: "新建项目会清空当前漫画工作区，是否继续？",
    confirmReplace: "这会替换当前 {count} 个分镜，是否继续？",
    closePreview: "关闭预览",
    selectedCount: "{selected}/{total} 个分镜已有主图",
  },
} as const;

type CopyKey = keyof (typeof COPY)["zh-CN"];

function text(_language: unknown, key: CopyKey) {
  return COPY["zh-CN"][key];
}

function format(
  language: unknown,
  key: CopyKey,
  values: Record<string, unknown>,
) {
  return text(language, key).replace(/\{(\w+)\}/g, (_, name: string) =>
    String(values[name] ?? ""),
  );
}

function selectedCandidate(panel: TagComicPanel) {
  return (
    panel.candidates.find((item) => item.id === panel.selectedCandidateId) ??
    panel.candidates[0]
  );
}

function statusLabel(language: unknown, panel: TagComicPanel) {
  return text(language, panel.status);
}

export function TagComicGenerator({ onBack }: { onBack?: () => void }) {
  const currentParams = useAppStore((state) => state.params);
  const settings = useAppStore((state) => state.settings);
  const account = useAppStore((state) => state.account);
  const setToast = useAppStore((state) => state.setToast);
  const language = settings?.language;
  const compatible=settings?.imageProvider==='openai-images';
  const providerCopy=comicProviderText(language);
  const providerNotice=<div className="tag-comic-params" role="note"><strong>{providerCopy.title} · {settings?.compatibleImage?.model} · {settings?.compatibleImage?.size}</strong><p>{providerCopy.hint}</p><small>{providerCopy.fees}</small></div>;
  const {store:comicStore,snapshot:comicSnapshot}=useComicProject();
  const project=comicSnapshot.project;
  const setProject=(value:TagComicProject|((p:TagComicProject)=>TagComicProject),options:{expectedRevision?:string;backup?:boolean}={})=>{
    try{comicStore.update(p=>typeof value==='function'?value(p):value,options);projectRef.current=comicStore.getSnapshot().project;return true;}
    catch(error){projectRef.current=comicStore.getSnapshot().project;setToast(errorText(error));return false;}
  };
  const [step, setStep] = useState<Step>("import");
  const [bulkText, setBulkText] = useState("");
  const [sizeText, setSizeText] = useState("");
  const [referenceRanges, setReferenceRanges] = useState<Record<string, string>>({});
  const [activePanelId, setActivePanelId] = useState("");
  const [draggedPanelId, setDraggedPanelId] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showReferencePresets, setShowReferencePresets] = useState(false);
  const [expandedCandidates, setExpandedCandidates] = useState<Set<string>>(
    () => new Set(),
  );
  const [preview, setPreview] = useState<string | null>(null);
  const previewItems=useMemo(()=>[...new Set(project.panels.flatMap(panel=>panel.candidates.flatMap(candidate=>candidate.outputUrl?[candidate.outputUrl]:[])))],[project.panels]);
  const {service:comicQueue,queue} = useComicGenerationQueue();
  const projectRef = useRef(project);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const panels = useMemo(
    () => [...project.panels].sort((a, b) => a.index - b.index),
    [project.panels],
  );
  const activePanel =
    panels.find((panel) => panel.id === activePanelId) ?? panels[0];
  const selectedCount = panels.filter((panel) =>
    selectedCandidate(panel),
  ).length;
  const presetText = referencePresetTextFor(language);
  const preciseModelSupported = !compatible && supportsNAIPreciseReference(
    project.globalParams.model,
  );

  useEffect(() => {
    if (panels.length && !panels.some((panel) => panel.id === activePanelId)) {
      setActivePanelId(panels[0].id);
    }
  }, [activePanelId, panels]);

  function patchProject(patch: Partial<TagComicProject>) {
    setProject((current) => {
      const next = { ...current, ...patch };
      projectRef.current = next;
      return next;
    });
  }

  function patchGlobalParam<K extends keyof GenerateParams>(
    key: K,
    value: GenerateParams[K],
  ) {
    setProject((current) => {
      const next = {
        ...current,
        globalParams: {
          ...current.globalParams,
          [key]: value,
          positivePrompt: "",
        },
      };
      projectRef.current = next;
      return next;
    });
  }

  function patchPanel(
    panelId: string,
    updater: (panel: TagComicPanel) => TagComicPanel,
  ) {
    setProject((current) => {
      const next = {
        ...current,
        panels: current.panels.map((panel) =>
          panel.id === panelId ? updater(panel) : panel,
        ),
      };
      projectRef.current = next;
      return next;
    });
  }

  function patchPanelParam<K extends keyof GenerateParams>(
    panelId: string,
    key: K,
    value: GenerateParams[K],
  ) {
    patchPanel(panelId, (panel) => ({
      ...panel,
      paramsOverride: {
        ...panel.paramsOverride,
        params: { ...panel.paramsOverride.params, [key]: value },
      },
    }));
  }

  async function replacePanels(items: Array<{ title: string; prompt: string }>, expectedRevision=comicStore.read().revision) {
    if (!items.length) {
      setToast(text(language, "noTags"));
      return;
    }
    if (
      panels.length &&
      !(await confirmAction(
        format(language, "confirmReplace", { count: panels.length }),
      ))
    )
      return;
    const defaultSize = {
      width: project.globalParams.width,
      height: project.globalParams.height,
    };
    if(!setProject(current=>({...current,
      panels: items.map((item, index) => ({
        ...createTagComicPanel(item.prompt, index + 1, item.title),
        imageSize: project.sizeMode === "perPanel" ? defaultSize : undefined,
      })),
      historyGroupId: undefined,
      preciseReferences: project.preciseReferences.map((reference) => ({
        ...reference,
        scope: "all",
        scopePanelIds: [],
      })),
    }),{expectedRevision,backup:true}))return false;
    setSizeText("");
    setReferenceRanges({});
    setActivePanelId("");
    setToast(format(language, "imported", { count: items.length }));
    setStep("global");
    return true;
  }

  async function importText() {
    try {
      if(await replacePanels(parseTagComicImport(bulkText)))setBulkText("");
    } catch (error) {
      setToast(
        error instanceof Error && error.message.includes("Old")
          ? text(language, "oldProject")
          : errorText(error),
      );
    }
  }

  async function importFile(file: File | null) {
    if (!file) return;
    try {
      const expectedRevision=comicStore.read().revision;
      const raw = await file.text();
      if (file.name.toLowerCase().endsWith(".json")) {
        const parsed = JSON.parse(raw) as unknown;
        if (
          parsed &&
          typeof parsed === "object" &&
          !Array.isArray(parsed) &&
          (parsed as { schemaVersion?: unknown }).schemaVersion === 2
        ) {
          const next = normalizeTagComicProject(parsed, currentParams, {
            trustOutputs: false,
          });
          if(!setProject(next,{expectedRevision,backup:true}))return;
          setActivePanelId("");
          setStep("global");
          return;
        }
      }
      await replacePanels(parseTagComicImport(raw, file.name),expectedRevision);
    } catch (error) {
      setToast(
        error instanceof Error &&
          (error.message.includes("Old") || error.message.includes("schema"))
          ? text(language, "oldProject")
          : errorText(error),
      );
    }
  }

  function exportProjectJson() {
    const portableProject = {
      ...project,
      preciseReferences: [],
      panels: project.panels.map((panel) => ({
        ...panel,
        preciseReferences: [],
      })),
    };
    const blob = new Blob([JSON.stringify(portableProject, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${project.title || "comic-project"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function newProject() {
    const expectedRevision=comicStore.getSnapshot().revision;
    if (!(await confirmAction(text(language, "confirmNew")))) return;
    const next = createTagComicProject(currentParams);
    if(!setProject(next,{expectedRevision,backup:true}))return;
    setBulkText("");
    setSizeText("");
    setReferenceRanges({});
    setActivePanelId("");
    setStep("import");
  }

  function syncParams() {
    setProject((current) => {
      const next = {
        ...current,
        globalStylePrompt: currentParams.stylePrompt,
        globalNegativePrompt: currentParams.negativePrompt,
        globalParams: { ...currentParams, positivePrompt: "" },
      };
      projectRef.current = next;
      return next;
    });
  }

  function addPanel() {
    const panel = {
      ...createTagComicPanel("", panels.length + 1),
      imageSize:
        project.sizeMode === "perPanel"
          ? {
              width: project.globalParams.width,
              height: project.globalParams.height,
            }
          : undefined,
    };
    setProject((current) => ({
      ...current,
      panels: [...current.panels, panel],
    }));
    setActivePanelId(panel.id);
  }

  async function importPreciseReferences(files: FileList | null) {
    if (!files?.length) return;
    const projectId=project.id;
    const capacity = Math.max(0, 5 - project.preciseReferences.length);
    for (const file of Array.from(files).slice(0, capacity)) {
      const expectedRevision=comicStore.getSnapshot().revision;
      if(comicStore.getSnapshot().project.id!==projectId)break;
      const result = await window.naiDesktop.tagComicImportReference({
        projectId,
        sourcePath: (file as File & { path?: string }).path || window.naiDesktop.getPathForFile(file),
      });
      if (!result.ok || !result.asset) {
        setToast(
          format(language, "preciseImportFailed", { message: result.message }),
        );
        continue;
      }
      if(!setProject((current) => ({
        ...current,
        preciseReferences: [...current.preciseReferences, result.asset!],
      }),{expectedRevision}))break;
    }
  }

  async function importPrecisePreset(
    preset: ReferencePreset,
    _payload: ReferencePresetApplyPayload,
  ) {
    if (projectRef.current.preciseReferences.length >= 5) {
      setToast(text(language, "preciseHint"));
      return;
    }
    const expectedRevision=comicStore.getSnapshot().revision;
    const result = await window.naiDesktop.tagComicImportReference({
      projectId: projectRef.current.id,
      sourcePath: preset.filePath,
    });
    if (!result.ok || !result.asset) {
      setToast(
        format(language, "preciseImportFailed", { message: result.message }),
      );
      return;
    }
    const asset: TagComicReferenceAsset = {
      ...result.asset,
      name: preset.name,
      type: preset.preciseType,
      strength: preset.strength,
      fidelity: preset.fidelity,
      informationExtracted: 1,
    };
    setProject((current) => ({
      ...current,
      preciseReferences: [...current.preciseReferences, asset],
    }),{expectedRevision});
  }

  function patchPreciseReference(
    referenceId: string,
    patch: Partial<
      Pick<
        TagComicReferenceAsset,
        | "type"
        | "strength"
        | "fidelity"
        | "informationExtracted"
        | "scope"
        | "scopePanelIds"
      >
    >,
  ) {
    setProject((current) => ({
      ...current,
      preciseReferences: current.preciseReferences.map((item) =>
        item.id === referenceId ? { ...item, ...patch } : item,
      ),
    }));
  }

  function referenceRangeMessage(error: unknown) {
    if (!(error instanceof TagComicPanelRangeError)) {
      return errorText(error);
    }
    if (error.code === "empty") return text(language, "preciseRangeEmpty");
    return format(
      language,
      error.code === "format" ? "preciseRangeFormat" : "preciseRangeOut",
      { token: error.token ?? "?" },
    );
  }

  function setReferenceScope(
    reference: TagComicReferenceAsset,
    scope: TagComicReferenceAsset["scope"],
  ) {
    patchPreciseReference(reference.id, {
      scope,
      scopePanelIds: scope === "all" ? [] : reference.scopePanelIds,
    });
    setReferenceRanges((current) => ({
      ...current,
      [reference.id]:
        scope === "all"
          ? ""
          : formatTagComicPanelRange(reference.scopePanelIds, panels),
    }));
  }

  function applyReferenceRange(
    reference: TagComicReferenceAsset,
    rawValue?: string,
  ) {
    try {
      const numbers = parseTagComicPanelRange(
        rawValue ??
          referenceRanges[reference.id] ??
          formatTagComicPanelRange(reference.scopePanelIds, panels),
        panels.length,
      );
      const panelIds = numbers.map((number) => panels[number - 1].id);
      patchPreciseReference(reference.id, { scopePanelIds: panelIds });
      setReferenceRanges((current) => ({
        ...current,
        [reference.id]: formatTagComicPanelRange(panelIds, panels),
      }));
    } catch (error) {
      setToast(referenceRangeMessage(error));
    }
  }

  async function removePreciseReference(referenceId: string) {
    const before=comicStore.read();if(before.busy)return;
    if(!await confirmAction(text(language,"preciseRemoveConfirm")))return;
    // Commit the detachment first. A write failure must never delete a still-used file.
    const saved=setProject(current=>({...current,
      preciseReferences:current.preciseReferences.filter(item=>item.id!==referenceId),
      panels:current.panels.map(panel=>({...panel,preciseReferences:panel.preciseReferences.filter(item=>item.referenceId!==referenceId)})),
    }),{expectedRevision:before.revision,backup:true});
    if(!saved)return;
    try{const result=await window.naiDesktop.tagComicDeleteReference(before.project.id,referenceId);if(!result.ok)setToast(text(language,"preciseCleanupFailed"));}
    catch{setToast(text(language,"preciseCleanupFailed"));}
  }

  function togglePanelReference(
    panelId: string,
    asset: TagComicReferenceAsset,
    enabled: boolean,
  ) {
    patchPanel(panelId, (panel) => ({
      ...panel,
      preciseReferences: [
        ...panel.preciseReferences.filter(
          (item) => item.referenceId !== asset.id,
        ),
        {
          referenceId: asset.id,
          enabled,
          type:
            panel.preciseReferences.find((item) => item.referenceId === asset.id)
              ?.type ?? asset.type,
          strength:
            panel.preciseReferences.find((item) => item.referenceId === asset.id)
              ?.strength ?? asset.strength,
          fidelity:
            panel.preciseReferences.find((item) => item.referenceId === asset.id)
              ?.fidelity ?? asset.fidelity,
          informationExtracted:
            panel.preciseReferences.find((item) => item.referenceId === asset.id)
              ?.informationExtracted ?? asset.informationExtracted,
        },
      ],
    }));
  }

  function patchPanelReference(
    panelId: string,
    referenceId: string,
    patch: Partial<TagComicPanelReference>,
  ) {
    patchPanel(panelId, (panel) => ({
      ...panel,
      preciseReferences: panel.preciseReferences.some(
        (item) => item.referenceId === referenceId,
      )
        ? panel.preciseReferences.map((item) =>
            item.referenceId === referenceId ? { ...item, ...patch } : item,
          )
        : [
            ...panel.preciseReferences,
            {
              referenceId,
              enabled: true,
              type:
                project.preciseReferences.find((item) => item.id === referenceId)
                  ?.type ?? "character",
              strength:
                project.preciseReferences.find((item) => item.id === referenceId)
                  ?.strength ?? 1,
              fidelity:
                project.preciseReferences.find((item) => item.id === referenceId)
                  ?.fidelity ?? 1,
              informationExtracted:
                project.preciseReferences.find((item) => item.id === referenceId)
                  ?.informationExtracted ?? 1,
              ...patch,
            },
          ],
    }));
  }

  function clearPanelReferenceOverride(panelId: string, referenceId: string) {
    patchPanel(panelId, (panel) => ({
      ...panel,
      preciseReferences: panel.preciseReferences.filter(
        (item) => item.referenceId !== referenceId,
      ),
    }));
  }

  function sizeImportMessage(error: unknown) {
    if (!(error instanceof TagComicSizeImportError)) {
      return errorText(error);
    }
    if (error.code === "empty") return text(language, "sizeEmpty");
    if (error.code === "count") {
      return format(language, "sizeCount", {
        expected: error.expected ?? panels.length,
        actual: error.actual ?? 0,
      });
    }
    const key = error.code === "blank"
      ? "sizeBlank"
      : error.code === "format"
        ? "sizeFormat"
        : "sizeUnsupported";
    return format(language, key, { line: error.line ?? "?" });
  }

  function setSizeMode(sizeMode: TagComicProject["sizeMode"]) {
    const fallback = {
      width: project.globalParams.width,
      height: project.globalParams.height,
    };
    patchProject({
      sizeMode,
      panels:
        sizeMode === "perPanel"
          ? project.panels.map((panel) => ({
              ...panel,
              imageSize: panel.imageSize ?? fallback,
            }))
          : project.panels,
    });
  }

  function createSizeTemplate() {
    if (!panels.length) {
      setToast(text(language, "noTags"));
      return;
    }
    setSizeText(
      tagComicSizeTemplate(panels.length, {
        width: project.globalParams.width,
        height: project.globalParams.height,
      }),
    );
  }

  function importPanelSizes() {
    try {
      const sizes = parseTagComicSizeImport(sizeText, panels.length);
      patchProject({
        sizeMode: "perPanel",
        panels: project.panels.map((panel, index) => ({
          ...panel,
          imageSize: sizes[index],
        })),
      });
      setToast(format(language, "sizesApplied", { count: sizes.length }));
    } catch (error) {
      setToast(sizeImportMessage(error));
    }
  }

  function movePanel(panelId: string, direction: -1 | 1) {
    const ordered = [...panels];
    const index = ordered.findIndex((panel) => panel.id === panelId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    patchProject({
      panels: ordered.map((panel, panelIndex) => ({
        ...panel,
        index: panelIndex + 1,
      })),
    });
    setReferenceRanges({});
  }

  function movePanelTo(panelId: string, targetId: string) {
    if (!panelId || panelId === targetId) return;
    const ordered = [...panels];
    const from = ordered.findIndex((panel) => panel.id === panelId);
    if (from < 0 || !ordered.some((panel) => panel.id === targetId)) return;
    const [moved] = ordered.splice(from, 1);
    const targetIndex = ordered.findIndex((panel) => panel.id === targetId);
    ordered.splice(targetIndex, 0, moved);
    patchProject({
      panels: ordered.map((panel, index) => ({ ...panel, index: index + 1 })),
    });
    setReferenceRanges({});
  }

  function deletePanel(panelId: string) {
    setProject((current) => ({
      ...current,
      preciseReferences: current.preciseReferences.map((reference) => ({
        ...reference,
        scopePanelIds: reference.scopePanelIds.filter((id) => id !== panelId),
      })),
      panels: current.panels
        .filter((panel) => panel.id !== panelId)
        .map((panel, index) => ({ ...panel, index: index + 1 })),
    }));
  }

  async function startQueue(tasks: QueueTask[]) {
    try {
      comicQueue.launch(tasks,{
        expectedRevision:comicStore.read().revision,
        confirm:summary=>confirmAction(summary.imageProvider==='openai-images'?compatibleComicConfirmation(language,summary):summary.quote===null?text(language,"quoteFailed"):format(language,"confirmGenerate",{count:summary.count,quote:summary.quote}),"请确认",undefined,summary.signal),
      });
      const result=await comicQueue.settled();
      if(result.error)setToast(result.error);
      else if(result.phase==='cancelled')setToast(text(language,"queueStopped"));
    } catch(error) {setToast(errorText(error));}
  }

  function initialTasks() {
    return panels.flatMap((panel) => {
      const missing = Math.max(
        0,
        project.initialGenerationCount - panel.candidates.length,
      );
      return Array.from({ length: missing }, (_, ordinal) => ({
        panelId: panel.id,
        ordinal,
      }));
    });
  }

  function regenerateAllTasks() {
    return buildTagComicRegenerationTasks(panels, project.initialGenerationCount);
  }

  function stopQueue() {
    void comicQueue.stop().then(()=>setToast(text(language,"queueStopped"))).catch(error=>setToast(errorText(error)));
  }

  async function exportZip() {
    try {
      const result = await window.naiDesktop.tagComicExportSelectedZip({
        project,
      });
      setToast(result.message);
      if (result.ok && result.path) {
        setToast(format(language, "exportDone", { path: result.path }));
      }
    } catch (error) {
      setToast(errorText(error));
    }
  }

  const stepItems: Array<[Step, CopyKey, CopyKey]> = [
    ["import", "stepImport", "stepImportHint"],
    ["global", "stepGlobal", "stepGlobalHint"],
    ["panels", "stepPanels", "stepPanelsHint"],
    ["generate", "stepGenerate", "stepGenerateHint"],
  ];

  return (
    <main className="tag-comic" aria-label={text(language, "title")}>
      {comicSnapshot.error&&<p role="alert">{comicPersistenceMessage(language)}: {comicSnapshot.error}</p>}
      <header className="tag-comic-header">
        <div>
          <small>TAG COMIC WORKSPACE</small>
          <h2>{text(language, "title")}</h2>
          <p>{text(language, "subtitle")}</p>
        </div>
        <div className="tag-comic-header-actions">
          {onBack && (
            <Button variant="ghost" onClick={onBack}>
              {text(language, "back")}
            </Button>
          )}
          <Button variant="secondary" onClick={newProject}>
            {text(language, "newProject")}
          </Button>
          <Button variant="secondary" onClick={exportProjectJson}>
            {text(language, "exportJson")}
          </Button>
        </div>
      </header>

      <nav className="tag-comic-steps" aria-label={text(language, "title")}>
        {stepItems.map(([key, label, hint], index) => (
          <button
            key={key}
            type="button"
            className={clsx(step === key && "active")}
            onClick={() => setStep(key)}
          >
            <b>{index + 1}</b>
            <span>{text(language, label)}</span>
            <small>{text(language, hint)}</small>
          </button>
        ))}
      </nav>

      {step === "import" && (
        <section className="tag-comic-card tag-comic-import">
          <div className="tag-comic-section-heading">
            <div>
              <h3>{text(language, "importHeading")}</h3>
              <p>{text(language, "importDescription")}</p>
            </div>
            <span>{text(language, "replaceWarning")}</span>
          </div>
          <textarea
            value={bulkText}
            onChange={(event) => setBulkText(event.target.value)}
            placeholder={text(language, "importPlaceholder")}
            rows={12}
          />
          <div className="tag-comic-actions">
            <Button
              variant="primary"
              onClick={importText}
              disabled={!bulkText.trim()}
            >
              {text(language, "importText")}
            </Button>
            <FilePicker
              compact
              buttonLabel={<><Icon name="folderOpen" /><span>{text(language, "chooseFile")}</span></>}
              accept=".txt,.json,.csv,text/plain,application/json,text/csv"
                onChange={(event) => {
                  void importFile(event.target.files?.[0] ?? null);
                  event.currentTarget.value = "";
                }}
            />
          </div>
        </section>
      )}

      {step === "global" && (
        <section className="tag-comic-card">
          <div className="tag-comic-section-heading">
            <div>
              <h3>{text(language, "stepGlobal")}</h3>
              <p>{text(language, "initialCountHint")}</p>
            </div>
            <Button variant="secondary" onClick={syncParams} disabled={compatible}>
              {text(language, "syncParams")}
            </Button>
          </div>
          <div className="tag-comic-global-grid">
            <label>
              <span>{text(language, "projectTitle")}</span>
              <input
                value={project.title}
                onChange={(event) =>
                  patchProject({ title: event.target.value })
                }
              />
            </label>
              <CommittedNumberInput
                label={text(language, "initialCount")}
                value={project.initialGenerationCount}
                min={1}
                max={10}
                normalize={(value) => Math.max(1, Math.min(10, Math.round(value)))}
                onCommit={(value) => patchProject({ initialGenerationCount: value })}
              />
            <label className="wide">
              <span>{text(language, "globalStyle")}</span>
              <textarea
                value={project.globalStylePrompt}
                onChange={(event) =>
                  patchProject({ globalStylePrompt: event.target.value })
                }
              />
            </label>
          </div>
          <div className="tag-comic-size-settings">
            <div className="tag-comic-size-mode" role="group" aria-label={text(language, "sizeMode")}>
              <b>{text(language, "sizeMode")}</b>
              <button
                type="button"
                className={clsx(project.sizeMode === "uniform" && "active")}
                onClick={() => setSizeMode("uniform")}
              >
                {text(language, "sizeUniform")}
              </button>
              <button
                type="button"
                className={clsx(project.sizeMode === "perPanel" && "active")}
                onClick={() => setSizeMode("perPanel")}
              >
                {text(language, "sizePerPanel")}
              </button>
            </div>
            <p>{compatible?providerCopy.hint:text(language, "sizeModeHint")}</p>
            {project.sizeMode === "perPanel" && (
              <>
                <label>
                  <span>{text(language, "sizesInput")}</span>
                  <textarea
                    value={sizeText}
                    onChange={(event) => setSizeText(event.target.value)}
                    placeholder={text(language, "sizesPlaceholder")}
                    rows={Math.min(10, Math.max(4, panels.length))}
                  />
                </label>
                <div className="tag-comic-size-presets">
                  {TAG_COMIC_SIZE_PRESETS.map((size) => (
                    <code key={`${size.width}x${size.height}`}>
                      {size.width}×{size.height}
                    </code>
                  ))}
                </div>
                <div className="tag-comic-actions">
                  <Button variant="secondary" onClick={createSizeTemplate}>
                    {text(language, "sizeTemplate")}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={importPanelSizes}
                    disabled={!sizeText.trim() || !panels.length}
                  >
                    {text(language, "importSizes")}
                  </Button>
                </div>
              </>
            )}
          </div>
          <div className="tag-comic-reference-settings">
            <div className="tag-comic-section-heading compact">
              <div>
                <h3>{text(language, "preciseHeading")}</h3>
                <p>{text(language, "preciseHint")}</p>
              </div>
              <div className="tag-comic-reference-actions">
                {!compatible && !preciseModelSupported && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      patchProject({
                        globalParams: {
                          ...project.globalParams,
                          model: project.globalParams.model.includes("curated")
                            ? "nai-diffusion-4-5-curated"
                            : "nai-diffusion-4-5-full",
                        },
                      })
                    }
                  >
                    {text(language, "switchV45")}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  disabled={!preciseModelSupported || project.preciseReferences.length >= 5}
                  onClick={() => setShowReferencePresets(true)}
                >
                  {presetText.open}
                </Button>
            <FilePicker
              compact
              buttonLabel={<><Icon name="folderOpen" /><span>{text(language, "preciseUpload")}</span></>}
              accept="image/png,image/jpeg,image/webp"
                    multiple
                    disabled={!preciseModelSupported || project.preciseReferences.length >= 5}
                    onChange={(event) => {
                      void importPreciseReferences(event.target.files);
                      event.currentTarget.value = "";
                    }}
            />
              </div>
            </div>
            {!project.preciseReferences.length ? (
              <p>{text(language, "preciseEmpty")}</p>
            ) : (
              <div className="tag-comic-reference-grid">
                {project.preciseReferences.map((reference) => {
                  const coverage = panels.filter((panel) => {
                    const manual = panel.preciseReferences.find(
                      (item) => item.referenceId === reference.id,
                    );
                    return manual?.enabled ??
                      tagComicReferenceApplies(reference, panel.id);
                  }).length;
                  return (
                  <article key={reference.id}>
                    <img src={reference.fileUrl} alt={reference.name} />
                    <div>
                      <b title={reference.name}>{reference.name}</b>
                      <SelectMenuCompat
                        value={reference.type}
                        onChange={(event) =>
                          patchPreciseReference(reference.id, {
                            type: event.target.value as TagComicReferenceAsset["type"],
                          })
                        }
                      >
                        <option value="character">{text(language, "preciseCharacter")}</option>
                        <option value="style">{text(language, "preciseStyle")}</option>
                        <option value="character&style">{text(language, "preciseBoth")}</option>
                      </SelectMenuCompat>
                      <label>
                        <span>{text(language, "preciseStrength")} · {reference.strength.toFixed(2)}</span>
                        <RangeInput  min={0} max={1} step={0.01} value={reference.strength}
                          onChange={(event) => patchPreciseReference(reference.id, { strength: Number(event.target.value) })} />
                      </label>
                      <label>
                        <span>{text(language, "preciseFidelity")} · {reference.fidelity.toFixed(2)}</span>
                        <RangeInput  min={0} max={1} step={0.01} value={reference.fidelity}
                          onChange={(event) => patchPreciseReference(reference.id, { fidelity: Number(event.target.value), informationExtracted: Number(event.target.value) })} />
                      </label>
                      <div className="tag-comic-reference-scope">
                        <span>{text(language, "preciseScope")}</span>
                        <div role="group">
                          {(["all", "include", "exclude"] as const).map((scope) => (
                            <button
                              key={scope}
                              type="button"
                              className={clsx(reference.scope === scope && "active")}
                              onClick={() => setReferenceScope(reference, scope)}
                            >
                              {text(
                                language,
                                scope === "all"
                                  ? "preciseScopeAll"
                                  : scope === "include"
                                    ? "preciseScopeInclude"
                                    : "preciseScopeExclude",
                              )}
                            </button>
                          ))}
                        </div>
                        {reference.scope !== "all" && (
                          <div className="tag-comic-reference-range">
                            <input
                              type="text"
                              inputMode="text"
                              autoComplete="off"
                              spellCheck={false}
                              aria-label={text(language, "preciseRange")}
                              value={
                                referenceRanges[reference.id] ??
                                formatTagComicPanelRange(reference.scopePanelIds, panels)
                              }
                              placeholder={text(language, "preciseRangePlaceholder")}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setReferenceRanges((current) => ({
                                  ...current,
                                  [reference.id]: value,
                                }));
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  applyReferenceRange(
                                    reference,
                                    event.currentTarget.value,
                                  );
                                }
                              }}
                            />
                            <Button variant="secondary" onClick={() => applyReferenceRange(reference)}>
                              {text(language, "preciseApplyRange")}
                            </Button>
                          </div>
                        )}
                        <small>
                          {format(language, "preciseCoverage", {
                            count: coverage,
                            total: panels.length,
                          })}
                        </small>
                      </div>
                      <Button variant="ghost" onClick={() => void removePreciseReference(reference.id)}>
                        {text(language, "preciseRemove")}
                      </Button>
                    </div>
                  </article>
                  );
                })}
              </div>
            )}
          </div>
          {compatible?providerNotice:<GlobalParams
            language={language}
            params={project.globalParams}
            patch={patchGlobalParam}
            negativePrompt={project.globalNegativePrompt}
            onNegativeChange={(value) =>
              patchProject({ globalNegativePrompt: value })
            }
            expanded={showAdvanced}
            toggle={() => setShowAdvanced((value) => !value)}
          />}
        </section>
      )}

      {step === "panels" && (
        <section className="tag-comic-card tag-comic-panels">
          {compatible && providerNotice}
          <div className="tag-comic-section-heading">
            <div>
              <h3>{text(language, "panelsHeading")}</h3>
              <p>
                {format(language, "selectedCount", {
                  selected: selectedCount,
                  total: panels.length,
                })}
              </p>
            </div>
            <Button variant="primary" onClick={addPanel}>
              {text(language, "addPanel")}
            </Button>
          </div>
          {!activePanel ? (
            <div className="tag-comic-empty">
              {text(language, "panelsEmpty")}
            </div>
          ) : (
            <div className="tag-comic-panel-workspace">
              <aside>
                {panels.map((panel) => (
                  <button
                    key={panel.id}
                    type="button"
                    draggable
                    title={text(language, "dragPanel")}
                    className={clsx(
                      panel.id === activePanel.id && "active",
                      panel.id === draggedPanelId && "dragging",
                    )}
                    onClick={() => setActivePanelId(panel.id)}
                    onDragStart={() => setDraggedPanelId(panel.id)}
                    onDragEnd={() => setDraggedPanelId("")}
                    onDragOver={(event) => event.preventDefault()}
                    data-image-paste="drop" tabIndex={0} onDrop={(event) => {
                      event.preventDefault();
                      movePanelTo(draggedPanelId, panel.id);
                      setDraggedPanelId("");
                    }}
                  >
                    <b>#{panel.index}</b>
                    <span>{panel.title}</span>
                    <small>{statusLabel(language, panel)}</small>
                  </button>
                ))}
              </aside>
              <article className="tag-comic-panel-editor">
                <header>
                  <span
                    className={clsx("tag-comic-status", activePanel.status)}
                  >
                    {statusLabel(language, activePanel)}
                  </span>
                  <div className="tag-comic-actions">
                    <Button
                      variant="ghost"
                      onClick={() => movePanel(activePanel.id, -1)}
                      disabled={activePanel.index === 1}
                    >
                      {text(language, "moveUp")}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => movePanel(activePanel.id, 1)}
                      disabled={activePanel.index === panels.length}
                    >
                      {text(language, "moveDown")}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => deletePanel(activePanel.id)}
                    >
                      {text(language, "delete")}
                    </Button>
                  </div>
                </header>
                <label>
                  <span>{text(language, "panelTitle")}</span>
                  <input
                    value={activePanel.title}
                    onChange={(event) =>
                      patchPanel(activePanel.id, (panel) => ({
                        ...panel,
                        title: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>{text(language, "panelPrompt")}</span>
                  <textarea
                    value={activePanel.prompt}
                    onChange={(event) =>
                      patchPanel(activePanel.id, (panel) => ({
                        ...panel,
                        prompt: event.target.value,
                        status: panel.candidates.length
                          ? panel.status
                          : "ready",
                      }))
                    }
                    rows={10}
                  />
                </label>
                {project.sizeMode === "perPanel" && (
                  <label>
                    <span>{text(language, "panelSize")}</span>
                    <SelectMenuCompat
                      value={
                        activePanel.imageSize
                          ? `${activePanel.imageSize.width}x${activePanel.imageSize.height}`
                          : ""
                      }
                      onChange={(event) => {
                        if (event.target.value === "") {
                          patchPanel(activePanel.id, (panel) => ({
                            ...panel,
                            imageSize: undefined,
                          }));
                          return;
                        }
                        const size = TAG_COMIC_SIZE_PRESETS.find(
                          (item) => `${item.width}x${item.height}` === event.target.value,
                        );
                        if (!size) return;
                        patchPanel(activePanel.id, (panel) => ({
                          ...panel,
                          imageSize: { ...size },
                        }));
                      }}
                    >
                      <option value="">{text(language, "useProjectSize")}</option>
                      {TAG_COMIC_SIZE_PRESETS.map((size) => (
                        <option
                          key={`${size.width}x${size.height}`}
                          value={`${size.width}x${size.height}`}
                        >
                          {size.width}×{size.height}
                        </option>
                      ))}
                    </SelectMenuCompat>
                  </label>
                )}
                {project.preciseReferences.length > 0 && (
                  <section className="tag-comic-panel-references">
                    <h4>{text(language, "precisePanelHeading")}</h4>
                    <p>{text(language, "precisePanelHint")}</p>
                    {project.preciseReferences.map((asset) => {
                      const manualOverride = activePanel.preciseReferences.find(
                        (item) => item.referenceId === asset.id,
                      );
                      const inherited = tagComicReferenceApplies(asset, activePanel.id);
                      const enabled = manualOverride?.enabled ?? inherited;
                      const selection = enabled
                        ? manualOverride ?? {
                            referenceId: asset.id,
                            enabled: true,
                            type: asset.type,
                            strength: asset.strength,
                            fidelity: asset.fidelity,
                            informationExtracted: asset.informationExtracted,
                          }
                        : null;
                      return (
                        <article key={asset.id} className={clsx(enabled && "selected")}>
                          <label className="tag-comic-reference-check">
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={(event) =>
                                togglePanelReference(
                                  activePanel.id,
                                  asset,
                                  event.target.checked,
                                )
                              }
                            />
                            <img src={asset.fileUrl} alt={asset.name} />
                            <b>
                              {asset.name}
                              {manualOverride && (
                                <small>{text(language, "preciseManual")}</small>
                              )}
                            </b>
                          </label>
                          {selection && (
                            <div className="tag-comic-reference-tuning">
                              <SelectMenuCompat
                                value={selection.type}
                                onChange={(event) =>
                                  patchPanelReference(activePanel.id, asset.id, {
                                    type: event.target.value as TagComicPanelReference["type"],
                                  })
                                }
                              >
                                <option value="character">{text(language, "preciseCharacter")}</option>
                                <option value="style">{text(language, "preciseStyle")}</option>
                                <option value="character&style">{text(language, "preciseBoth")}</option>
                              </SelectMenuCompat>
                              <label>
                                <span>{text(language, "preciseStrength")} · {selection.strength.toFixed(2)}</span>
                                <RangeInput  min={0} max={1} step={0.01} value={selection.strength}
                                  onChange={(event) => patchPanelReference(activePanel.id, asset.id, { strength: Number(event.target.value) })} />
                              </label>
                              <label>
                                <span>{text(language, "preciseFidelity")} · {selection.fidelity.toFixed(2)}</span>
                                <RangeInput  min={0} max={1} step={0.01} value={selection.fidelity}
                                  onChange={(event) => patchPanelReference(activePanel.id, asset.id, { fidelity: Number(event.target.value), informationExtracted: Number(event.target.value) })} />
                              </label>
                              <Button variant="ghost" onClick={() =>
                                clearPanelReferenceOverride(activePanel.id, asset.id)
                              }>
                                {text(language, "preciseReset")}
                              </Button>
                            </div>
                          )}
                          {manualOverride && !selection && (
                            <Button
                              variant="ghost"
                              onClick={() =>
                                clearPanelReferenceOverride(activePanel.id, asset.id)
                              }
                            >
                              {text(language, "preciseReset")}
                            </Button>
                          )}
                        </article>
                      );
                    })}
                  </section>
                )}
                {!compatible && <Toggle
                  checked={activePanel.paramsOverride.enabled}
                  onChange={(enabled) =>
                    patchPanel(activePanel.id, (panel) => ({
                      ...panel,
                      paramsOverride: { ...panel.paramsOverride, enabled },
                    }))
                  }
                  label={text(language, "override")}
                  description={text(language, "overrideHint")}
                />}
                {!compatible && activePanel.paramsOverride.enabled && (
                  <PanelParams
                    language={language}
                    params={mergeTagComicParams(project, activePanel)}
                    patch={(key, value) =>
                      patchPanelParam(activePanel.id, key, value)
                    }
                  />
                )}
              </article>
            </div>
          )}
        </section>
      )}

      {step === "generate" && (
        <section className="tag-comic-card tag-comic-generate">
          {compatible && providerNotice}
          <div className="tag-comic-section-heading">
            <div>
              <h3>{text(language, "generateHeading")}</h3>
              <p>{text(language, "exportHint")}</p>
            </div>
            <div className="tag-comic-balance">
              {compatible?providerCopy.fees:format(language, "balance", {
                amount: account.anlasBalance ?? "—",
              })}
            </div>
          </div>
          <div className="tag-comic-generate-toolbar">
            <Button
              variant="primary"
              disabled={Boolean(queue) || !initialTasks().length}
              onClick={() => void startQueue(initialTasks())}
            >
              {text(language, "generateInitial")}
            </Button>
            <Button
              variant="secondary"
              disabled={Boolean(queue) || !panels.length}
              onClick={() => void startQueue(regenerateAllTasks())}
            >
              全部重新生成 × {project.initialGenerationCount}
            </Button>
            <Button
              variant="secondary"
              disabled={Boolean(queue) || !panels.length}
              onClick={() =>
                void startQueue(
                  panels.map((panel) => ({ panelId: panel.id, ordinal: 0 })),
                )
              }
            >
              {text(language, "addAll")}
            </Button>
            <Button
              variant="secondary"
              disabled={Boolean(queue) || selectedCount === 0}
              onClick={() => void exportZip()}
            >
              <Icon name="download" /> {text(language, "exportZip")}
            </Button>
            {queue && (
              <Button variant="danger" onClick={stopQueue}>
                {text(language, "stop")}
              </Button>
            )}
          </div>
          {queue && (
            <div className="tag-comic-progress-block">
              <div className="tag-comic-progress">
                <span
                  style={{
                    width: `${queue.total ? (queue.done / queue.total) * 100 : 0}%`,
                  }}
                />
              </div>
              <b>{format(language, "progress", queue)}</b>
            </div>
          )}
          <div className="tag-comic-gallery">
            {panels.map((panel) => {
              const main = selectedCandidate(panel);
              const expanded = expandedCandidates.has(panel.id);
              return (
                <article key={panel.id} className="tag-comic-result-card">
                  <header>
                    <div>
                      <b>#{panel.index}</b>
                      <strong>{panel.title}</strong>
                    </div>
                    <span className={clsx("tag-comic-status", panel.status)}>
                      {statusLabel(language, panel)}
                    </span>
                  </header>
                  {main ? (
                    <button
                      type="button"
                      className="tag-comic-main-image"
                      onDoubleClick={() => setPreview(main.outputUrl)}
                      title={text(language, "previewHint")}
                    >
                      <img
                        src={main.outputUrl}
                        alt={panel.title}
                        loading="lazy"
                      />
                      <span>{text(language, "currentMain")}</span>
                    </button>
                  ) : (
                    <div className="tag-comic-no-image">
                      {text(language, "noCandidate")}
                    </div>
                  )}
                  {panel.error && (
                    <p className="tag-comic-error" role="alert">
                      {panel.error}
                    </p>
                  )}
                  <div className="tag-comic-result-actions">
                    <Button
                      variant="secondary"
                      disabled={Boolean(queue)}
                      onClick={() =>
                        void startQueue([{ panelId: panel.id, ordinal: 0 }])
                      }
                    >
                      {panel.status === "failed"
                        ? text(language, "retry")
                        : text(language, "addOne")}
                    </Button>
                    {panel.candidates.length > 1 && (
                      <Button
                        variant="ghost"
                        aria-expanded={expanded}
                        onClick={() =>
                          setExpandedCandidates((current) => {
                            const next = new Set(current);
                            if (next.has(panel.id)) next.delete(panel.id);
                            else next.add(panel.id);
                            return next;
                          })
                        }
                      >
                        {expanded
                          ? text(language, "hideCandidates")
                          : text(language, "showCandidates")}
                      </Button>
                    )}
                  </div>
                  <AnimatedCollapse open={expanded}>{<div className="tag-comic-candidates">
                      <h4>
                        {format(language, "candidates", {
                          count: panel.candidates.length,
                        })}
                      </h4>
                      <div>
                        {panel.candidates.map((candidate, index) => (
                          <button
                            key={candidate.id}
                            type="button"
                            className={clsx(
                              candidate.id === panel.selectedCandidateId &&
                                "selected",
                            )}
                            onClick={() =>
                              patchPanel(panel.id, (current) => ({
                                ...current,
                                selectedCandidateId: candidate.id,
                              }))
                            }
                            onDoubleClick={() =>
                              setPreview(candidate.outputUrl)
                            }
                            title={text(language, "chooseMain")}
                          >
                            <img
                              src={candidate.outputUrl}
                              alt={`${panel.title} ${index + 1}`}
                              loading="lazy"
                            />
                            <span>{index + 1}</span>
                          </button>
                        ))}
                      </div>
                    </div>}</AnimatedCollapse>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {preview && (
        <div
          className="redraw-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={text(language, "closePreview")}
          onClick={() => setPreview(null)}
        >
          <PreviewImageViewer onBackgroundClick={()=>setPreview(null)} images={previewItems.map(src=>({src,alt:text(language,"closePreview")}))} index={Math.max(0,previewItems.indexOf(preview))} onIndex={index=>setPreview(previewItems[index])}/>
          <button
            type="button"
            className="redraw-lightbox-close"
            aria-label={text(language, "closePreview")}
            onClick={() => setPreview(null)}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {showReferencePresets && (
        <ReferencePresetManager
          modal
          allowedKinds={["precise"]}
          onBack={() => setShowReferencePresets(false)}
          onApplied={() => setShowReferencePresets(false)}
          onApplyPreset={importPrecisePreset}
        />
      )}
    </main>
  );
}

function GlobalParams({
  language,
  params,
  patch,
  negativePrompt,
  onNegativeChange,
  expanded,
  toggle,
}: {
  language: unknown;
  params: GenerateParams;
  patch: <K extends keyof GenerateParams>(
    key: K,
    value: GenerateParams[K],
  ) => void;
  negativePrompt: string;
  onNegativeChange: (value: string) => void;
  expanded: boolean;
  toggle: () => void;
}) {
  return (
    <div className="tag-comic-params">
      <div className="tag-comic-param-grid">
        <label className="wide">
          <span>{text(language, "globalNegative")}</span>
          <textarea
            value={negativePrompt}
            onChange={(event) => onNegativeChange(event.target.value)}
          />
        </label>
        <label>
          <span>{text(language, "model")}</span>
          <SelectMenuCompat
            value={params.model}
            onChange={(event) => {
              const model = event.target.value as GenerateParams["model"];
              patch("model", model);
              if (!isNAIV5Model(model)) {
                if (params.qualityPreset === "light") {
                  patch("qualityPreset", "standard");
                  patch("qualityToggle", true);
                }
                patch("transparentBackground", false);
              }
            }}
          >
            {NAI_MODELS.map((model) => (
              <option key={model.value} value={model.value}>
                {model.label}
              </option>
            ))}
          </SelectMenuCompat>
        </label>
        <CommittedNumberInput
          label={text(language, "width")}
          value={params.width}
          min={NAI_MIN_DIMENSION}
          max={maxNAIDimensionFor(params.height)}
          step={NAI_DIMENSION_STEP}
          normalize={(value) =>
            snapNAIDimensionWithinArea(value, params.height, params.width)
          }
          onCommit={(value) => patch("width", value)}
        />
        <CommittedNumberInput
          label={text(language, "height")}
          value={params.height}
          min={NAI_MIN_DIMENSION}
          max={maxNAIDimensionFor(params.width)}
          step={NAI_DIMENSION_STEP}
          normalize={(value) =>
            snapNAIDimensionWithinArea(value, params.width, params.height)
          }
          onCommit={(value) => patch("height", value)}
        />
        <NumberInput
          label={text(language, "steps")}
          value={params.steps}
          min={1}
          max={50}
          onChange={(value) => patch("steps", value)}
        />
        <TagComicQualityFields
          language={language}
          params={params}
          patch={patch}
        />
      </div>
      <button
        type="button"
        className="tag-comic-disclosure"
        onClick={toggle}
        aria-expanded={expanded}
      >
        {expanded ? text(language, "collapse") : text(language, "advanced")}
      </button>
      <AnimatedCollapse open={expanded}>{<PanelParams
          language={language}
          params={params}
          patch={patch}
          compact
        />}</AnimatedCollapse>
    </div>
  );
}

function PanelParams({
  language,
  params,
  patch,
  compact = false,
}: {
  language: unknown;
  params: GenerateParams;
  patch: <K extends keyof GenerateParams>(
    key: K,
    value: GenerateParams[K],
  ) => void;
  compact?: boolean;
}) {
  return (
    <div className={clsx("tag-comic-param-grid", compact && "compact")}>
      {!compact && (
        <label>
          <span>{text(language, "model")}</span>
          <SelectMenuCompat
            value={params.model}
            onChange={(event) => {
              const model = event.target.value as GenerateParams["model"];
              patch("model", model);
              if (!isNAIV5Model(model)) {
                if (params.qualityPreset === "light") {
                  patch("qualityPreset", "standard");
                  patch("qualityToggle", true);
                }
                patch("transparentBackground", false);
              }
            }}
          >
            {NAI_MODELS.map((model) => (
              <option key={model.value} value={model.value}>
                {model.label}
              </option>
            ))}
          </SelectMenuCompat>
        </label>
      )}
      <label>
        <span>{text(language, "sampler")}</span>
        <SelectMenuCompat
          value={params.sampler}
          onChange={(event) =>
            patch("sampler", event.target.value as GenerateParams["sampler"])
          }
        >
          {NAI_SAMPLERS.map((sampler) => (
            <option key={sampler.value} value={sampler.value}>
              {sampler.label}
            </option>
          ))}
        </SelectMenuCompat>
      </label>
      {!compact && (
        <CommittedNumberInput
          label={text(language, "width")}
          value={params.width}
          min={NAI_MIN_DIMENSION}
          max={maxNAIDimensionFor(params.height)}
          step={NAI_DIMENSION_STEP}
          normalize={(value) =>
            snapNAIDimensionWithinArea(value, params.height, params.width)
          }
          onCommit={(value) => patch("width", value)}
        />
      )}
      {!compact && (
        <CommittedNumberInput
          label={text(language, "height")}
          value={params.height}
          min={NAI_MIN_DIMENSION}
          max={maxNAIDimensionFor(params.width)}
          step={NAI_DIMENSION_STEP}
          normalize={(value) =>
            snapNAIDimensionWithinArea(value, params.width, params.height)
          }
          onCommit={(value) => patch("height", value)}
        />
      )}
      <NumberInput
        label={text(language, "steps")}
        value={params.steps}
        min={1}
        max={50}
        onChange={(value) => patch("steps", value)}
      />
      <NumberInput
        label={text(language, "cfg")}
        value={params.cfgScale}
        min={0}
        max={10}
        step={0.1}
        onChange={(value) => patch("cfgScale", value)}
      />
      <NumberInput
        label={text(language, "seed")}
        value={params.seedMode === "random" ? 0 : params.seed}
        min={0}
        max={2147483647}
        onChange={(value) => {
          patch("seed", value);
          patch("seedMode", value > 0 ? "fixed" : "random");
        }}
      />
      {!compact && (
        <TagComicQualityFields
          language={language}
          params={params}
          patch={patch}
        />
      )}
    </div>
  );
}

function TagComicQualityFields({
  language,
  params,
  patch,
}: {
  language: unknown;
  params: GenerateParams;
  patch: <K extends keyof GenerateParams>(
    key: K,
    value: GenerateParams[K],
  ) => void;
}) {
  return (
    <QualityPresetControl
      className="wide"
      language={language}
      model={params.model}
      value={params.qualityPreset}
      transparentBackground={params.transparentBackground}
      onChange={(qualityPreset) => {
        patch("qualityPreset", qualityPreset);
        patch("qualityToggle", qualityPreset !== "none");
      }}
      onTransparentChange={(transparentBackground) =>
        patch("transparentBackground", transparentBackground)
      }
    />
  );
}
