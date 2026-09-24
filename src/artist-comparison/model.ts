import { normalizeGenerateParams } from "../types";
import type { GenerateParams } from "../types";

/** Per-operation limits bound work; project libraries have no shared item quota. */
export const MAX_COMPARISON_ENTRIES = 5_000;
export const MAX_EXPLORATION_RECIPES = 500;
export const MAX_RATING_LEVELS = 64;
export const MAX_COMPARISON_TAGS = 100;
export const MAX_TAG_LABEL_LENGTH = 80;

export const MAX_SEEDS_PER_RUN = 10;
export const MAX_RUN_JOBS = 5_000;
export const DEFAULT_COMPARISON_INTERVAL_SECONDS = 30;
export const MAX_COMPARISON_INTERVAL_SECONDS = 3_600;

const MAX_ID_LENGTH = 128;
const MAX_NAME_LENGTH = 200;
const MAX_PROMPT_LENGTH = 16_384;
const MAX_NOTE_LENGTH = 4_000;
const MAX_ERROR_LENGTH = 4_096;
const MAX_PATH_LENGTH = 16_384;
const MAX_CREATED_AT_LENGTH = 128;
const MAX_WEIGHT = 7;
const MIN_WEIGHT = 0.1;

export type ComparisonEntryKind = "single" | "recipe";
export type ComparisonJobStatus =
  | "pending"
  | "running"
  | "done"
  | "failed"
  | "uncertain"
  | "skipped";

export interface RatingLevel {
  id: string;
  label: string;
  color: string;
}

export interface ComparisonTag {
  id: string;
  label: string;
}

/** Provenance for an exploration result. The source entries remain immutable. */
export interface ComparisonEntryOrigin {
  entryIds: string[];
}

export interface ComparisonEntry {
  id: string;
  name: string;
  prompt: string;
  kind: ComparisonEntryKind;
  ratingId: string | null;
  note: string;
  inPool: boolean;
  /** Shared project tag IDs. Old backups normalize this to an empty list. */
  tagIds?: string[];
  /** Explicit cover selection; absent keeps the legacy automatic fallback. */
  coverJobId?: string | null;
  origin?: ComparisonEntryOrigin;
}

export interface ComparisonImage {
  id: string;
  filePath: string;
  fileUrl: string;
}

export interface ComparisonJob {
  id: string;
  entryId: string;
  seed: number;
  status: ComparisonJobStatus;
  image?: ComparisonImage;
  error?: string;
  quotedAnlas?: number;
  actualAnlas?: number;
}

export interface ComparisonRun {
  id: string;
  createdAt: string;
  params: GenerateParams;
  positive: string;
  negative: string;
  jobs: ComparisonJob[];
  entries: ComparisonEntry[];
  ratings: RatingLevel[];
}

export interface ComparisonProject {
  id: string;
  name: string;
  ratings: RatingLevel[];
  /** Shared tag definitions used by current and run-snapshot entries. */
  tags?: ComparisonTag[];
  entries: ComparisonEntry[];
  runs: ComparisonRun[];
  /** Seconds to wait after a completed image before submitting the next one. */
  intervalSeconds?: number;
  intervalMaxSeconds?: number;
}

export interface PoolRule {
  ratingId: string;
  count: number;
  minWeight: number;
  maxWeight: number;
}

function newId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID !== "function") {
    throw new Error("crypto.randomUUID is required for comparison IDs");
  }
  return randomUUID.call(globalThis.crypto);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function boundedString(
  value: unknown,
  field: string,
  maxLength: number,
  allowEmpty = false,
): string {
  if (typeof value !== "string") throw new TypeError(`${field} must be a string`);
  if (!allowEmpty && value.trim() === "") throw new TypeError(`${field} must not be empty`);
  if (value.length > maxLength) throw new RangeError(`${field} is too long`);
  if (value.includes("\u0000")) throw new TypeError(`${field} contains a NUL`);
  return value;
}

function requireArray(value: unknown, field: string, maxLength: number): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array`);
  if (value.length > maxLength) throw new RangeError(`${field} is too large`);
  return value;
}

function requireSafeId(value: unknown, field: string): string {
  const id = boundedString(value, field, MAX_ID_LENGTH);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new TypeError(`${field} contains unsupported ID characters`);
  return id;
}

function requireFiniteNumber(value: unknown, field: string, min = -Infinity, max = Infinity): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${field} must be a finite number`);
  }
  if (value < min || value > max) throw new RangeError(`${field} is out of range`);
  return value;
}

function requireInteger(value: unknown, field: string, min: number, max: number): number {
  const number = requireFiniteNumber(value, field, min, max);
  if (!Number.isSafeInteger(number)) throw new RangeError(`${field} must be an integer`);
  return number;
}

/** Normalize the per-project queue delay while accepting legacy projects. */
export function normalizeComparisonInterval(
  value: unknown,
  field = "intervalSeconds",
): number {
  if (value === undefined) return DEFAULT_COMPARISON_INTERVAL_SECONDS;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_COMPARISON_INTERVAL_SECONDS || Math.abs(value * 10 - Math.round(value * 10)) > 1e-8) {
    throw new TypeError(`${field} must be 0–3600 seconds with at most one decimal place`);
  }
  return value;
}

/** Read a project's queue delay with the legacy default applied. */
export function getComparisonIntervalSeconds(
  project: Pick<ComparisonProject, "intervalSeconds">,
): number {
  return normalizeComparisonInterval(project.intervalSeconds);
}

export function sampleComparisonInterval(project: Pick<ComparisonProject, "intervalSeconds" | "intervalMaxSeconds">, random = Math.random): number {
  const min = getComparisonIntervalSeconds(project);
  const max = normalizeComparisonInterval(project.intervalMaxSeconds ?? min);
  if (max < min) throw new RangeError("Maximum interval must not be below minimum interval");
  return (Math.round(min * 10) + Math.floor(random() * (Math.round(max * 10) - Math.round(min * 10) + 1))) / 10;
}

function artistNameFromPrompt(prompt: string): string | null {
  const value = prompt.trim();
  if (!value || /[,，\r\n]/.test(value)) return null;
  const explicit = /^artist\s*:/i.exec(value);
  const name = explicit ? value.slice(explicit[0].length).trim() : value;
  return name || null;
}

/** Each imported line is one artist unless it contains a comma separator.
 * Punctuation, including escaped parentheses, is part of the artist name.
 */
export function classifyEntry(prompt: string): ComparisonEntryKind {
  return typeof prompt === "string" && prompt.trim() && !/[,，\r\n]/.test(prompt)
    ? "single"
    : "recipe";
}

/** Exact artist identity only: no fuzzy matching or deletion of existing records. */
export function artistIdentity(entry: Pick<ComparisonEntry, "kind" | "prompt">): string | undefined {
  if (entry.kind !== "single") return undefined;
  return entry.prompt.trim().replace(/^artist\s*:/i, "").trim()
    .replace(/\\([()])/g, "$1").replace(/[_\s]+/g, " ").toLowerCase();
}

export function uniqueArtistEntries(entries: ComparisonEntry[], existing: ComparisonEntry[] = []): ComparisonEntry[] {
  const seen = new Set(existing.map(artistIdentity).filter((key) => key !== undefined));
  return entries.filter((entry) => {
    const key = artistIdentity(entry);
    if (key === undefined) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Build all current-entry histories in one pass instead of rescanning for every card. */
export function indexEntryJobs(project: ComparisonProject): Map<string, ComparisonJob[]> {
  const current = new Map(project.entries.map((entry) => [entry.id, entry.prompt]));
  const result = new Map<string, ComparisonJob[]>();
  for (const entry of project.entries) result.set(entry.id, []);
  for (let i = project.runs.length - 1; i >= 0; i--) {
    const run = project.runs[i];
    const snapshots = new Map(run.entries.map((entry) => [entry.id, entry.prompt]));
    for (const job of run.jobs) {
      if (current.has(job.entryId) && current.get(job.entryId) === snapshots.get(job.entryId)) result.get(job.entryId)!.push(job);
    }
  }
  return result;
}

function splitTsvLine(line: string): string[] {
  if (!line.includes("\t") && !line.includes('"')) return [line];
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  let justClosedQuote = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (inQuotes) {
      if (character === '"') {
        if (line[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
          justClosedQuote = true;
        }
      } else {
        cell += character;
      }
      continue;
    }
    if (justClosedQuote) {
      if (character === "\t") {
        cells.push(cell);
        cell = "";
        justClosedQuote = false;
      } else if (!/\s/.test(character)) {
        throw new TypeError("Malformed TSV quoted cell");
      }
      continue;
    }
    if (character === "\t") {
      cells.push(cell);
      cell = "";
    } else if (character === '"' && cell.trim() === "") {
      cell = "";
      inQuotes = true;
    } else {
      cell += character;
    }
  }
  if (inQuotes) throw new TypeError("Unclosed TSV quoted cell");
  cells.push(cell);
  return cells;
}

type HeaderMap = Partial<Record<"name" | "prompt" | "note", number>>;

function detectHeader(cells: string[]): HeaderMap | null {
  const map: HeaderMap = {};
  cells.forEach((cell, index) => {
    const key = cell.replace(/^\uFEFF/, "").trim().toLowerCase();
    if (key === "name" || key === "prompt" || key === "note") map[key] = index;
  });
  if (Object.keys(map).length === 0) return null;
  // A one-column artist named "name" is data. "prompt" is unambiguous as a
  // header because it is the documented field used by the one-column form.
  if (cells.length === 1 && map.prompt === undefined) return null;
  return map;
}

function rowIsEmpty(cells: string[]): boolean {
  return cells.every((cell) => cell.trim() === "");
}

function deriveEntryName(prompt: string): string {
  return artistNameFromPrompt(prompt) ?? prompt.trim();
}

/**
 * Parse one non-empty physical line into one entry. For TSV, a header is
 * recognized when the first row contains exact `name`, `prompt`, or `note`
 * fields (case-insensitive, with BOM ignored); without a header columns are
 * positional `name<TAB>prompt<TAB>note`. Commas are never delimiters.
 */
export function parseEntries(text: string): ComparisonEntry[] {
  if (typeof text !== "string") throw new TypeError("entry text must be a string");
  const physicalRows = text.split(/\r\n|\n|\r/);
  const rows = physicalRows
    .map((line) => splitTsvLine(line))
    .filter((cells) => !rowIsEmpty(cells));
  if (rows.length === 0) return [];

  const header = detectHeader(rows[0]);
  const dataRows = header ? rows.slice(1) : rows;


  return dataRows.map((cells) => {
    const nameIndex = header?.name ?? (header ? undefined : cells.length >= 2 ? 0 : undefined);
    const promptIndex = header?.prompt ?? (header ? undefined : cells.length >= 2 ? 1 : 0);
    const noteIndex = header?.note ?? (header ? undefined : cells.length >= 3 ? 2 : undefined);
    const promptCell = promptIndex === undefined ? "" : (cells[promptIndex] ?? "");
    const nameCell = nameIndex === undefined ? "" : (cells[nameIndex] ?? "");
    const prompt = promptCell.trim();
    const name = nameCell.trim() || deriveEntryName(prompt);
    const note = noteIndex === undefined ? "" : (cells[noteIndex] ?? "").trim();
    boundedString(name, "entry name", MAX_NAME_LENGTH, true);
    boundedString(prompt, "entry prompt", MAX_PROMPT_LENGTH, true);
    boundedString(note, "entry note", MAX_NOTE_LENGTH, true);
    return {
      id: newId(),
      name,
      prompt,
      kind: classifyEntry(prompt),
      ratingId: null,
      note,
      inPool: false,
      tagIds: [],
    } satisfies ComparisonEntry;
  });
}

function defaultRatings(): RatingLevel[] {
  return [
    { id: newId(), label: "待定", color: "#94a3b8" },
    { id: newId(), label: "推荐", color: "#22c55e" },
    { id: newId(), label: "精选", color: "#f59e0b" },
  ];
}

function cloneOrigin(origin: ComparisonEntryOrigin | undefined): ComparisonEntryOrigin | undefined {
  return origin ? { entryIds: [...origin.entryIds] } : undefined;
}

function cloneEntry(entry: ComparisonEntry, includeCover = true): ComparisonEntry {
  return {
    id: entry.id,
    name: entry.name,
    prompt: entry.prompt,
    kind: entry.kind,
    ratingId: entry.ratingId,
    note: entry.note,
    // `inPool` remains on the wire for compatibility, but eligibility is
    // derived from a rated single entry everywhere we reconstruct state.
    inPool: entry.kind === "single" && entry.ratingId !== null,
    tagIds: [...(entry.tagIds ?? [])],
    ...(includeCover && entry.coverJobId !== undefined ? { coverJobId: entry.coverJobId } : {}),
    ...(entry.origin ? { origin: cloneOrigin(entry.origin) } : {}),
  };
}

function cloneRating(rating: RatingLevel): RatingLevel {
  return { id: rating.id, label: rating.label, color: rating.color };
}

function cloneTag(tag: ComparisonTag): ComparisonTag {
  return { id: tag.id, label: tag.label };
}

function assertUniqueIds(items: Array<{ id: string }>, field: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) throw new TypeError(`${field} contains duplicate IDs`);
    seen.add(item.id);
  }
}

function cloneRun(run: ComparisonRun): ComparisonRun {
  return {
    id: run.id,
    createdAt: run.createdAt,
    params: clone(run.params),
    positive: run.positive,
    negative: run.negative,
    jobs: run.jobs.map((job) => ({
      ...job,
      ...(job.image ? { image: { ...job.image } } : {}),
    })),
    entries: run.entries.map((entry) => cloneEntry(entry)),
    ratings: run.ratings.map(cloneRating),
  };
}

function cloneProject(project: ComparisonProject): ComparisonProject {
  return {
    id: project.id,
    name: project.name,
    ratings: project.ratings.map(cloneRating),
    tags: (project.tags ?? []).map(cloneTag),
    entries: project.entries.map((entry) => cloneEntry(entry)),
    runs: project.runs.map((run) => cloneRun(run)),
    ...(project.intervalMaxSeconds !== undefined ? { intervalMaxSeconds: project.intervalMaxSeconds } : {}),
    ...(project.intervalSeconds !== undefined ? { intervalSeconds: project.intervalSeconds } : {}),
  };
}

/** Create an empty project with a small editable default rating scheme. */
export function createProject(
  name = "画师比较",
  ratings: RatingLevel[] = defaultRatings(),
): ComparisonProject {
  boundedString(name, "project name", MAX_NAME_LENGTH);
  const clonedRatings = ratings.map(cloneRating);
  clonedRatings.forEach((rating, index) => {
    boundedString(rating.id, `ratings[${index}].id`, MAX_ID_LENGTH);
    boundedString(rating.label, `ratings[${index}].label`, MAX_NAME_LENGTH);
    boundedString(rating.color, `ratings[${index}].color`, 128);
  });
  assertUniqueIds(clonedRatings, "ratings");
  if (clonedRatings.length > MAX_RATING_LEVELS) throw new RangeError("too many rating levels");
  return {
    id: newId(),
    name,
    ratings: clonedRatings,
    tags: [],
    entries: [],
    runs: [],
    intervalSeconds: DEFAULT_COMPARISON_INTERVAL_SECONDS,
  };
}

/** Rename a rating while retaining its stable ID and all current associations. */
export function renameRating(
  project: ComparisonProject,
  ratingId: string,
  label: string,
  color?: string,
): ComparisonProject {
  const levels = project.ratings.map(cloneRating);
  const rating = levels.find((item) => item.id === ratingId);
  if (!rating) throw new RangeError("rating level does not exist");
  boundedString(label, "rating label", MAX_NAME_LENGTH);
  rating.label = label;
  if (color !== undefined) {
    boundedString(color, "rating color", 128);
    rating.color = color;
  }
  return syncRatingScheme(project, levels);
}

/**
 * Return rating levels that are still present only in historical run
 * snapshots and are referenced by at least one historical entry. These are
 * intentionally not matched by label: two levels with the same label can be
 * different schemes and require an explicit user mapping.
 */
export function getLegacyRatingLevels(project: ComparisonProject): RatingLevel[] {
  const currentIds = new Set(project.ratings.map((rating) => rating.id));
  const used = new Set<string>();
  for (const run of project.runs)
    for (const entry of run.entries)
      if (entry.ratingId !== null && !currentIds.has(entry.ratingId)) used.add(entry.ratingId);

  const result: RatingLevel[] = [];
  const seen = new Set<string>();
  for (const run of project.runs)
    for (const rating of run.ratings)
      if (used.has(rating.id) && !seen.has(rating.id)) {
        result.push(cloneRating(rating));
        seen.add(rating.id);
      }
  return result;
}

/**
 * Make the current project rating scheme authoritative for every run. Stable
 * IDs are updated directly (including label, color and order). IDs removed
 * from the target scheme may only be cleared or redirected through an
 * explicit mapping; unused historical levels can be discarded safely.
 */
export function syncRatingScheme(
  project: ComparisonProject,
  levels: RatingLevel[] = project.ratings,
  mapping: Record<string, string | null> = {},
): ComparisonProject {
  const target = normalizeRatings(levels, "ratings");
  if (!isRecord(mapping)) throw new TypeError("rating mapping must be an object");
  const targetIds = new Set(target.map((rating) => rating.id));
  const usedIds = new Set<string>();
  const collectUsed = (entry: ComparisonEntry) => {
    if (entry.ratingId !== null && !targetIds.has(entry.ratingId)) usedIds.add(entry.ratingId);
  };
  project.entries.forEach(collectUsed);
  project.runs.forEach((run) => run.entries.forEach(collectUsed));

  const hasOwn = (key: string) => Object.prototype.hasOwnProperty.call(mapping, key);
  for (const oldId of usedIds) {
    if (!hasOwn(oldId)) throw new RangeError(`rating mapping required for ${oldId}`);
    const mapped = mapping[oldId];
    if (mapped !== null && (typeof mapped !== "string" || !targetIds.has(mapped))) {
      throw new RangeError(`rating mapping target does not exist for ${oldId}`);
    }
  }
  for (const [oldId, mapped] of Object.entries(mapping)) {
    requireSafeId(oldId, `rating mapping key ${oldId}`);
    if (mapped !== null && (typeof mapped !== "string" || !targetIds.has(mapped))) {
      throw new RangeError(`rating mapping target does not exist for ${oldId}`);
    }
  }

  const result = cloneProject(project);
  result.ratings = target.map(cloneRating);
  const resolveRating = (ratingId: string | null): string | null => {
    if (ratingId === null || targetIds.has(ratingId)) return ratingId;
    return mapping[ratingId] ?? null;
  };
  const syncEntry = (entry: ComparisonEntry) => {
    entry.ratingId = resolveRating(entry.ratingId);
    entry.inPool = entry.kind === "single" && entry.ratingId !== null;
  };
  result.entries.forEach(syncEntry);
  for (const run of result.runs) {
    run.ratings = target.map(cloneRating);
    run.entries.forEach(syncEntry);
  }
  return result;
}

/**
 * Delete a rating and explicitly map its current entries to another level or
 * to null. Omitting the third argument is rejected, so a used level cannot be
 * silently discarded.
 */
export function replaceRating(
  project: ComparisonProject,
  oldId: string,
  targetId: string | null,
): ComparisonProject {
  if (arguments.length < 3) throw new TypeError("rating deletion requires an explicit target or null");
  const oldIndex = project.ratings.findIndex((item) => item.id === oldId);
  if (oldIndex < 0) throw new RangeError("rating level does not exist");
  if (targetId !== null) {
    if (targetId === oldId) throw new RangeError("rating target must differ from deleted level");
    if (!project.ratings.some((item) => item.id === targetId)) {
      throw new RangeError("rating target does not exist");
    }
  }
  const levels = project.ratings.filter((_rating, index) => index !== oldIndex);
  return syncRatingScheme(project, levels, { [oldId]: targetId });
}

function createSeededRandom(seed: number): () => number {
  let state = (Number.isFinite(seed) ? Math.trunc(seed) : 0) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

interface Candidate {
  entry: ComparisonEntry;
  artistName: string;
  artistKey: string;
}

function candidateFor(entry: ComparisonEntry): Candidate | null {
  if (entry.kind !== "single" || entry.ratingId === null) return null;
  // Re-check the prompt instead of trusting a tampered imported `kind` field.
  if (classifyEntry(entry.prompt) !== "single") return null;
  const artistName = artistNameFromPrompt(entry.prompt);
  if (!artistName) return null;
  return {
    entry,
    artistName,
    artistKey: artistIdentity(entry)!,
  };
}

function normalizedWeight(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function formatWeight(value: number): string {
  return normalizedWeight(value).toFixed(2).replace(/(?:\.0+|(?<=\.[0-9])0+)$/, "");
}

/**
 * Sample a bounded set of weighted recipes. Every rule is fulfilled for every
 * recipe, sampling is without replacement by normalized artist name inside a
 * recipe, and the same random stream is independent from image seeds.
 */
export function exploreEntries(
  entries: ComparisonEntry[],
  rules: PoolRule[],
  count: number,
  randomSeed: number,
): ComparisonEntry[] {
  if (!Number.isSafeInteger(count) || count < 0 || count > MAX_EXPLORATION_RECIPES) {
    throw new RangeError(`recipe count must be an integer from 0 to ${MAX_EXPLORATION_RECIPES}`);
  }
  if (!Array.isArray(entries)) {
    throw new TypeError("source entries must be an array");
  }
  if (count === 0) return [];
  if (!Array.isArray(rules) || rules.length === 0 || rules.length > MAX_RATING_LEVELS) {
    throw new RangeError(`pool rules must contain 1 to ${MAX_RATING_LEVELS} levels`);
  }

  const normalizedRules = rules.map((rule, index) => {
    if (!isRecord(rule)) throw new TypeError(`pool rule ${index} must be an object`);
    const ratingId = requireSafeId(rule.ratingId, `pool rule ${index}.ratingId`);
    const ruleCount = requireInteger(rule.count, `pool rule ${index}.count`, 0, MAX_COMPARISON_ENTRIES);
    const minWeight = requireFiniteNumber(rule.minWeight, `pool rule ${index}.minWeight`, MIN_WEIGHT, MAX_WEIGHT);
    const maxWeight = requireFiniteNumber(rule.maxWeight, `pool rule ${index}.maxWeight`, MIN_WEIGHT, MAX_WEIGHT);
    if (minWeight > maxWeight) throw new RangeError(`pool rule ${index} has minWeight above maxWeight`);
    return { ratingId, count: ruleCount, minWeight, maxWeight };
  });
  const selectionsPerRecipe = normalizedRules.reduce((total, rule) => total + rule.count, 0);
  if (selectionsPerRecipe === 0 || selectionsPerRecipe > MAX_COMPARISON_ENTRIES) {
    throw new RangeError("recipe artist count is out of range");
  }

  const pools = new Map<string, Candidate[]>();
  for (const entry of entries) {
    const candidate = candidateFor(entry);
    if (!candidate) continue;
    const pool = pools.get(entry.ratingId!) ?? [];
    // One canonical artist is one pool member. Duplicate rows/aliases must not
    // make a requested pair appear available twice.
    if (!pool.some((item) => item.artistKey === candidate.artistKey)) pool.push(candidate);
    pools.set(entry.ratingId!, pool);
  }

  const random = createSeededRandom(randomSeed);
  const output: ComparisonEntry[] = [];
  for (let recipeIndex = 0; recipeIndex < count; recipeIndex += 1) {
    const used = new Set<string>();
    const selected: Array<{ candidate: Candidate; weight: number }> = [];
    for (const rule of normalizedRules) {
      const available = (pools.get(rule.ratingId) ?? []).filter(
        (candidate) => !used.has(candidate.artistKey),
      );
      if (available.length < rule.count) {
        throw new RangeError(`pool ${rule.ratingId} has insufficient unique artists`);
      }
      for (let itemIndex = 0; itemIndex < rule.count; itemIndex += 1) {
        const candidateIndex = Math.min(available.length - 1, Math.floor(random() * available.length));
        const [candidate] = available.splice(candidateIndex, 1);
        used.add(candidate.artistKey);
        const weight = Math.min(
          rule.maxWeight,
          Math.max(
            rule.minWeight,
            normalizedWeight(rule.minWeight + random() * (rule.maxWeight - rule.minWeight)),
          ),
        );
        selected.push({ candidate, weight });
      }
    }
    const prompt = selected
      .map(({ candidate, weight }) => `${formatWeight(weight)}::artist:${candidate.artistName}::`)
      .join(", ");
    output.push({
      id: newId(),
      name: selected.map(({ candidate }) => candidate.entry.name || candidate.artistName).join(" + "),
      prompt,
      kind: "recipe",
      ratingId: null,
      note: "",
      inPool: false,
      tagIds: [],
      origin: { entryIds: selected.map(({ candidate }) => candidate.entry.id) },
    });
  }
  return output;
}

/** Freeze the project inputs into a run; later edits cannot change its jobs. */
export function createRun(
  project: ComparisonProject,
  params: GenerateParams,
  positive: string,
  negative: string,
  seeds: number[],
): ComparisonRun {
  if (project.entries.length === 0) throw new RangeError("at least one comparison entry is required");
  if (project.entries.length > MAX_COMPARISON_ENTRIES) throw new RangeError("too many comparison entries");
  if (!Array.isArray(seeds) || seeds.length === 0 || seeds.length > MAX_SEEDS_PER_RUN) {
    throw new RangeError(`seeds must contain 1 to ${MAX_SEEDS_PER_RUN} values`);
  }
  const copiedSeeds = seeds.map((seed, index) =>
    requireInteger(seed, `seeds[${index}]`, 0, 4_294_967_295),
  );
  if (project.entries.length * copiedSeeds.length > MAX_RUN_JOBS) {
    throw new RangeError("run contains too many jobs");
  }
  if (typeof positive !== "string" || typeof negative !== "string") {
    throw new TypeError("run prompts must be strings");
  }
  if (positive.length > MAX_PROMPT_LENGTH || negative.length > MAX_PROMPT_LENGTH) {
    throw new RangeError("run prompt is too long");
  }
  const snapshotParams = normalizeParams(params, "params");
  // A new run snapshots the evaluated input. Cover selection belongs to the
  // current project and must not become a stale run-level selection.
  const snapshotEntries = project.entries.map((entry) => cloneEntry(entry, false));
  const jobs: ComparisonJob[] = [];
  for (const entry of snapshotEntries) {
    for (const seed of copiedSeeds) {
      jobs.push({ id: newId(), entryId: entry.id, seed, status: "pending" });
    }
  }
  return {
    id: newId(),
    createdAt: new Date().toISOString(),
    params: clone(snapshotParams),
    positive,
    negative,
    jobs,
    entries: snapshotEntries,
    ratings: project.ratings.map(cloneRating),
  };
}

function matchingEntryJobs(
  project: ComparisonProject,
  entryId: string,
  prompt: string,
): ComparisonJob[] {
  const jobs: ComparisonJob[] = [];
  // Runs are appended chronologically, so reverse traversal gives the latest
  // run first while preserving each run's original job order.
  for (let runIndex = project.runs.length - 1; runIndex >= 0; runIndex -= 1) {
    const run = project.runs[runIndex];
    const snapshot = run.entries.find((entry) => entry.id === entryId);
    if (!snapshot || snapshot.prompt !== prompt) continue;
    jobs.push(...run.jobs.filter((job) => job.entryId === entryId));
  }
  return jobs;
}

/** Return all jobs for a current entry, newest run first and job order stable. */
export function getEntryJobs(project: ComparisonProject, entryId: string): ComparisonJob[] {
  const entry = project.entries.find((candidate) => candidate.id === entryId);
  return entry ? matchingEntryJobs(project, entryId, entry.prompt) : [];
}

/** Resolve a selected cover, or the latest completed output for legacy entries. */
export function getEntryCover(
  project: ComparisonProject,
  entry: ComparisonEntry,
): ComparisonJob | undefined {
  if (entry.coverJobId === null) return undefined;
  const jobs = getEntryJobs(project, entry.id);
  if (entry.coverJobId !== undefined) {
    return jobs.find((job) =>
      job.id === entry.coverJobId && job.status === "done" && job.image !== undefined,
    );
  }
  return jobs.find((job) => job.status === "done" && job.image !== undefined);
}

function normalizeOrigin(value: unknown, field: string): ComparisonEntryOrigin | undefined {
  if (value === undefined) return undefined;
  const source = isRecord(value) ? value : (() => { throw new TypeError(`${field} must be an object`); })();
  const entryIdsSource = requireArray(source.entryIds, `${field}.entryIds`, MAX_COMPARISON_ENTRIES);
  const entryIds = entryIdsSource.map((entryId, index) => requireSafeId(entryId, `${field}.entryIds[${index}]`));
  return { entryIds };
}

function normalizeTagIds(value: unknown, field: string): string[] {
  const source = value === undefined ? [] : requireArray(value, field, MAX_COMPARISON_TAGS);
  const tagIds = source.map((tagId, index) => requireSafeId(tagId, `${field}[${index}]`));
  if (new Set(tagIds).size !== tagIds.length) throw new TypeError(`${field} contains duplicate IDs`);
  return tagIds;
}

function normalizeEntry(value: unknown, field: string): ComparisonEntry {
  const source = isRecord(value) ? value : (() => { throw new TypeError(`${field} must be an object`); })();
  const id = requireSafeId(source.id, `${field}.id`);
  const name = boundedString(source.name, `${field}.name`, MAX_NAME_LENGTH, true);
  const prompt = boundedString(source.prompt, `${field}.prompt`, MAX_PROMPT_LENGTH, true);
  if (source.kind !== "single" && source.kind !== "recipe") {
    throw new TypeError(`${field}.kind is invalid`);
  }
  // Reclassify old imports as well as new ones. Generated exploration recipes
  // retain their identity even when their origin contains only one artist.
  const kind: ComparisonEntryKind = source.origin !== undefined
    ? "recipe"
    : classifyEntry(prompt);
  const ratingId = source.ratingId === null ? null : requireSafeId(source.ratingId, `${field}.ratingId`);
  if (source.inPool !== undefined && typeof source.inPool !== "boolean") {
    throw new TypeError(`${field}.inPool must be boolean`);
  }
  const note = boundedString(source.note, `${field}.note`, MAX_NOTE_LENGTH, true);
  const tagIds = normalizeTagIds(source.tagIds, `${field}.tagIds`);
  const coverJobId = source.coverJobId === undefined
    ? undefined
    : source.coverJobId === null
      ? null
      : requireSafeId(source.coverJobId, `${field}.coverJobId`);
  const origin = normalizeOrigin(source.origin, `${field}.origin`);
  return {
    id,
    name,
    prompt,
    kind,
    ratingId,
    note,
    inPool: kind === "single" && ratingId !== null,
    tagIds,
    ...(coverJobId !== undefined ? { coverJobId } : {}),
    ...(origin ? { origin } : {}),
  };
}

function normalizeRatings(value: unknown, field: string): RatingLevel[] {
  const source = requireArray(value, field, MAX_RATING_LEVELS);
  const ratings = source.map((item, index) => {
    const rating = isRecord(item) ? item : (() => { throw new TypeError(`${field}[${index}] must be an object`); })();
    return {
      id: requireSafeId(rating.id, `${field}[${index}].id`),
      label: boundedString(rating.label, `${field}[${index}].label`, MAX_NAME_LENGTH),
      color: boundedString(rating.color, `${field}[${index}].color`, 128),
    };
  });
  assertUniqueIds(ratings, field);
  return ratings;
}

/** Normalize the shared project tag catalog from trusted or imported data. */
export function normalizeTags(value: unknown, field = "tags"): ComparisonTag[] {
  const source = value === undefined ? [] : requireArray(value, field, MAX_COMPARISON_TAGS);
  const seenIds = new Set<string>();
  const seenLabels = new Set<string>();
  return source.map((item, index) => {
    const tag = isRecord(item)
      ? item
      : (() => { throw new TypeError(`${field}[${index}] must be an object`); })();
    const id = requireSafeId(tag.id, `${field}[${index}].id`);
    const label = boundedString(tag.label, `${field}[${index}].label`, MAX_TAG_LABEL_LENGTH).trim();
    const labelKey = label.toLowerCase();
    if (seenIds.has(id)) throw new TypeError(`${field} contains duplicate IDs`);
    if (seenLabels.has(labelKey)) throw new TypeError(`${field} contains duplicate labels`);
    seenIds.add(id);
    seenLabels.add(labelKey);
    return { id, label };
  });
}

function normalizeImage(value: unknown, field: string): ComparisonImage {
  const image = isRecord(value) ? value : (() => { throw new TypeError(`${field} must be an object`); })();
  return {
    id: requireSafeId(image.id, `${field}.id`),
    filePath: boundedString(image.filePath, `${field}.filePath`, MAX_PATH_LENGTH, true),
    fileUrl: boundedString(image.fileUrl, `${field}.fileUrl`, MAX_PATH_LENGTH, true),
  };
}

function normalizeJob(value: unknown, field: string, entryIds: Set<string>): ComparisonJob {
  const source = isRecord(value) ? value : (() => { throw new TypeError(`${field} must be an object`); })();
  const entryId = requireSafeId(source.entryId, `${field}.entryId`);
  if (!entryIds.has(entryId)) throw new TypeError(`${field}.entryId is not in its run snapshot`);
  const status: ComparisonJobStatus = source.status === "pending" || source.status === "running" ||
    source.status === "done" || source.status === "failed" || source.status === "uncertain" || source.status === "skipped"
    ? source.status
    : (() => { throw new TypeError(`${field}.status is invalid`); })();
  const job: ComparisonJob = {
    id: requireSafeId(source.id, `${field}.id`),
    entryId,
    seed: requireInteger(source.seed, `${field}.seed`, 0, 4_294_967_295),
    status,
  };
  if (source.image !== undefined) job.image = normalizeImage(source.image, `${field}.image`);
  if (source.error !== undefined) job.error = boundedString(source.error, `${field}.error`, MAX_ERROR_LENGTH, true);
  if (source.quotedAnlas !== undefined) job.quotedAnlas = requireFiniteNumber(source.quotedAnlas, `${field}.quotedAnlas`, 0);
  if (source.actualAnlas !== undefined) job.actualAnlas = requireFiniteNumber(source.actualAnlas, `${field}.actualAnlas`, 0);
  return job;
}

function normalizeParams(value: unknown, field: string): GenerateParams {
  if (!isRecord(value)) throw new TypeError(`${field} must be an object`);
  const requiredKeys = [
    "model", "stylePrompt", "positivePrompt", "negativePrompt", "width", "height", "steps",
    "cfgScale", "cfgRescale", "sampler", "noiseSchedule", "seed", "seedMode", "ucPreset",
    "qualityPreset", "qualityToggle", "transparentBackground", "smea", "smeaDyn", "variety",
    "fileNamePrefix",
  ];
  for (const key of requiredKeys) {
    if (!(key in value)) throw new TypeError(`${field}.${key} is required`);
  }
  for (const key of ["stylePrompt", "positivePrompt", "negativePrompt", "noiseSchedule", "fileNamePrefix"]) {
    if (typeof value[key] !== "string") throw new TypeError(`${field}.${key} must be a string`);
  }
  for (const key of ["width", "height", "steps", "cfgScale", "cfgRescale", "seed", "ucPreset"]) {
    if (typeof value[key] !== "number" || !Number.isFinite(value[key])) {
      throw new TypeError(`${field}.${key} must be a finite number`);
    }
  }
  for (const key of ["qualityToggle", "transparentBackground", "smea", "smeaDyn", "variety"]) {
    if (typeof value[key] !== "boolean") throw new TypeError(`${field}.${key} must be boolean`);
  }
  if (value.seedMode !== "fixed" && value.seedMode !== "random") {
    throw new TypeError(`${field}.seedMode is invalid`);
  }
  // Comparison runs are durable job records. Strip image metadata replay
  // before the shared normalizer so imported PNG comment data cannot become
  // part of the run snapshot or its backup.
  const params = normalizeGenerateParams({
    ...value,
    metadataReplay: undefined,
  } as Partial<GenerateParams>);
  boundedString(params.stylePrompt, `${field}.stylePrompt`, MAX_PROMPT_LENGTH, true);
  boundedString(params.positivePrompt, `${field}.positivePrompt`, MAX_PROMPT_LENGTH, true);
  boundedString(params.negativePrompt, `${field}.negativePrompt`, MAX_PROMPT_LENGTH, true);
  boundedString(params.fileNamePrefix, `${field}.fileNamePrefix`, MAX_NAME_LENGTH, true);
  return params;
}

function normalizeRun(value: unknown, field: string, projectRatings: RatingLevel[]): ComparisonRun {
  const source = isRecord(value) ? value : (() => { throw new TypeError(`${field} must be an object`); })();
  const entriesSource = requireArray(source.entries, `${field}.entries`, MAX_COMPARISON_ENTRIES);
  const entries = entriesSource.map((entry, index) => normalizeEntry(entry, `${field}.entries[${index}]`));
  assertUniqueIds(entries, `${field}.entries`);
  const jobsSource = requireArray(source.jobs, `${field}.jobs`, MAX_RUN_JOBS);
  const entryIds = new Set(entries.map((entry) => entry.id));
  const jobs = jobsSource.map((job, index) => normalizeJob(job, `${field}.jobs[${index}]`, entryIds));
  assertUniqueIds(jobs, `${field}.jobs`);
  const ratings = source.ratings === undefined
    ? projectRatings.map(cloneRating)
    : normalizeRatings(source.ratings, `${field}.ratings`);
  return {
    id: requireSafeId(source.id, `${field}.id`),
    createdAt: boundedString(source.createdAt, `${field}.createdAt`, MAX_CREATED_AT_LENGTH),
    params: normalizeParams(source.params, `${field}.params`),
    positive: boundedString(source.positive, `${field}.positive`, MAX_PROMPT_LENGTH, true),
    negative: boundedString(source.negative, `${field}.negative`, MAX_PROMPT_LENGTH, true),
    jobs,
    entries,
    ratings,
  };
}

function assertRatingReferences(
  entries: ComparisonEntry[],
  ratings: RatingLevel[],
  field: string,
): void {
  const ratingIds = new Set(ratings.map((rating) => rating.id));
  for (const entry of entries) {
    if (entry.ratingId !== null && !ratingIds.has(entry.ratingId)) {
      throw new TypeError(`${field} contains an unknown rating ID`);
    }
  }
}

function assertTagReferences(
  entries: ComparisonEntry[],
  tags: ComparisonTag[],
  field: string,
): void {
  const tagIds = new Set(tags.map((tag) => tag.id));
  for (const entry of entries) {
    for (const tagId of entry.tagIds ?? []) {
      if (!tagIds.has(tagId)) throw new TypeError(`${field} contains an unknown tag ID`);
    }
  }
}

function assertCoverReferences(
  entries: ComparisonEntry[],
  runs: ComparisonRun[],
): void {
  const project = { entries, runs } as ComparisonProject;
  const histories = indexEntryJobs(project);
  for (const entry of entries) {
    if (entry.coverJobId == null) continue;
    if (!histories.get(entry.id)?.some((job) => job.id === entry.coverJobId && job.status === "done" && job.image !== undefined))
      throw new TypeError("entry coverJobId does not reference a completed matching image");
  }
}

/**
 * Strictly reconstruct a project from untrusted JSON. Only contract fields
 * are copied; unknown properties are discarded and all collection/string
 * limits are enforced. File path policy remains the backup adapter's job.
 */
export function validateProject(raw: unknown): ComparisonProject {
  const source = isRecord(raw) ? raw : (() => { throw new TypeError("project must be an object"); })();
  const intervalSeconds = normalizeComparisonInterval(source.intervalSeconds, "project.intervalSeconds");
  const intervalMaxSeconds = normalizeComparisonInterval(source.intervalMaxSeconds ?? intervalSeconds, "project.intervalMaxSeconds");
  if (intervalMaxSeconds < intervalSeconds) throw new RangeError("Maximum interval must not be below minimum interval");
  const ratings = normalizeRatings(source.ratings, "project.ratings");
  const tags = normalizeTags(source.tags, "project.tags");
  const entriesSource = requireArray(source.entries, "project.entries", Number.MAX_SAFE_INTEGER);
  const entries = entriesSource.map((entry, index) => normalizeEntry(entry, `project.entries[${index}]`));
  assertUniqueIds(entries, "project.entries");
  assertRatingReferences(entries, ratings, "project.entries");
  assertTagReferences(entries, tags, "project.entries");
  const runsSource = requireArray(source.runs, "project.runs", Number.MAX_SAFE_INTEGER);
  const runs = runsSource.map((run, index) => normalizeRun(run, `project.runs[${index}]`, ratings));
  assertUniqueIds(runs, "project.runs");
  const jobIds = new Set<string>();
  for (const run of runs) {
    assertRatingReferences(run.entries, run.ratings, `run ${run.id}.entries`);
    assertTagReferences(run.entries, tags, `run ${run.id}.entries`);
    for (const job of run.jobs) {
      if (jobIds.has(job.id)) throw new TypeError("project.runs contains duplicate job IDs");
      jobIds.add(job.id);
    }
  }
  assertCoverReferences(entries, runs);
  return {
    id: requireSafeId(source.id, "project.id"),
    name: boundedString(source.name, "project.name", MAX_NAME_LENGTH),
    ratings,
    tags,
    entries,
    runs,
    intervalSeconds,
    ...(source.intervalMaxSeconds !== undefined ? { intervalMaxSeconds } : {}),
  };
}

/** Alias for callers that use normalization terminology for imports. */
export const normalizeProject = validateProject;
