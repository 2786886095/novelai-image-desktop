import { decode } from "@msgpack/msgpack";

export interface NaiStreamFrame {
  eventType: "intermediate" | "final" | "error" | string;
  sampleIndex: number;
  stepIndex?: number;
  image?: Buffer;
  error?: string;
}

const MAX_FRAME_BYTES = 128 * 1024 * 1024;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value instanceof Map) {
    return Object.fromEntries(
      Array.from(value.entries(), ([key, entry]) => [String(key), entry]),
    );
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function optionalInteger(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}

function looksLikeBase64(value: string): boolean {
  const compact = value.replace(/\s+/g, "");
  return compact.length >= 4
    && compact.length % 4 === 0
    && /^[A-Za-z0-9+/]*={0,2}$/.test(compact);
}

function decodeImage(value: unknown): Buffer | undefined {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (Array.isArray(value) && value.every((entry) => Number.isInteger(entry))) {
    return Buffer.from(value as number[]);
  }
  if (typeof value === "string" && value.length > 0) {
    try {
      const compact = value.replace(/^data:image\/[^;]+;base64,/i, "").replace(/\s+/g, "");
      if (!looksLikeBase64(compact)) return undefined;
      return Buffer.from(compact, "base64");
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function frameFromRecord(
  message: Record<string, unknown>,
  fallbackEventType?: string,
): NaiStreamFrame {
  const nested = asRecord(message.payload) ?? asRecord(message.data);
  const source = nested && !message.image && !message.event_type
    ? { ...message, ...nested }
    : message;
  const eventType = String(
    source.event_type
      ?? source.eventType
      ?? source.type
      ?? fallbackEventType
      ?? "intermediate",
  );
  const errorValue = source.message ?? source.error;
  return {
    eventType,
    sampleIndex: optionalInteger(source.samp_ix ?? source.sampleIndex ?? source.sample_index) ?? 0,
    stepIndex: optionalInteger(source.step_ix ?? source.stepIndex ?? source.step_index),
    image: decodeImage(source.image ?? source.data ?? source.image_data ?? source.imageData),
    error:
      eventType === "error" || source.error !== undefined
        ? String(errorValue ?? "Stream generation failed")
        : undefined,
  };
}

export function decodeNaiStreamFrame(bytes: Uint8Array): NaiStreamFrame | null {
  const message = asRecord(decode(bytes));
  if (!message) return null;
  return frameFromRecord(message);
}

function decodeSseData(eventType: string, value: string): NaiStreamFrame | null {
  const data = value.trim();
  if (!data || data === "[DONE]") return null;

  try {
    const parsed = JSON.parse(data) as unknown;
    const record = asRecord(parsed);
    if (record) return frameFromRecord(record, eventType || undefined);
    if (typeof parsed === "string") return decodeSseData(eventType, parsed);
  } catch {
    // A number of NovelAI-compatible gateways wrap the MessagePack payload or
    // the preview image directly in base64 instead of JSON. Try those forms
    // below without turning malformed text into arbitrary image bytes.
  }

  if (!looksLikeBase64(data)) {
    if (eventType === "error") {
      return { eventType, sampleIndex: 0, error: data };
    }
    return null;
  }
  const bytes = Buffer.from(data.replace(/\s+/g, ""), "base64");
  try {
    const decoded = decodeNaiStreamFrame(bytes);
    if (decoded) {
      if ((!decoded.eventType || decoded.eventType === "intermediate") && eventType) {
        decoded.eventType = eventType;
      }
      return decoded;
    }
  } catch {
    // Direct image payload. Image validation is intentionally lightweight here;
    // the renderer will decode the same bytes and the final archive parser still
    // validates the generated file before saving it.
  }
  return {
    eventType: eventType || "intermediate",
    sampleIndex: 0,
    image: bytes,
  };
}

/** Incremental Server-Sent Events decoder used by NovelAI-compatible proxy
 * endpoints. The official endpoint currently uses framed MessagePack, while
 * some gateways return the same events as `event:` / `data:` records. */
export class NaiSseFrameDecoder {
  private pending = "";
  private eventType = "";
  private dataLines: string[] = [];
  private readonly textDecoder = new TextDecoder("utf-8");

  private dispatch(): NaiStreamFrame[] {
    if (!this.dataLines.length) {
      this.eventType = "";
      return [];
    }
    const frame = decodeSseData(this.eventType, this.dataLines.join("\n"));
    this.eventType = "";
    this.dataLines = [];
    return frame ? [frame] : [];
  }

  private consumeLines(final = false): NaiStreamFrame[] {
    const frames: NaiStreamFrame[] = [];
    let newline = this.pending.indexOf("\n");
    while (newline >= 0) {
      let line = this.pending.slice(0, newline);
      this.pending = this.pending.slice(newline + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line) {
        frames.push(...this.dispatch());
      } else if (!line.startsWith(":")) {
        const colon = line.indexOf(":");
        const field = colon < 0 ? line : line.slice(0, colon);
        let value = colon < 0 ? "" : line.slice(colon + 1);
        if (value.startsWith(" ")) value = value.slice(1);
        if (field === "event") this.eventType = value.trim();
        else if (field === "data") this.dataLines.push(value);
      }
      newline = this.pending.indexOf("\n");
    }
    if (final) {
      if (this.pending) {
        const line = this.pending.endsWith("\r") ? this.pending.slice(0, -1) : this.pending;
        const colon = line.indexOf(":");
        const field = colon < 0 ? line : line.slice(0, colon);
        let value = colon < 0 ? "" : line.slice(colon + 1);
        if (value.startsWith(" ")) value = value.slice(1);
        if (field === "event") this.eventType = value.trim();
        else if (field === "data") this.dataLines.push(value);
      }
      this.pending = "";
      frames.push(...this.dispatch());
    }
    return frames;
  }

  push(chunk: Uint8Array): NaiStreamFrame[] {
    if (chunk.byteLength === 0) return [];
    this.pending += this.textDecoder.decode(chunk, { stream: true });
    return this.consumeLines();
  }

  finish(): NaiStreamFrame[] {
    this.pending += this.textDecoder.decode();
    return this.consumeLines(true);
  }
}

/**
 * Incrementally decodes NovelAI's stream protocol:
 * a four-byte big-endian message length followed by one MessagePack object.
 */
export class NaiStreamFrameDecoder {
  private pending = Buffer.alloc(0);

  push(chunk: Uint8Array): NaiStreamFrame[] {
    if (chunk.byteLength === 0) return [];
    const incoming = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    this.pending = this.pending.length
      ? Buffer.concat([this.pending, incoming])
      : Buffer.from(incoming);
    const frames: NaiStreamFrame[] = [];
    while (this.pending.length >= 4) {
      const length = this.pending.readUInt32BE(0);
      if (length <= 0 || length > MAX_FRAME_BYTES) {
        throw new Error(`Invalid NovelAI stream frame length: ${length}`);
      }
      if (this.pending.length < 4 + length) break;
      const frame = decodeNaiStreamFrame(this.pending.subarray(4, 4 + length));
      this.pending = this.pending.subarray(4 + length);
      if (frame) frames.push(frame);
    }
    return frames;
  }

  remainingBytes(): Buffer {
    return Buffer.from(this.pending);
  }
}

export function frameNaiStreamMessage(message: Uint8Array): Buffer {
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32BE(message.byteLength, 0);
  return Buffer.concat([
    header,
    Buffer.from(message.buffer, message.byteOffset, message.byteLength),
  ]);
}
