import { applyTuiwenAspectToParams, TUIWEN_CANVAS_PRESETS } from "./aspect";
import {
  DEFAULT_PARAMS,
  type GenerateParams,
  type TuiwenAspectRatio,
  type TuiwenExportSettings,
  type TuiwenKeyframeConfig,
  type TuiwenPreflightState,
  type TuiwenProject,
  type TuiwenShot,
} from "../types";

export const TUIWEN_STEPS = [
  { key: "import", label: "导入", hint: "小说 / 字幕 / 画幅" },
  { key: "storyboard", label: "分镜旁白", hint: "旁白 · 画面 · 提示词" },
  { key: "references", label: "角色参考", hint: "精准参考 · 角色库" },
  { key: "generate", label: "生图", hint: "续跑 · 成本 · 重试" },
  { key: "audio", label: "配音", hint: "导入 · TTS · 时长" },
  { key: "motion", label: "运镜转场", hint: "Ken Burns · 转场" },
  { key: "export", label: "剪映导出", hint: "BGM · 首尾卡 · 草稿" },
] as const;

export type TuiwenStepKey = (typeof TUIWEN_STEPS)[number]["key"];

export const DEFAULT_TUIWEN_PREFLIGHT: TuiwenPreflightState = {
  preciseReferenceVerified: false,
  jianyingGoldenSampleReady: true,
  jianyingMediaBundleVerified: true,
  desktopOnlyAcknowledged: true,
};

export const DEFAULT_TUIWEN_KEYFRAME: TuiwenKeyframeConfig = {
  preset: "kenBurns",
  keys: [
    { timeRatio: 0, scale: 1.08, x: 0, y: 0, alpha: 1, rotation: 0 },
    { timeRatio: 1, scale: 1.16, x: -0.02, y: -0.01, alpha: 1, rotation: 0 },
  ],
};

export function createDefaultTuiwenExportSettings(aspectRatio: TuiwenAspectRatio = "9:16"): TuiwenExportSettings {
  const canvas = TUIWEN_CANVAS_PRESETS[aspectRatio];
  return {
    aspectRatio,
    width: canvas.width,
    height: canvas.height,
    fps: 30,
    defaultShotDurationMs: 3000,
    subtitleDefault: {
      fontSize: 44,
      color: "#ffffff",
      strokeColor: "#111827",
      position: "bottom",
    },
    bgm: undefined,
    intro: { text: "", durationMs: 1600 },
    outro: { text: "", durationMs: 1800 },
    jianyingDraftDir: "",
  };
}

export function createTuiwenShot(narration: string, index: number, durationMs: number): TuiwenShot {
  const text = narration.trim();
  return {
    id: crypto.randomUUID(),
    index,
    narration: text,
    cnPrompt: text,
    contextSummary: text.slice(0, 120),
    enPrompt: "",
    localNegativePrompt: "",
    negativeMode: "append",
    paramsOverride: { enabled: false, params: {} },
    status: "draft",
    durationMs,
    subtitle: { text, enabled: true },
    keyframe: { ...DEFAULT_TUIWEN_KEYFRAME, keys: DEFAULT_TUIWEN_KEYFRAME.keys.map((key) => ({ ...key })) },
    transition: { preset: "fade", durationMs: 250 },
  };
}

export function createDefaultTuiwenProject(params: GenerateParams = DEFAULT_PARAMS): TuiwenProject {
  const exportSettings = createDefaultTuiwenExportSettings();
  return {
    id: crypto.randomUUID(),
    title: "未命名小说推文",
    rawScript: "",
    mode: "natural",
    desiredPanelCount: "auto",
    globalPrompt: "",
    globalCharacterSetting: "",
    continuityBible: "",
    globalStylePrompt: params.stylePrompt,
    globalNegativePrompt: params.negativePrompt,
    adultBranch: false,
    inheritPreviousFrame: false,
    autoExportZip: false,
    globalParams: applyTuiwenAspectToParams({ ...params, positivePrompt: "", fileNamePrefix: "" }, exportSettings.aspectRatio),
    references: [],
    source: { type: "novel", fileName: "" },
    panels: [],
    exportSettings,
    preflight: { ...DEFAULT_TUIWEN_PREFLIGHT },
  };
}

function normalizeShot(raw: Partial<TuiwenShot>, index: number, fallbackDurationMs: number): TuiwenShot {
  const narration = String(raw.narration ?? raw.cnPrompt ?? "");
  return {
    ...createTuiwenShot(narration, index + 1, fallbackDurationMs),
    ...raw,
    id: raw.id || crypto.randomUUID(),
    index: index + 1,
    narration,
    subtitle: {
      text: raw.subtitle?.text ?? narration,
      enabled: raw.subtitle?.enabled ?? true,
      style: raw.subtitle?.style,
    },
    keyframe: raw.keyframe ?? { ...DEFAULT_TUIWEN_KEYFRAME, keys: DEFAULT_TUIWEN_KEYFRAME.keys.map((key) => ({ ...key })) },
    durationMs: Number.isFinite(raw.durationMs) && raw.durationMs ? Number(raw.durationMs) : fallbackDurationMs,
    status: raw.status === "done" || raw.status === "failed" || raw.status === "generating" || raw.status === "converted" ? raw.status : "draft",
    paramsOverride: raw.paramsOverride ?? { enabled: false, params: {} },
  };
}

export function normalizeTuiwenProject(raw: unknown, params: GenerateParams = DEFAULT_PARAMS): TuiwenProject {
  if (!raw || typeof raw !== "object") return createDefaultTuiwenProject(params);
  const source = raw as Partial<TuiwenProject>;
  const base = createDefaultTuiwenProject(params);
  const exportSettings = {
    ...base.exportSettings,
    ...(source.exportSettings ?? {}),
    subtitleDefault: { ...base.exportSettings.subtitleDefault, ...(source.exportSettings?.subtitleDefault ?? {}) },
  };
  const panels = Array.isArray(source.panels)
    ? source.panels.map((panel, index) => normalizeShot(panel, index, exportSettings.defaultShotDurationMs))
    : [];
  return {
    ...base,
    ...source,
    id: source.id || base.id,
    title: source.title || base.title,
    globalParams: { ...base.globalParams, ...(source.globalParams ?? {}) },
    source: {
      type: source.source?.type === "subtitle" ? "subtitle" : "novel",
      fileName: source.source?.fileName ?? "",
      subtitleFormat: source.source?.subtitleFormat,
    },
    exportSettings,
    preflight: {
      ...base.preflight,
      ...(source.preflight ?? {}),
      jianyingGoldenSampleReady: true,
      jianyingMediaBundleVerified: true,
      desktopOnlyAcknowledged: true,
    },
    panels,
  };
}

export function hasTuiwenProjectWork(project: Pick<TuiwenProject, "panels" | "rawScript" | "references">): boolean {
  return Boolean(project.rawScript.trim() || project.panels.length || project.references.length);
}

export function shouldRestoreTuiwenSnapshot(
  current: Pick<TuiwenProject, "panels" | "rawScript" | "references">,
  snapshot: Pick<TuiwenProject, "panels" | "rawScript" | "references">,
): boolean {
  return !hasTuiwenProjectWork(current) && hasTuiwenProjectWork(snapshot);
}

export function splitNovelTextToNarration(raw: string): string[] {
  const paragraphs = raw
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const shots: string[] = [];

  for (const paragraph of paragraphs) {
    const parts =
      paragraph.length <= 80
        ? [paragraph]
        : paragraph
            .split(/(?<=[。！？!?；;])/u)
            .map((part) => part.trim())
            .filter(Boolean);

    let buffer = "";
    for (const part of parts) {
      if (!buffer) {
        buffer = part;
        continue;
      }
      if ((buffer + part).length <= 70) {
        buffer += part;
      } else {
        shots.push(buffer);
        buffer = part;
      }
    }
    if (buffer) shots.push(buffer);
  }

  return shots;
}
