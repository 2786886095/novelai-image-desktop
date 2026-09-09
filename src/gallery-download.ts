import type { OnlineGalleryDownloadResult } from "./online-gallery";

export const MAX_GALLERY_IMAGE_BYTES = 64 * 1024 * 1024;

export function galleryImageHeaders(source: string) {
  const origin = ({ aitag: "https://aitag.win", danbooru: "https://danbooru.donmai.us",
    "artist-ranking": "https://danbooru.donmai.us", safebooru: "https://safebooru.donmai.us",
    gelbooru: "https://gelbooru.com", quicktag: "https://novelai.quicktagcloud.com" } as Record<string, string>)[source];
  if (!origin) throw new Error("Invalid gallery source");
  return { Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8", Referer: `${origin}/`,
    Origin: origin, "User-Agent": "Langbai-NovelAI-Studio/Online-Gallery-Image-Client" };
}

// Use the payload, not the upstream model category or URL suffix, as the format.
export function galleryImageExtension(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) return "png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpg";
  if (["GIF87a", "GIF89a"].includes(ascii(0, 6))) return "gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12))) return "avif";
  return null;
}

export function validateGalleryImage(bytes: Uint8Array, contentType = "") {
  if (bytes.length > MAX_GALLERY_IMAGE_BYTES) throw new Error("IMAGE_TOO_LARGE");
  const type = contentType.split(";", 1)[0].trim().toLowerCase();
  const extension = galleryImageExtension(bytes);
  if (!extension || (type && !type.startsWith("image/") && type !== "application/octet-stream" && type !== "binary/octet-stream")) {
    throw new Error("INVALID_IMAGE_RESPONSE");
  }
  return extension;
}

export function galleryDownloadFeedback(result: OnlineGalleryDownloadResult, done: string, failed: string) {
  if (result.cancelled) return "";
  const parts = result.savedPaths.length ? [done.replace("{count}", String(result.savedPaths.length))] : [];
  if (result.failed || !result.savedPaths.length) {
    const codes = [...new Set(result.failures?.map((item) => item.reason) ?? [])].join(", ");
    parts.push(`${failed}${result.failed ? ` (${result.failed})` : ""}${codes ? ` [${codes}]` : ""}`);
  }
  return parts.join(" · ");
}
