import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../store";
import { DEFAULT_PARAMS, normalizeGenerateParams, type GenerateParams } from "../types";
import { Button } from "../components/ui";
import { confirmAction } from "../components/confirm";
import { indexEntryJobs, artistIdentity, getLegacyRatingLevels } from "./model";
import type { ComparisonEntry, ComparisonJob, ComparisonTag, PoolRule, RatingLevel } from "./model";
import type { ComparisonAction, ComparisonResponse, ComparisonState } from "./protocol";
import { formatComparisonText, getComparisonText } from "./strings";
import { ComparisonResults } from "./components/ComparisonResults";
import { ComparisonRunPanel } from "./components/ComparisonRunPanel";
import { ComparisonSidebar, type ExploreRuleDraft, type ImportMode, type TsvMapping } from "./components/ComparisonSidebar";
import "./style.css";

const EMPTY_STATE: ComparisonState = { version: 1, projects: [], running: null };

function parseSeeds(value: string) {
  const tokens = value.split(/[\s,，]+/).map((item) => item.trim()).filter(Boolean);
  if (tokens.length === 0) return { seeds: [] as number[], error: "seed" };
  const seeds: number[] = [];
  for (const token of tokens) {
    if (!/^\d+$/.test(token)) return { seeds: [] as number[], error: "seed" };
    const number = Number(token);
    if (!Number.isSafeInteger(number) || number < 0 || number > 0xffff_ffff) return { seeds: [] as number[], error: "seed" };
    if (!seeds.includes(number)) seeds.push(number);
  }
  if (seeds.length > 10) return { seeds: [] as number[], error: "count" };
  return { seeds, error: undefined };
}

function projectFromState(state: ComparisonState, id: string | null) {
  return state.projects.find((project) => project.id === id) ?? state.projects[0];
}



const DEFAULT_COMPARISON_SEED = 424242;

function defaultExploreRules(levels: RatingLevel[]): ExploreRuleDraft[] {
  return levels.map((level) => ({ ratingId: level.id, count: 1, minWeight: 0.5, maxWeight: 1 }));
}

function restoreExploreRules(value: unknown, levels: RatingLevel[]): ExploreRuleDraft[] {
  const saved = Array.isArray(value) ? value : [];
  return levels.map((level) => {
    const candidate = saved.find((item) => item && typeof item === "object" && (item as { ratingId?: unknown }).ratingId === level.id) as Partial<ExploreRuleDraft> | undefined;
    const count = typeof candidate?.count === "number" && Number.isFinite(candidate.count)
      ? Math.max(0, Math.min(32, Math.round(candidate.count)))
      : 1;
    const minWeight = typeof candidate?.minWeight === "number" && Number.isFinite(candidate.minWeight)
      ? Math.max(0.1, Math.min(7, candidate.minWeight))
      : 0.5;
    const maxWeight = typeof candidate?.maxWeight === "number" && Number.isFinite(candidate.maxWeight)
      ? Math.max(0.1, Math.min(7, candidate.maxWeight))
      : 1;
    return {
      ratingId: level.id,
      count,
      minWeight: Math.min(minWeight, maxWeight),
      maxWeight: Math.max(minWeight, maxWeight),
    };
  });
}

export function ArtistComparison({ onBack }: { onBack: () => void }) {
  const language = useAppStore((state) => state.settings?.language);
  const appParams = useAppStore((state) => state.params);
  const text = useMemo(() => getComparisonText(language), [language]);
  const [state, setState] = useState<ComparisonState>(EMPTY_STATE);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"compare" | "explore">("compare");
  const [entryText, setEntryText] = useState("");
  const [importMode, setImportMode] = useState<ImportMode>("plain");
  const [tsvMapping, setTsvMapping] = useState<TsvMapping>({ name: 0, prompt: 1, note: 2 });
  const [projectName, setProjectName] = useState("");
  const [comparisonParams, setComparisonParams] = useState<GenerateParams>(() => normalizeGenerateParams(appParams ?? DEFAULT_PARAMS));
  const [positive, setPositive] = useState(appParams?.positivePrompt ?? "");
  const [negative, setNegative] = useState(appParams?.negativePrompt ?? "");
  const [seedText, setSeedText] = useState("424242");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [generatedRecipeIds, setGeneratedRecipeIds] = useState<Set<string>>(() => new Set());
  const [exploreRules, setExploreRules] = useState<ExploreRuleDraft[]>([]);
  const [exploreCount, setExploreCount] = useState(4);
  const [exploreSeed, setExploreSeed] = useState(424242);
  const [autoSaveNotes, setAutoSaveNotes] = useState(true);
  const [busy, setBusy] = useState(false);
  const [libraryRevision, setLibraryRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const loadingRef = useRef(false);
  const hydratingDraftRef = useRef<string | null>(null);
  const appParamsRef = useRef(appParams);
  const project = useMemo(() => projectFromState(state, projectId), [projectId, state]);
  const seeds = useMemo(() => parseSeeds(seedText), [seedText]);
  const selectedRun = project?.runs.find((run) => run.id === selectedRunId);
  const displayEntries = selectedRun?.entries ?? project?.entries ?? [];
  const displayRatings = selectedRun?.ratings ?? project?.ratings ?? [];
  const legacyRatings = useMemo(() => project ? getLegacyRatingLevels(project) : [], [project]);
  const historyJobsByEntry = useMemo(() => project ? indexEntryJobs(project) : new Map<string, ComparisonJob[]>(), [project]);
  const coverJobs = useMemo(() => {
    const result = new Map<string, ComparisonJob | undefined>();
    if (project) for (const entry of project.entries) {
      const jobs = historyJobsByEntry.get(entry.id) ?? [];
      result.set(entry.id, entry.coverJobId === null ? undefined : jobs.find((job) => job.status === "done" && job.image && (entry.coverJobId === undefined || entry.coverJobId === job.id)));
    }
    return result;
  }, [project, historyJobsByEntry]);
  const displayJobs = selectedRun?.jobs ?? [...historyJobsByEntry.values()].flat();
  const singleEntries = project?.entries.filter((entry) => entry.kind === "single" && entry.ratingId !== null) ?? [];
  const allRecipes = project?.entries.filter((entry) => entry.kind === "recipe") ?? [];
  const selectedGeneratedRecipes = allRecipes.filter((entry) => selectedIds.has(entry.id));

  const invoke = useCallback(async (action: ComparisonAction, background = false): Promise<ComparisonResponse | undefined> => {
    if (background && loadingRef.current) return undefined;
    if (background) loadingRef.current = true;
    else setBusy(true);
    try {
      if (!window.naiDesktop?.comparison) throw new Error(text.requestFailed);
      const response = await window.naiDesktop.comparison(action);
      if (response?.state) setState(response.state);
      if (!response?.ok) {
        setError(response?.message || text.requestFailed);
      } else {
        if (!background) setError(undefined);
        if (response.message) setNotice(response.message);
      }
      if (action.type === "explore" && response?.ok) {
        // New previews join the project library; select the new batch without hiding older recipes.
        setSelectedRunId(null);
        const added = new Set(response.addedEntryIds ?? []);
        setSelectedIds(added);
        setGeneratedRecipeIds(added);
      } else if (action.type === "addEntries" && response?.ok) {
        setSelectedIds(new Set(response.addedEntryIds ?? []));
        setSelectedRunId(null);
        if (response.addedEntryIds?.length) setLibraryRevision((value) => value + 1);
      }
      return response;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return undefined;
    } finally {
      if (background) loadingRef.current = false;
      else setBusy(false);
    }
  }, [text.requestFailed]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await invoke({ type: "load" }, true);
      if (!cancelled) setLoading(false);
      if (response?.ok && response.state.projects.length) setProjectId((current) => current ?? response.state.projects[0].id);
    })();
    return () => { cancelled = true; };
  }, [invoke]);

  useEffect(() => {
    if (!state.running) return;
    const timer = window.setInterval(() => { void invoke({ type: "load" }, true); }, 2000);
    return () => window.clearInterval(timer);
  }, [invoke, state.running]);

  useEffect(() => {
    if (!state.projects.length) {
      setProjectId(null);
      setSelectedRunId(null);
      setSelectedIds(new Set());
      return;
    }
    const current = state.projects.find((item) => item.id === projectId) ?? state.projects[0];
    if (current.id !== projectId) setProjectId(current.id);
    if (selectedRunId && !current.runs.some((run) => run.id === selectedRunId)) setSelectedRunId(null);
  }, [projectId, selectedRunId, state.projects]);

  useEffect(() => {
    appParamsRef.current = appParams;
  }, [appParams]);

  useEffect(() => {
    setProjectName(project?.name ?? "");
  }, [project?.id, project?.name]);

  useEffect(() => {
    if (!project) return;
    hydratingDraftRef.current = project.id;
    const fallbackParams = normalizeGenerateParams({
      ...(appParamsRef.current ?? DEFAULT_PARAMS),
      seed: DEFAULT_COMPARISON_SEED,
      seedMode: "fixed",
    });
    setComparisonParams(fallbackParams);
    setPositive(fallbackParams.positivePrompt);
    setNegative(fallbackParams.negativePrompt);
    setSeedText(String(DEFAULT_COMPARISON_SEED));
    setGeneratedRecipeIds(new Set());
    setExploreRules(defaultExploreRules(project.ratings));
    setExploreCount(4);
    setExploreSeed(DEFAULT_COMPARISON_SEED);
    try {
      const raw = localStorage.getItem(`langbai.artist-comparison.draft.v1.${project.id}`);
      if (raw) {
        const saved = JSON.parse(raw) as { params?: Partial<GenerateParams>; positive?: string; negative?: string; seedText?: string; generatedRecipeIds?: string[]; exploreRules?: unknown; exploreCount?: number; exploreSeed?: number };
        if (saved.params) setComparisonParams(normalizeGenerateParams(saved.params));
        if (typeof saved.positive === "string") setPositive(saved.positive);
        if (typeof saved.negative === "string") setNegative(saved.negative);
        if (typeof saved.seedText === "string") setSeedText(saved.seedText);
        setGeneratedRecipeIds(new Set(Array.isArray(saved.generatedRecipeIds) ? saved.generatedRecipeIds.filter((id) => typeof id === "string") : []));
        setExploreRules(restoreExploreRules(saved.exploreRules, project.ratings));
        if (typeof saved.exploreCount === "number" && Number.isFinite(saved.exploreCount)) setExploreCount(Math.max(1, Math.min(100, Math.round(saved.exploreCount))));
        if (typeof saved.exploreSeed === "number" && Number.isSafeInteger(saved.exploreSeed)) setExploreSeed(Math.max(0, Math.min(0xffff_ffff, saved.exploreSeed)));
      }
    } catch { /* An invalid local draft should never prevent opening a project. */ }
  }, [project?.id]);

  useEffect(() => {
    if (project) setExploreRules((current) => project.ratings.map((level) => current.find((rule) => rule.ratingId === level.id) ?? { ratingId: level.id, count: 1, minWeight: 0.5, maxWeight: 1 }));
  }, [project?.id, project?.ratings]);

  useEffect(() => {
    if (!project) return;
    if (hydratingDraftRef.current === project.id) {
      hydratingDraftRef.current = null;
      return;
    }
    try {
      localStorage.setItem(`langbai.artist-comparison.draft.v1.${project.id}`, JSON.stringify({ params: comparisonParams, positive, negative, seedText, generatedRecipeIds: [...generatedRecipeIds], exploreRules, exploreCount, exploreSeed }));
    } catch { /* Draft persistence is best effort; the backend run remains authoritative. */ }
  }, [comparisonParams, exploreCount, exploreRules, exploreSeed, generatedRecipeIds, negative, positive, project?.id, seedText]);

  useEffect(() => {
    const valid = new Set((project?.entries ?? []).map((entry) => entry.id));
    setSelectedIds((current) => new Set([...current].filter((id) => valid.has(id))));
    setGeneratedRecipeIds((current) => new Set([...current].filter((id) => valid.has(id))));
  }, [project?.id, project?.entries]);

  const changeParam = useCallback(<K extends keyof GenerateParams>(key: K, value: GenerateParams[K]) => {
    setComparisonParams((current) => normalizeGenerateParams({ ...current, [key]: value }));
  }, []);
  const changePositive = useCallback((value: string) => { setPositive(value); changeParam("positivePrompt", value); }, [changeParam]);
  const changeNegative = useCallback((value: string) => { setNegative(value); changeParam("negativePrompt", value); }, [changeParam]);
  const changeSeeds = useCallback((value: string) => {
    setSeedText(value);
    const parsed = parseSeeds(value);
    if (!parsed.error && parsed.seeds[0] !== undefined) {
      changeParam("seed", parsed.seeds[0]);
      changeParam("seedMode", "fixed");
    }
  }, [changeParam]);

  const syncFromGeneration = useCallback(() => {
    const synced = normalizeGenerateParams(appParams ?? DEFAULT_PARAMS);
    setComparisonParams(synced);
    setPositive(synced.positivePrompt);
    setNegative(synced.negativePrompt);
    setSeedText(String(synced.seed));
    setNotice(text.useCurrentParams);
  }, [appParams, text.useCurrentParams]);

  const updateSelection = useCallback((entryId: string) => {
    setSelectedIds((current) => { const next = new Set(current); if (next.has(entryId)) next.delete(entryId); else next.add(entryId); return next; });
  }, []);
  const selectAll = useCallback((entryIds: string[]) => {
    setSelectedIds((current) => {
      if (!entryIds.length) return new Set();
      const next = new Set(current);
      for (const entryId of entryIds) next.add(entryId);
      return next;
    });
  }, []);

  const projectEntry = useCallback((entryId: string) => project?.entries.find((entry) => entry.id === entryId), [project]);
  const dispatchEntry = useCallback((entryId: string, patch: Partial<Pick<ComparisonEntry, "ratingId" | "note" | "inPool" | "tagIds">>) => {
    if (!project) return;
    void invoke({ type: "entry", projectId: project.id, entryId, runId: selectedRunId ?? undefined, patch });
  }, [invoke, project, selectedRunId]);
  const rateEntry = useCallback((entryId: string, ratingId: string | null) => dispatchEntry(entryId, { ratingId }), [dispatchEntry]);
  const noteEntry = useCallback((entryId: string, note: string) => dispatchEntry(entryId, { note }), [dispatchEntry]);
  const setEntryTags = useCallback((entryId: string, tagIds: string[]) => dispatchEntry(entryId, { tagIds }), [dispatchEntry]);

  const buildParams = useCallback(() => normalizeGenerateParams({
    ...comparisonParams,
    positivePrompt: positive,
    negativePrompt: negative,
    seed: seeds.seeds[0] ?? 424242,
    seedMode: "fixed",
  }), [comparisonParams, negative, positive, seeds.seeds]);

  const quoteAndStart = useCallback(async (runId: string, knownState?: ComparisonState, knownProjectId?: string) => {
    const targetProjectId = knownProjectId ?? project?.id;
    if (!targetProjectId) return;
    const response = await invoke({ type: "quote", projectId: targetProjectId, runId });
    if (!response?.ok || response.quote === undefined) return;
    const target = response.state.projects.find((item) => item.id === targetProjectId);
    const run = target?.runs.find((item) => item.id === runId) ?? knownState?.projects.find((item) => item.id === targetProjectId)?.runs.find((item) => item.id === runId);
    const jobs = run?.jobs.filter((job) => job.status === "pending").length ?? 0;
    const confirmed = await confirmAction(
      formatComparisonText(language, "quoteConfirm", { jobs, amount: response.quote }),
      text.quoteConfirmTitle,
    );
    if (!confirmed) return;
    await invoke({ type: "start", projectId: targetProjectId, runId, approvedAnlas: response.quote });
  }, [invoke, language, project?.id, text.quoteConfirmTitle]);

  const createRunFor = useCallback(async (entryIds: string[], singleSeed?: number) => {
    if (!project) return;
    if (!entryIds.length) { setError(text.selectEntriesFirst); return; }
    if (singleSeed === undefined && seeds.error) { setError(seeds.error === "count" ? text.seedCountInvalid : text.seedInvalid); return; }
    const response = await invoke({ type: "createRun", projectId: project.id, params: buildParams(), positive, negative, seeds: singleSeed === undefined ? seeds.seeds : [singleSeed], entryIds });
    if (!response?.ok) return;
    const nextProject = response.state.projects.find((item) => item.id === project.id);
    const previousRunIds = new Set(project.runs.map((run) => run.id));
    const run = nextProject?.runs.find((run) => !previousRunIds.has(run.id));
    if (!run) return;
    setSelectedRunId(null);
    setNotice(text.runCreated);
    await quoteAndStart(run.id, response.state, project.id);
  }, [activeTab, buildParams, invoke, negative, positive, project, quoteAndStart, seeds.error, seeds.seeds, text.runCreated, text.seedCountInvalid, text.seedInvalid, text.selectEntriesFirst]);

  const createRun = useCallback(() => {
    if (!project) return;
    const kind = activeTab === "explore" ? "recipe" : "single";
    const scheduledIds = new Set(project.runs.flatMap((run) => run.jobs.map((job) => job.entryId)));
    const scheduledArtists = new Set(project.entries.filter((entry) => scheduledIds.has(entry.id)).map(artistIdentity).filter(Boolean));
    const ids = project.entries.filter((entry) => entry.kind === kind &&
      (selectedIds.size === 0 || selectedIds.has(entry.id)) && !scheduledIds.has(entry.id) &&
      !(artistIdentity(entry) && scheduledArtists.has(artistIdentity(entry)))
    ).map((entry) => entry.id);
    if (!ids.length) { setNotice(text.noNewEntries); return; }
    void createRunFor(ids);
  }, [activeTab, createRunFor, project, selectedIds, text.noNewEntries]);
  const generateRecipes = useCallback(() => {
    const ids = selectedGeneratedRecipes.map((entry) => entry.id);
    if (!ids.length) { setError(text.selectEntriesFirst); return; }
    void createRunFor(ids);
  }, [createRunFor, selectedGeneratedRecipes, text.selectEntriesFirst]);
  const regenerateEntry = useCallback((entryId: string) => {
    void createRunFor([entryId], crypto.getRandomValues(new Uint32Array(1))[0]);
  }, [createRunFor]);

  const createProject = useCallback(async () => {
    const before = new Set(state.projects.map((item) => item.id));
    const response = await invoke({ type: "createProject" });
    const created = response?.state.projects.find((item) => !before.has(item.id)) ?? response?.state.projects.at(-1);
    if (created) { setProjectId(created.id); setSelectedRunId(null); }
  }, [invoke, state.projects]);
  const renameProject = useCallback(() => {
    if (!project || !projectName.trim()) return;
    void invoke({ type: "renameProject", projectId: project.id, name: projectName });
  }, [invoke, project, projectName]);
  const addEntries = useCallback((textValue: string) => {
    if (!project) return;
    void invoke({ type: "addEntries", projectId: project.id, text: textValue });
  }, [invoke, project]);
  const removeEntry = useCallback(async (entryId: string) => {
    if (!project) return;
    const entry = projectEntry(entryId);
    if (!entry) return;
    if (!await confirmAction(`${entry.name}\n${text.deleteLevel}`, text.entries)) return;
    void invoke({ type: "removeEntry", projectId: project.id, entryId });
  }, [invoke, project, projectEntry, text.deleteLevel, text.entries]);
  const saveLevels = useCallback((levels: RatingLevel[]) => {
    if (project) void invoke({ type: "levels", projectId: project.id, levels });
  }, [invoke, project]);
  const replaceLevel = useCallback((levelId: string, targetId: string | null) => {
    if (project) void invoke({ type: "replaceLevel", projectId: project.id, levelId, targetId });
  }, [invoke, project]);
  const syncRatings = useCallback((mapping: Record<string, string | null>) => {
    if (project) void invoke({ type: "syncRatings", projectId: project.id, mapping });
  }, [invoke, project]);
  const saveTags = useCallback((tags: ComparisonTag[]) => {
    if (project) void invoke({ type: "tags", projectId: project.id, tags });
  }, [invoke, project]);
  const explore = useCallback(async () => {
    if (!project) return;
    if (!singleEntries.length) { setError(text.noPoolEntries); return; }
    const response = await invoke({ type: "explore", projectId: project.id, rules: exploreRules as PoolRule[], count: exploreCount, seed: exploreSeed });
    if (response?.ok) setActiveTab("explore");
  }, [exploreCount, exploreRules, exploreSeed, invoke, project, singleEntries.length, text.noPoolEntries]);
  const exportProject = useCallback((format: "zip" | "csv" | "xlsx") => { if (project) { setNotice(text.exportWorking); void invoke({ type: "export", projectId: project.id, format }); } }, [invoke, project, text.exportWorking]);
  const importProject = useCallback(async () => {
    const before = new Set(state.projects.map((item) => item.id));
    const response = await invoke({ type: "import" });
    const imported = response?.state.projects.find((item) => !before.has(item.id));
    if (imported) { setProjectId(imported.id); setSelectedRunId(null); }
  }, [invoke, state.projects]);
  const pause = useCallback(() => { void invoke({ type: "pause" }); }, [invoke]);
  const retry = useCallback(async (runId: string, job: ComparisonJob) => {
    if (!project) return;
    const uncertain = job.status === "uncertain";
    if (uncertain && !await confirmAction(text.retryWarning, text.retryUncertain)) return;
    void invoke({ type: "retry", projectId: project.id, runId, jobId: job.id, ...(uncertain ? { acknowledgeUncertain: true } : {}) });
  }, [invoke, project, text.retryUncertain, text.retryWarning]);
  const setCover = useCallback((entryId: string, jobId: string | null) => {
    if (project) void invoke({ type: "cover", projectId: project.id, entryId, jobId });
  }, [invoke, project]);

  const runningRunId = state.running && state.running.projectId === project?.id ? state.running.runId : undefined;
  const seedError = seeds.error === "count" ? text.seedCountInvalid : seeds.error ? text.seedInvalid : undefined;
  const entryCount = selectedRun ? selectedRun.entries.length : project?.entries.length ?? 0;
  const resultsEntries = activeTab === "explore" ? displayEntries.filter((entry) => entry.kind === "recipe") : displayEntries.filter((entry) => entry.kind === "single");
  return <main className="artist-comparison">
    <header className="comparison-hero"><div className="comparison-hero-copy"><span className="eyebrow">{text.eyebrow}</span><h1>{text.title}</h1><p>{text.subtitle}</p></div><div className="comparison-hero-actions"><span className={`comparison-live-indicator${state.running ? " is-running" : ""}`}><i />{state.running?.nextGenerationAt ? text.waitingInterval : state.running ? text.running : text.idle}</span><Button variant="ghost" onClick={onBack}>{text.back}</Button></div></header>
    {loading ? <div className="comparison-loading" aria-busy="true">{text.loading}</div> : <>
      <div className="comparison-tabs" role="tablist" aria-label={text.title}><button type="button" className={activeTab === "compare" ? "active" : ""} onClick={() => { setActiveTab("compare"); setSelectedRunId(null); setSelectedIds(new Set()); }}>{text.compareTab}</button><button type="button" className={activeTab === "explore" ? "active" : ""} onClick={() => { setActiveTab("explore"); setSelectedRunId(null); setSelectedIds(new Set()); }}>{text.exploreTab}<small>{allRecipes.length || ""}</small></button></div>
      <div className="comparison-layout"><ComparisonSidebar activeTab={activeTab} text={text} project={project} projects={state.projects} onProjectChange={(id) => { setProjectId(id); setSelectedRunId(null); setSelectedIds(new Set()); }} onCreateProject={() => void createProject()} projectName={projectName} onProjectNameChange={setProjectName} onRenameProject={renameProject} entryText={entryText} onEntryTextChange={setEntryText} importMode={importMode} onImportModeChange={setImportMode} tsvMapping={tsvMapping} onTsvMappingChange={setTsvMapping} onAddEntries={addEntries} positive={positive} negative={negative} onPositiveChange={changePositive} onNegativeChange={changeNegative} onSyncFromGeneration={syncFromGeneration} params={comparisonParams} onParamChange={changeParam} onIntervalChange={(intervalSeconds, intervalMaxSeconds) => { if (project) void invoke({ type: "setInterval", projectId: project.id, intervalSeconds, intervalMaxSeconds }); }} seedText={seedText} onSeedTextChange={changeSeeds} seedError={seedError} levels={project?.ratings ?? []} onLevels={saveLevels} onReplaceLevel={replaceLevel} legacyRatings={legacyRatings} onSyncRatings={syncRatings} selectedCount={selectedIds.size} filteredCount={entryCount} onSelectFiltered={() => setSelectedIds(new Set(resultsEntries.map((entry) => entry.id)))} onClearSelection={() => setSelectedIds(new Set())} onCreateRun={createRun} busy={busy} exploreRules={exploreRules} onExploreRulesChange={setExploreRules} exploreCount={exploreCount} onExploreCountChange={setExploreCount} exploreSeed={exploreSeed} onExploreSeedChange={setExploreSeed} onExplore={explore} onGenerateRecipes={generateRecipes} generatedRecipeCount={selectedGeneratedRecipes.length} poolCount={singleEntries.length} onExport={exportProject} onImport={() => void importProject()} tags={project?.tags ?? []} onTags={saveTags} /><div className="comparison-main-column"><ComparisonRunPanel exploration={activeTab === "explore"} text={text} project={project} selectedRunId={selectedRunId} onRunChange={setSelectedRunId} onCreateRun={createRun} onQuoteAndStart={(runId) => void quoteAndStart(runId)} onPause={pause} onRetry={retry} runningRunId={runningRunId} pauseRequested={state.running?.pauseRequested} busy={busy} />{activeTab === "explore" && <div className="comparison-explore-banner"><strong>{text.exploreViewTitle}</strong><span>{text.exploreViewHint}</span></div>}<ComparisonResults key={`${project?.id}-${activeTab}-${libraryRevision}`} exploration={activeTab === "explore"} projectEntryCount={project?.entries.length ?? 0} projectArtistCount={project?.entries.filter((entry) => entry.kind === "single").length ?? 0} text={text} entries={resultsEntries} jobs={displayJobs} historyJobsByEntry={historyJobsByEntry} coverJobs={coverJobs} onSetCover={setCover} onRegenerate={regenerateEntry} regenerateDisabled={busy} ratings={displayRatings} selectedIds={selectedIds} onToggleSelected={updateSelection} onSelectAll={selectAll} onRating={rateEntry} onNote={noteEntry} tags={project?.tags ?? []} onTags={setEntryTags} onRemove={(entryId) => void removeEntry(entryId)} autoSaveNotes={autoSaveNotes} onAutoSaveNotesChange={setAutoSaveNotes} selectedRunId={selectedRunId} error={error} notice={notice} /></div></div>
    </>}
  </main>;
}

export default ArtistComparison;
