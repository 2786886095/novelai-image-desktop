import { app, clipboard } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, validateImage } from "./image-codec";
import { localMediaUrlToPath } from "./local-media-protocol";
import { writeWindowsPngClipboard, type CopyImageMetadataDiagnostic } from "./windows-png-clipboard";
import { removePngGenerationMetadata } from './png-privacy';
import sharp from 'sharp';
import type { CopyImageMetadataResult } from "../../src/types";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const pngFormat = () => process.platform === "win32" ? "PNG" : process.platform === "darwin" ? "public.png" : "image/png";
function isPng(bytes: Buffer) { return bytes.length >= 24 && bytes.subarray(0, 8).equals(PNG_SIGNATURE); }

/** Pure byte-only bridge: no URLs, filesystem access or clipboard side effects. */
export function preparePngForClipboard(raw: unknown): Uint8Array {
  if (!(raw instanceof Uint8Array) || !raw.byteLength || raw.byteLength > 64 * 1024 * 1024) {
    throw new Error('IMAGE_COPY_INVALID_PNG_BYTES');
  }
  return Uint8Array.from(removePngGenerationMetadata(Buffer.from(raw)));
}

/** Main context-menu/IPC entry point. ON preserves the original PNG exactly;
 * OFF strongly cleans pixels and metadata before writing. `copied` means the
 * intended bytes were read back from a standard PNG format and
 * a normal native image is available. ON callers may use their preservation
 * fallback with a notice; OFF callers MUST fail closed without a raw fallback.
 * Never fetch renderer URLs or accept guessed file paths. */
export async function copyImageWithMetadata(srcURL: string, keepImageMetadata = true, diagnostics = false): Promise<CopyImageMetadataResult & {diagnostic?:CopyImageMetadataDiagnostic}> {
  let phase: CopyImageMetadataDiagnostic['phase'] = 'source-read';
  const fail = (errorCode: CopyImageMetadataDiagnostic['errorCode'], diagnostic?: CopyImageMetadataDiagnostic): CopyImageMetadataResult & {diagnostic?:CopyImageMetadataDiagnostic} => ({status:'failed',...(diagnostics?{diagnostic:diagnostic??{phase,errorCode}}:{})});
  const safeNative = (error: unknown): CopyImageMetadataDiagnostic | undefined => {
    try {
      const value=(error as {diagnostic?:CopyImageMetadataDiagnostic})?.diagnostic;
      // Snapshot once before validation; even accessor-backed errors cannot swap
      // an allowlisted token for arbitrary data during serialization.
      const phase=value?.phase,errorCode=value?.errorCode,rawHresult=value?.hresult;
      if(!phase||!errorCode||!['native-process','native-load','native-decode','native-data','native-publish-cleanup'].includes(phase)||!['NATIVE_SPAWN_FAILED','NATIVE_TIMEOUT','NATIVE_EXIT_FAILED','NATIVE_SCRIPT_FAILED','NATIVE_DIAGNOSTIC_INVALID'].includes(errorCode))return;
      const hresult=['0x800401D0','0x80070005','0x8007000E','0x80004005','0x80131500','0x80131604'].includes(rawHresult??'')?rawHresult:undefined;
      return {phase,errorCode,...(hresult?{hresult}:{})};
    }catch{return;}
  };
  if (typeof srcURL !== "string") return {status:"unsupported"};
  const file = localMediaUrlToPath(srcURL);
  const extension = file ? path.extname(file).toLowerCase() : '';
  if (!file || (keepImageMetadata ? extension !== '.png' : !/^\.(png|jpe?g|webp|gif|avif)$/.test(extension)) || file.startsWith("\\\\")) return {status:"unsupported"};
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
      if (length !== stat.size) return fail('SOURCE_LENGTH_CHANGED');
      bytes = buffer.subarray(0, length);
    } finally { await handle.close(); }
    if (keepImageMetadata && !isPng(bytes)) return {status:"unsupported"};
    phase='image-validate';
    const metadata = await validateImage(bytes);
    if (keepImageMetadata && metadata.extension !== "png") return {status:"unsupported"};
    phase='png-prepare';
    const png = keepImageMetadata || isPng(bytes) ? bytes : await sharp(bytes, {limitInputPixels: MAX_IMAGE_PIXELS, pages: 1}).ensureAlpha().png().toBuffer();
    const intended = keepImageMetadata ? bytes : Buffer.from(preparePngForClipboard(png));
    phase='native-process';
    if (process.platform === "win32") {if(diagnostics)await writeWindowsPngClipboard(intended,true);else await writeWindowsPngClipboard(intended);}
    else clipboard.writeBuffer(pngFormat(), intended);
    // Never claim preservation merely because a write did not throw.
    phase='png-readback';
    if (!clipboard.readBuffer(pngFormat()).equals(intended)) return fail('PNG_READBACK_MISMATCH');
    phase='bitmap-readback';
    if (clipboard.readImage().isEmpty()) return fail('BITMAP_EMPTY');
    return {status:"copied"};
  } catch (error) {
    // No arbitrary exception/URL/path/bytes enter the bounded diagnostic.
    const code=phase==='source-read'?'SOURCE_IO_FAILED':phase==='image-validate'?'IMAGE_DECODE_FAILED':phase==='png-prepare'?'PNG_PREPARE_FAILED':phase==='native-process'?'NATIVE_EXIT_FAILED':'READBACK_FAILED';
    return fail(code,phase==='native-process'?safeNative(error):undefined);
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
