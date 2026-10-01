/**
 * Narrow Pi Agent Core adapter for Studio-owned tools.  Provider transport and
 * UI approval are deliberately injected: this module never opens a shell,
 * discovers plugins, or treats model-supplied arguments as permission.
 */
import type { AgentEvent, AgentTool, StreamFn } from '@earendil-works/pi-agent-core' with { 'resolution-mode': 'import' };
import type { Api, Message, Model, Usage, UserMessage } from '@earendil-works/pi-ai' with { 'resolution-mode': 'import' };

export interface StudioPiTool {
  name: string;
  description: string;
  readonly: boolean;
  paid?: boolean;
  /** Schema for the fields INSIDE the existing args wrapper, not the wrapper itself. */
  parameters?: Record<string, unknown>;
  execute: (args: Record<string, unknown>, signal: AbortSignal) => Promise<{
    ok: boolean;
    output: string;
    data?: unknown;
  }>;
}

export interface StudioPiRun {
  model: Model<Api>;
  streamFn: StreamFn;
  systemPrompt: string;
  history: Message[];
  text: string | UserMessage;
  tools: readonly StudioPiTool[];
  authorize: (name: string, args: Record<string, unknown>, signal: AbortSignal) => Promise<boolean>;
  onToolRunning?: (id: string, name: string, args: Record<string, unknown>) => void;
  onEvent?: (event: AgentEvent) => void | Promise<void>;
  thinkingLevel?: "low" | "medium" | "high";
  signal?: AbortSignal;
  /** Only the persisted application UI mode can grant this, never model arguments. */
  fullAuto?: boolean;
}

export interface StudioPiResult {
  text: string;
  reasoning: string;
  usage: Usage;
  messages: Message[];
}

/** Runs one bounded turn, leaving the host responsible for durable history. */
export async function runStudioPiAgent(input: StudioPiRun): Promise<StudioPiResult> {
  // The Electron main process is CommonJS; Pi is ESM-only. Node16 dynamic
  // import is preserved by tsc and avoids loading Pi at normal app startup.
  const [{ Agent }, { Type }] = await Promise.all([
    import('@earendil-works/pi-agent-core'),
    import('@earendil-works/pi-ai'),
  ]);
  const allowed = new Map(input.tools.map((tool) => [tool.name, tool]));
  let paidAttempted = false;
  let paidFailed = false;
  let toolCalls = 0;
  const tools: AgentTool[] = input.tools.map((entry) => ({
    name: entry.name,
    label: entry.name,
    description: entry.description,
    parameters: Type.Object({ args: entry.parameters
      ? Type.Unsafe(entry.parameters)
      : Type.Optional(Type.Object({}, { additionalProperties: true })) }, { additionalProperties: false }),
    executionMode: 'sequential',
    async execute(_id, params, signal) {
      const args = (params as { args?: Record<string, unknown> }).args ?? {};
      signal?.throwIfAborted();
      input.onToolRunning?.(_id, entry.name, args);
      if (entry.paid) paidAttempted = true;
      let result:Awaited<ReturnType<StudioPiTool['execute']>>;
      try{result=await entry.execute(args, signal ?? new AbortController().signal);if(!result.ok)throw new Error(result.output);}
      catch(error){if(entry.paid)paidFailed=true;throw error;}
      return { content: [{ type: 'text', text: result.output }], details: result };
    },
  }));
  const agent = new Agent({
    initialState: {
      model: input.model,
      thinkingLevel: input.model.reasoning ? input.thinkingLevel ?? "off" : "off",
      systemPrompt: input.systemPrompt,
      messages: input.history,
      tools,
    },
    streamFn: input.streamFn,
    toolExecution: 'sequential',
    beforeToolCall: async ({ toolCall, args }, signal) => {
      if (++toolCalls > 12 && !input.fullAuto) return { block: true, reason: '单轮工具调用超过上限。', terminate: true };
      const tool = allowed.get(toolCall.name);
      if (!tool) return { block: true, reason: '未授权的软件工具。', terminate: true };
      if(tool.paid&&paidFailed)return {block:true,reason:'付费请求失败或结果不确定；保留结果，停止自动重发以免重复扣费。',terminate:true};
      if (tool.paid && paidAttempted && !input.fullAuto) {
        return { block: true, reason: '单轮已尝试过付费操作；请用户检查结果后另发一条消息。', terminate: true };
      }
      if (tool.readonly) return undefined;
      const parameters = (args as { args?: Record<string, unknown> }).args ?? {};
      const approved = await input.authorize(tool.name, parameters, signal ?? new AbortController().signal);
      return approved ? undefined : { block: true, reason: '用户未确认此操作。', terminate: true };
    },
  });
  if (input.onEvent) agent.subscribe((event) => input.onEvent!(event));
  const abort = () => agent.abort();
  input.signal?.addEventListener('abort', abort, { once: true });
  try {
    input.signal?.throwIfAborted();
    if (typeof input.text === 'string') await agent.prompt(input.text);
    else await agent.prompt(input.text);
    input.signal?.throwIfAborted();
    const last = [...agent.state.messages].reverse().find((message) => message.role === 'assistant');
    if (!last || last.role !== 'assistant') throw new Error('Pi 未返回助手消息。');
    if (last.stopReason === 'error' || last.stopReason === 'aborted') {
      throw new Error(last.errorMessage ?? 'Pi 请求未完成。');
    }
    const text = last.content.filter((part) => part.type === 'text').map((part) => part.text).join('');
    const fallback = [...agent.state.messages].reverse().find((message) => message.role === 'toolResult');
    return {
      text: text || (fallback?.role === 'toolResult'
        ? fallback.content.filter((part) => part.type === 'text').map((part) => part.text).join('')
        : ''),
      reasoning: last.content.filter((part) => part.type === 'thinking').map((part) => part.thinking).join(''),
      usage: last.usage,
      messages: agent.state.messages as Message[],
    };
  } finally {
    input.signal?.removeEventListener('abort', abort);
  }
}
