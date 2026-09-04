import { describe, expect, it } from "vitest";
import {
  normalizeTavernCharacter,
  tavernCharacterToV3,
  uniqueTavernName,
} from "./compat";

describe("SillyTavern character-card compatibility", () => {
  it("preserves unknown V3 extensions while round-tripping Langbai visual fields", () => {
    const imported = normalizeTavernCharacter({
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: {
        name: "Luna",
        description: "Moon keeper",
        first_mes: "Hello, {{user}}.",
        extensions: {
          third_party_extension: { enabled: true, nested: { value: 7 } },
          langbai_novelai_studio: {
            visual: { positivePrompt: "1girl, silver hair", width: 832, height: 1216 },
          },
        },
      },
    });

    expect(imported.visual).toMatchObject({ positivePrompt: "1girl, silver hair", width: 832, height: 1216 });
    const exported = tavernCharacterToV3(imported) as { data: { extensions: Record<string, unknown> } };
    expect(exported.data.extensions.third_party_extension).toEqual({ enabled: true, nested: { value: 7 } });
    expect(exported.data.extensions.langbai_novelai_studio).toBeTruthy();
  });

  it("uses an incrementing suffix instead of overwriting a same-name card", () => {
    expect(uniqueTavernName(["Luna", "Luna (1)"], "Luna")).toBe("Luna (2)");
  });
});
