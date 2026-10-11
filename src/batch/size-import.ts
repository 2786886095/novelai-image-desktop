import {isNAIImageSize} from '../nai-dimensions';
type BatchSizeImportErrorCode = "empty" | "count" | "blank" | "format" | "unsupported";

export class BatchSizeImportError extends Error {
  constructor(
    readonly code: BatchSizeImportErrorCode,
    readonly line?: number,
    readonly expected?: number,
    readonly actual?: number,
  ) {
    super(code);
  }
}

export function parseBatchSizeImport(text: string, expectedCount: number) {
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!source.trim()) throw new BatchSizeImportError("empty");
  // A trailing Enter is harmless, but leading/internal empty lines must remain
  // visible so line N can never silently shift onto image N-1.
  const lines = source.trimEnd().split("\n");
  if (lines.length !== expectedCount) {
    throw new BatchSizeImportError("count", undefined, expectedCount, lines.length);
  }
  return lines.map((raw, index) => {
    const line = raw.trim();
    if (!line) throw new BatchSizeImportError("blank", index + 1);
    const match = line.match(/^(\d+)\s*[x×*]\s*(\d+)$/i);
    if (!match) throw new BatchSizeImportError("format", index + 1);
    const size = { width: Number(match[1]), height: Number(match[2]) };
    if (!isNAIImageSize(size)) {
      throw new BatchSizeImportError("unsupported", index + 1);
    }
    return size;
  });
}

