import axios from 'axios';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import type { AppSettings } from '../../src/types';
import type { StreamFn } from '@earendil-works/pi-agent-core' with { 'resolution-mode': 'import' };
import type { Api, Model, Context, SimpleStreamOptions, AssistantMessage } from '@earendil-works/pi-ai' with { 'resolution-mode': 'import' };
import { proxyConfigForUrl } from './proxy';
import { knownAgentModel, agentProviderRequiresApiKey } from '../../src/agent/provider-catalog';

const API = {
  'openai-compatible': 'openai-completions',
  'openai-responses': 'openai-responses',
  'anthropic-messages': 'anthropic-messages',
  'google-gemini': 'google-generative-ai',
} as const;

/** Preserve the application's PAC/manual/SOCKS proxy route for Pi HTTP calls. */
export function studioPiFetch(settings: AppSettings): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    if (!settings.agentApiKey.trim() && !agentProviderRequiresApiKey(settings.agentApiProtocol, settings.agentApiBaseUrl)) request.headers.delete('authorization');
    const body = request.body ? Readable.fromWeb(request.body as import('node:stream/web').ReadableStream) : undefined;
    const response = await axios.request<Readable>({
      url: request.url,
      method: request.method,
      data: body,
      headers: Object.fromEntries(request.headers.entries()),
      responseType: 'stream',
      signal: request.signal,
      timeout: 10 * 60 * 1000,
      maxBodyLength: 64 * 1024 * 1024,
      maxContentLength: 64 * 1024 * 1024,
      maxRedirects: 0,
      validateStatus: () => true,
      ...await proxyConfigForUrl('ai', request.url, settings),
    });
    const headers = new Headers();
    for (const [name, value] of Object.entries(response.headers)) {
      if (value == null || ['content-encoding', 'content-length', 'transfer-encoding'].includes(name.toLowerCase())) continue;
      headers.set(name, Array.isArray(value) ? value.join(', ') : String(value));
    }
    const noBody = [204, 205, 304].includes(response.status);
    return new Response(noBody ? null : Readable.toWeb(response.data) as ReadableStream<Uint8Array>, {
      status: response.status,
      headers,
    });
  };
}

/** Pi understands the LLM transport; NovelAI image settings are separate. */
export function studioPiModel(settings: AppSettings): Model<Api> {
  const api = API[settings.agentApiProtocol];
  return {
    id: settings.agentApiModel.trim(),
    name: settings.agentApiModel.trim(),
    api,
    provider: 'langbai-studio',
    baseUrl: settings.agentApiBaseUrl.trim().replace(/\/$/, ''),
    reasoning: knownAgentModel(settings.agentApiModel)?.reasoning === true,
    // Auto means provider defaults, not an unsupported explicit `none` effort.
    thinkingLevelMap: { off: null },
    input: settings.agentVisionEnabled ? ['text', 'image'] : ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: settings.agentContextWindow,
    maxTokens: settings.agentMaxOutputTokens,
  };
}

export function studioPiStream(settings: AppSettings): StreamFn {
  const fetch = studioPiFetch(settings);
  return async (model, context, options) => {
    const common = { ...options, maxTokens: settings.agentMaxOutputTokens,
      apiKey: settings.agentApiKey.trim() || (!agentProviderRequiresApiKey(settings.agentApiProtocol, settings.agentApiBaseUrl) ? 'local-no-key' : ''), fetch };
    switch (model.api) {
      case 'openai-completions': {
        const api = await import('@earendil-works/pi-ai/api/openai-completions');
        return api.streamSimple(model as Model<'openai-completions'>, context, common);
      }
      case 'openai-responses': {
        const api = await import('@earendil-works/pi-ai/api/openai-responses');
        return api.streamSimple(model as Model<'openai-responses'>, context, common);
      }
      case 'anthropic-messages': {
        const api = await import('@earendil-works/pi-ai/api/anthropic-messages');
        return api.streamSimple(model as Model<'anthropic-messages'>, context, common);
      }
      case 'google-generative-ai':
        return studioGeminiStream(model as Model<'google-generative-ai'>, context, common);
      default:
        throw new Error(`未支持的 Pi 模型协议：${model.api}`);
    }
  };
}

interface GeminiChunk {
  responseId?: string;
  error?: { message?: string };
  promptFeedback?: { blockReason?: string };
  candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{
    text?: string; thought?: boolean; thoughtSignature?: string;
    functionCall?: { id?: string; name?: string; args?: Record<string, unknown> };
  }> } }>;
  usageMetadata?: { promptTokenCount?: number; cachedContentTokenCount?: number;
    candidatesTokenCount?: number; thoughtsTokenCount?: number; totalTokenCount?: number };
}

/** Incremental UTF-8 SSE decoding, including frames split across network chunks. */
async function* geminiChunks(response: Response): AsyncGenerator<GeminiChunk> {
  if (!response.body) throw new Error('Gemini returned no response body.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const decode = (block: string): GeminiChunk | undefined => {
    const data = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    return data && data !== '[DONE]' ? JSON.parse(data) as GeminiChunk : undefined;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary: RegExpMatchArray | null;
      while ((boundary = buffer.match(/\r?\n\r?\n/)) && boundary.index !== undefined) {
        const chunk = decode(buffer.slice(0, boundary.index));
        buffer = buffer.slice(boundary.index + boundary[0].length);
        if (chunk) yield chunk;
      }
      if (buffer.length > 16 * 1024 * 1024) throw new Error('Gemini SSE frame exceeds the response limit.');
      if (done) break;
    }
    if (buffer.trim()) { const chunk = decode(buffer); if (chunk) yield chunk; }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** Gemini REST over the same Axios/PAC/SOCKS transport as the other Pi adapters.
 * No global fetch mutation, SDK-native fallback, automatic retry, or local relay.
 * Pi's public converters retain tool schemas, image data, and thought signatures.
 */
async function studioGeminiStream(model: Model<'google-generative-ai'>, context: Context,
  options: SimpleStreamOptions & { fetch: typeof fetch }) {
  const [{ createAssistantMessageEventStream }, google] = await Promise.all([
    import('@earendil-works/pi-ai'), import('@earendil-works/pi-ai/api/google-shared'),
  ]);
  const stream = createAssistantMessageEventStream();
  const output: AssistantMessage = {
    role: 'assistant', content: [], api: model.api, provider: model.provider, model: model.id,
    stopReason: 'pending', timestamp: Date.now(), usage: { input: 0, output: 0, cacheRead: 0,
      cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  };
  void (async () => {
    try {
      options.signal?.throwIfAborted();
      if (!options.apiKey) throw new Error('Gemini API key is required.');
      const strict = google.supportsGoogleStrictToolSampling(model.id);
      const mode = context.tools?.length ? google.resolveGoogleFunctionCallingMode(context.tools, options.toolChoice, strict) : undefined;
      const generationConfig: Record<string, unknown> = { maxOutputTokens: options.maxTokens ?? model.maxTokens };
      if (options.temperature !== undefined) generationConfig.temperature = options.temperature;
      if (model.reasoning && options.reasoning) {
        const effort = google.resolveGoogleThinkingLevel(model, options.reasoning);
        generationConfig.thinkingConfig = /gemini-3/i.test(model.id)
          ? { includeThoughts: true, thinkingLevel: /-pro/i.test(model.id) && effort === 'medium' ? 'HIGH' : effort.toUpperCase() }
          : { includeThoughts: true, thinkingBudget: Math.min(Math.max(0, Number(generationConfig.maxOutputTokens) - 1),
            options.thinkingBudgets?.[effort] ?? { minimal: 128, low: 2048, medium: 8192, high: 24576 }[effort]) };
      }
      // Auto deliberately omits thinkingConfig, leaving provider defaults intact.
      let body: unknown = { contents: google.convertMessages(model, context), generationConfig,
        ...(context.systemPrompt ? { systemInstruction: { parts: [{ text: context.systemPrompt }] } } : {}),
        ...(context.tools?.length ? { tools: google.convertTools(context.tools, false, strict) } : {}),
        ...(mode ? { toolConfig: { functionCallingConfig: { mode } } } : {}),
      };
      const replacement = await options.onPayload?.(body, model);
      if (replacement !== undefined) body = replacement;
      const url = `${model.baseUrl.replace(/\/+$/, '')}/models/${encodeURIComponent(model.id.replace(/^models\//, ''))}:streamGenerateContent?alt=sse`;
      const response = await options.fetch(url, { method: 'POST', signal: options.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', 'x-goog-api-key': options.apiKey },
        body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${(await response.text()).slice(0, 4000)}`);
      stream.push({ type: 'start', partial: output });
      for await (const chunk of geminiChunks(response)) {
        options.signal?.throwIfAborted();
        if (chunk.error || chunk.promptFeedback?.blockReason) throw new Error(chunk.error?.message ?? `Gemini blocked: ${chunk.promptFeedback?.blockReason}`);
        output.responseId ||= chunk.responseId;
        const candidate = chunk.candidates?.[0];
        for (const part of candidate?.content?.parts ?? []) {
          const contentIndex = output.content.length;
          if (part.text !== undefined) {
            if (part.thought) {
              output.content.push({ type: 'thinking', thinking: part.text, thinkingSignature: part.thoughtSignature });
              stream.push({ type: 'thinking_start', contentIndex, partial: output });
              stream.push({ type: 'thinking_delta', contentIndex, delta: part.text, partial: output });
              stream.push({ type: 'thinking_end', contentIndex, content: part.text, partial: output });
            } else {
              output.content.push({ type: 'text', text: part.text, textSignature: part.thoughtSignature });
              stream.push({ type: 'text_start', contentIndex, partial: output });
              stream.push({ type: 'text_delta', contentIndex, delta: part.text, partial: output });
              stream.push({ type: 'text_end', contentIndex, content: part.text, partial: output });
            }
          }
          if (part.functionCall) {
            const call = part.functionCall;
            const id = call.id && !output.content.some(part => part.type === 'toolCall' && part.id === call.id) ? call.id : randomUUID();
            const toolCall = { type: 'toolCall' as const, id, name: call.name ?? '', arguments: call.args ?? {}, thoughtSignature: part.thoughtSignature };
            const index = output.content.length;
            output.content.push(toolCall);
            stream.push({ type: 'toolcall_start', contentIndex: index, partial: output });
            stream.push({ type: 'toolcall_delta', contentIndex: index, delta: JSON.stringify(toolCall.arguments), partial: output });
            stream.push({ type: 'toolcall_end', contentIndex: index, toolCall, partial: output });
          }
        }
        if (candidate?.finishReason) {
          output.rawStopReason = candidate.finishReason;
          output.stopReason = google.mapStopReasonString(candidate.finishReason);
          if (output.stopReason === 'stop' && output.content.some(part => part.type === 'toolCall')) output.stopReason = 'toolUse';
        }
        const usage = chunk.usageMetadata;
        if (usage) {
          output.usage.input = Math.max(0, (usage.promptTokenCount ?? 0) - (usage.cachedContentTokenCount ?? 0));
          output.usage.cacheRead = usage.cachedContentTokenCount ?? 0;
          output.usage.reasoning = usage.thoughtsTokenCount ?? 0;
          output.usage.output = (usage.candidatesTokenCount ?? 0) + output.usage.reasoning;
          output.usage.totalTokens = usage.totalTokenCount ?? output.usage.input + output.usage.cacheRead + output.usage.output;
        }
      }
      options.signal?.throwIfAborted();
      if (output.stopReason !== 'stop' && output.stopReason !== 'length' && output.stopReason !== 'toolUse') {
        throw new Error(`Gemini stream did not complete: ${output.rawStopReason ?? 'missing finish reason'}`);
      }
      stream.push({ type: 'done', reason: output.stopReason, message: output });
    } catch (error) {
      output.stopReason = options.signal?.aborted ? 'aborted' : 'error';
      output.errorMessage = error instanceof Error ? error.message : String(error);
      stream.push({ type: 'error', reason: output.stopReason, error: output });
    } finally { stream.end(); }
  })();
  return stream;
}
