/** Independently authored, branch-specialized API recipes, not copied UI assets.
 * The three architectures were checked against Comfy-Org/workflow_templates
 * commit 46e060ea88eb07adecf07197ec384c54a70e030c. Model names are suggestions;
 * the live installation's object_info must validate every choice before run.
 * MOSS/Krea recipes intentionally omit the optional prompt enhancer, SLG/LoRA.
 */
type ApiNode = { class_type: string; inputs: Record<string, unknown>; _meta?: { title: string } };
export type BuiltinComfyGraph = Record<string, ApiNode>;
const sourceCommit = "46e060ea88eb07adecf07197ec384c54a70e030c";
const positive = "A red ceramic cup on a blue table, soft daylight, plain background.";
const negative = "blurry, low quality, watermark";

export function builtinComfyGraphs(): Array<{
  name: string; family: "moss-image" | "anima" | "krea2"; graph: BuiltinComfyGraph; sourceFile: string; specialization: string;
}> {
  const recipes = [
    { family: "moss-image" as const, name: "MOSS-Image SFT · direct prompt · no enhancer / SLG", sourceFile: "image_moss_image_t2i.json",
      unet: "moss_image_sft_int8_convrot.safetensors", clip: "qwen3.5_9b_w4a8_gptq.safetensors", clipType: "moss_image",
      vae: "flux2-vae_small.safetensors", latent: "EmptyFlux2LatentImage", steps: 25, cfg: 2.5, sampler: "er_sde",
      specialization: "Text-to-image; prompt enhancer=false, SLG=false. Not the enhanced-prompt official default." },
    { family: "anima" as const, name: "Anima Base v1 · text-to-image", sourceFile: "image_anima_base_v1.json",
      unet: "anima-base-v1.0.safetensors", clip: "qwen_3_06b_base.safetensors", clipType: "stable_diffusion",
      vae: "qwen_image_vae.safetensors", latent: "EmptyLatentImage", steps: 30, cfg: 4, sampler: "euler",
      specialization: "Anima Base v1; turbo=false; independent positive/negative conditioning." },
    { family: "krea2" as const, name: "Krea 2 Turbo · direct prompt · no enhancer / LoRA", sourceFile: "image_krea2_turbo_t2i_int8.json",
      unet: "krea2_turbo_nvfp4.safetensors", clip: "qwen3vl_4b_int8_convrot.safetensors", clipType: "krea2",
      vae: "qwen_image_vae.safetensors", latent: "EmptyLatentImage", steps: 8, cfg: 1, sampler: "euler",
      specialization: "Krea 2 Turbo; prompt enhancer=false, LoRA=false. Negative is ConditioningZeroOut(positive), not an independent negative text prompt. Suggested NVFP4 model/Int8 encoder; choose matching installed files." },
  ];
  return recipes.map(recipe => ({ name: recipe.name, family: recipe.family, sourceFile: recipe.sourceFile, specialization: recipe.specialization,
    graph: {
      "1": { class_type: "UNETLoader", inputs: { unet_name: recipe.unet, weight_dtype: "default" }, _meta: { title: "Diffusion model" } },
      "2": { class_type: "CLIPLoader", inputs: { clip_name: recipe.clip, type: recipe.clipType, device: "default" }, _meta: { title: "Text encoder (match model family)" } },
      "3": { class_type: "VAELoader", inputs: { vae_name: recipe.vae }, _meta: { title: "VAE" } },
      "4": { class_type: "CLIPTextEncode", inputs: { clip: ["2", 0], text: positive }, _meta: { title: "Positive prompt" } },
      "5": recipe.family === "krea2"
        ? { class_type: "ConditioningZeroOut", inputs: { conditioning: ["4", 0] }, _meta: { title: "Zeroed negative (Krea 2)" } }
        : { class_type: "CLIPTextEncode", inputs: { clip: ["2", 0], text: negative }, _meta: { title: "Negative prompt" } },
      "6": { class_type: recipe.latent, inputs: { width: 1024, height: 1024, batch_size: 1 } },
      "7": { class_type: "KSampler", inputs: { model: ["1", 0], positive: ["4", 0], negative: ["5", 0], latent_image: ["6", 0],
        seed: 12345, steps: recipe.steps, cfg: recipe.cfg, sampler_name: recipe.sampler, scheduler: "simple", denoise: 1 } },
      "8": { class_type: "VAEDecode", inputs: { samples: ["7", 0], vae: ["3", 0] } },
      "9": { class_type: "SaveImage", inputs: { images: ["8", 0], filename_prefix: `Langbai-ComfyUI/${recipe.family}` } },
    },
  }));
}

export function builtinComfyWorkflows(): Array<{ name: string; text: string; provenance: Record<string, unknown> }> {
  return builtinComfyGraphs().map(recipe => ({ name: recipe.name, text: JSON.stringify(recipe.graph),
    provenance: { kind: "independently-authored-API-recipe", family: recipe.family, sourceCommit,
      architectureReference: `https://github.com/Comfy-Org/workflow_templates/blob/${sourceCommit}/templates/${recipe.sourceFile}`,
      specialization: recipe.specialization, officialFrontendExportVerified: false } }));
}
