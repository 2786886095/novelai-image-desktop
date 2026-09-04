import { dialog } from "electron";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  AgentAttachment,
  AgentConversation,
  AgentMemory,
  AgentMessage,
  AgentSkill,
  AgentWorkspaceData,
  AgentWorkspaceMutationResult,
  TavernImageProposal,
  TavernLorebook,
  TavernPersona,
  TavernSamplerPreset,
} from "../../src/agent/types";
import { AGENT_WORKSPACE_VERSION } from "../../src/agent/types";
import { createContextSnapshot, effectiveContextMessages } from "../../src/agent/context";
import { mergeAgentWorkspaces } from "../../src/agent/merge";
import {
  normalizeTavernCharacter,
  normalizeTavernLorebook,
  normalizeTavernPersona,
  normalizeTavernSamplerPreset,
} from "../../src/tavern/compat";
import {
  createSoftwareImageStarterKit,
  SOFTWARE_IMAGE_CHARACTER_ID,
  SOFTWARE_IMAGE_LOREBOOK_ID,
  SOFTWARE_IMAGE_PERSONA_ID,
  SOFTWARE_IMAGE_SAMPLER_ID,
} from "../../src/tavern/builtins";
import { toLocalMediaUrl } from "./local-media-protocol";
import { atomicWriteFileSync, getSettings, readWithBackupRecoverySync, rotateBackupsSync } from "./store";
import { agentWorkspaceDirectory } from "./agent-workspace-location";

const MAX_FILE_BYTES = 48 * 1024 * 1024;
const MAX_IMPORT_BYTES = 192 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif",
  ".pdf", ".txt", ".md", ".json", ".jsonl", ".csv", ".tsv", ".yaml", ".yml",
]);

let cache: AgentWorkspaceData | null = null;

export function agentWorkspacePath() {
  return path.join(agentWorkspaceDirectory(), "agent-workspace.json");
}

export function agentAttachmentsDirectory() {
  return path.join(agentWorkspaceDirectory(), "attachments");
}

function now() {
  return new Date().toISOString();
}

function defaultSkills(): AgentSkill[] {
  // The pre-release Agent skill system is intentionally not migrated into the
  // roleplay product. Keep the legacy collection empty so old backup readers
  // remain structurally compatible without surfacing obsolete concepts.
  return [];
}

export function createEmptyAgentWorkspace(): AgentWorkspaceData {
  const createdAt = now();
  const { character, persona, lorebook, sampler } = createSoftwareImageStarterKit();
  const settings = getSettings();
  const conversation: AgentConversation = {
    id: crypto.randomUUID(),
    title: character.name,
    messages: [],
    draftAttachments: [],
    status: "idle",
    context: createContextSnapshot([], settings.agentContextWindow, settings.agentAutoCompactThreshold),
    compactCount: 0,
    createdAt,
    updatedAt: createdAt,
    characterIds: [character.id],
    activeCharacterId: character.id,
    personaId: persona.id,
    lorebookIds: [lorebook.id],
    samplerPresetId: sampler.id,
    generationMode: "confirm",
    reasoningEffort: "auto",
    autoPlayGroup: false,
    pinned: false,
  };
  return {
    version: AGENT_WORKSPACE_VERSION,
    selectedConversationId: conversation.id,
    conversations: [conversation],
    skills: defaultSkills(),
    memories: [],
    characters: [character],
    personas: [persona],
    lorebooks: [lorebook],
    samplerPresets: [sampler],
    selectedCharacterId: character.id,
    selectedPersonaId: persona.id,
    defaultGenerationMode: "confirm",
    updatedAt: createdAt,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function restoreProtectedStarterKit(
  characters: ReturnType<typeof normalizeTavernCharacter>[],
  personas: TavernPersona[],
  lorebooks: TavernLorebook[],
  samplerPresets: TavernSamplerPreset[],
) {
  const kit = createSoftwareImageStarterKit();
  const characterIndex = characters.findIndex((item) => item.id === SOFTWARE_IMAGE_CHARACTER_ID);
  if (characterIndex >= 0) {
    const existing = characters[characterIndex];
    characters[characterIndex] = {
      ...kit.character,
      // Visual generation defaults are runtime-facing parameters. Preserve
      // them while restoring every protected role-card field from source.
      visual: clone(existing.visual),
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
    };
  } else {
    characters.unshift(kit.character);
  }

  const lorebookIndex = lorebooks.findIndex((item) => item.id === SOFTWARE_IMAGE_LOREBOOK_ID);
  if (lorebookIndex >= 0) {
    const existing = lorebooks[lorebookIndex];
    const enabledById = new Map(existing.entries.map((entry) => [entry.id, entry.enabled]));
    lorebooks[lorebookIndex] = {
      ...kit.lorebook,
      entries: kit.lorebook.entries.map((entry) => ({
        ...entry,
        enabled: enabledById.get(entry.id) ?? entry.enabled,
      })),
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
    };
  } else {
    lorebooks.unshift(kit.lorebook);
  }

  const personaIndex = personas.findIndex((item) => item.id === SOFTWARE_IMAGE_PERSONA_ID);
  if (personaIndex >= 0) {
    personas[personaIndex] = {
      ...personas[personaIndex],
      name: kit.persona.name,
      description: kit.persona.description,
    };
  } else {
    personas.unshift(kit.persona);
  }
  if (!samplerPresets.some((item) => item.id === SOFTWARE_IMAGE_SAMPLER_ID)) samplerPresets.unshift(kit.sampler);
}

function attachmentKind(extension: string): AgentAttachment["kind"] {
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif"].includes(extension)) return "image";
  if ([".txt", ".md", ".json", ".jsonl", ".csv", ".tsv", ".yaml", ".yml"].includes(extension)) return "text";
  if (extension === ".pdf") return "document";
  return "other";
}

function mimeFor(extension: string) {
  const values: Record<string, string> = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
    ".gif": "image/gif", ".bmp": "image/bmp", ".avif": "image/avif", ".pdf": "application/pdf",
    ".txt": "text/plain", ".md": "text/markdown", ".json": "application/json", ".jsonl": "application/x-ndjson",
    ".csv": "text/csv", ".tsv": "text/tab-separated-values", ".yaml": "application/yaml", ".yml": "application/yaml",
  };
  return values[extension] ?? "application/octet-stream";
}

function rehydrateAttachment(raw: Partial<AgentAttachment>): AgentAttachment | null {
  if (typeof raw.id !== "string" || typeof raw.name !== "string" || typeof raw.filePath !== "string") return null;
  const extension = path.extname(raw.name).toLowerCase();
  return {
    id: raw.id,
    name: raw.name,
    mime: typeof raw.mime === "string" ? raw.mime : mimeFor(extension),
    size: Math.max(0, Number(raw.size) || 0),
    kind: raw.kind === "image" || raw.kind === "document" || raw.kind === "text" ? raw.kind : attachmentKind(extension),
    filePath: raw.filePath,
    fileUrl: fs.existsSync(raw.filePath) ? toLocalMediaUrl(raw.filePath) : undefined,
    ...(Number.isFinite(raw.width) ? { width: raw.width } : {}),
    ...(Number.isFinite(raw.height) ? { height: raw.height } : {}),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now(),
  };
}

function normalizeImageProposal(raw: unknown): TavernImageProposal | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = raw as Partial<TavernImageProposal>;
  const positivePrompt = typeof value.positivePrompt === "string" ? value.positivePrompt.slice(0, 100_000) : "";
  if (!positivePrompt.trim()) return undefined;
  const status = ["pending", "running", "completed", "cancelled", "error"].includes(String(value.status))
    ? value.status as TavernImageProposal["status"]
    : "pending";
  const finite = (input: unknown, fallback: number, minimum: number, maximum: number) => {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
  };
  return {
    id: typeof value.id === "string" && value.id ? value.id : crypto.randomUUID(),
    status,
    positivePrompt,
    negativePrompt: typeof value.negativePrompt === "string" ? value.negativePrompt.slice(0, 100_000) : "",
    stylePrompt: typeof value.stylePrompt === "string" ? value.stylePrompt.slice(0, 100_000) : "",
    ...(typeof value.model === "string" && value.model.trim() ? { model: value.model.trim() } : {}),
    ...(Number.isFinite(Number(value.width)) ? { width: Math.round(finite(value.width, 1024, 64, 4096)) } : {}),
    ...(Number.isFinite(Number(value.height)) ? { height: Math.round(finite(value.height, 1024, 64, 4096)) } : {}),
    ...(Number.isFinite(Number(value.steps)) ? { steps: Math.round(finite(value.steps, 28, 1, 50)) } : {}),
    ...(Number.isFinite(Number(value.scale)) ? { scale: finite(value.scale, 5, 0, 10) } : {}),
    ...(typeof value.sampler === "string" && value.sampler.trim() ? { sampler: value.sampler.trim() } : {}),
    count: Math.round(finite(value.count, 1, 1, 8)),
    ...(typeof value.error === "string" ? { error: value.error.slice(0, 2_000) } : {}),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : now(),
  };
}

function normalizeMessage(raw: Partial<AgentMessage>): AgentMessage | null {
  if (typeof raw.id !== "string" || !["user", "assistant", "system"].includes(String(raw.role))) return null;
  const imageProposal = normalizeImageProposal(raw.imageProposal);
  return {
    id: raw.id,
    ...(typeof raw.runtimeMessageId === "string" ? { runtimeMessageId: raw.runtimeMessageId } : {}),
    role: raw.role as AgentMessage["role"],
    content: typeof raw.content === "string" ? raw.content : "",
    ...(typeof raw.reasoning === "string" ? { reasoning: raw.reasoning } : {}),
    attachments: (Array.isArray(raw.attachments) ? raw.attachments : [])
      .map((item) => rehydrateAttachment(item))
      .filter((item): item is AgentAttachment => Boolean(item)),
    tools: Array.isArray(raw.tools) ? raw.tools : [],
    ...(raw.usage ? { usage: raw.usage } : {}),
    status: ["complete", "streaming", "error", "aborted"].includes(String(raw.status))
      ? raw.status as AgentMessage["status"]
      : "complete",
    ...(typeof raw.error === "string" ? { error: raw.error } : {}),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now(),
    ...(typeof raw.completedAt === "string" ? { completedAt: raw.completedAt } : {}),
    ...(typeof raw.characterId === "string" ? { characterId: raw.characterId } : {}),
    ...(Array.isArray(raw.swipes)
      ? { swipes: raw.swipes.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 200_000)).slice(0, 100) }
      : {}),
    ...(Number.isFinite(Number(raw.swipeIndex)) ? { swipeIndex: Math.max(0, Math.trunc(Number(raw.swipeIndex))) } : {}),
    ...(imageProposal ? { imageProposal } : {}),
  };
}

export function normalizeAgentWorkspace(raw: unknown): AgentWorkspaceData {
  const input = raw && typeof raw === "object" ? raw as Partial<AgentWorkspaceData> : {};
  if (Number(input.version) !== AGENT_WORKSPACE_VERSION) {
    return createEmptyAgentWorkspace();
  }
  const settings = getSettings();
  const characters = (Array.isArray(input.characters) ? input.characters : [])
    .map((item) => normalizeTavernCharacter(item));
  const personas: TavernPersona[] = (Array.isArray(input.personas) ? input.personas : [])
    .map((item) => normalizeTavernPersona(item));
  const lorebooks: TavernLorebook[] = (Array.isArray(input.lorebooks) ? input.lorebooks : [])
    .map((item) => normalizeTavernLorebook(item));
  const samplerPresets: TavernSamplerPreset[] = (Array.isArray(input.samplerPresets) ? input.samplerPresets : [])
    .map((item) => normalizeTavernSamplerPreset(item));
  restoreProtectedStarterKit(characters, personas, lorebooks, samplerPresets);
  const defaultCharacterId = characters.some((item) => item.id === input.selectedCharacterId)
    ? input.selectedCharacterId
    : characters[0].id;
  const defaultPersonaId = personas.some((item) => item.id === input.selectedPersonaId)
    ? input.selectedPersonaId
    : personas[0].id;
  const conversations: AgentConversation[] = (Array.isArray(input.conversations) ? input.conversations : [])
    .filter((item): item is AgentConversation => Boolean(item && typeof item === "object" && typeof item.id === "string"))
    .map((conversation) => {
      const messages = (Array.isArray(conversation.messages) ? conversation.messages : [])
        .map((message) => normalizeMessage(message))
        .filter((message): message is AgentMessage => Boolean(message));
      const lastCompactedAt = typeof conversation.lastCompactedAt === "string" ? conversation.lastCompactedAt : undefined;
      const lastSummary = typeof conversation.lastSummary === "string" ? conversation.lastSummary : undefined;
      const contextMessages = effectiveContextMessages(messages, lastSummary, lastCompactedAt);
      const latestUsage = [...contextMessages].reverse().find((message) => message.role === "assistant" && message.usage)?.usage;
      const characterIds = (Array.isArray(conversation.characterIds) ? conversation.characterIds : [])
        .filter((id): id is string => typeof id === "string" && characters.some((item) => item.id === id));
      if (!characterIds.length && defaultCharacterId) characterIds.push(defaultCharacterId);
      const activeCharacterId = typeof conversation.activeCharacterId === "string" && characterIds.includes(conversation.activeCharacterId)
        ? conversation.activeCharacterId
        : characterIds[0];
      const personaId = typeof conversation.personaId === "string" && personas.some((item) => item.id === conversation.personaId)
        ? conversation.personaId
        : defaultPersonaId;
      const lorebookIds = (Array.isArray(conversation.lorebookIds) ? conversation.lorebookIds : [])
        .filter((id): id is string => typeof id === "string" && lorebooks.some((item) => item.id === id));
      const samplerPresetId = typeof conversation.samplerPresetId === "string" && samplerPresets.some((item) => item.id === conversation.samplerPresetId)
        ? conversation.samplerPresetId
        : samplerPresets[0]?.id;
      return {
        id: conversation.id,
        ...(typeof conversation.runtimeSessionId === "string" ? { runtimeSessionId: conversation.runtimeSessionId } : {}),
        title: typeof conversation.title === "string" && conversation.title.trim() ? conversation.title.trim().slice(0, 100) : "新对话",
        messages,
        draftAttachments: (Array.isArray(conversation.draftAttachments) ? conversation.draftAttachments : [])
          .map((item) => rehydrateAttachment(item))
          .filter((item): item is AgentAttachment => Boolean(item)),
        status: (conversation.status === "error" ? "error" : "idle") as AgentConversation["status"],
        context: createContextSnapshot(contextMessages, settings.agentContextWindow, settings.agentAutoCompactThreshold, latestUsage),
        ...(latestUsage ? { lastTurnUsage: latestUsage } : {}),
        compactCount: Math.max(0, Math.trunc(Number(conversation.compactCount) || 0)),
        ...(lastCompactedAt ? { lastCompactedAt } : {}),
        ...(lastSummary ? { lastSummary } : {}),
        createdAt: typeof conversation.createdAt === "string" ? conversation.createdAt : now(),
        updatedAt: typeof conversation.updatedAt === "string" ? conversation.updatedAt : now(),
        characterIds,
        ...(activeCharacterId ? { activeCharacterId } : {}),
        ...(personaId ? { personaId } : {}),
        lorebookIds,
        ...(samplerPresetId ? { samplerPresetId } : {}),
        generationMode: (conversation.generationMode === "auto" ? "auto" : "confirm") as AgentConversation["generationMode"],
        reasoningEffort: (["low", "medium", "high"].includes(String(conversation.reasoningEffort))
          ? conversation.reasoningEffort
          : "auto") as AgentConversation["reasoningEffort"],
        autoPlayGroup: conversation.autoPlayGroup === true,
        ...(typeof conversation.backgroundDataUrl === "string" && conversation.backgroundDataUrl
          ? { backgroundDataUrl: conversation.backgroundDataUrl }
          : {}),
        pinned: conversation.pinned === true,
      };
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const builtIns = defaultSkills();
  const inputSkills = Array.isArray(input.skills) ? input.skills : [];
  const skillById = new Map<string, AgentSkill>();
  for (const skill of [...builtIns, ...inputSkills]) {
    if (!skill || typeof skill.id !== "string" || typeof skill.name !== "string" || typeof skill.instructions !== "string") continue;
    skillById.set(skill.id, {
      id: skill.id,
      name: skill.name.trim().slice(0, 80) || "未命名技能",
      description: typeof skill.description === "string" ? skill.description.trim().slice(0, 300) : "",
      instructions: skill.instructions,
      enabled: skill.enabled !== false,
      builtIn: builtIns.some((item) => item.id === skill.id),
      createdAt: typeof skill.createdAt === "string" ? skill.createdAt : now(),
      updatedAt: typeof skill.updatedAt === "string" ? skill.updatedAt : now(),
    });
  }
  const memories: AgentMemory[] = (Array.isArray(input.memories) ? input.memories : [])
    .filter((item): item is AgentMemory => Boolean(item && typeof item.id === "string" && typeof item.content === "string"))
    .map((memory) => ({
      id: memory.id,
      title: typeof memory.title === "string" && memory.title.trim() ? memory.title.trim().slice(0, 100) : "记忆",
      content: memory.content.slice(0, 20_000),
      scope: memory.scope === "conversation" ? "conversation" : "global",
      ...(memory.scope === "conversation" && typeof memory.conversationId === "string" ? { conversationId: memory.conversationId } : {}),
      createdAt: typeof memory.createdAt === "string" ? memory.createdAt : now(),
      updatedAt: typeof memory.updatedAt === "string" ? memory.updatedAt : now(),
    }));
  const selectedConversationId = typeof input.selectedConversationId === "string" && conversations.some((item) => item.id === input.selectedConversationId)
    ? input.selectedConversationId
    : conversations[0]?.id;
  return {
    version: AGENT_WORKSPACE_VERSION,
    ...(selectedConversationId ? { selectedConversationId } : {}),
    conversations,
    skills: [...skillById.values()],
    memories,
    characters,
    personas,
    lorebooks,
    samplerPresets,
    ...(defaultCharacterId ? { selectedCharacterId: defaultCharacterId } : {}),
    ...(defaultPersonaId ? { selectedPersonaId: defaultPersonaId } : {}),
    defaultGenerationMode: input.defaultGenerationMode === "auto" ? "auto" : "confirm",
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : now(),
  };
}

export function readAgentWorkspace(): AgentWorkspaceData {
  if (cache) return clone(cache);
  const file = agentWorkspacePath();
  let resetLegacyWorkspace = false;
  const recovered = readWithBackupRecoverySync<AgentWorkspaceData>(
    file,
    (text) => {
      const parsed = JSON.parse(text) as Partial<AgentWorkspaceData>;
      if (Number(parsed?.version) !== AGENT_WORKSPACE_VERSION) resetLegacyWorkspace = true;
      return normalizeAgentWorkspace(parsed);
    },
    (value) => JSON.stringify(value, null, 2),
  );
  cache = recovered?.value ?? createEmptyAgentWorkspace();
  if (!recovered || resetLegacyWorkspace) writeAgentWorkspace(cache);
  return clone(cache);
}

export function writeAgentWorkspace(workspace: AgentWorkspaceData) {
  const normalized = normalizeAgentWorkspace({ ...workspace, updatedAt: now() });
  const file = agentWorkspacePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  rotateBackupsSync(file);
  atomicWriteFileSync(file, JSON.stringify(normalized, null, 2));
  cache = normalized;
  return clone(normalized);
}

function mutation(workspace: AgentWorkspaceData, message?: string): AgentWorkspaceMutationResult {
  return { ok: true, ...(message ? { message } : {}), workspace: writeAgentWorkspace(workspace) };
}

function uniqueConversationTitle(workspace: AgentWorkspaceData, requested = "新对话") {
  const base = requested.trim().slice(0, 100) || "新对话";
  const occupied = new Set(workspace.conversations.map((item) => item.title.toLocaleLowerCase()));
  if (!occupied.has(base.toLocaleLowerCase())) return base;
  let index = 1;
  while (occupied.has(`${base} (${index})`.toLocaleLowerCase())) index += 1;
  return `${base} (${index})`;
}

export function createAgentConversation(title?: string): AgentWorkspaceMutationResult {
  const workspace = readAgentWorkspace();
  const createdAt = now();
  const settings = getSettings();
  const characterId = workspace.selectedCharacterId ?? workspace.characters[0]?.id;
  const personaId = workspace.selectedPersonaId ?? workspace.personas[0]?.id;
  const linkedLorebookIds = [
    workspace.characters.find((item) => item.id === characterId)?.lorebookId,
    workspace.personas.find((item) => item.id === personaId)?.lorebookId,
  ].filter((id): id is string => Boolean(id && workspace.lorebooks.some((item) => item.id === id)));
  const samplerPresetId = workspace.samplerPresets[0]?.id;
  const conversation: AgentConversation = {
    id: crypto.randomUUID(),
    title: uniqueConversationTitle(workspace, title),
    messages: [],
    draftAttachments: [],
    status: "idle",
    context: createContextSnapshot([], settings.agentContextWindow, settings.agentAutoCompactThreshold),
    compactCount: 0,
    createdAt,
    updatedAt: createdAt,
    characterIds: characterId ? [characterId] : [],
    ...(characterId ? { activeCharacterId: characterId } : {}),
    ...(personaId ? { personaId } : {}),
    lorebookIds: [...new Set(linkedLorebookIds)],
    ...(samplerPresetId ? { samplerPresetId } : {}),
    generationMode: workspace.defaultGenerationMode,
    reasoningEffort: "auto",
    autoPlayGroup: false,
    pinned: false,
  };
  workspace.conversations.unshift(conversation);
  workspace.selectedConversationId = conversation.id;
  return mutation(workspace);
}

export function selectAgentConversation(conversationId: string): AgentWorkspaceMutationResult {
  const workspace = readAgentWorkspace();
  if (!workspace.conversations.some((item) => item.id === conversationId)) {
    return { ok: false, message: "对话不存在。", workspace };
  }
  workspace.selectedConversationId = conversationId;
  return mutation(workspace);
}

export function renameAgentConversation(conversationId: string, title: string): AgentWorkspaceMutationResult {
  const workspace = readAgentWorkspace();
  const conversation = workspace.conversations.find((item) => item.id === conversationId);
  if (!conversation) return { ok: false, message: "对话不存在。", workspace };
  const trimmed = title.trim().slice(0, 100);
  if (!trimmed) return { ok: false, message: "名称不能为空。", workspace };
  conversation.title = trimmed;
  conversation.updatedAt = now();
  return mutation(workspace);
}

export function deleteAgentConversation(conversationId: string): AgentWorkspaceMutationResult {
  const workspace = readAgentWorkspace();
  workspace.conversations = workspace.conversations.filter((item) => item.id !== conversationId);
  workspace.memories = workspace.memories.filter((item) => item.conversationId !== conversationId);
  if (workspace.selectedConversationId === conversationId) workspace.selectedConversationId = workspace.conversations[0]?.id;
  try {
    fs.rmSync(path.join(agentAttachmentsDirectory(), conversationId), { recursive: true, force: true });
  } catch {
    // Metadata deletion should still succeed if an antivirus temporarily holds a file.
  }
  return mutation(workspace);
}

export function updateAgentConversation(
  conversationId: string,
  updater: (conversation: AgentConversation, workspace: AgentWorkspaceData) => void,
): AgentWorkspaceData {
  const workspace = readAgentWorkspace();
  const conversation = workspace.conversations.find((item) => item.id === conversationId);
  if (!conversation) throw new Error("对话不存在。");
  updater(conversation, workspace);
  conversation.updatedAt = now();
  const settings = getSettings();
  const inFlight = conversation.status === "running" || conversation.status === "waiting-permission";
  const contextMessages = effectiveContextMessages(
    conversation.messages,
    conversation.lastSummary,
    conversation.lastCompactedAt,
  );
  conversation.context = createContextSnapshot(
    contextMessages,
    settings.agentContextWindow,
    settings.agentAutoCompactThreshold,
    inFlight ? undefined : conversation.lastTurnUsage,
  );
  workspace.conversations.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return writeAgentWorkspace(workspace);
}

export function conversationForRuntimeSession(runtimeSessionId: string) {
  return readAgentWorkspace().conversations.find((item) => item.runtimeSessionId === runtimeSessionId);
}

export function findAgentConversationById(conversationId: string) {
  return readAgentWorkspace().conversations.find((item) => item.id === conversationId);
}

export function saveTavernWorkspace(input: AgentWorkspaceData): AgentWorkspaceMutationResult {
  return {
    ok: true,
    workspace: writeAgentWorkspace(normalizeAgentWorkspace(input)),
  };
}

function safeFileName(name: string) {
  const cleaned = path.basename(name).replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "_").trim();
  return cleaned.slice(0, 160) || "attachment";
}

function uniquePath(directory: string, fileName: string) {
  const parsed = path.parse(fileName);
  let candidate = path.join(directory, fileName);
  let index = 1;
  while (fs.existsSync(candidate)) candidate = path.join(directory, `${parsed.name} (${index++})${parsed.ext}`);
  return candidate;
}

export async function importAgentFiles(conversationId: string, sourcePaths?: string[]) {
  const workspace = readAgentWorkspace();
  const conversation = workspace.conversations.find((item) => item.id === conversationId);
  if (!conversation) return { ok: false, message: "对话不存在。", attachments: [] };
  let paths = Array.isArray(sourcePaths) ? sourcePaths.filter((item): item is string => typeof item === "string") : [];
  if (!paths.length) {
    const result = await dialog.showOpenDialog({
      title: "添加 Agent 附件",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "支持的图片与文档", extensions: [...ALLOWED_EXTENSIONS].map((item) => item.slice(1)) },
        { name: "所有文件", extensions: ["*"] },
      ],
    });
    if (result.canceled) return { ok: true, cancelled: true, attachments: [] };
    paths = result.filePaths;
  }
  const targetDirectory = path.join(agentAttachmentsDirectory(), conversationId);
  fs.mkdirSync(targetDirectory, { recursive: true });
  const imported: AgentAttachment[] = [];
  let totalBytes = 0;
  for (const source of paths) {
    try {
      const resolved = path.resolve(source);
      const stat = fs.statSync(resolved);
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_FILE_BYTES) continue;
      totalBytes += stat.size;
      if (totalBytes > MAX_IMPORT_BYTES) break;
      const extension = path.extname(resolved).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(extension)) continue;
      const destination = uniquePath(targetDirectory, safeFileName(path.basename(resolved)));
      fs.copyFileSync(resolved, destination, fs.constants.COPYFILE_EXCL);
      imported.push({
        id: crypto.randomUUID(),
        name: path.basename(destination),
        mime: mimeFor(extension),
        size: stat.size,
        kind: attachmentKind(extension),
        filePath: destination,
        fileUrl: toLocalMediaUrl(destination),
        createdAt: now(),
      });
    } catch {
      // Continue importing the remaining explicit user-selected files.
    }
  }
  if (!imported.length) return { ok: false, message: "没有可导入的文件（单文件上限 48 MB）。", attachments: [] };
  conversation.draftAttachments.push(...imported);
  conversation.updatedAt = now();
  writeAgentWorkspace(workspace);
  return { ok: true, attachments: imported };
}

export function deleteAgentAttachment(conversationId: string, attachmentId: string): AgentWorkspaceMutationResult {
  const workspace = readAgentWorkspace();
  const conversation = workspace.conversations.find((item) => item.id === conversationId);
  if (!conversation) return { ok: false, message: "对话不存在。", workspace };
  const attachment = conversation.draftAttachments.find((item) => item.id === attachmentId);
  conversation.draftAttachments = conversation.draftAttachments.filter((item) => item.id !== attachmentId);
  if (attachment) {
    try { fs.rmSync(attachment.filePath, { force: true }); } catch { /* best effort */ }
  }
  return mutation(workspace);
}

export async function exportAgentAttachment(
  conversationId: string,
  messageId: string,
  attachmentId: string,
): Promise<{ ok: boolean; cancelled?: boolean; message: string; filePath?: string }> {
  const workspace = readAgentWorkspace();
  const conversation = workspace.conversations.find((item) => item.id === conversationId);
  const message = conversation?.messages.find((item) => item.id === messageId);
  const attachment = message?.attachments.find((item) => item.id === attachmentId);
  if (!attachment || attachment.kind !== "image") {
    return { ok: false, message: "生成图片不存在。" };
  }
  const sourcePath = path.resolve(attachment.filePath);
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
    return { ok: false, message: "本地图片文件已移动或删除。" };
  }
  const extension = path.extname(sourcePath).toLowerCase();
  const result = await dialog.showSaveDialog({
    title: "保存生成图片",
    defaultPath: safeFileName(attachment.name || path.basename(sourcePath)),
    filters: [
      { name: "图片", extensions: [extension.slice(1) || "png"] },
      { name: "所有文件", extensions: ["*"] },
    ],
  });
  if (result.canceled || !result.filePath) {
    return { ok: true, cancelled: true, message: "已取消保存。" };
  }
  await fs.promises.copyFile(sourcePath, result.filePath);
  return { ok: true, message: "图片已保存。", filePath: result.filePath };
}

export function upsertAgentSkill(input: Partial<AgentSkill> & Pick<AgentSkill, "name" | "instructions">): AgentWorkspaceMutationResult {
  const workspace = readAgentWorkspace();
  const existing = input.id ? workspace.skills.find((item) => item.id === input.id) : undefined;
  if (existing?.builtIn) {
    // Built-in instructions are part of the product safety/tool contract, but
    // users must still be able to opt individual skills out of the system
    // prompt. Ignore all attempted content edits and persist only `enabled`.
    if (typeof input.enabled === "boolean" && input.enabled !== existing.enabled) {
      existing.enabled = input.enabled;
      existing.updatedAt = now();
      return mutation(workspace);
    }
    return { ok: false, message: "内置技能只能启用或停用，不能覆盖内容。", workspace };
  }
  const timestamp = now();
  const skill: AgentSkill = {
    id: existing?.id ?? crypto.randomUUID(),
    name: input.name.trim().slice(0, 80) || "未命名技能",
    description: String(input.description ?? existing?.description ?? "").trim().slice(0, 300),
    instructions: input.instructions.slice(0, 30_000),
    enabled: input.enabled ?? existing?.enabled ?? true,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  workspace.skills = existing
    ? workspace.skills.map((item) => item.id === existing.id ? skill : item)
    : [...workspace.skills, skill];
  return mutation(workspace);
}

export function deleteAgentSkill(skillId: string): AgentWorkspaceMutationResult {
  const workspace = readAgentWorkspace();
  if (workspace.skills.some((item) => item.id === skillId && item.builtIn)) {
    return { ok: false, message: "内置技能不能删除，可将其关闭。", workspace };
  }
  workspace.skills = workspace.skills.filter((item) => item.id !== skillId);
  return mutation(workspace);
}

export function upsertAgentMemory(input: Partial<AgentMemory> & Pick<AgentMemory, "title" | "content" | "scope">): AgentWorkspaceMutationResult {
  const workspace = readAgentWorkspace();
  const existing = input.id ? workspace.memories.find((item) => item.id === input.id) : undefined;
  const timestamp = now();
  const memory: AgentMemory = {
    id: existing?.id ?? crypto.randomUUID(),
    title: input.title.trim().slice(0, 100) || "记忆",
    content: input.content.slice(0, 20_000),
    scope: input.scope === "conversation" ? "conversation" : "global",
    ...(input.scope === "conversation" && input.conversationId ? { conversationId: input.conversationId } : {}),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  workspace.memories = existing
    ? workspace.memories.map((item) => item.id === existing.id ? memory : item)
    : [...workspace.memories, memory];
  return mutation(workspace);
}

export function deleteAgentMemory(memoryId: string): AgentWorkspaceMutationResult {
  const workspace = readAgentWorkspace();
  workspace.memories = workspace.memories.filter((item) => item.id !== memoryId);
  return mutation(workspace);
}

export function mergeImportedAgentWorkspace(incoming: AgentWorkspaceData) {
  const result = mergeAgentWorkspaces(readAgentWorkspace(), normalizeAgentWorkspace(incoming));
  result.workspace = writeAgentWorkspace(result.workspace);
  return result;
}

export function resetAgentStoreCacheForTests() {
  cache = null;
}
