import { COMFY_LIMITS } from "./contract";
import type { ComfyIssue, ComfySlot, ComfySlotKind, ComfySlotValue } from "./contract";
import { assertSubmittablePrompt, isLinkRef, validateInputValue } from "./api-prompt";
import type { ComfyApiPrompt } from "./api-prompt";
import type { ComfyCatalog, ComfyInputSpec } from "./object-info";
import { isModelLikeInput, modelRoleForInput } from "./object-info";
import { ComfyValidationError, isPlainRecord } from "./format-detect";
import { resolveStaticScalar } from "./static-values";
export { resolveStaticScalar } from "./static-values";

export type ComfySlotHints = Record<string, { label?: string; kind?: ComfySlotKind; controls?: string[] }>;
export function seedBounds(spec: Pick<ComfyInputSpec,"min"|"max">): {min:number;max:number} {
  return {min:Math.max(0,Math.ceil(spec.min ?? 0)),max:Math.min(Number.MAX_SAFE_INTEGER,Math.floor(spec.max ?? Number.MAX_SAFE_INTEGER))};
}
const numeric: Record<string,ComfySlotKind> = {width:"width",height:"height",batch_size:"batch",batch:"batch",seed:"seed",noise_seed:"seed",steps:"steps",cfg:"cfg",cfg_scale:"cfg",guidance:"cfg",denoise:"denoise",sampler_name:"sampler",scheduler:"scheduler"};
function scalar(value: unknown): value is ComfySlotValue { return typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value); }

/** Slots are an allow-list of exact API sites, never arbitrary renderer paths. */
export function detectSlots(value: ComfyApiPrompt, catalog: ComfyCatalog, hints: ComfySlotHints = {}): ComfySlot[] {
  const prompt = assertSubmittablePrompt(value); const slots = new Map<string,ComfySlot>();
  const add = (nodeId: string, input: string, kind: ComfySlotKind): void => {
    const node = prompt[nodeId], def = node && catalog[node.class_type], spec = def?.inputs[input]; if (!node || !def || !spec || spec.dynamic || spec.multiselect) return;
    if (!["STRING","INT","FLOAT","BOOLEAN","COMBO"].includes(spec.type)) return;
    const hint = hints[`${nodeId}:${input}`], current = node.inputs[input];
    if (current === undefined && spec.defaultValue === undefined && !spec.required) return;
    const role = modelRoleForInput(input,def.classType);
    const slot: ComfySlot = {id:`${hint?.kind ?? kind}:${nodeId}:${input}`,kind:hint?.kind ?? kind,nodeId,input,classType:node.class_type,label:hint?.label ?? `${typeof node._meta?.title === "string" ? node._meta.title : def.displayName} · ${input}`,
      valueType:spec.type === "COMBO" ? "combo" : spec.type === "STRING" ? "string" : spec.type === "BOOLEAN" ? "boolean" : spec.type === "INT" ? "int" : "float",
      defaultValue:scalar(current) ? current : current === undefined && scalar(spec.defaultValue) ? spec.defaultValue : resolveStaticScalar(prompt,current,catalog),
      ...(isLinkRef(current) ? {linkedFrom:{nodeId:current[0],classType:prompt[current[0]]?.class_type ?? "unknown"}} : {}),
      ...(spec.options ? {options:[...spec.options]} : {}),...(spec.remote ? {optionsRemote:true} : {}),
      ...(spec.min !== undefined ? {min:spec.min} : {}),...(spec.max !== undefined ? {max:spec.max} : {}),...(spec.step !== undefined ? {step:spec.step} : {}),
      ...(spec.multiline ? {multiline:true} : {}),...(role ? {role} : {}),...(hint?.controls ? {controls:[...hint.controls]} : {})};
    if (slot.kind === "seed") Object.assign(slot,seedBounds(spec));
    // A text encoder shared by positive and negative conditioning has one real
    // input; exposing it twice would make applying slots order-dependent.
    const site = `${nodeId}:${input}`, existing = slots.get(site);
    if (!existing || (existing.kind !== "positive" && slot.kind === "positive")) slots.set(site,slot);
  };
  const followText = (nodeId: string, input: string, kind: "positive"|"negative"): void => {
    const source = prompt[nodeId]?.inputs[input];
    if (isLinkRef(source) && /^PrimitiveString(?:Multiline)?$/.test(prompt[source[0]]?.class_type ?? "")) add(source[0],"value",kind);
    else add(nodeId,input,kind);
  };
  const traceConditioning = (start: unknown, kind: "positive"|"negative"): void => {
    const visited = new Set<string>(), queue: unknown[] = [start];
    while (queue.length) {
      const ref = queue.pop(); if (!isLinkRef(ref) || visited.has(ref[0])) continue; visited.add(ref[0]);
      const node = prompt[ref[0]], def = node && catalog[node.class_type]; if (!node || !def) continue;
      if (node.class_type === "ConditioningZeroOut") continue;
      if (/CLIPTextEncode/.test(node.class_type)) {
        for (const [input,spec] of Object.entries(def.inputs)) if (spec.type === "STRING" && /^(?:text|text_g|text_l|prompt)$/.test(input)) followText(ref[0],input,kind);
      } else { // No title-based guessing: only traverse declared conditioning edges.
        for (const [input,spec] of Object.entries(def.inputs)) if (spec.type === "CONDITIONING") queue.push(node.inputs[input]);
      }
    }
  };
  for (const [nodeId,node] of Object.entries(prompt)) {
    const def = catalog[node.class_type]; if (!def) continue;
    for (const [input,spec] of Object.entries(def.inputs)) {
      if (isModelLikeInput(input,spec,def)) add(nodeId,input,"model");
      else if (numeric[input] && ["INT","FLOAT","COMBO"].includes(spec.type)) add(nodeId,input,numeric[input]);
      else if (/Loader/.test(node.class_type) && ["weight_dtype","type","device","strength_model","strength_clip"].includes(input) && ["COMBO","FLOAT"].includes(spec.type)) add(nodeId,input,"model-option");
      if (hints[`${nodeId}:${input}`]?.kind) add(nodeId,input,hints[`${nodeId}:${input}`].kind!);
    }
    if (def.inputs.positive?.type === "CONDITIONING") traceConditioning(node.inputs.positive,"positive");
    if (def.inputs.negative?.type === "CONDITIONING") traceConditioning(node.inputs.negative,"negative");
    if (node.class_type === "ComfySwitchNode") {
      const ref = node.inputs.switch;
      if (isLinkRef(ref) && prompt[ref[0]]?.class_type === "PrimitiveBoolean") add(ref[0],"value","branch");
      else if (typeof ref === "boolean") add(nodeId,"switch","branch");
    }
  }
  const result = [...slots.values()];
  if (result.length > COMFY_LIMITS.slotCount) throw new ComfyValidationError("Too many editable slots", "too-large");
  return result;
}

export function applySlotValues(value: ComfyApiPrompt, slots: readonly ComfySlot[], values: Record<string,ComfySlotValue>, catalog: ComfyCatalog): ComfyApiPrompt {
  const prompt = structuredClone(assertSubmittablePrompt(value));
  if (!isPlainRecord(values) || Object.keys(values).length > COMFY_LIMITS.slotCount) throw new ComfyValidationError("Invalid slot value dictionary", "slot-value");
  const byId = new Map(slots.map((slot) => [slot.id,slot])); const issues: ComfyIssue[] = [];
  for (const [id,value] of Object.entries(values)) {
    const slot = byId.get(id), node = slot && prompt[slot.nodeId], spec = node && slot && catalog[node.class_type]?.inputs[slot.input];
    if (!slot || !node || !spec || slot.classType !== node.class_type || !["STRING","INT","FLOAT","BOOLEAN","COMBO"].includes(spec.type) || spec.dynamic || spec.multiselect) { issues.push({code:"stale-slot",severity:"block",message:`Slot is unknown or no longer maps to a supported API input: ${id}`}); continue; }
    if (!scalar(value) || typeof value === "string" && value.length > COMFY_LIMITS.slotTextChars) { issues.push({code:"slot-value",severity:"block",message:`Slot value is not a bounded scalar: ${id}`,nodeId:slot.nodeId,input:slot.input}); continue; }
    const problems = validateInputValue(value,spec).filter((problem) => problem.severity === "block");
    if (slot.kind === "seed") { const bounds = seedBounds(spec); if (typeof value !== "number" || value < bounds.min || value > bounds.max) problems.push({code:"value-range",severity:"block",message:"Seed is outside the exactly representable range"}); }
    for (const problem of problems) issues.push({...problem,nodeId:slot.nodeId,classType:node.class_type,input:slot.input});
    if (!problems.length) node.inputs[slot.input] = value;
  }
  if (issues.length) throw new ComfyValidationError(issues);
  return prompt;
}
