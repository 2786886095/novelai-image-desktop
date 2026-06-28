export interface TuiwenNarrationPacing {
  readableUnits: number;
  estimatedDurationMs: number;
  tooLong: boolean;
  suggestedShotCount: number;
}

export interface TuiwenPcmSlice {
  channels: Float32Array[];
  sampleRate: number;
  durationMs: number;
}

function readableUnits(text: string) {
  const normalized = text.trim();
  const cjk = normalized.match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/g)?.length ?? 0;
  const latinWords = normalized.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0;
  const punctuationPauses = normalized.match(/[，、；：。！？,.!?;:…]/g)?.length ?? 0;
  return cjk + latinWords * 1.7 + punctuationPauses * 0.45;
}

export function estimateTuiwenNarrationDurationMs(text: string, ratePercent = 0) {
  const units = readableUnits(text);
  const rateFactor = Math.max(0.5, Math.min(2, 1 + ratePercent / 100));
  return Math.max(800, Math.round((units / (4.2 * rateFactor)) * 1000));
}

export function analyzeTuiwenNarrationPacing(text: string, ratePercent = 0): TuiwenNarrationPacing {
  const units = readableUnits(text);
  const estimatedDurationMs = estimateTuiwenNarrationDurationMs(text, ratePercent);
  return {
    readableUnits: Math.round(units),
    estimatedDurationMs,
    tooLong: estimatedDurationMs > 12_000 || units > 62,
    suggestedShotCount: Math.max(1, Math.ceil(estimatedDurationMs / 8_000)),
  };
}

export function splitTuiwenNarration(text: string, maxUnits = 42): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const clauses =
    normalized.match(/[^。！？!?；;，,、：:…]+[。！？!?；;，,、：:…]*/g)?.map((item) => item.trim()).filter(Boolean)
    ?? [normalized];
  const result: string[] = [];
  let buffer = "";

  function pushBuffer() {
    const value = buffer.trim();
    if (value) result.push(value);
    buffer = "";
  }

  for (const clause of clauses) {
    if (readableUnits(clause) > maxUnits) {
      pushBuffer();
      const characters = Array.from(clause);
      let piece = "";
      for (const character of characters) {
        if (piece && readableUnits(piece + character) > maxUnits) {
          result.push(piece.trim());
          piece = character;
        } else {
          piece += character;
        }
      }
      if (piece.trim()) result.push(piece.trim());
      continue;
    }

    if (buffer && readableUnits(buffer + clause) > maxUnits) pushBuffer();
    buffer += clause;
  }
  pushBuffer();
  return result;
}

export function wrapTuiwenSubtitle(text: string, maxUnitsPerLine = 18, maxLines = 3) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  const lines: string[] = [];
  let line = "";
  for (const character of Array.from(normalized)) {
    const characterUnits = /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(character) ? 1 : character === " " ? 0.35 : 0.58;
    const nextUnits = readableUnits(line) + characterUnits;
    if (line && nextUnits > maxUnitsPerLine) {
      lines.push(line.trim());
      line = character.trimStart();
    } else {
      line += character;
    }
  }
  if (line.trim()) lines.push(line.trim());

  if (lines.length <= maxLines) return lines.join("\n");
  const visible = lines.slice(0, maxLines);
  visible[maxLines - 1] = `${visible[maxLines - 1].replace(/[。！？!?…]+$/u, "")}…`;
  return visible.join("\n");
}

export function sliceTuiwenPcm(
  channels: readonly Float32Array[],
  sampleRate: number,
  startMs: number,
  durationMs: number,
): TuiwenPcmSlice {
  if (!channels.length || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error("Invalid audio PCM data.");
  }
  const sourceLength = Math.min(...channels.map((channel) => channel.length));
  const startSample = Math.max(0, Math.min(sourceLength, Math.round((Math.max(0, startMs) / 1000) * sampleRate)));
  const requestedSamples = Math.max(1, Math.round((Math.max(0, durationMs) / 1000) * sampleRate));
  const endSample = Math.min(sourceLength, startSample + requestedSamples);
  if (endSample <= startSample) throw new Error("Subtitle timecode is outside the long audio range.");
  const sliced = channels.map((channel) => channel.slice(startSample, endSample));
  return {
    channels: sliced,
    sampleRate,
    durationMs: Math.max(1, Math.round(((endSample - startSample) / sampleRate) * 1000)),
  };
}

export function encodeTuiwenPcm16Wav(channels: readonly Float32Array[], sampleRate: number) {
  if (!channels.length || channels.length > 8) throw new Error("WAV channel count must be between 1 and 8.");
  if (!Number.isFinite(sampleRate) || sampleRate < 8_000 || sampleRate > 192_000) {
    throw new Error("Invalid WAV sample rate.");
  }
  const frameCount = Math.min(...channels.map((channel) => channel.length));
  if (frameCount <= 0) throw new Error("WAV audio segment is empty.");
  const channelCount = channels.length;
  const bytesPerSample = 2;
  const dataBytes = frameCount * channelCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel][frame] ?? 0));
      view.setInt16(offset, sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff), true);
      offset += bytesPerSample;
    }
  }
  return buffer;
}
