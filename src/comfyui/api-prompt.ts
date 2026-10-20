import { COMFY_LIMITS } from "./contract";
import type { ComfyIssue, ComfyMissingModel, ComfyThirdPartyNode } from "./contract";
import { assertUntrustedValue, ComfyValidationError, isPlainRecord } from "./format-detect";
import { isApiNodeDef, isCoreModule, isModelLikeInput, modelRoleForInput, normalizeObjectInfo } from "./object-info";
import type { ComfyCatalog, ComfyInputSpec } from "./object-info";
import { stableStringify } from "./canonical";
import { resolveStaticScalar } from "./static-values";

export interface ComfyApiNode { class_type: string; inputs: Record<string, unknown>; _meta?: Record<string, unknown> }
export type ComfyApiPrompt = Record<string, ComfyApiNode>;
export type ComfyLinkRef = [string, number];
export function isLinkRef(value: unknown): value is ComfyLinkRef {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && Number.isInteger(value[1]) && value[1] >= 0;
}
export function assertSubmittablePrompt(value: unknown, catalog?: ComfyCatalog): ComfyApiPrompt {
  assertUntrustedValue(value);
  if (!isPlainRecord(value) || !Object.keys(value).length || Object.keys(value).length > COMFY_LIMITS.workflowNodes) throw new ComfyValidationError("An API prompt must contain 1–5000 nodes", "too-large");
  if (new TextEncoder().encode(JSON.stringify(value)).length > COMFY_LIMITS.workflowJsonChars) throw new ComfyValidationError("API prompt exceeds the byte limit", "too-large");
  for (const [id,node] of Object.entries(value)) {
    if (!/^[A-Za-z0-9:_-]{1,64}$/.test(id) || !isPlainRecord(node) || typeof node.class_type !== "string" || !node.class_type || node.class_type.length > 512 || !isPlainRecord(node.inputs)
      || Object.keys(node).some((key) => !["class_type","inputs","_meta"].includes(key)) || (node._meta !== undefined && !isPlainRecord(node._meta))) throw new ComfyValidationError(`Invalid API node shape: ${id}`);
  }
  const prompt = value as ComfyApiPrompt;
  if (catalog) { const result = validateApiPrompt(prompt,catalog); const blocking = result.issues.filter((issue) => issue.severity === "block"); if (blocking.length) throw new ComfyValidationError(blocking); }
  return prompt;
}

export interface ComfyValueProblem { code: "value-type" | "value-range" | "invalid-option" | "remote-option-unverified" | "node-unverified"; severity: "block" | "warn"; message: string }
export function validateInputValue(value: unknown, spec: ComfyInputSpec): ComfyValueProblem[] {
  const block = (code: ComfyValueProblem["code"], message: string): ComfyValueProblem[] => [{ code,severity:"block",message }];
  if (spec.multiselect) {
    if (!Array.isArray(value) || !spec.options || !value.every((item) => spec.options!.includes(item))) return block("value-type",`Input ${spec.name} needs an enumerated multi-select list`);
    return [];
  }
  if (spec.dynamic) {
    const options = spec.rawOptions.options;
    return typeof value === "string" && Array.isArray(options) && options.some((option) => isPlainRecord(option) && option.key === value) ? [] : block("node-unverified",`Input ${spec.name} uses an unsupported dynamic-combo representation; export an API workflow with a supported selected branch`);
  }
  if (spec.type === "STRING") return typeof value === "string" && value.length <= COMFY_LIMITS.stringValueChars ? [] : block("value-type",`Input ${spec.name} must be a bounded string`);
  if (spec.type === "BOOLEAN") return typeof value === "boolean" ? [] : block("value-type",`Input ${spec.name} must be boolean`);
  if (spec.type === "INT" || spec.type === "FLOAT") {
    if (typeof value !== "number" || !Number.isFinite(value) || (spec.type === "INT" && !Number.isSafeInteger(value))) return block("value-type",`Input ${spec.name} must be a ${spec.type === "INT" ? "safe integer (uint64 values above JavaScript precision cannot be preserved)" : "finite number"}`);
    if ((spec.min !== undefined && value < spec.min) || (spec.max !== undefined && value > spec.max)) return block("value-range",`Input ${spec.name} is outside ${spec.min ?? "-∞"}…${spec.max ?? "∞"}`);
    // ComfyUI's step is widget granularity, not a server-side modulo constraint.
    return [];
  }
  if (spec.type === "COMBO") {
    if (typeof value !== "string" && typeof value !== "number") return block("value-type",`Input ${spec.name} must be a combo value`);
    if (spec.options) return spec.options.includes(value) ? [] : block("invalid-option",`Input ${spec.name} is not in the live local options: ${String(value).slice(0,256)}`);
    if (spec.remote) return [{code:"remote-option-unverified",severity:"warn",message:`Remote choices for ${spec.name} cannot be enumerated; ComfyUI will validate the selected value`}];
    return block("node-unverified",`Input ${spec.name} has no verifiable combo choices`);
  }
  if (["*","COMFY_MATCHTYPE_V3"].includes(spec.type) && (typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value))) return [];
  return block("value-type",`Input ${spec.name} (${spec.type}) must be a valid link, not a literal`);
}

export function compatibleTypes(output: string, input: string): boolean {
  if ([output,input].some((type) => type === "*" || type === "COMFY_MATCHTYPE_V3")) return true;
  return output.split(",").some((type) => input.split(",").includes(type));
}
export interface ComfyApiValidation {
  ok: boolean; prompt: ComfyApiPrompt; issues: ComfyIssue[]; missingNodeTypes: string[]; missingModels: ComfyMissingModel[];
  cloudNodes: Array<{nodeId:string;classType:string}>; thirdParty: ComfyThirdPartyNode[]; outputNodes: string[];
}
const directories: Record<string,string> = { diffusion:"diffusion_models",checkpoint:"checkpoints","text-encoder":"text_encoders",vae:"vae",lora:"loras",controlnet:"controlnet",upscale:"upscale_models",other:"models" };
export function validateApiPrompt(value: unknown, catalog: ComfyCatalog): ComfyApiValidation {
  const prompt = assertSubmittablePrompt(value), issues: ComfyIssue[] = [], missing = new Set<string>();
  const missingModels: ComfyMissingModel[] = [], cloudNodes: ComfyApiValidation["cloudNodes"] = [], outputNodes: string[] = [];
  const third = new Map<string,ComfyThirdPartyNode>();
  const add = (issue: ComfyIssue): void => { if (issues.length < 20000) issues.push(issue); };
  for (const [nodeId,node] of Object.entries(prompt)) {
    const def = catalog[node.class_type];
    if (!def) { missing.add(node.class_type); add({code:"missing-node-type",severity:"block",message:`Node type is not installed: ${node.class_type}`,nodeId,classType:node.class_type}); continue; }
    if (def.outputNode) outputNodes.push(nodeId);
    if (isApiNodeDef(def)) { cloudNodes.push({nodeId,classType:node.class_type}); add({code:"cloud-node",severity:"block",message:"Cloud/API nodes are not permitted in this local integration",nodeId,classType:node.class_type}); }
    else if (!isCoreModule(def.pythonModule)) {
      const key = `${def.classType}@${def.pythonModule ?? "unknown"}`;
      const item = third.get(key) ?? {classType:def.classType,pythonModule:def.pythonModule,nodeIds:[]}; item.nodeIds.push(nodeId); third.set(key,item);
      add({code:def.pythonModule ? "third-party-node" : "unknown-node-origin",severity:"confirm",message:"Executing this node requires explicit approval of its installed Python implementation",nodeId,classType:def.classType});
    }
    if (def.deprecated) add({code:"deprecated-node",severity:"warn",message:"The installed ComfyUI marks this node deprecated",nodeId,classType:def.classType});
    const specs = { ...def.inputs };
    // Current V3 dynamic combo API encoding uses the selected key plus dotted
    // selected-branch child inputs. Unknown alternative encodings fail closed.
    for (const [name,spec] of Object.entries(def.inputs)) if (spec.dynamic && typeof node.inputs[name] === "string" && Array.isArray(spec.rawOptions.options)) {
      const selected = spec.rawOptions.options.find((option) => isPlainRecord(option) && option.key === node.inputs[name]);
      if (isPlainRecord(selected) && isPlainRecord(selected.inputs)) {
        try { const children = normalizeObjectInfo({Dynamic:{input:selected.inputs}}).Dynamic.inputs; for (const [child,childSpec] of Object.entries(children)) specs[`${name}.${child}`] = {...childSpec,name:`${name}.${child}`}; }
        catch { add({code:"node-unverified",severity:"block",message:`Cannot normalize dynamic input branch ${name}`,nodeId,classType:def.classType,input:name}); }
      }
    }
    for (const spec of Object.values(specs)) if (spec.required && !spec.socketless && !(spec.name in node.inputs)) add({code:"missing-input",severity:"block",message:`Required input is absent: ${spec.name}`,nodeId,classType:def.classType,input:spec.name});
    for (const [input,inputValue] of Object.entries(node.inputs)) {
      const spec = specs[input];
      if (!spec) { add({code:"unknown-input",severity:"block",message:`Input is not declared by the installed node: ${input}`,nodeId,classType:def.classType,input}); continue; }
      if (isLinkRef(inputValue)) {
        const upstream = prompt[inputValue[0]], upDef = upstream && catalog[upstream.class_type];
        if (!upstream || !upDef || inputValue[1] >= upDef.outputs.length) { add({code:"invalid-link",severity:"block",message:`Link source/output is missing: ${inputValue[0]}:${inputValue[1]}`,nodeId,classType:def.classType,input}); continue; }
        if (!compatibleTypes(upDef.outputs[inputValue[1]],spec.type)) add({code:"link-type-mismatch",severity:"block",message:`Cannot connect ${upDef.outputs[inputValue[1]]} to ${spec.type}`,nodeId,classType:def.classType,input});
        const knownValue=resolveStaticScalar(prompt,inputValue,catalog);
        if(knownValue!==null)for(const problem of validateInputValue(knownValue,spec))add({...problem,nodeId,classType:def.classType,input});
        if (input === "text" && /CLIPTextEncode/.test(def.classType) && !/^PrimitiveString/.test(upstream.class_type)) add({code:"prompt-derived",severity:"warn",message:"Prompt text is computed upstream; editing its linked slot replaces that derivation only when explicitly requested",nodeId,classType:def.classType,input});
        continue;
      }
      for (const problem of validateInputValue(inputValue,spec)) {
        if (problem.code === "invalid-option" && isModelLikeInput(input,spec,def) && typeof inputValue === "string") {
          const role = modelRoleForInput(input,def.classType) ?? "other";
          missingModels.push({nodeId,classType:def.classType,input,value:inputValue,role,directoryHint:directories[role],templateHint:null});
          add({code:"missing-model",severity:"block",message:`Model file is not among this loader's local options: ${inputValue.slice(0,256)}`,nodeId,classType:def.classType,input});
        } else add({...problem,nodeId,classType:def.classType,input});
      }
      if (typeof inputValue === "string" && /\{[^{}]*\|[^{}]*\}/.test(inputValue) && spec.type === "STRING") add({code:"dynamic-prompt-syntax",severity:"warn",message:"Dynamic-prompt syntax is preserved literally; this integration does not emulate frontend expansion",nodeId,classType:def.classType,input});
    }
    if (def.classType === "ConditioningZeroOut") add({code:"negative-zeroed",severity:"info",message:"Conditioning is explicitly zeroed; this graph has no independently editable negative text on this branch",nodeId,classType:def.classType});
  }
  const state = new Map<string,number>();
  // A legal 5000-node chain must not exhaust the JavaScript call stack.
  for (const start of Object.keys(prompt)) {
    if(state.get(start)===2)continue;
    const stack:Array<[string,boolean]>=[[start,false]];
    while(stack.length){
      const [id,leaving]=stack.pop()!;
      if(leaving){state.set(id,2);continue;}
      if(state.get(id)===2)continue;
      if(state.get(id)===1){add({code:"cycle",severity:"block",message:`Cycle detected at node ${id}`,nodeId:id,classType:prompt[id]?.class_type});continue;}
      state.set(id,1);stack.push([id,true]);
      for(const input of Object.values(prompt[id]?.inputs??{}))if(isLinkRef(input)&&prompt[input[0]])stack.push([input[0],false]);
    }
  }
  if (!outputNodes.length) add({code:"no-output-node",severity:"block",message:"No installed output node is present"});
  const reachable = new Set<string>();
  const pending=[...outputNodes];
  while(pending.length){const id=pending.pop()!;if(reachable.has(id))continue;reachable.add(id);for(const input of Object.values(prompt[id]?.inputs??{}))if(isLinkRef(input)&&prompt[input[0]])pending.push(input[0]);}
  for (const [nodeId,node] of Object.entries(prompt)) if (!reachable.has(nodeId)) add({code:"unreachable-node",severity:"warn",message:"Node is not reachable from an output; it is retained, not silently removed",nodeId,classType:node.class_type});
  return {ok:!issues.some((issue) => issue.severity === "block"),prompt,issues,missingNodeTypes:[...missing].sort(),missingModels,cloudNodes,thirdParty:[...third.values()].sort((a,b)=>a.classType.localeCompare(b.classType)),outputNodes};
}
export function thirdPartyCanonical(list: readonly ComfyThirdPartyNode[]): string {
  return stableStringify([...new Set(list.map((item) => `${item.classType}@${item.pythonModule ?? "unknown"}`))].sort());
}
