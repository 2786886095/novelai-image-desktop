import { assertUntrustedValue, ComfyValidationError, isPlainRecord } from "./format-detect";
import type { ComfyComboOption, ComfyModelRole, ComfySchemaDiagnostic, ComfySlotValue } from "./contract";

export interface ComfyInputSpec {
  name: string; type: string; required: boolean; widget: boolean;
  options?: ComfyComboOption[]; remote: boolean; controlAfterGenerate: boolean; imageUpload: boolean;
  defaultValue?: ComfySlotValue; min?: number; max?: number; step?: number;
  multiline: boolean; forceInput: boolean; socketless: boolean; rawOptions: Record<string, unknown>;
  /** Dynamic-combo and multi-select values require schema-specific serialization. */
  dynamic: boolean; multiselect: boolean;
  unsupported?: { code: "combo-option-schema"; detail: string };
}
export interface ComfyNodeDef {
  classType: string; inputs: Record<string, ComfyInputSpec>; inputOrder: string[]; inputOrderExplicit: boolean;
  hidden: string[]; outputs: string[]; outputNames: string[]; outputNode: boolean;
  pythonModule: string | null; apiNode: boolean; deprecated: boolean; displayName: string; category: string;
  schemaError?: { code: "node-schema-unsupported"; detail: string };
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
  return modelRoleForInput(name, def?.classType) !== null && !def?.schemaError && (!spec ||
    !spec.unsupported && (spec.type === "COMBO" || spec.type === "STRING") && !!spec.options && spec.options.every(option => typeof option === "string"));
}

export interface ComfyNormalizedObjectInfo { catalog: ComfyCatalog; diagnostics: ComfySchemaDiagnostic[] }

/**
 * Main-process opt-in isolation of unsupported node schemas. Global JSON safety
 * checks still fail closed before any per-node recovery; this is not a way to
 * tolerate forbidden keys, non-finite values, cycles, or oversized JSON.
 */
export function normalizeObjectInfoWithDiagnostics(raw: unknown): ComfyNormalizedObjectInfo {
  assertUntrustedValue(raw, { maxStringChars: 4 * 1024 * 1024 });
  if (!isPlainRecord(raw) || !Object.keys(raw).length) throw new ComfyValidationError("COMFY_INVALID_CATALOG: object_info is not a nonempty node dictionary");
  const catalog: ComfyCatalog = {};
  const diagnostics: ComfySchemaDiagnostic[] = [];
  for (const [classType, entry] of Object.entries(raw)) {
    const metadata = isPlainRecord(entry) ? entry : {};
    const base: ComfyNodeDef = { classType, inputs: {}, inputOrder: [], inputOrderExplicit: false, hidden: [],
      outputs: Array.isArray(metadata.output) ? metadata.output.map(value => typeof value === "string" ? value : "UNKNOWN") : [],
      outputNames: Array.isArray(metadata.output_name) ? metadata.output_name.map(value => scalar(value) ? String(value) : "UNKNOWN") : [], outputNode: metadata.output_node === true,
      pythonModule: typeof metadata.python_module === "string" ? metadata.python_module : null, apiNode: metadata.api_node === true,
      deprecated: metadata.deprecated === true, displayName: typeof metadata.display_name === "string" ? metadata.display_name : classType,
      category: typeof metadata.category === "string" ? metadata.category : "" };
    try {
    if (!isPlainRecord(entry) || !isPlainRecord(entry.input)) throw new ComfyValidationError(`Invalid object_info node definition: ${classType}`);
    const inputs: Record<string, ComfyInputSpec> = {}; const naturalOrder: string[] = [];
    for (const group of ["required", "optional"]) {
      const fields = entry.input[group]; if (fields === undefined) continue;
      if (!isPlainRecord(fields)) throw new ComfyValidationError(`Invalid object_info input group: ${classType}.${group}`);
      for (const [name, tuple] of Object.entries(fields)) {
        if (!Array.isArray(tuple) || !tuple.length) throw new ComfyValidationError(`Invalid object_info input: ${classType}.${name}`);
        const options = isPlainRecord(tuple[1]) ? tuple[1] : {};
        let type: string, choices: ComfyComboOption[] | undefined;
        let unsupported: ComfyInputSpec["unsupported"];
        const comboOptions = (items: unknown): void => {
          if (Array.isArray(items) && items.every(scalar)) choices = [...items];
          else {
            choices = undefined;
            unsupported = { code: "combo-option-schema", detail: `Unsupported combo option schema: ${classType}.${name}; choices must be strings, finite numbers, or booleans.` };
          }
        };
        if (Array.isArray(tuple[0])) { type = "COMBO"; comboOptions(tuple[0]); }
        else if (typeof tuple[0] === "string") type = tuple[0];
        else throw new ComfyValidationError(`Invalid object_info input type: ${classType}.${name}`);
        if (type === "COMBO" && options.options !== undefined) comboOptions(options.options);
        const forceInput = options.forceInput === true, socketless = options.socketless === true;
        inputs[name] = { name, type, required: group === "required", widget: !unsupported && !forceInput && ["STRING","INT","FLOAT","BOOLEAN","COMBO","COMFY_DYNAMICCOMBO_V3"].includes(type),
          ...(choices ? { options: choices } : {}), remote: isPlainRecord(options.remote) || typeof options.remote === "string",
          controlAfterGenerate: options.control_after_generate === true || typeof options.control_after_generate === "string",
          imageUpload: options.image_upload === true, ...(scalar(options.default) ? { defaultValue: options.default } : {}),
          ...(typeof options.min === "number" && Number.isFinite(options.min) ? { min: options.min } : {}),
          ...(typeof options.max === "number" && Number.isFinite(options.max) ? { max: options.max } : {}),
          ...(typeof options.step === "number" && Number.isFinite(options.step) ? { step: options.step } : {}),
          multiline: options.multiline === true, forceInput, socketless, rawOptions: structuredClone(options), dynamic: type === "COMFY_DYNAMICCOMBO_V3", multiselect: options.multiselect === true,
          ...(unsupported ? { unsupported } : {}) };
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
      outputNames: Array.isArray(entry.output_name) ? entry.output_name.map(value => scalar(value) ? String(value) : "UNKNOWN") : [...outputs], outputNode: entry.output_node === true,
      pythonModule: typeof entry.python_module === "string" ? entry.python_module : null, apiNode: entry.api_node === true,
      deprecated: entry.deprecated === true, displayName: typeof entry.display_name === "string" ? entry.display_name : classType,
      category: typeof entry.category === "string" ? entry.category : "" };
    for (const spec of Object.values(inputs)) if (spec.unsupported) diagnostics.push({ classType, displayName: base.displayName, input: spec.name, ...spec.unsupported });
    } catch (error) {
      if (!(error instanceof ComfyValidationError)) throw error;
      const schemaError = { code: "node-schema-unsupported" as const, detail: error.message };
      catalog[classType] = { ...base, schemaError };
      diagnostics.push({ classType, displayName: base.displayName, ...schemaError });
    }
  }
  if (!Object.values(catalog).some(def => !def.schemaError)) throw new ComfyValidationError("COMFY_INVALID_CATALOG: object_info contains no usable node definitions");
  return { catalog, diagnostics };
}

/** Strict existing contract; analysis explicitly opts into isolated diagnostics. */
export function normalizeObjectInfo(raw: unknown): ComfyCatalog {
  const result = normalizeObjectInfoWithDiagnostics(raw);
  if (result.diagnostics.length) throw new ComfyValidationError(result.diagnostics[0].detail);
  return result.catalog;
}
