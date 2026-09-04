import { describe, expect, it } from "vitest";
import type { AgentConversation, AgentMessage, TavernLorebook } from "../agent/types";
import {
  createTavernCharacter,
  createTavernPersona,
  createTavernSamplerPreset,
  normalizeTavernLorebook,
} from "./compat";
import {
  activeLorebookEntries,
  buildTavernPromptMessages,
  buildTavernSystemPrompt,
  parseLangbaiImageProposal,
} from "./prompt";

function message(content: string): AgentMessage {
  return {
    id: "message-1",
    role: "user",
    content,
    attachments: [],
    tools: [],
    status: "complete",
    createdAt: "2026-09-02T00:00:00.000Z",
  };
}

function conversation(messages: AgentMessage[]): AgentConversation {
  return {
    id: "chat-1",
    title: "测试对话",
    characterIds: ["character-1"],
    activeCharacterId: "character-1",
    personaId: "persona-1",
    lorebookIds: [],
    samplerPresetId: "sampler-1",
    messages,
    draftAttachments: [],
    generationMode: "confirm",
    autoPlayGroup: false,
    pinned: false,
    status: "idle",
    context: {
      used: 0,
      limit: 128_000,
      percent: 0,
      danger: false,
      estimated: true,
      updatedAt: "2026-09-02T00:00:00.000Z",
    },
    compactCount: 0,
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
  };
}

describe("Character Tavern prompt assembly", () => {
  it("always preserves the Langbai image contract when a card supplies its own system prompt", () => {
    const character = createTavernCharacter("露娜");
    character.id = "character-1";
    character.systemPrompt = "Only speak as {{char}}.";
    const persona = createTavernPersona("旅行者");
    persona.id = "persona-1";
    const preset = createTavernSamplerPreset();
    preset.id = "sampler-1";
    const result = buildTavernSystemPrompt({
      conversation: conversation([]),
      characters: [character],
      activeCharacter: character,
      persona,
      lorebooks: [],
      preset,
    });

    expect(result).toContain("<langbai-image>");
    expect(result).toContain("Only speak as 露娜.");
    expect(result).not.toContain("{{char}}");
  });

  it("activates constant, keyword and recursive lorebook entries within budget", () => {
    const book: TavernLorebook = normalizeTavernLorebook({
      id: "book-1",
      name: "月城设定",
      recursiveScanning: true,
      tokenBudget: 2048,
      entries: [
        { id: "constant", constant: true, content: "月城终年入夜。", priority: 300 },
        { id: "moon", keys: ["月城"], content: "钟塔位于月城中央。", priority: 200 },
        { id: "tower", keys: ["钟塔"], content: "钟塔守卫名叫伊芙。", priority: 100 },
      ],
    });

    const selected = activeLorebookEntries([book], [message("我们抵达月城。")]);
    expect(selected.map((item) => item.entry.id)).toEqual(expect.arrayContaining(["constant", "moon", "tower"]));
  });

  it("removes a valid image directive from visible roleplay text", () => {
    const parsed = parseLangbaiImageProposal(
      '她抬头望向星空。\n<langbai-image>{"positivePrompt":"1girl, starry sky","width":1024,"height":1024,"count":1}</langbai-image>',
    );
    expect(parsed.visible).toBe("她抬头望向星空。");
    expect(parsed.proposal).toMatchObject({ positivePrompt: "1girl, starry sky", count: 1 });
  });

  it("recovers a bare positive-only JSON proposal without exposing machine data", () => {
    const parsed = parseLangbaiImageProposal(
      '方案已整理，请确认。\n{"positivePrompt":"1girl, rainy street","width":832,"height":1216,"count":1}',
    );
    expect(parsed.visible).toBe("方案已整理，请确认。");
    expect(parsed.proposal).toMatchObject({ positivePrompt: "1girl, rainy street", width: 832, height: 1216 });
  });

  it("adds image-specific planning guidance only when reasoning effort is explicit", () => {
    const character = createTavernCharacter("软件智能生图");
    character.id = "character-1";
    const preset = createTavernSamplerPreset();
    preset.id = "sampler-1";
    const highEffort = conversation([]);
    highEffort.reasoningEffort = "high";

    const detailed = buildTavernSystemPrompt({
      conversation: highEffort,
      characters: [character],
      activeCharacter: character,
      lorebooks: [],
      preset,
    });
    const automatic = buildTavernSystemPrompt({
      conversation: conversation([]),
      characters: [character],
      activeCharacter: character,
      lorebooks: [],
      preset,
    });

    expect(detailed).toContain("## Image planning effort");
    expect(detailed).toContain("tag interactions");
    expect(automatic).not.toContain("## Image planning effort");
  });

  it("keeps the latest image proposal as private context for conversational size changes", () => {
    const character = createTavernCharacter("软件智能生图");
    character.id = "character-1";
    const preset = createTavernSamplerPreset();
    preset.id = "sampler-1";
    const assistant = message("方案已经整理好。");
    assistant.role = "assistant";
    assistant.imageProposal = {
      id: "image-1",
      status: "pending",
      positivePrompt: "1girl, rainy street",
      negativePrompt: "lowres",
      stylePrompt: "cinematic anime",
      width: 1024,
      height: 1024,
      steps: 28,
      scale: 5,
      sampler: "k_euler_ancestral",
      count: 1,
      createdAt: "2026-09-02T00:00:00.000Z",
    };
    const messages = buildTavernPromptMessages({
      conversation: conversation([assistant, message("改成 832×1216")]),
      characters: [character],
      activeCharacter: character,
      lorebooks: [],
      preset,
    });

    expect(messages[0].content).toContain("explicit revision request");
    expect(messages[1].content).toContain("<langbai-current-image>");
    expect(messages[1].content).toContain('"positivePrompt":"1girl, rainy street"');
    expect(messages[1].content).not.toContain("lowres");
    expect(messages[1].content).not.toContain("cinematic anime");
    expect(messages[2].content).toBe("改成 832×1216");
  });

  it("keeps attachment-only user turns addressable for multimodal assembly", () => {
    const character = createTavernCharacter("软件智能生图");
    character.id = "character-1";
    const preset = createTavernSamplerPreset();
    preset.id = "sampler-1";
    const attachmentOnly = message("");
    attachmentOnly.id = "image-message";
    attachmentOnly.attachments = [{
      id: "attachment-1",
      kind: "image",
      name: "reference.png",
      mime: "image/png",
      size: 128,
      filePath: "D:/reference.png",
      fileUrl: "local-media://reference.png",
      createdAt: "2026-09-02T00:00:00.000Z",
    }];

    const messages = buildTavernPromptMessages({
      conversation: conversation([attachmentOnly]),
      characters: [character],
      activeCharacter: character,
      lorebooks: [],
      preset,
    });

    expect(messages[1]).toMatchObject({
      role: "user",
      sourceMessageId: "image-message",
      content: "[User attached 1 image.]",
    });
  });
});
