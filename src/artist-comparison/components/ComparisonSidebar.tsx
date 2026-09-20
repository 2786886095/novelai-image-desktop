import { useEffect, useMemo, useRef, useState } from "react";
import type { GenerateParams, NAIModel } from "../../types";
import { NAI_MODELS } from "../../types";
import type { ComparisonProject, ComparisonTag, PoolRule, RatingLevel } from "../model";
import type { ComparisonStrings } from "../strings";
import { Button, CommittedNumberInput, SelectMenuCompat } from "../../components/ui";
import { ComparisonTagManager } from "./ComparisonTags";
import { ComparisonRatingSyncPanel } from "./ComparisonRatingSync";

export type ImportMode = "plain" | "tsv";
export type TsvMapping = { name: number | null; prompt: number | null; note: number | null };
export type ExploreRuleDraft = PoolRule;

export interface ComparisonSidebarProps {
  activeTab: "compare" | "explore";
  text: ComparisonStrings;
  project?: ComparisonProject;
  projects: ComparisonProject[];
  onProjectChange: (projectId: string) => void;
  onCreateProject: () => void;
  projectName: string;
  onProjectNameChange: (name: string) => void;
  onRenameProject: () => void;
  entryText: string;
  onEntryTextChange: (text: string) => void;
  importMode: ImportMode;
  onImportModeChange: (mode: ImportMode) => void;
  tsvMapping: TsvMapping;
  onTsvMappingChange: (mapping: TsvMapping) => void;
  onAddEntries: (text: string) => void;
  positive: string;
  negative: string;
  onPositiveChange: (value: string) => void;
  onNegativeChange: (value: string) => void;
  onSyncFromGeneration: () => void;
  params: GenerateParams;
  onParamChange: <K extends keyof GenerateParams>(key: K, value: GenerateParams[K]) => void;
  onIntervalChange: (value: number, max: number) => void;
  seedText: string;
  onSeedTextChange: (value: string) => void;
  seedError?: string;
  levels: RatingLevel[];
  onLevels: (levels: RatingLevel[]) => void;
  onReplaceLevel: (levelId: string, targetId: string | null) => void;
  legacyRatings: RatingLevel[];
  onSyncRatings: (mapping: Record<string, string | null>) => void;
  selectedCount: number;
  filteredCount: number;
  onSelectFiltered: () => void;
  onClearSelection: () => void;
  onCreateRun: () => void;
  busy: boolean;
  exploreRules: ExploreRuleDraft[];
  onExploreRulesChange: (rules: ExploreRuleDraft[]) => void;
  exploreCount: number;
  onExploreCountChange: (count: number) => void;
  exploreSeed: number;
  onExploreSeedChange: (seed: number) => void;
  onExplore: () => void;
  onGenerateRecipes: () => void;
  generatedRecipeCount: number;
  poolCount: number;
  onExport: (format: "zip" | "csv" | "xlsx") => void;
  onImport: () => void;
  tags: ComparisonTag[];
  onTags: (tags: ComparisonTag[]) => void;
}

const LEVEL_COLORS = ["#7557d7", "#3387c8", "#278b63", "#c58a2b", "#c45a63", "#885b99"];

function nextLevelId(levels: RatingLevel[]) {
  const existing = new Set(levels.map((level) => level.id));
  const randomUUID = globalThis.crypto?.randomUUID;
  let candidate = typeof randomUUID === "function"
    ? `level-${randomUUID.call(globalThis.crypto)}`
    : `level-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  while (existing.has(candidate)) candidate = `level-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return candidate;
}

function toMappedTsv(text: string, mapping: TsvMapping) {
  const rows = text
    .split(/\r?\n/)
    .map((row) => row.split("\t"))
    .filter((row) => row.some((cell) => cell.trim()));
  if (rows.length === 0) return "";
  return rows
    .map((row) => {
      const promptIndex = mapping.prompt != null && mapping.prompt < row.length ? mapping.prompt : row.length === 1 ? 0 : null;
      const nameIndex = mapping.name != null && mapping.name < row.length && mapping.name !== promptIndex ? mapping.name : null;
      const noteIndex = mapping.note != null && mapping.note < row.length && mapping.note !== promptIndex && mapping.note !== nameIndex ? mapping.note : null;
      const value = (index: number | null) => index == null ? "" : (row[index] ?? "").trim();
      const prompt = value(promptIndex);
      if (!prompt) return "";
      return [value(nameIndex), prompt, value(noteIndex)].join("\t");
    })
    .filter(Boolean)
    .join("\n");
}

function RatingEditor({
  text,
  levels,
  onLevels,
  onReplaceLevel,
}: Pick<ComparisonSidebarProps, "text" | "levels" | "onLevels" | "onReplaceLevel">) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(levels);
  const [dirty, setDirty] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null | undefined>(undefined);
  const syncedLevelsSignature = useRef(JSON.stringify(levels));
  const levelsSignature = JSON.stringify(levels);

  useEffect(() => {
    if (levelsSignature !== syncedLevelsSignature.current) {
      syncedLevelsSignature.current = levelsSignature;
      if (!dirty) setDraft(levels);
    }
    if (deleteId && !levels.some((level) => level.id === deleteId)) setDeleteId(null);
  }, [deleteId, dirty, levels, levelsSignature]);

  const update = (id: string, patch: Partial<RatingLevel>) => {
    setDraft((current) => current.map((level) => level.id === id ? { ...level, ...patch } : level));
    setDirty(true);
  };
  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= draft.length) return;
    setDraft((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
    setDirty(true);
  };
  const add = () => {
    const level: RatingLevel = {
      id: nextLevelId(draft),
      label: `${text.ratingScheme} ${draft.length + 1}`,
      color: LEVEL_COLORS[draft.length % LEVEL_COLORS.length],
    };
    setDraft((current) => [...current, level]);
    setDirty(true);
    setOpen(true);
  };
  const usedLevel = deleteId !== null && levels.some((level) => level.id === deleteId);
  const deleteCandidates = levels.filter((level) => level.id !== deleteId);

  return (
    <section className="comparison-rating-editor">
      <div className="comparison-section-heading">
        <div>
          <h3>{text.ratingScheme}</h3>
          <p>{levels.length} {text.ratingScheme.toLocaleLowerCase()}</p>
        </div>
        <Button variant="ghost" onClick={() => setOpen((value) => !value)}>{open ? text.closeEditor : text.editRatings}</Button>
      </div>
      <div className="comparison-level-summary">
        {levels.map((level) => <span key={level.id} className="comparison-rating-chip"><i style={{ background: level.color }} />{level.label}</span>)}
        {levels.length === 0 && <span className="comparison-muted">{text.noRating}</span>}
      </div>
      {open && <div className="comparison-rating-editor-body">
        {draft.map((level, index) => <div className="comparison-level-row" key={level.id}>
          <span className="comparison-level-swatch" style={{ background: level.color }} aria-hidden="true" />
          <label className="comparison-inline-field"><span>{text.ratingName}</span><input value={level.label} onChange={(event) => update(level.id, { label: event.target.value })} /></label>
          <label className="comparison-inline-color"><span>{text.ratingColor}</span><input type="color" value={level.color} onChange={(event) => update(level.id, { color: event.target.value })} /></label>
          <div className="comparison-level-actions">
            <Button variant="ghost" disabled={index === 0} title={text.moveUp} aria-label={text.moveUp} onClick={() => move(index, -1)}>↑</Button>
            <Button variant="ghost" disabled={index === draft.length - 1} title={text.moveDown} aria-label={text.moveDown} onClick={() => move(index, 1)}>↓</Button>
            <Button variant="ghost" title={text.deleteLevel} aria-label={text.deleteLevel} onClick={() => { setDeleteId(level.id); setDeleteTarget(undefined); }}>×</Button>
          </div>
        </div>)}
        {deleteId && <div className="comparison-delete-level" role="alertdialog" aria-label={text.deleteLevelTitle}>
          <strong>{text.deleteLevelTitle}</strong>
          {usedLevel ? <>
            <p>{text.deleteLevelHint}</p>
            <label className="comparison-field"><span>{text.replaceWith}</span><SelectMenuCompat value={deleteTarget === undefined ? "__comparison_delete_unset__" : deleteTarget ?? ""} aria-label={text.replaceWith} onChange={(event) => setDeleteTarget(event.target.value === "__comparison_delete_unset__" ? undefined : event.target.value || null)}>
              <option value="__comparison_delete_unset__">{text.chooseDeleteTarget}</option>
              <option value="">{text.clearRatings}</option>
              {deleteCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}
            </SelectMenuCompat></label>
          </> : <p>{text.deleteLevel}</p>}
          <div className="comparison-inline-actions"><Button variant="ghost" onClick={() => setDeleteId(null)}>{text.cancel}</Button><Button variant="danger" disabled={Boolean(usedLevel && deleteTarget === undefined)} onClick={() => {
            if (usedLevel && deleteTarget !== undefined) onReplaceLevel(deleteId, deleteTarget);
            setDraft((current) => current.filter((level) => level.id !== deleteId));
            setDirty(true);
            setDeleteId(null);
          }}>{text.confirmDelete}</Button></div>
        </div>}
        <div className="comparison-inline-actions">
          <Button variant="ghost" onClick={add}><span aria-hidden="true">＋</span>{text.addLevel}</Button>
          <Button variant="primary" onClick={() => { setDirty(false); onLevels(draft); setOpen(false); }}>{text.saveRatings}</Button>
        </div>
      </div>}
    </section>
  );
}

export function ComparisonSidebar(props: ComparisonSidebarProps) {
  const {
    activeTab,
    text,
    project,
    projects,
    onProjectChange,
    onCreateProject,
    projectName,
    onProjectNameChange,
    onRenameProject,
    entryText,
    onEntryTextChange,
    importMode,
    onImportModeChange,
    tsvMapping,
    onTsvMappingChange,
    onAddEntries,
    positive,
    negative,
    onPositiveChange,
    onNegativeChange,
    onSyncFromGeneration,
    params,
    onParamChange,
    onIntervalChange,
    seedText,
    onSeedTextChange,
    seedError,
    levels,
    onLevels,
    onReplaceLevel,
    legacyRatings,
    onSyncRatings,
    selectedCount,
    filteredCount,
    onSelectFiltered,
    onClearSelection,
    busy,
    exploreRules,
    onExploreRulesChange,
    exploreCount,
    onExploreCountChange,
    exploreSeed,
    onExploreSeedChange,
    onExplore,
    onGenerateRecipes,
    generatedRecipeCount,
    poolCount,
    onExport,
    onImport,
    tags,
    onTags,
  } = props;
  const [tsvHeaders, tsvRows] = useMemo(() => {
    const rows = entryText.split(/\r?\n/).map((line) => line.split("\t")).filter((row) => row.some((cell) => cell.trim()));
    const count = rows.reduce((max, row) => Math.max(max, row.length), 0);
    const headers = Array.from({ length: count }, (_, index) => rows[0]?.[index]?.trim() || `${text.entries} ${index + 1}`);
    return [headers, rows.slice(0, 4)] as const;
  }, [entryText, text.entries]);
  const mappedText = importMode === "tsv" ? toMappedTsv(entryText, tsvMapping) : entryText;
  const singles = project?.entries.filter((entry) => entry.kind === "single").length ?? 0;

  return <aside className="comparison-sidebar">
    <section className="comparison-side-section comparison-project-section">
      <div className="comparison-section-heading"><h3>{text.project}</h3><Button variant="ghost" onClick={onCreateProject}>{text.createProject}</Button></div>
      {projects.length > 0 ? <label className="comparison-field"><span>{text.chooseProject}</span><SelectMenuCompat value={project?.id ?? ""} aria-label={text.chooseProject} onChange={(event) => onProjectChange(event.target.value)}>
        {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </SelectMenuCompat></label> : <p className="comparison-muted">{text.projectEmpty}</p>}
      {project && <div className="comparison-project-rename"><input value={projectName} placeholder={text.renamePlaceholder} onChange={(event) => onProjectNameChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onRenameProject(); } }} /><Button variant="ghost" disabled={!projectName.trim() || busy} onClick={onRenameProject}>{text.renameProject}</Button></div>}
      <div className="comparison-project-backup"><div><strong>{text.exports}</strong><p>{text.importHint}</p><p>{text.exportExcelHint}</p></div><div className="comparison-export-actions"><Button variant="ghost" disabled={!project || busy} onClick={() => onExport("zip")}>{text.exportZip}</Button><Button variant="ghost" disabled={!project || busy} onClick={() => onExport("xlsx")}>{text.exportExcel}</Button><Button variant="ghost" disabled={!project || busy} onClick={() => onExport("csv")}>{text.exportCsv}</Button><Button variant="ghost" disabled={busy} onClick={onImport}>{text.importProject}</Button></div></div>
      {project && <ComparisonTagManager key={project.id} text={text} tags={tags} onChange={onTags} busy={busy} />}
    </section>

    {activeTab === "explore" && <section className="comparison-side-section comparison-explore-section">
      <div className="comparison-section-heading"><div><h3>{text.exploreRules}</h3><p>{text.exploreHint}</p></div></div>
      <div className="comparison-pool-stat"><strong>{poolCount}</strong><span>{text.pool}</span><small>{singles} {text.single.toLocaleLowerCase()}</small></div>
      <div className="comparison-explore-rules">{levels.map((level) => {
        const rule = exploreRules.find((item) => item.ratingId === level.id) ?? { ratingId: level.id, count: 1, minWeight: 0.5, maxWeight: 1 };
        return <div className="comparison-explore-rule" key={level.id}>
          <span className="comparison-rating-chip"><i style={{ background: level.color }} />{level.label}</span>
          <CommittedNumberInput label={text.levelCount} value={rule.count} min={0} max={32} normalize={(value) => Math.max(0, Math.min(32, Math.round(value)))} onCommit={(value) => onExploreRulesChange(exploreRules.map((item) => item.ratingId === level.id ? { ...item, count: value } : item))} />
          <CommittedNumberInput label={text.minWeight} value={rule.minWeight} min={0.1} max={7} step={0.05} normalize={(value) => Math.max(0.1, Math.min(7, value))} onCommit={(value) => onExploreRulesChange(exploreRules.map((item) => item.ratingId === level.id ? { ...item, minWeight: value } : item))} />
          <CommittedNumberInput label={text.maxWeight} value={rule.maxWeight} min={0.1} max={7} step={0.05} normalize={(value) => Math.max(0.1, Math.min(7, value))} onCommit={(value) => onExploreRulesChange(exploreRules.map((item) => item.ratingId === level.id ? { ...item, maxWeight: value } : item))} />
        </div>;
      })}</div>
      <div className="comparison-number-grid comparison-explore-fields"><CommittedNumberInput label={text.recipeCount} value={exploreCount} min={1} max={100} normalize={(value) => Math.max(1, Math.min(100, Math.round(value)))} onCommit={onExploreCountChange} /><CommittedNumberInput label={text.exploreSeed} value={exploreSeed} min={0} max={4294967295} normalize={(value) => Math.max(0, Math.min(4294967295, Math.round(value)))} onCommit={onExploreSeedChange} /></div>
      <div className="comparison-inline-actions"><Button variant="secondary" disabled={!poolCount || busy} onClick={onExplore}>{text.previewRecipes}</Button><Button variant="ghost" disabled={!generatedRecipeCount || busy} onClick={onGenerateRecipes}>{text.generateRecipes} ({generatedRecipeCount})</Button></div>
    </section>}
    {activeTab === "compare" && <section className="comparison-side-section">
      <div className="comparison-section-heading"><div><h3>{text.entries}</h3><p>{text.entriesCount.replace("{count}", String(project?.entries.length ?? 0))}</p></div></div>
      <div className="comparison-segmented" role="tablist" aria-label={text.entryInput}>
        <button type="button" className={importMode === "plain" ? "active" : ""} onClick={() => onImportModeChange("plain")}>{text.plainText}</button>
        <button type="button" className={importMode === "tsv" ? "active" : ""} onClick={() => onImportModeChange("tsv")}>{text.tsvText}</button>
      </div>
      <label className="comparison-field"><span>{text.entryInput}</span><textarea className="comparison-textarea" value={entryText} onChange={(event) => onEntryTextChange(event.target.value)} placeholder={text.entryHint} rows={7} /></label>
      <p className="comparison-field-hint">{text.entryHint}</p>
      {importMode === "tsv" && tsvHeaders.length > 0 && <div className="comparison-tsv-preview">
        <strong>{text.tsvPreview}</strong>
        <div className="comparison-tsv-mapping">
          {(["name", "prompt", "note"] as const).map((key) => <label className="comparison-field" key={key}><span>{text[`${key}Column`]}</span><SelectMenuCompat value={tsvMapping[key] == null ? "" : String(tsvMapping[key])} aria-label={text[`${key}Column`]} onChange={(event) => onTsvMappingChange({ ...tsvMapping, [key]: event.target.value === "" ? null : Number(event.target.value) })}>
            <option value="">{text.noColumn}</option>
            {tsvHeaders.map((header, index) => <option key={index} value={index}>{header}</option>)}
          </SelectMenuCompat></label>)}
        </div>
        <div className="comparison-tsv-table">{tsvRows.map((row, rowIndex) => <div key={rowIndex} className="comparison-tsv-row">{tsvHeaders.map((_, index) => <span key={index}>{row[index] || "—"}</span>)}</div>)}</div>
      </div>}
      <Button variant="primary" disabled={!project || !mappedText.trim() || busy} onClick={() => onAddEntries(mappedText)}>{text.addEntries}</Button>
      {project && <div className="comparison-selection-actions"><span>{text.selected.replace("{count}", String(selectedCount))}</span><Button variant="ghost" disabled={!filteredCount || busy} onClick={onSelectFiltered}>{text.selectVisible}</Button><Button variant="ghost" disabled={!selectedCount || busy} onClick={onClearSelection}>{text.clearSelection}</Button></div>}
    </section>}

    <section className="comparison-side-section">
      <div className="comparison-section-heading"><div><h3>{text.commonConditions}</h3><p>{text.useCurrentParams}</p></div><Button variant="ghost" onClick={onSyncFromGeneration}>{text.syncParams}</Button></div>
      <label className="comparison-field"><span>{text.positivePrompt}</span><textarea value={positive} onChange={(event) => onPositiveChange(event.target.value)} rows={4} /></label>
      <label className="comparison-field"><span>{text.negativePrompt}</span><textarea value={negative} onChange={(event) => onNegativeChange(event.target.value)} rows={3} /></label>
      <label className="comparison-field"><span>{text.model}</span><SelectMenuCompat value={params.model} aria-label={text.model} onChange={(event) => onParamChange("model", event.target.value as NAIModel)}>
        {NAI_MODELS.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}
      </SelectMenuCompat></label>
      <div className="comparison-number-grid">
        <CommittedNumberInput label={text.width} value={params.width} min={64} max={2048} step={64} normalize={(value) => Math.max(64, Math.round(value / 64) * 64)} onCommit={(value) => onParamChange("width", value)} />
        <CommittedNumberInput label={text.height} value={params.height} min={64} max={2048} step={64} normalize={(value) => Math.max(64, Math.round(value / 64) * 64)} onCommit={(value) => onParamChange("height", value)} />
        <CommittedNumberInput label={text.steps} value={params.steps} min={1} max={50} normalize={(value) => Math.min(50, Math.max(1, Math.round(value)))} onCommit={(value) => onParamChange("steps", value)} />
        <CommittedNumberInput label={text.cfg} value={params.cfgScale} min={0} max={10} step={0.1} normalize={(value) => Math.min(10, Math.max(0, value))} onCommit={(value) => onParamChange("cfgScale", value)} />
      </div>
      <div className="comparison-number-grid">
        <CommittedNumberInput label={text.intervalMinSeconds} value={project?.intervalSeconds ?? 30} min={0} max={3600} step={0.1} normalize={(value) => Math.max(0, Math.min(3600, Math.round(value * 10) / 10))} onCommit={(value) => onIntervalChange(value, Math.max(value, project?.intervalMaxSeconds ?? project?.intervalSeconds ?? 30))} />
        <CommittedNumberInput label={text.intervalMaxSeconds} value={project?.intervalMaxSeconds ?? project?.intervalSeconds ?? 30} min={0} max={3600} step={0.1} normalize={(value) => Math.max(0, Math.min(3600, Math.round(value * 10) / 10))} onCommit={(value) => onIntervalChange(Math.min(value, project?.intervalSeconds ?? 30), value)} />
      </div>
      <p className="comparison-muted">{text.intervalHint}</p>
      <label className="comparison-field"><span>{text.seeds}</span><input value={seedText} onChange={(event) => onSeedTextChange(event.target.value)} placeholder="424242" inputMode="numeric" aria-invalid={Boolean(seedError)} /></label>
      <p className={seedError ? "comparison-field-error" : "comparison-field-hint"}>{seedError || text.seedHint}</p>
      <RatingEditor key={project?.id ?? "empty"} text={text} levels={levels} onLevels={onLevels} onReplaceLevel={onReplaceLevel} />
      <ComparisonRatingSyncPanel key={`legacy-${project?.id ?? "empty"}`} text={text} legacyRatings={legacyRatings} levels={levels} busy={busy} onSync={onSyncRatings} />

    </section>


  </aside>;
}
