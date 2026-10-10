// Image attachments for the local MCP server.
//
// The in-app Agent only accepts conversation/history/reference-preset IDs.
// External MCP clients additionally need to bring arbitrary local images
// (character sheets, masks they generated, ...). Every imported file is copied
// into <userData>/mcp-attachments so later edits/deletions of the source can
// not change an already referenced attachment, and IDs survive app restarts.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";
import sharp from "sharp";
import type { AgentAttachment } from "../../src/agent/types";

export const MCP_ATTACHMENT_PREFIX = "mcp-";
const MAX_IMAGE_BYTES = 48 * 1024 * 1024;
export const MAX_MCP_IMAGE_PIXELS = 16 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const ID_PATTERN = /^mcp-[a-z0-9-]{6,80}$/;

const registry = new Map<string, AgentAttachment>();

export function mcpAttachmentDir() {
  const dir = path.join(app.getPath("userData"), "mcp-attachments");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function mimeFor(filePath: string) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    default: return "image/png";
  }
}

async function describe(id: string, filePath: string, name = path.basename(filePath)): Promise<AgentAttachment> {
  const stat = fs.statSync(filePath);
  let width: number | undefined;
  let height: number | undefined;
  try {
    const meta = await sharp(filePath).metadata();
    width = meta.width;
    height = meta.height;
  } catch { /* dimensions are best effort */ }
  const attachment: AgentAttachment = {
    id,
    name,
    mime: mimeFor(filePath),
    size: stat.size,
    kind: "image",
    filePath,
    fileUrl: "",
    width,
    height,
    createdAt: stat.mtime.toISOString(),
  };
  registry.set(id, attachment);
  return attachment;
}

/** Normalise `file://` URLs and quotes around pasted Windows paths. */
export function normalizeLocalPath(value: string) {
  let raw = value.trim().replace(/^["']|["']$/g, "");
  if (/^file:\/\//i.test(raw)) {
    const url = new URL(raw);
    if (url.hostname && url.hostname !== "localhost") throw new Error("MCP imports require a local file");
    raw = fileURLToPath(url);
  }
  if (!path.isAbsolute(raw) || raw.startsWith("\\\\") || raw.startsWith("//")
      || raw.startsWith("\\\\?\\") || raw.startsWith("\\\\.\\")) throw new Error("MCP imports require a local absolute path");
  return path.resolve(raw);
}
export function looksLikeLocalPath(value: string) {
  const raw = value.trim().replace(/^["']|["']$/g, "");
  return /^[a-zA-Z]:[\\/]/.test(raw) || raw.startsWith("\\\\") || raw.startsWith("/") || /^file:\/\//i.test(raw);
}

/** Copy a local image into the MCP attachment store (content addressed). */
export async function importMcpImage(source: string): Promise<AgentAttachment> {
  const resolved = normalizeLocalPath(source);
  const ext = path.extname(resolved).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) throw new Error(`只支持 PNG / JPG / WebP 图片：${resolved}`);
  const stat = fs.statSync(resolved, { throwIfNoEntry: false });
  if (!stat?.isFile()) throw new Error(`图片不存在：${resolved}`);
  if (stat.size > MAX_IMAGE_BYTES) throw new Error(`图片超过 48 MB：${resolved}`);
  const bytes = fs.readFileSync(resolved);
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error("Image exceeds 48 MB");
  const meta = await sharp(bytes, { limitInputPixels: MAX_MCP_IMAGE_PIXELS }).metadata();
  if (!["png", "jpeg", "webp"].includes(meta.format ?? "") || !meta.width || !meta.height
      || meta.width * meta.height > MAX_MCP_IMAGE_PIXELS) throw new Error("Invalid or oversized MCP image");
  const hash = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 24);
  const id = `${MCP_ATTACHMENT_PREFIX}${hash}`;
  const target = path.join(mcpAttachmentDir(), `${id}${ext === ".jpeg" ? ".jpg" : ext}`);
  if (!fs.existsSync(target)) fs.writeFileSync(target, bytes);
  return describe(id, target, path.basename(resolved));
}

/** Register a file the MCP server itself created inside the attachment store. */
export async function registerMcpFile(filePath: string, kind: string): Promise<AgentAttachment> {
  const ext = path.extname(filePath).toLowerCase() || ".png";
  const id = `${MCP_ATTACHMENT_PREFIX}${kind}-${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const target = path.join(mcpAttachmentDir(), `${id}${ext}`);
  if (path.resolve(filePath) !== target) fs.renameSync(filePath, target);
  return describe(id, target);
}

export function newMcpTempFile(ext = ".png") {
  return path.join(mcpAttachmentDir(), `tmp-${crypto.randomUUID()}${ext}`);
}

/** Synchronous lookup used by the Agent tool executor (also after restarts). */
export function mcpAttachment(id: string): AgentAttachment | undefined {
  if (!ID_PATTERN.test(id)) return undefined;
  const cached = registry.get(id);
  if (cached && fs.existsSync(cached.filePath)) return cached;
  const dir = mcpAttachmentDir();
  const file = fs.readdirSync(dir).find((name) => path.parse(name).name === id);
  if (!file) return undefined;
  const filePath = path.join(dir, file);
  const stat = fs.statSync(filePath);
  const attachment: AgentAttachment = {
    id,
    name: file,
    mime: mimeFor(filePath),
    size: stat.size,
    kind: "image",
    filePath,
    fileUrl: "",
    createdAt: stat.mtime.toISOString(),
  };
  registry.set(id, attachment);
  return attachment;
}
