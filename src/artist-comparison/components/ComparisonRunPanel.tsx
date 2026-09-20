import { useMemo } from "react";
import type { ComparisonJob, ComparisonProject, ComparisonRun } from "../model";
import type { ComparisonStrings } from "../strings";
import { Button, SelectMenuCompat } from "../../components/ui";

export interface ComparisonRunPanelProps {
  text: ComparisonStrings;
  exploration?: boolean;
  project?: ComparisonProject;
  selectedRunId: string | null;
  onRunChange: (runId: string | null) => void;
  onCreateRun: () => void;
  onQuoteAndStart: (runId: string) => void;
  onPause: () => void;
  onRetry: (runId: string, job: ComparisonJob) => void;
  runningRunId?: string;
  pauseRequested?: boolean;
  busy: boolean;
}

function runJobs(run: ComparisonRun | undefined) {
  return run?.jobs ?? [];
}

function statusLabel(text: ComparisonStrings, status: ComparisonJob["status"]) {
  return text[status] ?? status;
}

export function ComparisonRunPanel({ exploration = false, text, project, selectedRunId, onRunChange, onCreateRun, onQuoteAndStart, onPause, onRetry, runningRunId, pauseRequested, busy }: ComparisonRunPanelProps) {
  const availableRuns = (project?.runs ?? []).filter((item) => exploration ? item.entries.every((entry) => entry.kind === "recipe") : item.entries.some((entry) => entry.kind === "single"));
  // Keep queue controls visible while the gallery remains on all combinations.
  const resumeRun = availableRuns.find((item) => item.jobs.some((job) => job.status === "pending"));
  const run = availableRuns.find((item) => item.id === runningRunId)
    ?? resumeRun
    ?? availableRuns.find((item) => item.id === selectedRunId)
    ?? availableRuns.find((item) => item.jobs.some((job) => job.status !== "done" && job.status !== "skipped"))
    ?? availableRuns.at(-1);
  const jobs = runJobs(run);
  const summary = useMemo(() => jobs.reduce((result, job) => { result[job.status] += 1; return result; }, { pending: 0, running: 0, done: 0, failed: 0, uncertain: 0, skipped: 0 } as Record<ComparisonJob["status"], number>), [jobs]);
  const active = Boolean(project && runningRunId && runningRunId === run?.id);
  const retryable = jobs.filter((job) => job.status === "failed" || job.status === "uncertain").slice(0, 16);
  return <section className="comparison-run-panel">
    <div className="comparison-run-toolbar"><div><strong>{exploration ? text.combinationTasks : text.artistTasks}</strong><p className="comparison-muted">{text.resumeOriginalHint}</p></div><div className="comparison-run-actions">
      {active ? <Button variant="danger" onClick={onPause} disabled={busy}>{pauseRequested ? text.pausing : text.pause}</Button> : null}
      <Button variant="secondary" onClick={() => resumeRun && onQuoteAndStart(resumeRun.id)} disabled={busy || Boolean(runningRunId) || !resumeRun}>{text.resumeOriginal}</Button>
      <Button variant="primary" onClick={onCreateRun} disabled={busy || !project || Boolean(runningRunId)}>{exploration ? text.generateMissing : text.generateNewArtists}</Button>

    </div></div>
    <details className="comparison-generation-records"><summary>{text.generationRecords}</summary><label className="comparison-field"><span>{text.recordFilter}</span><SelectMenuCompat value={selectedRunId ?? "draft"} aria-label={text.recordFilter} onChange={(event) => onRunChange(event.target.value === "draft" ? null : event.target.value)}><option value="draft">{exploration ? text.allProjectCombinations : text.draftRun}</option>{[...availableRuns].reverse().map((item) => <option key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleString()} · {item.jobs.length} {text.image}</option>)}</SelectMenuCompat></label></details>
    {run ? <>
      <div className="comparison-run-summary-grid"><div><strong>{run.jobs.length}</strong><span>{text.image}</span></div><div><strong>{summary.done}</strong><span>{text.done}</span></div><div><strong>{summary.pending}</strong><span>{text.pending}</span></div><div><strong>{summary.failed + summary.uncertain}</strong><span>{text.failed} / {text.uncertain}</span></div></div>
      {summary.skipped > 0 && <p className="comparison-muted">{text.skipped}: {summary.skipped}</p>}
      <div className="comparison-job-progress"><span style={{ width: `${run.jobs.length ? Math.round(((summary.done + summary.skipped) / run.jobs.length) * 100) : 0}%` }} /><b>{text.completed.replace("{done}", String(summary.done + summary.skipped)).replace("{total}", String(run.jobs.length))}</b></div>
      {retryable.length > 0 && <div className="comparison-retry-list"><strong>{text.retry}</strong>{retryable.map((job) => <div key={job.id}><span>{run.entries.find((entry) => entry.id === job.entryId)?.name ?? job.entryId} · {statusLabel(text, job.status)}</span><Button variant={job.status === "uncertain" ? "danger" : "ghost"} disabled={busy || Boolean(runningRunId)} onClick={() => onRetry(run.id, job)}>{job.status === "uncertain" ? text.retryUncertain : text.retry}</Button>{job.error && <small>{job.error}</small>}</div>)}</div>}
    </> : <p className="comparison-muted">{exploration ? text.combinationLibraryHint : text.noRun}</p>}
  </section>;
}
