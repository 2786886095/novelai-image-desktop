import { AGENT_WORKSPACE_VERSION, type AgentWorkspaceData } from "./types";

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

const LOCAL_ONLY_KEYS = new Set([
  "filePath",
  "fileUrl",
  "runtimeSessionId",
  "context",
  "updatedAt",
]);

/** Values such as restored paths, runtime session ids and a live context meter
 * differ per device even when the durable conversation is identical. Exclude
 * them when deciding whether a merge is a duplicate so importing one archive
 * twice remains idempotent. */
function comparableJson(value: unknown): string {
  const visit = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(visit);
    if (!entry || typeof entry !== "object") return entry;
    return Object.fromEntries(
      Object.entries(entry as Record<string, unknown>)
        .filter(([key]) => !LOCAL_ONLY_KEYS.has(key))
        .map(([key, nested]) => [key, visit(nested)]),
    );
  };
  return stableJson(visit(value));
}

function nextName(name: string, occupied: Set<string>): string {
  const base = name.trim() || "未命名";
  if (!occupied.has(base.toLocaleLowerCase())) return base;
  let index = 1;
  while (occupied.has(`${base} (${index})`.toLocaleLowerCase())) index += 1;
  return `${base} (${index})`;
}

function freshId(prefix: string, id: string, occupied: Set<string>): string {
  if (!occupied.has(id)) return id;
  let index = 1;
  let candidate = `${prefix}-${Date.now()}-${index}`;
  while (occupied.has(candidate)) candidate = `${prefix}-${Date.now()}-${++index}`;
  return candidate;
}

export interface AgentWorkspaceMergeResult {
  workspace: AgentWorkspaceData;
  imported: number;
  skipped: number;
  renamed: number;
}

/** Merge-only import: identical IDs/content are skipped; conflicts are copied
 * under a fresh ID and a human-visible `(1)` suffix instead of overwriting. */
export function mergeAgentWorkspaces(
  current: AgentWorkspaceData,
  incoming: AgentWorkspaceData,
): AgentWorkspaceMergeResult {
  const next: AgentWorkspaceData = JSON.parse(JSON.stringify(current));
  let imported = 0;
  let skipped = 0;
  let renamed = 0;

  const conversationIdMap = new Map<string, string>();
  const characterIdMap = new Map<string, string>();
  const personaIdMap = new Map<string, string>();
  const lorebookIdMap = new Map<string, string>();
  const samplerIdMap = new Map<string, string>();

  const mergeNamed = <T extends { id: string; name?: string; title?: string }>(
    target: T[],
    source: T[],
    prefix: string,
    onAssigned?: (sourceId: string, assignedId: string) => void,
  ) => {
    const ids = new Set(target.map((item) => item.id));
    const names = new Set(target.map((item) => String(item.name ?? item.title ?? "").toLocaleLowerCase()));
    for (const raw of source) {
      const item = JSON.parse(JSON.stringify(raw)) as T;
      const sameId = target.find((candidate) => candidate.id === item.id);
      if (
        sameId
        && "builtIn" in sameId
        && Boolean((sameId as T & { builtIn?: boolean }).builtIn)
        && Boolean((item as T & { builtIn?: boolean }).builtIn)
      ) {
        skipped += 1;
        onAssigned?.(item.id, sameId.id);
        continue;
      }
      if (sameId && comparableJson(sameId) === comparableJson(item)) {
        skipped += 1;
        onAssigned?.(item.id, sameId.id);
        continue;
      }
      const originalName = String(item.name ?? item.title ?? "未命名");
      const assignedName = nextName(originalName, names);
      if (assignedName !== originalName || sameId) renamed += 1;
      if ("name" in item) item.name = assignedName;
      else item.title = assignedName;
      const sourceId = item.id;
      item.id = freshId(prefix, item.id, ids);
      ids.add(item.id);
      names.add(assignedName.toLocaleLowerCase());
      target.push(item);
      imported += 1;
      onAssigned?.(sourceId, item.id);
    }
  };

  mergeNamed(next.lorebooks, incoming.lorebooks ?? [], "lorebook", (sourceId, assignedId) => {
    lorebookIdMap.set(sourceId, assignedId);
  });
  const remappedCharacters = (incoming.characters ?? []).map((character) => ({
    ...character,
    ...(character.lorebookId
      ? { lorebookId: lorebookIdMap.get(character.lorebookId) ?? character.lorebookId }
      : {}),
  }));
  mergeNamed(next.characters, remappedCharacters, "character", (sourceId, assignedId) => {
    characterIdMap.set(sourceId, assignedId);
  });
  const remappedPersonas = (incoming.personas ?? []).map((persona) => ({
    ...persona,
    ...(persona.lorebookId
      ? { lorebookId: lorebookIdMap.get(persona.lorebookId) ?? persona.lorebookId }
      : {}),
  }));
  mergeNamed(next.personas, remappedPersonas, "persona", (sourceId, assignedId) => {
    personaIdMap.set(sourceId, assignedId);
  });
  mergeNamed(next.samplerPresets, incoming.samplerPresets ?? [], "sampler", (sourceId, assignedId) => {
    samplerIdMap.set(sourceId, assignedId);
  });
  const remappedConversations = (incoming.conversations ?? []).map((conversation) => ({
    ...conversation,
    characterIds: conversation.characterIds.map((id) => characterIdMap.get(id) ?? id),
    ...(conversation.activeCharacterId
      ? { activeCharacterId: characterIdMap.get(conversation.activeCharacterId) ?? conversation.activeCharacterId }
      : {}),
    ...(conversation.personaId
      ? { personaId: personaIdMap.get(conversation.personaId) ?? conversation.personaId }
      : {}),
    lorebookIds: conversation.lorebookIds.map((id) => lorebookIdMap.get(id) ?? id),
    ...(conversation.samplerPresetId
      ? { samplerPresetId: samplerIdMap.get(conversation.samplerPresetId) ?? conversation.samplerPresetId }
      : {}),
    messages: conversation.messages.map((message) => ({
      ...message,
      ...(message.characterId
        ? { characterId: characterIdMap.get(message.characterId) ?? message.characterId }
        : {}),
    })),
  }));
  mergeNamed(
    next.conversations,
    remappedConversations,
    "conversation",
    (sourceId, assignedId) => conversationIdMap.set(sourceId, assignedId),
  );
  mergeNamed(next.skills, incoming.skills ?? [], "skill");
  const remappedMemories = (incoming.memories ?? []).map((memory) => ({
    ...memory,
    ...(memory.scope === "conversation" && memory.conversationId
      ? { conversationId: conversationIdMap.get(memory.conversationId) ?? memory.conversationId }
      : {}),
  }));
  mergeNamed(next.memories, remappedMemories, "memory");
  next.version = AGENT_WORKSPACE_VERSION;
  next.updatedAt = new Date().toISOString();
  if (!next.selectedCharacterId || !next.characters.some((item) => item.id === next.selectedCharacterId)) {
    next.selectedCharacterId = next.characters[0]?.id;
  }
  if (!next.selectedPersonaId || !next.personas.some((item) => item.id === next.selectedPersonaId)) {
    next.selectedPersonaId = next.personas[0]?.id;
  }
  if (!next.selectedConversationId || !next.conversations.some((item) => item.id === next.selectedConversationId)) {
    next.selectedConversationId = next.conversations[0]?.id;
  }
  return { workspace: next, imported, skipped, renamed };
}
