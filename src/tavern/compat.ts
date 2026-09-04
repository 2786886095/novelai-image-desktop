import type {
  TavernCharacter,
  TavernCharacterVisualPreset,
  TavernLorebook,
  TavernLorebookEntry,
  TavernPersona,
  TavernSamplerPreset,
} from "../agent/types";

type JsonRecord = Record<string, unknown>;

const LANGBAI_EXTENSION = "langbai_novelai_studio";

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function string(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => string(item).trim()).filter(Boolean)
    : [];
}

function finite(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function bool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function isoDate(value: unknown, fallback = tavernNow()) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000;
    const parsed = new Date(milliseconds);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return fallback;
}

export function tavernId(prefix: string) {
  const id = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}

export function tavernNow() {
  return new Date().toISOString();
}

export function defaultTavernVisual(): TavernCharacterVisualPreset {
  return {
    positivePrompt: "",
    negativePrompt: "",
    stylePrompt: "",
    emotionPrompts: {},
    referencePresetIds: [],
    count: 1,
  };
}

export function normalizeTavernVisual(value: unknown): TavernCharacterVisualPreset {
  const raw = record(value);
  const emotionPrompts = record(raw.emotionPrompts);
  return {
    positivePrompt: string(raw.positivePrompt).slice(0, 100_000),
    negativePrompt: string(raw.negativePrompt).slice(0, 100_000),
    stylePrompt: string(raw.stylePrompt).slice(0, 100_000),
    ...(string(raw.model).trim() ? { model: string(raw.model).trim() } : {}),
    ...(Number.isFinite(Number(raw.width)) ? { width: Math.round(finite(raw.width, 1024, 64, 4096)) } : {}),
    ...(Number.isFinite(Number(raw.height)) ? { height: Math.round(finite(raw.height, 1024, 64, 4096)) } : {}),
    ...(Number.isFinite(Number(raw.steps)) ? { steps: Math.round(finite(raw.steps, 28, 1, 50)) } : {}),
    ...(Number.isFinite(Number(raw.scale)) ? { scale: finite(raw.scale, 5, 0, 10) } : {}),
    ...(string(raw.sampler).trim() ? { sampler: string(raw.sampler).trim() } : {}),
    count: Math.round(finite(raw.count, 1, 1, 8)),
    emotionPrompts: Object.fromEntries(
      Object.entries(emotionPrompts)
        .map(([key, item]) => [key.trim().slice(0, 80), string(item).trim().slice(0, 10_000)])
        .filter(([key, item]) => Boolean(key && item)),
    ),
    referencePresetIds: stringArray(raw.referencePresetIds).slice(0, 24),
  };
}

export function createTavernPersona(name = "旅行者"): TavernPersona {
  const timestamp = tavernNow();
  return {
    id: tavernId("persona"),
    name,
    description: "",
    favorite: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createTavernSamplerPreset(name = "沉浸叙事"): TavernSamplerPreset {
  const timestamp = tavernNow();
  return {
    id: tavernId("sampler"),
    name,
    systemPrompt: "You are {{char}}. Stay in character, write vivid dialogue and actions, and never describe yourself as an AI or assistant.",
    jailbreakPrompt: "Continue the scene naturally. Respect established characterization, world facts, and the user's latest intent.",
    temperature: 0.9,
    topP: 0.95,
    frequencyPenalty: 0,
    presencePenalty: 0,
    stop: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function normalizeTavernPersona(value: unknown): TavernPersona {
  const raw = record(value);
  const timestamp = tavernNow();
  const fallback = createTavernPersona(string(raw.name, "旅行者").trim() || "旅行者");
  return {
    id: string(raw.id, fallback.id),
    name: string(raw.name, fallback.name).trim().slice(0, 160) || fallback.name,
    description: string(raw.description).slice(0, 100_000),
    ...(string(raw.avatarDataUrl).trim() ? { avatarDataUrl: string(raw.avatarDataUrl) } : {}),
    ...(string(raw.lorebookId).trim() ? { lorebookId: string(raw.lorebookId) } : {}),
    favorite: bool(raw.favorite, false),
    createdAt: isoDate(raw.createdAt, timestamp),
    updatedAt: isoDate(raw.updatedAt, timestamp),
  };
}

export function normalizeTavernSamplerPreset(value: unknown): TavernSamplerPreset {
  const raw = record(value);
  const timestamp = tavernNow();
  const fallback = createTavernSamplerPreset(string(raw.name, "沉浸叙事").trim() || "沉浸叙事");
  return {
    id: string(raw.id, fallback.id),
    name: string(raw.name, fallback.name).trim().slice(0, 160) || fallback.name,
    systemPrompt: string(raw.systemPrompt, fallback.systemPrompt).slice(0, 200_000),
    jailbreakPrompt: string(raw.jailbreakPrompt, fallback.jailbreakPrompt).slice(0, 100_000),
    temperature: finite(raw.temperature, fallback.temperature, 0, 2),
    topP: finite(raw.topP, fallback.topP, 0, 1),
    frequencyPenalty: finite(raw.frequencyPenalty, fallback.frequencyPenalty, -2, 2),
    presencePenalty: finite(raw.presencePenalty, fallback.presencePenalty, -2, 2),
    ...(Number.isFinite(Number(raw.maxOutputTokens))
      ? { maxOutputTokens: Math.round(finite(raw.maxOutputTokens, 4096, 128, 131_072)) }
      : {}),
    stop: stringArray(raw.stop).slice(0, 32),
    createdAt: isoDate(raw.createdAt, timestamp),
    updatedAt: isoDate(raw.updatedAt, timestamp),
  };
}

export function createTavernCharacter(name = "新角色"): TavernCharacter {
  const timestamp = tavernNow();
  return {
    id: tavernId("character"),
    spec: "chara_card_v3",
    specVersion: "3.0",
    name,
    nickname: "",
    description: "",
    personality: "",
    scenario: "",
    firstMessage: `*${name}看向你，等待你先开口。*`,
    exampleMessages: "",
    creatorNotes: "",
    systemPrompt: "",
    postHistoryInstructions: "",
    alternateGreetings: [],
    groupOnlyGreetings: [],
    tags: [],
    creator: "",
    characterVersion: "1.0",
    visual: defaultTavernVisual(),
    extensions: {},
    favorite: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function normalizeTavernLorebookEntry(value: unknown, index = 0): TavernLorebookEntry {
  const raw = record(value);
  const extensions = record(raw.extensions);
  const positionRaw = string(raw.position || extensions.position).toLocaleLowerCase();
  const position = positionRaw.includes("before_char") || positionRaw === "0"
    ? "before-character"
    : positionRaw.includes("before_example")
      ? "before-examples"
      : positionRaw.includes("after_example")
        ? "after-examples"
        : positionRaw.includes("depth") || raw.depth !== undefined
          ? "depth"
          : "after-character";
  return {
    id: string(raw.id || raw.uid, tavernId("lore")),
    keys: stringArray(raw.keys ?? raw.key),
    secondaryKeys: stringArray(raw.secondary_keys ?? raw.keysecondary ?? raw.secondaryKeys),
    content: string(raw.content).slice(0, 200_000),
    enabled: raw.enabled !== false && raw.disable !== true,
    constant: bool(raw.constant, false),
    selective: bool(raw.selective, false),
    caseSensitive: bool(raw.case_sensitive ?? raw.caseSensitive, false),
    insertionOrder: Math.round(finite(raw.insertion_order ?? raw.order, 100 + index, -100_000, 100_000)),
    priority: Math.round(finite(raw.priority, 100, -100_000, 100_000)),
    position,
    ...(Number.isFinite(Number(raw.depth)) ? { depth: Math.round(finite(raw.depth, 4, 0, 100)) } : {}),
    ...(string(raw.comment ?? raw.name).trim() ? { comment: string(raw.comment ?? raw.name).trim().slice(0, 500) } : {}),
    extensions,
  };
}

export function normalizeTavernLorebook(value: unknown, fallbackName = "世界书"): TavernLorebook {
  const raw = record(value);
  const timestamp = tavernNow();
  const entriesValue = Array.isArray(raw.entries)
    ? raw.entries
    : Object.values(record(raw.entries));
  return {
    id: string(raw.id, tavernId("lorebook")),
    name: string(raw.name, fallbackName).trim().slice(0, 160) || fallbackName,
    description: string(raw.description).slice(0, 10_000),
    scanDepth: Math.round(finite(raw.scan_depth ?? raw.scanDepth, 8, 1, 100)),
    tokenBudget: Math.round(finite(raw.token_budget ?? raw.tokenBudget, 2048, 128, 131_072)),
    recursiveScanning: bool(raw.recursive_scanning ?? raw.recursiveScanning, false),
    entries: entriesValue.map((entry, index) => normalizeTavernLorebookEntry(entry, index)),
    extensions: record(raw.extensions),
    createdAt: isoDate(raw.createdAt, timestamp),
    updatedAt: isoDate(raw.updatedAt, timestamp),
  };
}

export function normalizeTavernCharacter(value: unknown, avatarDataUrl?: string): TavernCharacter {
  const root = record(value);
  // Imported Character Card files wrap their fields in `data`, while the
  // application's persisted TavernCharacter uses the same `spec` marker but
  // stores fields directly on the object.  Checking `spec` alone therefore
  // turned every internally-created character into an empty "新角色" during
  // the first save.  Only unwrap when an actual data object is present.
  const wrappedData = record(root.data);
  const isWrappedCard = (root.spec === "chara_card_v2" || root.spec === "chara_card_v3")
    && Boolean(root.data && typeof root.data === "object" && !Array.isArray(root.data));
  const sourceData = isWrappedCard ? wrappedData : root;
  const extensions = record(sourceData.extensions);
  const langbai = record(extensions[LANGBAI_EXTENSION]);
  const rawVisual = record(langbai.visual ?? langbai.generation ?? sourceData.visual);
  const timestamp = tavernNow();
  const spec = root.spec === "chara_card_v2" ? "chara_card_v2" : "chara_card_v3";
  const embeddedBookValue = sourceData.character_book ?? sourceData.embeddedLorebook;
  const embeddedBook = embeddedBookValue
    ? normalizeTavernLorebook(embeddedBookValue, `${string(sourceData.name, "角色")}世界书`)
    : undefined;
  const character = createTavernCharacter(string(sourceData.name, "新角色").trim() || "新角色");
  return {
    ...character,
    id: string(langbai.id || sourceData.id, character.id),
    spec,
    specVersion: string(root.spec_version ?? root.specVersion ?? sourceData.specVersion, spec === "chara_card_v2" ? "2.0" : "3.0"),
    nickname: string(sourceData.nickname),
    description: string(sourceData.description).slice(0, 200_000),
    personality: string(sourceData.personality).slice(0, 100_000),
    scenario: string(sourceData.scenario).slice(0, 100_000),
    firstMessage: string(sourceData.first_mes ?? sourceData.firstMessage, character.firstMessage).slice(0, 100_000),
    exampleMessages: string(sourceData.mes_example ?? sourceData.exampleMessages).slice(0, 200_000),
    creatorNotes: string(sourceData.creator_notes ?? sourceData.creatorNotes).slice(0, 100_000),
    systemPrompt: string(sourceData.system_prompt ?? sourceData.systemPrompt).slice(0, 100_000),
    postHistoryInstructions: string(sourceData.post_history_instructions ?? sourceData.postHistoryInstructions).slice(0, 100_000),
    alternateGreetings: stringArray(sourceData.alternate_greetings ?? sourceData.alternateGreetings).slice(0, 100),
    groupOnlyGreetings: stringArray(sourceData.group_only_greetings ?? sourceData.groupOnlyGreetings).slice(0, 100),
    tags: stringArray(sourceData.tags).slice(0, 200),
    creator: string(sourceData.creator).slice(0, 200),
    characterVersion: string(sourceData.character_version ?? sourceData.characterVersion, "1.0").slice(0, 80),
    ...(avatarDataUrl || string(langbai.avatarDataUrl ?? sourceData.avatarDataUrl) ? { avatarDataUrl: avatarDataUrl || string(langbai.avatarDataUrl ?? sourceData.avatarDataUrl) } : {}),
    ...(string(langbai.backgroundDataUrl ?? sourceData.backgroundDataUrl) ? { backgroundDataUrl: string(langbai.backgroundDataUrl ?? sourceData.backgroundDataUrl) } : {}),
    ...(string(langbai.lorebookId ?? sourceData.lorebookId) ? { lorebookId: string(langbai.lorebookId ?? sourceData.lorebookId) } : {}),
    ...(embeddedBook ? { embeddedLorebook: embeddedBook } : {}),
    visual: normalizeTavernVisual(rawVisual),
    extensions,
    source: stringArray(sourceData.source),
    favorite: bool(langbai.favorite ?? sourceData.favorite, false),
    createdAt: isoDate(langbai.createdAt ?? sourceData.creation_date ?? sourceData.createdAt, timestamp),
    updatedAt: isoDate(langbai.updatedAt ?? sourceData.modification_date ?? sourceData.updatedAt, timestamp),
  };
}

function portableLorebook(book?: TavernLorebook) {
  if (!book) return undefined;
  return {
    name: book.name,
    description: book.description,
    scan_depth: book.scanDepth,
    token_budget: book.tokenBudget,
    recursive_scanning: book.recursiveScanning,
    extensions: book.extensions,
    entries: book.entries.map((entry) => ({
      keys: entry.keys,
      secondary_keys: entry.secondaryKeys,
      content: entry.content,
      enabled: entry.enabled,
      constant: entry.constant,
      selective: entry.selective,
      case_sensitive: entry.caseSensitive,
      insertion_order: entry.insertionOrder,
      priority: entry.priority,
      position: entry.position,
      ...(entry.depth !== undefined ? { depth: entry.depth } : {}),
      ...(entry.comment ? { comment: entry.comment } : {}),
      extensions: entry.extensions,
    })),
  };
}

function extensionPayload(character: TavernCharacter) {
  return {
    schema_version: 1,
    id: character.id,
    favorite: character.favorite,
    createdAt: character.createdAt,
    updatedAt: character.updatedAt,
    ...(character.backgroundDataUrl ? { backgroundDataUrl: character.backgroundDataUrl } : {}),
    ...(character.lorebookId ? { lorebookId: character.lorebookId } : {}),
    visual: character.visual,
  };
}

export function tavernCharacterToV3(character: TavernCharacter): JsonRecord {
  const unknownExtensions = { ...character.extensions };
  unknownExtensions[LANGBAI_EXTENSION] = extensionPayload(character);
  return {
    spec: "chara_card_v3",
    spec_version: "3.0",
    data: {
      name: character.name,
      nickname: character.nickname,
      description: character.description,
      personality: character.personality,
      scenario: character.scenario,
      first_mes: character.firstMessage,
      mes_example: character.exampleMessages,
      creator_notes: character.creatorNotes,
      system_prompt: character.systemPrompt,
      post_history_instructions: character.postHistoryInstructions,
      alternate_greetings: character.alternateGreetings,
      group_only_greetings: character.groupOnlyGreetings,
      tags: character.tags,
      creator: character.creator,
      character_version: character.characterVersion,
      ...(character.embeddedLorebook ? { character_book: portableLorebook(character.embeddedLorebook) } : {}),
      source: character.source ?? [],
      creation_date: Date.parse(character.createdAt) || undefined,
      modification_date: Date.parse(character.updatedAt) || undefined,
      extensions: unknownExtensions,
    },
  };
}

export function tavernCharacterToV2(character: TavernCharacter): JsonRecord {
  const v3 = tavernCharacterToV3(character);
  const data = record(v3.data);
  delete data.nickname;
  delete data.group_only_greetings;
  delete data.source;
  delete data.creation_date;
  delete data.modification_date;
  return { spec: "chara_card_v2", spec_version: "2.0", data };
}

export function uniqueTavernName(existing: Iterable<string>, requested: string) {
  const occupied = new Set([...existing].map((item) => item.trim().toLocaleLowerCase()));
  const base = requested.trim() || "新角色";
  if (!occupied.has(base.toLocaleLowerCase())) return base;
  let index = 1;
  while (occupied.has(`${base} (${index})`.toLocaleLowerCase())) index += 1;
  return `${base} (${index})`;
}

export const TAVERN_LANGBAI_EXTENSION = LANGBAI_EXTENSION;
