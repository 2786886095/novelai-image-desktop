import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { getToolsHubText } from "./i18n";
import { useAppStore } from "./store";

const TagComicGenerator = lazy(() => import("./comic/TagComicGenerator").then((module) => ({ default: module.TagComicGenerator })));
const BatchRedraw = lazy(() => import("./ComicGenerator").then((module) => ({ default: module.BatchRedraw })));
const AitagGallery = lazy(() => import("./AitagGallery"));
const ArtistLab = lazy(() => import("./ArtistLab"));
const PromptCodex = lazy(() => import("./PromptCodex"));
const V5ArtistWeightRepair = lazy(() => import("./V5ArtistWeightRepair"));
const ArtistStringWeightDraw = lazy(() => import("./ArtistStringWeightDraw"));

type ToolId = "hub" | "comic" | "redraw" | "aitag" | "artistLab" | "promptCodex" | "v5ArtistRepair" | "artistStringDraw";

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
  const isWindows = window.naiDesktop.platform === "win32";
  const [activeTool, setActiveTool] = useState<ToolId>(() => {
    const capture = new URLSearchParams(window.location.search).get("uiCapture");
    if (capture === "v5ArtistRepair") return "v5ArtistRepair";
    if (capture === "artistStringDraw") return "artistStringDraw";
    if (capture === "randomArtist") return isWindows ? "artistLab" : "hub";
    const saved = localStorage.getItem("langbai.tools.active.v1");
    return saved === "comic" || saved === "redraw" || saved === "aitag" ||
      saved === "v5ArtistRepair" || saved === "artistStringDraw" ||
      saved === "promptCodex" || (saved === "artistLab" && isWindows)
      ? saved
      : "hub";
  });

  useEffect(() => {
    localStorage.setItem("langbai.tools.active.v1", activeTool);
  }, [activeTool]);

  const back = () => setActiveTool("hub");
  if (activeTool !== "hub") {
    const title = activeTool === "promptCodex" ? codexText.title : text.title;
    return (
      <Suspense fallback={<ToolLoading title={title} />}>
        {activeTool === "comic" ? <TagComicGenerator onBack={back} /> : null}
        {activeTool === "redraw" ? <BatchRedraw onBack={back} /> : null}
        {activeTool === "aitag" ? <AitagGallery onBack={back} /> : null}
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
        <button type="button" className="tool-card ready" onClick={() => setActiveTool("comic")}><b>{text.comicTitle}</b><span>{text.comicDesc}</span><small>{text.ready}</small></button>
        <button type="button" className="tool-card ready" onClick={() => setActiveTool("promptCodex")}><b>{codexText.title}</b><span>{codexText.desc}</span><small>{text.ready}</small></button>
        <button type="button" className="tool-card ready" onClick={() => setActiveTool("redraw")}><b>{text.batchTitle}</b><span>{text.batchDesc}</span><small>{text.ready}</small></button>
        <button type="button" className="tool-card ready" onClick={() => setActiveTool("aitag")}><b>{text.aitagTitle}</b><span>{text.aitagDesc}</span><small>{text.ready}</small></button>
        {isWindows ? <button type="button" className="tool-card ready" onClick={() => setActiveTool("artistLab")}><b>{text.artistLabTitle}</b><span>{text.artistLabDesc}</span><small>{text.ready}</small></button> : null}
        <button type="button" className="tool-card ready" onClick={() => setActiveTool("v5ArtistRepair")}><b>{text.v5ArtistRepairTitle}</b><span>{text.v5ArtistRepairDesc}</span><small>{text.ready}</small></button>
        <button type="button" className="tool-card ready" onClick={() => setActiveTool("artistStringDraw")}><b>{text.artistStringDrawTitle}</b><span>{text.artistStringDrawDesc}</span><small>{text.ready}</small></button>
      </section>
    </main>
  );
}
