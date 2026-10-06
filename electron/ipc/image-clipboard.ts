import { app, clipboard } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, validateImage } from "./image-codec";
import { localMediaUrlToPath } from "./local-media-protocol";
import { writeWindowsPngClipboard } from "./windows-png-clipboard";
import type { CopyImageMetadataResult } from "../../src/types";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const pngFormat = () => process.platform === "win32" ? "PNG" : process.platform === "darwin" ? "public.png" : "image/png";
function isPng(bytes: Buffer) { return bytes.length >= 24 && bytes.subarray(0, 8).equals(PNG_SIGNATURE); }

/** Main context-menu/IPC entry point, called ONLY when copyImageMetadata is ON.
 * `copied` means original bytes were read back from a standard PNG format and
 * a normal native image is available. Otherwise the caller MUST use its existing
 * native/browser copy and show an unsupported/failed preservation notice.
 * Never fetch renderer URLs or accept guessed file paths. */
export async function copyImageWithMetadata(srcURL: string): Promise<CopyImageMetadataResult> {
  if (typeof srcURL !== "string") return {status:"unsupported"};
  const file = localMediaUrlToPath(srcURL);
  if (!file || path.extname(file).toLowerCase() !== ".png" || file.startsWith("\\\\")) return {status:"unsupported"};
  try {
    // Reject links/junction redirection and Windows ADS, including exposed names
    // whose underlying file changed after main registered the local-media URL.
    const actual = await fs.realpath(file);
    const samePath = process.platform === "win32" ? actual.toLowerCase() === file.toLowerCase() : actual === file;
    if (!samePath || (process.platform === "win32" && file.slice(2).includes(":"))) return {status:"unsupported"};
    const handle = await fs.open(file, "r");
    let bytes: Buffer;
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || !stat.size || stat.size > MAX_IMAGE_BYTES) return {status:"unsupported"};
      // Bound allocation/read even if the file grows between stat and read.
      const buffer = Buffer.alloc(stat.size + 1);
      let length = 0;
      while (length < buffer.length) {
        const read = await handle.read(buffer, length, buffer.length - length, length);
        if (!read.bytesRead) break;
        length += read.bytesRead;
      }
      if (length !== stat.size) return {status:"failed"};
      bytes = buffer.subarray(0, length);
    } finally { await handle.close(); }
    if (!isPng(bytes)) return {status:"unsupported"};
    const metadata = await validateImage(bytes);
    if (metadata.extension !== "png") return {status:"unsupported"};
    if (process.platform === "win32") await writeWindowsPngClipboard(bytes);
    else clipboard.writeBuffer(pngFormat(), bytes);
    // Never claim preservation merely because a write did not throw.
    if (!clipboard.readBuffer(pngFormat()).equals(bytes) || clipboard.readImage().isEmpty()) return {status:"failed"};
    return {status:"copied"};
  } catch {
    // Paths, generation parameters and arbitrary error strings stay private.
    return {status:"failed"};
  }
}

/** Called only on an explicit paste gesture, never polled in the background. */
export async function readClipboardImageFiles(): Promise<Array<{name:string;bytes:Uint8Array}>> {
  // NativeImage decodes/re-encodes PNGs and loses Comment/text chunks. Read
  // standard raw PNG representations first (also for copies from other apps).
  for (const format of [...new Set([pngFormat(), "PNG", "image/png", "public.png"])]) {
    let bytes: Buffer;
    try {
      if (!clipboard.has(format)) continue;
      bytes = clipboard.readBuffer(format);
    } catch { continue; }
    if (!isPng(bytes)) continue;
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error("Clipboard image exceeds 32 MB");
    if (bytes.toString("ascii", 12, 16) === "IHDR" && bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > MAX_IMAGE_PIXELS) throw new Error("Clipboard image exceeds 64 megapixels");
    try { if ((await validateImage(bytes)).extension !== "png") continue; }
    catch { continue; } // Malformed/custom data must not hide a usable bitmap.
    return [{name:"clipboard.png",bytes}];
  }
  const image = clipboard.readImage();
  if (!image.isEmpty()) {
    const size = image.getSize();
    if (size.width * size.height > MAX_IMAGE_PIXELS) throw new Error("Clipboard image exceeds 64 megapixels");
    const bytes = image.toPNG();
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error("Clipboard image exceeds 32 MB");
    return [{name:"clipboard.png",bytes}];
  }
  if (process.platform !== "win32" || !clipboard.availableFormats().includes("FileNameW")) return [];
  const file = clipboard.readBuffer("FileNameW").toString("utf16le").replace(/\0+$/, "");
  if (!path.isAbsolute(file) || !/\.(png|jpe?g|webp|gif|avif)$/i.test(file)) return [];
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES) return [];
  return [{name:path.basename(file),bytes:await fs.readFile(file)}];
}

export async function savePastedImageFiles(raw: unknown) {
  if (!Array.isArray(raw) || raw.length > 16) throw new Error("Paste up to 16 images at a time");
  const inputs = raw.map((value) => {
    if (!value || !(value.bytes instanceof Uint8Array)) throw new Error("Invalid image bytes");
    return Buffer.from(value.bytes);
  });
  if (inputs.reduce((sum,b)=>sum+b.length,0) > 64 * 1024 * 1024) throw new Error("Clipboard images exceed 64 MB");
  const metadata = await Promise.all(inputs.map(validateImage));
  // Persistent app-managed inputs: do not remove files still used by a task.
  const directory = path.join(app.getPath("userData"), "image-inputs");
  await fs.mkdir(directory, {recursive:true});
  const saved: string[] = [];
  try {
    for (let i=0;i<inputs.length;i++) {
      const file = path.join(directory, `${randomUUID()}.${metadata[i].extension}`);
      await fs.writeFile(file, inputs[i], {flag:"wx"}); saved.push(file);
    }
    return saved;
  } catch (error) {
    await Promise.all(saved.map(file=>fs.unlink(file).catch(()=>{}))); throw error;
  }
}
