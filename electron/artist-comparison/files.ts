import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import JSZip from 'jszip';
import { Readable, Writable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { indexEntryJobs, validateProject, type ComparisonProject, type ComparisonJob } from '../../src/artist-comparison/model';

const COMPARISON_FILE_VERSION = 1;
const SHARDED_STORAGE = 'sharded';
const SHARD_DIRECTORY_SUFFIX = '.parts';
const LEGACY_BACKUP_SUFFIX = '.legacy.bak';
const MAX_PROJECTS = 50;

interface ShardedRunReference {
    id: string;
    file: string;
}

interface ShardedProjectReference {
    id: string;
    file: string;
    runs: ShardedRunReference[];
}

interface ShardedIndex {
    version: 1;
    storage: typeof SHARDED_STORAGE;
    projects: ShardedProjectReference[];
}

interface ShardedProjectFile {
    version: 1;
    project: Omit<ComparisonProject, 'runs'>;
}

interface ShardedRunFile {
    version: 1;
    run: ComparisonProject['runs'][number];
}

function shardDirectory(file: string): string {
    return `${file}${SHARD_DIRECTORY_SUFFIX}`;
}

function temporaryPath(file: string): string {
    return `${file}.${crypto.randomUUID()}.tmp`;
}

function writeAtomic(file: string, data: string): void {
    const temporary = temporaryPath(file);
    try {
        fs.writeFileSync(temporary, data, { encoding: 'utf8', mode: 0o600 });
        fs.renameSync(temporary, file);
    }
    finally {
        if (fs.existsSync(temporary))
            fs.unlinkSync(temporary);
    }
}

function copyAtomic(source: string, destination: string): void {
    const temporary = temporaryPath(destination);
    try {
        fs.copyFileSync(source, temporary);
        fs.renameSync(temporary, destination);
    }
    finally {
        if (fs.existsSync(temporary))
            fs.unlinkSync(temporary);
    }
}

function readJson(file: string): unknown {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
}

function assertProjectList(value: unknown): asserts value is unknown[] {
    if (!Array.isArray(value) || value.length > MAX_PROJECTS)
        throw new Error('Unsupported comparison data.');
}

function isShardedIndex(value: unknown): value is ShardedIndex {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<ShardedIndex>;
    return candidate.version === COMPARISON_FILE_VERSION && candidate.storage === SHARDED_STORAGE;
}

/**
 * Resolve a shard path written by this module. Shards are always stored in a
 * sibling directory ending in `.parts`; rejecting absolute and parent paths
 * keeps a damaged local index from making readProjects open arbitrary files.
 */
function resolveShard(indexFile: string, relative: unknown): string {
    if (typeof relative !== 'string' || path.isAbsolute(relative))
        throw new Error('Unsafe comparison shard path.');
    const base = path.resolve(path.dirname(indexFile));
    const resolved = path.resolve(base, relative);
    const relativeToBase = path.relative(base, resolved);
    if (!relativeToBase || relativeToBase.startsWith('..') || path.isAbsolute(relativeToBase))
        throw new Error('Unsafe comparison shard path.');
    const rootSegment = relativeToBase.split(path.sep)[0];
    if (!rootSegment.endsWith(SHARD_DIRECTORY_SUFFIX))
        throw new Error('Unsafe comparison shard path.');
    return resolved;
}

function parseShardedProjects(indexFile: string, raw: ShardedIndex): ComparisonProject[] {
    assertProjectList(raw.projects);
    const projects: ComparisonProject[] = [];
    for (const reference of raw.projects) {
        if (!reference || typeof reference !== 'object' || typeof reference.file !== 'string' || !Array.isArray(reference.runs))
            throw new Error('Unsupported comparison data.');
        const projectFile = resolveShard(indexFile, reference.file);
        const projectShard = readJson(projectFile) as Partial<ShardedProjectFile>;
        if (projectShard.version !== COMPARISON_FILE_VERSION || !projectShard.project || typeof projectShard.project !== 'object')
            throw new Error('Unsupported comparison project shard.');
        const runs = reference.runs.map((runReference) => {
            if (!runReference || typeof runReference !== 'object' || typeof runReference.file !== 'string')
                throw new Error('Unsupported comparison run shard.');
            const runFile = resolveShard(indexFile, runReference.file);
            const runShard = readJson(runFile) as Partial<ShardedRunFile>;
            if (runShard.version !== COMPARISON_FILE_VERSION || !runShard.run || typeof runShard.run !== 'object')
                throw new Error('Unsupported comparison run shard.');
            return runShard.run;
        });
        const project = validateProject({ ...projectShard.project, runs });
        if (project.id !== reference.id)
            throw new Error('Comparison project index is inconsistent.');
        for (let i = 0; i < project.runs.length; i += 1) {
            if (project.runs[i].id !== reference.runs[i].id)
                throw new Error('Comparison run index is inconsistent.');
        }
        projects.push(project);
    }
    return projects;
}

function readStorage(file: string): { projects: ComparisonProject[]; sharded: boolean } {
    const raw = readJson(file) as { version?: unknown; storage?: unknown; projects?: unknown };
    if (isShardedIndex(raw)) return { projects: parseShardedProjects(file, raw), sharded: true };
    if (raw.version !== COMPARISON_FILE_VERSION) throw new Error('Unsupported comparison data.');
    assertProjectList(raw.projects);
    return { projects: raw.projects.map(validateProject), sharded: false };
}

function existingStorageKind(file: string): { sharded: boolean } {
    const raw = readJson(file) as { version?: unknown; storage?: unknown; projects?: unknown };
    if (isShardedIndex(raw)) {
        assertProjectList(raw.projects);
        return { sharded: true };
    }
    if (raw.version !== COMPARISON_FILE_VERSION) throw new Error('Unsupported comparison data.');
    assertProjectList(raw.projects);
    return { sharded: false };
}

export function readProjects(file: string): ComparisonProject[] {
    if (!fs.existsSync(file))
        return [];
    // Legacy monolithic files remain readable without the old 64 MiB ceiling.
    // New writes are sharded before the project can grow to that size.
    return readStorage(file).projects;
}

function relativeShardPath(file: string, category: 'projects' | 'runs', name: string): string {
    return path.join(path.basename(shardDirectory(file)), category, `${name}.json`);
}

function serializedShard(value: unknown): { text: string; name: string } {
    const text = JSON.stringify(value);
    const name = crypto.createHash('sha256').update(text).digest('hex');
    return { text, name };
}

function writeShardIfMissing(file: string, category: 'projects' | 'runs', value: unknown): string {
    const serialized = serializedShard(value);
    const relative = relativeShardPath(file, category, serialized.name);
    const destination = path.resolve(path.dirname(file), relative);
    if (!fs.existsSync(destination)) writeAtomic(destination, serialized.text);
    return relative;
}

function collectReferencedShards(indexFile: string): Set<string> {
    if (!fs.existsSync(indexFile)) return new Set();
    let raw: unknown;
    try { raw = readJson(indexFile); }
    catch { return new Set(); }
    if (!isShardedIndex(raw)) return new Set();
    const references = new Set<string>();
    for (const project of raw.projects ?? []) {
        if (!project || typeof project !== 'object') continue;
        const candidate = project as Partial<ShardedProjectReference>;
        if (typeof candidate.file === 'string') references.add(resolveShard(indexFile, candidate.file));
        for (const run of candidate.runs ?? []) {
            if (run && typeof run === 'object' && typeof run.file === 'string')
                references.add(resolveShard(indexFile, run.file));
        }
    }
    return references;
}

/** Remove obsolete generations after the current index and its one backup are safe. */
function pruneUnreferencedShards(file: string): void {
    const directory = shardDirectory(file);
    if (!fs.existsSync(directory)) return;
    const referenced = new Set([
        ...collectReferencedShards(file),
        ...collectReferencedShards(`${file}.bak`),
    ]);
    for (const category of ['projects', 'runs']) {
        const categoryDirectory = path.join(directory, category);
        if (!fs.existsSync(categoryDirectory)) continue;
        for (const entry of fs.readdirSync(categoryDirectory, { withFileTypes: true })) {
            if (!entry.isFile()) continue;
            const candidate = path.join(categoryDirectory, entry.name);
            if (!referenced.has(candidate)) fs.unlinkSync(candidate);
        }
    }
}

export function writeProjects(file: string, projects: ComparisonProject[]) {
    assertProjectList(projects);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const existing = fs.existsSync(file);
    let existingStorage: { sharded: boolean } | undefined;
    if (existing) {
        // Inspect only the small root document. Hydrating and validating all
        // historical runs on every UI edit would defeat the purpose of the
        // sharded store.
        existingStorage = existingStorageKind(file);
        // Keep the previous root available for the existing backup workflow.
        copyAtomic(file, `${file}.bak`);
        // A one-time migration copy keeps the original monolithic file intact
        // even after the normal `.bak` slot advances to later indexes.
        if (!existingStorage.sharded && !fs.existsSync(`${file}${LEGACY_BACKUP_SUFFIX}`))
            copyAtomic(file, `${file}${LEGACY_BACKUP_SUFFIX}`);
    }

    const directory = shardDirectory(file);
    fs.mkdirSync(path.join(directory, 'projects'), { recursive: true, mode: 0o700 });
    fs.mkdirSync(path.join(directory, 'runs'), { recursive: true, mode: 0o700 });
    const references: ShardedProjectReference[] = [];
    try {
        for (const project of projects) {
            const runReferences: ShardedRunReference[] = [];
            const projectWithoutRuns: Omit<ComparisonProject, 'runs'> = { ...project };
            delete (projectWithoutRuns as Partial<ComparisonProject>).runs;
            const projectFile = writeShardIfMissing(file, 'projects', {
                version: COMPARISON_FILE_VERSION,
                project: projectWithoutRuns,
            } satisfies ShardedProjectFile);
            for (const run of project.runs) {
                const runFile = writeShardIfMissing(file, 'runs', {
                    version: COMPARISON_FILE_VERSION,
                    run,
                } satisfies ShardedRunFile);
                runReferences.push({ id: run.id, file: runFile });
            }
            references.push({ id: project.id, file: projectFile, runs: runReferences });
        }
        const index: ShardedIndex = { version: COMPARISON_FILE_VERSION, storage: SHARDED_STORAGE, projects: references };
        writeAtomic(file, JSON.stringify(index));
    }
    finally {
        // Unreferenced temporary generations are safe to remove only after a
        // successful index replacement; failed writes leave old state intact.
        if (fs.existsSync(file)) {
            try { pruneUnreferencedShards(file); }
            catch { /* A failed cleanup never invalidates the committed index. */ }
        }
    }
}

// A 5,000-artist library can routinely exceed 256 MiB. Bound total size while
// streaming images instead of retaining all decoded PNGs in memory.
export const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_IMAGE_BYTES = 64 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const hash = (bytes: Buffer) => crypto.createHash('sha256').update(bytes).digest('hex');

export function csvReport(project: ComparisonProject): string {
  const cell = (value: unknown) => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const jobsByEntry = indexEntryJobs(project);
  const covers = new Map(project.entries.map(entry => {
    const jobs = jobsByEntry.get(entry.id) ?? [];
    const cover = entry.coverJobId === null
      ? undefined
      : entry.coverJobId === undefined
        ? jobs.find(job => job.status === 'done' && job.image !== undefined)
        : jobs.find(job => job.id === entry.coverJobId && job.status === 'done' && job.image !== undefined);
    return [entry.id, cover] as const;
  }));
  const tagLabels = new Map((project.tags ?? []).map(tag => [tag.id, tag.label]));
  const rows: unknown[][] = [['project', 'run', 'kind', 'name', 'prompt', 'rating', 'note', 'tags', 'in_pool', 'seed', 'status', 'image', 'is_cover']];
  const scopes = [
    { id: 'library', entries: project.entries, ratings: project.ratings, jobs: [] as ComparisonJob[] },
    ...project.runs.map(r => ({ id: r.id, entries: r.entries, ratings: r.ratings, jobs: r.jobs })),
  ];
  for (const scope of scopes) {
    const jobsByScopeEntry = new Map<string, ComparisonJob[]>();
    for (const job of scope.jobs) {
      const jobs = jobsByScopeEntry.get(job.entryId);
      if (jobs) jobs.push(job);
      else jobsByScopeEntry.set(job.entryId, [job]);
    }
    for (const entry of scope.entries) {
    const cover = covers.get(entry.id);
    const jobs = jobsByScopeEntry.get(entry.id) ?? [];
    for (const job of jobs.length ? jobs : [cover]) {
      rows.push([
        project.name, scope.id, entry.kind, entry.name, entry.prompt,
        scope.ratings.find(level => level.id === entry.ratingId)?.label ?? '',
        entry.note, (entry.tagIds ?? []).map(tagId => tagLabels.get(tagId)).filter(Boolean).join(', '),
        entry.kind === 'single' && entry.ratingId !== null, job?.seed,
        job?.status, job?.image ? path.basename(job.image.filePath) : '', Boolean(job && job.id === cover?.id),
      ]);
    }
  }
  }
  return '\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n');
}

async function inspectPng(stream: NodeJS.ReadableStream): Promise<{ sha: string; size: number }> {
  const digest = crypto.createHash('sha256');
  let size = 0;
  let signature = Buffer.alloc(0);
  await pipeline(stream, new Writable({
    write(chunk: Buffer, _encoding, done) {
      size += chunk.length;
      if (size > MAX_IMAGE_BYTES) { done(new Error('Image exceeds 64 MiB.')); return; }
      if (signature.length < 8) signature = Buffer.concat([signature, chunk.subarray(0, 8 - signature.length)]);
      digest.update(chunk);
      done();
    },
  }));
  if (!signature.equals(PNG_SIGNATURE)) throw new Error('An output image is invalid.');
  return { sha: digest.digest('hex'), size };
}

function finishArchive(zip: JSZip, project: ComparisonProject, assets: Record<string, string>) {
  const manifest = JSON.stringify({ version: 1, project, assets });
  if (Buffer.byteLength(manifest) > 32 * 1024 * 1024) throw new Error('Manifest exceeds 32 MiB.');
  zip.file('manifest.json', manifest);
  zip.file('ratings.csv', csvReport(project));
}

/** Buffer adapter used by small fixtures and callers already holding image bytes. */
export async function exportArchive(project: ComparisonProject, resolveImage: (job: ComparisonJob) => Buffer): Promise<Buffer> {
  const copy = structuredClone(project);
  const zip = new JSZip();
  const assets: Record<string, string> = {};
  let total = 0;
  for (const run of copy.runs) for (const job of run.jobs) {
    if (job.status === 'running') job.status = 'uncertain';
    if (!job.image) continue;
    const bytes = resolveImage(job);
    if (bytes.length > MAX_IMAGE_BYTES || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('An output image is invalid.');
    const sha = hash(bytes), relative = `images/${sha}.png`;
    if (!assets[relative]) {
      total += bytes.length;
      if (total > MAX_ARCHIVE_BYTES) throw new Error('Archive exceeds 2 GiB.');
      zip.file(relative, bytes, { compression: 'STORE' });
      assets[relative] = sha;
    }
    job.image = { id: job.image.id, filePath: relative, fileUrl: '' };
  }
  finishArchive(zip, copy, assets);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** Atomic disk export. Only one source image is opened at a time. */
export async function exportArchiveToFile(
  project: ComparisonProject,
  destination: string,
  resolveImagePath: (job: ComparisonJob) => string,
): Promise<void> {
  const copy = structuredClone(project), zip = new JSZip();
  const assets: Record<string, string> = {};
  let total = 0;
  for (const run of copy.runs) for (const job of run.jobs) {
    if (job.status === 'running') job.status = 'uncertain';
    if (!job.image) continue;
    const source = resolveImagePath(job);
    const { sha, size } = await inspectPng(fs.createReadStream(source));
    const relative = `images/${sha}.png`;
    if (!assets[relative]) {
      total += size;
      if (total > MAX_ARCHIVE_BYTES) throw new Error('Archive exceeds 2 GiB.');
      assets[relative] = sha;
      zip.file(relative, Readable.from((async function* () { yield* fs.createReadStream(source); })()), { compression: 'STORE' });
    }
    job.image = { id: job.image.id, filePath: relative, fileUrl: '' };
  }
  finishArchive(zip, copy, assets);
  const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
  let written = 0;
  try {
    await pipeline(
      zip.generateNodeStream({ streamFiles: true, compression: 'DEFLATE' }),
      new Transform({ transform(chunk: Buffer, _encoding, done) {
        written += chunk.length;
        done(written > MAX_ARCHIVE_BYTES ? new Error('Archive exceeds 2 GiB.') : null, chunk);
      } }),
      fs.createWriteStream(temporary, { flags: 'wx', mode: 0o600 }),
    );
    await fs.promises.rename(temporary, destination);
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }
}

export async function importArchive(buffer: Buffer, assetRoot: string, mediaUrl: (file: string) => string): Promise<ComparisonProject> {
  if (buffer.length > MAX_ARCHIVE_BYTES) throw new Error('Archive exceeds 2 GiB.');
  const zip = await JSZip.loadAsync(buffer);
  let expanded = 0;
  for (const entry of Object.values(zip.files)) {
    const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
    expanded += size;
    if (size > MAX_IMAGE_BYTES || expanded > MAX_ARCHIVE_BYTES) throw new Error('Expanded archive exceeds limits.');
  }
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('Missing comparison manifest.');
  const manifestText = await manifestFile.async('string');
  if (Buffer.byteLength(manifestText) > 32 * 1024 * 1024) throw new Error('Manifest too large.');
  const manifest = JSON.parse(manifestText);
  if (manifest.version !== 1 || !manifest.assets || typeof manifest.assets !== 'object') throw new Error('Unsupported archive.');
  const project = validateProject(manifest.project);
  const verified = new Map<string, { file: JSZip.JSZipObject; sha: string }>();
  const pending: { job: ComparisonJob; relative: string }[] = [];
  for (const run of project.runs) for (const job of run.jobs) {
    if (job.status === 'running') job.status = 'uncertain';
    if (!job.image) continue;
    const relative = job.image.filePath;
    if (!/^images\/[a-f0-9]{64}\.png$/.test(relative)) throw new Error('Unsafe image path.');
    const sha = relative.slice(7, -4), file = zip.file(relative);
    if (!file || manifest.assets[relative] !== sha) throw new Error('Missing image checksum.');
    if (!verified.has(relative)) {
      const inspected = await inspectPng(file.nodeStream());
      if (inspected.sha !== sha) throw new Error('Image checksum mismatch.');
      verified.set(relative, { file, sha });
    }
    pending.push({ job, relative });
  }
  // Verify every reference first; then decompress one PNG at a time onto disk.
  await fs.promises.mkdir(assetRoot, { recursive: true });
  for (const { file, sha } of verified.values()) {
    const destination = path.join(assetRoot, `${sha}.png`);
    const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
    try {
      await pipeline(file.nodeStream(), fs.createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
      await fs.promises.rename(temporary, destination);
    } finally { await fs.promises.rm(temporary, { force: true }); }
  }
  for (const { job, relative } of pending) {
    const destination = path.join(assetRoot, path.basename(relative));
    job.image = { id: crypto.randomUUID(), filePath: destination, fileUrl: mediaUrl(destination) };
  }
  const ids = new Map<string, string>();
  const fresh = (kind: 'entry' | 'rating' | 'job', id: string) => {
    const key = `${kind}:${id}`;
    if (!ids.has(key)) ids.set(key, crypto.randomUUID());
    return ids.get(key)!;
  };
  const freshTag = (id: string) => {
    const key = `tag:${id}`;
    if (!ids.has(key)) ids.set(key, crypto.randomUUID());
    return ids.get(key)!;
  };
  const remapEntry = (entry: ComparisonProject['entries'][number]) => {
    entry.id = fresh('entry', entry.id);
    if (entry.ratingId) entry.ratingId = fresh('rating', entry.ratingId);
    if (entry.coverJobId) entry.coverJobId = fresh('job', entry.coverJobId);
    entry.tagIds = (entry.tagIds ?? []).map(freshTag);
    if (entry.origin) entry.origin.entryIds = entry.origin.entryIds.map(id => fresh('entry', id));
  };
  project.id = crypto.randomUUID();
  (project.tags ?? []).forEach(tag => { tag.id = freshTag(tag.id); });
  project.ratings.forEach(level => { level.id = fresh('rating', level.id); });
  project.entries.forEach(remapEntry);
  for (const run of project.runs) {
    run.id = crypto.randomUUID();
    run.ratings.forEach(level => { level.id = fresh('rating', level.id); });
    run.entries.forEach(remapEntry);
    for (const job of run.jobs) {
      job.id = fresh('job', job.id);
      job.entryId = fresh('entry', job.entryId);
    }
  }
  return validateProject(project);
}
