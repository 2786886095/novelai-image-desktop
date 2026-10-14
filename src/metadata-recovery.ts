import { MAX_METADATA_IMAGE_BYTES } from "./image-metadata-pixels";
import { MAX_METADATA_BYTES } from "./png-metadata-codecs";
import { parseImageMetaAsync } from "./png-meta";
import { OFFICIAL_METADATA_ORIGINAL, originalOfficialMetadata } from "../shared/official-metadata-result";

export type MetadataRecoveryMode = "online" | "offline";
export const DEFAULT_METADATA_RECOVERY_MODE: MetadataRecoveryMode = "online";
export const METADATA_RECOVERY_STORAGE_KEY = "langbai.metadata-recovery-mode.v1";

function browserStorage(): Storage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}

/** A saved explicit choice wins; new users and invalid/unavailable storage use online. */
export function loadMetadataRecoveryMode(storage: Pick<Storage, "getItem"> | undefined = browserStorage()): MetadataRecoveryMode {
  try {
    const saved = storage?.getItem(METADATA_RECOVERY_STORAGE_KEY);
    return saved === "online" || saved === "offline" ? saved : DEFAULT_METADATA_RECOVERY_MODE;
  } catch { return DEFAULT_METADATA_RECOVERY_MODE; }
}

/** Storage failure does not prevent changing the mode for the current session. */
export function saveMetadataRecoveryMode(mode: MetadataRecoveryMode, storage: Pick<Storage, "setItem"> | undefined = browserStorage()): boolean {
  if (mode !== "online" && mode !== "offline") return false;
  try {
    if (!storage) return false;
    storage.setItem(METADATA_RECOVERY_STORAGE_KEY, mode);
    return true;
  } catch { return false; }
}

function boundedMetadata(value: Record<string, string>): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid metadata reader result");
  const result: Record<string, string> = Object.create(null);
  const encoder = new TextEncoder();
  let size = 0;
  for (const [key, text] of Object.entries(value)) {
    if (typeof text !== "string") throw new Error("Invalid metadata reader field");
    size += encoder.encode(key).byteLength + encoder.encode(text).byteLength;
    if (size > MAX_METADATA_BYTES) throw new Error("Image metadata exceeds the 8 MiB safety limit");
    result[key] = text;
  }
  const original = originalOfficialMetadata(value);
  if (original) {
    if (encoder.encode(JSON.stringify(original)).byteLength > MAX_METADATA_BYTES) throw new Error("Original metadata exceeds the 8 MiB safety limit");
    Object.defineProperty(result, OFFICIAL_METADATA_ORIGINAL, { value: original, enumerable: false });
  }
  return result;
}

/** Only online mode loads the official reader. Image bytes never enter a network request. */
export async function readImageMetadataForRecovery(buffer: ArrayBuffer, mode: MetadataRecoveryMode = DEFAULT_METADATA_RECOVERY_MODE, signal?: AbortSignal): Promise<Record<string, string>> {
  signal?.throwIfAborted();
  if (buffer.byteLength > MAX_METADATA_IMAGE_BYTES) throw new Error("Image exceeds the 64 MiB safety limit");
  if (mode === "offline") return boundedMetadata(await parseImageMetaAsync(buffer));
  if (mode !== "online") throw new Error("Unknown metadata recovery mode");
  const { parseOfficialImageMetadataOnline } = await import("./official-metadata-online");
  signal?.throwIfAborted();
  // Do not disguise a failed official load as a successful online recovery.
  return boundedMetadata(await parseOfficialImageMetadataOnline(buffer, signal));
}
