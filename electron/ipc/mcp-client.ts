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

const CLIENT_INFO = { name: "langbai-novelai-studio", version: "2.5.3" };
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

export interface McpToolInfo { name: string; description?: string; inputSchema: Record<string, any> }
/** Discover all pages; a repeated cursor is an error, not an infinite loop. */
async function collectTools(send: (body: JsonRpcMessage, id: number) => Promise<JsonRpcMessage | null>): Promise<McpToolInfo[]> {
  const tools = new Map<string, McpToolInfo>(), cursors = new Set<string>();
  let cursor: string | undefined;
  for (let page=0; page<50; page++) {
    const result = await send(rpc("tools/list", cursor ? {cursor} : {}, 2+page), 2+page);
    if (result?.error || !Array.isArray(result?.result?.tools)) throw Error("MCP tools/list failed");
    for (const tool of result!.result.tools) {
      if (typeof tool?.name !== 'string' || !tool.name.trim() || !tool.inputSchema || typeof tool.inputSchema !== 'object') throw Error('Invalid MCP tool schema');
      tools.set(tool.name, {name:tool.name, ...(typeof tool.description==='string'?{description:tool.description}:{}), inputSchema:tool.inputSchema});
    }
    const next = result!.result.nextCursor;
    if (next === undefined || next === null || next === '') return [...tools.values()];
    if (typeof next !== 'string' || cursors.has(next)) throw Error('Invalid MCP pagination cursor');
    cursors.add(next); cursor=next;
  }
  throw Error('MCP tool list exceeds page limit');
}
function buildArgs(schema: any, query: string, limit: number): Record<string, unknown> {
  const props=schema?.properties;
  if (!props || typeof props!=='object') return {query};
  const args:Record<string,unknown>={};
  const queryKey=Object.keys(props).find(k=>/^(query|q|text|prompt|description|tags?|keywords?|search)$/i.test(k))
    ?? Object.keys(props).find(k=>props[k]?.type==='string'||(props[k]?.type==='array'&&props[k]?.items?.type==='string'));
  for (const [key,def] of Object.entries<any>(props)) {
    if (key===queryKey) args[key]=def.type==='array'?query.split(/[,，\n]/).map(s=>s.trim()).filter(Boolean):query;
    else if (['integer','number'].includes(def?.type)&&/limit|top|count|num|size|^k$/i.test(key)) args[key]=limit;
    else if (Array.isArray(schema?.required)&&schema.required.includes(key)) {
      if (def.default!==undefined) args[key]=def.default;
      else throw Error('MCP required argument needs explicit configuration: '+key);
    }
  }
  return args;
}

/** Join an MCP tool result's content blocks into a single text string. */
function resultToText(result: any): string {
  if (result?.isError) throw Error("MCP tool returned an error");
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
    if (resp.status < 200 || resp.status >= 300) throw Error(`MCP HTTP ${resp.status}`);
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
  listOnly = false,
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
  if (!listOnly && cached && Date.now() - cached.ts < SESSION_TTL_MS) {
    sessionId = cached.sessionId;
    const call = await post(rpc("tools/call", { name: tool, arguments: buildArgs(cached.argSchema, query, limit) }, 1002));
    if (call?.error) throw new Error("MCP tools/call failed");
    cached.ts = Date.now(); cached.sessionId = sessionId;
    return resultToText(call?.result);
  }

  await post(rpc("initialize", { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO }, 1));
  try {
    await post(rpc("notifications/initialized"));
  } catch {
    /* notification failures are non-fatal */
  }

  const tools = await collectTools(body => post(body));
  if (listOnly) return JSON.stringify(tools);
  const found = tools.find(t => t.name === tool);
  if (!found) throw Error('Selected MCP tool was not discovered');
  const argSchema = found.inputSchema;

  const call = await post(rpc("tools/call", { name: tool, arguments: buildArgs(argSchema, query, limit) }, 3));
  if (call?.error) throw new Error(call.error.message || "MCP tools/call 失败");
  httpSessions.set(cacheKey, { sessionId, argSchema, ts: Date.now() });
  return resultToText(call?.result);
}

// SECURITY: the server picks the "endpoint" event's URL. Without an origin
// check, a malicious or compromised server (or a MITM on the configured
// proxy) could point it at an attacker-controlled host and still receive our
// Authorization header on the POST that follows. Same-origin only.
export function resolveSseEndpoint(
  data: string,
  streamUrl: string,
): { ok: true; url: string } | { ok: false; origin: string } {
  const resolved = data.startsWith("http") ? data : new URL(data, streamUrl).toString();
  const resolvedOrigin = new URL(resolved).origin;
  if (resolvedOrigin !== new URL(streamUrl).origin) return { ok: false, origin: resolvedOrigin };
  return { ok: true, url: resolved };
}

// ── Legacy HTTP + SSE transport ────────────────────────────────────────────────
async function callSse(
  endpoint: string,
  apiKey: string,
  tool: string,
  query: string,
  limit: number,
  listOnly = false,
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
        const resolution = resolveSseEndpoint(data, url);
        if (!resolution.ok) {
          emitter.emit("endpoint-error", new Error(`MCP endpoint 事件跳转到了不同源（${resolution.origin}），已拒绝以避免泄露密钥。`));
        } else {
          postUrl = resolution.url;
          emitter.emit("endpoint");
        }
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
    emitter.once("endpoint-error", (err: Error) => {
      clearTimeout(t);
      reject(err);
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
    const tools = await collectTools((body,id) => send(body,id));
    if (listOnly) return JSON.stringify(tools);
    const found = tools.find(t => t.name === tool);
    if (!found) throw Error('Selected MCP tool was not discovered');
    const argSchema = found.inputSchema;
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
  listOnly = false,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argv, {
      shell: process.platform === "win32" && !/\.exe$/i.test(command),
      windowsHide: true,
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
        const tools = await collectTools(request);
        if (listOnly) { clearTimeout(overall); done(JSON.stringify(tools)); return; }
        const found = tools.find(t => t.name === tool);
        if (!found) throw Error('Selected MCP tool was not discovered');
        const argSchema = found.inputSchema;
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

/** Read-only discovery; never invokes an advertised tool. */
export async function mcpListTools(config: McpConfig): Promise<McpToolInfo[]> {
  const tool=config.tool.trim()||'search_tags';
  if(config.type==='stdio') {
    if(!config.command.trim()) throw Error('MCP command is required');
    return JSON.parse(await callStdio(config.command.trim(), config.args.trim()?config.args.trim().split(/\s+/):[], tool, '', 1, true));
  }
  if(!config.url.trim()) throw Error('MCP URL is required');
  return JSON.parse(await (config.type==='sse'?callSse:callHttp)(config.url.trim(),config.apiKey.trim(),tool,'',1,true));
}
