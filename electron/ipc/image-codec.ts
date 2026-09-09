import sharp from "sharp";

export const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 64 * 1024 * 1024;
export function isWebp(bytes: Buffer) {
  return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
}
/** Electron nativeImage does not decode WebP on every platform. Keep source files
 * untouched; use the first composited frame as the static processing input. */
export async function processableImage(bytes: Buffer): Promise<Buffer> {
  if (!isWebp(bytes)) return bytes;
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error("Image exceeds 32 MB");
  return sharp(bytes, {limitInputPixels: MAX_IMAGE_PIXELS, pages: 1}).rotate().png().toBuffer();
}

export async function validateImage(bytes: Buffer) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error("Image is empty or exceeds 32 MB");
  const meta = await sharp(bytes, {limitInputPixels: MAX_IMAGE_PIXELS, pages: 1}).metadata();
  if (!meta.width || !meta.height || !["png", "jpeg", "webp", "gif", "avif", "tiff"].includes(meta.format ?? "")) throw new Error("Unsupported image data");
  // Decoding, not just the filename/header, validates the clipboard payload.
  await sharp(bytes, {limitInputPixels: MAX_IMAGE_PIXELS, pages: 1}).resize({width: 1, height: 1}).raw().toBuffer();
  return {width: meta.width, height: meta.pageHeight ?? meta.height, extension: meta.format === "jpeg" ? "jpg" : meta.format!};
}
