import { assertUntrustedValue, ComfyValidationError, isPlainRecord } from "./format-detect";
import type { ComfyModelRole, ComfySlotValue } from "./contract";

export interface ComfyInputSpec {
  name: string; type: string; required: boolean; widget: boolean;
  options?: Array<string | number>; remote: boolean; controlAfterGenerate: boolean; imageUpload: boolean;
  defaultValue?: ComfySlotValue; min?: number; max?: number; step?: number;
  multiline: boolean; forceInput: boolean; socketless: boolean; rawOptions: Record<string, unknown>;
  /** Dynamic-combo and multi-select values require schema-specific serialization. */
  dynamic: boolean; multiselect: boolean;
}
export interface ComfyNodeDef {
  classType: string; inputs: Record<string, ComfyInputSpec>; inputOrder: string[]; inputOrderExplicit: boolean;
  hidden: string[]; outputs: string[]; outputNames: string[]; outputNode: boolean;
  pythonModule: string | null; apiNode: boolean; deprecated: boolean; displayName: string; category: string;
}
export type ComfyCatalog = Record<string, ComfyNodeDef>;
export type ComfyNodeCatalog = ComfyCatalog;
function scalar(value: unknown): value is ComfySlotValue { return typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)); }
export function isWidgetInput(spec: ComfyInputSpec): boolean { return spec.widget; }
export function isCoreModule(module: string | null): boolean { return module === "nodes" || !!module && /^comfy_extras\.[A-Za-z0-9_.]+$/.test(module); }
export function isApiNodeDef(def: ComfyNodeDef): boolean { return def.apiNode || !!def.pythonModule && /^comfy_api_nodes(?:\.|$)/.test(def.pythonModule); }
export function modelRoleForInput(input: string, classType = ""): ComfyModelRole | null {
  if (/^(?:unet_name|diffusion_model|diffusion_model_name)$/.test(input)) return "diffusion";
  if (/^(?:ckpt_name|checkpoint_name)$/.test(input)) return "checkpoint";
  if (/^(?:clip_name\d*|text_encoder_name\d*)$/.test(input)) return "text-encoder";
  if (/^vae_name$/.test(input)) return "vae";
  if (/^lora_name$/.test(input)) return "lora";
  if (/^(?:control_net_name|controlnet_name)$/.test(input)) return "controlnet";
  if (input === "model_name" && /UpscaleModelLoader/.test(classType)) return "upscale";
  if (input === "model_name" && /Loader/.test(classType)) return "other";
  return null;
}
export function isModelLikeInput(name: string, spec?: ComfyInputSpec, def?: ComfyNodeDef): boolean {
  return modelRoleForInput(name, def?.classType) !== null && (!spec || spec.type === "COMBO" || spec.type === "STRING");
}

export function normalizeObjectInfo(raw: unknown): ComfyCatalog {
  assertUntrustedValue(raw, { maxStringChars: 4 * 1024 * 1024 });
  if (!isPlainRecord(raw) || !Object.keys(raw).length) throw new ComfyValidationError("object_info is not a nonempty node dictionary");
  const catalog: ComfyCatalog = {};
  for (const [classType, entry] of Object.entries(raw)) {
    if (!isPlainRecord(entry) || !isPlainRecord(entry.input)) throw new ComfyValidationError(`Invalid object_info node definition: ${classType}`);
    const inputs: Record<string, ComfyInputSpec> = {}; const naturalOrder: string[] = [];
    for (const group of ["required", "optional"]) {
      const fields = entry.input[group]; if (fields === undefined) continue;
      if (!isPlainRecord(fields)) throw new ComfyValidationError(`Invalid object_info input group: ${classType}.${group}`);
      for (const [name, tuple] of Object.entries(fields)) {
        if (!Array.isArray(tuple) || !tuple.length) throw new ComfyValidationError(`Invalid object_info input: ${classType}.${name}`);
        const options = isPlainRecord(tuple[1]) ? tuple[1] : {};
        let type: string, choices: Array<string | number> | undefined;
        if (Array.isArray(tuple[0])) { type = "COMBO"; if (!tuple[0].every((v) => typeof v === "string" || typeof v === "number" && Number.isFinite(v))) throw new ComfyValidationError(`Unsupported combo option schema: ${classType}.${name}`); choices = [...tuple[0]]; }
        else type = typeof tuple[0] === "string" ? tuple[0] : "UNKNOWN";
        if (type === "COMBO" && Array.isArray(options.options) && options.options.every((v) => typeof v === "string" || typeof v === "number" && Number.isFinite(v))) choices = [...options.options] as Array<string | number>;
        const forceInput = options.forceInput === true, socketless = options.socketless === true;
        inputs[name] = { name, type, required: group === "required", widget: !forceInput && ["STRING","INT","FLOAT","BOOLEAN","COMBO","COMFY_DYNAMICCOMBO_V3"].includes(type),
          ...(choices ? { options: choices } : {}), remote: isPlainRecord(options.remote) || typeof options.remote === "string",
          controlAfterGenerate: options.control_after_generate === true || typeof options.control_after_generate === "string",
          imageUpload: options.image_upload === true, ...(scalar(options.default) ? { defaultValue: options.default } : {}),
          ...(typeof options.min === "number" && Number.isFinite(options.min) ? { min: options.min } : {}),
          ...(typeof options.max === "number" && Number.isFinite(options.max) ? { max: options.max } : {}),
          ...(typeof options.step === "number" && Number.isFinite(options.step) ? { step: options.step } : {}),
          multiline: options.multiline === true, forceInput, socketless, rawOptions: structuredClone(options), dynamic: type === "COMFY_DYNAMICCOMBO_V3", multiselect: options.multiselect === true };
        naturalOrder.push(name);
      }
    }
    const inputOrder: string[] = []; let explicit = true;
    const order = isPlainRecord(entry.input_order) ? entry.input_order : {};
    for (const group of ["required","optional"]) {
      const names = order[group];
      if (Array.isArray(names)) for (const name of names) { if (typeof name === "string" && inputs[name] && !inputOrder.includes(name)) inputOrder.push(name); }
      else if (Object.values(inputs).some((spec) => spec.required === (group === "required"))) explicit = false;
    }
    for (const name of naturalOrder) if (!inputOrder.includes(name)) { inputOrder.push(name); explicit = false; }
    const hidden = isPlainRecord(entry.input.hidden) ? Object.keys(entry.input.hidden) : [];
    const outputs = Array.isArray(entry.output) ? entry.output.map((value) => typeof value === "string" ? value : "UNKNOWN") : [];
    catalog[classType] = { classType, inputs, inputOrder, inputOrderExplicit: explicit, hidden, outputs,
      outputNames: Array.isArray(entry.output_name) ? entry.output_name.map(String) : [...outputs], outputNode: entry.output_node === true,
      pythonModule: typeof entry.python_module === "string" ? entry.python_module : null, apiNode: entry.api_node === true,
      deprecated: entry.deprecated === true, displayName: typeof entry.display_name === "string" ? entry.display_name : classType,
      category: typeof entry.category === "string" ? entry.category : "" };
  }
  return catalog;
}
