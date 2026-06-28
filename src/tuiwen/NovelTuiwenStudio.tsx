import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Button, NumberInput } from "../components/ui";
import { getTuiwenStudioText } from "../i18n";
import { useAppStore } from "../store";
import type {
  AnlasQuoteResult,
  ComicReferenceAsset,
  ComicReferenceKind,
  ReversePromptScope,
  TuiwenAspectRatio,
  TuiwenKeyframePreset,
  TuiwenProject,
  TuiwenShot,
  TuiwenTransition,
  TuiwenExportJianYingResult,
  TuiwenTtsProviderId,
  TuiwenTtsProviderInfo,
  TuiwenTtsVoice,
} from "../types";
import { applyTuiwenAspectToParams, buildTuiwenAspectPlan, TUIWEN_CANVAS_PRESETS } from "./aspect";
import {
  analyzeTuiwenNarrationPacing,
  encodeTuiwenPcm16Wav,
  estimateTuiwenNarrationDurationMs,
  sliceTuiwenPcm,
  splitTuiwenNarration,
} from "./audio";
import { parseTuiwenTextFile } from "./import";
import {
  insertTuiwenShotAfter,
  mergeTuiwenShotWithNext,
  moveTuiwenShot,
  reindexTuiwenShots,
  removeTuiwenShot,
} from "./edit";
import {
  createDefaultTuiwenProject,
  createTuiwenShot,
  DEFAULT_TUIWEN_KEYFRAME,
  normalizeTuiwenProject,
  shouldRestoreTuiwenSnapshot,
  splitNovelTextToNarration,
  TUIWEN_STEPS,
  type TuiwenStepKey,
} from "./project";
import {
  applyTuiwenGenerationResultToShot,
  buildTuiwenQuoteGroups,
  distributeTuiwenGroupAnlas,
  getTuiwenPendingGenerationShots,
  resolveTuiwenActualAnlas,
} from "./generation";

type TuiwenGenerationQuoteResult = AnlasQuoteResult & { perShotAnlas?: Record<string, number> };

function uid() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

function labelForReferenceKind(kind: ComicReferenceKind) {
  const labels: Record<ComicReferenceKind, string> = {
    precise: "精准参考",
    character: "角色参考",
    scene: "场景参考",
    object: "物品参考",
    vibe: "氛围迁移",
  };
  return labels[kind];
}

function labelForReferenceScope(scope: ReversePromptScope) {
  const labels: Record<ReversePromptScope, string> = {
    full: "整张图片",
    character: "角色",
    object: "物品",
    scene: "场景",
  };
  return labels[scope];
}

function downloadProject(project: TuiwenProject) {
  const data = JSON.stringify(project, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${project.title.trim() || "小说推文项目"}.tuiwen.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function statusText(shot: TuiwenShot) {
  if (shot.status === "done") return "已生图";
  if (shot.status === "converted") return "已转提示词";
  if (shot.status === "failed") return "失败";
  if (shot.status === "generating") return "生成中";
  return shot.enPrompt.trim() ? "待生图" : "草稿";
}

function sortedShots(project: TuiwenProject) {
  return [...project.panels].sort((a, b) => a.index - b.index);
}

function referenceContextLines(project: TuiwenProject) {
  const kindLabel = {
    precise: "精准参考",
    character: "角色",
    vibe: "氛围",
    scene: "场景",
    object: "物品",
  };
  return project.references
    .map((ref) => {
      const parts = [
        `【${kindLabel[ref.kind]}·${ref.name}】`,
        ref.subjectHint?.trim() ? `用户说明：${ref.subjectHint.trim()}` : "",
        ref.reversePrompt?.trim() ? `反推结果：${ref.reversePrompt.trim()}` : "",
      ].filter(Boolean);
      return parts.join(" ");
    })
    .filter(Boolean);
}

function mergeShotParams(project: TuiwenProject, shot: TuiwenShot) {
  return shot.paramsOverride.enabled ? { ...project.globalParams, ...shot.paramsOverride.params } : project.globalParams;
}

function keyframeForPreset(preset: TuiwenKeyframePreset) {
  const base = { preset, keys: DEFAULT_TUIWEN_KEYFRAME.keys.map((key) => ({ ...key })) };
  if (preset === "none") {
    return { preset, keys: [{ timeRatio: 0, scale: 1, x: 0, y: 0, alpha: 1, rotation: 0 }] };
  }
  if (preset === "zoomIn") {
    return {
      preset,
      keys: [
        { timeRatio: 0, scale: 1.02, x: 0, y: 0, alpha: 1, rotation: 0 },
        { timeRatio: 1, scale: 1.16, x: 0, y: 0, alpha: 1, rotation: 0 },
      ],
    };
  }
  if (preset === "zoomOut") {
    return {
      preset,
      keys: [
        { timeRatio: 0, scale: 1.16, x: 0, y: 0, alpha: 1, rotation: 0 },
        { timeRatio: 1, scale: 1.02, x: 0, y: 0, alpha: 1, rotation: 0 },
      ],
    };
  }
  if (preset === "panLeft" || preset === "panRight") {
    const sign = preset === "panLeft" ? 1 : -1;
    return {
      preset,
      keys: [
        { timeRatio: 0, scale: 1.12, x: sign * -0.03, y: 0, alpha: 1, rotation: 0 },
        { timeRatio: 1, scale: 1.12, x: sign * 0.03, y: 0, alpha: 1, rotation: 0 },
      ],
    };
  }
  if (preset === "panUp" || preset === "panDown") {
    const sign = preset === "panUp" ? 1 : -1;
    return {
      preset,
      keys: [
        { timeRatio: 0, scale: 1.12, x: 0, y: sign * 0.03, alpha: 1, rotation: 0 },
        { timeRatio: 1, scale: 1.12, x: 0, y: sign * -0.03, alpha: 1, rotation: 0 },
      ],
    };
  }
  return base;
}

async function readAudioDurationMs(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const audio = new Audio(url);
    await new Promise<void>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve();
      audio.onerror = () => reject(new Error("无法读取音频时长"));
    });
    return Math.max(500, Math.round((audio.duration || 0) * 1000));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function NovelTuiwenStudio({ onBack }: { onBack?: () => void }) {
  const params = useAppStore((state) => state.params);
  const language = useAppStore((state) => state.settings?.language);
  const setToast = useAppStore((state) => state.setToast);
  const refreshAccount = useAppStore((state) => state.refreshAccount);
  const tuiwenText = useMemo(() => getTuiwenStudioText(language), [language]);
  const [project, setProject] = useState<TuiwenProject>(() => createDefaultTuiwenProject(params));
  const [step, setStep] = useState<TuiwenStepKey>("import");
  const [activeShotId, setActiveShotId] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [generationLog, setGenerationLog] = useState("");
  const [queue, setQueue] = useState<{ total: number; done: number; current: number } | null>(null);
  const [exportResult, setExportResult] = useState<TuiwenExportJianYingResult | null>(null);
  const [ttsCatalog, setTtsCatalog] = useState<{ providers: TuiwenTtsProviderInfo[]; voices: TuiwenTtsVoice[] }>({
    providers: [],
    voices: [],
  });
  const [ttsProvider, setTtsProvider] = useState<TuiwenTtsProviderId>("edge");
  const [ttsVoice, setTtsVoice] = useState("zh-CN-XiaoxiaoNeural");
  const [ttsRatePercent, setTtsRatePercent] = useState(0);
  const [ttsVolumePercent, setTtsVolumePercent] = useState(0);
  const [ttsLog, setTtsLog] = useState("");
  const [motionReplay, setMotionReplay] = useState(0);
  const generationStopRef = useRef(false);
  const projectRef = useRef(project);
  const activeShot = project.panels.find((panel) => panel.id === activeShotId) ?? project.panels[0] ?? null;
  const nextShot = useMemo(() => {
    if (!activeShot) return null;
    const shots = sortedShots(project);
    const index = shots.findIndex((shot) => shot.id === activeShot.id);
    return shots[index + 1] ?? null;
  }, [activeShot, project]);
  const aspectPlan = useMemo(
    () => buildTuiwenAspectPlan(project.exportSettings, project.globalParams),
    [project.exportSettings, project.globalParams],
  );
  const totalDurationMs = useMemo(() => project.panels.reduce((sum, shot) => sum + shot.durationMs, 0), [project.panels]);
  const activeNarrationPacing = useMemo(
    () => analyzeTuiwenNarrationPacing(activeShot?.narration ?? "", ttsRatePercent),
    [activeShot?.narration, ttsRatePercent],
  );

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    void window.naiDesktop.tuiwenTtsProviders()
      .then(setTtsCatalog)
      .catch((error) => setTtsLog(`读取 TTS Provider 失败：${error instanceof Error ? error.message : String(error)}`));
  }, []);

  useEffect(() => {
    let mounted = true;
    void window.naiDesktop.tuiwenLoadProjectSnapshot()
      .then((snapshot) => {
        if (!mounted || !snapshot.ok || !snapshot.project) return;
        const next = normalizeTuiwenProject(snapshot.project, params);
        if (!next.panels.length && !next.rawScript.trim() && !next.references.length) return;
        if (!shouldRestoreTuiwenSnapshot(projectRef.current, next)) return;
        setProject(next);
        projectRef.current = next;
        setActiveShotId(next.panels[0]?.id ?? null);
        if (snapshot.savedAt) {
          setGenerationLog(`已恢复上次小说推文快照：${new Date(snapshot.savedAt).toLocaleString()}。`);
        }
      })
      .catch(() => {
        // Snapshot recovery is best-effort; manual JSON import remains available.
      });
    return () => {
      mounted = false;
    };
  }, [params]);

  useEffect(() => {
    const hasWork = Boolean(project.rawScript.trim() || project.panels.length || project.references.length);
    if (!hasWork) return;
    const timer = window.setTimeout(() => {
      void window.naiDesktop.tuiwenSaveProjectSnapshot(project).catch(() => {
        // Avoid interrupting long-running queues for a background persistence error.
      });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [project]);

  function patchProject(patch: Partial<TuiwenProject>) {
    setProject((prev) => ({ ...prev, ...patch }));
  }

  function patchShot(id: string, patch: Partial<TuiwenShot>) {
    setProject((prev) => ({
      ...prev,
      panels: prev.panels.map((shot) => (shot.id === id ? { ...shot, ...patch } : shot)),
    }));
  }

  function addShotAfterActive() {
    const sourceId = activeShot?.id;
    const nextShot = createTuiwenShot("", 1, project.exportSettings.defaultShotDurationMs);
    setProject((prev) => {
      return { ...prev, panels: insertTuiwenShotAfter(prev.panels, sourceId ?? null, nextShot) };
    });
    setActiveShotId(nextShot.id);
    setToast("已新增空白分镜。");
  }

  function moveActiveShot(direction: -1 | 1) {
    if (!activeShot) return;
    const sourceId = activeShot.id;
    setProject((prev) => {
      return { ...prev, panels: moveTuiwenShot(prev.panels, sourceId, direction) };
    });
    setToast(direction < 0 ? "分镜已上移。" : "分镜已下移。");
  }

  function mergeActiveWithNext() {
    if (!activeShot) return;
    const sourceId = activeShot.id;
    const shots = sortedShots(project);
    const sourceIndex = shots.findIndex((shot) => shot.id === sourceId);
    const next = shots[sourceIndex + 1];
    if (!next) {
      setToast("当前已经是最后一镜，无法向后合并。");
      return;
    }
    if (
      (activeShot.outputPath || activeShot.audio || next.outputPath || next.audio)
      && !window.confirm("合并会清除这两镜已生成的图片/音频绑定，但不会删除磁盘文件。继续吗？")
    ) return;

    setProject((prev) => {
      return { ...prev, panels: mergeTuiwenShotWithNext(prev.panels, sourceId) };
    });
    setToast(`已合并 #${activeShot.index} 与下一镜；请复核画面提示词并重新生图/配音。`);
  }

  function deleteActiveShot() {
    if (!activeShot) return;
    if (
      (activeShot.outputPath || activeShot.audio)
      && !window.confirm("删除分镜会移除项目内的图片/音频绑定，但不会删除磁盘文件。继续吗？")
    ) return;
    const sourceId = activeShot.id;
    const shots = sortedShots(project);
    const sourceIndex = shots.findIndex((shot) => shot.id === sourceId);
    const nextActiveId = shots[sourceIndex + 1]?.id ?? shots[sourceIndex - 1]?.id ?? null;
    setProject((prev) => ({
      ...prev,
      panels: removeTuiwenShot(prev.panels, sourceId),
    }));
    setActiveShotId(nextActiveId);
    setToast("分镜已从项目中移除。");
  }

  function updateReference(id: string, updater: (reference: ComicReferenceAsset) => ComicReferenceAsset) {
    setProject((prev) => ({
      ...prev,
      references: prev.references.map((reference) => (reference.id === id ? updater(reference) : reference)),
    }));
  }

  async function addReferences(files: FileList | null) {
    if (!files?.length) return;
    try {
      const references: ComicReferenceAsset[] = [];
      for (const file of Array.from(files)) {
        const base64 = await toBase64(file);
        references.push({
          id: uid(),
          name: file.name,
          kind: "precise",
          scope: "character",
          subjectHint: "",
          base64,
          previewUrl: dataUrlFromBase64(base64),
          reversePrompt: "",
          infoExtracted: 1,
          strength: 0.65,
          useForGeneration: true,
        });
      }
      setProject((prev) => ({ ...prev, references: [...prev.references, ...references] }));
      setToast(`已加入 ${references.length} 张全局参考图。`);
    } catch (error) {
      setToast(`读取参考图失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function reverseReference(reference: ComicReferenceAsset) {
    setBusy(`reverse:${reference.id}`);
    try {
      const result = await window.naiDesktop.comicReverseAsset(
        reference.base64,
        project.mode,
        reference.scope ?? "full",
        reference.subjectHint ?? "",
      );
      if (result.ok && result.prompt) {
        updateReference(reference.id, (current) => ({ ...current, reversePrompt: result.prompt ?? "" }));
      }
      setToast(result.message);
    } catch (error) {
      setToast(`参考图反推失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy("");
    }
  }

  function foldReferencesIntoGlobal() {
    const lines = project.references
      .filter((reference) => ["character", "scene", "object"].includes(reference.kind) && reference.reversePrompt.trim())
      .map((reference) => `【${labelForReferenceKind(reference.kind)}·${reference.name}】${reference.reversePrompt.trim()}`);
    if (!lines.length) {
      setToast("没有可写入全局设定的角色、场景或物品反推结果。");
      return;
    }
    setProject((prev) => ({
      ...prev,
      globalCharacterSetting: [prev.globalCharacterSetting.trim(), ...lines].filter(Boolean).join("\n"),
    }));
    setToast(`已把 ${lines.length} 条参考设定写入全局角色设定。`);
  }

  function rebuildDraftShots() {
    const lines = splitNovelTextToNarration(project.rawScript);
    if (lines.length === 0) {
      setToast("请先粘贴小说正文或字幕文本");
      return;
    }
    const panels = lines.map((line, index) => createTuiwenShot(line, index + 1, project.exportSettings.defaultShotDurationMs));
    setProject((prev) => ({
      ...prev,
      source: { type: "novel", fileName: prev.source.fileName || "粘贴文本" },
      globalPrompt: prev.rawScript,
      panels,
    }));
    setActiveShotId(panels[0]?.id ?? null);
    setStep("storyboard");
    setToast(`已创建 ${panels.length} 个旁白分镜草稿`);
  }

  async function importProject(file: File | null) {
    if (!file) return;
    try {
      const next = normalizeTuiwenProject(JSON.parse(await file.text()), params);
      setProject(next);
      setActiveShotId(next.panels[0]?.id ?? null);
      setToast(`已导入小说推文项目：${next.panels.length} 镜`);
    } catch (error) {
      setToast(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function importSourceFile(file: File | null) {
    if (!file) return;
    try {
      const filePath = window.naiDesktop.getPathForFile(file);
      const imported = filePath
        ? await window.naiDesktop.tuiwenImportFile({
            filePath,
            fileName: file.name,
            defaultShotDurationMs: project.exportSettings.defaultShotDurationMs,
          }).catch(() => null)
        : null;

      let rawScript = imported?.ok ? imported.rawScript ?? "" : "";
      let source = imported?.ok ? imported.source : undefined;
      let panels = imported?.ok ? imported.shots ?? [] : [];

      if (!rawScript || !source || !panels.length) {
        const text = await file.text();
        const result = parseTuiwenTextFile(file.name, text, project.exportSettings.defaultShotDurationMs);
        const lines = result.cues.length ? result.cues.map((cue) => cue.text) : splitNovelTextToNarration(text);
        panels = result.cues.length
          ? result.cues.map((cue, index) => ({
              ...createTuiwenShot(cue.text, index + 1, cue.durationMs ?? project.exportSettings.defaultShotDurationMs),
              startMs: cue.startMs,
            }))
          : lines.map((line, index) => createTuiwenShot(line, index + 1, project.exportSettings.defaultShotDurationMs));
        rawScript = result.rawScript;
        source = result.source;
      }
      if (!source) throw new Error("未能识别导入文件类型。");

      setProject((prev) => ({
        ...prev,
        rawScript,
        globalPrompt: rawScript,
        source,
        panels,
      }));
      setActiveShotId(panels[0]?.id ?? null);
      setStep("storyboard");
      setToast(imported?.ok ? imported.message : `已导入 ${file.name}，创建 ${panels.length} 个${source.type === "subtitle" ? "字幕" : "旁白"}分镜`);
    } catch (error) {
      setToast(`导入文本失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function analyzeWithLlm() {
    if (!project.rawScript.trim()) {
      setToast("请先导入或粘贴小说正文。");
      return;
    }
    setBusy("analyze");
    try {
      const result = await window.naiDesktop.comicAnalyzeScript({
        script: project.rawScript,
        adultBranch: project.adultBranch,
        mode: project.mode,
        desiredPanelCount: project.desiredPanelCount,
        referencePrompts: referenceContextLines(project),
      });
      if (!result.ok) {
        setToast(result.message);
        return;
      }
      const panels = (result.panels ?? []).map((panel, index) => {
        const narration = panel.narration?.trim() || panel.cnPrompt;
        return {
          ...createTuiwenShot(narration, index + 1, project.exportSettings.defaultShotDurationMs),
          cnPrompt: panel.cnPrompt,
          contextSummary: panel.contextSummary || panel.cnPrompt.slice(0, 120),
        };
      });
      setProject((prev) => ({
        ...prev,
        title: result.title || prev.title,
        globalPrompt: result.globalPrompt || prev.globalPrompt,
        globalCharacterSetting: result.globalCharacterSetting || referenceContextLines(prev).join("\n") || prev.globalCharacterSetting,
        continuityBible: result.continuityBible || prev.continuityBible,
        panels,
      }));
      setActiveShotId(panels[0]?.id ?? null);
      setStep("storyboard");
      setToast(`LLM 分镜完成：${panels.length} 镜`);
    } catch (error) {
      setToast(`LLM 分镜失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy("");
    }
  }

  async function convertAllPanels() {
    const allPanels = sortedShots(project);
    const targets = allPanels.filter((shot) => shot.cnPrompt.trim() && shot.status !== "done");
    if (!targets.length) {
      setToast("没有可转换的分镜。");
      return;
    }
    setBusy("convert");
    try {
      const result = await window.naiDesktop.comicConvertPanels({
        mode: project.mode,
        globalPrompt: project.globalPrompt,
        globalCharacterSetting: project.globalCharacterSetting,
        continuityBible: project.continuityBible,
        globalStylePrompt: project.globalStylePrompt,
        referencePrompts: referenceContextLines(project),
        adultBranch: project.adultBranch,
        panels: targets.map((shot) => {
          const index = allPanels.findIndex((item) => item.id === shot.id);
          return {
            panelId: shot.id,
            index: shot.index,
            cnPrompt: shot.cnPrompt,
            previousCnPrompt: allPanels[index - 1]?.cnPrompt ?? "",
            nextCnPrompt: allPanels[index + 1]?.cnPrompt ?? "",
            previousPrompts: allPanels.slice(Math.max(0, index - 2), index).map((item) => item.enPrompt || item.cnPrompt),
            previousSummaries: allPanels.slice(Math.max(0, index - 2), index).map((item) => item.contextSummary || item.cnPrompt),
            nextSummaries: allPanels.slice(index + 1, index + 2).map((item) => item.contextSummary || item.cnPrompt),
          };
        }),
      });
      setProject((prev) => ({
        ...prev,
        panels: prev.panels.map((shot) => {
          const converted = result.panels.find((item) => item.panelId === shot.id);
          if (!converted) return shot;
          return {
            ...shot,
            enPrompt: converted.enPrompt || shot.enPrompt,
            contextSummary: converted.contextSummary || shot.contextSummary,
            status: converted.error ? "failed" : "converted",
            error: converted.error,
          };
        }),
      }));
      const okCount = result.panels.filter((item) => !item.error && item.enPrompt.trim()).length;
      setToast(`提示词转换完成：成功 ${okCount}/${targets.length}${result.message ? `；${result.message}` : ""}`);
    } catch (error) {
      setToast(`提示词转换失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy("");
    }
  }

  async function checkConsistency() {
    const panels = sortedShots(project).filter((shot) => shot.enPrompt.trim());
    if (!panels.length) {
      setToast("请先批量转换 NovelAI 提示词。");
      return;
    }
    setBusy("consistency");
    try {
      const result = await window.naiDesktop.comicCheckConsistency({
        mode: project.mode,
        globalPrompt: project.globalPrompt,
        globalCharacterSetting: project.globalCharacterSetting,
        referencePrompts: referenceContextLines(project),
        panels: panels.map((shot) => ({
          id: shot.id,
          index: shot.index,
          cnPrompt: shot.cnPrompt,
          enPrompt: shot.enPrompt,
        })),
      });
      if (!result.ok) {
        setToast(result.message);
        return;
      }
      setProject((prev) => ({
        ...prev,
        panels: prev.panels.map((shot) => {
          const fixed = result.panels.find((item) => item.panelId === shot.id);
          return fixed?.enPrompt ? { ...shot, enPrompt: fixed.enPrompt, status: "converted" } : shot;
        }),
      }));
      setToast(result.message);
    } catch (error) {
      setToast(`一致性校正失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy("");
    }
  }

  async function quoteGenerationTargets(targets: TuiwenShot[]): Promise<TuiwenGenerationQuoteResult> {
    const account = await refreshAccount();
    const groups = buildTuiwenQuoteGroups(project, targets, (shot) => mergeShotParams(project, shot));

    let amount = 0;
    let balance = account.anlasBalance;
    const perShotAnlas: Record<string, number> = {};
    const sources = new Set<AnlasQuoteResult["source"]>();
    for (const group of groups) {
      const quoteParams = group.params;
      const quote = await window.naiDesktop.quoteAnlas({
        feature: "generate",
        params: { ...quoteParams, stylePrompt: "", positivePrompt: "quote", negativePrompt: "" },
        extras: {
          vibeImages: Array.from({ length: group.vibeCount }, () => ({ base64: "", infoExtracted: 0.7, strength: 0.5 })),
          charCaptions: [],
          preciseReferences: Array.from({ length: group.preciseCount }, () => ({
            base64: "",
            type: "character" as const,
            strength: 1,
            fidelity: 1,
          })),
        },
        batchCount: group.shotIds.length,
        account,
      });
      if (!quote.ok || typeof quote.amount !== "number") return quote;
      amount += quote.amount;
      Object.assign(perShotAnlas, distributeTuiwenGroupAnlas(quote.amount, group.shotIds));
      balance = quote.balance ?? balance;
      if (quote.source) sources.add(quote.source);
    }
    return {
      ok: true,
      amount,
      balance,
      insufficient: typeof balance === "number" ? amount > balance : false,
      source: sources.size === 1 ? [...sources][0] : "official-api",
      perShotAnlas,
      message: `已按 ${groups.length} 组参数报价 ${targets.length} 镜。`,
    };
  }

  async function generateShot(shot: TuiwenShot, previousImagePath?: string, quotedAnlas?: number) {
    const requestShot = { ...shot };
    setProject((prev) => ({
      ...prev,
      panels: prev.panels.map((item) => (item.id === shot.id ? { ...item, status: "generating", error: undefined } : item)),
    }));

    let balanceBefore: number | undefined;
    try {
      balanceBefore = (await refreshAccount()).anlasBalance;
    } catch {
      balanceBefore = undefined;
    }

    const result = await window.naiDesktop.comicGeneratePanel({
      projectId: project.id,
      projectTitle: project.title,
      historyGroupId: project.historyGroupId,
      panelId: requestShot.id,
      panelIndex: requestShot.index,
      params: mergeShotParams(project, requestShot),
      globalStylePrompt: project.globalStylePrompt,
      panelPrompt: requestShot.enPrompt || requestShot.cnPrompt,
      globalNegativePrompt: project.globalNegativePrompt,
      localNegativePrompt: requestShot.localNegativePrompt,
      negativeMode: requestShot.negativeMode,
      references: project.references,
      previousImagePath,
      inheritPreviousFrame: Boolean(project.inheritPreviousFrame && previousImagePath),
    });

    const item = result.items[0];
    let actualAnlas = quotedAnlas;
    if (result.ok && item) {
      try {
        const accountAfter = await refreshAccount();
        actualAnlas = resolveTuiwenActualAnlas(balanceBefore, accountAfter.anlasBalance, quotedAnlas);
      } catch {
        actualAnlas = quotedAnlas;
      }
    }
    setProject((prev) => ({
      ...prev,
      historyGroupId: item?.groupId ?? prev.historyGroupId,
      panels: prev.panels.map((old) =>
        old.id === shot.id
          ? applyTuiwenGenerationResultToShot(old, result, item, actualAnlas)
          : old,
      ),
    }));

    return { result, outputPath: item?.filePath };
  }

  async function generatePendingShots() {
    const targets = getTuiwenPendingGenerationShots(project);
    if (!targets.length) {
      setToast("没有可生成的分镜。");
      return;
    }
    const account = await refreshAccount();
    if (!account.hasToken) {
      setToast("请先在设置里配置 NovelAI Token。");
      return;
    }

    generationStopRef.current = false;
    setBusy("generate");
    setQueue({ total: targets.length, done: 0, current: 0 });
    let processed = 0;
    try {
      const quote = await quoteGenerationTargets(targets);
      if (!quote.ok) {
        setToast(`生成报价失败：${quote.message}`);
        return;
      }
      if (quote.insufficient && !window.confirm(`预计消耗 ${quote.amount ?? "未知"} Anlas，余额 ${quote.balance ?? "未知"}。仍要继续吗？`)) {
        setToast("已取消小说推文生图队列。");
        return;
      }
      setGenerationLog(`预计消耗 ${quote.amount ?? "未知"} Anlas（${quote.source ?? "estimate"}），开始生成 ${targets.length} 镜。`);

      let previousImagePath: string | undefined;
      for (let index = 0; index < targets.length; index += 1) {
        if (generationStopRef.current) {
          setGenerationLog(`队列已暂停：已处理 ${processed}/${targets.length} 镜，点击“生成未完成分镜”可续跑。`);
          break;
        }
        const shot = targets[index];
        setQueue({ total: targets.length, done: index, current: index + 1 });
        setGenerationLog(`正在生成 #${shot.index}（${index + 1}/${targets.length}）...`);
        const { result, outputPath } = await generateShot(shot, previousImagePath, quote.perShotAnlas?.[shot.id]);
        processed = index + 1;
        if (outputPath) previousImagePath = outputPath;
        if (!result.ok && result.failureKind === "auth") {
          setGenerationLog(`队列已停止：${result.message}`);
          setToast(result.message);
          break;
        }
        if (generationStopRef.current) {
          setGenerationLog(`队列已暂停：已处理 ${processed}/${targets.length} 镜，点击“生成未完成分镜”可续跑。`);
          break;
        }
      }
      setQueue({ total: targets.length, done: generationStopRef.current ? processed : targets.length, current: processed });
      if (!generationStopRef.current) {
        setGenerationLog("小说推文生图队列已结束；失败镜头可保留状态后单独重试。");
        setToast("小说推文生图队列已结束");
      }
    } catch (error) {
      setToast(`小说推文生图失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy("");
      setQueue(null);
    }
  }

  function stopGenerationQueue() {
    generationStopRef.current = true;
    setGenerationLog("正在停止队列：当前请求结束后不会继续下一镜。");
    setToast("已请求停止队列；当前镜头结束后可直接续跑未完成分镜。");
    void window.naiDesktop.cancel();
  }

  async function generateOneShot(shot: TuiwenShot) {
    if (!shot.enPrompt.trim() && !shot.cnPrompt.trim()) {
      setToast("当前分镜没有可生成的提示词。");
      return;
    }
    const account = await refreshAccount();
    if (!account.hasToken) {
      setToast("请先在设置里配置 NovelAI Token。");
      return;
    }
    setBusy(`generate:${shot.id}`);
    try {
      const quote = await quoteGenerationTargets([shot]);
      if (!quote.ok) {
        setToast(`当前镜头报价失败：${quote.message}`);
        return;
      }
      if (quote.insufficient && !window.confirm(`当前镜头预计消耗 ${quote.amount ?? "未知"} Anlas，余额 ${quote.balance ?? "未知"}。仍要继续吗？`)) {
        return;
      }
      const previousImagePath = project.inheritPreviousFrame
        ? sortedShots(project)
            .filter((item) => item.index < shot.index && item.outputPath)
            .at(-1)?.outputPath
        : undefined;
      const { result } = await generateShot(shot, previousImagePath, quote.perShotAnlas?.[shot.id]);
      setToast(result.ok ? `#${shot.index} 已生成。` : `#${shot.index} 生成失败：${result.message}`);
    } catch (error) {
      setToast(`当前镜头生成失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy("");
    }
  }

  function setAspect(aspectRatio: TuiwenAspectRatio) {
    const canvas = TUIWEN_CANVAS_PRESETS[aspectRatio];
    setProject((prev) => ({
      ...prev,
      globalParams: applyTuiwenAspectToParams(prev.globalParams, aspectRatio),
      exportSettings: {
        ...prev.exportSettings,
        aspectRatio,
        width: canvas.width,
        height: canvas.height,
      },
    }));
  }

  function pickBgm(file: File | null) {
    if (!file) return;
    const filePath = window.naiDesktop.getPathForFile(file);
    setProject((prev) => ({
      ...prev,
      exportSettings: {
        ...prev.exportSettings,
        bgm: { filePath, volume: prev.exportSettings.bgm?.volume ?? 0.22, loop: true, fadeMs: 1200 },
      },
    }));
  }

  async function importAudioForActiveShot(file: File | null) {
    if (!file || !activeShot) return;
    try {
      const durationMs = await readAudioDurationMs(file);
      const filePath = window.naiDesktop.getPathForFile(file);
      patchShot(activeShot.id, {
        durationMs,
        audio: {
          filePath,
          fileUrl: filePath,
          durationMs,
          source: "import",
        },
      });
      setToast(`已为 #${activeShot.index} 导入音频，时长 ${(durationMs / 1000).toFixed(1)} 秒`);
    } catch (error) {
      setToast(`读取音频失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function importLongAudioBySubtitle(file: File | null) {
    if (!file) return;
    const targets = sortedShots(project).filter((shot) => Number.isFinite(shot.startMs) && (shot.startMs ?? -1) >= 0);
    if (project.source.type !== "subtitle" || !targets.length) {
      setToast("长音频切片需要先导入带时间码的 SRT / ASS / LRC 字幕。");
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      setToast("长音频超过 500MB，请先压缩或拆分后再导入。");
      return;
    }

    setBusy("splitAudio");
    setTtsLog(`正在解码 ${file.name}…`);
    const audioContext = new AudioContext();
    try {
      const decoded = await audioContext.decodeAudioData(await file.arrayBuffer());
      const channels = Array.from(
        { length: decoded.numberOfChannels },
        (_value, channel) => decoded.getChannelData(channel),
      );
      let succeeded = 0;
      const failures: string[] = [];

      for (let index = 0; index < targets.length; index += 1) {
        const shot = targets[index];
        setTtsLog(`正在按字幕切分 ${file.name}：${index + 1}/${targets.length}（#${shot.index}）`);
        try {
          const slice = sliceTuiwenPcm(
            channels,
            decoded.sampleRate,
            shot.startMs ?? 0,
            shot.durationMs,
          );
          const wavData = encodeTuiwenPcm16Wav(slice.channels, slice.sampleRate);
          const saved = await window.naiDesktop.tuiwenSaveImportedAudio({
            projectId: project.id,
            projectTitle: project.title,
            shotId: shot.id,
            index: shot.index,
            durationMs: slice.durationMs,
            sourceName: file.name,
            wavData,
          });
          if (!saved.ok || !saved.audio) throw new Error(saved.message);
          const audio = saved.audio;
          setProject((prev) => ({
            ...prev,
            panels: prev.panels.map((item) =>
              item.id === shot.id ? { ...item, audio, durationMs: audio.durationMs } : item),
          }));
          succeeded += 1;
        } catch (error) {
          failures.push(`#${shot.index} ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const summary = `长音频切片完成：成功 ${succeeded}/${targets.length} 镜。`;
      setTtsLog([summary, ...failures].join("\n"));
      setToast(failures.length ? `${summary} ${failures.length} 镜可单独导入或重试。` : summary);
    } catch (error) {
      const message = `长音频解码失败：${error instanceof Error ? error.message : String(error)}`;
      setTtsLog(`${message}\n可改用 WAV/MP3/M4A，或继续逐镜导入音频。`);
      setToast(message);
    } finally {
      await audioContext.close().catch(() => undefined);
      setBusy("");
    }
  }

  async function runTts(target: "active" | "missing") {
    const candidates =
      target === "active"
        ? activeShot ? [activeShot] : []
        : sortedShots(project).filter((shot) => !shot.audio);
    const shots = candidates.filter((shot) => shot.narration.trim());
    if (!shots.length) {
      setToast(target === "active" ? "当前镜头没有可合成的旁白。" : "没有待配音的镜头。");
      return;
    }
    const providerInfo = ttsCatalog.providers.find((provider) => provider.id === ttsProvider);
    if (providerInfo && !providerInfo.available) {
      setToast(`${providerInfo.label}尚未配置，请使用 Edge TTS 或导入配音。`);
      return;
    }

    setBusy(target === "active" ? `tts:${shots[0].id}` : "tts");
    setTtsLog(`正在合成 ${shots.length} 镜配音…`);
    try {
      const result = await window.naiDesktop.tuiwenTts({
        projectId: project.id,
        projectTitle: project.title,
        provider: ttsProvider,
        voice: ttsVoice,
        ratePercent: ttsRatePercent,
        volumePercent: ttsVolumePercent,
        shots: shots.map((shot) => ({ shotId: shot.id, index: shot.index, narration: shot.narration })),
      });
      const completed = new Map(
        result.items
          .filter((item) => item.ok && item.audio)
          .map((item) => [item.shotId, item.audio!]),
      );
      setProject((prev) => ({
        ...prev,
        panels: prev.panels.map((shot) => {
          const audio = completed.get(shot.id);
          return audio ? { ...shot, audio, durationMs: audio.durationMs } : shot;
        }),
      }));
      const failures = result.items
        .filter((item) => !item.ok)
        .map((item) => `#${item.index} ${item.error || "合成失败"}`);
      setTtsLog([result.message, ...(result.warnings ?? []), ...failures].join("\n"));
      setToast(result.message);
    } catch (error) {
      const message = `TTS 调用失败：${error instanceof Error ? error.message : String(error)}`;
      setTtsLog(`${message}\n可继续使用“导入本镜音频”，项目不会丢失。`);
      setToast(message);
    } finally {
      setBusy("");
    }
  }

  function splitActiveNarration() {
    if (!activeShot) return;
    const segments = splitTuiwenNarration(activeShot.narration);
    if (segments.length <= 1) {
      setToast("当前旁白不需要拆分。");
      return;
    }
    const sourceId = activeShot.id;
    setProject((prev) => {
      const sourceIndex = prev.panels.findIndex((shot) => shot.id === sourceId);
      if (sourceIndex < 0) return prev;
      const source = prev.panels[sourceIndex];
      const replacements = segments.map((narration, index) => {
        const fresh = createTuiwenShot(
          narration,
          source.index + index,
          estimateTuiwenNarrationDurationMs(narration, ttsRatePercent),
        );
        return {
          ...fresh,
          id: index === 0 ? source.id : fresh.id,
          cnPrompt: source.cnPrompt,
          contextSummary: source.contextSummary,
          enPrompt: source.enPrompt,
          localNegativePrompt: source.localNegativePrompt,
          negativeMode: source.negativeMode,
          paramsOverride: { enabled: source.paramsOverride.enabled, params: { ...source.paramsOverride.params } },
          status: index === 0 && source.outputPath ? source.status : source.enPrompt.trim() ? "converted" as const : "draft" as const,
          historyItemId: index === 0 ? source.historyItemId : undefined,
          outputPath: index === 0 ? source.outputPath : undefined,
          outputUrl: index === 0 ? source.outputUrl : undefined,
          actualAnlas: index === 0 ? source.actualAnlas : undefined,
          keyframe: { ...source.keyframe, keys: source.keyframe.keys.map((key) => ({ ...key })) },
          transition: source.transition ? { ...source.transition } : undefined,
          subtitle: { ...source.subtitle, text: narration },
          audio: undefined,
          error: undefined,
        };
      });
      const mergedPanels = [
        ...prev.panels.slice(0, sourceIndex),
        ...replacements,
        ...prev.panels.slice(sourceIndex + 1),
      ];
      const panels = reindexTuiwenShots(mergedPanels);
      return { ...prev, panels };
    });
    setActiveShotId(sourceId);
    setToast(`已把当前长旁白拆成 ${segments.length} 镜；新增镜头需要补图或复用画面。`);
  }

  async function exportJianYingDraft() {
    if (!project.panels.length) {
      setToast("没有可导出的分镜。");
      return;
    }
    setBusy("exportJianYing");
    setExportResult(null);
    try {
      const result = await window.naiDesktop.tuiwenExportJianYing({
        project,
        outDir: project.exportSettings.jianyingDraftDir?.trim() || undefined,
      });
      setExportResult(result);
      setToast(result.message);
    } catch (error) {
      const result: TuiwenExportJianYingResult = {
        ok: false,
        message: `剪映草稿导出失败：${error instanceof Error ? error.message : String(error)}`,
      };
      setExportResult(result);
      setToast(result.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="comic-generator tuiwen-studio">
      <div className="comic-page-title tuiwen-page-title">
        <div>
          <span className="eyebrow">{tuiwenText.page.eyebrow}</span>
          <strong>{project.title}</strong>
          <small>{tuiwenText.page.subtitle}</small>
        </div>
        <div className="redraw-page-metrics">
          <span><b>{project.panels.length}</b> {tuiwenText.page.shotsMetric}</span>
          <span><b>{aspectPlan.nai.width}×{aspectPlan.nai.height}</b> NAI</span>
        </div>
      </div>

      <nav className="comic-steps tuiwen-steps">
        {TUIWEN_STEPS.map((item, index) => (
          <button
            key={item.key}
            type="button"
            className={clsx("comic-step-btn", step === item.key && "active")}
            onClick={() => setStep(item.key)}
          >
            <b>{index + 1}</b>
            <span>{tuiwenText.steps[item.key].label}</span>
            <small>{tuiwenText.steps[item.key].hint}</small>
          </button>
        ))}
      </nav>

      <div className="comic-step-actions tuiwen-actions">
        {onBack ? <Button onClick={onBack} variant="ghost">{tuiwenText.page.backToTools}</Button> : null}
        <Button onClick={() => downloadProject(project)} variant="secondary">{tuiwenText.page.exportProjectJson}</Button>
        <label className="btn btn-secondary redraw-file-btn">
          {tuiwenText.page.importProjectJson}
          <input type="file" hidden accept=".json,application/json" onChange={(event) => { void importProject(event.target.files?.[0] ?? null); event.target.value = ""; }} />
        </label>
        <label className="btn btn-secondary redraw-file-btn">
          {tuiwenText.page.importNovelSubtitle}
          <input type="file" hidden accept=".txt,.srt,.ass,.lrc,text/plain" onChange={(event) => { void importSourceFile(event.target.files?.[0] ?? null); event.target.value = ""; }} />
        </label>
        <span className="redraw-flow-hint">{tuiwenText.page.flowHint}</span>
      </div>

      {step === "import" && (
        <section className="redraw-card tuiwen-import-stage">
          <div className="redraw-global-prompts">
            <label className="comic-field">
              <span>{tuiwenText.importStage.projectTitle}</span>
              <input value={project.title} onChange={(event) => patchProject({ title: event.target.value })} />
            </label>
            <label className="comic-field">
              <span>{tuiwenText.importStage.sourceType}</span>
              <select value={project.source.type} onChange={(event) => setProject((prev) => ({ ...prev, source: { ...prev.source, type: event.target.value as TuiwenProject["source"]["type"] } }))}>
                <option value="novel">{tuiwenText.importStage.sourceNovel}</option>
                <option value="subtitle">{tuiwenText.importStage.sourceSubtitle}</option>
              </select>
            </label>
          </div>
          <div className="tuiwen-aspect-grid">
            <label className="comic-field">
              <span>{tuiwenText.importStage.aspectRatio}</span>
              <select value={project.exportSettings.aspectRatio} onChange={(event) => setAspect(event.target.value as TuiwenAspectRatio)}>
                {Object.entries(TUIWEN_CANVAS_PRESETS).map(([key, value]) => (
                  <option value={key} key={key}>{tuiwenText.importStage.aspectLabels[key as TuiwenAspectRatio] ?? value.label}</option>
                ))}
              </select>
            </label>
            <NumberInput
              label={tuiwenText.importStage.defaultShotDuration}
              value={project.exportSettings.defaultShotDurationMs}
              min={1000}
              max={20000}
              step={100}
              onChange={(value) => setProject((prev) => ({ ...prev, exportSettings: { ...prev.exportSettings, defaultShotDurationMs: value } }))}
            />
            <NumberInput
              label="FPS"
              value={project.exportSettings.fps}
              min={24}
              max={60}
              onChange={(value) => setProject((prev) => ({ ...prev, exportSettings: { ...prev.exportSettings, fps: value } }))}
            />
          </div>
          <div className="tuiwen-aspect-plan">
            <span>{tuiwenText.importStage.canvas} {aspectPlan.canvas.width}×{aspectPlan.canvas.height}</span>
            <span>NAI {aspectPlan.nai.width}×{aspectPlan.nai.height}</span>
            <span>Scale-to-cover ×{aspectPlan.cover.scaleToCover}</span>
            <span>{tuiwenText.importStage.kenBurnsSuggestion} ×{aspectPlan.cover.recommendedKenBurnsScale}</span>
            {aspectPlan.opusFreeWarning ? (
              <b>
                {tuiwenText.importStage.opusFreeExceeded}：{aspectPlan.nai.width}×{aspectPlan.nai.height}，
                {project.globalParams.steps} {tuiwenText.importStage.stepsUnit}。
              </b>
            ) : (
              <em>{tuiwenText.importStage.opusFreeOk}</em>
            )}
          </div>
          <label className="comic-field">
            <span>{tuiwenText.importStage.scriptLabel}</span>
            <textarea
              value={project.rawScript}
              onChange={(event) => patchProject({ rawScript: event.target.value, globalPrompt: event.target.value })}
              placeholder={tuiwenText.importStage.scriptPlaceholder}
              style={{ minHeight: 220 }}
            />
          </label>
          <div className="redraw-step-footer">
            <span>{tuiwenText.importStage.footerHint}</span>
            <div className="comic-inline-actions">
              <Button variant="secondary" onClick={rebuildDraftShots} disabled={Boolean(busy)}>{tuiwenText.importStage.createDraft}</Button>
              <Button variant="primary" onClick={() => { void analyzeWithLlm(); }} disabled={Boolean(busy)}>
                {busy === "analyze" ? tuiwenText.importStage.llmAnalyzing : tuiwenText.importStage.llmAnalyze}
              </Button>
            </div>
          </div>
        </section>
      )}

      {step === "storyboard" && (
        <section className="redraw-card tuiwen-storyboard-stage">
          <div className="redraw-globals-head">
            <div>
              <strong>分镜 & 旁白</strong>
              <span className="redraw-flow-hint">旁白负责配音/字幕，中文画面描述负责生成 NovelAI tags。</span>
            </div>
            <div className="comic-inline-actions">
              <Button variant="secondary" onClick={() => { void convertAllPanels(); }} disabled={Boolean(busy) || project.panels.length === 0}>
                {busy === "convert" ? "转换中..." : "批量生成提示词"}
              </Button>
              <Button variant="secondary" onClick={() => { void checkConsistency(); }} disabled={Boolean(busy) || project.panels.length === 0}>
                {busy === "consistency" ? "校正中..." : "一致性校正"}
              </Button>
            </div>
          </div>
          {project.panels.length === 0 ? (
            <div className="redraw-results-empty">
              <b>还没有分镜</b>
              <span>先回到「导入」粘贴文本并创建草稿。</span>
            </div>
          ) : (
            <div className="comic-panel-workspace tuiwen-shot-workspace">
              <aside className="comic-panel-sidebar">
                {project.panels.map((shot) => (
                  <button
                    type="button"
                    className={clsx("comic-panel-nav-item", activeShot?.id === shot.id && "active", shot.status === "done" && "selected")}
                    key={shot.id}
                    onClick={() => setActiveShotId(shot.id)}
                  >
                    <span>#{shot.index}</span>
                    <small>{statusText(shot)}</small>
                  </button>
                ))}
              </aside>
              {activeShot && (
                <article className="comic-panel-editor">
                  <header>
                    <strong>#{activeShot.index} · 旁白与画面</strong>
                    <div className="comic-inline-actions">
                      <Button variant="secondary" onClick={() => moveActiveShot(-1)} disabled={activeShot.index <= 1}>上移</Button>
                      <Button variant="secondary" onClick={() => moveActiveShot(1)} disabled={activeShot.index >= project.panels.length}>下移</Button>
                      <Button variant="secondary" onClick={splitActiveNarration} disabled={!activeShot.narration.trim()}>拆分</Button>
                      <Button variant="secondary" onClick={mergeActiveWithNext} disabled={activeShot.index >= project.panels.length}>合并下一镜</Button>
                      <Button variant="secondary" onClick={addShotAfterActive}>新增下一镜</Button>
                      <Button variant="secondary" onClick={deleteActiveShot}>删除</Button>
                      <span className={clsx("comic-status", activeShot.status)}>{statusText(activeShot)}</span>
                    </div>
                  </header>
                  <div className="comic-panel-editor-body">
                    <label className="comic-field">
                      <span>旁白 / 字幕原文</span>
                      <textarea
                        value={activeShot.narration}
                        onChange={(event) => patchShot(activeShot.id, { narration: event.target.value, subtitle: { ...activeShot.subtitle, text: event.target.value } })}
                      />
                    </label>
                    <label className="comic-field">
                      <span>中文画面描述（批量生成提示词时转换为 NovelAI tags）</span>
                      <textarea value={activeShot.cnPrompt} onChange={(event) => patchShot(activeShot.id, { cnPrompt: event.target.value, contextSummary: event.target.value.slice(0, 120) })} />
                    </label>
                    <label className="comic-field">
                      <span>NovelAI 提示词（可批量生成，也可手动精修）</span>
                      <textarea value={activeShot.enPrompt} onChange={(event) => patchShot(activeShot.id, { enPrompt: event.target.value, status: event.target.value.trim() ? "converted" : "draft" })} />
                    </label>
                    <div className="comic-panel-negative-row">
                      <NumberInput label="时长(ms)" value={activeShot.durationMs} min={800} max={30000} step={100} onChange={(value) => patchShot(activeShot.id, { durationMs: value })} />
                      <label className="comic-field">
                        <span>字幕</span>
                        <select value={activeShot.subtitle.enabled ? "on" : "off"} onChange={(event) => patchShot(activeShot.id, { subtitle: { ...activeShot.subtitle, enabled: event.target.value === "on" } })}>
                          <option value="on">显示字幕</option>
                          <option value="off">隐藏字幕</option>
                        </select>
                      </label>
                    </div>
                  </div>
                </article>
              )}
            </div>
          )}
        </section>
      )}

      {step === "references" && (
        <section className="redraw-card tuiwen-references-stage">
          <div className="redraw-globals-head">
            <div>
              <strong>角色库 / 全局精准参考</strong>
              <span className="redraw-flow-hint">
                上传一次，后续每个分镜都会沿用；V4.5 模型走精准参考，其他模型自动回退为氛围迁移。
              </span>
            </div>
            <div className="comic-inline-actions">
              <label className="btn btn-secondary redraw-file-btn">
                上传参考图
                <input
                  type="file"
                  hidden
                  multiple
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    void addReferences(event.target.files);
                    event.target.value = "";
                  }}
                />
              </label>
              <Button variant="secondary" onClick={foldReferencesIntoGlobal} disabled={!project.references.length || Boolean(busy)}>
                反推写入全局设定
              </Button>
            </div>
          </div>

          <div className="tuiwen-aspect-plan">
            <span>参考图 {project.references.length} 张</span>
            <span>参与生成 {project.references.filter((ref) => ref.useForGeneration !== false).length} 张</span>
            <span>精准/角色 {project.references.filter((ref) => ref.kind !== "vibe").length} 张</span>
            <b>建议先用 3–5 镜小样验证角色一致性，再放量长队列。</b>
          </div>

          <label className="comic-field">
            <span>全局角色 / 场景 / 道具设定</span>
            <textarea
              value={project.globalCharacterSetting}
              onChange={(event) => patchProject({ globalCharacterSetting: event.target.value })}
              placeholder="参考图反推、角色固定设定、服装道具、场景规则都可以写在这里；生成提示词与一致性校正会一起参考。"
              style={{ minHeight: 110 }}
            />
          </label>

          {project.references.length === 0 ? (
            <div className="redraw-results-empty">
              <b>还没有参考图</b>
              <span>上传角色立绘、场景图或关键道具图后，可以先视觉反推，再叠加到每个分镜生成。</span>
            </div>
          ) : (
            <div className="comic-reference-list tuiwen-reference-list">
              {project.references.map((reference) => (
                <article className="comic-reference tuiwen-reference-card" key={reference.id}>
                  <img src={reference.previewUrl || dataUrlFromBase64(reference.base64)} alt={reference.name} />
                  <div>
                    <div className="tuiwen-reference-title">
                      <strong>{reference.name}</strong>
                      <label className="checkbox-line comic-reference-generate-toggle">
                        <input
                          type="checkbox"
                          checked={reference.useForGeneration !== false}
                          onChange={(event) => updateReference(reference.id, (current) => ({ ...current, useForGeneration: event.target.checked }))}
                        />
                        参与每镜生成
                      </label>
                    </div>

                    <div className="comic-reference-controls tuiwen-reference-controls">
                      <label>
                        <span>用途</span>
                        <select
                          value={reference.kind}
                          onChange={(event) => updateReference(reference.id, (current) => ({ ...current, kind: event.target.value as ComicReferenceKind }))}
                        >
                          <option value="precise">精准参考（角色+风格）</option>
                          <option value="character">角色参考</option>
                          <option value="scene">场景参考</option>
                          <option value="object">物品参考</option>
                          <option value="vibe">氛围迁移</option>
                        </select>
                      </label>
                      <label>
                        <span>反推范围</span>
                        <select
                          value={reference.scope ?? "character"}
                          onChange={(event) => updateReference(reference.id, (current) => ({ ...current, scope: event.target.value as ReversePromptScope }))}
                        >
                          <option value="full">整张图片</option>
                          <option value="character">角色</option>
                          <option value="scene">场景</option>
                          <option value="object">物品</option>
                        </select>
                      </label>
                      <NumberInput
                        label="强度"
                        value={reference.strength}
                        min={0}
                        max={1}
                        step={0.05}
                        onChange={(value) => updateReference(reference.id, (current) => ({ ...current, strength: value }))}
                      />
                      <NumberInput
                        label="信息量"
                        value={reference.infoExtracted}
                        min={0}
                        max={1}
                        step={0.05}
                        onChange={(value) => updateReference(reference.id, (current) => ({ ...current, infoExtracted: value }))}
                      />
                    </div>

                    <label className="comic-field">
                      <span>用户说明 / 固定提示</span>
                      <textarea
                        value={reference.subjectHint ?? ""}
                        onChange={(event) => updateReference(reference.id, (current) => ({ ...current, subjectHint: event.target.value }))}
                        placeholder={`例如：这是主角蓝白服装立绘；只提取${labelForReferenceScope(reference.scope ?? "character")}，不要描述背景。`}
                      />
                    </label>
                    <label className="comic-field">
                      <span>视觉反推结果</span>
                      <textarea
                        value={reference.reversePrompt}
                        onChange={(event) => updateReference(reference.id, (current) => ({ ...current, reversePrompt: event.target.value }))}
                        placeholder="点击视觉反推后会写入这里，也可手动整理成稳定角色设定。"
                      />
                    </label>
                    <div className="comic-inline-actions">
                      <Button
                        variant="secondary"
                        onClick={() => { void reverseReference(reference); }}
                        disabled={Boolean(busy)}
                      >
                        {busy === `reverse:${reference.id}` ? "反推中..." : "视觉反推"}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setProject((prev) => ({ ...prev, references: prev.references.filter((item) => item.id !== reference.id) }))}
                        disabled={Boolean(busy)}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {step === "generate" && (
        <section className="redraw-card tuiwen-generate-stage">
          <div className="redraw-globals-head">
            <div>
              <strong>批量生图</strong>
              <span className="redraw-flow-hint">复用漫画生图管线；只生成未完成镜头，失败镜头可再次点击继续。</span>
            </div>
            <div className="comic-inline-actions">
              {activeShot ? (
                <Button variant="secondary" onClick={() => { void generateOneShot(activeShot); }} disabled={Boolean(busy)}>
                  {busy === `generate:${activeShot.id}` ? "生成当前镜..." : `只生成 #${activeShot.index}`}
                </Button>
              ) : null}
              <Button variant="primary" onClick={() => { void generatePendingShots(); }} disabled={Boolean(busy) || project.panels.length === 0}>
                {busy === "generate" ? "生成中..." : "生成未完成分镜"}
              </Button>
              {busy === "generate" ? (
                <Button variant="danger" onClick={stopGenerationQueue}>
                  停止队列
                </Button>
              ) : null}
            </div>
          </div>
          <div className="tuiwen-aspect-plan">
            <span>本批 {project.panels.filter((shot) => shot.status !== "done").length} 镜待生成</span>
            <span>尺寸 {project.globalParams.width}×{project.globalParams.height}</span>
            <span>步数 {project.globalParams.steps}</span>
            {queue ? <b>进度 {queue.done}/{queue.total}，当前 #{queue.current}</b> : <em>{generationLog || "等待开始生成。"}</em>}
          </div>
          <div className="tuiwen-shot-grid">
            {sortedShots(project).map((shot) => (
              <button
                key={shot.id}
                type="button"
                className={clsx("tuiwen-shot-card", shot.status)}
                onClick={() => {
                  setActiveShotId(shot.id);
                  setStep("storyboard");
                }}
              >
                {shot.outputUrl ? <img src={shot.outputUrl} alt={`分镜 ${shot.index}`} /> : <span className="tuiwen-shot-placeholder">#{shot.index}</span>}
                <b>#{shot.index} · {statusText(shot)}</b>
                <small>{shot.error || shot.enPrompt || shot.cnPrompt}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === "audio" && (
        <section className="redraw-card tuiwen-audio-stage">
          <div className="redraw-globals-head">
            <div>
              <strong>配音 / 时长</strong>
              <span className="redraw-flow-hint">默认 Edge 在线朗读；每镜独立落盘，失败镜头可重试或直接导入音频。</span>
            </div>
            <span className="settings-hint">总时长 {(totalDurationMs / 1000).toFixed(1)} 秒</span>
          </div>
          <div className="tuiwen-tts-toolbar">
            <label className="comic-field">
              <span>TTS Provider</span>
              <select value={ttsProvider} onChange={(event) => setTtsProvider(event.target.value as TuiwenTtsProviderId)}>
                {ttsCatalog.providers.map((provider) => (
                  <option key={provider.id} value={provider.id} disabled={!provider.available}>
                    {provider.label}{provider.available ? "" : "（待配置）"}
                  </option>
                ))}
              </select>
            </label>
            <label className="comic-field">
              <span>中文音色</span>
              <select value={ttsVoice} onChange={(event) => setTtsVoice(event.target.value)}>
                {ttsCatalog.voices.map((voice) => (
                  <option key={voice.id} value={voice.id}>{voice.label}</option>
                ))}
              </select>
            </label>
            <NumberInput
              label="语速(%)"
              value={ttsRatePercent}
              min={-50}
              max={100}
              step={5}
              onChange={setTtsRatePercent}
            />
            <NumberInput
              label="音量(%)"
              value={ttsVolumePercent}
              min={-100}
              max={100}
              step={5}
              onChange={setTtsVolumePercent}
            />
            <div className="tuiwen-tts-actions">
              <label className={clsx("btn btn-secondary redraw-file-btn", (Boolean(busy) || project.source.type !== "subtitle") && "disabled")}>
                {busy === "splitAudio" ? "长音频切片中…" : "按字幕切分长音频"}
                <input
                  type="file"
                  hidden
                  accept="audio/*"
                  disabled={Boolean(busy) || project.source.type !== "subtitle"}
                  onChange={(event) => {
                    void importLongAudioBySubtitle(event.target.files?.[0] ?? null);
                    event.target.value = "";
                  }}
                />
              </label>
              <Button variant="secondary" onClick={() => { void runTts("active"); }} disabled={!activeShot || Boolean(busy)}>
                {activeShot && busy === `tts:${activeShot.id}` ? "本镜合成中…" : "合成当前镜"}
              </Button>
              <Button variant="primary" onClick={() => { void runTts("missing"); }} disabled={!project.panels.length || Boolean(busy)}>
                {busy === "tts" ? "批量合成中…" : "合成未配音镜头"}
              </Button>
            </div>
          </div>
          <div className="tuiwen-tts-notice">
            <b>非官方端点提示</b>
            <span>Edge Read Aloud 无 SLA，可能改鉴权、限流或临时断开；成功镜头会保留，失败镜头不会让整批重来。</span>
            <span>
              字幕项目可导入一条长配音，程序按 SRT / ASS / LRC 绝对时间码切成 WAV 并逐镜落盘；无需安装 FFmpeg。
            </span>
            {ttsLog ? <pre>{ttsLog}</pre> : null}
          </div>
          <div className="comic-panel-workspace tuiwen-shot-workspace">
            <aside className="comic-panel-sidebar">
              {project.panels.map((shot) => (
                <button
                  type="button"
                  className={clsx("comic-panel-nav-item", activeShot?.id === shot.id && "active", shot.audio && "selected")}
                  key={shot.id}
                  onClick={() => setActiveShotId(shot.id)}
                >
                  <span>#{shot.index}</span>
                  <small>{shot.audio ? `${(shot.audio.durationMs / 1000).toFixed(1)}s 音频` : `${(shot.durationMs / 1000).toFixed(1)}s 默认`}</small>
                </button>
              ))}
            </aside>
            {activeShot ? (
              <article className="comic-panel-editor">
                <header>
                  <strong>#{activeShot.index} · 配音</strong>
                  <label className="btn btn-secondary redraw-file-btn">
                    导入本镜音频
                    <input type="file" hidden accept="audio/*" onChange={(event) => { void importAudioForActiveShot(event.target.files?.[0] ?? null); event.target.value = ""; }} />
                  </label>
                </header>
                <div className="comic-panel-editor-body">
                  <label className="comic-field">
                    <span>旁白文本</span>
                    <textarea value={activeShot.narration} onChange={(event) => patchShot(activeShot.id, { narration: event.target.value, subtitle: { ...activeShot.subtitle, text: event.target.value } })} />
                  </label>
                  <div className={clsx("tuiwen-pacing-card", activeNarrationPacing.tooLong && "warning")}>
                    <span>预计朗读 {(activeNarrationPacing.estimatedDurationMs / 1000).toFixed(1)} 秒</span>
                    <span>约 {activeNarrationPacing.readableUnits} 个朗读单位</span>
                    {activeNarrationPacing.tooLong ? (
                      <>
                        <b>单镜过长，建议拆成 {activeNarrationPacing.suggestedShotCount} 镜，避免画面停留十几秒。</b>
                        <Button variant="secondary" onClick={splitActiveNarration}>一键按语义拆镜</Button>
                      </>
                    ) : <em>节奏适合单镜朗读。</em>}
                  </div>
                  <NumberInput label="镜头时长(ms)" value={activeShot.durationMs} min={500} max={60000} step={100} onChange={(value) => patchShot(activeShot.id, { durationMs: value })} />
                  <p className="settings-hint">
                    {activeShot.audio
                      ? `${activeShot.audio.source === "tts" ? "TTS" : "导入"}音频：${activeShot.audio.filePath}`
                      : "尚未配音；可用 TTS，也可随时导入本镜音频作为可靠回退。"}
                  </p>
                </div>
              </article>
            ) : null}
          </div>
        </section>
      )}

      {step === "motion" && (
        <section className="redraw-card tuiwen-motion-stage">
          <div className="redraw-globals-head">
            <div>
              <strong>关键帧 / 转场</strong>
              <span className="redraw-flow-hint">用统一中间表示保存，后续剪映导出时映射到 common_keyframes。</span>
            </div>
            <div className="comic-inline-actions">
              <span className="settings-hint">Ken Burns 过扫描建议 ×{aspectPlan.cover.recommendedKenBurnsScale}</span>
              <Button variant="secondary" onClick={() => setMotionReplay((value) => value + 1)} disabled={!activeShot}>
                重播预览
              </Button>
            </div>
          </div>
          {activeShot ? (
            <div className="tuiwen-motion-layout">
              <div className="tuiwen-motion-preview" key={`${activeShot.id}-${activeShot.keyframe.preset}-${activeShot.transition?.preset}-${motionReplay}`}>
                <div
                  className={clsx("tuiwen-motion-frame", `preset-${activeShot.keyframe.preset}`)}
                  style={{
                    backgroundImage: activeShot.outputUrl ? `url(${activeShot.outputUrl})` : undefined,
                    aspectRatio: `${project.exportSettings.width} / ${project.exportSettings.height}`,
                  }}
                >
                  {!activeShot.outputUrl ? <span>#{activeShot.index}</span> : null}
                </div>
                {nextShot && activeShot.transition?.preset !== "none" ? (
                  <div
                    className={clsx("tuiwen-motion-next", `transition-${activeShot.transition?.preset ?? "fade"}`)}
                    style={{
                      backgroundImage: nextShot.outputUrl ? `url(${nextShot.outputUrl})` : undefined,
                      aspectRatio: `${project.exportSettings.width} / ${project.exportSettings.height}`,
                    }}
                  >
                    {!nextShot.outputUrl ? <span>#{nextShot.index}</span> : null}
                  </div>
                ) : null}
              </div>
              <div className="redraw-global-prompts">
                <label className="comic-field">
                  <span>运镜预设</span>
                  <select
                    value={activeShot.keyframe.preset}
                    onChange={(event) => patchShot(activeShot.id, { keyframe: keyframeForPreset(event.target.value as TuiwenKeyframePreset) })}
                  >
                    <option value="none">无</option>
                    <option value="kenBurns">Ken Burns</option>
                    <option value="zoomIn">缓慢推近</option>
                    <option value="zoomOut">缓慢拉远</option>
                    <option value="panLeft">向左横移</option>
                    <option value="panRight">向右横移</option>
                    <option value="panUp">向上移动</option>
                    <option value="panDown">向下移动</option>
                  </select>
                </label>
                <label className="comic-field">
                  <span>转场</span>
                  <select
                    value={activeShot.transition?.preset ?? "fade"}
                    onChange={(event) => patchShot(activeShot.id, { transition: { ...(activeShot.transition ?? { durationMs: 250 }), preset: event.target.value as TuiwenTransition["preset"] } })}
                  >
                    <option value="none">无</option>
                    <option value="fade">淡入淡出</option>
                    <option value="slideLeft">左滑</option>
                    <option value="slideRight">右滑</option>
                    <option value="zoom">缩放</option>
                    <option value="wipe">擦除</option>
                  </select>
                </label>
                <NumberInput
                  label="转场时长(ms)"
                  value={activeShot.transition?.durationMs ?? 250}
                  min={0}
                  max={2000}
                  step={50}
                  onChange={(value) => patchShot(activeShot.id, { transition: { ...(activeShot.transition ?? { preset: "fade" }), durationMs: value } })}
                />
                <p className="settings-hint">
                  预览会在末段切到下一镜，是 CSS 近似；真正导出以剪映关键帧与转场格式为准。
                </p>
              </div>
            </div>
          ) : (
            <div className="redraw-results-empty">
              <b>还没有可设置的分镜</b>
              <span>先完成导入和分镜。</span>
            </div>
          )}
        </section>
      )}

      {step !== "import" && step !== "storyboard" && step !== "references" && step !== "generate" && step !== "audio" && step !== "motion" && (
        <section className="redraw-card tuiwen-placeholder-stage">
          <strong>{tuiwenText.steps[step].label}</strong>
          {step === "export" && (
            <>
              <p>
                导出会自动探测本机剪映草稿目录，生成 draft_content.json / draft_meta_info.json /
                draft_virtual_store.json，并把图像、配音和 BGM 一并复制进草稿。
              </p>
              <div className="redraw-global-prompts">
                <label className="comic-field">
                  <span>剪映草稿目录（可留空）</span>
                  <input
                    value={project.exportSettings.jianyingDraftDir ?? ""}
                    placeholder="留空时自动探测 JianyingPro 的 com.lveditor.draft 目录"
                    onChange={(event) => setProject((prev) => ({ ...prev, exportSettings: { ...prev.exportSettings, jianyingDraftDir: event.target.value } }))}
                  />
                </label>
                <label className="comic-field">
                  <span>片头文字</span>
                  <input value={project.exportSettings.intro?.text ?? ""} onChange={(event) => setProject((prev) => ({ ...prev, exportSettings: { ...prev.exportSettings, intro: { ...(prev.exportSettings.intro ?? { durationMs: 1600 }), text: event.target.value } } }))} />
                </label>
                <label className="comic-field">
                  <span>片尾文字</span>
                  <input value={project.exportSettings.outro?.text ?? ""} onChange={(event) => setProject((prev) => ({ ...prev, exportSettings: { ...prev.exportSettings, outro: { ...(prev.exportSettings.outro ?? { durationMs: 1800 }), text: event.target.value } } }))} />
                </label>
                <NumberInput
                  label="片头时长(ms)"
                  value={project.exportSettings.intro?.durationMs ?? 1600}
                  min={0}
                  max={10000}
                  step={100}
                  onChange={(value) => setProject((prev) => ({ ...prev, exportSettings: { ...prev.exportSettings, intro: { ...(prev.exportSettings.intro ?? { text: "" }), durationMs: value } } }))}
                />
                <NumberInput
                  label="片尾时长(ms)"
                  value={project.exportSettings.outro?.durationMs ?? 1800}
                  min={0}
                  max={10000}
                  step={100}
                  onChange={(value) => setProject((prev) => ({ ...prev, exportSettings: { ...prev.exportSettings, outro: { ...(prev.exportSettings.outro ?? { text: "" }), durationMs: value } } }))}
                />
                <label className="btn btn-secondary redraw-file-btn">
                  选择 BGM
                  <input type="file" hidden accept="audio/*" onChange={(event) => { pickBgm(event.target.files?.[0] ?? null); event.target.value = ""; }} />
                </label>
                <NumberInput
                  label="BGM 音量"
                  value={Math.round((project.exportSettings.bgm?.volume ?? 0.22) * 100)}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(value) => setProject((prev) => ({
                    ...prev,
                    exportSettings: {
                      ...prev.exportSettings,
                      bgm: prev.exportSettings.bgm
                        ? { ...prev.exportSettings.bgm, volume: value / 100 }
                        : { filePath: "", volume: value / 100, loop: true, fadeMs: 1200 },
                    },
                  }))}
                />
                <span className="settings-hint">{project.exportSettings.bgm?.filePath || "尚未选择 BGM。导出阶段会复制素材进草稿目录。"}</span>
              </div>
              <div className="tuiwen-aspect-plan">
                <span>视频 {project.exportSettings.width}×{project.exportSettings.height}</span>
                <span>总时长 {(totalDurationMs / 1000).toFixed(1)} 秒</span>
                <span>分镜 {project.panels.length} 个</span>
                <b>目标结构：剪映 10.9.0.14196 · draft version 400000 / 164.0.0</b>
              </div>
              <div className="comic-inline-actions">
                <Button variant="primary" onClick={() => { void exportJianYingDraft(); }} disabled={Boolean(busy) || project.panels.length === 0}>
                  {busy === "exportJianYing" ? "导出中..." : "写入剪映草稿"}
                </Button>
                {exportResult?.draftPath ? (
                  <Button variant="secondary" onClick={() => { void window.naiDesktop.openInExplorer(exportResult.draftPath!); }}>
                    打开草稿目录
                  </Button>
                ) : null}
              </div>
              {exportResult ? (
                <div className={clsx("tuiwen-export-result", exportResult.ok ? "ok" : "failed")}>
                  <b>{exportResult.ok ? "导出完成" : "导出失败"}</b>
                  <span>{exportResult.message}</span>
                  {exportResult.contentPath ? <small>content: {exportResult.contentPath}</small> : null}
                  {exportResult.metaPath ? <small>meta: {exportResult.metaPath}</small> : null}
                  {exportResult.validation ? (
                    <div className="tuiwen-draft-validation">
                      <b>
                        导入前自检：{exportResult.validation.errorCount === 0 ? "通过" : `${exportResult.validation.errorCount} 项错误`}
                        {exportResult.validation.warningCount > 0 ? ` · ${exportResult.validation.warningCount} 项警告` : ""}
                      </b>
                      <small>{exportResult.validation.targetVersion}</small>
                      <ul>
                        {exportResult.validation.checks.map((check) => (
                          <li key={check.id} className={check.status}>
                            <span>{check.status === "pass" ? "✓" : check.status === "warning" ? "!" : "×"}</span>
                            <div>
                              <strong>{check.label}</strong>
                              <small>{check.detail}</small>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {exportResult.warnings?.length ? (
                    <ul>
                      {exportResult.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </section>
      )}
    </main>
  );
}
