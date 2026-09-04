import axios, { type AxiosResponse } from "axios";
import crypto from "node:crypto";
import fs from "node:fs";
import type { Readable } from "node:stream";
import type {
  AgentConversation,
  AgentEvent,
  AgentMessage,
  AgentPermissionRequest,
  AgentRuntimeStatus,
  AgentSendRequest,
  AgentTokenUsage,
  TavernImageProposal,
  TavernImageRequest,
} from "../../src/agent/types";
import { effectiveContextMessages, shouldAutoCompact } from "../../src/agent/context";
import { agentApiUrl, agentProviderRequiresApiKey } from "../../src/agent/provider-catalog";
import {
  buildTavernPromptMessages,
  defaultImagePromptForMessage,
  parseLangbaiImageProposal,
  type TavernPromptMessage,
} from "../../src/tavern/prompt";
import { DEFAULT_TAVERN_NEGATIVE_PROMPT, SOFTWARE_IMAGE_CHARACTER_ID } from "../../src/tavern/builtins";
import { injectDshImageAiSystemPrompt } from "./dsh-reverse-convert";
import { getSettings } from "./store";
import { proxyConfig } from "./proxy";
import {
  readAgentWorkspace,
  updateAgentConversation,
} from "./agent-store";
import { executeAgentTool } from "./agent-tools";

type EventSink = (event: AgentEvent) => void;
type ProviderTurn = {
  content: string;
  reasoning: string;
  usage?: AgentTokenUsage;
};

let eventSink: EventSink = () => undefined;
const activeRequests = new Map<string, AbortController>();

function timestamp() {
  return new Date().toISOString();
}

function providerConfigured() {
  const settings = getSettings();
  return Boolean(
    settings.agentApiBaseUrl.trim()
    && settings.agentApiModel.trim()
    && (!agentProviderRequiresApiKey(settings.agentApiProtocol, settings.agentApiBaseUrl)
      || settings.agentApiKey.trim()),
  );
}

function status(state: AgentRuntimeStatus["state"], message?: string): AgentRuntimeStatus {
  return {
    kind: "direct-provider",
    state,
    version: "tavern-direct-1",
    ...(message ? { message } : {}),
    providerConfigured: providerConfigured(),
    updatedAt: timestamp(),
  };
}

function emit(event: AgentEvent) {
  eventSink(event);
}

function emitWorkspace() {
  emit({ kind: "workspace", workspace: readAgentWorkspace() });
}

export function setAgentEventSink(next: EventSink) {
  eventSink = next;
  emit({ kind: "runtime", status: getAgentRuntimeStatus() });
}

export function getAgentRuntimeStatus() {
  return status(providerConfigured() ? "ready" : "stopped", providerConfigured()
    ? "角色酒馆已连接直连模型运行时。"
    : "请先配置模型服务。");
}

export function getAgentPendingPermissions(): AgentPermissionRequest[] {
  return [];
}

export function ensureAgentRuntime() {
  const next = getAgentRuntimeStatus();
  emit({ kind: "runtime", status: next });
  return next;
}

export function restartAgentRuntime() {
  for (const controller of activeRequests.values()) controller.abort();
  activeRequests.clear();
  return ensureAgentRuntime();
}

export function stopAgentRuntime() {
  for (const controller of activeRequests.values()) controller.abort();
  activeRequests.clear();
  const next = status("stopped", "模型请求已停止。");
  emit({ kind: "runtime", status: next });
  return next;
}

function numeric(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function tokenUsage(value: unknown): AgentTokenUsage | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const details = raw.input_tokens_details && typeof raw.input_tokens_details === "object"
    ? raw.input_tokens_details as Record<string, unknown>
    : raw.prompt_tokens_details && typeof raw.prompt_tokens_details === "object"
      ? raw.prompt_tokens_details as Record<string, unknown>
      : {};
  const outputDetails = raw.output_tokens_details && typeof raw.output_tokens_details === "object"
    ? raw.output_tokens_details as Record<string, unknown>
    : raw.completion_tokens_details && typeof raw.completion_tokens_details === "object"
      ? raw.completion_tokens_details as Record<string, unknown>
      : {};
  const rawInput = numeric(raw.input_tokens ?? raw.prompt_tokens ?? raw.promptTokenCount, 0, 0, Number.MAX_SAFE_INTEGER);
  const rawOutput = numeric(raw.output_tokens ?? raw.completion_tokens ?? raw.candidatesTokenCount, 0, 0, Number.MAX_SAFE_INTEGER);
  const cacheRead = numeric(details.cached_tokens ?? raw.cache_read_input_tokens ?? raw.cachedContentTokenCount, 0, 0, rawInput);
  const reasoning = numeric(outputDetails.reasoning_tokens ?? raw.thoughtsTokenCount, 0, 0, rawOutput);
  const cacheWrite = numeric(raw.cache_creation_input_tokens, 0, 0, Number.MAX_SAFE_INTEGER);
  const input = Math.max(0, rawInput - cacheRead);
  const output = Math.max(0, rawOutput - reasoning);
  return {
    input,
    output,
    reasoning,
    cacheRead,
    cacheWrite,
    total: numeric(raw.total_tokens ?? raw.totalTokenCount, input + output + reasoning + cacheRead + cacheWrite, 0, Number.MAX_SAFE_INTEGER),
  };
}

function contentText(content: TavernPromptMessage["content"]) {
  if (typeof content === "string") return content;
  return content.map((part) => {
    if (part.type === "text" || part.type === "input_text") return String(part.text ?? "");
    return "";
  }).join("\n");
}

function imageDataUrl(filePath: string, mime: string, size: number) {
  if (!mime.startsWith("image/") || size <= 0 || size > 20 * 1024 * 1024 || !fs.existsSync(filePath)) return undefined;
  return `data:${mime};base64,${fs.readFileSync(filePath).toString("base64")}`;
}

function promptMessagesWithImages(messages: TavernPromptMessage[], conversationId: string) {
  const settings = getSettings();
  const plain = (message: TavernPromptMessage, content = message.content): TavernPromptMessage => ({
    role: message.role,
    content,
  });
  if (!settings.agentVisionEnabled) return messages.map((message) => plain(message));
  const conversation = readAgentWorkspace().conversations.find((item) => item.id === conversationId);
  if (!conversation) return messages.map((message) => plain(message));
  const sourceById = new Map(effectiveContextMessages(
    conversation.messages,
    conversation.lastSummary,
    conversation.lastCompactedAt,
  ).filter((message) => message.status !== "streaming" && message.role !== "system")
    .map((message) => [message.id, message] as const));
  return messages.map((message) => {
    // Generated assistant images are local results, not model input. Several
    // providers reject image parts on assistant messages outright. Only an
    // image the user explicitly attached is sent back to a vision model.
    if (message.role !== "user" || !message.sourceMessageId) return plain(message);
    const backing = sourceById.get(message.sourceMessageId);
    if (!backing || backing.role !== "user") return plain(message);
    const images = backing.attachments
      .map((attachment) => imageDataUrl(attachment.filePath, attachment.mime, attachment.size))
      .filter((value): value is string => Boolean(value)) ?? [];
    if (!images.length) return plain(message);
    return plain(message, [
        { type: "text", text: contentText(message.content) },
        ...images.map((url) => ({ type: "image_url", image_url: { url } })),
      ]);
  });
}

async function streamToString(stream: Readable) {
  let body = "";
  for await (const chunk of stream) body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
  return body;
}

async function consumeSse(
  stream: Readable,
  onEvent: (event: string, data: string) => void,
) {
  let buffer = "";
  const dispatch = (block: string) => {
    const lines = block.split(/\r?\n/);
    let event = "message";
    const data: string[] = [];
    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (data.length) onEvent(event, data.join("\n"));
  };
  for await (const chunk of stream) {
    buffer += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    let match = buffer.match(/\r?\n\r?\n/);
    while (match?.index !== undefined) {
      const boundary = match.index;
      dispatch(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + match[0].length);
      match = buffer.match(/\r?\n\r?\n/);
    }
  }
  if (buffer.trim()) dispatch(buffer);
}

async function providerRequest(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
  controller: AbortController,
) {
  return axios.post<Readable>(url, body, {
    ...proxyConfig("ai"),
    headers,
    responseType: "stream",
    signal: controller.signal,
    timeout: 10 * 60 * 1000,
    maxBodyLength: 64 * 1024 * 1024,
    maxContentLength: 64 * 1024 * 1024,
    validateStatus: () => true,
  });
}

async function providerError(response: AxiosResponse<Readable>) {
  const body = await streamToString(response.data);
  try {
    const decoded = JSON.parse(body) as Record<string, unknown>;
    const error = decoded.error && typeof decoded.error === "object"
      ? decoded.error as Record<string, unknown>
      : decoded;
    return String(error.message ?? error.error ?? body).slice(0, 4_000);
  } catch {
    return body.slice(0, 4_000) || `HTTP ${response.status}`;
  }
}

function openAiContentDelta(value: unknown) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map((part) => part && typeof part === "object"
    ? String((part as Record<string, unknown>).text ?? "")
    : "").join("");
}

function activePreset(controller: AbortController) {
  const workspace = readAgentWorkspace();
  const conversation = workspace.conversations.find((item) => item.status === "running" && activeRequests.get(item.id) === controller);
  return workspace.samplerPresets.find((item) => item.id === conversation?.samplerPresetId);
}

function activeReasoningEffort(controller: AbortController) {
  const workspace = readAgentWorkspace();
  const conversation = workspace.conversations.find((item) => item.status === "running" && activeRequests.get(item.id) === controller);
  return conversation?.reasoningEffort ?? "auto";
}

async function openAiChat(
  messages: TavernPromptMessage[],
  controller: AbortController,
  onDelta: (delta: string) => void,
): Promise<ProviderTurn> {
  const settings = getSettings();
  const preset = activePreset(controller);
  const body: Record<string, unknown> = {
    model: settings.agentApiModel.trim(),
    messages,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: preset?.maxOutputTokens ?? settings.agentMaxOutputTokens,
    temperature: preset?.temperature ?? 0.9,
    top_p: preset?.topP ?? 0.95,
    frequency_penalty: preset?.frequencyPenalty ?? 0,
    presence_penalty: preset?.presencePenalty ?? 0,
    ...(preset?.stop.length ? { stop: preset.stop } : {}),
    ...(activeReasoningEffort(controller) === "auto" ? {} : { reasoning_effort: activeReasoningEffort(controller) }),
  };
  const headers = {
    Accept: "text/event-stream, application/json",
    "Content-Type": "application/json",
    ...(settings.agentApiKey.trim() ? { Authorization: `Bearer ${settings.agentApiKey.trim()}` } : {}),
    "User-Agent": "Langbai-NovelAI-Studio-Tavern/1",
  };
  let response: AxiosResponse<Readable>;
  for (let attempt = 0; ; attempt += 1) {
    response = await providerRequest(agentApiUrl(settings.agentApiBaseUrl, "/chat/completions"), body, headers, controller);
    if (response.status >= 200 && response.status < 300) break;
    const message = await providerError(response);
    const unsupportedReasoning = response.status === 400
      && Object.hasOwn(body, "reasoning_effort")
      && /reasoning(?:_effort)?|unknown (?:field|parameter)|unsupported (?:field|parameter)/i.test(message);
    if (unsupportedReasoning && attempt < 2) {
      delete body.reasoning_effort;
      continue;
    }
    if (response.status === 400 && body.stream !== false && /stream(?:_options)?/i.test(message) && attempt < 2) {
      body.stream = false;
      delete body.stream_options;
      continue;
    }
    throw new Error(message);
  }
  if (response.status < 200 || response.status >= 300) throw new Error(await providerError(response));
  const contentType = String(response.headers["content-type"] ?? "").toLocaleLowerCase();
  if (!contentType.includes("text/event-stream")) {
    const raw = await streamToString(response.data);
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const choice = Array.isArray(payload.choices) ? payload.choices[0] as Record<string, unknown> : {};
    const message = choice?.message && typeof choice.message === "object" ? choice.message as Record<string, unknown> : {};
    const content = openAiContentDelta(message.content);
    if (content) onDelta(content);
    return {
      content,
      reasoning: String(message.reasoning_content ?? message.reasoning ?? ""),
      usage: tokenUsage(payload.usage),
    };
  }
  let content = "";
  let reasoning = "";
  let usage: AgentTokenUsage | undefined;
  await consumeSse(response.data, (_event, data) => {
    if (data === "[DONE]") return;
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(data) as Record<string, unknown>; } catch { return; }
    if (payload.usage) usage = tokenUsage(payload.usage) ?? usage;
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    for (const rawChoice of choices) {
      if (!rawChoice || typeof rawChoice !== "object") continue;
      const choice = rawChoice as Record<string, unknown>;
      const delta = choice.delta && typeof choice.delta === "object" ? choice.delta as Record<string, unknown> : {};
      const text = openAiContentDelta(delta.content);
      if (text) {
        content += text;
        onDelta(text);
      }
      reasoning += String(delta.reasoning_content ?? delta.reasoning ?? "");
    }
  });
  return { content, reasoning, usage };
}

function responsesInput(messages: TavernPromptMessage[]) {
  return messages.filter((message) => message.role !== "system").map((message) => ({
    role: message.role,
    content: typeof message.content === "string"
      ? message.content
      : message.content.map((part) => part.type === "image_url"
        ? { type: "input_image", image_url: (part.image_url as { url?: string } | undefined)?.url ?? "" }
        : { type: "input_text", text: String(part.text ?? "") }),
  }));
}

function parseResponsesJson(payload: Record<string, unknown>) {
  let content = "";
  let reasoning = "";
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const rawItem of output) {
    if (!rawItem || typeof rawItem !== "object") continue;
    const item = rawItem as Record<string, unknown>;
    for (const rawPart of Array.isArray(item.content) ? item.content : []) {
      if (!rawPart || typeof rawPart !== "object") continue;
      const part = rawPart as Record<string, unknown>;
      const text = String(part.text ?? "");
      if (part.type === "reasoning_text" || part.type === "summary_text") reasoning += text;
      else content += text;
    }
  }
  return { content, reasoning, usage: tokenUsage(payload.usage) };
}

async function openAiResponses(
  messages: TavernPromptMessage[],
  controller: AbortController,
  onDelta: (delta: string) => void,
): Promise<ProviderTurn> {
  const settings = getSettings();
  const instructions = messages.filter((item) => item.role === "system").map((item) => contentText(item.content)).join("\n\n");
  const effort = activeReasoningEffort(controller);
  const body: Record<string, unknown> = {
    model: settings.agentApiModel.trim(),
    input: responsesInput(messages),
    instructions,
    max_output_tokens: activePreset(controller)?.maxOutputTokens ?? settings.agentMaxOutputTokens,
    stream: true,
    ...(effort === "auto" ? {} : { reasoning: { effort } }),
  };
  const headers = {
    Accept: "text/event-stream, application/json",
    "Content-Type": "application/json",
    ...(settings.agentApiKey.trim() ? { Authorization: `Bearer ${settings.agentApiKey.trim()}` } : {}),
    "User-Agent": "Langbai-NovelAI-Studio-Tavern/1",
  };
  let response = await providerRequest(agentApiUrl(settings.agentApiBaseUrl, "/responses"), body, headers, controller);
  if ((response.status < 200 || response.status >= 300) && response.status === 400 && Object.hasOwn(body, "reasoning")) {
    const message = await providerError(response);
    if (/reasoning|unknown (?:field|parameter)|unsupported (?:field|parameter)/i.test(message)) {
      delete body.reasoning;
      response = await providerRequest(agentApiUrl(settings.agentApiBaseUrl, "/responses"), body, headers, controller);
    } else {
      throw new Error(message);
    }
  }
  if (response.status < 200 || response.status >= 300) throw new Error(await providerError(response));
  const contentType = String(response.headers["content-type"] ?? "").toLocaleLowerCase();
  if (!contentType.includes("text/event-stream")) {
    const parsed = parseResponsesJson(JSON.parse(await streamToString(response.data)) as Record<string, unknown>);
    if (parsed.content) onDelta(parsed.content);
    return parsed;
  }
  let content = "";
  let reasoning = "";
  let usage: AgentTokenUsage | undefined;
  await consumeSse(response.data, (event, data) => {
    if (data === "[DONE]") return;
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(data) as Record<string, unknown>; } catch { return; }
    const kind = String(payload.type ?? event);
    if (kind === "response.output_text.delta") {
      const delta = String(payload.delta ?? "");
      content += delta;
      if (delta) onDelta(delta);
    } else if (kind.includes("reasoning") && kind.endsWith(".delta")) {
      reasoning += String(payload.delta ?? "");
    } else if (kind === "response.completed" && payload.response && typeof payload.response === "object") {
      usage = tokenUsage((payload.response as Record<string, unknown>).usage) ?? usage;
    }
  });
  return { content, reasoning, usage };
}

function dataUrlParts(url: string) {
  const match = url.match(/^data:([^;,]+);base64,(.+)$/s);
  return match ? { mediaType: match[1], data: match[2] } : undefined;
}

function anthropicMessages(messages: TavernPromptMessage[]) {
  return messages.filter((message) => message.role !== "system").map((message) => ({
    role: message.role === "assistant" ? "assistant" : "user",
    content: typeof message.content === "string"
      ? message.content
      : message.content.map((part) => {
        if (part.type !== "image_url") return { type: "text", text: String(part.text ?? "") };
        const parsed = dataUrlParts((part.image_url as { url?: string } | undefined)?.url ?? "");
        return parsed
          ? { type: "image", source: { type: "base64", media_type: parsed.mediaType, data: parsed.data } }
          : { type: "text", text: "[image omitted]" };
      }),
  }));
}

async function anthropic(
  messages: TavernPromptMessage[],
  controller: AbortController,
  onDelta: (delta: string) => void,
): Promise<ProviderTurn> {
  const settings = getSettings();
  const system = messages.filter((item) => item.role === "system").map((item) => contentText(item.content)).join("\n\n");
  const response = await providerRequest(agentApiUrl(settings.agentApiBaseUrl, "/v1/messages"), {
    model: settings.agentApiModel.trim(),
    system,
    messages: anthropicMessages(messages),
    max_tokens: activePreset(controller)?.maxOutputTokens ?? settings.agentMaxOutputTokens,
    stream: true,
  }, {
    Accept: "text/event-stream, application/json",
    "Content-Type": "application/json",
    "x-api-key": settings.agentApiKey.trim(),
    "anthropic-version": "2023-06-01",
    "User-Agent": "Langbai-NovelAI-Studio-Tavern/1",
  }, controller);
  if (response.status < 200 || response.status >= 300) throw new Error(await providerError(response));
  let content = "";
  let reasoning = "";
  let rawUsage: Record<string, unknown> = {};
  await consumeSse(response.data, (event, data) => {
    if (data === "[DONE]") return;
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(data) as Record<string, unknown>; } catch { return; }
    const kind = String(payload.type ?? event);
    if (kind === "message_start" && payload.message && typeof payload.message === "object") {
      const value = (payload.message as Record<string, unknown>).usage;
      if (value && typeof value === "object") rawUsage = { ...rawUsage, ...(value as Record<string, unknown>) };
    }
    if (kind === "message_delta" && payload.usage && typeof payload.usage === "object") rawUsage = { ...rawUsage, ...(payload.usage as Record<string, unknown>) };
    if (kind !== "content_block_delta" || !payload.delta || typeof payload.delta !== "object") return;
    const delta = payload.delta as Record<string, unknown>;
    if (delta.type === "text_delta") {
      const text = String(delta.text ?? "");
      content += text;
      if (text) onDelta(text);
    } else if (delta.type === "thinking_delta") reasoning += String(delta.thinking ?? "");
  });
  return { content, reasoning, usage: tokenUsage(rawUsage) };
}

function geminiContents(messages: TavernPromptMessage[]) {
  return messages.filter((message) => message.role !== "system").map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: typeof message.content === "string"
      ? [{ text: message.content }]
      : message.content.map((part) => {
        if (part.type !== "image_url") return { text: String(part.text ?? "") };
        const parsed = dataUrlParts((part.image_url as { url?: string } | undefined)?.url ?? "");
        return parsed ? { inlineData: { mimeType: parsed.mediaType, data: parsed.data } } : { text: "[image omitted]" };
      }),
  }));
}

async function gemini(
  messages: TavernPromptMessage[],
  controller: AbortController,
  onDelta: (delta: string) => void,
): Promise<ProviderTurn> {
  const settings = getSettings();
  const base = agentApiUrl(settings.agentApiBaseUrl, `/models/${encodeURIComponent(settings.agentApiModel.trim())}:streamGenerateContent`);
  const url = `${base}${base.includes("?") ? "&" : "?"}alt=sse&key=${encodeURIComponent(settings.agentApiKey.trim())}`;
  const system = messages.filter((item) => item.role === "system").map((item) => contentText(item.content)).join("\n\n");
  const response = await providerRequest(url, {
    systemInstruction: { parts: [{ text: system }] },
    contents: geminiContents(messages),
    generationConfig: { maxOutputTokens: activePreset(controller)?.maxOutputTokens ?? settings.agentMaxOutputTokens },
  }, {
    Accept: "text/event-stream, application/json",
    "Content-Type": "application/json",
    "x-goog-api-key": settings.agentApiKey.trim(),
    "User-Agent": "Langbai-NovelAI-Studio-Tavern/1",
  }, controller);
  if (response.status < 200 || response.status >= 300) throw new Error(await providerError(response));
  let content = "";
  let usage: AgentTokenUsage | undefined;
  await consumeSse(response.data, (_event, data) => {
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(data) as Record<string, unknown>; } catch { return; }
    usage = tokenUsage(payload.usageMetadata) ?? usage;
    for (const rawCandidate of Array.isArray(payload.candidates) ? payload.candidates : []) {
      if (!rawCandidate || typeof rawCandidate !== "object") continue;
      const candidate = rawCandidate as Record<string, unknown>;
      const body = candidate.content && typeof candidate.content === "object" ? candidate.content as Record<string, unknown> : {};
      for (const rawPart of Array.isArray(body.parts) ? body.parts : []) {
        if (!rawPart || typeof rawPart !== "object") continue;
        const text = String((rawPart as Record<string, unknown>).text ?? "");
        content += text;
        if (text) onDelta(text);
      }
    }
  });
  return { content, reasoning: "", usage };
}

async function completeProvider(
  messages: TavernPromptMessage[],
  controller: AbortController,
  onDelta: (delta: string) => void,
) {
  switch (getSettings().agentApiProtocol) {
    case "openai-responses": return openAiResponses(messages, controller, onDelta);
    case "anthropic-messages": return anthropic(messages, controller, onDelta);
    case "google-gemini": return gemini(messages, controller, onDelta);
    default: return openAiChat(messages, controller, onDelta);
  }
}

function proposalFromRaw(
  raw: Record<string, unknown> | null,
  assistant: AgentMessage,
  character: ReturnType<typeof readAgentWorkspace>["characters"][number],
): TavernImageProposal | undefined {
  if (!raw) return undefined;
  const positivePrompt = typeof raw.positivePrompt === "string" && raw.positivePrompt.trim()
    ? raw.positivePrompt.trim()
    : defaultImagePromptForMessage(assistant, character);
  if (!positivePrompt) return undefined;
  return {
    id: crypto.randomUUID(),
    status: "pending",
    positivePrompt,
    negativePrompt: character.visual.negativePrompt.trim() || DEFAULT_TAVERN_NEGATIVE_PROMPT,
    stylePrompt: character.visual.stylePrompt,
    ...(typeof raw.model === "string" && raw.model ? { model: raw.model } : character.visual.model ? { model: character.visual.model } : {}),
    ...(Number.isFinite(Number(raw.width ?? character.visual.width)) ? { width: Math.round(numeric(raw.width ?? character.visual.width, 1024, 64, 2048)) } : {}),
    ...(Number.isFinite(Number(raw.height ?? character.visual.height)) ? { height: Math.round(numeric(raw.height ?? character.visual.height, 1024, 64, 2048)) } : {}),
    ...(Number.isFinite(Number(raw.steps ?? character.visual.steps)) ? { steps: Math.round(numeric(raw.steps ?? character.visual.steps, 28, 1, 50)) } : {}),
    ...(Number.isFinite(Number(raw.scale ?? character.visual.scale)) ? { scale: numeric(raw.scale ?? character.visual.scale, 5, 0, 10) } : {}),
    ...(typeof (raw.sampler ?? character.visual.sampler) === "string" ? { sampler: String(raw.sampler ?? character.visual.sampler) } : {}),
    count: Math.round(numeric(raw.count ?? character.visual.count, 1, 1, 8)),
    createdAt: timestamp(),
  };
}

function smoothEmitter(conversationId: string, messageId: string) {
  let queue = "";
  let timer: NodeJS.Timeout | undefined;
  const flushQueued = () => {
    if (!queue) return;
    const delta = queue;
    queue = "";
    emit({ kind: "message-delta", conversationId, messageId, delta });
  };
  return {
    push(delta: string) {
      queue += delta;
      if (!timer) timer = setTimeout(() => {
        timer = undefined;
        flushQueued();
      }, 34);
    },
    flush() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      flushQueued();
    },
  };
}

function compactableTranscript(conversation: AgentConversation) {
  const boundary = conversation.lastCompactedAt;
  const messages = conversation.messages
    .filter((message) => message.status === "complete")
    .filter((message) => !boundary || message.createdAt.localeCompare(boundary) > 0);
  const transcript = messages.map((message) => {
    const speaker = message.role === "user" ? "User" : message.role === "assistant" ? "Character" : "System";
    const content = message.content.trim().slice(0, 8_000);
    const images = message.attachments.filter((item) => item.kind === "image").length;
    return `${speaker}: ${content}${images ? `\n[${images} image attachment(s)]` : ""}`;
  }).join("\n\n");
  const combined = [
    conversation.lastSummary?.trim() ? `Previous continuity summary:\n${conversation.lastSummary.trim()}` : "",
    transcript ? `New roleplay transcript:\n${transcript}` : "",
  ].filter(Boolean).join("\n\n");
  return combined.length > 120_000 ? combined.slice(-120_000) : combined;
}

function localRoleplaySummary(conversation: AgentConversation) {
  const transcript = compactableTranscript(conversation);
  if (!transcript) return conversation.lastSummary?.trim() || "No roleplay history yet.";
  return transcript.length > 24_000 ? transcript.slice(-24_000) : transcript;
}

export async function generateTavernImage(request: TavernImageRequest) {
  const workspace = readAgentWorkspace();
  const conversation = workspace.conversations.find((item) => item.id === request.conversationId);
  const message = conversation?.messages.find((item) => item.id === request.messageId);
  if (!conversation || !message) return { ok: false, message: "找不到对应的对话消息。" };
  const character = workspace.characters.find((item) => item.id === conversation.activeCharacterId)
    ?? workspace.characters[0];
  const proposal = {
    ...request.proposal,
    negativePrompt: character?.visual.negativePrompt.trim() || DEFAULT_TAVERN_NEGATIVE_PROMPT,
    stylePrompt: character?.visual.stylePrompt ?? "",
  };
  updateAgentConversation(request.conversationId, (target) => {
    const item = target.messages.find((entry) => entry.id === request.messageId);
    if (item) item.imageProposal = { ...proposal, status: "running", error: undefined };
  });
  emitWorkspace();
  try {
    const result = await executeAgentTool({
      tool: "langbai_generate_image",
      args: {
        positivePrompt: proposal.positivePrompt,
        negativePrompt: proposal.negativePrompt,
        stylePrompt: proposal.stylePrompt,
        ...(proposal.model ? { model: proposal.model } : {}),
        ...(proposal.width ? { width: proposal.width } : {}),
        ...(proposal.height ? { height: proposal.height } : {}),
        ...(proposal.steps ? { steps: proposal.steps } : {}),
        ...(proposal.scale !== undefined ? { cfgScale: proposal.scale } : {}),
        ...(proposal.sampler ? { sampler: proposal.sampler } : {}),
        count: proposal.count,
      },
    }, emit);
    if (!result.ok) throw new Error(result.output || "图片生成失败。");
    updateAgentConversation(request.conversationId, (target) => {
      const item = target.messages.find((entry) => entry.id === request.messageId);
      if (!item) return;
      item.imageProposal = { ...proposal, status: "completed", error: undefined };
      item.attachments.push(...(result.generatedImages ?? []));
      item.tools.push({
        id: crypto.randomUUID(),
        name: "langbai_generate_image",
        title: "场景图片",
        status: "completed",
        input: { positivePrompt: proposal.positivePrompt, count: proposal.count },
        output: result.output,
        generatedImages: result.generatedImages,
        startedAt: proposal.createdAt,
        completedAt: timestamp(),
      });
    });
    emitWorkspace();
    return { ok: true };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    updateAgentConversation(request.conversationId, (target) => {
      const item = target.messages.find((entry) => entry.id === request.messageId);
      if (item) item.imageProposal = { ...proposal, status: "error", error: messageText };
    });
    emitWorkspace();
    return { ok: false, message: messageText };
  }
}

export async function sendAgentMessage(request: AgentSendRequest) {
  if (activeRequests.has(request.conversationId)) return { ok: false, message: "当前对话正在回复。" };
  if (!providerConfigured()) return { ok: false, message: "请先在右侧“模型”中配置可用的模型服务。" };
  let initial = readAgentWorkspace();
  let conversation = initial.conversations.find((item) => item.id === request.conversationId);
  if (!conversation) return { ok: false, message: "对话不存在。" };
  const settings = getSettings();
  if (shouldAutoCompact(conversation.context, settings.agentAutoCompact, settings.agentAutoCompactThreshold)) {
    await compactAgentConversation(request.conversationId, true);
    initial = readAgentWorkspace();
    conversation = initial.conversations.find((item) => item.id === request.conversationId);
    if (!conversation) return { ok: false, message: "对话不存在。" };
  }
  const characterId = request.characterId ?? conversation.activeCharacterId ?? conversation.characterIds[0];
  const character = initial.characters.find((item) => item.id === characterId);
  if (!character) return { ok: false, message: "请先为对话选择角色。" };
  const persona = initial.personas.find((item) => item.id === conversation.personaId)
    ?? initial.personas.find((item) => item.id === initial.selectedPersonaId);
  const preset = initial.samplerPresets.find((item) => item.id === conversation.samplerPresetId)
    ?? initial.samplerPresets[0];
  if (!preset) return { ok: false, message: "没有可用的对话预设。" };
  if (request.regenerateMessageId && !conversation.messages.some((item) => item.id === request.regenerateMessageId && item.role === "assistant")) {
    return { ok: false, message: "找不到需要重新生成的回复。" };
  }

  const messageId = request.regenerateMessageId ?? crypto.randomUUID();
  const createdAt = timestamp();
  updateAgentConversation(request.conversationId, (target) => {
    target.activeCharacterId = character.id;
    if (!target.characterIds.includes(character.id)) target.characterIds.push(character.id);
    target.status = "running";
    if (request.regenerateMessageId) {
      const assistant = target.messages.find((item) => item.id === request.regenerateMessageId && item.role === "assistant")!;
      const previous = assistant.content.trim();
      assistant.swipes = assistant.swipes?.length ? [...assistant.swipes] : previous ? [previous] : [];
      assistant.content = "";
      assistant.status = "streaming";
      assistant.error = undefined;
      assistant.reasoning = undefined;
      assistant.imageProposal = undefined;
      assistant.attachments = [];
      assistant.tools = [];
      assistant.characterId = character.id;
    } else {
      const text = request.text.trim();
      if (!text && !target.draftAttachments.length) throw new Error("请输入消息或添加图片。");
      const selectedIds = new Set(request.attachmentIds ?? target.draftAttachments.map((item) => item.id));
      const attachments = target.draftAttachments.filter((item) => selectedIds.has(item.id));
      target.draftAttachments = target.draftAttachments.filter((item) => !selectedIds.has(item.id));
      target.messages.push({
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        attachments,
        tools: [],
        status: "complete",
        createdAt,
      });
      target.messages.push({
        id: messageId,
        role: "assistant",
        content: "",
        attachments: [],
        tools: [],
        status: "streaming",
        characterId: character.id,
        createdAt,
      });
      if (target.messages.filter((item) => item.role === "user").length === 1 && text) {
        target.title = text.replace(/[\r\n]+/g, " ").slice(0, 36) || target.title;
      }
    }
  });
  emitWorkspace();

  const controller = new AbortController();
  activeRequests.set(request.conversationId, controller);
  const deltas = smoothEmitter(request.conversationId, messageId);
  try {
    const live = readAgentWorkspace();
    const activeConversation = live.conversations.find((item) => item.id === request.conversationId);
    if (!activeConversation) throw new Error("对话不存在。");
    const lorebooks = live.lorebooks.filter((item) => activeConversation.lorebookIds.includes(item.id));
    if (persona?.lorebookId) {
      const personaBook = live.lorebooks.find((item) => item.id === persona.lorebookId);
      if (personaBook && !lorebooks.some((item) => item.id === personaBook.id)) lorebooks.push(personaBook);
    }
    if (character.lorebookId) {
      const characterBook = live.lorebooks.find((item) => item.id === character.lorebookId);
      if (characterBook && !lorebooks.some((item) => item.id === characterBook.id)) lorebooks.push(characterBook);
    }
    const cast = activeConversation.characterIds
      .map((id) => live.characters.find((item) => item.id === id))
      .filter((item): item is typeof character => Boolean(item));
    const effectiveConversation: AgentConversation = {
      ...activeConversation,
      messages: effectiveContextMessages(
        activeConversation.messages,
        activeConversation.lastSummary,
        activeConversation.lastCompactedAt,
      ),
    };
    const prompt = buildTavernPromptMessages({
      conversation: effectiveConversation,
      characters: cast.length ? cast : [character],
      activeCharacter: character,
      persona,
      lorebooks,
      preset,
    });
    if (character.id === SOFTWARE_IMAGE_CHARACTER_ID) {
      const systemIndex = prompt.findIndex((item) => item.role === "system" && typeof item.content === "string");
      if (systemIndex >= 0) {
        const systemMessage = prompt[systemIndex];
        if (typeof systemMessage.content === "string") {
          prompt[systemIndex] = {
            ...systemMessage,
            content: injectDshImageAiSystemPrompt({
              task: "tavern-image",
              systemPrompt: systemMessage.content,
              enabled: settings.reverseConvertDshEnabled,
              mode: settings.reverseConvertDshMode,
            }),
          };
        }
      }
    }
    if (activeConversation.lastSummary?.trim()) {
      prompt.splice(1, 0, {
        role: "system",
        content: `Earlier roleplay summary and continuity notes:\n${activeConversation.lastSummary.trim()}`,
      });
    }
    const turn = await completeProvider(promptMessagesWithImages(prompt, request.conversationId), controller, (delta) => deltas.push(delta));
    deltas.flush();
    const parsed = parseLangbaiImageProposal(turn.content);
    updateAgentConversation(request.conversationId, (target) => {
      const assistant = target.messages.find((item) => item.id === messageId);
      if (!assistant) return;
      assistant.content = parsed.visible || "……";
      assistant.reasoning = turn.reasoning || undefined;
      assistant.usage = turn.usage;
      assistant.status = "complete";
      assistant.completedAt = timestamp();
      const swipes = assistant.swipes?.length ? [...assistant.swipes] : [];
      swipes.push(assistant.content);
      assistant.swipes = swipes;
      assistant.swipeIndex = swipes.length - 1;
      assistant.imageProposal = proposalFromRaw(parsed.proposal, assistant, character);
      target.lastTurnUsage = turn.usage;
      target.status = "idle";
    });
    emitWorkspace();
    const updated = readAgentWorkspace().conversations.find((item) => item.id === request.conversationId);
    const stored = updated?.messages.find((item) => item.id === messageId);
    if (stored?.imageProposal && updated?.generationMode === "auto") {
      await generateTavernImage({ conversationId: request.conversationId, messageId, proposal: stored.imageProposal });
    }
    return { ok: true };
  } catch (error) {
    deltas.flush();
    const aborted = controller.signal.aborted;
    const message = aborted ? "已停止回复。" : error instanceof Error ? error.message : String(error);
    updateAgentConversation(request.conversationId, (target) => {
      const assistant = target.messages.find((item) => item.id === messageId);
      if (assistant) {
        assistant.status = aborted ? "aborted" : "error";
        assistant.error = aborted ? undefined : message;
        assistant.completedAt = timestamp();
      }
      target.status = aborted ? "idle" : "error";
    });
    emitWorkspace();
    if (!aborted) emit({ kind: "error", conversationId: request.conversationId, message });
    return { ok: false, message };
  } finally {
    activeRequests.delete(request.conversationId);
  }
}

export function abortAgentMessage(conversationId: string) {
  const controller = activeRequests.get(conversationId);
  if (!controller) return { ok: false, message: "当前对话没有正在进行的回复。" };
  controller.abort();
  return { ok: true };
}

export async function compactAgentConversation(conversationId: string, automatic = false) {
  if (activeRequests.has(conversationId)) return { ok: false, message: "当前对话正在回复，暂时无法压缩。" };
  const workspace = readAgentWorkspace();
  const conversation = workspace.conversations.find((item) => item.id === conversationId);
  if (!conversation) return { ok: false, message: "对话不存在。" };
  if (!conversation.messages.some((item) => item.status === "complete")) {
    return { ok: true, message: "当前没有需要压缩的对话内容。" };
  }

  const controller = new AbortController();
  activeRequests.set(conversationId, controller);
  updateAgentConversation(conversationId, (target) => { target.status = "running"; });
  emitWorkspace();
  let summary = "";
  let usedFallback = false;
  try {
    if (providerConfigured()) {
      const transcript = compactableTranscript(conversation);
      const turn = await completeProvider([
        {
          role: "system",
          content: "Compress this fictional roleplay into concise continuity notes. Preserve character identities, appearance, personality and speaking style; relationships; current time, place and physical state; established world facts; promises, possessions and unresolved story hooks; and exact NovelAI visual tags or image parameters only when they were explicitly established. Do not invent facts. Return only the summary in the user's language.",
        },
        { role: "user", content: transcript },
      ], controller, () => undefined);
      summary = turn.content.trim();
    }
  } catch {
    usedFallback = true;
  } finally {
    activeRequests.delete(conversationId);
  }
  if (!summary) {
    summary = localRoleplaySummary(conversation);
    usedFallback = true;
  }
  const compactedAt = timestamp();
  updateAgentConversation(conversationId, (target) => {
    target.lastSummary = summary.slice(0, 100_000);
    target.lastCompactedAt = compactedAt;
    target.compactCount += 1;
    target.status = "idle";
    delete target.lastTurnUsage;
  });
  emitWorkspace();
  return {
    ok: true,
    message: usedFallback
      ? automatic ? "已使用本地连续性摘要压缩上下文。" : "模型摘要不可用，已使用本地连续性摘要。"
      : "角色对话上下文已压缩。",
  };
}

export function respondAgentPermission(_permissionId: string, _response: "once" | "always" | "reject") {
  return { ok: false, message: "角色酒馆不使用 Agent 权限请求。" };
}
