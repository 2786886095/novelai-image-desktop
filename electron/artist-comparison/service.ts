import {
    MAX_RUN_JOBS,
    uniqueArtistEntries,
    artistIdentity,
    indexEntryJobs,
    MAX_COMPARISON_TAGS,
    sampleComparisonInterval,
    normalizeComparisonInterval,
    createProject,
    createRun,
    getEntryCover,
    getEntryJobs,
    parseEntries,
    exploreEntries,
    replaceRating,
    normalizeTags,
    syncRatingScheme,
    validateProject,
} from '../../src/artist-comparison/model';
import type { ComparisonProject, ComparisonRun, ComparisonJob } from '../../src/artist-comparison/model';
import type { ComparisonAction, ComparisonResponse, ComparisonState } from '../../src/artist-comparison/protocol';
export interface ComparisonDependencies {
    read(): ComparisonProject[];
    write(projects: ComparisonProject[]): void;
    quote(run: ComparisonRun, job: ComparisonJob): Promise<number>;
    generate(project: ComparisonProject, run: ComparisonRun, job: ComparisonJob): Promise<{
        image?: NonNullable<ComparisonJob['image']>;
        actualAnlas?: number;
        error?: string;
        uncertain?: boolean;
    }>;
    recover(job: ComparisonJob): ComparisonJob['image'] | undefined;
    acquire(): () => void;
    exportProject(project: ComparisonProject, format: 'zip' | 'csv' | 'xlsx'): Promise<string>;
    importProject(): Promise<ComparisonProject | null>;
}

function populateMissingCover(project: ComparisonProject, entryId: string): void {
    const entry = project.entries.find(candidate => candidate.id === entryId);
    if (!entry || entry.coverJobId !== undefined)
        return;
    const cover = getEntryCover(project, entry);
    if (cover)
        entry.coverJobId = cover.id;
}

function replaceCoverAfterFirstSuccess(
    project: ComparisonProject,
    run: ComparisonRun,
    job: ComparisonJob,
): void {
    const snapshotEntry = run.entries.find(entry => entry.id === job.entryId);
    const first = run.jobs.find(candidate =>
        candidate.entryId === job.entryId && candidate.status === 'done' && candidate.image,
    );
    const currentEntry = snapshotEntry
        ? project.entries.find(entry => entry.id === job.entryId && entry.prompt === snapshotEntry.prompt)
        : undefined;
    if (first?.id === job.id && currentEntry)
        currentEntry.coverJobId = job.id;
}

function derivePoolMembership(entry: ComparisonProject['entries'][number]): void {
    entry.inPool = entry.kind === 'single' && entry.ratingId !== null;
}

function normalizeEntryTagSelection(
    value: unknown,
    project: ComparisonProject,
): string[] {
    if (!Array.isArray(value) || value.length > MAX_COMPARISON_TAGS)
        throw new Error(`Entry tags must contain at most ${MAX_COMPARISON_TAGS} IDs.`);
    const ids = value.map((tagId, index) => {
        if (typeof tagId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(tagId) || tagId.length > 128)
            throw new Error(`Invalid entry tag ID at index ${index}.`);
        return tagId;
    });
    if (new Set(ids).size !== ids.length)
        throw new Error('Entry tags must not contain duplicates.');
    const known = new Set((project.tags ?? []).map(tag => tag.id));
    if (ids.some(id => !known.has(id)))
        throw new Error('Entry contains an unknown tag.');
    return ids;
}

/** Owns the queue in the main process. No renderer lifetime or localStorage dependency. */
export class ComparisonService {
    private projects: ComparisonProject[];
    private running: ComparisonState['running'] = null;
    private transition = false;
    private lastCompletedAt: number | undefined;
    private intervalDeadline: number | undefined;
    private cancelWait?: () => void;
    private task: Promise<void> | null = null;
    constructor(private readonly deps: ComparisonDependencies) {
        const rawProjects = deps.read();
        this.projects = rawProjects.map(validateProject);
        // Persist the normalized representation so old rated single entries
        // acquire the derived pool flag and old backups gain empty tag lists.
        let changed = this.projects.some((project, index) =>
            JSON.stringify(project) !== JSON.stringify(rawProjects[index]),
        );
        for (let index = 0; index < this.projects.length; index += 1) {
            try {
                const synced = syncRatingScheme(this.projects[index]);
                if (JSON.stringify(synced) !== JSON.stringify(this.projects[index])) {
                    this.projects[index] = synced;
                    changed = true;
                }
            }
            catch {
                // A historical run may use a removed rating. Keep that schema
                // and its entries intact until the user supplies a mapping.
            }
        }
        for (const p of this.projects)
            for (const r of p.runs)
                for (const j of r.jobs) {
                    if (j.status !== 'running' && j.status !== 'uncertain')
                        continue;
                    const image = deps.recover(j);
                    j.status = image ? 'done' : 'uncertain';
                    if (image)
                        j.image = image;
                    else
                        j.error = 'The previous request may have completed. Check its output before retrying.';
                    changed = true;
                }
        for (const project of this.projects) {
            const histories = indexEntryJobs(project);
            for (const entry of project.entries)
                if (entry.coverJobId === undefined) {
                    const cover = histories.get(entry.id)?.find((job) => job.status === 'done' && job.image);
                    if (cover) {
                        entry.coverJobId = cover.id;
                        changed = true;
                    }
                }
        }
        if (changed)
            deps.write(this.projects);
    }
    snapshot(): ComparisonState { return structuredClone({ version: 1 as const, projects: this.projects, running: this.running }); }
    private project(id: string) {
        const p = this.projects.find(p => p.id === id);
        if (!p)
            throw new Error('Project not found.');
        return p;
    }
    private run(projectId: string, runId: string) {
        const p = this.project(projectId), r = p.runs.find(r => r.id === runId);
        if (!r)
            throw new Error('Run not found.');
        return { p, r };
    }
    private persist() { this.deps.write(this.projects); }
    private mutate(fn: () => void) {
        const before = structuredClone(this.projects);
        try {
            fn();
            this.persist();
        }
        catch (e) {
            this.projects = before;
            throw e;
        }
    }
    async idle() { await this.task; }
    async dispatch(action: ComparisonAction): Promise<ComparisonResponse> {
        try {
            let message: string | undefined, quote: number | undefined, addedEntryIds: string[] | undefined;
            if (!action || typeof action !== 'object')
                throw new Error('Invalid request.');
            switch (action.type) {
                case 'load': break;
                case 'createProject':
                    this.mutate(() => { if (this.projects.length >= 50)
                        throw new Error('Maximum 50 projects.'); this.projects.push(createProject()); });
                    break;
                case 'setInterval':
                    this.mutate(() => {
                        const min = normalizeComparisonInterval(action.intervalSeconds);
                        const max = normalizeComparisonInterval(action.intervalMaxSeconds ?? min);
                        if (max < min) throw new RangeError('Maximum interval must not be below minimum interval');
                        const project = this.project(action.projectId);
                        project.intervalSeconds = min;
                        project.intervalMaxSeconds = max;
                    });
                    this.cancelWait?.();
                    break;
                case 'renameProject':
                    this.mutate(() => { const name = action.name.trim(); if (!name || name.length > 200)
                        throw new Error('Invalid project name.'); this.project(action.projectId).name = name; });
                    break;
                case 'addEntries':
                    this.mutate(() => {
                        const p = this.project(action.projectId), parsed = parseEntries(action.text);
                        const added = uniqueArtistEntries(parsed, p.entries);
                        const skipped = parsed.length - added.length;
                        message = `已添加 ${added.length} 个对象，跳过 ${skipped} 个重复单画师；已有图片和评价保持不变。`;
                        p.entries = [...added, ...p.entries];
                        addedEntryIds = added.map(e => e.id);
                    });
                    break;
                case 'removeEntry':
                    this.mutate(() => { const p = this.project(action.projectId); p.entries = p.entries.filter(e => e.id !== action.entryId); });
                    break;
                case 'tags':
                    this.mutate(() => {
                        const p = this.project(action.projectId);
                        const tags = normalizeTags(action.tags, 'tags');
                        const known = new Set(tags.map(tag => tag.id));
                        p.tags = tags;
                        p.entries = p.entries.map(entry => ({
                            ...entry,
                            tagIds: (entry.tagIds ?? []).filter(tagId => known.has(tagId)),
                        }));
                        for (const run of p.runs)
                            run.entries = run.entries.map(entry => ({
                                ...entry,
                                tagIds: (entry.tagIds ?? []).filter(tagId => known.has(tagId)),
                            }));
                    });
                    break;
                case 'entry':
                    this.mutate(() => {
                        const p = this.project(action.projectId);
                        const run = action.runId ? this.run(p.id, action.runId).r : undefined;
                        const e = (run?.entries ?? p.entries).find(e => e.id === action.entryId);
                        if (!e)
                            throw new Error('Entry not found.');
                        const patch = action.patch;
                        if (patch.ratingId !== undefined && patch.ratingId !== null && !(run?.ratings ?? p.ratings).some(l => l.id === patch.ratingId))
                            throw new Error('Unknown rating.');
                        if (patch.name !== undefined) {
                            if (!patch.name.trim() || patch.name.length > 200)
                                throw new Error('Invalid name.');
                            e.name = patch.name.trim();
                        }
                        if (patch.note !== undefined) {
                            if (typeof patch.note !== 'string' || patch.note.length > 4000)
                                throw new Error('Note is too long.');
                            e.note = patch.note;
                        }
                        if (patch.ratingId !== undefined)
                            e.ratingId = patch.ratingId;
                        if (patch.tagIds !== undefined)
                            e.tagIds = normalizeEntryTagSelection(patch.tagIds, p);
                        derivePoolMembership(e);
                        // Current pool preferences follow an explicit evaluation, not an inferred member grade.
                        const original = p.entries.find(x => x.id === e.id && x.prompt === e.prompt);
                        if (run && original) {
                            if (patch.note !== undefined)
                                original.note = e.note;
                            if (patch.ratingId !== undefined && (e.ratingId === null || p.ratings.some(l => l.id === e.ratingId)))
                                original.ratingId = e.ratingId;
                            if (patch.tagIds !== undefined)
                                original.tagIds = [...(e.tagIds ?? [])];
                            derivePoolMembership(original);
                        }
                    });
                    break;
                case 'cover':
                    this.mutate(() => {
                        const p = this.project(action.projectId);
                        const entry = p.entries.find(candidate => candidate.id === action.entryId);
                        if (!entry)
                            throw new Error('Entry not found.');
                        if (action.jobId === null) {
                            entry.coverJobId = null;
                            return;
                        }
                        const job = getEntryJobs(p, entry.id).find(candidate => candidate.id === action.jobId);
                        if (!job || job.status !== 'done' || !job.image)
                            throw new Error('Cover job must be a completed image for this entry.');
                        entry.coverJobId = job.id;
                    });
                    break;
                case 'levels':
                    this.mutate(() => {
                        const p = this.project(action.projectId);
                        const updated = syncRatingScheme(p, action.levels);
                        this.projects[this.projects.indexOf(p)] = updated;
                    });
                    break;
                case 'replaceLevel':
                    this.mutate(() => { const p = this.project(action.projectId); const updated = replaceRating(p, action.levelId, action.targetId); this.projects[this.projects.indexOf(p)] = updated; });
                    break;
                case 'syncRatings':
                    this.mutate(() => {
                        const p = this.project(action.projectId);
                        const updated = syncRatingScheme(p, p.ratings, action.mapping);
                        this.projects[this.projects.indexOf(p)] = updated;
                    });
                    break;
                case 'explore':
                    this.mutate(() => {
                        const p = this.project(action.projectId), entries = exploreEntries(p.entries, action.rules, action.count, action.seed);

                        p.entries.push(...entries);
                        addedEntryIds = entries.map(e => e.id);
                    });
                    break;
                case 'createRun':
                    this.mutate(() => {
                        const p = this.project(action.projectId);

                        const ids = action.entryIds ? new Set(action.entryIds) : undefined;
                        const entries = uniqueArtistEntries(ids ? p.entries.filter(e => ids.has(e.id)) : p.entries);
                        if (!entries.length) throw new Error('No entries to generate.');
                        const chunkSize = Math.max(1, Math.floor(MAX_RUN_JOBS / Math.max(1, action.seeds.length)));
                        for (let offset = 0; offset < entries.length; offset += chunkSize)
                            p.runs.push(createRun({ ...p, entries: entries.slice(offset, offset + chunkSize) }, action.params, action.positive, action.negative, action.seeds));
                    });
                    break;
                case 'quote': {
                    const { r } = this.run(action.projectId, action.runId);
                    const jobs = r.jobs.filter(j => j.status === 'pending');
                    if (!jobs.length)
                        throw new Error('No pending jobs.');
                    const each = await this.deps.quote(r, jobs[0]);
                    if (!Number.isFinite(each) || each < 0)
                        throw new Error('Could not verify generation cost.');
                    quote = each * jobs.length;
                    break;
                }
                case 'start': {
                    if (this.running || this.transition)
                        throw new Error('A comparison queue is already running.');
                    if (!Number.isFinite(action.approvedAnlas) || action.approvedAnlas < 0)
                        throw new Error('Invalid approved budget.');
                    const { p, r } = this.run(action.projectId, action.runId);
                    if (!r.jobs.some(j => j.status === 'pending'))
                        throw new Error('No pending jobs.');
                    const release = this.deps.acquire();
                    this.running = { projectId: p.id, runId: r.id, pauseRequested: false };
                    this.task = this.execute(p.id, r.id, action.approvedAnlas).finally(() => { this.running = null; release(); });
                    break;
                }
                case 'pause':
                    if (this.running)
                        this.running.pauseRequested = true;
                    this.cancelWait?.();
                    break;
                case 'retry':
                    this.mutate(() => {
                        if (this.running)
                            throw new Error('Pause before retrying a job.');
                        const { p, r } = this.run(action.projectId, action.runId), j = r.jobs.find(j => j.id === action.jobId);
                        if (!j || !['failed', 'uncertain'].includes(j.status))
                            throw new Error('Job cannot be retried.');
                        const image = this.deps.recover(j);
                        if (image) {
                            j.image = image;
                            j.status = 'done';
                            j.error = undefined;
                            populateMissingCover(p, j.entryId);
                            return;
                        }
                        if (j.status === 'uncertain' && !action.acknowledgeUncertain)
                            throw new Error('This request may already have been charged. Confirm before retrying.');
                        j.status = 'pending';
                        j.error = undefined;
                    });
                    break;
                case 'export':
                    message = await this.deps.exportProject(structuredClone(this.project(action.projectId)), action.format);
                    break;
                case 'import': {
                    if (this.transition)
                        throw new Error('Import already in progress.');
                    this.transition = true;
                    try {
                        const p = await this.deps.importProject();
                        if (p)
                            this.mutate(() => {
                                if (this.projects.length >= 50)
                                    throw new Error('Maximum 50 projects.');
                                const validated = validateProject(p);
                                let imported: ComparisonProject;
                                try {
                                    imported = syncRatingScheme(validated);
                                }
                                catch {
                                    // Preserve used historical levels until the
                                    // caller explicitly supplies a mapping.
                                    imported = validated;
                                }
                                imported.id = crypto.randomUUID();
                                this.projects.push(imported);
                            });
                    }
                    finally {
                        this.transition = false;
                    }
                    break;
                }
                default: throw new Error('Unknown comparison action.');
            }
            return { ok: true, state: this.snapshot(), message, quote, addedEntryIds };
        }
        catch (e) {
            return { ok: false, state: this.snapshot(), message: e instanceof Error ? e.message : String(e) };
        }
    }
    private async waitForInterval(projectId: string): Promise<void> {
        while (this.running && !this.running.pauseRequested && this.lastCompletedAt !== undefined) {
            const until = this.intervalDeadline ??= this.lastCompletedAt + sampleComparisonInterval(this.project(projectId)) * 1000;
            const delay = until - Date.now();
            if (delay <= 0) break;
            this.running.nextGenerationAt = until;
            await new Promise<void>(resolve => {
                const finish = () => { clearTimeout(timer); this.cancelWait = undefined; resolve(); };
                const timer = setTimeout(finish, delay);
                this.cancelWait = finish;
            });
        }
        if (this.running) delete this.running.nextGenerationAt;
    }
    private async execute(projectId: string, runId: string, approved: number) {
        let spent = 0;
        try {
            for (;;) {
                if (this.running?.pauseRequested)
                    return;
                const initial = this.run(projectId, runId), pending = initial.r.jobs.find(j => j.status === 'pending');
                if (!pending)
                    return;
                const identities = new Map(initial.r.entries.map((entry) => [entry.id, artistIdentity(entry)]));
                const identity = identities.get(pending.entryId);
                const duplicate = identity && initial.r.jobs.find((job) => job.id !== pending.id && job.seed === pending.seed &&
                    job.status === 'done' && job.image && identities.get(job.entryId) === identity);
                if (duplicate) {
                    this.mutate(() => {
                        const job = this.run(projectId, runId).r.jobs.find((item) => item.id === pending.id)!;
                        job.status = 'skipped';
                        job.error = `Duplicate artist already generated with this seed (job ${duplicate.id}).`;
                    });
                    continue;
                }
                await this.waitForInterval(projectId);
                if (this.running?.pauseRequested) return;
                const jobId = pending.id;
                const quote = await this.deps.quote(structuredClone(initial.r), structuredClone(pending));
                if (this.running?.pauseRequested)
                    return;
                if (!Number.isFinite(quote) || quote < 0 || spent + quote > approved) {
                    this.mutate(() => {
                        const active = this.run(projectId, runId).r.jobs.find(j => j.id === jobId);
                        if (active)
                            active.error = 'Generation cost exceeds the approved estimate. Quote again before continuing.';
                    });
                    return;
                }
                // This durable write is deliberately before the paid request.
                this.mutate(() => {
                    const active = this.run(projectId, runId).r.jobs.find(j => j.id === jobId);
                    if (!active || active.status !== 'pending')
                        throw new Error('Comparison job is no longer pending.');
                    active.status = 'running';
                    active.quotedAnlas = quote;
                    active.error = undefined;
                });
                let result: Awaited<ReturnType<ComparisonDependencies['generate']>>;
                try {
                    const current = this.run(projectId, runId);
                    const active = current.r.jobs.find(j => j.id === jobId);
                    if (!active)
                        throw new Error('Comparison job disappeared before generation.');
                    result = await this.deps.generate(structuredClone(current.p), structuredClone(current.r), structuredClone(active));
                }
                catch (e) {
                    result = { error: e instanceof Error ? e.message : String(e), uncertain: true };
                }
                this.lastCompletedAt = Date.now();
                this.intervalDeadline = this.lastCompletedAt + sampleComparisonInterval(this.project(projectId)) * 1000;
                this.mutate(() => {
                    const current = this.run(projectId, runId);
                    const job = current.r.jobs.find(j => j.id === jobId);
                    if (!job)
                        throw new Error('Comparison job disappeared before completion.');
                    if (result.image) {
                        job.image = result.image;
                        job.status = 'done';
                        job.actualAnlas = result.actualAnlas;
                        spent += result.actualAnlas ?? quote;
                        replaceCoverAfterFirstSuccess(current.p, current.r, job);
                    }
                    else {
                        job.status = result.uncertain ? 'uncertain' : 'failed';
                        job.error = result.error ?? 'Generation failed.';
                    }
                });
                // Stop on errors; do not silently produce more paid requests after an ambiguous outcome.
                if (!result.image)
                    return;
            }
        }
        catch (e) {
            try {
                const { r } = this.run(projectId, runId), current = r.jobs.find(j => j.status === 'running') ?? r.jobs.find(j => j.status === 'pending');
                if (current) {
                    if (current.status === 'running')
                        current.status = 'uncertain';
                    current.error = e instanceof Error ? e.message : String(e);
                    this.persist();
                }
            }
            catch { /* Preserve in-memory error when the project was removed concurrently. */ }
        }
    }
}
