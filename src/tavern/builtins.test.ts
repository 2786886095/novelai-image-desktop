import { describe, expect, it } from "vitest";
import type { AgentConversation } from "../agent/types";
import { createSoftwareImageStarterKit, createTavernBuiltinSamplerPresets, LYRA_IMAGE_SAMPLER_ID, DEFAULT_TAVERN_NEGATIVE_PROMPT } from "./builtins";
import { normalizeTavernCharacter } from "./compat";
import { activeLorebookEntries, buildTavernSystemPrompt } from "./prompt";

describe("software intelligent image starter kit", () => {
  it("ships a linked character, persona, lorebook and sampler", () => {
    const kit = createSoftwareImageStarterKit();

    expect(kit.character.name).toBe("软件智能生图");
    expect(kit.character.lorebookId).toBe(kit.lorebook.id);
    expect(kit.persona.lorebookId).toBe(kit.lorebook.id);
    expect(kit.sampler.name).toBe("夏瑾 天琴座 Beta 3.8");
    expect(kit.lorebook.entries.length).toBeGreaterThanOrEqual(7);
    expect(activeLorebookEntries([kit.lorebook], []).map(({ entry }) => entry.id)).toEqual(expect.arrayContaining(["builtin-software-image-workflow", "builtin-software-image-protocol"]));
    expect(kit.character.visual.negativePrompt).toBe(DEFAULT_TAVERN_NEGATIVE_PROMPT);
    expect(kit.character.visual.stylePrompt).toBe("");
  });

  it("ships only the supplied Lyra preset as the default editable preset", () => {
    const presets = createTavernBuiltinSamplerPresets();
    expect(presets).toHaveLength(1);
    expect(presets[0].id).toBe(LYRA_IMAGE_SAMPLER_ID);
    expect(presets[0].name).toBe("夏瑾 天琴座 Beta 3.8");
    expect(presets[0].sourceHash).toBe("09D89AE4F64E05C06962786BB19A8C7364898E863DCC3FCDE99F661E841EF6A9");
    expect(presets[0].systemPrompt.length).toBeGreaterThan(3000);
    expect(presets[0].systemPrompt).not.toContain("taskjs");
  });

  it("round-trips an internally persisted v3-shaped character without flattening it", () => {
    const { character } = createSoftwareImageStarterKit();
    const normalized = normalizeTavernCharacter(character);

    expect(normalized.id).toBe(character.id);
    expect(normalized.name).toBe("软件智能生图");
    expect(normalized.description).toBe(character.description);
    expect(normalized.firstMessage).toBe(character.firstMessage);
    expect(normalized.systemPrompt).toBe(character.systemPrompt);
    expect(normalized.lorebookId).toBe(character.lorebookId);
    expect(normalized.visual).toEqual(character.visual);
    expect(normalized.favorite).toBe(true);
  });

  it("keeps the confirmation/auto image contract in the assembled prompt", () => {
    const kit = createSoftwareImageStarterKit();
    const conversation = {
      id: "chat",
      title: kit.character.name,
      messages: [],
      draftAttachments: [],
      status: "idle",
      context: { used: 0, limit: 1000, percent: 0, danger: false, estimated: true, updatedAt: new Date().toISOString() },
      compactCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      characterIds: [kit.character.id],
      activeCharacterId: kit.character.id,
      personaId: kit.persona.id,
      lorebookIds: [kit.lorebook.id],
      samplerPresetId: kit.sampler.id,
      generationMode: "confirm",
      autoPlayGroup: false,
      pinned: false,
    } satisfies AgentConversation;

    const prompt = buildTavernSystemPrompt({
      conversation,
      characters: [kit.character],
      activeCharacter: kit.character,
      persona: kit.persona,
      lorebooks: [kit.lorebook],
      preset: kit.sampler,
    });

    expect(activeLorebookEntries([kit.lorebook], [])).toHaveLength(2);
    expect(prompt).toContain("软件智能生图");
    expect(prompt).toContain("<langbai-image>");
    expect(prompt).toContain("确认后生图");
    expect(prompt).toContain("全自动生图");
    expect(prompt).toContain("只生成正面提示词");
    expect(prompt).not.toContain('"negativePrompt"');
    expect(prompt).not.toContain('"stylePrompt"');
  });
});
