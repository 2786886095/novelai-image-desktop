import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import type { AppSettings } from '../../src/types';
import { studioPiModel, studioPiStream } from './pi-agent-provider';
import { runStudioPiAgent } from './pi-agent-core';

// Isolate persistent application settings only. Pi, the Studio adapter and the
// actual HTTP transport are not mocked; every request is bound to loopback.
vi.mock('./store', () => ({ getSettings: () => ({ proxyMode: 'direct' }) }));

const servers = new Set<Server>();
const sockets = new Set<Socket>();
const fakeKey = 'SYNTHETIC_LOOPBACK_ONLY_ANTHROPIC_KEY';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7YyZkAAAAASUVORK5CYII=';
const rejection = 'This model requires adaptive thinking with output_config.effort; thinking.budget_tokens is not supported.';
type Effort = 'low' | 'medium' | 'high';
type Body = Record<string, any>;
type Capture = { path: string; key: string | undefined; body: Body };

afterEach(async () => {
  const closed = [...servers].map(server => new Promise<void>(resolve => {
    server.close(() => resolve());
    server.closeAllConnections();
  }));
  for (const socket of sockets) socket.destroy();
  await Promise.all(closed);
  sockets.clear();
  servers.clear();
  vi.restoreAllMocks();
});

function fail(response: ServerResponse, message = rejection) {
  response.writeHead(400, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message } }));
}

function complete(response: ServerResponse, model: string) {
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  const event = (type: string, value: object) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  event('message_start', { message: { id: 'loopback-message', type: 'message', role: 'assistant', model,
    content: [], stop_reason: null, usage: { input_tokens: 8, output_tokens: 0 } } });
  event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
  event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'loopback fixture' } });
  event('content_block_stop', { index: 0 });
  event('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 2 } });
  event('message_stop', {});
  response.end();
}

async function endpoint(validate: (body: Body, index: number) => boolean, alwaysReject = false) {
  const captures: Capture[] = [];
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const chunks: Buffer[] = [];
      let length = 0;
      for await (const value of request) {
        const chunk = Buffer.from(value);
        length += chunk.length;
        if (length > 1024 * 1024) { fail(response, 'Loopback request exceeded fixture bound'); return; }
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Body;
      const key = request.headers['x-api-key'];
      captures.push({ path: request.url ?? '', key: typeof key === 'string' ? key : undefined, body });
      if (request.method !== 'POST' || request.url !== '/v1/messages' || key !== fakeKey ||
          alwaysReject || !validate(body, captures.length - 1)) {
        fail(response);
        return;
      }
      complete(response, String(body.model));
    } catch {
      fail(response, 'Malformed loopback fixture payload');
    }
  });
  servers.add(server);
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return { baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, captures };
}

function settings(baseUrl: string, model: string, effort: 'auto' | Effort = 'auto'): AppSettings {
  return { agentApiProtocol: 'anthropic-messages', agentApiBaseUrl: baseUrl,
    agentApiModel: model, agentApiKey: fakeKey, agentReasoningEffort: effort,
    agentVisionEnabled: true, agentContextWindow: 131072, agentMaxOutputTokens: 32768,
    proxyMode: 'direct', proxyForAi: false } as AppSettings;
}

function adaptiveOrAuto(body: Body, effort: Effort | undefined) {
  if (effort === undefined) return body.thinking === undefined && body.output_config === undefined;
  return body.thinking?.type === 'adaptive' && body.thinking.budget_tokens === undefined &&
    body.output_config?.effort === effort;
}

it.each([
  'claude-opus-5-5',
  'claude-sonnet-5',
  'claude-opus-4-6',
  'anthropic/claude-opus-5.5-20261001',
])('sends adaptive %s with selected conversation effort while global effort stays auto', async modelId => {
  const efforts = ['low', 'medium', 'high', undefined] as const;
  const fixture = await endpoint((body, index) => adaptiveOrAuto(body, efforts[index]));
  const config = settings(fixture.baseUrl, modelId);
  // Model capability cannot depend on whether the global setting currently
  // enables thinking: the conversation can select an explicit level later.
  expect(studioPiModel(config).reasoning).toBe(true);
  let toolCalls = 0;
  for (const thinkingLevel of efforts) {
    const result = await runStudioPiAgent({ model: studioPiModel(config), streamFn: studioPiStream(config),
      thinkingLevel, systemPrompt: 'Keep this controlled system text.', history: [],
      text: { role: 'user', timestamp: 1, content: [
        { type: 'text', text: 'Describe the controlled image.' },
        { type: 'image', mimeType: 'image/png', data: png },
      ] },
      tools: [{ name: 'fixture_tool', description: 'Controlled read-only declaration', readonly: true,
        parameters: { type: 'object', properties: { count: { type: 'integer' } }, required: ['count'], additionalProperties: false },
        execute: async () => { toolCalls++; return { ok: true, output: 'must not execute' }; } }],
      authorize: async () => false });
    expect(result.text).toBe('loopback fixture');
  }
  expect(fixture.captures).toHaveLength(4);
  expect(toolCalls).toBe(0);
  for (const [index, capture] of fixture.captures.entries()) {
    const body = capture.body;
    expect(capture.path).toBe('/v1/messages');
    expect(capture.key).toBe(fakeKey);
    expect(body.model).toBe(modelId); // Classification must never rewrite the wire ID.
    expect(body.max_tokens).toBe(32768);
    expect(adaptiveOrAuto(body, efforts[index])).toBe(true);
    expect(JSON.stringify(body.system)).toContain('Keep this controlled system text.');
    expect(body.tools).toEqual(expect.arrayContaining([expect.objectContaining({
      name: 'fixture_tool', input_schema: expect.objectContaining({
        properties: expect.objectContaining({ args: expect.objectContaining({
          properties: expect.objectContaining({ count: { type: 'integer' } }),
        }) }),
      }),
    })]));
    expect(body.messages.flatMap((message: any) => message.content)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'image', source: expect.objectContaining({ type: 'base64', media_type: 'image/png', data: png }) }),
    ]));
    if (efforts[index] === undefined) {
      expect(body).not.toHaveProperty('thinking');
      expect(body).not.toHaveProperty('output_config');
    } else {
      expect(body.thinking).not.toHaveProperty('budget_tokens');
    }
  }
});

it.each(['claude-sonnet-4-5', 'unrecognized-custom-claude-model'])('preserves budget thinking for legacy/unknown %s', async modelId => {
  const fixture = await endpoint(body => body.thinking?.type === 'enabled' &&
    Number.isInteger(body.thinking.budget_tokens) && body.thinking.budget_tokens > 0 &&
    body.thinking.budget_tokens < body.max_tokens && body.output_config === undefined);
  const config = settings(fixture.baseUrl, modelId, 'high');
  for (const thinkingLevel of ['low', 'medium', 'high'] as const) {
    const result = await runStudioPiAgent({ model: studioPiModel(config), streamFn: studioPiStream(config), thinkingLevel,
      systemPrompt: 'Legacy control', history: [], text: 'fixture', tools: [], authorize: async () => false });
    expect(result.text).toBe('loopback fixture');
  }
  const bodies = fixture.captures.map(capture => capture.body);
  expect(bodies).toHaveLength(3);
  expect(bodies.every(body => body.model === modelId && body.output_config === undefined)).toBe(true);
  expect(bodies[1].thinking.budget_tokens).toBeGreaterThan(bodies[0].thinking.budget_tokens);
  expect(bodies[2].thinking.budget_tokens).toBeGreaterThan(bodies[1].thinking.budget_tokens);
});

it.each([
  ['claude-opus-4-6', true],
  ['claude-sonnet-4-6', true],
  ['claude-opus-5-5', false],
  ['claude-opus-4-5', true],
] as const)('preserves the auto/no-thinking temperature capability for %s', async (modelId, allowed) => {
  const fixture = await endpoint(body => body.thinking === undefined && body.output_config === undefined &&
    (allowed ? body.temperature === 0.4 : body.temperature === undefined));
  const config = settings(fixture.baseUrl, modelId);
  const output = await (await studioPiStream(config)(studioPiModel(config), {
    messages: [{ role: 'user', timestamp: 1, content: [{ type: 'text', text: 'fixture' }] }],
  }, { temperature: 0.4, maxRetries: 0 })).result();
  expect(output.stopReason).toBe('stop');
  expect(fixture.captures).toHaveLength(1);
  expect(fixture.captures[0].body.model).toBe(modelId);
  expect(fixture.captures[0].body).not.toHaveProperty('thinking');
  expect(fixture.captures[0].body).not.toHaveProperty('output_config');
});

it.each([
  'claude-opus-5-6', 'claude-opus-5-50', 'claude-sonnet-4-7',
  'claude-haiku-5', 'claude-opus-5-5-custom', 'not-claude-opus-5-5',
])('does not infer undocumented adaptive capabilities for %s', modelId => {
  const model = studioPiModel(settings('http://127.0.0.1:1/v1', modelId, 'high'));
  expect(model.id).toBe(modelId);
  expect(model).not.toHaveProperty('compat.forceAdaptiveThinking', true);
});

it('does not apply Anthropic compatibility metadata to the same ID on another protocol', () => {
  const config = { ...settings('http://127.0.0.1:1/v1', 'claude-opus-5-5'), agentApiProtocol: 'openai-compatible' } as AppSettings;
  const model = studioPiModel(config);
  expect(model.id).toBe('claude-opus-5-5');
  expect(model.api).toBe('openai-completions');
  expect(model).not.toHaveProperty('compat.forceAdaptiveThinking', true);
  expect(model).not.toHaveProperty('compat.supportsTemperature', false);
});

it('surfaces an explicit HTTP 400 once instead of retrying with another thinking format', async () => {
  const fixture = await endpoint(() => true, true);
  const config = settings(fixture.baseUrl, 'claude-opus-5-5', 'high');
  let toolCalls = 0;
  await expect(runStudioPiAgent({ model: studioPiModel(config), streamFn: studioPiStream(config), thinkingLevel: 'high',
    systemPrompt: 'Controlled rejection', history: [], text: 'fixture',
    tools: [{ name: 'fixture_tool', description: 'Not executed', readonly: true,
      execute: async () => { toolCalls++; return { ok: true, output: 'must not execute' }; } }],
    authorize: async () => false })).rejects.toThrow(/adaptive thinking|400/);
  expect(fixture.captures).toHaveLength(1);
  expect(toolCalls).toBe(0);
});
