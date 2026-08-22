import fs from "fs";
import path from "path";
import type { MetadataSnapshotPayload, MetadataSnapshotResult } from "../../src/types";

const MAX_SNAPSHOT_BYTES = 100 * 1024 * 1024;
const SNAPSHOT_DIR = "metadata-inspector";
const IMAGE_FILE = "last-image.bin";
const META_FILE = "last-image.json";

type SnapshotMeta = Omit<MetadataSnapshotPayload, "base64">;

function directory(userDataDir: string) {
  return path.join(userDataDir, SNAPSHOT_DIR);
}

function inferMime(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

async function atomicWrite(target: string, data: Buffer | string) {
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(temporary, data);
  try {
    await fs.promises.rename(temporary, target);
  } catch {
    await fs.promises.rm(target, { force: true });
    await fs.promises.rename(temporary, target);
  }
}

async function persist(userDataDir: string, meta: SnapshotMeta, bytes: Buffer): Promise<MetadataSnapshotResult> {
  if (!bytes.length || bytes.length > MAX_SNAPSHOT_BYTES) {
    return { ok: false, message: "Metadata snapshot image is empty or too large." };
  }
  const targetDir = directory(userDataDir);
  await fs.promises.mkdir(targetDir, { recursive: true });
  await atomicWrite(path.join(targetDir, IMAGE_FILE), bytes);
  await atomicWrite(path.join(targetDir, META_FILE), JSON.stringify(meta));
  return { ok: true };
}

export async function saveMetadataSnapshotFile(
  userDataDir: string,
  payload: MetadataSnapshotPayload,
): Promise<MetadataSnapshotResult> {
  try {
    const bytes = Buffer.from(payload.base64, "base64");
    return await persist(userDataDir, {
      name: path.basename(payload.name || "metadata-image.png"),
      type: payload.type || "application/octet-stream",
      lastModified: Number.isFinite(payload.lastModified) ? payload.lastModified : Date.now(),
    }, bytes);
  } catch (error: any) {
    return { ok: false, message: error?.message ?? String(error) };
  }
}

export async function saveMetadataSnapshotFromPath(
  userDataDir: string,
  sourcePath: string,
): Promise<MetadataSnapshotResult> {
  try {
    const resolved = path.resolve(sourcePath);
    const stat = await fs.promises.stat(resolved);
    if (!stat.isFile()) return { ok: false, message: "Image path is not a file." };
    const bytes = await fs.promises.readFile(resolved);
    return await persist(userDataDir, {
      name: path.basename(resolved),
      type: inferMime(resolved),
      lastModified: stat.mtimeMs,
    }, bytes);
  } catch (error: any) {
    return { ok: false, message: error?.message ?? String(error) };
  }
}

export async function loadMetadataSnapshotFile(userDataDir: string): Promise<MetadataSnapshotResult> {
  try {
    const targetDir = directory(userDataDir);
    const [bytes, rawMeta] = await Promise.all([
      fs.promises.readFile(path.join(targetDir, IMAGE_FILE)),
      fs.promises.readFile(path.join(targetDir, META_FILE), "utf8"),
    ]);
    const meta = JSON.parse(rawMeta) as SnapshotMeta;
    return {
      ok: true,
      snapshot: {
        name: path.basename(meta.name || "metadata-image.png"),
        type: meta.type || "application/octet-stream",
        lastModified: Number.isFinite(meta.lastModified) ? meta.lastModified : Date.now(),
        base64: bytes.toString("base64"),
      },
    };
  } catch (error: any) {
    if (error?.code === "ENOENT") return { ok: true };
    return { ok: false, message: error?.message ?? String(error) };
  }
}
