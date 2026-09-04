// Version 4 is the corrected first Character Tavern workspace. Version 3 was
// only used by unreleased local builds and could flatten a built-in character
// into an empty card, so those drafts are intentionally reset rather than
// migrated.
export const AGENT_WORKSPACE_VERSION = 4 as const;

/**
 * Wire formats supported by both desktop and mobile Agent runtimes.
 * Provider brands such as DeepSeek/OpenRouter/Ollama are presets layered on
 * top of one of these transports rather than separate, misleading protocols.
 */
export type AgentProviderProtocol =
  | "openai-compatible"
  | "openai-responses"
  | "anthropic-messages"
  | "google-gemini";
export type AgentRuntimeKind = "direct-provider" | "mobile-compatible";
export type AgentConversationStatus = "idle" | "running" | "waiting-permission" | "error";
export type TavernGenerationMode = "confirm" | "auto";
/**
 * Planning depth for a Tavern reply. `auto` leaves the provider defaults
 * untouched; explicit values are also forwarded to OpenAI reasoning-capable
 * transports when they support the standard effort field.
 */
export type AgentReasoningEffort = "auto" | "low" | "medium" | "high";

export interface TavernLorebookEntry {
  id: string;
  keys: string[];
  secondaryKeys: string[];
  content: string;
  enabled: boolean;
  constant: boolean;
  selective: boolean;
  caseSensitive: boolean;
  insertionOrder: number;
  priority: number;
  position: "before-character" | "after-character" | "before-examples" | "after-examples" | "depth";
  depth?: number;
  comment?: string;
  extensions: Record<string, unknown>;
}

export interface TavernLorebook {
  id: string;
  name: string;
  description: string;
  scanDepth: number;
  tokenBudget: number;
  recursiveScanning: boolean;
  entries: TavernLorebookEntry[];
  extensions: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TavernCharacterVisualPreset {
  positivePrompt: string;
  negativePrompt: string;
  stylePrompt: string;
  model?: string;
  width?: number;
  height?: number;
  steps?: number;
  scale?: number;
  sampler?: string;
  count?: number;
  emotionPrompts: Record<string, string>;
  referencePresetIds: string[];
}

export interface TavernCharacter {
  id: string;
  spec: "chara_card_v2" | "chara_card_v3";
  specVersion: string;
  name: string;
  nickname: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  exampleMessages: string;
  creatorNotes: string;
  systemPrompt: string;
  postHistoryInstructions: string;
  alternateGreetings: string[];
  groupOnlyGreetings: string[];
  tags: string[];
  creator: string;
  characterVersion: string;
  avatarDataUrl?: string;
  backgroundDataUrl?: string;
  lorebookId?: string;
  embeddedLorebook?: TavernLorebook;
  visual: TavernCharacterVisualPreset;
  extensions: Record<string, unknown>;
  source?: string[];
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TavernPersona {
  id: string;
  name: string;
  description: string;
  avatarDataUrl?: string;
  lorebookId?: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

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
  createdAt: string;
  updatedAt: string;
}

export interface TavernImageProposal {
  id: string;
  status: "pending" | "running" | "completed" | "cancelled" | "error";
  positivePrompt: string;
  negativePrompt: string;
  stylePrompt: string;
  model?: string;
  width?: number;
  height?: number;
  steps?: number;
  scale?: number;
  sampler?: string;
  count: number;
  error?: string;
  createdAt: string;
}

export interface AgentTokenUsage {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  cost?: number;
  estimated?: boolean;
}

export interface AgentContextSnapshot {
  used: number;
  limit: number;
  percent: number;
  danger: boolean;
  estimated: boolean;
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
  width?: number;
  height?: number;
  createdAt: string;
}

export interface AgentToolExecution {
  id: string;
  name: string;
  title: string;
  status: "pending" | "running" | "completed" | "error" | "denied";
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  generatedImages?: AgentAttachment[];
}

export interface AgentMessage {
  id: string;
  runtimeMessageId?: string;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
  attachments: AgentAttachment[];
  tools: AgentToolExecution[];
  usage?: AgentTokenUsage;
  status: "complete" | "streaming" | "error" | "aborted";
  error?: string;
  createdAt: string;
  completedAt?: string;
  /** Tavern speaker identity for solo and group roleplay chats. */
  characterId?: string;
  /** Alternative replies (SillyTavern-style swipes). */
  swipes?: string[];
  swipeIndex?: number;
  imageProposal?: TavernImageProposal;
}

export interface AgentConversation {
  id: string;
  runtimeSessionId?: string;
  title: string;
  messages: AgentMessage[];
  /** Files staged in the composer but not sent yet. */
  draftAttachments: AgentAttachment[];
  status: AgentConversationStatus;
  context: AgentContextSnapshot;
  lastTurnUsage?: AgentTokenUsage;
  compactCount: number;
  lastCompactedAt?: string;
  lastSummary?: string;
  createdAt: string;
  updatedAt: string;
  characterIds: string[];
  activeCharacterId?: string;
  personaId?: string;
  lorebookIds: string[];
  samplerPresetId?: string;
  generationMode: TavernGenerationMode;
  reasoningEffort?: AgentReasoningEffort;
  autoPlayGroup: boolean;
  backgroundDataUrl?: string;
  pinned: boolean;
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  enabled: boolean;
  builtIn?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentMemory {
  id: string;
  title: string;
  content: string;
  scope: "global" | "conversation";
  conversationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentWorkspaceData {
  version: typeof AGENT_WORKSPACE_VERSION;
  selectedConversationId?: string;
  conversations: AgentConversation[];
  skills: AgentSkill[];
  memories: AgentMemory[];
  characters: TavernCharacter[];
  personas: TavernPersona[];
  lorebooks: TavernLorebook[];
  samplerPresets: TavernSamplerPreset[];
  selectedCharacterId?: string;
  selectedPersonaId?: string;
  defaultGenerationMode: TavernGenerationMode;
  updatedAt: string;
}

export interface AgentRuntimeStatus {
  kind: AgentRuntimeKind;
  state: "stopped" | "starting" | "ready" | "error";
  version?: string;
  message?: string;
  providerConfigured: boolean;
  updatedAt: string;
}

export interface AgentProviderProbe {
  protocol: AgentProviderProtocol;
  baseUrl: string;
  apiKey: string;
  currentModel?: string;
}

export interface AgentDiscoveredModel {
  id: string;
  displayName: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  suggestedOutputTokens?: number;
  vision?: boolean;
  reasoning?: boolean;
  /** api = provider response, catalog = bundled official metadata, unknown = name only. */
  metadataSource: "api" | "catalog" | "unknown";
}

export interface AgentModelDiscoveryResult {
  ok: boolean;
  message: string;
  models: AgentDiscoveredModel[];
}

export interface AgentWorkspaceLocation {
  path: string;
  installAdjacent: boolean;
  migratedFromLegacy: boolean;
  fallbackReason?: string;
}

export interface AgentPermissionRequest {
  id: string;
  conversationId: string;
  runtimeSessionId: string;
  type: string;
  title: string;
  pattern?: string | string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export type AgentEvent =
  | { kind: "workspace"; workspace: AgentWorkspaceData }
  | { kind: "runtime"; status: AgentRuntimeStatus }
  | { kind: "message-delta"; conversationId: string; messageId: string; delta: string }
  | { kind: "message-reasoning-delta"; conversationId: string; messageId: string; delta: string }
  | { kind: "permission"; request: AgentPermissionRequest }
  | { kind: "permission-resolved"; permissionId: string; response: "once" | "always" | "reject" }
  | { kind: "apply-prompt"; positivePrompt: string; negativePrompt?: string; stylePrompt?: string }
  | { kind: "error"; conversationId?: string; message: string };

export interface AgentSendRequest {
  conversationId: string;
  text: string;
  attachmentIds?: string[];
  characterId?: string;
  regenerateMessageId?: string;
}

export interface TavernImageRequest {
  conversationId: string;
  messageId: string;
  proposal: TavernImageProposal;
}

export interface TavernCardImportResult {
  ok: boolean;
  cancelled?: boolean;
  message: string;
  workspace: AgentWorkspaceData;
  imported: number;
  skipped: number;
}

export interface TavernCardExportRequest {
  characterId: string;
  format: "png" | "json" | "charx";
}

export interface AgentImportFilesResult {
  ok: boolean;
  cancelled?: boolean;
  message?: string;
  attachments: AgentAttachment[];
}

export interface AgentWorkspaceMutationResult {
  ok: boolean;
  message?: string;
  workspace: AgentWorkspaceData;
}

export interface AgentToolBridgeRequest {
  tool: string;
  args: Record<string, unknown>;
  sessionId?: string;
  callId?: string;
}

export interface AgentToolBridgeResponse {
  ok: boolean;
  title: string;
  output: string;
  data?: unknown;
  generatedImages?: AgentAttachment[];
}
