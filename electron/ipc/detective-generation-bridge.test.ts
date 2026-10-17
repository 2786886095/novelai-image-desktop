// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as tcpServer } from "node:net";
import axios from "axios";
import type { AppSettings } from "../../src/types";
vi.mock("./store", () => ({ getSettings: () => ({ proxyMode: "direct" }) }));
import { configureSystemProxyResolver } from "./proxy";
import { startDetectiveGenerationBridge } from "./detective-generation-bridge";

const payload = (seed = 42) => ({ model: "nai-diffusion-4-5-full", action: "generate",
  input: "SYNTHETIC_FIXTURE", parameters: { width: 832, height: 1216, n_samples: 1, seed } });
const token = "SYNTHETIC_FIXTURE_NOT_AN_ACCOUNT";
describe("iteration host transport: real local TCP, no paid endpoint", () => {
  const servers: Server[] = [], bridges: Awaited<ReturnType<typeof startDetectiveGenerationBridge>>[] = [];
  beforeEach(() => configureSystemProxyResolver(undefined));
  afterEach(async () => {
    configureSystemProxyResolver(undefined);
    await Promise.all(bridges.splice(0).map(b => b.close()));
    await Promise.all(servers.splice(0).map(s => new Promise<void>(r => {
      s.closeAllConnections(); s.close(() => r());
    })));
  });
  const serve = async (handler: (req: IncomingMessage, res: ServerResponse) => void) => {
    const s = createServer(handler); servers.push(s);
    const port = await new Promise<number>(r => s.listen(0, "127.0.0.1", () => r((s.address() as any).port)));
    return `http://127.0.0.1:${port}`;
  };
  const closedPort = async () => {
    const s = tcpServer();
    const p = await new Promise<number>(r => s.listen(0, "127.0.0.1", () => r((s.address() as any).port)));
    await new Promise<void>(r => s.close(() => r())); return p;
  };
  const start = async (endpoint: string, settings = { proxyMode: "direct" }, budget = 3) => {
    const b = await startDetectiveGenerationBridge({ imageBaseUrl: endpoint, token,
      settings: settings as AppSettings, budget }); bridges.push(b); return b;
  };
  const post = (b: (typeof bridges)[number], body: unknown = payload(), headers = {}) =>
    axios.post(b.connection.url, body, { proxy: false, validateStatus: () => true,
      headers: { "x-studio-bridge-key": b.connection.key, ...headers }, timeout: 3000 });

  it("follows a manual proxy although the origin's TCP port refuses direct connections", async () => {
    const port = await closedPort(); const seen: any[] = [];
    const proxy = await serve((q, s) => { seen.push({ url: q.url, token: q.headers.authorization,
      bridgeKey: q.headers["x-studio-bridge-key"] }); q.resume(); s.end("FIXTURE_ZIP"); });
    const endpoint = `http://127.0.0.1:${port}/custom-prefix`;
    const b = await start(endpoint, { proxyMode: "manual", proxyUrl: proxy, proxyForNai: true } as any);
    expect((await post(b)).status).toBe(200);
    expect(seen).toEqual([{ url: endpoint + "/ai/generate-image", token: "Bearer " + token, bridgeKey: undefined }]);
  });
  it("resolves PAC for the actual frozen generation URL and retains the prefix", async () => {
    const proxy = await serve((q, s) => { q.resume(); s.end("FIXTURE"); });
    const resolver = vi.fn(async () => "PROXY " + new URL(proxy).host);
    configureSystemProxyResolver(resolver);
    const b = await start("https://fixture.invalid/prefix/ai/generate-image-stream",
      { proxyMode: "auto", proxyForNai: true } as any);
    // HTTP proxy agents would CONNECT this HTTPS fixture, so test resolution
    // with a local HTTP origin instead; no external network is contacted.
    await b.close(); bridges.pop();
    const endpoint = `http://127.0.0.1:${await closedPort()}/prefix`;
    const a = await start(endpoint, { proxyMode: "auto", proxyForNai: true } as any);
    expect((await post(a)).status).toBe(200);
    expect(resolver).toHaveBeenLastCalledWith(endpoint + "/ai/generate-image");
  });
  it.each(["direct", "disabled category", "stale auto proxy", "DIRECT/TUN"])("retains %s routing", async mode => {
    let calls = 0; const endpoint = await serve((q, s) => { calls++; q.resume(); s.end("FIXTURE"); });
    const unused = await closedPort();
    configureSystemProxyResolver(async () => mode === "stale auto proxy" ? `PROXY 127.0.0.1:${unused}` : "DIRECT");
    const settings = mode === "disabled category"
      ? { proxyMode: "manual", proxyUrl: `http://127.0.0.1:${unused}`, proxyForNai: false }
      : { proxyMode: mode === "direct" ? "direct" : "auto", proxyForNai: true };
    expect((await post(await start(endpoint, settings as any))).status).toBe(200);
    expect(calls).toBe(1);
  });
  it("rejects wrong capabilities, browser origins, methods, paths, models and oversized bodies", async () => {
    let calls = 0; const endpoint = await serve((q, s) => { calls++; q.resume(); s.end(); });
    const b = await start(endpoint);
    expect((await post(b, payload(), { "x-studio-bridge-key": "x".repeat(64) })).status).toBe(403);
    expect((await post(b, payload(), { origin: "http://evil.invalid" })).status).toBe(403);
    expect((await axios.get(b.connection.url, { proxy: false, validateStatus: () => true })).status).toBe(403);
    expect((await axios.post(b.connection.url + "/other", payload(), { proxy: false, validateStatus: () => true,
      headers: { "x-studio-bridge-key": b.connection.key } })).status).toBe(403);
    expect((await post(b, { ...payload(), model: "nai-diffusion-5-full" })).status).toBe(400);
    expect((await post(b, { ...payload(), input: "x".repeat(270000) })).status).toBe(413);
    expect(calls).toBe(0);
  });
  it("never replays duplicates or exceeds the frozen image budget", async () => {
    let calls = 0; const endpoint = await serve((q, s) => { calls++; q.resume(); s.end("FIXTURE"); });
    const b = await start(endpoint, { proxyMode: "direct" }, 1);
    expect((await post(b)).status).toBe(200);
    expect((await post(b)).status).toBe(409);
    expect((await post(b, payload(43))).status).toBe(409);
    expect(calls).toBe(1);
  });
  it("forwards 429 delay without retrying; only explicit rejected requests can be retried", async () => {
    let calls = 0; const endpoint = await serve((q, s) => { calls++; q.resume();
      if (calls === 1) { s.writeHead(429, { "retry-after": "120" }); s.end(token); } else s.end("FIXTURE"); });
    const b = await start(endpoint, { proxyMode: "direct" }, 1); const rate = await post(b);
    expect(rate.status).toBe(429); expect(rate.headers["retry-after"]).toBe("120"); expect(rate.data).toBe("");
    expect(calls).toBe(1); expect((await post(b)).status).toBe(200); expect(calls).toBe(2);
  });
  it.each([401, 403, 503, 302])("does not retry, follow, leak errors or change hosts on HTTP %s", async status => {
    let calls = 0, redirected = 0; const other = await serve((q, s) => { redirected++; q.resume(); s.end(); });
    const endpoint = await serve((q, s) => { calls++; q.resume(); s.writeHead(status, { location: other }); s.end(token); });
    const b = await start(endpoint); const res = await post(b);
    expect(res.status).toBe(status); expect(res.data).toBe(""); expect(calls).toBe(1); expect(redirected).toBe(0);
    expect((await post(b)).status).toBe(409); expect(calls).toBe(1);
  });
  it("classifies refused connections as pre-submit and uncertain resets as non-replayable", async () => {
    const refused = await start(`http://127.0.0.1:${await closedPort()}`);
    for (let i = 0; i < 2; i++) {
      const res = await post(refused); expect(res.status).toBe(599);
      expect(res.headers["x-studio-network-failure"]).toBe("connect");
    }
    let calls = 0; const endpoint = await serve((q, _s) => { calls++; q.resume(); q.socket.destroy(); });
    const b = await start(endpoint); const res = await post(b);
    expect(res.status).toBe(598); expect(res.headers["x-studio-network-failure"]).toBe("uncertain");
    expect((await post(b)).status).toBe(409); expect(calls).toBe(1);
  });
  it("closes its listener idempotently instead of leaking per-run ports", async () => {
    const b = await start(await serve((q, s) => { q.resume(); s.end(); }));
    await Promise.all([b.close(), b.close()]); await expect(post(b)).rejects.toThrow();
  });
});

describe("bounded bridge network diagnostics without paid-request replay", () => {
  const bridges: Awaited<ReturnType<typeof startDetectiveGenerationBridge>>[] = [];
  const servers: Server[] = [];
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(bridges.splice(0).map(b => b.close()));
    await Promise.all(servers.splice(0).map(s => new Promise<void>(resolve => {
      s.closeAllConnections(); s.close(() => resolve());
    })));
  });
  const start = async (endpoint = "http://127.0.0.1:1", settings: any = { proxyMode: "direct" }, budget = 300) => {
    const b = await startDetectiveGenerationBridge({ imageBaseUrl: endpoint, token, settings, budget });
    bridges.push(b); return b;
  };
  // Use native loopback HTTP for the caller, so injected axios failures affect
  // only the production bridge's outbound request, never the probe itself.
  const post = async (b: (typeof bridges)[number], seed = 42) => {
    const { request } = await import("node:http");
    return new Promise<{ status: number; headers: Record<string, any>; body: string }>((resolve, reject) => {
      const bytes = Buffer.from(JSON.stringify(payload(seed)));
      const q = request(b.connection.url, { method: "POST", headers: {
        "x-studio-bridge-key": b.connection.key, "Content-Type": "application/json", "Content-Length": bytes.length,
      } }, response => {
        const chunks: Buffer[] = [];
        response.on("data", c => chunks.push(Buffer.from(c)));
        response.on("end", () => resolve({ status: response.statusCode!, headers: response.headers,
          body: Buffer.concat(chunks).toString("utf8") }));
      });
      q.setTimeout(4000, () => q.destroy(new Error("Synthetic local probe deadline")));
      q.on("error", reject); q.end(bytes);
    });
  };
  const serve = async (handler: (q: IncomingMessage, s: ServerResponse) => void) => {
    const s = createServer(handler); servers.push(s);
    const port = await new Promise<number>(resolve => s.listen(0, "127.0.0.1", () => resolve((s.address() as any).port)));
    return `http://127.0.0.1:${port}`;
  };
  it.each([
    ["ECONNREFUSED", "connection-refused", true], ["ENOTFOUND", "dns", true], ["EAI_AGAIN", "dns", true],
    ["ETIMEDOUT", "timeout", false], ["ECONNABORTED", "timeout", false],
    ["ECONNRESET", "reset", false], ["EPIPE", "reset", false],
    ["ERR_TLS_CERT_ALTNAME_INVALID", "tls", false], ["CERT_HAS_EXPIRED", "tls", false],
    ["DEPTH_ZERO_SELF_SIGNED_CERT", "tls", false], ["ERR_CANCELED", "cancelled", false],
    ["ABORT_ERR", "cancelled", false], ["ERR_BAD_RESPONSE", "other", false],
    ["SYNTHETIC_SECRET_IN_UNKNOWN_CODE", "other", false],
  ] as const)("reports only allowlisted classification for %s, preserving spent protection", async (code, safeCode, preconnect) => {
    const secret = "SYNTHETIC_PRIVATE_ERROR_TOKEN_PATH_AND_PROMPT";
    const outbound = vi.spyOn(axios, "post").mockRejectedValue({ code, message: secret,
      request: { headers: { Authorization: secret } }, config: { url: "https://secret.invalid/" + secret } });
    const b = await start("http://127.0.0.1:1/frozen-prefix"); const result = await post(b);
    expect(result.status).toBe(preconnect ? 599 : 598);
    expect(result.headers["x-studio-network-failure"]).toBe(preconnect ? "connect" : "uncertain");
    expect(result.headers["x-studio-network-code"]).toBe(safeCode);
    expect(result.body).toBe(""); expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain("SYNTHETIC_SECRET_IN_UNKNOWN_CODE");
    expect(outbound).toHaveBeenCalledTimes(1);
    expect(outbound.mock.calls[0][0]).toBe("http://127.0.0.1:1/frozen-prefix/ai/generate-image");
    expect(outbound.mock.calls[0][2]).toMatchObject({ timeout: 180_000, maxRedirects: 0,
      headers: { Authorization: "Bearer " + token } });
    const replay = await post(b);
    expect(replay.status).toBe(preconnect ? 599 : 409);
    expect(outbound).toHaveBeenCalledTimes(preconnect ? 2 : 1);
  });
  it("uses a string cause code before outer code, without guessing from error text", async () => {
    const outbound = vi.spyOn(axios, "post").mockRejectedValue({ code: "ECONNREFUSED",
      cause: { code: "ECONNRESET" }, message: "connection refused TLS expired timeout SYNTHETIC_PRIVATE" });
    const b = await start(); const result = await post(b);
    expect(result.status).toBe(598); expect(result.headers["x-studio-network-code"]).toBe("reset");
    expect(result.headers["x-studio-network-failure"]).toBe("uncertain");
    expect((await post(b)).status).toBe(409); expect(outbound).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("SYNTHETIC_PRIVATE");
  });
  it("does not coerce a non-string error code or infer safety from arbitrary message text", async () => {
    const outbound = vi.spyOn(axios, "post").mockRejectedValue({ code: { toString: () => "ECONNREFUSED" },
      message: "ECONNREFUSED SYNTHETIC_PRIVATE" });
    const b = await start(); const result = await post(b);
    expect(result.status).toBe(598); expect(result.headers["x-studio-network-code"]).toBe("other");
    expect(result.headers["x-studio-network-failure"]).toBe("uncertain");
    expect((await post(b)).status).toBe(409); expect(outbound).toHaveBeenCalledTimes(1);
  });
  it("does not forward upstream diagnostic headers or secret error bodies", async () => {
    const endpoint = await serve((q, s) => { q.resume(); s.writeHead(503, {
      "x-studio-network-failure": "connect", "x-studio-network-code": "SYNTHETIC_PRIVATE",
    }); s.end("SYNTHETIC_PRIVATE"); });
    const b = await start(endpoint); const result = await post(b);
    expect(result.status).toBe(503); expect(result.body).toBe("");
    expect(result.headers["x-studio-network-code"]).toBeUndefined();
    expect(result.headers["x-studio-network-failure"]).toBeUndefined();
    expect((await post(b)).status).toBe(409);
  });
  it.each(["direct", "manual"])("admits 300 unique %s loopback requests including137/138 and preserves the frozen budget", async mode => {
    const seen: number[] = [];
    const endpoint = await serve((q, s) => { let text = ""; q.setEncoding("utf8");
      q.on("data", c => text += c); q.on("end", () => { seen.push(JSON.parse(text).parameters.seed); s.end("SYNTHETIC_ZIP"); }); });
    const b = await start(mode === "manual" ? "http://127.0.0.1:1/frozen-prefix" : endpoint,
      mode === "manual" ? { proxyMode: "manual", proxyForNai: true, proxyUrl: endpoint } : { proxyMode: "direct" });
    for (let i = 1; i <= 300; i++) expect((await post(b, i)).status, `submission ${i}`).toBe(200);
    expect(seen).toEqual(Array.from({ length: 300 }, (_, i) => i + 1));
    expect((await post(b, 137)).status).toBe(409); expect((await post(b, 301)).status).toBe(409);
    expect(seen.length).toBe(300);
    console.log(JSON.stringify({ mode, actualLoopbackSuccess: 300, duplicate137: 409, overBudget301: 409,
      scope: "synthetic loopback transport; not model generation or original reported cause" }));
  }, 30_000);
  it("keeps received request137 spent after actual TCP reset while a distinct138 can proceed", async () => {
    const seen: number[] = [];
    const endpoint = await serve((q, s) => { let text = ""; q.setEncoding("utf8"); q.on("data", c => text += c);
      q.on("end", () => { const seed = JSON.parse(text).parameters.seed; seen.push(seed);
        if (seed === 137) q.socket.destroy(); else s.end("SYNTHETIC_ZIP"); }); });
    const b = await start(endpoint);
    for (let i = 1; i <= 136; i++) expect((await post(b, i)).status).toBe(200);
    const result = await post(b, 137);
    expect(result.status).toBe(598); expect(result.headers["x-studio-network-failure"]).toBe("uncertain");
    expect(result.headers["x-studio-network-code"]).toBe("reset"); expect(result.body).toBe("");
    expect((await post(b, 137)).status).toBe(409); expect(seen.length).toBe(137);
    expect((await post(b, 138)).status).toBe(200); expect(seen.length).toBe(138);
    console.log(JSON.stringify({ resetAt: 137, status: 598, safeCode: result.headers["x-studio-network-code"],
      duplicate: 409, actualOutboundRequests: seen.length, nextDistinct: 200 }));
  }, 30_000);
});
