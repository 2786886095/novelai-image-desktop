import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, type GenerateExtras } from "../types";
import {
  applyAgentPromptLocks,
  buildAgentGenerationInput,
  defaultAgentInpaintModel,
} from "./generation-input";

describe("agent generation input", () => {
  it("supports advanced parameters and attachment-backed generation controls", () => {
    const result = buildAgentGenerationInput({
      model: "nai-diffusion-4-5-full",
      positivePrompt: "1girl, looking at viewer",
      width: 1234,
      height: 777,
      sampler: "k_dpmpp_2m",
      noiseSchedule: "exponential",
      cfgScale: 7.5,
      cfgRescale: 0.4,
      seed: 0xffff_ffff,
      seedMode: "fixed",
      ucPreset: 1,
      qualityPreset: "light",
      smea: true,
      smeaDyn: true,
      variety: true,
      modelMode: "furry",
      historyGroupId: "agent-group",
      characterPrompts: Array.from({ length: 8 }, (_, index) => ({
        prompt: `character ${index + 1}`,
        negativePrompt: "bad anatomy",
        useCoords: true,
        x: index / 10,
        y: 0.7,
      })),
      vibeReferences: [{ attachmentId: "vibe", infoExtracted: 0.8, strength: 0.6 }],
      preciseReferences: [{ attachmentId: "precise", type: "character&style", strength: 0.9, fidelity: 0.75 }],
    }, { params: DEFAULT_PARAMS }, (id) => `base64:${id}`);

    expect(result.params.model).toBe("nai-diffusion-4-5-full");
    expect(result.params.width % 64).toBe(0);
    expect(result.params.height % 64).toBe(0);
    expect(result.params.sampler).toBe("k_dpmpp_2m");
    expect(result.params.noiseSchedule).toBe("exponential");
    expect(result.params.seed).toBe(0xffff_ffff);
    expect(result.params.qualityPreset).toBe("standard");
    expect(result.params.smeaDyn).toBe(true);
    expect(result.extras.modelMode).toBe("furry");
    expect(result.extras.historyGroupId).toBe("agent-group");
    expect(result.extras.charCaptions).toHaveLength(6);
    expect(result.extras.vibeImages[0]).toMatchObject({ base64: "base64:vibe", infoExtracted: 0.8, strength: 0.6 });
    expect(result.extras.preciseReferences?.[0]).toMatchObject({ base64: "base64:precise", type: "character&style", strength: 0.9, fidelity: 0.75 });
  });

  it("preserves current references when the Agent does not explicitly replace them", () => {
    const extras: GenerateExtras = {
      vibeImages: [{ base64: "existing", infoExtracted: 1, strength: 1 }],
      charCaptions: [{ prompt: "existing character", useCoords: false, x: 0.5, y: 0.5 }],
      preciseReferences: [],
      historyGroupId: "current-group",
      modelMode: "anime",
    };
    const result = buildAgentGenerationInput(
      { positivePrompt: "updated" },
      { params: { ...DEFAULT_PARAMS, model: "nai-diffusion-4-5-full" }, extras },
    );

    expect(result.extras.vibeImages).toEqual(extras.vibeImages);
    expect(result.extras.charCaptions).toEqual(extras.charCaptions);
    expect(result.extras).not.toBe(extras);
    expect(result.extras.vibeImages).not.toBe(extras.vibeImages);
  });

  it("rejects reference modes unsupported by the selected model", () => {
    expect(() => buildAgentGenerationInput({
      positivePrompt: "test",
      model: "nai-diffusion-5-full",
      vibeReferences: [{ attachmentId: "image" }],
    }, {}, () => "base64")).toThrow("不支持 Vibe Transfer");

    expect(() => buildAgentGenerationInput({
      positivePrompt: "test",
      model: "nai-diffusion-5-full",
      preciseReferences: [{ attachmentId: "image" }],
    }, {}, () => "base64")).toThrow("不支持精准参考图");
  });

  it("keeps explicit Studio locks authoritative", () => {
    const params = applyAgentPromptLocks({
      ...DEFAULT_PARAMS,
      stylePrompt: "model style",
      negativePrompt: "model negative",
    }, {
      stylePrompt: "locked style",
      negativePrompt: "locked negative",
    });

    expect(params.stylePrompt).toBe("locked style");
    expect(params.negativePrompt).toBe("locked negative");
  });

  it("selects the correct inpaint family for V4.5 before V5", () => {
    expect(defaultAgentInpaintModel("nai-diffusion-4-5-full")).toBe("nai-diffusion-4-5-full-inpainting");
    expect(defaultAgentInpaintModel("nai-diffusion-5-full")).toBe("nai-diffusion-5-full-inpainting");
    expect(defaultAgentInpaintModel("nai-diffusion-4-full")).toBe("nai-diffusion-4-full-inpainting");
    expect(defaultAgentInpaintModel("nai-diffusion-3")).toBe("nai-diffusion-3-inpainting");
  });
});
