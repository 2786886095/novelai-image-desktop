import { createElement, Suspense, useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { getToolsHubText } from "./i18n";
import { useAppStore } from "./store";
import { Icon, type IconName } from "./components/icons";

type ToolScreenProps = { onBack: () => void };

/** Unlike React.lazy alone, this wrapper remembers the resolved component when
 * preload() runs. Rendering after the splash is therefore synchronous rather
 * than briefly suspending on an already-cached dynamic import. */
function createPreloadedTool(
  loader: () => Promise<{ default: ComponentType<ToolScreenProps> }>,
) {
  let resolved: ComponentType<ToolScreenProps> | undefined;
  let pending: Promise<void> | undefined;
  const preload = () => {
    if (resolved) return Promise.resolve();
    pending ??= loader()
      .then((module) => { resolved = module.default; })
      .catch((error) => {
        pending = undefined;
        throw error;
      });
    return pending;
  };
  function PreloadedTool(props: ToolScreenProps) {
    if (!resolved) throw preload();
    return createElement(resolved, props);
  }
  return { Component: PreloadedTool, preload };
}

const comicTool = createPreloadedTool(() => import("./comic/TagComicGenerator").then((module) => ({ default: module.TagComicGenerator })));
const redrawTool = createPreloadedTool(() => import("./ComicGenerator").then((module) => ({ default: module.BatchRedraw })));
const artistLabTool = createPreloadedTool(() => import("./ArtistLab"));
const promptCodexTool = createPreloadedTool(() => import("./PromptCodex"));
const v5ArtistRepairTool = createPreloadedTool(() => import("./V5ArtistWeightRepair"));
const artistStringDrawTool = createPreloadedTool(() => import("./ArtistStringWeightDraw"));

const TagComicGenerator = comicTool.Component;
const BatchRedraw = redrawTool.Component;
const ArtistLab = artistLabTool.Component;
const PromptCodex = promptCodexTool.Component;
const V5ArtistWeightRepair = v5ArtistRepairTool.Component;
const ArtistStringWeightDraw = artistStringDrawTool.Component;

type ToolId = "hub" | "comic" | "redraw" | "artistLab" | "promptCodex" | "v5ArtistRepair" | "artistStringDraw";

const TOOL_ICONS: Record<Exclude<ToolId, "hub">, IconName> = {
  comic: "collections",
  redraw: "draw",
  artistLab: "palette",
  promptCodex: "code",
  v5ArtistRepair: "restore",
  artistStringDraw: "dice",
};

const TOOL_LOADERS: Partial<Record<ToolId, () => Promise<void>>> = {
  comic: comicTool.preload,
  redraw: redrawTool.preload,
  artistLab: artistLabTool.preload,
  promptCodex: promptCodexTool.preload,
  v5ArtistRepair: v5ArtistRepairTool.preload,
  artistStringDraw: artistStringDrawTool.preload,
};

function waitForToolWarmSlot() {
  return new Promise<void>((resolve) => {
    // The supported Electron runtime exposes requestIdleCallback. Its timeout
    // guarantees progress even when the renderer never becomes fully idle.
    window.requestIdleCallback(() => resolve(), { timeout: 1_500 });
  });
}

/** Warm independent tool chunks one at a time after the workbench is visible.
 * A previous Promise.all burst evaluated every large tool during splash and
 * caused CPU/memory spikes on lower-end machines. Card hover/focus/down still
 * performs an immediate targeted preload. */
export async function preloadToolScreens() {
  const results: PromiseSettledResult<void>[] = [];
  for (const loader of Object.values(TOOL_LOADERS)) {
    if (!loader) continue;
    await waitForToolWarmSlot();
    try {
      await loader();
      results.push({ status: "fulfilled", value: undefined });
    } catch (reason) {
      results.push({ status: "rejected", reason });
    }
  }
  return results;
}

function promptCodexCardText(language: unknown) {
  const text = {
    "zh-CN": ["所长 NovelAI 个人法典", "三套法典离线收录、原章节与统一分类检索、提示词一键复制，并可手动更新。"],
    "zh-TW": ["所長 NovelAI 個人法典", "三套法典離線收錄、原章節與統一分類搜尋、提示詞一鍵複製，並可手動更新。"],
    "en-US": ["NovelAI Personal Codex", "Three offline codices with section/category search, one-click copy, and manual updates."],
    "ja-JP": ["NovelAI 個人プロンプト法典", "3冊をオフライン収録。章・分類検索、ワンクリックコピー、手動更新に対応。"],
    "ko-KR": ["NovelAI 개인 프롬프트 법전", "세 법전을 오프라인 제공하며 장·분류 검색, 원클릭 복사, 수동 업데이트를 지원합니다."],
  } as const;
  const [title, desc] = text[
    typeof language === "string" && language in text
      ? (language as keyof typeof text)
      : "zh-CN"
  ];
  return { title, desc };
}

function ToolLoading({ title }: { title: string }) {
  return (
    <main className="tools-hub tools-hub-loading" aria-busy="true">
      <section className="tools-hero"><h2>{title}</h2></section>
      <div className="tool-loading-skeleton" />
    </main>
  );
}

export default function ToolsHub() {
  const language = useAppStore((state) => state.settings?.language);
  const text = useMemo(() => getToolsHubText(language), [language]);
  const codexText = useMemo(() => promptCodexCardText(language), [language]);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const isWindows = window.naiDesktop.platform === "win32";
  const [redirectLegacyAitag] = useState(() =>
    localStorage.getItem("langbai.tools.active.v1") === "aitag",
  );
  const [activeTool, setActiveTool] = useState<ToolId>(() => {
    const capture = new URLSearchParams(window.location.search).get("uiCapture");
    if (capture === "v5ArtistRepair") return "v5ArtistRepair";
    if (capture === "artistStringDraw") return "artistStringDraw";
    if (capture === "randomArtist") return isWindows ? "artistLab" : "hub";
    // A fresh application session always enters the lightweight index. Restoring
    // a previously-opened heavy tool here made the top-level Tools tab appear to
    // freeze while that screen mounted and loaded its data in the background.
    // Within the current session this component remains mounted, so switching
    // tabs still preserves the user's active tool and in-progress state.
    return "hub";
  });

  useEffect(() => {
    localStorage.setItem("langbai.tools.active.v1", activeTool);
  }, [activeTool]);

  useEffect(() => {
    if (redirectLegacyAitag) setActiveTab("onlineGallery");
  }, [redirectLegacyAitag, setActiveTab]);

  const warmTool = useCallback((tool: ToolId) => {
    void TOOL_LOADERS[tool]?.();
  }, []);

  const toolCardHandlers = useCallback((tool: ToolId) => ({
    onPointerEnter: () => warmTool(tool),
    onFocus: () => warmTool(tool),
    onPointerDown: () => warmTool(tool),
  }), [warmTool]);

  const back = () => setActiveTool("hub");
  if (activeTool !== "hub") {
    const title = activeTool === "promptCodex" ? codexText.title : text.title;
    return (
      <Suspense fallback={<ToolLoading title={title} />}>
        {activeTool === "comic" ? <TagComicGenerator onBack={back} /> : null}
        {activeTool === "redraw" ? <BatchRedraw onBack={back} /> : null}
        {activeTool === "promptCodex" ? <PromptCodex onBack={back} /> : null}
        {activeTool === "artistLab" && isWindows ? <ArtistLab onBack={back} /> : null}
        {activeTool === "v5ArtistRepair" ? <V5ArtistWeightRepair onBack={back} /> : null}
        {activeTool === "artistStringDraw" ? <ArtistStringWeightDraw onBack={back} /> : null}
      </Suspense>
    );
  }

  return (
    <main className="tools-hub">
      <section className="tools-hero">
        <div><span className="eyebrow">{text.eyebrow}</span><h2>{text.title}</h2><p>{text.subtitle}</p></div>
      </section>
      <section className="tool-card-grid">
        <button type="button" className="tool-card ready" {...toolCardHandlers("comic")} onClick={() => setActiveTool("comic")}><span className="tool-card-heading"><i><Icon name={TOOL_ICONS.comic} /></i><b>{text.comicTitle}</b></span><span>{text.comicDesc}</span><small>{text.ready}</small></button>
        <button type="button" className="tool-card ready" {...toolCardHandlers("promptCodex")} onClick={() => setActiveTool("promptCodex")}><span className="tool-card-heading"><i><Icon name={TOOL_ICONS.promptCodex} /></i><b>{codexText.title}</b></span><span>{codexText.desc}</span><small>{text.ready}</small></button>
        <button type="button" className="tool-card ready" {...toolCardHandlers("redraw")} onClick={() => setActiveTool("redraw")}><span className="tool-card-heading"><i><Icon name={TOOL_ICONS.redraw} /></i><b>{text.batchTitle}</b></span><span>{text.batchDesc}</span><small>{text.ready}</small></button>
        {isWindows ? <button type="button" className="tool-card ready" {...toolCardHandlers("artistLab")} onClick={() => setActiveTool("artistLab")}><span className="tool-card-heading"><i><Icon name={TOOL_ICONS.artistLab} /></i><b>{text.artistLabTitle}</b></span><span>{text.artistLabDesc}</span><small>{text.ready}</small></button> : null}
        <button type="button" className="tool-card ready" {...toolCardHandlers("v5ArtistRepair")} onClick={() => setActiveTool("v5ArtistRepair")}><span className="tool-card-heading"><i><Icon name={TOOL_ICONS.v5ArtistRepair} /></i><b>{text.v5ArtistRepairTitle}</b></span><span>{text.v5ArtistRepairDesc}</span><small>{text.ready}</small></button>
        <button type="button" className="tool-card ready" {...toolCardHandlers("artistStringDraw")} onClick={() => setActiveTool("artistStringDraw")}><span className="tool-card-heading"><i><Icon name={TOOL_ICONS.artistStringDraw} /></i><b>{text.artistStringDrawTitle}</b></span><span>{text.artistStringDrawDesc}</span><small>{text.ready}</small></button>
      </section>
    </main>
  );
}
