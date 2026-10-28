import {AnimatedCollapse} from './components/CharacterEditing';
import { MetadataApplyPanel } from "./MetadataApplyPanel";
import { metadataApplyKeys } from "./metadata-selection";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Button, IconText, SelectMenu } from "./components/ui";
import { Icon } from "./components/icons";
import { normalizeAppLanguage } from "./i18n";
import { inspectImageMetadata, type ImageMetadataReport } from "./png-meta";
import {
  loadMetadataRecoveryMode,
  readImageMetadataForRecovery,
  saveMetadataRecoveryMode,
  type MetadataRecoveryMode,
} from "./metadata-recovery";
import { metadataRecoveryText } from "./metadata-recovery-i18n";
import { originalOfficialMetadata } from "../shared/official-metadata-result";
import "./metadata-recovery.css";
import {
  loadMetadataSnapshot,
  metadataSnapshotToFile,
  saveMetadataSnapshot,
} from "./metadata-snapshot";
import { useAppStore } from "./store";
import type { AppLanguage, HistoryGroup, HistoryItem, ImportedParams } from "./types";

type MetadataText = {
  eyebrow: string;
  title: string;
  subtitle: string;
  back: string;
  dropTitle: string;
  dropHint: string;
  choose: string;
  imageAlt: string;
  detected: string;
  sourceNovelAi: string;
  sourceSd: string;
  sourceComfy: string;
  sourceUnknown: string;
  compatible: string;
  compatibleHint: string;
  apply: string;
  applied: string;
  noCompatible: string;
  params: string;
  noParams: string;
  raw: string;
  copyRaw: string;
  copied: string;
  copyItem: string;
  itemCopied: string;
  localOnly: string;
  replace: string;
  viewOnly: string;
  readFailed: string;
  historyTitle: string;
  historyHint: string;
  historyGroup: string;
  allGroups: string;
  ungrouped: string;
  historyEmpty: string;
  historyLoading: string;
  historyFailed: string;
  historySelected: string;
  historyImageAlt: string;
  collapseHistory: string;
  expandHistory: string;
  loadMore: string;
};

const TEXT: Record<AppLanguage, MetadataText> = {
  "zh-CN": {
    eyebrow: "IMAGE METADATA",
    title: "恢复图片原数据",
    subtitle: "读取 NovelAI、Stable Diffusion WebUI / Forge 与 ComfyUI 图片内嵌参数。",
    back: "返回工具首页",
    dropTitle: "导入原始图片",
    dropHint: "拖入或选择 PNG、JPG、JPEG、WebP；全程只在本机读取，不会上传。",
    choose: "选择图片",
    imageAlt: "待解析图片",
    detected: "识别来源",
    sourceNovelAi: "NovelAI",
    sourceSd: "Stable Diffusion WebUI / Forge",
    sourceComfy: "ComfyUI",
    sourceUnknown: "未知或无可识别参数",
    compatible: "可一键使用的参数",
    compatibleHint: "只套用 NovelAI 支持的兼容项；SD 模型、VAE、LoRA 等原值保留在下方供查看。",
    apply: "一键使用到生成",
    applied: "已套用兼容参数并切换到生成面板",
    noCompatible: "没有可直接套用到 NovelAI 的兼容参数",
    params: "逐项参数",
    noParams: "没有读取到可展示的生成参数。图片可能被平台压缩或导出时关闭了元数据。",
    raw: "完整原始数据",
    copyRaw: "复制原始数据",
    copied: "原始数据已复制",
    copyItem: "复制此项",
    itemCopied: "已复制",
    localOnly: "零积分 · 不调用 AI · 不发送网络请求",
    replace: "更换图片",
    viewOnly: "部分 Stable Diffusion / ComfyUI 专用参数只能查看，无法直接套用到 NovelAI。",
    readFailed: "无法读取该图片，请确认文件未损坏并重新选择原图。",
    historyTitle: "从历史与分组选择",
    historyHint: "直接点击分组中的图片，即可读取并显示其原数据。",
    historyGroup: "图片分组",
    allGroups: "全部分组",
    ungrouped: "未分组",
    historyEmpty: "该分组中没有可读取的图片。",
    historyLoading: "正在读取历史图片…",
    historyFailed: "无法读取历史图片列表。",
    historySelected: "已读取图片原数据",
    historyImageAlt: "历史图片",
    collapseHistory: "收起历史图片",
    expandHistory: "展开历史图片",
    loadMore: "加载更多",
  },
};

export const IMPORT_LABELS: Record<keyof ImportedParams, string> = {
  preservePromptText: "Preserve prompt text",
  metadataReplay: "Original sampling flags",
  positivePrompt: "Positive prompt",
  negativePrompt: "Negative prompt",
  stylePrompt: "Style prompt",
  effort: "Effort",
    model: "Model",
  steps: "Steps",
  cfgScale: "CFG scale",
  cfgRescale: "CFG rescale",
  sampler: "Sampler",
  noiseSchedule: "Noise schedule",
  seed: "Seed",
  seedMode: "Seed mode",
  width: "Width",
  height: "Height",
  smea: "SMEA",
  smeaDyn: "SMEA Dyn",
  ucPreset: "UC preset",
  qualityPreset: "Quality preset",
  qualityToggle: "Quality toggle",
  transparentBackground: "Transparent background",
  variety: "Variety+",
};

const PARAMETER_ENGLISH: Record<string, string> = {
  "positive prompt": "Positive prompt",
  "negative prompt": "Negative prompt",
  "style prompt": "Style prompt",
  description: "Description",
  prompt: "Prompt",
  uc: "Undesired content",
  steps: "Steps",
  "cfg scale": "CFG scale",
  scale: "CFG scale",
  "cfg rescale": "CFG rescale",
  cfg_rescale: "CFG rescale",
  sampler: "Sampler",
  scheduler: "Scheduler",
  "schedule type": "Schedule type",
  "noise schedule": "Noise schedule",
  noise_schedule: "Noise schedule",
  seed: "Seed",
  "seed mode": "Seed mode",
  width: "Width",
  height: "Height",
  size: "Size",
  model: "Model",
  source: "Source",
  software: "Software",
  "model hash": "Model hash",
  vae: "VAE",
  "vae hash": "VAE hash",
  lora: "LoRA",
  checkpoint: "Checkpoint",
  denoise: "Denoise",
  "denoising strength": "Denoising strength",
  "clip skip": "Clip skip",
  version: "Version",
  smea: "SMEA",
  sm: "SMEA",
  "smea dyn": "SMEA Dyn",
  sm_dyn: "SMEA Dyn",
  dynamic_thresholding: "Dynamic thresholding",
  qualitytoggle: "Quality toggle",
  "quality toggle": "Quality toggle",
  "uc preset": "UC preset",
  "variety+": "Variety+",
  params_version: "Parameters version",
  "hires steps": "Hires steps",
  "hires upscale": "Hires upscale",
  "hires upscaler": "Hires upscaler",
  "hires prompt": "Hires prompt",
  "hires negative prompt": "Hires negative prompt",
  "lora hashes": "LoRA hashes",
  "adetailer model": "ADetailer model",
  "adetailer prompt": "ADetailer prompt",
  "adetailer negative prompt": "ADetailer negative prompt",
  "adetailer confidence": "ADetailer confidence",
  "adetailer dilate erode": "ADetailer dilate/erode",
  "adetailer mask blur": "ADetailer mask blur",
  "adetailer denoising strength": "ADetailer denoising strength",
  "adetailer inpaint only masked": "ADetailer inpaint only masked",
  "adetailer inpaint padding": "ADetailer inpaint padding",
  "adetailer version": "ADetailer version",
  "skip_cfg_above_sigma": "Skip CFG above sigma",
  "controlnet_strength": "ControlNet strength",
  "reference_strength_multiple": "Reference strengths",
  "reference_information_extracted_multiple": "Reference information extracted",
  "director_reference_strength_values": "Director reference strengths",
  "director_reference_information_extracted": "Director reference information extracted",
};

const PARAMETER_TRANSLATIONS: Record<AppLanguage, Record<string, string>> = {
  "zh-CN": {
    "Positive prompt": "正面提示词", "Negative prompt": "负面提示词", Description: "提示词描述",
    Prompt: "提示词", "Undesired content": "不希望出现的内容", Steps: "采样步数", "CFG scale": "提示词引导强度",
    "CFG rescale": "CFG 重缩放", Sampler: "采样器", Scheduler: "调度器", "Schedule type": "调度类型",
    "Noise schedule": "噪声调度", Seed: "种子", "Seed mode": "种子模式", Width: "宽度", Height: "高度",
    Size: "尺寸", Model: "模型", Source: "来源模型", Software: "生成软件", "Model hash": "模型哈希",
    VAE: "VAE 模型", "VAE hash": "VAE 哈希", LoRA: "LoRA 模型", Checkpoint: "基础模型",
    Denoise: "降噪强度", "Denoising strength": "重绘强度", "Clip skip": "CLIP 跳过层数", Version: "版本",
    SMEA: "SMEA 平滑", "SMEA Dyn": "动态 SMEA", "Dynamic thresholding": "动态阈值",
    "Quality toggle": "质量增强", "Style prompt": "风格提示词", "UC preset": "负面预设", "Variety+": "多样化", "Parameters version": "参数版本", "Hires steps": "高清修复步数",
    "Hires upscale": "高清放大倍数", "Hires upscaler": "高清放大算法",
    "Hires prompt": "高清修复提示词", "Hires negative prompt": "高清修复负面提示词", "LoRA hashes": "LoRA 哈希",
    "ADetailer model": "细节修复模型", "ADetailer prompt": "细节修复提示词", "ADetailer negative prompt": "细节修复负面提示词",
    "ADetailer confidence": "细节检测置信度", "ADetailer dilate/erode": "细节遮罩扩张/侵蚀", "ADetailer mask blur": "细节遮罩模糊",
    "ADetailer denoising strength": "细节修复重绘强度", "ADetailer inpaint only masked": "仅重绘细节遮罩", "ADetailer inpaint padding": "细节重绘边距", "ADetailer version": "细节修复版本",
    "Skip CFG above sigma": "高噪声阶段跳过 CFG", "ControlNet strength": "ControlNet 强度", "Reference strengths": "参考图强度组",
    "Reference information extracted": "参考图信息提取组", "Director reference strengths": "精准参考强度组", "Director reference information extracted": "精准参考信息提取组",
  },
};

const GROUP_LABELS: Record<ImageMetadataReport["entries"][number]["group"], string> = {
  generation: "Generation",
  model: "Model",
  image: "Image",
  raw: "Raw",
};

export function parameterLabel(language: AppLanguage, key: string) {
  const english = PARAMETER_ENGLISH[key.trim().toLowerCase()] ?? key;
  const translated = PARAMETER_TRANSLATIONS[language][english] ?? "其他参数";
  return `${translated} (${english})`;
}

const GROUP_TRANSLATIONS: Record<string, string> = { Generation: "生成参数", Model: "模型参数", Image: "图像参数", Raw: "原始数据" };

export function groupLabel(_language: AppLanguage, group: keyof typeof GROUP_LABELS) {
  const english = GROUP_LABELS[group];
  return `${GROUP_TRANSLATIONS[english] ?? english} (${english})`;
}

function sourceLabel(report: ImageMetadataReport, text: MetadataText) {
  if (report.kind === "novelai") return text.sourceNovelAi;
  if (report.kind === "stable-diffusion") return text.sourceSd;
  if (report.kind === "comfyui") return text.sourceComfy;
  return text.sourceUnknown;
}

export default function MetadataInspector({ onBack }: { onBack: () => void }) {
  const language = normalizeAppLanguage(useAppStore((state) => state.settings?.language));
  const activeTab = useAppStore((state) => state.activeTab);
  const setToast = useAppStore((state) => state.setToast);
  const text = TEXT[language];
  const recoveryText = metadataRecoveryText(language);
  const [recoveryMode, setRecoveryMode] = useState<MetadataRecoveryMode>(loadMetadataRecoveryMode);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState("");
  const [preferenceNotSaved, setPreferenceNotSaved] = useState(false);
  const [hasOfficialOriginal, setHasOfficialOriginal] = useState(false);
  const [report, setReport] = useState<ImageMetadataReport | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyGroups, setHistoryGroups] = useState<HistoryGroup[]>([]);
  const [historyGroupId, setHistoryGroupId] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyGroupsFailed, setHistoryGroupsFailed] = useState(false);
  const [historyRetryRevision, setHistoryRetryRevision] = useState(0);
  const [historyReadingId, setHistoryReadingId] = useState("");
  const [selectedHistoryId, setSelectedHistoryId] = useState("");
  const [historyDisplayLimit, setHistoryDisplayLimit] = useState(60);
  const inputRef = useRef<HTMLInputElement>(null);
  const readRevisionRef = useRef(0);
  const historyLoadRevisionRef = useRef(0);
  const historyReadRevisionRef = useRef(0);
  const historyReadInFlightRef = useRef(0);
  const recoveryModeRef = useRef(recoveryMode);
  const currentFileRef = useRef<File | null>(null);
  const activeReadAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    readRevisionRef.current += 1;
    historyReadRevisionRef.current += 1;
    activeReadAbortRef.current?.abort();
    activeReadAbortRef.current = null;
  }, []);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const compatibleEntries = useMemo(
    () =>
      report
        ? metadataApplyKeys(report)
        : [],
    [report],
  );
  const visibleHistoryItems = useMemo(() => historyItems.filter((item) => {
    if (!historyGroupId) return true;
    if (historyGroupId === "__ungrouped") return !item.groupId;
    return item.groupId === historyGroupId;
  }), [historyGroupId, historyItems]);
  const renderedHistoryItems = useMemo(
    () => visibleHistoryItems.slice(0, historyDisplayLimit),
    [historyDisplayLimit, visibleHistoryItems],
  );

  useEffect(() => setHistoryDisplayLimit(60), [historyGroupId]);

  const readFile = useCallback(async (
    file: File,
    persist = true,
    requestedRevision?: number,
  ): Promise<boolean> => {
    const revision = requestedRevision ?? ++readRevisionRef.current;
    const mode = recoveryModeRef.current;
    if (revision !== readRevisionRef.current) return false;
    activeReadAbortRef.current?.abort();
    const controller = new AbortController();
    activeReadAbortRef.current = controller;
    currentFileRef.current = file;
    // Never offer an old mode/file's report for application while a new read
    // is pending or has failed. Keep the original File for an explicit retry.
    setReport(null);
    setHasOfficialOriginal(false);
    setReading(true);
    setReadError("");
    setFileName(file.name);
    try {
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(file);
      });
      const buffer = await file.arrayBuffer();
      if (revision !== readRevisionRef.current || mode !== recoveryModeRef.current) return false;
      const metadata = await readImageMetadataForRecovery(buffer, mode, controller.signal);
      const next = inspectImageMetadata(metadata);
      if (revision !== readRevisionRef.current || mode !== recoveryModeRef.current) return false;
      const original = originalOfficialMetadata(metadata);
      if (original) {
        // A Comment envelope may be needed for existing app mapping. It is
        // not an original official field and must not replace provenance.
        next.rawText = JSON.stringify(original, null, 2);
        next.rawMetadata = Object.fromEntries(Object.entries(original).map(([key, value]) => [
          key, typeof value === "string" ? value : JSON.stringify(value),
        ]));
        setHasOfficialOriginal(true);
      }
      setReport(next);
      if (persist) void saveMetadataSnapshot(file).catch(() => undefined);
      return true;
    } catch {
      if (revision === readRevisionRef.current && mode === recoveryModeRef.current) {
        const message = mode === "online" ? recoveryText.onlineFailed : recoveryText.offlineFailed;
        setReadError(message);
        setToast(message);
      }
      return false;
    } finally {
      if (revision === readRevisionRef.current) {
        setReading(false);
        if (activeReadAbortRef.current === controller) activeReadAbortRef.current = null;
      }
    }
  }, [setToast, recoveryText.onlineFailed, recoveryText.offlineFailed]);

  function changeRecoveryMode(mode: MetadataRecoveryMode) {
    if (mode === recoveryModeRef.current) return;
    // Update refs synchronously: an old request may settle before React has
    // rendered the new choice. The mode itself is not a readFile dependency,
    // so changing it cannot accidentally reload an older persisted snapshot.
    readRevisionRef.current += 1;
    activeReadAbortRef.current?.abort();
    activeReadAbortRef.current = null;
    historyReadRevisionRef.current += 1;
    historyReadInFlightRef.current = 0;
    setHistoryReadingId("");
    recoveryModeRef.current = mode;
    setRecoveryMode(mode);
    setPreferenceNotSaved(!saveMetadataRecoveryMode(mode));
    setReport(null);
    setReadError("");
    setReading(false);
    const file = currentFileRef.current;
    if (file) void readFile(file, false);
  }

  // MetadataInspector stays mounted while hidden. Reload the latest hand-off
  // every time this tab becomes active instead of relying on a mount-only
  // effect, otherwise the history eye button can navigate to a blank page.
  useEffect(() => {
    activeReadAbortRef.current?.abort();
    activeReadAbortRef.current = null;
    setReading(false);
    if (activeTab !== "metadata") {
      readRevisionRef.current += 1;
      return;
    }
    const revision = ++readRevisionRef.current;
    let cancelled = false;
    void loadMetadataSnapshot().then((file) => {
      if (cancelled || revision !== readRevisionRef.current || !file) return;
      return readFile(file, false, revision);
    }).catch(() => {
      if (!cancelled && revision === readRevisionRef.current) setToast(text.readFailed);
    });
    return () => {
      cancelled = true;
      if (revision === readRevisionRef.current) readRevisionRef.current += 1;
    };
  }, [activeTab, readFile, setToast, text.readFailed]);

  // The history picker is also persistent. Invalidate its cache on every
  // metadata-page entry so reopening the picker retries a failed/stale load
  // without requiring a full application restart.
  useEffect(() => {
    if (activeTab === "metadata") {
      setHistoryLoaded(false);
      return;
    }
    historyLoadRevisionRef.current += 1;
    historyReadRevisionRef.current += 1;
    historyReadInFlightRef.current = 0;
    setHistoryLoading(false);
    setHistoryReadingId("");
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "metadata" || !historyOpen) {
      setHistoryLoading(false);
      return;
    }
    if (historyLoaded) return;
    const revision = ++historyLoadRevisionRef.current;
    setHistoryLoading(true);
    setHistoryError("");
    setHistoryGroupsFailed(false);
    void Promise.allSettled([
      Promise.resolve().then(() => window.naiDesktop.getHistory()),
      Promise.resolve().then(() => window.naiDesktop.getHistoryGroups()),
    ]).then(([items, groups]) => {
      if (revision !== historyLoadRevisionRef.current) return;
      // Set loading in the same update batch: historyLoaded's effect cleanup
      // must not invalidate a later finally and strand the spinner.
      setHistoryLoading(false);
      if (items.status === "fulfilled") {
        setHistoryItems(items.value);
        setHistoryLoaded(true);
      } else {
        setHistoryError(text.historyFailed);
        setToast(text.historyFailed);
      }
      if (groups.status === "fulfilled") setHistoryGroups(groups.value);
      else {
        setHistoryGroups([]);
        setHistoryGroupId("");
        setHistoryGroupsFailed(true);
      }
    });
    return () => {
      if (revision === historyLoadRevisionRef.current) historyLoadRevisionRef.current += 1;
    };
  }, [activeTab, historyLoaded, historyOpen, historyRetryRevision, setToast, text.historyFailed]);

  function retryHistory() {
    setHistoryLoaded(false);
    setHistoryRetryRevision((revision) => revision + 1);
  }

  async function readHistoryItem(item: HistoryItem) {
    if (historyReadInFlightRef.current) return;
    const historyRevision = ++historyReadRevisionRef.current;
    historyReadInFlightRef.current = historyRevision;
    const readRevision = ++readRevisionRef.current;
    setHistoryReadingId(item.id);
    try {
      const loaded = await window.naiDesktop.readMetadataSnapshotFromPath(item.filePath);
      if (!loaded.ok || !loaded.snapshot) throw new Error(loaded.message || text.readFailed);
      if (historyRevision !== historyReadRevisionRef.current) return;
      const file = metadataSnapshotToFile(loaded.snapshot);
      const applied = await readFile(file, false, readRevision);
      if (!applied || historyRevision !== historyReadRevisionRef.current) return;
      setSelectedHistoryId(item.id);
      setToast(text.historySelected);
    } catch {
      if (historyRevision === historyReadRevisionRef.current) setToast(text.readFailed);
    } finally {
      if (historyReadInFlightRef.current === historyRevision) historyReadInFlightRef.current = 0;
      if (historyRevision === historyReadRevisionRef.current) setHistoryReadingId("");
    }
  }

  async function copyRaw() {
    if (!report?.rawText) return;
    await navigator.clipboard.writeText(report.rawText);
    setToast(text.copied);
  }

  async function copyItem(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setToast(`${text.itemCopied}: ${label}`);
  }

  return (
    <main className="metadata-inspector">
      <header className="metadata-header">
        <div>
          <span className="eyebrow">{text.eyebrow}</span>
          <h2>{text.title}</h2>
          <p>{text.subtitle}</p>
        </div>
        <Button onClick={onBack} variant="secondary">{text.back}</Button>
      </header>

      <section className="metadata-recovery-settings" aria-label={recoveryText.mode}>
        <div className="metadata-recovery-select">
          <SelectMenu
            id="metadata-recovery-mode"
            value={recoveryMode}
            label={recoveryText.mode}
            ariaLabel={recoveryText.mode}
            ariaDescribedBy="metadata-recovery-privacy"
            options={[
              { value: "online", label: recoveryText.online },
              { value: "offline", label: recoveryText.offline },
            ]}
            onChange={(mode) => {
              if (mode === "online" || mode === "offline") changeRecoveryMode(mode);
            }}
          />
        </div>
        <p id="metadata-recovery-privacy">
          {recoveryMode === "online" ? recoveryText.onlinePrivacy : recoveryText.offlinePrivacy}
        </p>
        {preferenceNotSaved && (
          <p className="metadata-recovery-storage-warning" role="status">{recoveryText.preferenceNotSaved}</p>
        )}
      </section>

      {reading && <p className="metadata-recovery-status" role="status">{recoveryText.reading}</p>}
      {readError && (
        <section className="metadata-recovery-error" role="alert">
          <p>{readError}</p>
          <div className="metadata-recovery-error-actions">
            <Button variant="secondary" onClick={() => {
              const file = currentFileRef.current;
              if (file) void readFile(file, false);
            }}>{recoveryText.retry}</Button>
            {recoveryMode === "online" && (
              <Button variant="secondary" onClick={() => changeRecoveryMode("offline")}>{recoveryText.chooseOffline}</Button>
            )}
          </div>
        </section>
      )}

      <section className={clsx("metadata-history-picker", historyOpen && "open")}>
        <button
          type="button"
          className="metadata-history-summary"
          onClick={() => setHistoryOpen((open) => !open)}
          aria-expanded={historyOpen}
          aria-label={historyOpen ? text.collapseHistory : text.expandHistory}
        >
          <span className="metadata-history-summary-icon"><Icon name="folderOpen" /></span>
          <span>
            <strong>{text.historyTitle}</strong>
            <small>{text.historyHint}</small>
          </span>
          <em aria-live="polite">{historyLoading ? "…" : historyError ? recoveryText.historyUnavailable : historyLoaded ? visibleHistoryItems.length : recoveryText.historyNotLoaded}</em>
          <Icon name="chevronRight" className={clsx("disclosure-chevron", historyOpen && "open")} />
        </button>
        <AnimatedCollapse open={historyOpen}>{<div className="metadata-history-content">
            <div className="metadata-history-filter">
              <SelectMenu
                value={historyGroupId}
                ariaLabel={text.historyGroup}
                label={text.historyGroup}
                options={[
                  { value: "", label: text.allGroups },
                  { value: "__ungrouped", label: text.ungrouped },
                  ...historyGroups.map((group) => ({ value: group.id, label: group.name })),
                ]}
                onChange={setHistoryGroupId}
              />
            </div>
            {historyGroupsFailed && historyLoaded && (
              <p className="metadata-history-empty" role="status">{recoveryText.historyGroupsFailed}</p>
            )}
            {(historyError || historyGroupsFailed) && !historyLoading && (
              <div className="metadata-history-retry">
                {historyError && <p className="metadata-history-empty" role="alert">{historyError}</p>}
                <Button variant="secondary" onClick={retryHistory}>{recoveryText.historyRetry}</Button>
              </div>
            )}
            {historyLoading ? (
              <p className="metadata-history-empty">{text.historyLoading}</p>
            ) : historyError ? null : historyLoaded && visibleHistoryItems.length === 0 ? (
              <p className="metadata-history-empty">{text.historyEmpty}</p>
            ) : historyLoaded ? (
              <div className="metadata-history-grid">
                {renderedHistoryItems.map((item) => {
                  const name = item.filePath.split(/[\\/]/).pop() || item.filePath;
                  const selected = item.id === selectedHistoryId;
                  return (
                    <button
                      type="button"
                      className={clsx("metadata-history-item", selected && "selected")}
                      key={item.id}
                      disabled={Boolean(historyReadingId)}
                      onClick={() => void readHistoryItem(item)}
                      title={name}
                    >
                      <span className="metadata-history-thumb">
                        <img src={item.fileUrl} alt={`${text.historyImageAlt}: ${name}`} loading="lazy" decoding="async" />
                        {historyReadingId === item.id && <i className="metadata-history-spinner" aria-hidden="true" />}
                      </span>
                      <strong>{name}</strong>
                      <small>{item.width} × {item.height}</small>
                    </button>
                  );
                })}
              </div>
            ) : null}
            {historyLoaded && !historyLoading && !historyError && visibleHistoryItems.length > renderedHistoryItems.length && (
              <Button
                className="metadata-history-more"
                variant="secondary"
                onClick={() => setHistoryDisplayLimit((limit) => limit + 60)}
              >
                {text.loadMore} · {renderedHistoryItems.length}/{visibleHistoryItems.length}
              </Button>
            )}
          </div>}</AnimatedCollapse>
      </section>

      <section
        className={clsx("metadata-drop", dragging && "dragging", report && "has-image")}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        data-image-paste="drop" tabIndex={0} onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) void readFile(file);
        }}
      >
        {previewUrl ? (
          <img src={previewUrl} alt={text.imageAlt} />
        ) : (
          <div className="metadata-drop-icon"><Icon name="eye" /></div>
        )}
        <div className="metadata-drop-copy">
          <strong>{fileName || text.dropTitle}</strong>
          <span>{text.dropHint}</span>
          <small>{recoveryMode === "online" ? recoveryText.onlineSummary : text.localOnly}</small>
        </div>
        <Button onClick={() => inputRef.current?.click()} variant={report ? "secondary" : "primary"}>
          <IconText icon={<Icon name="folderOpen" />}>{report ? text.replace : text.choose}</IconText>
        </Button>
        <input
          ref={inputRef}
          type="file"
          hidden
          accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readFile(file);
            event.target.value = "";
          }}
        />
      </section>

      {report && (
        <>
          <section className="metadata-summary">
            <div>
              <span>{text.detected}</span>
              <strong>{sourceLabel(report, text)}</strong>
              <small>{report.software}</small>
            </div>
            <div>
              <span>{text.compatible}</span>
              <strong>{compatibleEntries.length}</strong>
              <small>{text.compatibleHint}</small>
            </div>
          </section>
          <MetadataApplyPanel report={report} language={language} />

          <section className="metadata-section">
            <h3>{text.params}</h3>
            {report.entries.length ? (
              <div className="metadata-param-list">
                {report.entries.map((entry, index) => (
                  <article key={entry.group + "-" + entry.key + "-" + index}>
                    <div>
                      <span>{groupLabel(language, entry.group)}</span>
                      <strong>{parameterLabel(language, entry.key)}</strong>
                    </div>
                    <pre>{entry.value}</pre>
                    <button
                      type="button"
                      className="metadata-copy-item"
                      title={`${text.copyItem}: ${parameterLabel(language, entry.key)}`}
                      aria-label={`${text.copyItem}: ${parameterLabel(language, entry.key)}`}
                      onClick={() => void copyItem(entry.value, parameterLabel(language, entry.key))}
                    >
                      <Icon name="copy" />
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="metadata-empty">{text.noParams}</p>
            )}
          </section>

          {(report.kind === "stable-diffusion" || report.kind === "comfyui") && (
            <section className="metadata-warnings" aria-live="polite">
              <Icon name="warning" />
              <div><p>{text.viewOnly}</p></div>
            </section>
          )}

          <details className="metadata-raw">
            <summary>{text.raw}</summary>
            {hasOfficialOriginal && <p className="metadata-recovery-original-note">{recoveryText.mappingWrapper}</p>}
            <div className="metadata-raw-actions">
              <Button onClick={() => void copyRaw()} variant="secondary">{text.copyRaw}</Button>
            </div>
            <pre>{report.rawText || text.noParams}</pre>
          </details>
        </>
      )}
    </main>
  );
}
