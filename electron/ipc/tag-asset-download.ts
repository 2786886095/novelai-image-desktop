import axios from "axios";
import type { Readable } from "node:stream";
import { proxyConfigForUrl } from "./proxy";
import { getSettings } from "./store";

const assetIds: Record<string, number> = {
  "tag_catalog.db": 533720512,
  "cooccurrence-v2.db.gz": 525243775,
  "tags-2026-11-16-zh-CN.sqlite.gz": 754870215,
  "tags-2026-11-16-zh-TW.sqlite.gz": 754870218,
  "tags-2026-11-16-ja-JP.sqlite.gz": 754870221,
  "tags-2026-11-16-ko-KR.sqlite.gz": 754870222,
};
const cdn = "release-assets.githubusercontent.com";
const storage = "releaseassetproduction.blob.core.windows.net";
const allowed = new Set(["github.com", "api.github.com", cdn, "objects.githubusercontent.com", storage]);

export async function openTagAsset(url: string, size: number, signal = new AbortController().signal, offset = 0) {
  const canonical = new URL(url);
  const [, owner, repo] = canonical.pathname.split("/");
  const id = assetIds[canonical.pathname.split("/").pop()!];
  const candidates = [canonical];
  if (id) candidates.push(new URL(`https://api.github.com/repos/${owner}/${repo}/releases/assets/${id}?download=${Date.now()}`));
  const failures: string[] = [];
  const seen = new Set<string>();
  while (candidates.length) {
    const target = candidates.shift()!;
    signal.throwIfAborted();
    if (seen.has(target.href)) continue;
    seen.add(target.href);
    if (target.protocol !== "https:" || target.port || target.username || target.password || !allowed.has(target.hostname)) {
      throw new Error("Unexpected tag download host");
    }
    try {
      const response = await axios.get<Readable>(target.href, {
        ...await proxyConfigForUrl("update", target.origin + target.pathname, getSettings()),
        responseType: "stream", timeout: 30_000, maxRedirects: 0, signal,
        maxContentLength: size, validateStatus: () => true,
        headers: { Accept: "application/octet-stream", ...(offset ? { Range: `bytes=${offset}-` } : {}) },
      });
      if ([200, 206].includes(response.status) && !/(json|text\/html)/i.test(String(response.headers["content-type"]))) return response;
      if (offset && response.status === 416) return response;
      response.data.destroy();
      if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.location && seen.size < 8) {
        const next = new URL(response.headers.location, target);
        candidates.unshift(next);
        if (next.hostname === cdn && next.pathname.startsWith("/github-production-release-asset/")) {
          const blob = new URL(next.href);
          blob.hostname = storage;
          candidates.splice(1, 0, blob);
        }
      } else failures.push(`${target.hostname}: HTTP ${response.status}`);
    } catch (error) {
      signal.throwIfAborted();
      failures.push(`${target.hostname}: ${axios.isAxiosError(error) ? error.code ?? "network" : "connection failed"}`);
    }
  }
  throw new Error("Tag download failed (" + failures.join(", ") + ")");
}
