import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import axios, { type AxiosRequestConfig } from "axios";
import sharp from "sharp";
import { toLocalMediaUrl as electronLocalMediaUrl } from "../ipc/local-media-protocol";
import { proxyConfig } from "../ipc/proxy";
import {
  normalizeReferenceTag,
  type ReferenceAction,
  type ReferenceCandidate,
  type ReferenceCover,
  type ReferenceQueueItem,
  type ReferenceRecord,
  type ReferenceResponse,
  type ReferenceState,
} from "../../src/artist-comparison/reference-types";

export { normalizeReferenceTag } from "../../src/artist-comparison/reference-types";
export type {
  ReferenceAction,
  ReferenceCandidate,
  ReferenceCover,
  ReferenceQueueItem,
  ReferenceRecord,
  ReferenceResponse,
  ReferenceState,
} from "../../src/artist-comparison/reference-types";

export const REFERENCE_LIBRARY_DIRECTORY = "artist-reference-library";
export const REFERENCE_STATE_FILE = "references.v1.json";
export const DANBOORU_TAGS_URL = "https://danbooru.donmai.us/tags.json";
export const DANBOORU_POSTS_URL = "https://danbooru.donmai.us/posts.json";
export const DANBOORU_ARTISTS_URL = "https://danbooru.donmai.us/artists";
export const DANBOORU_POST_DETAIL_URL = "https://danbooru.donmai.us/posts";

const STATE_VERSION = 1 as const;
const MAX_TAG_LENGTH = 160;
const MAX_CANDIDATES = 12;
// Keep the renderer's candidate list at twelve items, but inspect a wider
// bounded window so a deleted, banned, animated, or otherwise undownloadable
// newest post does not make an artist look like it has no usable reference.
const MAX_POST_QUERY = 48;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_LOCAL_SOURCE_BYTES = 128 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const IMAGE_TIMEOUT_MS = 45_000;
const MIN_REQUEST_INTERVAL_MS = 1_500;
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 30_000;
const MAX_RATE_LIMIT_BACKOFF_MS = 5 * 60_000;
const USER_AGENT = "Langbai-NovelAI-Studio/Artist-Reference-Library";

type ResponseLike<T> = {
  data: T;
  status?: number;
  headers?: Record<string, unknown>;
};

export type ReferenceHttpGet = <T = unknown>(
  url: string,
  config?: AxiosRequestConfig,
) => Promise<ResponseLike<T>>;

export interface ArtistReferenceServiceOptions {
  /** Parent userData directory; the library directory is appended automatically. */
  userDataPath?: string;
  /** Explicit library root, useful for tests and backup adapters. */
  rootDir?: string;
  request?: ReferenceHttpGet;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  toLocalMediaUrl?: (filePath: string, revision?: string) => string;
}

interface DanbooruTag {
  id?: unknown;
  name?: unknown;
  category?: unknown;
  post_count?: unknown;
  postCount?: unknown;
}

interface DanbooruArtist {
  id?: unknown;
  name?: unknown;
}

interface DanbooruVariant {
  type?: unknown;
  url?: unknown;
  width?: unknown;
  height?: unknown;
  file_ext?: unknown;
}

interface DanbooruPost {
  id?: unknown;
  rating?: unknown;
  tag_string?: unknown;
  tag_string_artist?: unknown;
  tags?: unknown;
  file_url?: unknown;
  large_file_url?: unknown;
  preview_file_url?: unknown;
  image_width?: unknown;
  image_height?: unknown;
  width?: unknown;
  height?: unknown;
  created_at?: unknown;
  score?: unknown;
  file_ext?: unknown;
  is_deleted?: unknown;
  is_banned?: unknown;
  is_animated?: unknown;
  media_asset?: {
    image_width?: unknown;
    image_height?: unknown;
    variants?: unknown;
    file_ext?: unknown;
    is_animated?: unknown;
  };
}

interface PersistedState {
  version?: unknown;
  records?: unknown;
  queue?: unknown;
  running?: unknown;
  paused?: unknown;
  resumeAt?: unknown;
}

class ReferenceError extends Error {
  constructor(message: string, readonly code = "reference-error") {
    super(message);
    this.name = "ReferenceError";
  }
}

class RateLimitError extends ReferenceError {
  constructor(readonly resumeAt: number, message = "Danbooru rate limit reached; reference queue paused") {
    super(message, "rate-limited");
    this.name = "RateLimitError";
  }
}

class QueuePausedError extends ReferenceError {
  constructor() { super("Reference queue paused.", "queue-paused"); }
}

function defaultUserDataPath(): string {
  try {
    return app.getPath("userData");
  } catch {
    // The fallback is only useful when this module is unit-tested outside a
    // running Electron app. Production always supplies Electron's userData.
    return path.join(process.cwd(), ".langbai-user-data");
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function safeTag(value: unknown): string {
  const tag = normalizeReferenceTag(value);
  if (!tag || tag.length > MAX_TAG_LENGTH || /[\u0000\r\n]/.test(tag) || ["__proto__", "constructor", "prototype"].includes(tag)) return "";
  return tag;
}

function safePositiveInteger(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const tag = safeTag(raw);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
  }
  return result;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 4_096);
  if (typeof error === "string" && error.trim()) return error.trim().slice(0, 4_096);
  return "Reference request failed.";
}

function statusOf(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;
  const response = error.response;
  if (isRecord(response)) {
    const status = Number(response.status);
    if (Number.isSafeInteger(status)) return status;
  }
  const status = Number(error.status);
  return Number.isSafeInteger(status) ? status : undefined;
}

function retryAfterMilliseconds(error: unknown, now: number): number {
  const response = isRecord(error) && isRecord(error.response) ? error.response : undefined;
  const headers = response && isRecord(response.headers) ? response.headers : undefined;
  const raw = headers?.["retry-after"] ?? headers?.["Retry-After"];
  const numeric = Number(raw);
  const seconds = Number.isFinite(numeric) && numeric >= 0
    ? numeric * 1_000
    : typeof raw === "string"
      ? Date.parse(raw) - now
      : DEFAULT_RATE_LIMIT_BACKOFF_MS;
  return Math.max(1_000, Math.min(MAX_RATE_LIMIT_BACKOFF_MS, Number.isFinite(seconds) ? seconds : DEFAULT_RATE_LIMIT_BACKOFF_MS));
}

function isRateLimit(error: unknown): boolean {
  return error instanceof RateLimitError || statusOf(error) === 429;
}

function allowedRemoteUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || !hostname) return undefined;
    // Danbooru serves original files from cdn.donmai.us and occasionally
    // returns a danbooru.donmai.us data URL. Restricting to the donmai.us
    // namespace prevents a post response from turning this cache into an
    // arbitrary URL fetcher.
    if (hostname !== "donmai.us" && !hostname.endsWith(".donmai.us")) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function postId(post: DanbooruPost): number | undefined {
  return safePositiveInteger(post.id);
}

function postRating(post: DanbooruPost): "g" | "s" | undefined {
  const rating = text(post.rating).toLowerCase();
  return rating === "g" || rating === "s" ? rating : undefined;
}

function isStaticImage(post: DanbooruPost): boolean {
  if (post.is_deleted === true || post.is_banned === true || post.is_animated === true || post.media_asset?.is_animated === true) return false;
  const extension = text(post.file_ext || post.media_asset?.file_ext).toLowerCase().replace(/^\./, "");
  return !extension || ["jpg", "jpeg", "png", "webp", "avif", "bmp"].includes(extension);
}

function normalizedPostArtists(post: DanbooruPost): string[] {
  const values: string[] = [];
  const artistField = post.tag_string_artist;
  if (typeof artistField === "string") values.push(...artistField.split(/\s+/));
  const tagString = post.tag_string;
  if (typeof tagString === "string") values.push(...tagString.split(/\s+/));
  if (isRecord(post.tags)) {
    const artistTags = post.tags.artist;
    if (Array.isArray(artistTags)) values.push(...artistTags.filter((item): item is string => typeof item === "string"));
  }
  return [...new Set(values.map(normalizeReferenceTag).filter(Boolean))];
}

function postBelongsToTag(post: DanbooruPost, tag: string): boolean {
  return normalizedPostArtists(post).includes(tag);
}

function variants(post: DanbooruPost): DanbooruVariant[] {
  const value = post.media_asset?.variants;
  return Array.isArray(value) ? value.filter(isRecord) as DanbooruVariant[] : [];
}

function variantUrl(post: DanbooruPost, type: string): string | undefined {
  const match = variants(post).find((variant) => text(variant.type).toLowerCase() === type);
  return allowedRemoteUrl(match?.url);
}

function originalImageUrl(post: DanbooruPost): string | undefined {
  // Prefer a non-animated CDN sample that already has at least a 960px edge;
  // this avoids downloading a multi-megapixel original when Danbooru exposes a
  // bounded high-resolution variant. Preview-sized variants are excluded.
  const highResolution = variants(post)
    .filter((variant) => {
      const type = text(variant.type).toLowerCase();
      const width = nonNegativeInteger(variant.width) ?? 0;
      const height = nonNegativeInteger(variant.height) ?? 0;
      return type !== "original" && !type.includes("animated") && Math.max(width, height) >= 960;
    })
    .sort((left, right) => {
      const leftArea = (nonNegativeInteger(left.width) ?? 0) * (nonNegativeInteger(left.height) ?? 0);
      const rightArea = (nonNegativeInteger(right.width) ?? 0) * (nonNegativeInteger(right.height) ?? 0);
      return rightArea - leftArea;
    })
    .map((variant) => allowedRemoteUrl(variant.url))
    .find((url): url is string => Boolean(url));
  // Preview files are intentionally excluded from a persisted reference cover.
  return highResolution
    ?? variantUrl(post, "original")
    ?? allowedRemoteUrl(post.file_url)
    ?? allowedRemoteUrl(post.large_file_url);
}

function thumbnailUrl(post: DanbooruPost): string | undefined {
  return variantUrl(post, "180x180")
    ?? variantUrl(post, "360x360")
    ?? allowedRemoteUrl(post.preview_file_url)
    ?? variantUrl(post, "720x720")
    ?? allowedRemoteUrl(post.large_file_url);
}

function postDimensions(post: DanbooruPost): { width: number; height: number } {
  const width = nonNegativeInteger(post.image_width)
    ?? nonNegativeInteger(post.width)
    ?? nonNegativeInteger(post.media_asset?.image_width)
    ?? nonNegativeInteger(variants(post).find((item) => item.type === "original")?.width)
    ?? 0;
  const height = nonNegativeInteger(post.image_height)
    ?? nonNegativeInteger(post.height)
    ?? nonNegativeInteger(post.media_asset?.image_height)
    ?? nonNegativeInteger(variants(post).find((item) => item.type === "original")?.height)
    ?? 0;
  return { width, height };
}

function postUrl(id: number): string {
  return `https://danbooru.donmai.us/posts/${id}`;
}

function pathWithin(root: string, candidate: string): boolean {
  const base = path.resolve(root);
  const resolved = path.resolve(candidate);
  const relative = path.relative(base, resolved);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function pathWithinReal(root: string, candidate: string): boolean {
  try {
    return pathWithin(fs.realpathSync(root), fs.realpathSync(candidate));
  } catch {
    return false;
  }
}

function exactTagMatches(value: unknown, tag: string): DanbooruTag[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => item as DanbooruTag).filter((item) => {
    const name = text(item.name);
    return Number(item.category) === 1 && Boolean(name) && normalizeReferenceTag(name) === tag;
  });
}

function normalizeRecord(tag: string, value: unknown): ReferenceRecord {
  const raw = isRecord(value) ? value : {};
  const record: ReferenceRecord = { tag };
  const artistId = safePositiveInteger(raw.artistId);
  const artistName = text(raw.artistName);
  const postCount = nonNegativeInteger(raw.postCount);
  const checkedAt = nonNegativeInteger(raw.checkedAt);
  if (artistId !== undefined) record.artistId = artistId;
  if (artistName) record.artistName = artistName.slice(0, MAX_TAG_LENGTH);
  if (postCount !== undefined) record.postCount = postCount;
  if (checkedAt !== undefined) record.checkedAt = checkedAt;
  if (typeof raw.error === "string" && raw.error.trim()) record.error = raw.error.trim().slice(0, 4_096);
  if (isRecord(raw.cover)) {
    const coverRaw = raw.cover;
    const source = coverRaw.source === "local" ? "local" : "danbooru";
    const postIdValue = safePositiveInteger(coverRaw.postId);
    const sourceUrl = source === "local" ? "" : allowedRemoteUrl(coverRaw.sourceUrl) ?? "";
    const sourcePostId = source === "local" ? (Number(coverRaw.postId) === 0 ? 0 : undefined) : postIdValue;
    const width = nonNegativeInteger(coverRaw.width);
    const height = nonNegativeInteger(coverRaw.height);
    const savedAt = nonNegativeInteger(coverRaw.savedAt);
    const filePath = typeof coverRaw.filePath === "string" && path.isAbsolute(coverRaw.filePath) ? coverRaw.filePath : undefined;
    const sourcePostUrl = source === "local" ? "" : postUrl(postIdValue!);
    const sourceValid = source === "local"
      ? sourcePostId === 0 && sourceUrl === ""
      : sourcePostId !== undefined && Boolean(sourceUrl);
    if (sourceValid && width !== undefined && height !== undefined && savedAt !== undefined && filePath) {
      // Reconstruct local URL and attribution from trusted fields after the
      // file path has passed the covers-directory containment check.
      record.cover = { postId: sourcePostId!, source, imageUrl: "", sourceUrl, postUrl: sourcePostUrl, width, height, savedAt, filePath };
    }
  }
  return record;
}

function defaultState(): ReferenceState {
  return { version: STATE_VERSION, records: {}, queue: [], running: false, paused: false };
}

function normalizeState(value: unknown): ReferenceState {
  if (!isRecord(value)) throw new ReferenceError("Artist reference index must be a JSON object.", "invalid-index");
  const raw = value as PersistedState;
  if (raw.version !== STATE_VERSION) throw new ReferenceError("Unsupported artist reference index version.", "invalid-index");
  if (!isRecord(raw.records) || !Array.isArray(raw.queue)) throw new ReferenceError("Artist reference index is missing records or queue.", "invalid-index");
  const state = defaultState();
  for (const [key, value] of Object.entries(raw.records)) {
    const tag = safeTag(key);
    if (!tag || tag.length > MAX_TAG_LENGTH) continue;
    state.records[tag] = normalizeRecord(tag, value);
  }
  const seen = new Set<string>();
  for (const item of raw.queue) {
    if (!isRecord(item)) continue;
    const tag = safeTag(item.tag);
    if (!tag || seen.has(tag)) continue;
    const rawStatus = item.status;
    const status = rawStatus === "done" || rawStatus === "error" || rawStatus === "running" || rawStatus === "pending"
      ? rawStatus
      : "pending";
    const queueItem: ReferenceQueueItem = { tag, status };
    if (typeof item.error === "string" && item.error.trim()) queueItem.error = item.error.trim().slice(0, 4_096);
    state.queue.push(queueItem);
    seen.add(tag);
  }
  state.running = raw.running === true;
  state.paused = raw.paused === true;
  const resumeAt = nonNegativeInteger(raw.resumeAt);
  if (resumeAt !== undefined) state.resumeAt = resumeAt;
  return state;
}

function stateNeedsRestartRepair(state: ReferenceState): boolean {
  return state.running || state.queue.some((item) => item.status === "running" || item.status === "pending");
}

/**
 * Main-process owner of the global artist reference queue and cache.
 *
 * It has no relationship to the AI generation queue. A renderer can refresh,
 * pause, or resume this queue independently, and all state transitions are
 * persisted before network work begins.
 */
export class ArtistReferenceService {
  private readonly rootDir: string;
  private readonly stateFile: string;
  private readonly coversDir: string;
  private readonly request: ReferenceHttpGet;
  private readonly useProxy: boolean;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;
  private readonly localMediaUrl: (filePath: string, revision?: string) => string;
  private state: ReferenceState;
  private worker: Promise<void> | undefined;
  private requestChain: Promise<void> = Promise.resolve();
  private lastRequestAt: number | undefined;
  private readonly candidateCache = new Map<string, DanbooruPost[]>();
  private readonly manualChoices = new Map<string, number>();

  constructor(options: ArtistReferenceServiceOptions | string = {}) {
    const normalizedOptions: ArtistReferenceServiceOptions = typeof options === "string" ? { rootDir: options } : options;
    this.rootDir = normalizedOptions.rootDir
      ?? path.join(normalizedOptions.userDataPath ?? defaultUserDataPath(), REFERENCE_LIBRARY_DIRECTORY);
    this.stateFile = path.join(this.rootDir, REFERENCE_STATE_FILE);
    this.coversDir = path.join(this.rootDir, "covers");
    this.useProxy = !normalizedOptions.request;
    this.request = normalizedOptions.request ?? ((url, config) => axios.get(url, config));
    this.sleep = normalizedOptions.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.now = normalizedOptions.now ?? (() => Date.now());
    this.localMediaUrl = normalizedOptions.toLocalMediaUrl ?? electronLocalMediaUrl;
    this.state = this.readState();
    this.refreshLocalCoverUrls();
    if (stateNeedsRestartRepair(this.state)) {
      for (const item of this.state.queue) {
        if (item.status === "running") {
          item.status = "pending";
          item.error = undefined;
        }
      }
      this.state.running = false;
      this.state.paused = true;
      this.persist();
    }
  }

  /** Root used by the backup adapter and tests. */
  get libraryRoot(): string {
    return this.rootDir;
  }

  /** Index path used by the backup adapter and diagnostics. */
  get libraryStateFile(): string {
    return this.stateFile;
  }

  async action(action: ReferenceAction): Promise<ReferenceResponse> {
    switch (action.type) {
      case "load":
        return { state: this.snapshot() };
      case "start":
        return { state: this.start(action.tags) };
      case "pause":
        return { state: this.pause() };
      case "resume":
        return { state: this.resume() };
      case "retry":
        return { state: this.retry(action.tag) };
      case "refresh":
        return this.refresh(action.tag);
      case "candidates":
        return this.candidates(action.tag);
      case "choose":
        return this.choose(action.tag, action.postId);
      case "bind":
        return this.bind(action.tag, action.artistId);
      case "local-upload":
        // The native file picker is intentionally owned by the Electron
        // adapter.  A renderer must never be able to submit an arbitrary path.
        return { state: this.snapshot(), error: "Local reference upload must use the native file picker." };
      default:
        return { state: this.snapshot() };
    }
  }

  /**
   * Import one image selected by the main-process file picker.  The source
   * path is read once, normalized to the same 960px JPEG preview as remote
   * references, and then copied into the global library.  The original path
   * is never persisted, so moving or deleting the user's source file cannot
   * break the shared library later.
   */
  async importLocalReference(rawTag: unknown, sourcePath: string): Promise<ReferenceResponse> {
    const tag = safeTag(rawTag);
    if (!tag) return { state: this.snapshot(), error: "Artist tag is empty or invalid." };
    try {
      const cover = await this.cacheLocalFile(sourcePath);
      this.manualChoices.set(this.queryTag(tag), 0);
      this.ensureRecord(tag);
      this.propagateCover(tag, cover);
      const queue = this.queueItem(tag);
      if (queue) {
        queue.status = "done";
        queue.error = undefined;
      }
      this.persist();
      return { state: this.snapshot() };
    } catch (error) {
      // Keep an existing remote or local cover intact when the replacement
      // file is unreadable, not an image, too large, or otherwise invalid.
      const message = errorMessage(error);
      const record = this.ensureRecord(tag);
      record.error = message;
      this.persist();
      return { state: this.snapshot(), error: message };
    }
  }

  private snapshot(): ReferenceState {
    return clone(this.state);
  }

  private readState(): ReferenceState {
    if (!fs.existsSync(this.stateFile)) return defaultState();
    try {
      const parsed = JSON.parse(fs.readFileSync(this.stateFile, "utf8")) as unknown;
      return normalizeState(parsed);
    } catch {
      // A corrupt index must stop construction. Resetting it would silently
      // discard the durable queue and make a later save destructive.
      throw new ReferenceError("Artist reference index is corrupt or unreadable.", "invalid-index");
    }
  }

  private refreshLocalCoverUrls(): void {
    let changed = false;
    for (const record of Object.values(this.state.records)) {
      const cover = record.cover;
      if (!cover?.filePath) continue;
      if (!pathWithin(this.coversDir, cover.filePath) || !pathWithinReal(this.coversDir, cover.filePath) || !fs.existsSync(cover.filePath)) {
        // An index may have been copied without its media files. Do not
        // expose a stale remote/private URL as a local cover in that case.
        record.cover = undefined;
        changed = true;
        continue;
      }
      const nextUrl = this.localMediaUrl(cover.filePath, `${cover.postId}-${cover.savedAt}`);
      if (cover.imageUrl !== nextUrl) {
        cover.imageUrl = nextUrl;
        changed = true;
      }
    }
    if (changed) this.persist();
  }

  private persist(): void {
    fs.mkdirSync(this.rootDir, { recursive: true, mode: 0o700 });
    const temporary = `${this.stateFile}.${crypto.randomUUID()}.tmp`;
    try {
      const handle = fs.openSync(temporary, "w", 0o600);
      try {
        fs.writeFileSync(handle, JSON.stringify(this.state));
        fs.fsyncSync(handle);
      } finally {
        fs.closeSync(handle);
      }
      fs.renameSync(temporary, this.stateFile);
    } finally {
      if (fs.existsSync(temporary)) {
        try { fs.unlinkSync(temporary); } catch { /* preserve the committed index */ }
      }
    }
  }

  private ensureRecord(tag: string): ReferenceRecord {
    const existing = this.state.records[tag];
    if (existing) return existing;
    const created: ReferenceRecord = { tag };
    this.state.records[tag] = created;
    return created;
  }

  private queueItem(tag: string): ReferenceQueueItem | undefined {
    return this.state.queue.find((item) => item.tag === tag);
  }

  private queryTag(tag: string): string {
    const mapped = safeTag(this.state.records[tag]?.artistName);
    return mapped || tag;
  }

  private linkedRecords(tag: string): ReferenceRecord[] {
    const canonical = this.queryTag(tag);
    return Object.entries(this.state.records)
      .filter(([key, record]) => (safeTag(record.artistName) || key) === canonical)
      .map(([, record]) => record);
  }

  private copyCover(cover: ReferenceCover): ReferenceCover {
    return { ...cover };
  }

  private propagateCover(tag: string, cover: ReferenceCover): void {
    for (const record of this.linkedRecords(tag)) {
      record.cover = this.copyCover(cover);
      record.error = undefined;
    }
    for (const item of this.state.queue) {
      if (this.queryTag(item.tag) === this.queryTag(tag)) {
        item.status = "done";
        item.error = undefined;
      }
    }
  }

  private propagateMetadata(tag: string, match: { name: string; postCount: number; checkedAt: number }): void {
    for (const record of this.linkedRecords(tag)) {
      record.artistName = match.name;
      record.postCount = match.postCount;
      record.checkedAt = match.checkedAt;
      record.error = undefined;
    }
  }

  private hasCachedReference(tag: string): boolean {
    return this.linkedRecords(tag).some((record) => {
      const cover = record.cover;
      return Boolean(cover?.filePath && pathWithin(this.coversDir, cover.filePath) && pathWithinReal(this.coversDir, cover.filePath) && fs.existsSync(cover.filePath));
    });
  }

  private start(rawTags: unknown): ReferenceState {
    if (this.state.resumeAt !== undefined && this.state.resumeAt > this.now()) return this.snapshot();
    for (const tag of uniqueTags(rawTags)) {
      if (this.hasCachedReference(tag)) {
        const cached = this.linkedRecords(tag).find(record => record.cover?.filePath && pathWithinReal(this.coversDir, record.cover.filePath) && fs.existsSync(record.cover.filePath));
        if (cached) {
          const record = this.ensureRecord(tag);
          record.artistName = cached.artistName ?? cached.tag;
          record.cover = this.copyCover(cached.cover!);
          record.postCount = cached.postCount;
          record.checkedAt = cached.checkedAt;
          record.error = undefined;
        }
        continue;
      }
      const existing = this.queueItem(tag);
      if (!existing) {
        this.state.queue.push({ tag, status: "pending" });
      } else if ((existing.status === "done" || existing.status === "error") && !this.hasCachedReference(tag)) {
        existing.status = "pending";
        existing.error = undefined;
      }
    }
    this.state.paused = false;
    this.state.resumeAt = undefined;
    this.persist();
    this.kickWorker();
    return this.snapshot();
  }

  private pause(): ReferenceState {
    this.state.paused = true;
    this.state.running = false;
    const active = this.state.queue.find((item) => item.status === "running");
    if (active) {
      active.status = "pending";
      active.error = undefined;
    }
    this.persist();
    return this.snapshot();
  }

  private resume(): ReferenceState {
    if (this.state.resumeAt !== undefined && this.state.resumeAt > this.now()) return this.snapshot();
    this.state.paused = false;
    this.state.resumeAt = undefined;
    this.persist();
    this.kickWorker();
    return this.snapshot();
  }

  private retry(rawTag?: unknown): ReferenceState {
    if (this.state.resumeAt !== undefined && this.state.resumeAt > this.now()) return this.snapshot();
    const requested = rawTag === undefined ? undefined : safeTag(rawTag);
    const targets = requested
      ? [requested]
      : this.state.queue.filter((item) => item.status === "error").map((item) => item.tag);
    for (const tag of uniqueTags(targets)) {
      const item = this.queueItem(tag);
      if (!item) {
        this.state.queue.push({ tag, status: "pending" });
      } else if (item.status === "error" || requested) {
        item.status = "pending";
        item.error = undefined;
      }
      const record = this.state.records[tag];
      if (record) record.error = undefined;
    }
    this.state.paused = false;
    this.state.resumeAt = undefined;
    this.persist();
    this.kickWorker();
    return this.snapshot();
  }

  private async refresh(rawTag: unknown): Promise<ReferenceResponse> {
    const tag = safeTag(rawTag);
    if (!tag) return { state: this.snapshot(), error: "Artist tag is empty or invalid." };
    try {
      const match = await this.lookupExactTag(this.queryTag(tag));
      this.ensureRecord(tag);
      this.propagateMetadata(tag, { ...match, checkedAt: this.now() });
      this.persist();
      return { state: this.snapshot() };
    } catch (error) {
      const message = errorMessage(error);
      const record = this.ensureRecord(tag);
      record.error = message;
      this.persist();
      return { state: this.snapshot(), error: message };
    }
  }

  private async candidates(rawTag: unknown): Promise<ReferenceResponse> {
    const tag = safeTag(rawTag);
    if (!tag) return { state: this.snapshot(), candidates: [], error: "Artist tag is empty or invalid." };
    try {
      const queryTag = this.queryTag(tag);
      const match = await this.lookupExactTag(queryTag);
      this.ensureRecord(tag);
      this.propagateMetadata(tag, { ...match, checkedAt: this.now() });
      const posts = await this.fetchSafePosts(queryTag, MAX_CANDIDATES);
      this.candidateCache.set(tag, posts);
      const result = posts.slice(0, MAX_CANDIDATES).flatMap((post): ReferenceCandidate[] => {
        const id = postId(post);
        const rating = postRating(post);
        const imageUrl = thumbnailUrl(post);
        if (id === undefined || !rating || !imageUrl || !postBelongsToTag(post, queryTag)) return [];
        const dimensions = postDimensions(post);
        const candidate: ReferenceCandidate = {
          postId: id,
          postUrl: postUrl(id),
          imageUrl,
          width: dimensions.width,
          height: dimensions.height,
          rating,
        };
        const createdAt = text(post.created_at);
        const score = Number(post.score);
        if (createdAt) candidate.createdAt = createdAt;
        if (Number.isFinite(score)) candidate.score = score;
        return [candidate];
      });
      this.persist();
      return { state: this.snapshot(), candidates: result };
    } catch (error) {
      const message = errorMessage(error);
      const record = this.ensureRecord(tag);
      record.error = message;
      this.persist();
      return { state: this.snapshot(), candidates: [], error: message };
    }
  }

  private async choose(rawTag: unknown, rawPostId: unknown): Promise<ReferenceResponse> {
    const tag = safeTag(rawTag);
    const id = safePositiveInteger(rawPostId);
    if (!tag || id === undefined) return { state: this.snapshot(), error: "Artist tag or post ID is invalid." };
    try {
      const post = await this.fetchPostById(id);
      if (!postBelongsToTag(post, this.queryTag(tag))) throw new ReferenceError(`Post ${id} does not belong to artist tag ${tag}.`, "post-mismatch");
      this.manualChoices.set(this.queryTag(tag), id);
      const cover = await this.cachePost(tag, post);
      this.ensureRecord(tag);
      this.propagateCover(tag, cover);
      const queue = this.queueItem(tag);
      if (queue) {
        queue.status = "done";
        queue.error = undefined;
      }
      this.persist();
      return { state: this.snapshot() };
    } catch (error) {
      const message = errorMessage(error);
      const record = this.ensureRecord(tag);
      record.error = message;
      this.persist();
      return { state: this.snapshot(), error: message };
    }
  }

  private async bind(rawTag: unknown, rawArtistId: unknown): Promise<ReferenceResponse> {
    const tag = safeTag(rawTag);
    const artistId = safePositiveInteger(rawArtistId);
    if (!tag || artistId === undefined) return { state: this.snapshot(), error: "Artist tag or artist ID is invalid." };
    if (this.worker && this.state.queue.some((item) => item.tag === tag && (item.status === "pending" || item.status === "running"))) {
      return { state: this.snapshot(), error: "Pause the reference queue before changing its artist binding." };
    }
    try {
      const response = await this.get<DanbooruArtist>(`${DANBOORU_ARTISTS_URL}/${artistId}.json`, {
        timeout: REQUEST_TIMEOUT_MS,
        maxContentLength: MAX_JSON_BYTES,
        headers: this.jsonHeaders(),
      });
      const name = text(response?.name);
      if (!name) throw new ReferenceError(`Artist ID ${artistId} has no usable name.`, "artist-invalid");
      const record = this.ensureRecord(tag);
      const previousCanonical = this.queryTag(tag);
      record.artistId = artistId;
      record.artistName = name;
      record.error = undefined;
      const canonical = normalizeReferenceTag(name);
      const canonicalRecord = this.linkedRecords(tag).find(candidate => candidate !== record && candidate.cover) ?? this.state.records[canonical];
      if (previousCanonical !== canonical) {
        // Rebinding changes the identity represented by this raw renderer
        // tag. Keep the old JPEG on disk for backup/history, but do not show
        // it as the new artist's cover or carry its count across identities.
        record.cover = undefined;
        record.postCount = undefined;
        record.checkedAt = undefined;
        this.manualChoices.delete(tag);
        this.candidateCache.delete(tag);
      }
      if (canonicalRecord !== record && canonicalRecord?.cover && !record.cover) record.cover = this.copyCover(canonicalRecord.cover);
      if (canonicalRecord !== record && canonicalRecord?.postCount !== undefined && record.postCount === undefined) record.postCount = canonicalRecord.postCount;
      if (canonicalRecord !== record && canonicalRecord?.checkedAt !== undefined && record.checkedAt === undefined) record.checkedAt = canonicalRecord.checkedAt;
      this.persist();
      return { state: this.snapshot() };
    } catch (error) {
      const message = errorMessage(error);
      const record = this.ensureRecord(tag);
      record.error = message;
      this.persist();
      return { state: this.snapshot(), error: message };
    }
  }

  private kickWorker(): void {
    if (this.worker || this.state.paused || !this.state.queue.some((item) => item.status === "pending")) return;
    this.state.running = true;
    this.persist();
    this.worker = this.runQueue()
      .catch((error) => {
        this.state.running = false;
        this.state.paused = true;
        const message = errorMessage(error);
        const active = this.state.queue.find((item) => item.status === "running");
        if (active) {
          active.status = "error";
          active.error = message;
          this.ensureRecord(active.tag).error = message;
        }
        try { this.persist(); } catch { /* the original disk error is terminal for this worker */ }
      })
      .finally(() => {
        this.worker = undefined;
      });
  }

  private async runQueue(): Promise<void> {
    try {
      while (!this.state.paused) {
        const item = this.state.queue.find((candidate) => candidate.status === "pending");
        if (!item) break;
        item.status = "running";
        item.error = undefined;
        this.state.running = true;
        this.persist();
        try {
          await this.populateReference(item.tag);
          item.status = "done";
          item.error = undefined;
          this.persist();
        } catch (error) {
          // A manual local selection can finish while an older network call
          // is in flight. Its subsequent failure must not undo that success.
          if (this.state.records[item.tag]?.cover?.source === "local" && this.hasCachedReference(item.tag)) {
            item.status = "done";
            item.error = undefined;
            this.ensureRecord(item.tag).error = undefined;
            this.persist();
            continue;
          }
          if (isRateLimit(error)) {
            const resumeAt = error instanceof RateLimitError ? error.resumeAt : this.now() + DEFAULT_RATE_LIMIT_BACKOFF_MS;
            item.status = "pending";
            item.error = errorMessage(error);
            this.state.paused = true;
            this.state.running = false;
            this.state.resumeAt = resumeAt;
            this.persist();
            return;
          }
          if (this.state.paused) {
            item.status = "pending";
            item.error = undefined;
            this.state.running = false;
            this.persist();
            return;
          }
          if (error instanceof QueuePausedError) {
            item.status = "pending";
            item.error = undefined;
            this.state.running = false;
            this.persist();
            return;
          }
          const message = errorMessage(error);
          item.status = "error";
          item.error = message;
          this.ensureRecord(item.tag).error = message;
          this.persist();
          // A missing or ambiguous tag must not prevent unrelated queue items
          // from making progress.
        }
      }
    } finally {
      this.state.running = false;
      this.persist();
    }
  }

  private async populateReference(tag: string): Promise<void> {
    this.ensureRecord(tag);
    const queryTag = this.queryTag(tag);
    const match = await this.lookupExactTag(queryTag);
    if (this.state.paused) throw new QueuePausedError();
    this.propagateMetadata(tag, { ...match, checkedAt: this.now() });
    this.persist();

    const posts = await this.fetchSafePosts(queryTag, MAX_CANDIDATES);
    if (this.state.paused) throw new QueuePausedError();
    this.candidateCache.set(tag, posts);
    let lastError: unknown = undefined;
    for (const post of posts) {
      if (this.state.paused) throw new QueuePausedError();
      try {
        if (!postBelongsToTag(post, queryTag)) continue;
        const cover = await this.cachePost(tag, post);
        const manualPostId = this.manualChoices.get(this.queryTag(tag));
        if (manualPostId !== undefined && manualPostId !== cover.postId) return;
        this.propagateCover(tag, cover);
        this.persist();
        return;
      } catch (error) {
        if (isRateLimit(error)) throw error;
        if (this.state.paused) throw new QueuePausedError();
        lastError = error;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new ReferenceError(`No accessible general or sensitive posts found for ${tag}.`, "posts-unavailable");
  }

  private jsonHeaders(): Record<string, string> {
    return { Accept: "application/json", "User-Agent": USER_AGENT };
  }

  private imageHeaders(): Record<string, string> {
    return {
      Accept: "image/*",
      Referer: "https://danbooru.donmai.us/",
      "User-Agent": USER_AGENT,
    };
  }

  private async get<T>(url: string, config: AxiosRequestConfig = {}): Promise<T> {
    const operation = this.requestChain.then(async () => {
      if (this.state.resumeAt !== undefined && this.state.resumeAt > this.now()) {
        throw new RateLimitError(this.state.resumeAt);
      }
      const sinceLast = this.lastRequestAt === undefined ? 0 : this.now() - this.lastRequestAt;
      if (sinceLast < MIN_REQUEST_INTERVAL_MS) await this.sleep(MIN_REQUEST_INTERVAL_MS - Math.max(0, sinceLast));
      const startedAt = this.now();
      try {
        const response = await this.request<T>(url, {
          ...config,
          maxRedirects: config.maxRedirects ?? 0,
          ...(this.useProxy ? proxyConfig("update") : {}),
        });
        this.lastRequestAt = Math.max(startedAt, this.now());
        const status = Number(response?.status);
        if (status === 429) {
          const wait = retryAfterMilliseconds({ response }, this.now());
          throw new RateLimitError(this.now() + wait);
        }
        if (status >= 400) throw new ReferenceError(`Danbooru request failed (${status}).`, `http-${status}`);
        return response.data;
      } catch (error) {
        this.lastRequestAt = Math.max(startedAt, this.now());
        if (isRateLimit(error)) {
          const wait = error instanceof RateLimitError ? error.resumeAt - this.now() : retryAfterMilliseconds(error, this.now());
          throw new RateLimitError(this.now() + Math.max(1_000, wait));
        }
        throw error;
      }
    });
    this.requestChain = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private async lookupExactTag(tag: string): Promise<{ id: number; name: string; postCount: number }> {
    const data = await this.get<DanbooruTag[]>(DANBOORU_TAGS_URL, {
      timeout: REQUEST_TIMEOUT_MS,
      maxContentLength: MAX_JSON_BYTES,
      params: {
        limit: 20,
        "search[name_matches]": tag,
        "search[category]": 1,
      },
      headers: this.jsonHeaders(),
    });
    const matches = exactTagMatches(data, tag);
    if (matches.length === 0) throw new ReferenceError(`No exact category-1 Danbooru artist tag found for ${tag}.`, "tag-unavailable");
    if (matches.length > 1) throw new ReferenceError(`Ambiguous category-1 Danbooru artist tag: ${tag}.`, "tag-ambiguous");
    const match = matches[0];
    const id = safePositiveInteger(match.id);
    const name = text(match.name);
    if (id === undefined || !name) throw new ReferenceError(`Danbooru artist tag ${tag} has incomplete metadata.`, "tag-invalid");
    const postCount = nonNegativeInteger(match.post_count ?? match.postCount);
    if (postCount === undefined) throw new ReferenceError(`Danbooru artist tag ${tag} has no valid post count.`, "tag-invalid");
    return { id, name, postCount };
  }

  private async fetchSafePosts(tag: string, limit: number): Promise<DanbooruPost[]> {
    const boundedLimit = Math.max(1, Math.min(MAX_CANDIDATES, Math.floor(limit)));
    const queryLimit = MAX_POST_QUERY;
    const data = await this.get<DanbooruPost[]>(DANBOORU_POSTS_URL, {
      timeout: REQUEST_TIMEOUT_MS,
      maxContentLength: MAX_JSON_BYTES,
      params: {
        limit: queryLimit,
        // Danbooru's default post ordering is newest first. `order:id` is an
        // ascending legacy spelling on some deployments and would select an
        // old work before the local descending sort can run.
        tags: `${tag} rating:g`,
      },
      headers: this.jsonHeaders(),
    });
    const posts = this.safePostList(data, tag);
    // Inspect a wider window, then return a bounded list of usable works.
    if (posts.length > 0) return posts.slice(0, boundedLimit);

    // Sensitive posts are allowed as a second safe static rating. There is no
    // unfiltered or explicit-content fallback when general posts are absent.
    const sensitive = await this.get<DanbooruPost[]>(DANBOORU_POSTS_URL, {
      timeout: REQUEST_TIMEOUT_MS,
      maxContentLength: MAX_JSON_BYTES,
      params: {
        limit: queryLimit,
        tags: `${tag} rating:s`,
      },
      headers: this.jsonHeaders(),
    });
    return this.safePostList(sensitive, tag).slice(0, boundedLimit);
  }

  private safePostList(data: unknown, tag: string): DanbooruPost[] {
    if (!Array.isArray(data)) throw new ReferenceError("Danbooru posts response was invalid.", "invalid-response");
    const seen = new Set<number>();
    return data
      .filter(isRecord)
      .map((post) => post as DanbooruPost)
      .filter((post) => {
        const id = postId(post);
        const rating = postRating(post);
        if (id === undefined || !rating || !isStaticImage(post) || seen.has(id) || !postBelongsToTag(post, tag)) return false;
        seen.add(id);
        return true;
      })
      .sort((left, right) => (postId(right) ?? 0) - (postId(left) ?? 0));
  }

  private async fetchPostById(id: number): Promise<DanbooruPost> {
    const cached = [...this.candidateCache.values()].flat().find((post) => postId(post) === id);
    // Candidate metadata is safe to display but may not include an original
    // URL. Resolve the canonical post endpoint before choosing it.
    const data = await this.get<DanbooruPost>(`${DANBOORU_POST_DETAIL_URL}/${id}.json`, {
      timeout: REQUEST_TIMEOUT_MS,
      maxContentLength: MAX_JSON_BYTES,
      headers: this.jsonHeaders(),
    });
    const post = isRecord(data) ? data as DanbooruPost : cached;
    if (!post || postId(post) !== id || !postRating(post)) throw new ReferenceError(`Danbooru post ${id} was unavailable.`, "post-unavailable");
    return post;
  }

  private async cachePost(tag: string, post: DanbooruPost): Promise<ReferenceCover> {
    const id = postId(post);
    const rating = postRating(post);
    if (id === undefined || !rating || !isStaticImage(post)) throw new ReferenceError("Selected post is not a safe static work.", "post-rating");
    const sourceUrl = originalImageUrl(post);
    if (!sourceUrl) throw new ReferenceError(`Post ${id} has no allowed original Danbooru/CDN URL.`, "image-unavailable");
    fs.mkdirSync(this.coversDir, { recursive: true, mode: 0o700 });
    const key = crypto.createHash("sha256").update(`${id}\n${sourceUrl}`).digest("hex");
    const filePath = path.join(this.coversDir, `${key}.jpg`);
    if (fs.existsSync(filePath)) {
      const metadata = await sharp(filePath).metadata();
      const stat = fs.statSync(filePath);
      if (metadata.width && metadata.height && stat.isFile() && stat.size <= MAX_IMAGE_BYTES) {
        return {
          postId: id,
          source: "danbooru",
          imageUrl: this.localMediaUrl(filePath, `${id}-${stat.size}`),
          sourceUrl,
          postUrl: postUrl(id),
          width: metadata.width,
          height: metadata.height,
          savedAt: this.now(),
          filePath,
        };
      }
    }
    const imageResponse = await this.get<ArrayBuffer | Buffer>(sourceUrl, {
      responseType: "arraybuffer",
      timeout: IMAGE_TIMEOUT_MS,
      maxContentLength: MAX_IMAGE_BYTES,
      maxBodyLength: MAX_IMAGE_BYTES,
      headers: this.imageHeaders(),
    });
    const raw = Buffer.isBuffer(imageResponse) ? imageResponse : Buffer.from(imageResponse);
    if (raw.length < 128 || raw.length > MAX_IMAGE_BYTES) throw new ReferenceError("Reference image exceeded the download limit.", "image-too-large");
    const processed = await sharp(raw, { limitInputPixels: 40_000_000 })
      .rotate()
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .resize({ width: 960, height: 960, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    if (processed.data.length > MAX_IMAGE_BYTES) throw new ReferenceError("Processed reference image exceeded the size limit.", "image-too-large");
    this.writeBufferAtomic(filePath, processed.data);
    const postDimensionsFromImage = { width: processed.info.width, height: processed.info.height };
    return {
      postId: id,
      source: "danbooru",
      imageUrl: this.localMediaUrl(filePath, `${id}-${processed.data.length}`),
      sourceUrl,
      postUrl: postUrl(id),
      width: postDimensionsFromImage.width,
      height: postDimensionsFromImage.height,
      savedAt: this.now(),
      filePath,
    };
  }

  private async cacheLocalFile(sourcePath: string): Promise<ReferenceCover> {
    if (typeof sourcePath !== "string" || !sourcePath.trim() || !path.isAbsolute(sourcePath)) {
      throw new ReferenceError("本地原作文件路径无效。", "local-file-invalid");
    }
    const resolved = fs.realpathSync(sourcePath);
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) throw new ReferenceError("本地原作必须是图片文件。", "local-file-invalid");
    if (stat.size <= 0 || stat.size > MAX_LOCAL_SOURCE_BYTES) {
      throw new ReferenceError("本地原作文件过大（上限 128 MiB）。", "local-file-too-large");
    }
    let processed: { data: Buffer; info: sharp.OutputInfo };
    try {
      processed = await sharp(fs.readFileSync(resolved), { limitInputPixels: 40_000_000 })
        .rotate()
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .resize({ width: 960, height: 960, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new ReferenceError("本地原作无法读取或不是受支持的图片。", "local-image-invalid");
    }
    if (!processed.data || processed.data.length < 128 || processed.data.length > MAX_IMAGE_BYTES) {
      throw new ReferenceError("处理后的本地原作超出大小限制。", "image-too-large");
    }
    fs.mkdirSync(this.coversDir, { recursive: true, mode: 0o700 });
    const key = crypto.createHash("sha256").update(processed.data).digest("hex");
    const filePath = path.join(this.coversDir, `local-${key}.jpg`);
    if (!fs.existsSync(filePath)) this.writeBufferAtomic(filePath, processed.data);
    return {
      postId: 0,
      source: "local",
      imageUrl: this.localMediaUrl(filePath, `${key}-${processed.data.length}`),
      sourceUrl: "",
      postUrl: "",
      width: processed.info.width,
      height: processed.info.height,
      savedAt: this.now(),
      filePath,
    };
  }

  private writeBufferAtomic(filePath: string, data: Buffer): void {
    const temporary = `${filePath}.${crypto.randomUUID()}.tmp`;
    try {
      const handle = fs.openSync(temporary, "w", 0o600);
      try {
        fs.writeFileSync(handle, data);
        fs.fsyncSync(handle);
      } finally {
        fs.closeSync(handle);
      }
      fs.renameSync(temporary, filePath);
    } finally {
      if (fs.existsSync(temporary)) {
        try { fs.unlinkSync(temporary); } catch { /* preserve old cover if cleanup fails */ }
      }
    }
  }
}
