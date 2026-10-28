// Shared shapes for the local MCP tool executor (electron/ipc/agent-tools.ts)
// and the SillyTavern system-prompt presets used by AI reverse/convert.

export interface TavernSamplerPreset {
  id: string;
  name: string;
  systemPrompt: string;
  jailbreakPrompt: string;
  temperature: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  maxOutputTokens?: number;
  stop: string[];
  source?: "builtin" | "sillytavern-json" | "langbai";
  sourceName?: string;
  sourceHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentAttachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: "image" | "document" | "text" | "other";
  /** Absolute local path. It is removed/rebased when a portable backup is made. */
  filePath: string;
  /** Renderer-safe URL rebuilt by the native layer. */
  fileUrl?: string;
  /** A removed/replaced image must never resolve to a later file at the same path. */
  unavailable?: "deleted" | "missing" | "replaced";
  width?: number;
  height?: number;
  createdAt: string;
}

export interface AgentToolBridgeRequest {
  /** Host-only config binding, never accepted from bridge JSON/model arguments. */
  imageProviderBinding?: { provider: 'novelai' | 'openai-images'; revision: string };
  /** In-process cancellation only; never accepted from bridge JSON. */
  signal?: AbortSignal;
  tool: string;
  args: Record<string, unknown>;
  sessionId?: string;
  callId?: string;
  /** Trusted caller-owned prompt values. When present they replace the Studio
   * style/negative locks; the MCP server passes {} so explicit fields win. */
  promptLocks?: {
    stylePrompt?: string;
    negativePrompt?: string;
  };
}

export interface AgentToolBridgeResponse {
  ok: boolean;
  title: string;
  output: string;
  data?: unknown;
  generatedImages?: AgentAttachment[];
}
