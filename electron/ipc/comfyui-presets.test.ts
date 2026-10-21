import { describe, expect, it } from "vitest";
import { builtinComfyGraphs, builtinComfyWorkflows } from "./comfyui-presets";
import { parseUntrustedJson, detectComfyPayload } from "../../src/comfyui/format-detect";
import { assertSubmittablePrompt } from "../../src/comfyui/api-prompt";

describe("Local model API recipes", () => {
  it("offers three independently importable, fresh graphs without user-specific paths or runtime claims", () => {
    const presets = builtinComfyWorkflows(); expect(presets).toHaveLength(3);
    for (const preset of presets) {
      const found = detectComfyPayload(parseUntrustedJson(preset.text)); expect(found.format).toBe("api");
      const graph = assertSubmittablePrompt(found.payload); expect(Object.keys(graph)).toHaveLength(9);
      expect(graph["9"].class_type).toBe("SaveImage");
      expect(preset.provenance.officialFrontendExportVerified).toBe(false);
      expect(preset.text).not.toMatch(/[A-Z]:[\\/]|langbai[\\/]|AppData|api[_-]?key|token/i);
    }
    const first = builtinComfyGraphs(); first[0].graph["1"].inputs.unet_name = "changed";
    expect(builtinComfyGraphs()[0].graph["1"].inputs.unet_name).not.toBe("changed");
  });
  it("uses actual distinct model architectures, not the same generic graph with renamed weights", () => {
    const [moss, anima, krea] = builtinComfyGraphs();
    expect(moss.graph["2"].inputs.type).toBe("moss_image"); expect(moss.graph["6"].class_type).toBe("EmptyFlux2LatentImage");
    expect(moss.graph["7"].inputs).toMatchObject({ steps: 25, cfg: 2.5, sampler_name: "er_sde" });
    expect(anima.graph["2"].inputs.type).toBe("stable_diffusion"); expect(anima.graph["5"].class_type).toBe("CLIPTextEncode");
    expect(anima.graph["6"].class_type).toBe("EmptyLatentImage"); expect(anima.graph["7"].inputs.steps).toBe(30);
    expect(krea.graph["2"].inputs.type).toBe("krea2"); expect(krea.graph["5"]).toMatchObject({ class_type: "ConditioningZeroOut", inputs: { conditioning: ["4", 0] } });
    expect(krea.graph["7"].inputs).toMatchObject({ steps: 8, cfg: 1 });
    for (const preset of [moss, anima, krea]) expect(Object.values(preset.graph).some(node => ["TextGenerate", "LoraLoader", "SkipLayerGuidanceDiTSimple"].includes(node.class_type))).toBe(false);
  });
});
