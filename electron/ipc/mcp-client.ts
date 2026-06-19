// Minimal MCP (Model Context Protocol) client used to drive tag-search servers
// such as DanbooruSearchOnline. Supports three transports:
//   - "http"  : Streamable HTTP (the modern transport; what DanbooruSearchOnline
//               exposes at /mcp/mcp). One endpoint, JSON-RPC over POST, replies
//               as application/json OR text/event-stream, session via header.
//   - "sse"   : Legacy HTTP+SSE transport (GET opens a stream that first sends an
//               "endpoint" event; subsequent JSON-RPC requests POST to it).
//   - "stdio" : Spawn a local server and speak newline-delimited JSON-RPC.
//
// We perform the standard handshake (initialize -> notifications/initialized),
// discover the tool's argument schema via tools/list, then tools/call. The tool
// result's text content is returned to the caller for tag parsing.

import axios from "axios";
import { spawn } from "child_process";
import { EventEmitter } from "events";
import { proxyConfig } from "./proxy";

const CLIENT_INFO = { name: "langbai-novelai-studio", version: "0.9.2" };
const PROTOCOL_VERSION = "2024-11-05";

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: any;
  error?: { code: number; message: string };
}

function rpc(method: string, params?: unknown, id?: number): JsonRpcMessage {
  const msg: JsonRpcMessage = { jsonrpc: "2.0", method };
  if (id !== undefined) msg.id = id;
  if (params !== undefined) msg.params = params;
  return msg;
}

/** Parse a body that may be plain JSON or SSE-framed (`data: {...}`). */
function parseBody(raw: string): JsonRpcMessage | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      return JSON.parse(text);
    } catch {
      /* fall through to SSE parsing */
    }
  }
  let last: JsonRpcMessage | null = null;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^data:\s?(.*)$/);
    if (!m) continue;
    try {
      last = JSON.parse(m[1]);
    } catch {
      /* ignore keep-alive / non-JSON frames */
    }
  }
  return last;
}

/** Build a tools/call arguments object from the tool's inputSchema. */
function buildArgs(inputSchema: any, query: string, limit: number): Record<string, unknown> {
  const props = inputSchema?.properties;
  if (!props || typeof props !== "object") return { query };
  const args: Record<string, unknown> = {};
  let stringSet = false;
  for (const [key, def] of Object.entries<any>(props)) {
    const type = def?.type;
    const isString = type === "string" || (Array.isArray(type) && type.includes("string"));
    const isNumber = type === "integer" || type === "number";
    if (!stringSet && isString) {
      args[key] = query;
      stringSet = true;
    } else if (isNumber && /limit|top|count|num|size|\bk\b/i.test(key)) {
      args[key] = limit;
    }
  }
  if (!stringSet) args.query = query;
  return args;
}

/** Join an MCP tool result's content blocks into a single text string. */
function resultToText(result: any): string {
  if (!result) return "";
  const content = result.content;
  if (Array.isArray(content)) {
    const text = content
      .map((c: any) => (typeof c === "string" ? c : typeof c?.text === "string" ? c.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
    if (text) return text;
  }
  if (result.structuredContent) return JSON.stringify(result.structuredContent);
  return "";
}

// ── Streamable HTTP transport ──────────────────────────────────────────────────
// Cache the handshake (session id + tool arg schema) per endpoint so repeated
// capsule searches only cost ONE round-trip (tools/call) instead of three.
interface HttpSession {
  sessionId: string;
  argSchema: any;
  ts: number;
}
const httpSessions = new Map<string, HttpSession>();
const SESSION_TTL_MS = 5 * 60 * 1000;

function makePost(url: string, headers: Record<string, string>, getSid: () => string, setSid: (s: string) => void) {
  return async (body: JsonRpcMessage): Promise<JsonRpcMessage | null> => {
    const h = { ...headers };
    const sid = getSid();
    if (sid) h["Mcp-Session-Id"] = sid;
    const resp = await axios.post(url, body, {
      headers: h,
      timeout: 20_000,
      responseType: "text",
      transformResponse: (d) => d,
      validateStatus: () => true,
      ...proxyConfig("mcp"),
    });
    const newSid = resp.headers["mcp-session-id"];
    if (newSid) setSid(String(newSid));
    const data = typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data);
    return parseBody(data);
  };
}

async function callHttp(
  endpoint: string,
  apiKey: string,
  tool: string,
  query: string,
  limit: number,
): Promise<string> {
  const url = endpoint.replace(/\/+$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const cacheKey = `${url}|${tool}|${apiKey}`;

  let sessionId = "";
  const post = makePost(url, headers, () => sessionId, (s) => { sessionId = s; });

  // Fast path: reuse a warm session and skip initialize + tools/list.
  const cached = httpSessions.get(cacheKey);
  if (cached && Date.now() - cached.ts < SESSION_TTL_MS) {
    sessionId = cached.sessionId;
    try {
      const call = await post(rpc("tools/call", { name: tool, arguments: buildArgs(cached.argSchema, query, limit) }, 3));
      if (call?.error) throw new Error(call.error.message || "MCP tools/call 失败");
      cached.ts = Date.now();
      cached.sessionId = sessionId;
      return resultToText(call?.result);
    } catch {
      httpSessions.delete(cacheKey); // stale session — fall through to full handshake
      sessionId = "";
    }
  }

  await post(rpc("initialize", { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO }, 1));
  try {
    await post(rpc("notifications/initialized"));
  } catch {
    /* notification failures are non-fatal */
  }

  let argSchema: any = null;
  try {
    const list = await post(rpc("tools/list", {}, 2));
    const tools = list?.result?.tools ?? [];
    const found = tools.find((t: any) => t?.name === tool) ?? tools[0];
    argSchema = found?.inputSchema ?? null;
  } catch {
    /* tools/list optional; fall back to a default arg name */
  }

  const call = await post(rpc("tools/call", { name: tool, arguments: buildArgs(argSchema, query, limit) }, 3));
  if (call?.error) throw new Error(call.error.message || "MCP tools/call 失败");
  httpSessions.set(cacheKey, { sessionId, argSchema, ts: Date.now() });
  return resultToText(call?.result);
}

// ── Legacy HTTP + SSE transport ────────────────────────────────────────────────
async function callSse(
  endpoint: string,
  apiKey: string,
  tool: string,
  query: string,
  limit: number,
): Promise<string> {
  const url = endpoint.replace(/\/+$/, "");
  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  // Open the SSE stream; the server's first "endpoint" event tells us where to POST.
  const streamResp = await axios.get(url, {
    headers: { ...headers, Accept: "text/event-stream" },
    responseType: "stream",
    timeout: 0,
    ...proxyConfig("mcp"),
  });

  const emitter = new EventEmitter();
  let postUrl = "";
  let buffer = "";
  const pending = new Map<number, (msg: JsonRpcMessage) => void>();

  const stream = streamResp.data as NodeJS.ReadableStream;
  stream.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    const events = buffer.split(/\n\n/);
    buffer = events.pop() ?? "";
    for (const ev of events) {
      let eventName = "message";
      const dataLines: string[] = [];
      for (const line of ev.split(/\r?\n/)) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      const data = dataLines.join("\n");
      if (eventName === "endpoint") {
        postUrl = data.startsWith("http") ? data : new URL(data, url).toString();
        emitter.emit("endpoint");
      } else if (data) {
        try {
          const msg: JsonRpcMessage = JSON.parse(data);
          if (typeof msg.id === "number" && pending.has(msg.id)) {
            pending.get(msg.id)!(msg);
            pending.delete(msg.id);
          }
        } catch {
          /* ignore non-JSON frames */
        }
      }
    }
  });

  const waitEndpoint = new Promise<void>((resolve, reject) => {
    if (postUrl) return resolve();
    const t = setTimeout(() => reject(new Error("SSE 未在 10s 内返回 endpoint 事件")), 10_000);
    emitter.once("endpoint", () => {
      clearTimeout(t);
      resolve();
    });
  });

  const send = (body: JsonRpcMessage, expectId?: number): Promise<JsonRpcMessage | null> =>
    new Promise(async (resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;
      if (expectId !== undefined) {
        timer = setTimeout(() => {
          pending.delete(expectId);
          reject(new Error("MCP 响应超时"));
        }, 20_000);
        pending.set(expectId, (msg) => {
          if (timer) clearTimeout(timer);
          resolve(msg);
        });
      }
      try {
        await axios.post(postUrl, body, { headers: { ...headers, "Content-Type": "application/json" }, timeout: 20_000, ...proxyConfig("mcp") });
        if (expectId === undefined) resolve(null);
      } catch (e) {
        if (timer) clearTimeout(timer);
        if (expectId !== undefined) pending.delete(expectId);
        reject(e);
      }
    });

  try {
    await waitEndpoint;
    await send(rpc("initialize", { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO }, 1), 1);
    await send(rpc("notifications/initialized"));
    let argSchema: any = null;
    try {
      const list = await send(rpc("tools/list", {}, 2), 2);
      const tools = list?.result?.tools ?? [];
      const found = tools.find((t: any) => t?.name === tool) ?? tools[0];
      argSchema = found?.inputSchema ?? null;
    } catch {
      /* optional */
    }
    const call = await send(rpc("tools/call", { name: tool, arguments: buildArgs(argSchema, query, limit) }, 3), 3);
    if (call?.error) throw new Error(call.error.message || "MCP tools/call 失败");
    return resultToText(call?.result);
  } finally {
    try {
      (stream as any).destroy?.();
    } catch {
      /* ignore */
    }
  }
}

// ── stdio transport ────────────────────────────────────────────────────────────
async function callStdio(
  command: string,
  argv: string[],
  tool: string,
  query: string,
  limit: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argv, {
      shell: process.platform === "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let settled = false;
    const pending = new Map<number, (msg: JsonRpcMessage) => void>();

    const cleanup = () => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };
    const done = (text: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(text);
    };

    const overall = setTimeout(() => fail(new Error("stdio MCP 在 25s 内无响应")), 25_000);

    child.on("error", (e) => {
      clearTimeout(overall);
      fail(new Error(`无法启动 MCP 进程：${e.message}`));
    });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        try {
          const msg: JsonRpcMessage = JSON.parse(t);
          if (typeof msg.id === "number" && pending.has(msg.id)) {
            pending.get(msg.id)!(msg);
            pending.delete(msg.id);
          }
        } catch {
          /* ignore log noise on stdout */
        }
      }
    });

    const write = (body: JsonRpcMessage) => child.stdin.write(JSON.stringify(body) + "\n");
    const request = (body: JsonRpcMessage, id: number): Promise<JsonRpcMessage> =>
      new Promise((res, rej) => {
        const t = setTimeout(() => {
          pending.delete(id);
          rej(new Error("stdio MCP 响应超时"));
        }, 20_000);
        pending.set(id, (msg) => {
          clearTimeout(t);
          res(msg);
        });
        write(body);
      });

    (async () => {
      try {
        await request(rpc("initialize", { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO }, 1), 1);
        write(rpc("notifications/initialized"));
        let argSchema: any = null;
        try {
          const list = await request(rpc("tools/list", {}, 2), 2);
          const tools = list?.result?.tools ?? [];
          const found = tools.find((tt: any) => tt?.name === tool) ?? tools[0];
          argSchema = found?.inputSchema ?? null;
        } catch {
          /* optional */
        }
        const call = await request(rpc("tools/call", { name: tool, arguments: buildArgs(argSchema, query, limit) }, 3), 3);
        clearTimeout(overall);
        if (call?.error) return fail(new Error(call.error.message || "MCP tools/call 失败"));
        done(resultToText(call?.result));
      } catch (e: any) {
        clearTimeout(overall);
        fail(e instanceof Error ? e : new Error(String(e)));
      }
    })();
  });
}

export interface McpConfig {
  type: "http" | "sse" | "stdio";
  url: string;
  apiKey: string;
  tool: string;
  command: string;
  args: string;
}

/**
 * Run a tag search against the configured MCP server. Returns the joined text
 * content of the tool result (the caller parses it into tag suggestions).
 */
export async function mcpSearch(config: McpConfig, query: string, limit: number): Promise<string> {
  const tool = config.tool.trim() || "search_tags";
  if (config.type === "stdio") {
    if (!config.command.trim()) throw new Error("stdio 模式需要填写启动命令。");
    const argv = config.args.trim() ? config.args.trim().split(/\s+/) : [];
    return callStdio(config.command.trim(), argv, tool, query, limit);
  }
  if (!config.url.trim()) throw new Error("请填写 MCP 服务地址。");
  if (config.type === "sse") return callSse(config.url.trim(), config.apiKey.trim(), tool, query, limit);
  return callHttp(config.url.trim(), config.apiKey.trim(), tool, query, limit);
}
