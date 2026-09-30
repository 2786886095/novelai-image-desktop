import { createServer } from 'node:http';
import { createServer as createTcpServer, connect as connectTcp, type AddressInfo, type Socket } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '../../src/types';
import { runStudioPiAgent } from './pi-agent-core';
import { studioPiModel, studioPiStream } from './pi-agent-provider';

vi.mock('./store', () => ({ getSettings: () => ({ proxyMode: 'direct' }) }));
import { configureSystemProxyResolver } from './proxy';
import { discoverAgentModels } from './agent-model-discovery';

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  configureSystemProxyResolver(undefined);
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe('Studio Pi provider bridge', () => {
  it('uses the configured OpenAI-compatible endpoint for a real Pi turn', async () => {
    let path = '';
    let authorization = '';
    const server = createServer((request, response) => {
      path = request.url ?? '';
      authorization = request.headers.authorization ?? '';
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write('data: {"id":"fixture","object":"chat.completion.chunk","model":"test-model","choices":[{"index":0,"delta":{"role":"assistant","content":"已准备好。"},"finish_reason":null}]}\n\n');
      response.write('data: {"id":"fixture","object":"chat.completion.chunk","model":"test-model","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n');
      response.end('data: [DONE]\n\n');
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const settings = {
      agentApiProtocol: 'openai-compatible',
      agentApiBaseUrl: `http://127.0.0.1:${port}/v1`,
      agentApiModel: 'test-model',
      agentApiKey: 'fixture-key',
      agentVisionEnabled: false,
      agentContextWindow: 4096,
      agentMaxOutputTokens: 256,
      proxyMode: 'direct',
      proxyForAi: true,
    } as AppSettings;
    const result = await runStudioPiAgent({
      model: studioPiModel(settings), streamFn: studioPiStream(settings),
      systemPrompt: 'Respond briefly.', history: [], text: '你好', tools: [],
      authorize: async () => false,
    });
    expect(result.text).toBe('已准备好。');
    expect(path).toBe('/v1/chat/completions');
    expect(authorization).toBe('Bearer fixture-key');
  });
});

it('discovers real loopback model-list data, filters non-chat models, and preserves advertised limits', async () => {
  let path = '';
  const server = createServer((request, response) => {
    path = request.url ?? '';
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ data: [
      { id: 'fixture-chat', context_length: 16384, max_output_tokens: 2048, thinking: true },
      { id: 'fixture-embedding' },
    ] }));
  });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const result = await discoverAgentModels({ protocol: 'openai-compatible', baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, apiKey: '' });
  expect(result.ok).toBe(true);
  expect(path).toBe('/v1/models');
  expect(result.models).toHaveLength(1);
  expect(result.models[0]).toMatchObject({ id: 'fixture-chat', contextWindow: 16384, maxOutputTokens: 2048, reasoning: true, metadataSource: 'api' });
});

it('supports keyless local endpoints without synthesizing an Authorization header', async () => {
  let authorization: string | undefined;
  const server = createServer((request, response) => {
    authorization = request.headers.authorization;
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.write('data: {"choices":[{"index":0,"delta":{"role":"assistant","content":"local"},"finish_reason":null}]}\n\n');
    response.write('data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n');
    response.end('data: [DONE]\n\n');
  });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const settings = { agentApiProtocol: 'openai-compatible', agentApiBaseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
    agentApiModel: 'fixture', agentApiKey: '', agentVisionEnabled: false, agentContextWindow: 8192, agentMaxOutputTokens: 256, proxyMode: 'direct' } as AppSettings;
  const result = await runStudioPiAgent({ model: studioPiModel(settings), streamFn: studioPiStream(settings), systemPrompt: 'fixture', history: [], text: 'local', tools: [], authorize: async () => false });
  expect(result.text).toBe('local');
  expect(authorization).toBeUndefined();
});

it('Gemini native direct requests reach the configured loopback endpoint without custom-fetch rejection', async () => {
  let path = '';
  const server = createServer(async (request, response) => {
    path = request.url ?? '';
    for await (const _ of request) { /* drain request */ }
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end(`data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'gemini fixture' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2, totalTokenCount: 7 } })}\n\n`);
  });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const settings = { agentApiProtocol: 'google-gemini', agentApiBaseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1beta`, agentApiModel: 'gemini-3.7-flash',
    agentApiKey: 'fixture-key', agentContextWindow: 8192, agentMaxOutputTokens: 256, proxyMode: 'direct' } as AppSettings;
  const result = await runStudioPiAgent({ model: studioPiModel(settings), streamFn: studioPiStream(settings), systemPrompt: 'fixture', history: [], text: 'fixture', tools: [], authorize: async () => false });
  expect(result.text).toBe('gemini fixture');
  expect(path).toContain('/v1beta/models/gemini-3.7-flash:streamGenerateContent');
});

const geminiFixture = (baseUrl: string, patch: Partial<AppSettings> = {}) => ({
  agentApiProtocol: 'google-gemini', agentApiBaseUrl: baseUrl, agentApiModel: 'gemini-3.7-flash',
  agentApiKey: 'fixture-key', agentContextWindow: 131072, agentMaxOutputTokens: 8192,
  agentVisionEnabled: true, proxyMode: 'direct', proxyForAi: true, ...patch,
} as AppSettings);
const geminiResponse = { candidates: [{ content: { role: 'model', parts: [{ text: 'proxy 中文 fixture' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2, thoughtsTokenCount: 3, cachedContentTokenCount: 4, totalTokenCount: 15 } };

it.each(['manual', 'auto'] as const)('Gemini uses the actual %s Axios proxy route, preserving auth, images, summary and reasoning', async proxyMode => {
  let requestUrl = ''; let apiKey = ''; let body: any;
  const proxy = createServer(async (request, response) => {
    requestUrl = request.url ?? ''; apiKey = String(request.headers['x-goog-api-key']);
    let raw = ''; for await (const chunk of request) raw += chunk;
    body = JSON.parse(raw);
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    const wire = Buffer.from(`data: ${JSON.stringify(geminiResponse)}\r\n\r\n`);
    // Deliberately split an UTF-8 character and SSE delimiter across writes.
    const split = wire.indexOf(Buffer.from('中')) + 1;
    response.write(wire.subarray(0, split));
    setImmediate(() => response.end(wire.subarray(split)));
  });
  servers.push(proxy);
  await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const port = (proxy.address() as AddressInfo).port;
  const resolved: string[] = [];
  if (proxyMode === 'auto') configureSystemProxyResolver(async url => { resolved.push(url); return `PROXY 127.0.0.1:${port}`; }, async () => true);
  const nativeFetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Native fetch bypass forbidden'));
  const settings = geminiFixture('http://gemini-fixture.invalid/v1beta', { proxyMode, proxyUrl: `http://127.0.0.1:${port}` });
  const result = await runStudioPiAgent({ model: studioPiModel(settings), streamFn: studioPiStream(settings), thinkingLevel: 'high',
    systemPrompt: 'Preserved compressed summary', history: [],
    text: { role: 'user', timestamp: 1, content: [{ type: 'text', text: 'fixture' }, { type: 'image', mimeType: 'image/png', data: 'aGVsbG8=' }] },
    tools: [], authorize: async () => false });
  expect(nativeFetch).not.toHaveBeenCalled();
  expect(result.text).toBe('proxy 中文 fixture');
  expect(requestUrl).toBe('http://gemini-fixture.invalid/v1beta/models/gemini-3.7-flash:streamGenerateContent?alt=sse');
  expect(apiKey).toBe('fixture-key'); expect(requestUrl).not.toContain('fixture-key');
  expect(body.systemInstruction.parts[0].text).toBe('Preserved compressed summary');
  expect(body.contents[0].parts.some((part: any) => part.inlineData?.data === 'aGVsbG8=')).toBe(true);
  expect(body.generationConfig.thinkingConfig).toEqual({ includeThoughts: true, thinkingLevel: 'HIGH' });
  expect(body.generationConfig.maxOutputTokens).toBe(8192);
  expect(result.usage).toMatchObject({ input: 6, cacheRead: 4, output: 5, reasoning: 3, totalTokens: 15 });
  if (proxyMode === 'auto') expect(resolved).toEqual([requestUrl]);
});

it('Gemini replays signed function calls and exposes schema-validated tools through the Axios adapter', async () => {
  const bodies: any[] = [];
  const server = createServer(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk;
    bodies.push(JSON.parse(raw));
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end(`data: ${JSON.stringify(bodies.length === 1 ? { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'fixture_tool', args: { args: { count: 1 } } }, thoughtSignature: 'c2lnbmF0dXJlLWZpeHR1cmU=' }] }, finishReason: 'STOP' }] } : geminiResponse)}\n\n`);
  });
  servers.push(server); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const settings = geminiFixture(`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1beta`);
  const execute = vi.fn(async () => ({ ok: true, output: 'fixture tool result' }));
  const result = await runStudioPiAgent({ model: studioPiModel(settings), streamFn: studioPiStream(settings), systemPrompt: 'fixture', history: [], text: 'fixture',
    tools: [{ name: 'fixture_tool', description: 'fixture', readonly: true, execute,
      parameters: { type: 'object', properties: { count: { type: 'integer' } }, required: ['count'], additionalProperties: false } }], authorize: async () => false });
  expect(result.text).toContain('fixture'); expect(execute).toHaveBeenCalledTimes(1);
  expect(bodies[0].tools[0].functionDeclarations[0].parametersJsonSchema.properties.args.properties.count.type).toBe('integer');
  expect(JSON.stringify(bodies[1].contents)).toContain('c2lnbmF0dXJlLWZpeHR1cmU=');
  expect(JSON.stringify(bodies[1].contents)).toContain('fixture tool result');
  expect(bodies[0].generationConfig.thinkingConfig).toBeUndefined();
});

it.each(['http-error', 'truncated', 'blocked'] as const)('Gemini reports %s without retry or false success', async mode => {
  let calls = 0;
  const server = createServer(async (request, response) => {
    for await (const _ of request) { /* drain */ } calls++;
    response.writeHead(mode === 'http-error' ? 429 : 200, { 'content-type': 'text/event-stream' });
    response.end(mode === 'http-error' ? 'fixture rate limit' : `data: ${JSON.stringify(mode === 'blocked' ? { promptFeedback: { blockReason: 'SAFETY' } } : { candidates: [{ content: { parts: [{ text: 'incomplete' }] } }] })}\n\n`);
  });
  servers.push(server); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const settings = geminiFixture(`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1beta`);
  await expect(runStudioPiAgent({ model: studioPiModel(settings), streamFn: studioPiStream(settings), systemPrompt: 'fixture', history: [], text: 'fixture', tools: [], authorize: async () => false }))
    .rejects.toThrow(mode === 'http-error' ? '429' : mode === 'blocked' ? 'SAFETY' : 'missing finish reason');
  expect(calls).toBe(1);
});

it('Gemini abort closes the in-flight Axios stream without a retry', async () => {
  let calls = 0; let closed = false;
  const server = createServer(async (request, response) => {
    for await (const _ of request) { /* drain */ } calls++;
    response.on('close', () => { closed = true; });
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.write(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'partial' }] } }] })}\n\n`);
  });
  servers.push(server); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const controller = new AbortController();
  const settings = geminiFixture(`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1beta`);
  const pending = runStudioPiAgent({ model: studioPiModel(settings), streamFn: studioPiStream(settings), systemPrompt: 'fixture', history: [], text: 'fixture', tools: [], authorize: async () => false, signal: controller.signal,
    onEvent(event) { if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') controller.abort(); } });
  await expect(pending).rejects.toThrow();
  await vi.waitFor(() => expect(closed).toBe(true));
  expect(calls).toBe(1);
});

it.each([
  ['openai-responses', 'gpt-5.6-terra'],
  ['anthropic-messages', 'claude-sonnet-5'],
  ['google-gemini', 'gemini-3.7-flash'],
] as const)('sends detected reasoning settings as actual %s wire fields (low/medium/high/auto)', async (protocol, modelId) => {
  const bodies: any[] = [];
  const server = createServer(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk;
    bodies.push(JSON.parse(raw));
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    const event = (type: string, value: object) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
    if (protocol === 'google-gemini') response.write(`data: ${JSON.stringify(geminiResponse)}\n\n`);
    else if (protocol === 'anthropic-messages') {
      event('message_start', { message: { id: 'fixture', type: 'message', role: 'assistant', model: modelId, content: [], stop_reason: null, usage: { input_tokens: 5, output_tokens: 0 } } });
      event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
      event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'fixture' } });
      event('content_block_stop', { index: 0 });
      event('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 2 } });
      event('message_stop', {});
    } else {
      const item = { id: 'msg_fixture', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'fixture', annotations: [] }] };
      event('response.created', { response: { id: 'resp_fixture', status: 'in_progress', output: [] } });
      event('response.output_item.added', { output_index: 0, item: { ...item, content: [], status: 'in_progress' } });
      event('response.output_text.delta', { output_index: 0, content_index: 0, item_id: item.id, delta: 'fixture' });
      event('response.output_item.done', { output_index: 0, item });
      event('response.completed', { response: { id: 'resp_fixture', status: 'completed', output: [item], usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 } } });
    }
    response.end();
  });
  servers.push(server); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const settings = geminiFixture(`http://127.0.0.1:${(server.address() as AddressInfo).port}${protocol === 'google-gemini' ? '/v1beta' : ''}`, {
    agentApiProtocol: protocol, agentApiModel: modelId, agentMaxOutputTokens: 32768 });
  expect(studioPiModel(settings).reasoning).toBe(true);
  for (const thinkingLevel of ['low', 'medium', 'high', undefined] as const) {
    const result = await runStudioPiAgent({ model: studioPiModel(settings), streamFn: studioPiStream(settings), thinkingLevel,
      systemPrompt: 'fixture', history: [], text: 'fixture', tools: [], authorize: async () => false });
    expect(result.text).toContain('fixture');
  }
  expect(bodies).toHaveLength(4);
  if (protocol === 'openai-responses') {
    expect(bodies[0].reasoning.effort).toBe('low'); expect(bodies[1].reasoning.effort).toBe('medium'); expect(bodies[2].reasoning.effort).toBe('high');
    expect(bodies[3].reasoning).toBeUndefined();
  } else if (protocol === 'anthropic-messages') {
    expect(bodies[0].thinking.type).toBe('enabled'); expect(bodies[0].thinking.budget_tokens).toBeGreaterThan(0);
    expect(bodies[1].thinking.budget_tokens).toBeGreaterThan(bodies[0].thinking.budget_tokens);
    expect(bodies[2].thinking.budget_tokens).toBeGreaterThan(bodies[1].thinking.budget_tokens);
    expect(bodies[2].thinking.budget_tokens).toBeLessThan(bodies[2].max_tokens);
    expect(bodies[3].thinking).toBeUndefined();
  } else {
    expect(bodies[0].generationConfig.thinkingConfig.thinkingLevel).toBe('LOW');
    expect(bodies[1].generationConfig.thinkingConfig.thinkingLevel).toBe('MEDIUM');
    expect(bodies[2].generationConfig.thinkingConfig.thinkingLevel).toBe('HIGH');
    expect(bodies[3].generationConfig.thinkingConfig).toBeUndefined();
  }
});

it('Gemini uses SOCKS5 remote DNS via the existing Axios agent rather than bypassing it', async () => {
  const upstream = createServer(async (request, response) => {
    for await (const _ of request) { /* drain */ }
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end(`data: ${JSON.stringify(geminiResponse)}\n\n`);
  });
  servers.push(upstream); await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const sockets = new Set<Socket>(); let requestedHost = '';
  const socks = createTcpServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    let buffer = Buffer.alloc(0); let stage = 0;
    const receive = (data: Buffer) => {
      buffer = Buffer.concat([buffer, data]);
      if (stage === 0) {
        if (buffer.length < 2 || buffer.length < 2 + buffer[1]) return;
        buffer = buffer.subarray(2 + buffer[1]); socket.write(Buffer.from([5, 0])); stage = 1;
      }
      if (stage === 1) {
        if (buffer.length < 5) return;
        const length = buffer[3] === 3 ? 7 + buffer[4] : 10;
        if (buffer.length < length) return;
        requestedHost = buffer[3] === 3 ? buffer.subarray(5, 5 + buffer[4]).toString() : 'unexpected-local-dns';
        const leftover = buffer.subarray(length); stage = 2; socket.removeListener('data', receive);
        const target = connectTcp((upstream.address() as AddressInfo).port, '127.0.0.1', () => {
          socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
          if (leftover.length) target.write(leftover);
          socket.pipe(target); target.pipe(socket);
        });
        sockets.add(target); target.on('close', () => sockets.delete(target));
        target.on('error', () => socket.destroy()); socket.on('error', () => target.destroy());
        socket.on('close', () => target.destroy());
      }
    };
    socket.on('data', receive);
  });
  await new Promise<void>(resolve => socks.listen(0, '127.0.0.1', resolve));
  try {
    const settings = geminiFixture('http://gemini-socks.invalid/v1beta', { proxyMode: 'manual', proxyUrl: `socks5h://127.0.0.1:${(socks.address() as AddressInfo).port}` });
    const nativeFetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Native fetch forbidden'));
    const result = await runStudioPiAgent({ model: studioPiModel(settings), streamFn: studioPiStream(settings), systemPrompt: 'fixture', history: [], text: 'fixture', tools: [], authorize: async () => false });
    expect(result.text).toContain('fixture'); expect(requestedHost).toBe('gemini-socks.invalid'); expect(nativeFetch).not.toHaveBeenCalled();
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => socks.close(() => resolve()));
  }
});
