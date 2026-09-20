import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ComparisonEntry, ComparisonJob, ComparisonTag, RatingLevel } from "../model";
import type { ComparisonStrings } from "../strings";
import { AppPortal, Button, SelectMenuCompat } from "../../components/ui";
import { TagPicker } from "./ComparisonTags";

export type EntryFilterKind = "all" | "single" | "recipe";
export type EntrySort = "original" | "rating";
export type ResultsView = "grid" | "compact";
type TaggedEntry = ComparisonEntry & { tagIds?: string[] };

export interface ComparisonResultsProps {
  exploration?: boolean;
  projectEntryCount?: number;
  projectArtistCount?: number;
  text: ComparisonStrings;
  entries: TaggedEntry[];
  jobs: ComparisonJob[];
  ratings: RatingLevel[];
  selectedIds: Set<string>;
  onToggleSelected: (entryId: string) => void;
  onSelectAll: (entryIds: string[]) => void;
  onRating: (entryId: string, ratingId: string | null) => void;
  onNote: (entryId: string, note: string) => void;
  tags: ComparisonTag[];
  onTags: (entryId: string, tagIds: string[]) => void;
  onRemove: (entryId: string) => void;
  autoSaveNotes: boolean;
  onAutoSaveNotesChange: (enabled: boolean) => void;
  selectedRunId: string | null;
  /** All recoverable images for the library, independent of the selected run. */
  historyJobsByEntry?: ReadonlyMap<string, ComparisonJob[]>;
  /** The canonical project's current cover for each entry. */
  coverJobs?: ReadonlyMap<string, ComparisonJob | undefined>;
  onSetCover?: (entryId: string, jobId: string | null) => void;
  onRegenerate?: (entryId: string) => void;
  regenerateDisabled?: boolean;
  error?: string;
  notice?: string;
}

function imageSource(job: ComparisonJob | undefined) {
  if (!job?.image) return "";
  return job.image.fileUrl || job.image.filePath || "";
}

function statusLabel(text: ComparisonStrings, status: ComparisonJob["status"]) {
  return text[status] ?? status;
}

function pageSequence(current: number, total: number) {
  const pages = new Set([1, total, current - 1, current, current + 1]);
  return [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
}

interface EntryCardProps {
  text: ComparisonStrings;
  entry: TaggedEntry;
  jobs: ComparisonJob[];
  ratings: RatingLevel[];
  selected: boolean;
  compact: boolean;
  onToggleSelected: () => void;
  onRating: (ratingId: string | null) => void;
  onNote: (note: string) => void;
  tags: ComparisonTag[];
  onTags: (tagIds: string[]) => void;
  onRemove: () => void;
  autoSaveNotes: boolean;
  onOpenImage: () => void;
  canRemove: boolean;
  historyJobs: ComparisonJob[];
  coverJob?: ComparisonJob;
  onSetCover?: (jobId: string | null) => void;
  onRegenerate?: () => void;
  canRegenerate: boolean;
  regenerateDisabled: boolean;
  libraryView: boolean;
}

function EntryCard({
  text,
  entry,
  jobs,
  ratings,
  selected,
  compact,
  onToggleSelected,
  onRating,
  onNote,
  tags,
  onTags,
  onRemove,
  autoSaveNotes,
  onOpenImage,
  canRemove,
  historyJobs,
  coverJob,
  onSetCover,
  onRegenerate,
  canRegenerate,
  regenerateDisabled,
  libraryView,
}: EntryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(entry.note ?? "");
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setNote(entry.note ?? "");
    setDirty(false);
  }, [entry.id, entry.note]);
  const savedJobs = historyJobs.filter((job) => Boolean(imageSource(job)));
  const historicalImageJob = jobs.find((job) => job.status === "done" && imageSource(job));
  const imageJob = libraryView
    ? (coverJob && imageSource(coverJob) ? coverJob : undefined)
    : historicalImageJob;
  const doneCount = jobs.filter((job) => job.status === "done").length;
  const status = jobs.length === 0 ? undefined : jobs.some((job) => job.status === "running") ? "running" : jobs.some((job) => job.status === "uncertain") ? "uncertain" : jobs.some((job) => job.status === "failed") ? "failed" : jobs.every((job) => job.status === "done" || job.status === "skipped") ? (doneCount ? "done" : "skipped") : "pending";
  const saveNote = () => {
    onNote(note);
    setDirty(false);
  };
  return <article className={`comparison-entry-card${compact ? " is-compact" : ""}${selected ? " is-selected" : ""}`}>
    <div className="comparison-entry-media">
      <label className="comparison-entry-select"><input type="checkbox" checked={selected} onChange={onToggleSelected} aria-label={`${text.selected.replace("{count}", "")}: ${entry.name}`} /><span /></label>
      {imageJob ? <button type="button" className="comparison-image-button" onClick={onOpenImage} aria-label={`${text.openImage}: ${entry.name}`}><img src={imageSource(imageJob)} alt={entry.name} loading="lazy" /></button> : <button type="button" className="comparison-image-placeholder" onClick={onOpenImage} disabled={!historyJobs.length} aria-label={`${text.openImage}: ${entry.name}`}><span>{libraryView && historyJobs.length ? text.chooseCover : jobs.length ? statusLabel(text, status ?? "pending") : text.imageMissing}</span></button>}
      {libraryView && coverJob && <span className="comparison-cover-badge">{text.cover}</span>}
      <span className={`comparison-entry-status status-${status ?? "draft"}`}>{status ? statusLabel(text, status) : text.draftRun}</span>
    </div>
    <div className="comparison-entry-body">
      <header className="comparison-entry-heading"><div><h3 title={entry.name}>{entry.name}</h3><span className={`comparison-kind kind-${entry.kind}`}>{entry.kind === "single" ? text.single : text.recipe}</span>{entry.origin && <span className="comparison-recipe-badge">{text.generatedRecipe}</span>}</div>{canRemove && <Button variant="ghost" className="comparison-remove" title={text.deleteLevel} aria-label={text.deleteLevel} onClick={onRemove}>×</Button>}</header>
      <p className={`comparison-entry-prompt${expanded ? " expanded" : ""}`}>{entry.prompt}</p>
      <button type="button" className="comparison-prompt-toggle" onClick={() => setExpanded((value) => !value)}>{expanded ? text.collapsePrompt : text.expandPrompt}</button>
      <div className="comparison-entry-meta"><span>{savedJobs.length ? text.savedImages.replace("{count}", String(savedJobs.length)) : (jobs.length ? `${doneCount}/${jobs.length} ${text.image}` : text.imageMissing)}</span><button type="button" onClick={() => void navigator.clipboard?.writeText(entry.prompt)}>{text.copyPrompt}</button></div>
      <div className="comparison-entry-cover-actions"><span className={coverJob ? "comparison-cover-state is-set" : "comparison-cover-state"}>{coverJob ? text.cover : text.noCover}</span><div>{onSetCover && <Button variant="ghost" disabled={!savedJobs.length} onClick={onOpenImage}>{coverJob ? text.chooseCover : text.setCover}</Button>}{coverJob && onSetCover && <Button variant="ghost" onClick={() => onSetCover(null)}>{text.removeCover}</Button>}</div></div>
      {canRegenerate && onRegenerate && <div className="comparison-regenerate-action"><Button variant="secondary" disabled={regenerateDisabled} onClick={onRegenerate}>{text.regenerate}</Button><small>{text.regenerateHint}</small></div>}
      <div className="comparison-rating-buttons" aria-label={text.ratingScheme}>
        <button type="button" className={!entry.ratingId ? "active unrated" : "unrated"} onClick={() => onRating(null)}>{text.noRating}</button>
        {ratings.map((level) => <button type="button" key={level.id} className={entry.ratingId === level.id ? "active" : ""} style={{ "--rating-color": level.color } as CSSProperties} onClick={() => onRating(level.id)}><i />{level.label}</button>)}
      </div>
      <TagPicker text={text} tags={tags} value={entry.tagIds ?? []} onChange={onTags} />
      {entry.kind === "single" ? <span className={`comparison-pool-state${entry.ratingId !== null ? " is-in" : ""}`}>{entry.ratingId !== null ? text.poolEligible : text.poolNeedsRating}</span> : <span className="comparison-recipe-excluded">{text.recipeExcluded}</span>}
      {!compact && <label className="comparison-note-field"><span>{text.note}</span><textarea value={note} placeholder={text.notePlaceholder} rows={2} onChange={(event) => { setNote(event.target.value); setDirty(true); }} onBlur={() => { if (autoSaveNotes && dirty) saveNote(); }} /><span className="comparison-note-actions">{dirty && !autoSaveNotes ? <Button variant="ghost" onClick={saveNote}>{text.saveNote}</Button> : null}</span></label>}
    </div>
  </article>;
}

interface ImageModalProps {
  text: ComparisonStrings;
  entries: TaggedEntry[];
  entryIndex: number;
  jobs: ComparisonJob[];
  ratings: RatingLevel[];
  onIndex: (index: number) => void;
  onClose: () => void;
  onRating: (entryId: string, ratingId: string | null) => void;
  onNote: (entryId: string, note: string) => void;
  autoSaveNotes: boolean;
  tags: ComparisonTag[];
  onTags: (entryId: string, tagIds: string[]) => void;
  coverJob?: ComparisonJob;
  onSetCover?: (entryId: string, jobId: string | null) => void;
}

function ImageModal({ text, entries, entryIndex, jobs, ratings, onIndex, onClose, onRating, onNote, autoSaveNotes, coverJob, onSetCover, tags, onTags }: ImageModalProps) {
  const entry = entries[entryIndex];
  const [jobIndex, setJobIndex] = useState(0);
  const [note, setNote] = useState(entry?.note ?? "");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { root.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { setJobIndex(0); setNote(entry?.note ?? ""); }, [entry?.id, entry?.note]);
  if (!entry) return null;
  const doneJobs = jobs.filter((job) => Boolean(imageSource(job)));
  const currentJob = doneJobs[jobIndex] ?? doneJobs[0];
  const saveNote = () => onNote(entry.id, note);
  return <AppPortal><div className="comparison-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={root} className="comparison-image-modal" role="dialog" aria-modal="true" aria-label={`${text.openImage}: ${entry.name}`} tabIndex={-1} onKeyDown={(event) => {
    if (event.key === "Escape") onClose();
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("input, textarea, select, [contenteditable]")) return;
    if (event.key === "ArrowLeft" && entryIndex > 0) onIndex(entryIndex - 1);
    if (event.key === "ArrowRight" && entryIndex + 1 < entries.length) onIndex(entryIndex + 1);
  }}>
    <header><div><span className={`comparison-kind kind-${entry.kind}`}>{entry.kind === "single" ? text.single : text.recipe}</span><h2>{entry.name}</h2></div><Button variant="ghost" onClick={onClose} aria-label={text.close}>×</Button></header>
    <div className="comparison-modal-content"><div className="comparison-modal-stage">{currentJob ? <img src={imageSource(currentJob)} alt={entry.name} /> : <span>{text.imageMissing}</span>}</div><aside className="comparison-modal-side">
      <div className="comparison-modal-nav"><Button variant="ghost" disabled={entryIndex <= 0} onClick={() => onIndex(entryIndex - 1)}>{text.previous}</Button><span>{entryIndex + 1} / {entries.length}</span><Button variant="ghost" disabled={entryIndex + 1 >= entries.length} onClick={() => onIndex(entryIndex + 1)}>{text.next}</Button></div>
      {doneJobs.length > 1 && <div className="comparison-job-thumbs">{doneJobs.map((job, index) => <button type="button" key={job.id} className={index === jobIndex ? "active" : ""} onClick={() => setJobIndex(index)} title={`${text.imageSeed}: ${job.seed}`}><img src={imageSource(job)} alt={`${text.image} ${index + 1}, ${text.imageSeed} ${job.seed}`} /><small>{job.seed}</small></button>)}</div>}
      <p className="comparison-modal-prompt">{entry.prompt}</p>
      <div className="comparison-rating-buttons">{ratings.map((level) => <button type="button" key={level.id} className={entry.ratingId === level.id ? "active" : ""} style={{ "--rating-color": level.color } as CSSProperties} onClick={() => onRating(entry.id, level.id)}><i />{level.label}</button>)}<button type="button" className={!entry.ratingId ? "active unrated" : "unrated"} onClick={() => onRating(entry.id, null)}>{text.noRating}</button></div>
      <TagPicker text={text} tags={tags} value={entry.tagIds ?? []} onChange={(tagIds) => onTags(entry.id, tagIds)} />
      {onSetCover && <div className="comparison-modal-cover-actions"><span>{coverJob?.id === currentJob?.id ? text.coverSelected : coverJob ? text.cover : text.noCover}<small>{text.removeCoverHint}</small></span><div>{currentJob && <Button variant={coverJob?.id === currentJob.id ? "primary" : "secondary"} onClick={() => onSetCover(entry.id, currentJob.id)}>{coverJob?.id === currentJob.id ? text.coverSelected : text.setCover}</Button>}{coverJob && <Button variant="ghost" onClick={() => onSetCover(entry.id, null)}>{text.removeCover}</Button>}</div></div>}
      <label className="comparison-note-field"><span>{text.note}</span><textarea value={note} rows={5} placeholder={text.notePlaceholder} onChange={(event) => setNote(event.target.value)} onBlur={() => { if (autoSaveNotes) saveNote(); }} /><Button variant="ghost" onClick={saveNote}>{text.saveNote}</Button></label>
    </aside></div>
  </section></div></AppPortal>;
}

export function ComparisonResults({
  exploration = false,
  projectEntryCount,
  projectArtistCount = 0,
  text,
  entries,
  jobs,
  ratings,
  selectedIds,
  onToggleSelected,
  onSelectAll,
  onRating,
  onNote,
  tags,
  onTags,
  onRemove,
  autoSaveNotes,
  onAutoSaveNotesChange,
  selectedRunId,
  historyJobsByEntry,
  coverJobs,
  onSetCover,
  onRegenerate,
  regenerateDisabled = false,
  error,
  notice,
}: ComparisonResultsProps) {
  const [kind, setKind] = useState<EntryFilterKind>("all");
  const [rating, setRating] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  useEffect(() => {
    if (tagFilter && !tags.some((tag) => tag.id === tagFilter)) setTagFilter("");
  }, [tagFilter, tags]);
  const [noteQuery, setNoteQuery] = useState("");
  const [sort, setSort] = useState<EntrySort>("original");
  const [view, setView] = useState<ResultsView>("grid");
  const [page, setPage] = useState(1);
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  const filtered = useMemo(() => {
    const query = noteQuery.trim().toLocaleLowerCase();
    const next = entries.filter((entry) => {
      if (kind !== "all" && entry.kind !== kind) return false;
      if (rating === "unrated" ? entry.ratingId !== null : rating && entry.ratingId !== rating) return false;
      if (tagFilter && !(entry.tagIds ?? []).includes(tagFilter)) return false;
      if (query && !entry.note.toLocaleLowerCase().includes(query)) return false;
      return true;
    });
    if (sort === "rating") {
      const order = new Map(ratings.map((level, index) => [level.id, index]));
      next.sort((a, b) => (order.get(a.ratingId ?? "") ?? ratings.length) - (order.get(b.ratingId ?? "") ?? ratings.length));
    }
    return next;
  }, [entries, kind, noteQuery, rating, ratings, sort, tagFilter]);
  const pageSize = 24;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paginationPages = pageSequence(safePage, pageCount);
  useEffect(() => { if (page !== safePage) setPage(safePage); }, [page, safePage]);
  useEffect(() => { setPage(1); }, [kind, noteQuery, rating, sort, tagFilter]);
  useEffect(() => {
    if (rating && rating !== "unrated" && !ratings.some((level) => level.id === rating)) setRating("");
  }, [rating, ratings]);
  useEffect(() => {
    if (tagFilter && !tags.some((tag) => tag.id === tagFilter)) setTagFilter("");
  }, [tagFilter, tags]);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const jobsByEntry = useMemo(() => {
    const map = new Map<string, ComparisonJob[]>();
    for (const job of jobs) {
      const bucket = map.get(job.entryId) ?? [];
      bucket.push(job);
      map.set(job.entryId, bucket);
    }
    return map;
  }, [jobs]);
  const modalEntry = modalIndex == null ? undefined : filtered[modalIndex];
  const selectedVisible = visible.filter((entry) => selectedIds.has(entry.id)).length;
  const canRemove = selectedRunId === null;
  return <section className="comparison-results">
    <div className="comparison-results-head"><div><span className="eyebrow">{exploration ? text.combinationHeading : selectedRunId ? text.run : text.compareTab}</span><h2>{exploration ? text.combinationHeading : text.entries}</h2><p>{text.visibleEntryCount.replace("{count}", String(filtered.length))}{projectEntryCount !== undefined ? ` · ${text.projectCapacity.replace("{artists}", String(projectArtistCount)).replace("{recipes}", String(projectEntryCount - projectArtistCount))}` : ""}</p></div><div className="comparison-results-head-actions"><label className="comparison-check-label"><input type="checkbox" checked={autoSaveNotes} onChange={(event) => onAutoSaveNotesChange(event.target.checked)} /><span>{text.autoSaveNotes}</span></label><span className="comparison-selection-count">{text.selected.replace("{count}", String(selectedIds.size))}</span></div></div>
    {error && <div className="comparison-alert error" role="alert"><strong>{text.error}</strong><span>{error}</span></div>}
    {notice && <div className="comparison-alert success" role="status"><strong>{text.actionSuccess}</strong><span>{notice}</span></div>}
    <div className="comparison-filter-toolbar"><div className="comparison-segmented" role="tablist" aria-label={text.filters}>{(["all", "single", "recipe"] as EntryFilterKind[]).map((value) => <button type="button" key={value} className={kind === value ? "active" : ""} onClick={() => setKind(value)}>{text[value]}</button>)}</div><label className="comparison-filter-field"><span>{text.rated}</span><SelectMenuCompat value={rating} aria-label={text.rated} onChange={(event) => setRating(event.target.value)}><option value="">{text.all}</option><option value="unrated">{text.noRating}</option>{ratings.map((level) => <option key={level.id} value={level.id}>{level.label}</option>)}</SelectMenuCompat></label><label className="comparison-filter-field"><span>{text.tagFilter}</span><SelectMenuCompat value={tagFilter} aria-label={text.tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="">{text.allTags}</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.label}</option>)}</SelectMenuCompat></label><label className="comparison-filter-search"><span className="sr-only">{text.noteSearch}</span><input value={noteQuery} placeholder={text.noteSearchPlaceholder} onChange={(event) => setNoteQuery(event.target.value)} /></label><label className="comparison-filter-field"><span>{text.sortOriginal}</span><SelectMenuCompat value={sort} aria-label={text.sortOriginal} onChange={(event) => setSort(event.target.value as EntrySort)}><option value="original">{text.sortOriginal}</option><option value="rating">{text.sortRating}</option></SelectMenuCompat></label><div className="comparison-view-toggle"><Button variant={view === "grid" ? "primary" : "ghost"} onClick={() => setView("grid")}>{text.grid}</Button><Button variant={view === "compact" ? "primary" : "ghost"} onClick={() => setView("compact")}>{text.compact}</Button></div></div>
    <div className="comparison-results-selection"><span>{text.selected.replace("{count}", String(selectedVisible))} / {visible.length}</span><Button variant="ghost" disabled={!visible.length} onClick={() => onSelectAll(visible.map((entry) => entry.id))}>{text.selectVisible}</Button><Button variant="ghost" disabled={!selectedIds.size} onClick={() => onSelectAll([])}>{text.clearSelection}</Button></div>
    {visible.length > 0 ? <div className={`comparison-entry-grid ${view === "compact" ? "is-compact" : ""}`}>{visible.map((entry) => {
      const entryJobs = jobsByEntry.get(entry.id) ?? [];
      const historyJobs = historyJobsByEntry?.get(entry.id) ?? entryJobs;
      const coverJob = coverJobs?.get(entry.id);
      return <EntryCard key={entry.id} text={text} entry={entry} jobs={entryJobs} historyJobs={historyJobs} coverJob={coverJob} ratings={ratings} tags={tags} selected={selectedIds.has(entry.id)} compact={view === "compact"} onToggleSelected={() => onToggleSelected(entry.id)} onRating={(ratingId) => onRating(entry.id, ratingId)} onNote={(note) => onNote(entry.id, note)} onTags={(tagIds) => onTags(entry.id, tagIds)} onRemove={() => onRemove(entry.id)} autoSaveNotes={autoSaveNotes} onOpenImage={() => setModalIndex(filtered.findIndex((item) => item.id === entry.id))} canRemove={canRemove} onSetCover={onSetCover ? (jobId) => onSetCover(entry.id, jobId) : undefined} canRegenerate={Boolean(onRegenerate)} onRegenerate={onRegenerate ? () => onRegenerate(entry.id) : undefined} regenerateDisabled={regenerateDisabled} libraryView={selectedRunId === null} />;
    })}</div> : <div className="comparison-empty-state"><span className="comparison-empty-icon">✦</span><h3>{entries.length ? text.noEntries : text.noEntries}</h3><p>{entries.length ? text.noteSearch : text.entryHint}</p></div>}
    {pageCount > 1 && <nav className="comparison-pagination" aria-label={text.entries}><button type="button" disabled={safePage <= 1} aria-label={text.previousPage} onClick={() => setPage((current) => Math.max(1, current - 1))}>‹</button>{paginationPages.map((number, index) => [index > 0 && number - paginationPages[index - 1] > 1 ? <span key={`ellipsis-${number}`} aria-hidden="true">…</span> : null, <button type="button" key={`page-${number}`} className={number === safePage ? "active" : ""} aria-current={number === safePage ? "page" : undefined} aria-label={text.page.replace("{page}", String(number))} onClick={() => setPage(number)}>{number}</button>])}<button type="button" disabled={safePage >= pageCount} aria-label={text.nextPage} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>›</button></nav>}
    {modalEntry && <ImageModal text={text} entries={filtered} entryIndex={modalIndex ?? 0} jobs={historyJobsByEntry?.get(modalEntry.id) ?? jobsByEntry.get(modalEntry.id) ?? []} coverJob={coverJobs?.get(modalEntry.id)} ratings={ratings} tags={tags} onIndex={setModalIndex} onClose={() => setModalIndex(null)} onRating={onRating} onNote={onNote} onTags={onTags} autoSaveNotes={autoSaveNotes} onSetCover={onSetCover} />}
  </section>;
}
