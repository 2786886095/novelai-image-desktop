import { createServer, type ServerResponse } from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import axios from "axios";
import type { AppSettings } from "../../src/types";
import { normalizeNovelAiEndpoint } from "../../src/nai-endpoint";
import { proxyConfigForUrl } from "./proxy";

const MAX_BODY = 256 * 1024;
const MAX_IMAGE = 64 * 1024 * 1024;
const PRECONNECT = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"]);

/** A per-worker capability, not a general proxy. The host retains the frozen
 * account/endpoint and performs exactly one outbound POST using the same proxy
 * policy as ordinary generation. No redirects, remote-error echoes or fallback. */
export async function startDetectiveGenerationBridge(binding: {
  imageBaseUrl: string; token: string; settings: AppSettings; budget: number;
}) {
  const base = new URL(normalizeNovelAiEndpoint(binding.imageBaseUrl, ""));
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (base.username || base.password || base.search || base.hash ||
      !(base.protocol === "https:" || (base.protocol === "http:" && local)) ||
      !binding.token || !Number.isSafeInteger(binding.budget) || binding.budget < 1) {
    throw new Error("Invalid frozen iteration transport binding");
  }
  const target = base.toString().replace(/\/$/, "") + "/ai/generate-image";
  const settings = { ...binding.settings };
  const key = randomBytes(32).toString("hex");
  const used = new Set<string>();
  const abort = new AbortController();
  let busy = false, closed = false;
  const reply = (res: ServerResponse, status: number, kind?: "connect" | "uncertain") => {
    if (res.destroyed) return;
    res.writeHead(status, kind ? { "x-studio-network-failure": kind } : {});
    res.end();
  };
  const server = createServer(async (req, res) => {
    const supplied = String(req.headers["x-studio-bridge-key"] ?? "");
    const allowed = /^[0-9a-f]{64}$/.test(supplied) &&
      timingSafeEqual(Buffer.from(supplied), Buffer.from(key));
    if (!allowed || req.headers.origin || req.method !== "POST" || req.url !== "/generate") {
      reply(res, 403); return;
    }
    if (closed || busy) { reply(res, 409); return; }
    busy = true;
    let hash: string | undefined;
    try {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY) { reply(res, 413); return; }
        chunks.push(Buffer.from(chunk));
      }
      const bytes = Buffer.concat(chunks);
      let payload: any;
      try { payload = JSON.parse(bytes.toString("utf8")); } catch { reply(res, 400); return; }
      if (payload?.model !== "nai-diffusion-4-5-full" || payload.action !== "generate" ||
          typeof payload.input !== "string" || !payload.parameters ||
          (payload.parameters.n_samples !== undefined && payload.parameters.n_samples !== 1)) {
        reply(res, 400); return;
      }
      hash = createHash("sha256").update(bytes).digest("hex");
      // An interrupted/uncertain submission remains spent. Never silently replay.
      if (used.has(hash) || used.size >= binding.budget) { reply(res, 409); return; }
      const proxy = await proxyConfigForUrl("nai", target, settings);
      used.add(hash);
      const response = await axios.post(target, payload, {
        ...proxy, headers: { Authorization: `Bearer ${binding.token}`,
          "Content-Type": "application/json", Accept: "application/zip, application/octet-stream" },
        responseType: "arraybuffer", timeout: 180_000,
        maxBodyLength: MAX_BODY, maxContentLength: MAX_IMAGE,
        maxRedirects: 0, validateStatus: () => true, signal: abort.signal,
      });
      if (response.status === 429) used.delete(hash);
      // The worker needs only status + Retry-After, never a secret-bearing error body.
      const headers: Record<string, string> = {};
      if (response.status === 429 && response.headers["retry-after"] !== undefined) {
        headers["retry-after"] = String(response.headers["retry-after"]).slice(0, 128);
      }
      if (response.status === 200) headers["content-type"] = "application/zip";
      if (!res.destroyed) {
        res.writeHead(response.status, headers);
        res.end(response.status === 200 ? Buffer.from(response.data) : undefined);
      }
    } catch (error: any) {
      const code = String(error?.cause?.code ?? error?.code ?? "");
      const preconnect = PRECONNECT.has(code);
      if (preconnect && hash) used.delete(hash);
      // 598/599 are private bridge statuses, never mistaken for upstream success.
      reply(res, preconnect ? 599 : 598, preconnect ? "connect" : "uncertain");
    } finally { busy = false; }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    // Listen before returning/spawning Python; an ephemeral port avoids collisions.
    server.listen(0, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); });
  });
  server.unref();
  const port = (server.address() as { port: number }).port;
  let closing: Promise<void> | undefined;
  return {
    connection: { url: `http://127.0.0.1:${port}/generate`, key },
    close() {
      return closing ??= new Promise<void>(resolve => {
        closed = true; abort.abort(); server.closeAllConnections(); server.close(() => resolve());
      });
    },
  };
}
