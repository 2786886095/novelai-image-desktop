import fs from "fs";
import path from "path";
import type { MetadataSnapshotPayload, MetadataSnapshotResult } from "../../src/types";

const MAX_SNAPSHOT_BYTES = 100 * 1024 * 1024;

// Metadata inspection is intentionally session-scoped. Keeping the selected
// image in process memory lets users move between app pages without losing it,
// while a full app restart always opens the inspector in its initial state.
let activeSnapshot: MetadataSnapshotPayload | null = null;

function inferMime(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function retainSnapshot(
  meta: Omit<MetadataSnapshotPayload, "base64">,
  bytes: Buffer,
): MetadataSnapshotResult {
  if (!bytes.length || bytes.length > MAX_SNAPSHOT_BYTES) {
    return { ok: false, message: "Metadata snapshot image is empty or too large." };
  }
  activeSnapshot = {
    name: path.basename(meta.name || "metadata-image.png"),
    type: meta.type || "application/octet-stream",
    lastModified: Number.isFinite(meta.lastModified) ? meta.lastModified : Date.now(),
    base64: bytes.toString("base64"),
  };
  return { ok: true };
}

export async function saveMetadataSnapshotFile(
  _userDataDir: string,
  payload: MetadataSnapshotPayload,
): Promise<MetadataSnapshotResult> {
  try {
    return retainSnapshot(payload, Buffer.from(payload.base64, "base64"));
  } catch (error: any) {
    return { ok: false, message: error?.message ?? String(error) };
  }
}

export async function saveMetadataSnapshotFromPath(
  _userDataDir: string,
  sourcePath: string,
): Promise<MetadataSnapshotResult> {
  try {
    const resolved = path.resolve(sourcePath);
    const stat = await fs.promises.stat(resolved);
    if (!stat.isFile()) return { ok: false, message: "Image path is not a file." };
    const bytes = await fs.promises.readFile(resolved);
    return retainSnapshot({
      name: path.basename(resolved),
      type: inferMime(resolved),
      lastModified: stat.mtimeMs,
    }, bytes);
  } catch (error: any) {
    return { ok: false, message: error?.message ?? String(error) };
  }
}

export async function loadMetadataSnapshotFile(_userDataDir: string): Promise<MetadataSnapshotResult> {
  return activeSnapshot
    ? { ok: true, snapshot: { ...activeSnapshot } }
    : { ok: true };
}
