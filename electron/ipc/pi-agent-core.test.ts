import { describe, expect, it, vi } from 'vitest';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';
import type { AssistantMessage, Model, StreamFunction } from '@earendil-works/pi-ai';
import { runStudioPiAgent } from './pi-agent-core';

const model: Model<'openai-completions'> = {
  id: 'fixture', name: 'Fixture', provider: 'fixture', api: 'openai-completions',
  baseUrl: 'https://example.invalid/v1', reasoning: false, input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 4096, maxTokens: 1024,
};

function reply(content: AssistantMessage['content'], stopReason: AssistantMessage['stopReason']): AssistantMessage {
  return {
    role: 'assistant', content, api: model.api, provider: model.provider,
    model: model.id, stopReason, timestamp: Date.now(),
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  };
}

function fakeStream(...turns: AssistantMessage[]) {
  let index = 0;
  return vi.fn((() => {
    const stream = createAssistantMessageEventStream();
    const message = turns[index++];
    queueMicrotask(() => {
      stream.push({ type: 'start', partial: message });
      stream.push({ type: 'done', reason: message.stopReason as 'stop' | 'toolUse', message });
    });
    return stream;
  }) as StreamFunction<'openai-completions'>);
}

describe('Studio Pi gateway', () => {
  it('runs a read-only Studio tool and returns the follow-up answer', async () => {
    const execute = vi.fn(async () => ({ ok: true, output: 'state ready' }));
    const authorize = vi.fn(async () => true);
    const streamFn = fakeStream(
      reply([{ type: 'toolCall', id: 'call-1', name: 'langbai_get_generation_state', arguments: { args: {} } }], 'toolUse'),
      reply([{ type: 'text', text: '已读取当前设置。' }], 'stop'),
    );
    const result = await runStudioPiAgent({
      model, streamFn, systemPrompt: 'Use Studio tools.', history: [], text: '检查设置',
      tools: [{ name: 'langbai_get_generation_state', description: 'Read current settings', readonly: true, execute }],
      authorize,
    });
    expect(result.text).toBe('已读取当前设置。');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(authorize).not.toHaveBeenCalled();
  });

  it('blocks a paid tool without UI approval', async () => {
    const execute = vi.fn(async () => ({ ok: true, output: 'generated' }));
    const streamFn = fakeStream(reply([
      { type: 'toolCall', id: 'call-2', name: 'langbai_generate_image', arguments: { args: { positivePrompt: 'cat' } } },
    ], 'toolUse'));
    await runStudioPiAgent({
      model, streamFn, systemPrompt: 'Use Studio tools.', history: [], text: '画猫',
      tools: [{ name: 'langbai_generate_image', description: 'Generate image', readonly: false, execute }],
      authorize: async () => false,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('never repeats a paid operation within one turn even if the model asks again', async () => {
    const execute = vi.fn(async () => ({ ok: true, output: 'image saved' }));
    const authorize = vi.fn(async () => true);
    const call = (id: string) => reply([
      { type: 'toolCall', id, name: 'langbai_generate_image',
        arguments: { args: { positivePrompt: 'cat' } } },
    ], 'toolUse');
    await runStudioPiAgent({
      model, streamFn: fakeStream(call('first'), call('again')),
      systemPrompt: 'Use Studio tools.', history: [], text: '画猫',
      tools: [{ name: 'langbai_generate_image', description: 'Generate image',
        readonly: false, paid: true, execute }], authorize,
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(authorize).toHaveBeenCalledTimes(1);
  });
});

it.each([
  { args: { preparationId: 42, count: 'not-an-integer' } },
  { args: { count: 1 } },
  { args: { preparationId: 'fixture', count: 99 } },
  { args: { preparationId: 'fixture', count: 1, arbitraryPath: 'unexpected' } },
  {},
])('rejects malformed schema fields before authorize or execute: %j', async (arguments_) => {
  const execute = vi.fn(async () => ({ ok: true, output: 'never' }));
  const authorize = vi.fn(async () => true);
  const running = vi.fn();
  const events: any[] = [];
  await runStudioPiAgent({ model, systemPrompt: 'fixture', history: [], text: 'fixture',
    streamFn: fakeStream(reply([{ type: 'toolCall', id: 'bad', name: 'paid', arguments: arguments_ }], 'toolUse'), reply([{ type: 'text', text: 'invalid input' }], 'stop')),
    tools: [{ name: 'paid', description: 'paid fixture', readonly: false, paid: true, execute,
      parameters: { type: 'object', properties: { preparationId: { type: 'string', minLength: 1 }, count: { type: 'integer', minimum: 1, maximum: 8 } },
        required: ['preparationId', 'count'], additionalProperties: false } }],
    authorize, onToolRunning: running, onEvent: event => { events.push(event); } });
  expect(authorize).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
  expect(running).not.toHaveBeenCalled();
  expect(events.find(event => event.type === 'tool_execution_end')).toMatchObject({ isError: true });
});

it('keeps args wrapper and passes validated field values to approval and execution', async () => {
  const execute = vi.fn(async () => ({ ok: true, output: 'fixture only' }));
  const authorize = vi.fn(async () => true);
  const onToolRunning = vi.fn();
  await runStudioPiAgent({ model, systemPrompt: 'fixture', history: [], text: 'fixture',
    streamFn: fakeStream(reply([{ type: 'toolCall', id: 'valid', name: 'paid', arguments: { args: { preparationId: 'fixture' } } }], 'toolUse'), reply([{ type: 'text', text: 'done' }], 'stop')),
    tools: [{ name: 'paid', description: 'fixture', readonly: false, execute, parameters: { type: 'object', properties: { preparationId: { type: 'string' } }, required: ['preparationId'], additionalProperties: false } }],
    authorize, onToolRunning });
  expect(authorize.mock.calls[0]?.[1]).toEqual({ preparationId: 'fixture' });
  expect(execute.mock.calls[0]?.[0]).toEqual({ preparationId: 'fixture' });
  expect(onToolRunning).toHaveBeenCalledWith('valid', 'paid', { preparationId: 'fixture' });
});
