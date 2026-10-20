import http from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import type { Socket } from 'node:net';
import { COMFY_LIMITS } from '../../src/comfyui/contract';
import { parseUntrustedJson } from '../../src/comfyui/format-detect';

export interface ComfyTarget { host: '127.0.0.1' | '::1'; port: number; baseUrl: string }
export type ComfyTargetInput = ComfyTarget | string | { host?: string; port: number; baseUrl?: string };
export interface ComfyHttpOptions { timeoutMs?: number; maxBytes?: number; signal?: AbortSignal }
export class ComfyHttpError extends Error {
  readonly responseJson?: unknown;
  constructor(message: string, readonly status = 0, readonly responseBody = Buffer.alloc(0)) {
    super(message); this.name = 'ComfyHttpError';
    try { this.responseJson = safeJson(responseBody.toString('utf8')); } catch { /* non-JSON diagnostic */ }
  }
}

/** No DNS, credentials, proxy, redirects, remote host, or arbitrary base path. */
export function resolveLoopbackTarget(input: ComfyTargetInput): ComfyTarget {
  const raw = typeof input === 'string' ? input : input.baseUrl || `http://${input.host === '::1' ? '[::1]' : input.host || '127.0.0.1'}:${input.port}`;
  if (!/^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?\/?$/i.test(raw)) throw new Error('COMFY_LOOPBACK_TARGET');
  const url = new URL(raw), host = url.hostname === '[::1]' ? '::1' : '127.0.0.1';
  const port = Number(url.port || 80);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('COMFY_PORT');
  if (typeof input !== 'string' && input.port !== port) throw new Error('COMFY_TARGET_MISMATCH');
  return { host, port, baseUrl: `http://${host === '::1' ? '[::1]' : host}:${port}` };
}

function allowedPath(route: string, method: string): string {
  if (!route.startsWith('/') || route.startsWith('//') || /[\\\r\n\0#]/.test(route)) throw new Error('COMFY_ROUTE');
  const rawPath = route.split('?')[0];
  if (/(?:^|\/)\.{1,2}(?:\/|$)/.test(decodeURIComponent(rawPath)) || /%(?:2f|5c|00)/i.test(rawPath)) throw new Error('COMFY_ROUTE');
  const parsed = new URL(route, 'http://127.0.0.1');
  const path = parsed.pathname.replace(/^\/api(?=\/)/, '');
  const get = /^\/(?:system_stats|object_info(?:\/[^/]+)?|models(?:\/[^/]+)?|templates\/(?:index|[a-zA-Z0-9_.-]+)\.json|queue|history\/[a-zA-Z0-9_-]+|view)$/;
  const post = /^\/(?:prompt|queue|interrupt)$/;
  const allowed = method === 'GET' ? get : method === 'POST' ? post : null;
  if (!allowed?.test(path) || /(?:^|\/)\.{1,2}(?:\/|$)/.test(decodeURIComponent(path))) throw new Error('COMFY_ROUTE');
  if (path === '/view') {
    const kind = parsed.searchParams.get('type') || 'output';
    if (!['output', 'temp'].includes(kind)) throw new Error('COMFY_VIEW_TYPE');
  }
  return route;
}
function routeLimits(route: string): Required<Pick<ComfyHttpOptions, 'timeoutMs' | 'maxBytes'>> {
  if (/\/object_info(?:\/|$)/.test(route)) return { maxBytes: 64 * 1024 ** 2, timeoutMs: 120_000 };
  if (/\/view(?:\?|$)/.test(route)) return { maxBytes: 64 * 1024 ** 2, timeoutMs: 60_000 };
  if (/\/history\//.test(route)) return { maxBytes: 16 * 1024 ** 2, timeoutMs: 10_000 };
  return { maxBytes: 1024 ** 2, timeoutMs: 3_000 };
}
export function safeJson(text: string): unknown {
  // /object_info can legitimately exceed the workflow limit. Per-route byte
  // ceilings are enforced before decoding; the common JSON validator still
  // bounds value count, nesting, strings, finite values and forbidden keys.
  return parseUntrustedJson(text, { maxBytes: 64 * 1024 ** 2, maxDepth: COMFY_LIMITS.jsonDepth });
}

export async function comfyRequest(targetInput: ComfyTargetInput, route: string, options: ComfyHttpOptions & { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  const target = resolveLoopbackTarget(targetInput), method = options.method || 'GET';
  allowedPath(route, method);
  const defaults = routeLimits(route), maxBytes = Math.min(options.maxBytes ?? defaults.maxBytes, defaults.maxBytes), timeout = Math.min(options.timeoutMs ?? defaults.timeoutMs, defaults.timeoutMs);
  if (!Number.isFinite(maxBytes) || maxBytes < 1 || !Number.isFinite(timeout) || timeout < 1) throw new Error('COMFY_HTTP_LIMIT');
  const body = options.body === undefined ? undefined : Buffer.from(JSON.stringify(options.body));
  if (body && body.length > 16 * 1024 ** 2) throw new Error('COMFY_BODY_LIMIT');
  options.signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (error?: Error, value?: { status: number; headers: http.IncomingHttpHeaders; body: Buffer }) => {
      if (done) return; done = true; clearTimeout(timer); options.signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(value!);
    };
    const request = http.request({ hostname: target.host, port: target.port, path: route, method, agent: false,
      headers: body ? { 'Content-Type': 'application/json', 'Content-Length': body.length, 'Connection': 'close' } : { 'Connection': 'close' } }, response => {
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400) { response.destroy(); finish(new ComfyHttpError('COMFY_REDIRECT_REJECTED', status)); return; }
      if (Number(response.headers['content-length']) > maxBytes) { response.destroy(); finish(new ComfyHttpError('COMFY_RESPONSE_LIMIT', status)); return; }
      const chunks: Buffer[] = []; let count = 0;
      response.on('data', (chunk: Buffer) => { count += chunk.length; if (count > maxBytes) { response.destroy(); finish(new ComfyHttpError('COMFY_RESPONSE_LIMIT', status)); } else chunks.push(chunk); });
      response.on('error', error => finish(error));
      response.on('end', () => { const data = Buffer.concat(chunks); if (status < 200 || status >= 300) finish(new ComfyHttpError(`COMFY_HTTP_${status}`, status, data)); else finish(undefined, { status, headers: response.headers, body: data }); });
    });
    const abort = () => { request.destroy(); finish(new Error('COMFY_ABORTED')); };
    const timer = setTimeout(() => { request.destroy(); finish(new Error('COMFY_HTTP_TIMEOUT')); }, timeout);
    options.signal?.addEventListener('abort', abort, { once: true });
    request.on('error', error => finish(error));
    if (body) request.write(body); request.end();
  });
}
export async function comfyGetJson<T = unknown>(target: ComfyTargetInput, route: string, options?: ComfyHttpOptions): Promise<T> {
  return safeJson((await comfyRequest(target, route, options)).body.toString('utf8')) as T;
}
export async function comfyPostJson<T = unknown>(target: ComfyTargetInput, route: string, body: unknown, options?: ComfyHttpOptions): Promise<T> {
  const result = (await comfyRequest(target, route, { ...options, method: 'POST', body })).body;
  return (result.length ? safeJson(result.toString('utf8')) : undefined) as T;
}
export async function comfyGetBytes(target: ComfyTargetInput, route: string, options?: ComfyHttpOptions): Promise<Buffer> { return (await comfyRequest(target, route, options)).body; }
export function viewQuery(image: { filename: string; subfolder?: string; type?: string }): string {
  if (typeof image.filename !== 'string' || !image.filename || image.filename.length > 4096 || /[\0\r\n]/.test(image.filename)) throw new Error('COMFY_VIEW_NAME');
  if (image.subfolder !== undefined && (typeof image.subfolder !== 'string' || image.subfolder.length > 4096 || /[\0\r\n]/.test(image.subfolder))) throw new Error('COMFY_VIEW_FOLDER');
  if (!['output', 'temp'].includes(image.type || 'output')) throw new Error('COMFY_VIEW_TYPE');
  return '/view?' + new URLSearchParams({ filename: image.filename, subfolder: image.subfolder || '', type: image.type || 'output' });
}

export interface ComfyPreviewFrame { mime: 'image/png' | 'image/jpeg'; bytes: Buffer; metadata?: Record<string, unknown>; promptId?: string }
export function parseBinaryFrame(input: Buffer | Uint8Array | ArrayBuffer): ComfyPreviewFrame | null {
  const b = Buffer.from(input instanceof ArrayBuffer ? new Uint8Array(input) : input);
  if (b.length < 9 || b.length > 8 * 1024 ** 2) return null;
  const type = b.readUInt32BE(0);
  if (type === 1) { const format = b.readUInt32BE(4); return format === 1 || format === 2 ? { mime: format === 1 ? 'image/jpeg' : 'image/png', bytes: b.subarray(8) } : null; }
  if (type === 4) {
    const count = b.readUInt32BE(4); if (count > 64 * 1024 || count + 8 >= b.length) return null;
    try { const metadata = safeJson(b.subarray(8, count + 8).toString('utf8')) as Record<string, unknown>;
      if (!metadata || typeof metadata !== 'object' || !['image/png', 'image/jpeg'].includes(String(metadata.image_type))) return null;
      return { mime: metadata.image_type as 'image/png' | 'image/jpeg', bytes: b.subarray(count + 8), metadata, promptId: typeof metadata.prompt_id === 'string' ? metadata.prompt_id : undefined };
    } catch { return null; }
  }
  return null;
}

/** A small stdlib-only RFC6455 receiver, so no global dispatcher/proxy can intervene. */
export class ComfySocket extends EventTarget {
  readyState = 1;
  private buffer = Buffer.alloc(0);
  private fragments: Buffer[] = [];
  private fragmentBytes = 0;
  private messageOpcode = 0;
  constructor(private readonly socket: Socket) {
    super();
    socket.on('data', chunk => this.receive(Buffer.from(chunk)));
    socket.on('error', () => this.dispatchEvent(new Event('error')));
    socket.on('close', () => { this.readyState = 3; this.dispatchEvent(new Event('close')); });
  }
  private control(opcode: number, payload = Buffer.alloc(0)) {
    if (this.socket.destroyed) return;
    const mask = randomBytes(4), data = Buffer.alloc(6 + payload.length); data[0] = 0x80 | opcode; data[1] = 0x80 | payload.length; mask.copy(data, 2);
    for (let i = 0; i < payload.length; i++) data[6 + i] = payload[i] ^ mask[i % 4];
    this.socket.write(data);
  }
  close() { if (this.readyState >= 2) return; this.readyState = 2; this.control(8); this.socket.end(); const timer = setTimeout(() => this.socket.destroy(), 100); timer.unref(); }
  feed(head: Buffer) { if (head.length) this.receive(head); }
  private fail() { this.socket.destroy(); }
  private receive(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const first = this.buffer[0], second = this.buffer[1], opcode = first & 15, final = !!(first & 128);
      if ((first & 112) || (second & 128)) return this.fail();
      let len = second & 127, offset = 2;
      if (len === 126) { if (this.buffer.length < 4) return; len = this.buffer.readUInt16BE(2); offset = 4; }
      if (len === 127) { if (this.buffer.length < 10) return; const large = this.buffer.readBigUInt64BE(2); if (large > BigInt(8 * 1024 ** 2)) return this.fail(); len = Number(large); offset = 10; }
      if (len > 8 * 1024 ** 2 || (opcode >= 8 && (!final || len > 125))) return this.fail();
      if (this.buffer.length < offset + len) return;
      const payload = this.buffer.subarray(offset, offset + len); this.buffer = this.buffer.subarray(offset + len);
      if (opcode === 8) { this.close(); return; }
      if (opcode === 9) { this.control(10, payload); continue; }
      if (opcode === 10) continue;
      if (![0, 1, 2].includes(opcode) || (opcode === 0 && !this.messageOpcode) || (opcode !== 0 && this.messageOpcode)) return this.fail();
      if (opcode) this.messageOpcode = opcode;
      this.fragments.push(payload); this.fragmentBytes += len;
      if (this.fragmentBytes > (this.messageOpcode === 1 ? 4 : 8) * 1024 ** 2) return this.fail();
      if (final) {
        const message = Buffer.concat(this.fragments), kind = this.messageOpcode; this.fragments = []; this.fragmentBytes = 0; this.messageOpcode = 0;
        try { const data = kind === 1 ? new TextDecoder('utf-8', { fatal: true }).decode(message) : message.buffer.slice(message.byteOffset, message.byteOffset + message.byteLength);
          this.dispatchEvent(new MessageEvent('message', { data }));
        } catch { return this.fail(); }
      }
    }
  }
}
export async function openComfySocket(targetInput: ComfyTargetInput, clientId: string, options: Pick<ComfyHttpOptions, 'signal' | 'timeoutMs'> = {}): Promise<ComfySocket> {
  const target = resolveLoopbackTarget(targetInput);
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(clientId)) throw new Error('COMFY_CLIENT_ID');
  if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1)) throw new Error('COMFY_WS_TIMEOUT_LIMIT');
  options.signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const key = randomBytes(16).toString('base64'); let done = false;
    const request = http.request({ hostname: target.host, port: target.port, path: '/ws?clientId=' + encodeURIComponent(clientId), agent: false,
      headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': key } });
    const finish = (error?: Error, socket?: ComfySocket) => { if (done) return; done = true; clearTimeout(timer); options.signal?.removeEventListener('abort', abort); if (error) reject(error); else resolve(socket!); };
    const abort = () => { request.destroy(); finish(new Error('COMFY_ABORTED')); };
    const timer = setTimeout(() => { request.destroy(); finish(new Error('COMFY_WS_TIMEOUT')); }, Math.min(options.timeoutMs || 3000, 10000));
    options.signal?.addEventListener('abort', abort, { once: true });
    request.on('error', error => finish(error));
    request.on('response', response => { response.destroy(); finish(new ComfyHttpError('COMFY_WS_UPGRADE', response.statusCode)); });
    request.on('upgrade', (response, socket, head) => {
      const expected = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      if (response.statusCode !== 101 || response.headers['sec-websocket-accept'] !== expected || String(response.headers.upgrade).toLowerCase() !== 'websocket') { socket.destroy(); finish(new Error('COMFY_WS_HANDSHAKE')); return; }
      if (done) { socket.destroy(); return; }
      const stream = new ComfySocket(socket); finish(undefined, stream);
      // Consumer attaches listeners immediately after await; buffered messages wait one task.
      setImmediate(() => stream.feed(head));
    });
    request.end();
  });
}
