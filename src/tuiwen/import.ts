import type { TuiwenSourceType, TuiwenSubtitleFormat } from "../types";

export interface TuiwenImportedCue {
  text: string;
  startMs?: number;
  durationMs?: number;
}

export interface TuiwenImportResult {
  source: {
    type: TuiwenSourceType;
    fileName: string;
    subtitleFormat?: TuiwenSubtitleFormat;
  };
  rawScript: string;
  cues: TuiwenImportedCue[];
}

const SUBTITLE_EXTENSIONS = new Set(["srt", "ass", "lrc"]);

function stripAssText(text: string) {
  return text
    .replace(/\{\\[^}]+\}/g, "")
    .replace(/\\N/g, "\n")
    .replace(/\\h/g, " ")
    .trim();
}

function parseSrtTime(input: string) {
  const match = input.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (!match) return undefined;
  const [, hh, mm, ss, ms] = match;
  return Number(hh) * 3_600_000 + Number(mm) * 60_000 + Number(ss) * 1000 + Number(ms.padEnd(3, "0"));
}

function parseAssTime(input: string) {
  const match = input.trim().match(/^(\d+):(\d{2}):(\d{2})[.](\d{1,2})$/);
  if (!match) return undefined;
  const [, hh, mm, ss, centiseconds] = match;
  return Number(hh) * 3_600_000 + Number(mm) * 60_000 + Number(ss) * 1000 + Number(centiseconds.padEnd(2, "0")) * 10;
}

function parseLrcTime(input: string) {
  const match = input.trim().match(/^(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?$/);
  if (!match) return undefined;
  const [, mm, ss, fraction = "0"] = match;
  return Number(mm) * 60_000 + Number(ss) * 1000 + Number(fraction.padEnd(3, "0").slice(0, 3));
}

export function parseSrt(text: string): TuiwenImportedCue[] {
  const blocks = text.replace(/\r\n?/g, "\n").split(/\n{2,}/);
  return blocks.flatMap((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const timeLineIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeLineIndex < 0) return [];
    const [startRaw, endRaw] = lines[timeLineIndex].split("-->").map((part) => part.trim().split(/\s+/)[0]);
    const startMs = parseSrtTime(startRaw);
    const endMs = parseSrtTime(endRaw);
    const cueText = lines.slice(timeLineIndex + 1).join("\n").trim();
    if (!cueText) return [];
    return [{ text: cueText, startMs, durationMs: startMs != null && endMs != null ? Math.max(500, endMs - startMs) : undefined }];
  });
}

export function parseLrc(text: string, fallbackDurationMs: number): TuiwenImportedCue[] {
  const cues = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .flatMap((line) => {
      const matches = [...line.matchAll(/\[([0-9:.]+)\]/g)];
      const body = line.replace(/\[[^\]]+\]/g, "").trim();
      if (!matches.length || !body) return [];
      return matches.flatMap((match) => {
        const startMs = parseLrcTime(match[1]);
        return startMs == null ? [] : [{ text: body, startMs }];
      });
    })
    .sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));

  return cues.map((cue, index) => {
    const nextStart = cues[index + 1]?.startMs;
    return {
      ...cue,
      durationMs: nextStart != null && cue.startMs != null ? Math.max(500, nextStart - cue.startMs) : fallbackDurationMs,
    };
  });
}

export function parseAss(text: string): TuiwenImportedCue[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .flatMap((line) => {
      if (!line.startsWith("Dialogue:")) return [];
      const payload = line.slice("Dialogue:".length).trim();
      const parts = payload.split(",");
      if (parts.length < 10) return [];
      const startMs = parseAssTime(parts[1]);
      const endMs = parseAssTime(parts[2]);
      const cueText = stripAssText(parts.slice(9).join(","));
      if (!cueText) return [];
      return [{ text: cueText, startMs, durationMs: startMs != null && endMs != null ? Math.max(500, endMs - startMs) : undefined }];
    });
}

export function inferTuiwenFileKind(fileName: string): { type: TuiwenSourceType; subtitleFormat?: TuiwenSubtitleFormat } {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (SUBTITLE_EXTENSIONS.has(ext)) return { type: "subtitle", subtitleFormat: ext as TuiwenSubtitleFormat };
  return { type: "novel" };
}

export function parseTuiwenTextFile(fileName: string, text: string, fallbackDurationMs: number): TuiwenImportResult {
  const kind = inferTuiwenFileKind(fileName);
  const cues =
    kind.subtitleFormat === "srt"
      ? parseSrt(text)
      : kind.subtitleFormat === "ass"
        ? parseAss(text)
        : kind.subtitleFormat === "lrc"
          ? parseLrc(text, fallbackDurationMs)
          : [];

  return {
    source: { ...kind, fileName },
    rawScript: text,
    cues,
  };
}

