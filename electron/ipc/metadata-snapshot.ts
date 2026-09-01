import fs from "fs";
import path from "path";
import type { MetadataSnapshotPayload, MetadataSnapshotResult } from "../../src/types";

const MAX_SNAPSHOT_BYTES = 100 * 1024 * 1024;

// Metadata inspection is intentionally session-scoped. Keeping the selected
// image in process memory lets users move between app pages without losing it,
// while a full app restart always opens the inspector in its initial state.
let activeSnapshot: MetadataSnapshotPayload | null = null;
let activeSnapshotRequestRevision = 0;

function inferMime(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function createSnapshot(
  meta: Omit<MetadataSnapshotPayload, "base64">,
  bytes: Buffer,
): MetadataSnapshotResult {
  if (!bytes.length || bytes.length > MAX_SNAPSHOT_BYTES) {
    return { ok: false, message: "Metadata snapshot image is empty or too large." };
  }
  const snapshot: MetadataSnapshotPayload = {
    name: path.basename(meta.name || "metadata-image.png"),
    type: meta.type || "application/octet-stream",
    lastModified: Number.isFinite(meta.lastModified) ? meta.lastModified : Date.now(),
    base64: bytes.toString("base64"),
  };
  return { ok: true, snapshot };
}

function retainSnapshot(
  result: MetadataSnapshotResult,
  requestRevision: number,
  includeSnapshot = false,
): MetadataSnapshotResult {
  if (!result.ok || !result.snapshot) return result;
  // A slower, older disk read must never overwrite a selection that was made
  // later. IPC handlers may overlap while large history images are read.
  if (requestRevision === activeSnapshotRequestRevision) {
    activeSnapshot = { ...result.snapshot };
  }
  if (includeSnapshot) return { ok: true, snapshot: { ...result.snapshot } };
  // Saving is an acknowledgement-only operation. Avoid echoing a potentially
  // large base64 image back over IPC when the caller only needs to navigate.
  return { ok: true };
}

async function snapshotFromPath(sourcePath: string): Promise<MetadataSnapshotResult> {
  const resolved = path.resolve(sourcePath);
  const stat = await fs.promises.stat(resolved);
  if (!stat.isFile()) return { ok: false, message: "Image path is not a file." };
  const bytes = await fs.promises.readFile(resolved);
  return createSnapshot({
    name: path.basename(resolved),
    type: inferMime(resolved),
    lastModified: stat.mtimeMs,
  }, bytes);
}

export async function saveMetadataSnapshotFile(
  _userDataDir: string,
  payload: MetadataSnapshotPayload,
): Promise<MetadataSnapshotResult> {
  const requestRevision = ++activeSnapshotRequestRevision;
  try {
    return retainSnapshot(
      createSnapshot(payload, Buffer.from(payload.base64, "base64")),
      requestRevision,
    );
  } catch (error: any) {
    return { ok: false, message: error?.message ?? String(error) };
  }
}

export async function saveMetadataSnapshotFromPath(
  _userDataDir: string,
  sourcePath: string,
): Promise<MetadataSnapshotResult> {
  const requestRevision = ++activeSnapshotRequestRevision;
  try {
    return retainSnapshot(await snapshotFromPath(sourcePath), requestRevision);
  } catch (error: any) {
    return { ok: false, message: error?.message ?? String(error) };
  }
}

/**
 * Atomically reads one history image and returns that exact payload to the
 * renderer. This avoids the former save-then-load race through the shared
 * active snapshot when users click history entries quickly.
 */
export async function readMetadataSnapshotFromPath(
  _userDataDir: string,
  sourcePath: string,
): Promise<MetadataSnapshotResult> {
  const requestRevision = ++activeSnapshotRequestRevision;
  try {
    const result = await snapshotFromPath(sourcePath);
    return retainSnapshot(result, requestRevision, true);
  } catch (error: any) {
    return { ok: false, message: error?.message ?? String(error) };
  }
}

export async function loadMetadataSnapshotFile(_userDataDir: string): Promise<MetadataSnapshotResult> {
  return activeSnapshot
    ? { ok: true, snapshot: { ...activeSnapshot } }
    : { ok: true };
}
