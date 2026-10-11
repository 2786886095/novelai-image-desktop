import { Inflate } from "pako";
import { decode as decodePng } from "fast-png";

export const MAX_METADATA_BYTES = 8 * 1024 * 1024;

/** PNG tEXt/zTXt are Latin-1; retain common UTF-8 writers without replacement characters. */
export function decodePngText(bytes: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""); }
}

export function inflateMetadata(bytes: Uint8Array): Uint8Array {
  const decoder = new Inflate({ chunkSize: 8192 });
  const chunks: Uint8Array[] = [];
  let size = 0, complete = false;
  const onEnd = decoder.onEnd.bind(decoder);
  decoder.onEnd = (status) => { complete = status === 0; onEnd(status); };
  decoder.onData = (chunk) => {
    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    size += bytes.length;
    if (size > MAX_METADATA_BYTES) throw new Error("Image metadata is too large");
    chunks.push(bytes);
  };
  for (let offset = 0; offset < bytes.length; offset += 256) {
    if (!decoder.push(bytes.subarray(offset, offset + 256), offset + 256 >= bytes.length)) {
      throw new Error(decoder.msg || "Invalid compressed metadata");
    }
  }
  if (!complete || decoder.err) throw new Error("Incomplete compressed metadata");
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

export function hasUsableGenerationMetadata(meta: Record<string, string>): boolean {
  if (meta.parameters?.trim()) return true;
  for (const key of ["Comment", "comment", "prompt", "workflow"]) {
    try {
      const value: unknown = JSON.parse(meta[key] ?? "");
      if (value && typeof value === "object" &&
          (!Array.isArray(value) || key === "workflow") && Object.keys(value).length) return true;
    } catch { /* Empty/broken text must not block valid pixel metadata. */ }
  }
  return false;
}

/** NovelAI's alpha LSB format, decoded without canvas alpha premultiplication. */
export function readPngStealthMetadata(bytes: Uint8Array): Record<string, string> {
  if (bytes.length < 33 || bytes.length > 64 * 1024 * 1024) return {};
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) return {};
    const width = view.getUint32(16), height = view.getUint32(20);
    const pixels = width * height, channels = bytes[25] === 6 ? 4 : bytes[25] === 4 ? 2 : 0;
    if (!width || !height || pixels < 152 || pixels > 16 * 1024 * 1024 ||
        bytes[24] !== 8 || !channels || bytes[28] !== 0) return {};
    // Do not let optional ICC/text chunks trigger unbounded decoder allocations.
    const chunks: Uint8Array[] = [bytes.subarray(0, 8)];
    const idats: Uint8Array[] = [];
    let offset = 8, size = 8, ended = false;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset), end = offset + 12 + length;
      if (end > bytes.length) return {};
      const type = view.getUint32(offset + 4);
      if (type === 0x49484452 && offset !== 8) return {};
      if (type === 0x49484452 || type === 0x49444154 || type === 0x49454e44) {
        const chunk = bytes.subarray(offset, end); chunks.push(chunk); size += chunk.length;
        if (type === 0x49444154) idats.push(bytes.subarray(offset + 8, end - 4));
      }
      offset = end;
      if (type === 0x49454e44) { ended = true; break; }
    }
    if (!ended || !idats.length) return {};
    const expectedBytes = (width * channels + 1) * height;
    const check = new Inflate({ chunkSize: 8192 });
    let inflated = 0, complete = false;
    const onEnd = check.onEnd.bind(check);
    check.onEnd = (status) => { complete = status === 0; onEnd(status); };
    check.onData = (part) => {
      inflated += part instanceof Uint8Array ? part.length : part.byteLength;
      if (inflated > expectedBytes) throw new Error("Oversized PNG pixels");
    };
    for (const idat of idats) {
      for (let start = 0; start < idat.length; start += 256) {
        if (!check.push(idat.subarray(start, start + 256))) throw new Error("Invalid PNG pixels");
      }
    }
    if (!complete || check.err || inflated !== expectedBytes) return {};
    const safePng = new Uint8Array(size); let position = 0;
    for (const chunk of chunks) { safePng.set(chunk, position); position += chunk.length; }
    const image = decodePng(safePng, { checkCrc: true });
    return readStealthMetadataPixels(image.data, width, height, channels);
  } catch { return {}; }
}

/** Match the official RGBA alpha extractor after a container's pixels are decoded. */
export function readStealthMetadataPixels(
  data: ArrayLike<number>, width: number, height: number, channels = 4,
): Record<string, string> {
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels < 152 || pixels > 16 * 1024 * 1024 ||
      (channels !== 2 && channels !== 4) || data.length !== pixels * channels) return {};
  try {
    let cursor = 0;
    function readByte() {
      if (cursor + 8 > pixels) throw new Error("Truncated pixel metadata");
      let value = 0;
      for (let i = 0; i < 8; i++, cursor++) {
        const x = Math.floor(cursor / height), y = cursor % height;
        value = (value << 1) | (data[(y * width + x) * channels + channels - 1] & 1);
      }
      return value;
    }
    const signature = String.fromCharCode(...Array.from({ length: 15 }, readByte));
    if (signature !== "stealth_pngcomp" && signature !== "stealth_pnginfo") return {};
    let bits = 0;
    for (let i = 0; i < 4; i++) bits = bits * 256 + readByte();
    if (bits <= 0 || bits % 8 || bits > pixels - cursor || bits / 8 > MAX_METADATA_BYTES) return {};
    const payload = Uint8Array.from({ length: bits / 8 }, readByte);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      signature === "stealth_pngcomp" ? inflateMetadata(payload) : payload);
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, typeof item === "string" ? item : JSON.stringify(item)]));
  } catch { return {}; }
}
