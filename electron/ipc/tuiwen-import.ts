import fs from "fs";
import path from "path";
import type { TuiwenImportFileRequest, TuiwenImportFileResult, TuiwenShot } from "../../src/types";
import { parseTuiwenTextFile } from "../../src/tuiwen/import";
import { createTuiwenShot, splitNovelTextToNarration } from "../../src/tuiwen/project";

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

function decodeTextFile(buffer: Buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString("utf8");
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString("utf16le");
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const body = buffer.subarray(2);
    for (let i = 0; i + 1 < body.length; i += 2) {
      const current = body[i];
      body[i] = body[i + 1];
      body[i + 1] = current;
    }
    return body.toString("utf16le");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    // GBK/GB18030 is still common for Chinese web novels. GB18030 is a
    // superset of GBK and avoids silently filling the imported text with �.
    return new TextDecoder("gb18030").decode(buffer);
  }
}

function cuesToShots(request: TuiwenImportFileRequest, text: string, fileName: string): TuiwenImportFileResult {
  const fallbackDurationMs = request.defaultShotDurationMs || 3000;
  const parsed = parseTuiwenTextFile(fileName, text, fallbackDurationMs);
  const shots: TuiwenShot[] = parsed.cues.length
    ? parsed.cues.map((cue, index) => ({
        ...createTuiwenShot(cue.text, index + 1, cue.durationMs ?? fallbackDurationMs),
        startMs: cue.startMs,
      }))
    : splitNovelTextToNarration(text).map((line, index) => createTuiwenShot(line, index + 1, fallbackDurationMs));

  return {
    ok: true,
    message: `已导入 ${fileName}，创建 ${shots.length} 个${parsed.source.type === "subtitle" ? "字幕" : "旁白"}分镜。`,
    source: parsed.source,
    rawScript: parsed.rawScript,
    shots,
  };
}

export function importTuiwenFile(request: TuiwenImportFileRequest): TuiwenImportFileResult {
  const filePath = request.filePath?.trim();
  if (!filePath) return { ok: false, message: "请选择要导入的小说或字幕文件。" };
  if (!fs.existsSync(filePath)) return { ok: false, message: `导入文件不存在：${filePath}` };

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) return { ok: false, message: `导入路径不是文件：${filePath}` };
  if (stat.size > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      message: `文件过大（${Math.ceil(stat.size / 1024 / 1024)}MB）。请先拆分到 10MB 以内再导入。`,
    };
  }

  const fileName = request.fileName?.trim() || path.basename(filePath);
  const text = decodeTextFile(fs.readFileSync(filePath));
  return cuesToShots(request, text, fileName);
}
