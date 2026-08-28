import { protocol } from "electron";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

export const LOCAL_MEDIA_SCHEME = "nai-local";

const ALLOWED_MEDIA_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
  ".avif",
  ".svg",
  ".mp3",
  ".wav",
  ".ogg",
  ".m4a",
  ".aac",
  ".flac",
  ".webm",
  ".mp4",
]);

const MEDIA_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
};

// A renderer URL is usable only after trusted main-process code has explicitly
// exposed that exact path. This keeps a compromised renderer from guessing a
// private image path elsewhere on disk and reading it through the protocol.
const allowedMediaPaths = new Set<string>();

function mediaPathKey(filePath: string) {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/** Register before Electron becomes ready. */
export function registerLocalMediaScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: LOCAL_MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

/** Build a renderer-safe URL without disabling Chromium web security. */
export function toLocalMediaUrl(filePath: string): string {
  const resolved = path.resolve(filePath);
  allowedMediaPaths.add(mediaPathKey(resolved));
  const fileUrl = pathToFileURL(resolved).toString();
  return `${LOCAL_MEDIA_SCHEME}://file/${encodeURIComponent(fileUrl)}`;
}

export function localMediaUrlToPath(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== `${LOCAL_MEDIA_SCHEME}:` || url.hostname !== "file") return null;
    const encoded = url.pathname.replace(/^\/+/, "");
    if (!encoded) return null;
    const filePath = fileURLToPath(decodeURIComponent(encoded));
    if (!path.isAbsolute(filePath)) return null;
    if (!ALLOWED_MEDIA_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return null;
    const resolved = path.resolve(filePath);
    return allowedMediaPaths.has(mediaPathKey(resolved)) ? resolved : null;
  } catch {
    return null;
  }
}

function errorResponse(status: number, message: string) {
  return new Response(message, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function requestedRange(value: string | null, size: number): { start: number; end: number } | null {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match) return null;
  let start = match[1] ? Number(match[1]) : Number.NaN;
  let end = match[2] ? Number(match[2]) : Number.NaN;
  if (!Number.isFinite(start) && Number.isFinite(end)) {
    const suffix = Math.max(0, Math.floor(end));
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Math.max(0, Math.floor(start));
    end = Number.isFinite(end) ? Math.min(size - 1, Math.floor(end)) : size - 1;
  }
  if (!Number.isFinite(start) || start >= size || end < start) return null;
  return { start, end };
}

/** Install after app.whenReady(), before creating the BrowserWindow. */
export async function installLocalMediaProtocol() {
  if (protocol.isProtocolHandled(LOCAL_MEDIA_SCHEME)) {
    await protocol.unhandle(LOCAL_MEDIA_SCHEME);
  }
  await protocol.handle(LOCAL_MEDIA_SCHEME, async (request) => {
    const filePath = localMediaUrlToPath(request.url);
    if (!filePath) return errorResponse(400, "Invalid local media URL");
    try {
      const [buffer, stat] = await Promise.all([fs.readFile(filePath), fs.stat(filePath)]);
      if (!stat.isFile()) return errorResponse(404, "Local media was not found");
      const contentType = MEDIA_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
      const rangeHeader = request.headers.get("range");
      const range = requestedRange(rangeHeader, buffer.byteLength);
      if (rangeHeader && !range) {
        return new Response(null, {
          status: 416,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Content-Range": `bytes */${buffer.byteLength}`,
          },
        });
      }
      const body = range ? buffer.subarray(range.start, range.end + 1) : buffer;
      const headers: Record<string, string> = {
        "Access-Control-Allow-Origin": "*",
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "Content-Length": String(body.byteLength),
        "Content-Type": contentType,
      };
      if (range) headers["Content-Range"] = `bytes ${range.start}-${range.end}/${buffer.byteLength}`;
      return new Response(body, { status: range ? 206 : 200, headers });
    } catch {
      return errorResponse(404, "Local media was not found");
    }
  });
}
