/**
 * Wire types for the global Danbooru artist reference library.
 *
 * The reference library is keyed by the same exact artist identity used by
 * comparison entries, but uses underscores so it can also be used directly
 * in Danbooru tag queries and on disk.  These types intentionally contain no
 * Electron or renderer dependencies; both sides can use them safely.
 */

export type ReferenceQueueStatus = "pending" | "running" | "done" | "error";

export interface ReferenceQueueItem {
  tag: string;
  status: ReferenceQueueStatus;
  error?: string;
}

export interface ReferenceCover {
  /** 0 for a user-provided local image; otherwise the Danbooru post ID. */
  postId: number;
  /** The source kind is explicit so a local image can never be presented as a Danbooru post. */
  source?: "danbooru" | "local";
  /** A nai-local URL exposed by the main process. */
  imageUrl: string;
  /** The original Danbooru/CDN URL used to download this cover. */
  sourceUrl: string;
  /** Human-readable source attribution page. */
  postUrl: string;
  width: number;
  height: number;
  savedAt: number;
  /** Main-process-only persistence detail; omitted by UI adapters when needed. */
  filePath?: string;
}

export interface ReferenceRecord {
  /** The normalized global key. */
  tag: string;
  artistId?: number;
  artistName?: string;
  /** Danbooru's indexed post_count for the exact category-1 tag. */
  postCount?: number;
  checkedAt?: number;
  cover?: ReferenceCover;
  error?: string;
}

export interface ReferenceState {
  version: 1;
  records: Record<string, ReferenceRecord>;
  queue: ReferenceQueueItem[];
  /** True while the background reference queue is processing a tag. */
  running: boolean;
  /** True when processing is intentionally paused (including rate limits). */
  paused: boolean;
  /** Earliest safe time to resume after a Danbooru 429, when applicable. */
  resumeAt?: number;
}

export interface ReferenceCandidate {
  postId: number;
  postUrl: string;
  /** A safe remote thumbnail URL. Candidates are not bulk downloaded. */
  imageUrl: string;
  width: number;
  height: number;
  rating: "g" | "s";
  createdAt?: string;
  score?: number;
}

export interface ReferenceResponse {
  state: ReferenceState;
  candidates?: ReferenceCandidate[];
  error?: string;
}

export type ReferenceAction =
  | { type: "load" }
  | { type: "start"; tags: string[] }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "retry"; tag?: string }
  | { type: "refresh"; tag: string }
  | { type: "candidates"; tag: string }
  | { type: "choose"; tag: string; postId: number }
  | { type: "bind"; tag: string; artistId: number }
  /** Opens the native main-process file picker; the renderer never supplies a path. */
  | { type: "local-upload"; tag: string };

/**
 * Return the exact global artist key accepted by the renderer and backend.
 *
 * Artist prompts may contain the optional `artist:` prefix, escaped
 * parentheses (a legacy prompt spelling), spaces, or underscores.  The
 * comparison model treats spaces and underscores as equivalent, so the
 * library stores one lower-case underscore form for every equivalent input.
 */
export function normalizeReferenceTag(value: unknown): string {
  if (typeof value !== "string") return "";
  const withoutPrefix = value
    .normalize("NFKC")
    .trim()
    .replace(/^artist\s*:\s*/i, "")
    .replace(/\\([()])/g, "$1")
    .trim()
    .toLocaleLowerCase();
  return withoutPrefix.replace(/[\s_]+/g, "_");
}
