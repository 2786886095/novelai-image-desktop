import { app, clipboard } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, validateImage } from "./image-codec";

/** Called only on an explicit paste gesture, never polled in the background. */
export async function readClipboardImageFiles(): Promise<Array<{name:string;bytes:Uint8Array}>> {
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
