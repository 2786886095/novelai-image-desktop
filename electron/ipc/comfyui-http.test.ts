import http from 'node:http';
import { createHash } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { comfyGetJson, comfyGetBytes, comfyPostJson, openComfySocket, parseBinaryFrame, resolveLoopbackTarget, safeJson, viewQuery, ComfyHttpError } from './comfyui-http';

const servers: http.Server[] = [];
async function serve(handler: http.RequestListener) {
  const server = http.createServer(handler); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, target: `http://127.0.0.1:${(server.address() as { port: number }).port}` };
}
afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } });

it('permits literal loopback only, normalizes localhost without DNS, blocks credentials/paths/aliases', () => {
  expect(resolveLoopbackTarget('http://localhost:8188')).toEqual({ host: '127.0.0.1', port: 8188, baseUrl: 'http://127.0.0.1:8188' });
  expect(resolveLoopbackTarget('http://[::1]:8188').host).toBe('::1');
  for (const url of ['http://127.1:8188', 'http://2130706433:8188', 'http://0.0.0.0:8188', 'http://192.168.1.2:8188', 'http://example.com', 'https://127.0.0.1:8188', 'http://x@127.0.0.1:8188', 'http://127.0.0.1:8188/a', 'http://127.0.0.1:8188/?x=y']) expect(() => resolveLoopbackTarget(url), url).toThrow();
});
it('actual stdlib HTTP sends directly despite proxy variables and does not follow redirects', async () => {
  let requests = 0;
  const { target } = await serve((req, res) => { requests++; if (req.url === '/system_stats') { res.setHeader('content-type', 'application/json'); res.end('{"system":{},"devices":[]}'); } else { res.writeHead(302, { location: 'http://example.com/private' }); res.end(); } });
  const old = process.env.HTTP_PROXY; process.env.HTTP_PROXY = 'http://127.0.0.1:1';
  try { expect(await comfyGetJson(target, '/system_stats')).toEqual({ system: {}, devices: [] }); await expect(comfyGetJson(target, '/queue')).rejects.toThrow('REDIRECT'); }
  finally { if (old === undefined) delete process.env.HTTP_PROXY; else process.env.HTTP_PROXY = old; }
  expect(requests).toBe(2);
});
it('enforces route, response bytes, wall-clock timeout and JSON prototype-key limits', async () => {
  const { target } = await serve((req, res) => { if (req.url === '/queue') res.end('x'.repeat(500)); else if (req.url === '/object_info') res.end('{"__proto__":{}}'); });
  await expect(comfyGetBytes(target, '/queue', { maxBytes: 20 })).rejects.toThrow('LIMIT');
  await expect(comfyGetJson(target, '/system_stats', { timeoutMs: 20 })).rejects.toThrow('TIMEOUT');
  await expect(comfyGetJson(target, '/object_info')).rejects.toThrow('Forbidden JSON key');
  for (const p of ['/manager/install', '/userdata', '//other/system_stats', '/upload/image', '/settings', '/internal/a', '/private/../system_stats', '/object_info/%2Fmanager']) await expect(comfyGetJson(target, p)).rejects.toThrow('ROUTE');
});
it('preserves HTTP400 prompt-validation diagnostics and accepts empty cancellation responses', async () => {
  const { target } = await serve((req, res) => { if (req.url === '/prompt') { res.writeHead(400); res.end('{"error":{"type":"bad"},"node_errors":{"1":{}}}'); } else res.end(); });
  const error = await comfyPostJson(target, '/prompt', { prompt: {} }).catch(e => e);
  expect(error).toBeInstanceOf(ComfyHttpError); expect(error.status).toBe(400); expect(error.responseJson.node_errors).toHaveProperty('1');
  expect(await comfyPostJson(target, '/interrupt', { prompt_id: 'owned' })).toBeUndefined();
});
it('uses shared bounded JSON parsing and accepts legitimate nesting deeper than 32', async () => {
  let text = '0'; for (let index = 0; index < 64; index++) text = '{"child":' + text + '}';
  expect(safeJson(text)).toBeTypeOf('object');
  let tooDeep = '0'; for (let index = 0; index < 129; index++) tooDeep = '{"child":' + tooDeep + '}';
  expect(() => safeJson(tooDeep)).toThrow('nesting');
  expect(() => safeJson('{"x":"' + 'a'.repeat(1_048_577) + '"}')).toThrow('string');
  expect(() => safeJson('{"x":1e999}')).toThrow('finite');
  // Each schema string is below the shared string ceiling, but total object_info
  // is above the workflow JSON cap. The route keeps its separate 64 MiB cap.
  const payload = JSON.stringify(Array.from({ length: 18 }, () => 'a'.repeat(1_000_000)));
  const { target } = await serve((_req, res) => res.end(payload));
  expect((await comfyGetJson<string[]>(target, '/object_info')).length).toBe(18);
}, 15_000);
it('URL-encodes view metadata and rejects input files; parses two real preview envelope formats', () => {
  expect(viewQuery({ filename: 'a b.png', subfolder: '子目录', type: 'output' })).toContain('filename=a+b.png');
  expect(() => viewQuery({ filename: 'x', type: 'input' })).toThrow('TYPE');
  const header = Buffer.alloc(8); header.writeUInt32BE(1); header.writeUInt32BE(2, 4);
  expect(parseBinaryFrame(Buffer.concat([header, Buffer.from('png')]))).toMatchObject({ mime: 'image/png', bytes: Buffer.from('png') });
  const meta = Buffer.from(JSON.stringify({ image_type: 'image/jpeg', prompt_id: 'p' })); header.writeUInt32BE(4); header.writeUInt32BE(meta.length, 4);
  expect(parseBinaryFrame(Buffer.concat([header, meta, Buffer.from('jpeg')]))).toMatchObject({ mime: 'image/jpeg', promptId: 'p', bytes: Buffer.from('jpeg') });
  expect(parseBinaryFrame(Buffer.alloc(8))).toBeNull();
});
it('actual WS upgrade receives text/binary, replies to ping and closes without browser/dispatcher', async () => {
  const { server, target } = await serve((_req, res) => { res.writeHead(404); res.end(); });
  let serverSocket: import('node:stream').Duplex | undefined;
  let pong = false;
  server.on('upgrade', (req, socket) => {
    serverSocket = socket;
    const accept = createHash('sha1').update(String(req.headers['sec-websocket-key']) + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    socket.on('data', data => { if ((data[0] & 15) === 10) pong = true; });
  });
  const ws = await openComfySocket(target, 'test-client');
  const data: unknown[] = []; ws.addEventListener('message', e => data.push((e as MessageEvent).data));
  serverSocket!.write(Buffer.from([0x81, 2, 111, 107, 0x82, 2, 1, 2, 0x89, 1, 42]));
  await new Promise(resolve => setTimeout(resolve, 30));
  expect(data[0]).toBe('ok'); expect(Array.from(new Uint8Array(data[1] as ArrayBuffer))).toEqual([1, 2]); expect(pong).toBe(true);
  ws.close(); serverSocket!.destroy();
});
it('WS rejects redirects and invalid handshakes, limits declared giant frames before allocation', async () => {
  const { target } = await serve((_req, res) => { res.writeHead(302, { location: 'ws://example.com/' }); res.end(); });
  await expect(openComfySocket(target, 'id')).rejects.toThrow('UPGRADE');
  const good = await serve((_req, res) => res.end()); let remote: import('node:stream').Duplex | undefined;
  good.server.on('upgrade', (req, socket) => { remote = socket; const accept = createHash('sha1').update(String(req.headers['sec-websocket-key']) + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64'); socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n'); });
  const ws = await openComfySocket(good.target, 'id'); const closed = new Promise(r => ws.addEventListener('close', r));
  const header = Buffer.alloc(10); header[0] = 0x82; header[1] = 127; header.writeBigUInt64BE(999999999999n, 2); remote!.write(header);
  await closed; expect(ws.readyState).toBe(3); remote!.destroy();
});
