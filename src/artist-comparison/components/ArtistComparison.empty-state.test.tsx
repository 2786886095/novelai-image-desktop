import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArtistComparison } from "../ArtistComparison";
import { ComparisonResults } from "./ComparisonResults";
import { ComparisonRunPanel } from "./ComparisonRunPanel";
import { ComparisonRatingSyncPanel } from "./ComparisonRatingSync";
import { TagPicker } from "./ComparisonTags";
import type { ComparisonEntry, ComparisonJob } from "../model";
import { getComparisonText } from "../strings";
import { DEFAULT_PARAMS } from "../../types";

const entry: ComparisonEntry = {
  id: "entry-1",
  name: "ojipon",
  prompt: "ojipon",
  kind: "single",
  ratingId: null,
  note: "saved",
  inPool: false,
};

const libraryJob: ComparisonJob = {
  id: "job-library",
  entryId: entry.id,
  seed: 101,
  status: "done",
  image: { id: "image-library", filePath: "/tmp/library.png", fileUrl: "file:///tmp/library.png" },
};

const historicalJob: ComparisonJob = {
  id: "job-history",
  entryId: entry.id,
  seed: 202,
  status: "done",
  image: { id: "image-history", filePath: "/tmp/history.png", fileUrl: "file:///tmp/history.png" },
};

const resultCallbacks = {
  onToggleSelected: () => undefined,
  onSelectAll: () => undefined,
  onRating: () => undefined,
  onNote: () => undefined,
  tags: [],
  onTags: () => undefined,
  onRemove: () => undefined,
  onAutoSaveNotesChange: () => undefined,
};

describe("artist comparison empty state", () => {
  it("renders before the first project load when the bridge has no state yet", () => {
    const markup = renderToString(<ArtistComparison onBack={() => undefined} />);

    expect(markup).toContain("正在读取比较项目");
  });

  it("renders a saved library photo and its cover metadata on the server", () => {
    const markup = renderToString(<ComparisonResults
      text={getComparisonText("zh-CN")}
      entries={[entry]}
      jobs={[libraryJob]}
      historyJobsByEntry={new Map([[entry.id, [libraryJob]]])}
      coverJobs={new Map([[entry.id, libraryJob]])}
      onSetCover={() => undefined}
      onRegenerate={() => undefined}
      ratings={[]}
      selectedIds={new Set()}
      selectedRunId={null}
      {...resultCallbacks}
      autoSaveNotes
    />);

    expect(markup).toContain("file:///tmp/library.png");
    expect(markup).toContain("封面");
    expect(markup).toContain("1 张已保存");
  });

  it("keeps an explicitly removed cover empty in the library while history uses its own run image", () => {
    const libraryMarkup = renderToString(<ComparisonResults
      text={getComparisonText("zh-CN")}
      entries={[entry]}
      jobs={[libraryJob]}
      historyJobsByEntry={new Map([[entry.id, [libraryJob]]])}
      coverJobs={new Map([[entry.id, undefined]])}
      ratings={[]}
      selectedIds={new Set()}
      selectedRunId={null}
      {...resultCallbacks}
      autoSaveNotes
    />);
    expect(libraryMarkup).not.toContain("file:///tmp/library.png");
    expect(libraryMarkup).toContain("选择封面");

    const historyMarkup = renderToString(<ComparisonResults
      text={getComparisonText("zh-CN")}
      entries={[entry]}
      jobs={[historicalJob]}
      historyJobsByEntry={new Map([[entry.id, [libraryJob, historicalJob]]])}
      coverJobs={new Map([[entry.id, undefined]])}
      ratings={[]}
      selectedIds={new Set()}
      selectedRunId="run-history"
      {...resultCallbacks}
      autoSaveNotes
    />);
    expect(historyMarkup).toContain("file:///tmp/history.png");
    expect(historyMarkup).not.toContain("file:///tmp/library.png");
  });

  it("shows the latest unfinished run from the saved library without creating a duplicate", () => {
    const run = {
      id: "run-pending",
      createdAt: "2026-09-17T00:00:00.000Z",
      params: DEFAULT_PARAMS,
      positive: "",
      negative: "",
      jobs: [
        { id: "job-pending", entryId: entry.id, seed: 1, status: "pending" as const },
        { id: "job-uncertain", entryId: entry.id, seed: 2, status: "uncertain" as const },
      ],
      entries: [entry],
      ratings: [],
    };
    const markup = renderToString(<ComparisonRunPanel
      text={getComparisonText("zh-CN")}
      project={{ id: "project-1", name: "画师比较", ratings: [], entries: [entry], runs: [run] }}
      selectedRunId={null}
      onRunChange={() => undefined}
      onCreateRun={() => undefined}
      onQuoteAndStart={() => undefined}
      onPause={() => undefined}
      onRetry={() => undefined}
      busy={false}
    />);

    expect(markup).toContain("单画师生成进度");
    expect(markup).toContain("继续任务沿用原提示词");
    expect(markup).toContain("继续原任务");
    expect(markup).toContain("生成新增画师");
    expect(markup).not.toContain("选择轮次");
  });

  it("keeps all combinations selected while exposing active queue controls", () => {
    const recipe = { ...entry, kind: "recipe" as const };
    const run = { id: "combination-run", createdAt: "2026-09-20T00:00:00Z", params: DEFAULT_PARAMS, positive: "", negative: "", entries: [recipe], ratings: [], jobs: [{ ...libraryJob, status: "running" as const }] };
    const markup = renderToString(<ComparisonRunPanel exploration text={getComparisonText("zh-CN")}
      project={{ id: "project", name: "A", ratings: [], entries: [recipe], runs: [run] }}
      selectedRunId={null} runningRunId={run.id} busy={false}
      onRunChange={() => undefined} onCreateRun={() => undefined} onQuoteAndStart={() => undefined} onPause={() => undefined} onRetry={() => undefined} />);
    expect(markup).toContain("本项目全部组合");
    expect(markup).toContain("生成记录（参数与历史）");
    expect(markup).toContain("暂停");
  });

  it("does not show the legacy artist queue inside combination exploration", () => {
    const run = { id: "artist-run", createdAt: "2026-09-17T00:00:00Z", params: DEFAULT_PARAMS, positive: "", negative: "", entries: [entry], ratings: [], jobs: [{ ...libraryJob, status: "pending" as const }] };
    const markup = renderToString(<ComparisonRunPanel exploration text={getComparisonText("zh-CN")}
      project={{ id: "B", name: "B", ratings: [], entries: [entry], runs: [run] }} selectedRunId={null} busy={false}
      onRunChange={() => undefined} onCreateRun={() => undefined} onQuoteAndStart={() => undefined} onPause={() => undefined} onRetry={() => undefined} />);
    expect(markup).not.toContain("artist-run");
    expect(markup).not.toContain("开始/继续生成");
    expect(markup).toContain("画师组合生成进度");
  });

  it("keeps pagination compact for a 5000-entry library", () => {
    const entries = Array.from({ length: 5000 }, (_, index) => ({ ...entry, id: `entry-${index}`, name: `artist-${index}` }));
    const markup = renderToString(<ComparisonResults
      text={getComparisonText("zh-CN")}
      entries={entries}
      jobs={[]}
      ratings={[]}
      selectedIds={new Set()}
      selectedRunId={null}
      {...resultCallbacks}
      autoSaveNotes
    />);
    const pagination = markup.match(/<nav class="comparison-pagination"[\s\S]*?<\/nav>/)?.[0] ?? "";

    expect(pagination).toContain("…");
    expect(pagination).toContain("第 209 页");
    expect((pagination.match(/aria-label="第 /g) ?? []).length).toBeLessThan(10);
  });

  it("renders shared tag selection while showing pool membership as derived from rating", () => {
    const tagMarkup = renderToString(<TagPicker
      text={getComparisonText("zh-CN")}
      tags={[{ id: "tag-favorite", label: "精选" }]}
      value={["tag-favorite"]}
      onChange={() => undefined}
    />);
    expect(tagMarkup).toContain("精选");
    expect(tagMarkup).toContain("选择标签");

    const markup = renderToString(<ComparisonResults
      text={getComparisonText("zh-CN")}
      entries={[{ ...entry, ratingId: null, tagIds: ["tag-favorite"] }]}
      jobs={[]}
      ratings={[]}
      selectedIds={new Set()}
      selectedRunId={null}
      {...resultCallbacks}
      tags={[{ id: "tag-favorite", label: "精选" }]}
      autoSaveNotes
    />);
    expect(markup).toContain("未评级，不进入探索池");
    expect(markup).not.toContain("comparison-pool-toggle");
  });

  it("keeps legacy rating mappings explicit until every old level is chosen", () => {
    const markup = renderToString(<ComparisonRatingSyncPanel
      text={getComparisonText("zh-CN")}
      legacyRatings={[{ id: "legacy-level", label: "旧评级", color: "#777" }]}
      levels={[{ id: "current-level", label: "当前评级", color: "#7557d7" }]}
      busy={false}
      onSync={() => undefined}
    />);

    expect(markup).toContain("同步历史评级方案");
    expect(markup).toContain("旧评级");
    expect(markup).toContain("请选择映射");
    expect(markup).toContain("确认同步历史评级");
    expect(markup).toContain("disabled");
  });
});
